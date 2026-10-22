/*
 * window.api for the Android build.
 *
 * The desktop app talks to Electron through src/preload.js + IPC. On Android
 * there is no main process, so this file implements the same surface in the
 * page: bundled JSON for the practice data, localStorage for settings and
 * history, and the browser's own download/xhr where Electron used dialogs.
 *
 * Anything that genuinely needs the desktop (the Python digest engine, the
 * museum picture library, the on-disk log, online lookups) answers with a
 * safe "not available" result instead of throwing, so the screens keep
 * rendering and say so.
 */
(function () {
  'use strict';

  var DATA = 'data/';
  var DEFAULTS = {
    watPerWordSec: 15,
    srtTotalMin: 30,
    tatViewSec: 30,
    tatWriteSec: 240,
    shuffleWAT: false,
    shuffleSRT: true,
    tatSource: 'classic',
    theme: 'mist',
    reduceMotion: false,
    hideTatPromptWhileWriting: true,
    onlineEnabled: true,
    watSentences: {}
  };

  var cache = Object.create(null);
  var jsonCache = Object.create(null);

  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function json(name) {
    if (!jsonCache[name]) {
      jsonCache[name] = fetch(DATA + name).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return jsonCache[name];
  }

  function config() {
    var saved = readStore('ssb-config', {});
    return Object.assign({}, DEFAULTS, saved || {});
  }

  function attempts() {
    var list = readStore('ssb-attempts', []);
    return Array.isArray(list) ? list : [];
  }

  /* ------------------------------------------------------------ dictionary */

  var dict = null;
  var dictKeys = null;
  var dictPos = null;
  var dictNeg = null;
  var dictMs = 0;
  var dictMeta = { words: 0, withDefinitions: 0, positive: 0, negative: 0 };

  function loadDict() {
    if (dict) return Promise.resolve(true);
    var t0 = Date.now();
    return json('dictionary.json').then(function (obj) {
      dict = new Map(Object.entries(obj));
      dictKeys = Array.from(dict.keys()).sort();
      dictMs = Date.now() - t0;
      return true;
    });
  }

  function briefEntry(w) {
    var e = (dict && dict.get(w)) || { d: [], s: 0 };
    var first = (e.d && e.d[0]) || null;
    return {
      word: w,
      sentiment: e.s || 0,
      senseCount: (e.d || []).length,
      pos: first ? first[0] : '',
      preview: first ? first[1] : ''
    };
  }

  function entryFor(w) {
    var e = dict && dict.get(w);
    if (!e) return null;
    return {
      word: w,
      sentiment: e.s || 0,
      senses: (e.d || []).map(function (p) {
        return { pos: p[0], def: p[1] };
      })
    };
  }

  function lowerBound(arr, x) {
    var lo = 0;
    var hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function sentimentLists() {
    if (dictPos && dictNeg) return;
    dictPos = [];
    dictNeg = [];
    for (var i = 0; i < dictKeys.length; i++) {
      var e = dict.get(dictKeys[i]);
      var s = (e && e.s) || 0;
      if (s > 0) dictPos.push(dictKeys[i]);
      else if (s < 0) dictNeg.push(dictKeys[i]);
    }
  }

  function dictInfo() {
    if (dict) {
      dictMeta.words = dict.size;
      dictMeta.withDefinitions = dictKeys.filter(function (w) {
        var e = dict.get(w);
        return e && e.d && e.d.length;
      }).length;
    }
    return {
      words: dictMeta.words || 0,
      withDefinitions: dictMeta.withDefinitions || 0,
      positive: dictPos ? dictPos.length : 0,
      negative: dictNeg ? dictNeg.length : 0,
      source: 'WordNet 3.1 + AFINN-165 (bundled)',
      loadMs: dictMs
    };
  }

  /* ---------------------------------------------------------------- images */

  // `file` is the path the page itself can fetch. The desktop build hands the
  // renderer absolute Windows paths, so the TAT pool and the slide builder both
  // read `file`; without it every plate is skipped and TAT silently falls back
  // to the text scenes.
  function tatItem(rec) {
    var rel = DATA + 'tat-classic/' + rec.file;
    return {
      id: rec.id,
      file: rel,
      title: rec.title || rec.id,
      src: rel,
      source: rec.source || '',
      width: rec.width || 0,
      height: rec.height || 0
    };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  // Old WebViews have no async clipboard; a hidden textarea still copies.
  function legacyCopy(text) {
    try {
      var el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch (_) {
      return false;
    }
  }

  /* ------------------------------------------------------------------- api */

  window.api = {
    // The renderer uses this for the one thing that genuinely differs on a
    // phone: pictures picked from the gallery last only for the session.
    android: true,

    loadData: function () {
      return Promise.all([json('wat.json'), json('srt.json'), json('tat.json')]).then(function (r) {
        return { wat: r[0], srt: r[1], tat: r[2] };
      });
    },

    getConfig: function () {
      return Promise.resolve(config());
    },

    setConfig: function (patch) {
      var next = Object.assign(config(), patch || {});
      writeStore('ssb-config', next);
      return Promise.resolve(next);
    },

    listAttempts: function () {
      return Promise.resolve(attempts());
    },

    addAttempt: function (attempt) {
      var list = attempts();
      var record = Object.assign(
        { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7), savedAt: new Date().toISOString() },
        attempt || {}
      );
      list.unshift(record);
      if (list.length > 300) list.length = 300;
      writeStore('ssb-attempts', list);
      return Promise.resolve(record);
    },

    deleteAttempt: function (id) {
      var list = attempts().filter(function (a) {
        return a.id !== id;
      });
      writeStore('ssb-attempts', list);
      return Promise.resolve(list);
    },

    clearAttempts: function () {
      writeStore('ssb-attempts', []);
      return Promise.resolve([]);
    },

    // The page can still reach the phone's own pictures: an <input type=file>
    // gives the chosen files and object URLs keep them without copying
    // megabytes into localStorage. The links last until the app is closed,
    // which the Add screen says out loud.
    listTatImages: function () {
      return Promise.resolve(window.__pickedTat || []);
    },
    pickTatImages: function () {
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', function () {
          var files = Array.prototype.slice.call(input.files || []);
          var merged = (window.__pickedTat || []).slice();
          files.forEach(function (f) {
            try {
              var url = URL.createObjectURL(f);
              if (merged.indexOf(url) < 0) merged.push(url);
            } catch (_) {}
          });
          window.__pickedTat = merged;
          if (input.parentNode) document.body.removeChild(input);
          resolve(merged);
        });
        input.click();
      });
    },
    clearTatImages: function () {
      window.__pickedTat = [];
      return Promise.resolve([]);
    },

    // The bin is an array everywhere else (main.js returns one), so the shim
    // must not answer with an object: the Bin screen and the Add screen both
    // read its length and call .map() on it.
    tatBin: function () {
      return Promise.resolve([]);
    },
    tatRemove: function () {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    },
    tatRestore: function () {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    },
    tatPurge: function () {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    },
    tatEmptyBin: function () {
      return Promise.resolve({ ok: true });
    },
    tatGoneCount: function () {
      return Promise.resolve(0);
    },
    tatGoneList: function () {
      return Promise.resolve([]);
    },
    tatResurrect: function () {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    },
    tatResetGone: function () {
      return Promise.resolve({ ok: true });
    },

    // No museum library on the phone build: the 43 bundled plates are the pool.
    tatLibrary: function () {
      return Promise.resolve([]);
    },
    tatClassic: function () {
      return json('tat-classic.json').then(function (list) {
        var items = (Array.isArray(list) ? list : []).map(tatItem);
        window.__tatClassic = items;
        return items;
      });
    },
    tatOnline: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },

    lecturesList: function () {
      return json('lectures.json').then(function (d) {
        return d && d.lectures ? d.lectures : Array.isArray(d) ? d : [];
      });
    },
    lecturesHot: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },
    lecturesLive: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },
    lecturesLiveStatus: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },
    newsIndex: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },

    onlineStatus: function () {
      return Promise.resolve({ enabled: false });
    },
    onlineProbe: function () {
      return Promise.resolve({ enabled: false, online: false, at: Date.now() });
    },
    onlineMeaning: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },
    onlineWords: function () {
      return Promise.resolve({ ok: false, error: 'offline' });
    },

    watHints: function () {
      if (cache.hints) return Promise.resolve(cache.hints);
      return fetch(DATA + 'wat-hints/index.json')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (files) {
          return Promise.all(
            files.map(function (f) {
              return json('wat-hints/' + f);
            })
          );
        })
        .then(function (parts) {
          var out = {};
          parts.forEach(function (p) {
            Object.assign(out, p || {});
          });
          cache.hints = out;
          return out;
        });
    },

    connectors: function () {
      return json('connectors.json').then(function (d) {
        return loadDict().then(function () {
          return {
            source: d.source || '',
            note: d.note || '',
            groups: (d.groups || []).map(function (g) {
              return {
                key: g.key,
                label: g.label,
                hint: g.hint,
                items: (g.words || []).map(function (w) {
                  return briefEntry(String(w).toLowerCase().trim());
                })
              };
            })
          };
        });
      });
    },

    logTail: function () {
      return Promise.resolve('');
    },
    logAppend: function () {
      return Promise.resolve({ ok: true });
    },
    logOpenFolder: function () {
      return Promise.resolve({ ok: false });
    },

    diagInfo: function () {
      return Promise.resolve({
        version: 'android',
        packaged: true,
        platform: 'android',
        electron: '-',
        chrome: navigator.userAgent,
        node: '-',
        userData: 'on-device storage',
        storePath: 'localStorage',
        logPath: '-',
        data: {
          classicPictures: (window.__tatClassic || []).length,
          museumPictures: 0,
          watHints: Object.keys(cache.hints || {}).length,
          attempts: attempts().length
        },
        paths: {},
        flow: [],
        log: 'The Android build keeps no log file.'
      });
    },
    diagSave: function () {
      return Promise.resolve({ saved: false, error: 'unsupported' });
    },

    // The Python engine is a desktop compartment only.
    digestStatus: function () {
      return Promise.resolve({ ok: false, error: 'unsupported', unsupported: true, python: null });
    },
    digestRun: function () {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    },
    digestCancel: function () {
      return Promise.resolve({ ok: false });
    },
    digestFiles: function () {
      return Promise.resolve([]);
    },
    digestOpen: function () {
      return Promise.resolve({ ok: false });
    },
    digestPickPdfs: function () {
      return Promise.resolve([]);
    },
    digestConfigGet: function () {
      return Promise.resolve({});
    },
    digestConfigSet: function () {
      return Promise.resolve({ ok: true });
    },
    onDigestLog: function () {
      return function () {};
    },
    onDigestDone: function () {
      return function () {};
    },
    onDigestStarted: function () {
      return function () {};
    },

    // Electron opened a save dialog. An Android WebView has no download
    // handler, so an <a download> silently does nothing; the clipboard is the
    // honest equivalent on a phone and every screen already says "Saved to …".
    exportText: function (payload) {
      var text = String((payload || {}).text || '');
      return copyText(text).then(function (ok) {
        return ok ? { saved: true, path: 'clipboard' } : { saved: false, error: 'clipboard' };
      });
    },

    attemptsExport: function (format) {
      var fmt = format === 'json' ? 'json' : 'csv';
      var rows = attempts().map(function (a) {
        return {
          test: String(a.test || '').toUpperCase(),
          set: a.setName || '',
          startedAt: a.startedAt || '',
          endedAt: a.endedAt || '',
          durationMs: a.durationMs || 0,
          endedBecause: a.reason || '',
          answered: a.answered || 0,
          total: a.total || 0
        };
      });
      var text =
        fmt === 'json'
          ? JSON.stringify(rows, null, 2)
          : ['Test,Set,Started,Ended,Ended because,Answered,Total']
              .concat(
                rows.map(function (r) {
                  return [r.test, r.set, r.startedAt, r.endedAt, r.endedBecause, r.answered, r.total]
                    .map(function (v) {
                      var s = String(v == null ? '' : v);
                      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                    })
                    .join(',');
                })
              )
              .join('\r\n');
      return this.exportText({ defaultName: 'SSB-attempts.' + fmt, text: text }).then(function (res) {
        return { saved: !!res.saved, count: rows.length, format: fmt, path: res.path };
      });
    },

    keepAwake: function (on) {
      try {
        if (on && navigator.wakeLock && !window.__wakeLock) {
          navigator.wakeLock.request('screen').then(function (lock) {
            window.__wakeLock = lock;
          });
        } else if (!on && window.__wakeLock) {
          window.__wakeLock.release();
          window.__wakeLock = null;
        }
      } catch (_) {}
      return Promise.resolve(true);
    },

    openExternal: function (url) {
      if (/^https?:/i.test(String(url))) window.open(String(url), '_blank', 'noopener');
      return Promise.resolve(true);
    },

    // The library screen asks for the counts before it ever asks for a word,
    // so this has to load the file itself; answering with zeros made the phone
    // look like an empty dictionary.
    dictInfo: function () {
      return loadDict().then(function () {
        sentimentLists();
        return dictInfo();
      });
    },

    dictGet: function (word) {
      return loadDict().then(function () {
        var w = String(word || '').toLowerCase().trim();
        var entry = entryFor(w);
        return entry ? { ok: true, entry: entry } : { ok: false, word: w, error: 'not-found' };
      });
    },

    dictSearch: function (opts) {
      return loadDict().then(function () {
        var q = String((opts && opts.query) || '').toLowerCase().trim();
        var limit = Math.max(1, Math.min(200, (opts && opts.limit) || 60));
        var offset = Math.max(0, (opts && opts.offset) || 0);
        var need = offset + limit + 1;
        var hits = [];
        var seen = Object.create(null);
        if (!q) {
          for (var i = 0; i < dictKeys.length && hits.length < need; i++) hits.push(dictKeys[i]);
        } else {
          var at = lowerBound(dictKeys, q);
          while (at < dictKeys.length && hits.length < need) {
            var w = dictKeys[at];
            if (w.indexOf(q) !== 0) break;
            if (!seen[w]) {
              seen[w] = 1;
              hits.push(w);
            }
            at++;
          }
          if (hits.length < need) {
            for (var j = 0; j < dictKeys.length && hits.length < need; j++) {
              var x = dictKeys[j];
              if (!seen[x] && x.indexOf(q) >= 0) {
                seen[x] = 1;
                hits.push(x);
              }
            }
          }
        }
        return {
          query: q,
          offset: offset,
          hasMore: hits.length > offset + limit,
          items: hits.slice(offset, offset + limit).map(briefEntry)
        };
      });
    },

    dictSentiment: function (opts) {
      return loadDict().then(function () {
        sentimentLists();
        var type = (opts && opts.type) === 'negative' ? 'negative' : 'positive';
        var list = type === 'negative' ? dictNeg : dictPos;
        var offset = Math.max(0, Math.min(list.length, (opts && opts.offset) || 0));
        var limit = Math.max(1, Math.min(200, (opts && opts.limit) || 60));
        return {
          type: type,
          total: list.length,
          offset: offset,
          items: list.slice(offset, offset + limit).map(briefEntry)
        };
      });
    },

    dictRandom: function (opts) {
      return loadDict().then(function () {
        sentimentLists();
        var count = Math.max(1, Math.min(200, (opts && opts.count) || 10));
        var filter = String((opts && opts.filter) || 'all');
        var pool = dictKeys;
        if (filter === 'positive') pool = dictPos;
        else if (filter === 'negative') pool = dictNeg;
        var out = [];
        for (var i = 0; i < count && pool.length; i++) {
          out.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        return { total: out.length, items: out.map(briefEntry) };
      });
    }
  };

  // Android hardware back: the renderer decides (dashboard first), and only
  // an unhandled press leaves the app. Without this Capacitor closes the
  // activity from any screen, which felt like a crash.
  function wireBackButton() {
    var Cap = window.Capacitor;
    var CapApp = Cap && Cap.Plugins && Cap.Plugins.App;
    if (!CapApp || !CapApp.addListener) return;
    CapApp.addListener('backButton', function () {
      var handled = false;
      try { handled = !!(window.__ssbBack && window.__ssbBack()); } catch (_) {}
      if (handled) return;
      try {
        if (CapApp.minimizeApp) CapApp.minimizeApp();
        else if (CapApp.exitApp) CapApp.exitApp();
      } catch (_) {}
    });
  }
  wireBackButton();
})();
