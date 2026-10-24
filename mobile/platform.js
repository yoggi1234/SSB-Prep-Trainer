/*
 * Phone platform glue for the Android build.
 *
 * The parts of window.api with a device underneath: your own pictures (kept in
 * IndexedDB), the TAT bin (localStorage, same rules as src/main.js), the
 * clipboard in place of Electron's save dialog, the screen wake lock, the
 * hardware back button, and the diagnostics panel. There is no log file on the
 * phone, so the log calls answer empty instead of throwing.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var store = window.SSB.store;
  var material = window.SSB.material;

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

  // Electron opened a save dialog. An Android WebView has no download handler,
  // so an <a download> silently does nothing; the clipboard is the honest
  // equivalent on a phone and every screen already says "Saved to …".
  function exportText(payload) {
    var text = String((payload || {}).text || '');
    return copyText(text).then(function (ok) {
      return ok ? { saved: true, path: 'clipboard' } : { saved: false, error: 'clipboard' };
    });
  }

  // Android hardware back: the renderer decides (dashboard first), and only an
  // unhandled press leaves the app. Without this Capacitor closes the activity
  // from any screen, which felt like a crash.
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

  /* ------------------------------------------------------- your pictures */

  // The phone's own pictures are kept as Blobs in IndexedDB, so they are still
  // there after the app is closed, like the desktop's saved file paths. The page
  // sees them as object URLs, which change every launch; the bin therefore
  // records a picture by its stable key ("mine:<n>"), never by its URL.
  var mineUrl = null; // key -> object URL, filled on first use
  var mineKey = Object.create(null); // object URL -> key

  function mineDb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open('ssb-mine', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('pics')) {
          req.result.createObjectStore('pics', { autoIncrement: true });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function mineTx(mode, fn) {
    return mineDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pics', mode);
        var out = fn(tx.objectStore('pics'));
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function mineRemember(key, blob) {
    var url = URL.createObjectURL(blob);
    mineUrl['mine:' + key] = url;
    mineKey[url] = 'mine:' + key;
  }

  function mineLoad() {
    if (mineUrl) return Promise.resolve();
    mineUrl = Object.create(null);
    return mineTx('readonly', function (st) {
      var rows = [];
      st.openCursor().onsuccess = function (ev) {
        var c = ev.target.result;
        if (!c) return;
        rows.push([c.key, c.value]);
        c.continue();
      };
      return rows;
    })
      .then(function (rows) {
        rows.forEach(function (r) { mineRemember(r[0], r[1]); });
      })
      .catch(function () {});
  }

  function mineList() {
    return mineLoad().then(function () {
      var hidden = store.tatHidden();
      return Object.keys(mineUrl)
        .filter(function (k) { return !hidden[k]; })
        .map(function (k) { return mineUrl[k]; });
    });
  }

  function mineAdd(files) {
    return mineLoad()
      .then(function () {
        return mineTx('readwrite', function (st) {
          var added = [];
          files.forEach(function (f) {
            st.add(f).onsuccess = function (ev) { added.push([ev.target.result, f]); };
          });
          return added;
        });
      })
      .then(function (added) {
        added.forEach(function (r) { mineRemember(r[0], r[1]); });
      })
      .catch(function () {});
  }

  /* ---------------------------------------------------------------- bin */

  // Same records and rules as the desktop bin in src/main.js: removed pictures
  // can be restored, a permanent delete keeps only the id so a bundled plate
  // cannot walk back in, and a single delete can still be undone.
  function binList() {
    var b = store.readJson('ssb-tat-bin', []);
    return Array.isArray(b) ? b : [];
  }
  function goneList() {
    var g = store.readJson('ssb-tat-gone', []);
    return Array.isArray(g) ? g : [];
  }
  function rememberGone(rec) {
    var gone = goneList();
    if (!gone.some(function (g) { return g.id === rec.id; })) {
      gone.push({ id: rec.id, file: rec.file || '', title: rec.title || '', at: new Date().toISOString() });
      store.writeJson('ssb-tat-gone', gone);
    }
  }

  // Bin records hold stable keys; the Bin screen needs something it can show.
  function binForScreen() {
    var bin = binList();
    var museum = window.SSB.museum && window.SSB.museum.all;
    return mineLoad()
      .then(function () {
        return bin.some(function (b) { return b.kind === 'library'; }) && museum ? museum().catch(function () { return []; }) : [];
      })
      .then(function (rows) {
        var art = Object.create(null);
        rows.forEach(function (r) { art[r.id] = r.dataUrl; });
        return bin.map(function (b) {
          var shown = mineUrl[b.file] || art[b.id] || b.file;
          return Object.assign({}, b, { file: shown, saved: '' });
        });
      });
  }

  function binTake(id) {
    var bin = binList();
    var at = -1;
    bin.forEach(function (b, i) { if (b.id === String(id || '')) at = i; });
    if (at < 0) return null;
    var rec = bin.splice(at, 1)[0];
    store.writeJson('ssb-tat-bin', bin);
    return rec;
  }

  SSB.platform = {
    api: {
      // The page reaches the phone's own pictures through an <input type=file>;
      // the chosen files are kept on the phone (see mineAdd) and survive a restart.
      listTatImages: function () {
        return mineList();
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
            if (input.parentNode) document.body.removeChild(input);
            mineAdd(files).then(mineList).then(resolve);
          });
          input.click();
        });
      },
      clearTatImages: function () {
        return mineTx('readwrite', function (st) { st.clear(); })
          .catch(function () {})
          .then(function () {
            Object.keys(mineKey).forEach(function (u) { URL.revokeObjectURL(u); });
            mineUrl = Object.create(null);
            mineKey = Object.create(null);
            return [];
          });
      },

      // The bin is an array everywhere else (main.js returns one): the Bin screen
      // and the Add screen both read its length and call .map() on it.
      tatBin: function () {
        return binForScreen();
      },
      tatRemove: function (payload) {
        var p = payload || {};
        var id = String(p.id || '');
        if (!id) return Promise.resolve({ ok: false, error: 'no-id' });
        return mineLoad().then(function () {
          // A picture of yours is recorded by its key, not by this launch's URL.
          var key = mineKey[id] || mineKey[String(p.file || '')];
          if (key) id = key;
          var bin = binList();
          if (bin.some(function (b) { return b.id === id; })) return binForScreen().then(function (b) { return { ok: true, bin: b, added: false }; });
          var file = key || String(p.file || '');
          bin.push({
            id: id,
            kind: String(p.kind || 'library'),
            title: String(p.title || 'TAT picture').slice(0, 200),
            // A museum picture's file is a data URL; the id is enough to find it again.
            file: /^data:/i.test(file) ? '' : file,
            saved: '',
            source: String(p.source || '').slice(0, 120),
            removedAt: new Date().toISOString()
          });
          store.writeJson('ssb-tat-bin', bin);
          return binForScreen().then(function (b) { return { ok: true, bin: b, added: true }; });
        });
      },
      tatRestore: function (id) {
        var rec = binTake(id);
        return binForScreen().then(function (b) {
          return rec ? { ok: true, bin: b } : { ok: false, error: 'not-in-bin', bin: b };
        });
      },
      tatPurge: function (id) {
        var rec = binTake(id);
        if (rec) rememberGone(rec);
        return binForScreen().then(function (b) {
          return rec ? { ok: true, bin: b } : { ok: false, error: 'not-in-bin', bin: b };
        });
      },
      tatEmptyBin: function () {
        binList().forEach(rememberGone);
        store.writeJson('ssb-tat-bin', []);
        return Promise.resolve({ ok: true, bin: [] });
      },
      tatGoneCount: function () {
        return Promise.resolve(goneList().length);
      },
      tatGoneList: function () {
        return Promise.resolve(goneList());
      },
      tatResurrect: function (id) {
        var key = String(id || '');
        var gone = goneList().filter(function (g) { return g.id !== key; });
        store.writeJson('ssb-tat-gone', gone);
        return Promise.resolve(gone);
      },
      tatResetGone: function () {
        store.writeJson('ssb-tat-gone', []);
        return Promise.resolve([]);
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
            classicPictures: material ? material.classicCount() : 0,
            museumPictures: 0,
            watHints: material ? material.hintCount() : 0,
            attempts: store.attempts().length
          },
          paths: {},
          flow: [],
          log: 'The Android build keeps no log file.'
        });
      },
      diagSave: function () {
        return SSB.platform.api.diagInfo().then(function (info) {
          return exportText({ text: JSON.stringify(info, null, 2) });
        });
      },

      exportText: exportText,

      attemptsExport: function (format) {
        var fmt = format === 'json' ? 'json' : 'csv';
        var rows = store.attempts().map(function (a) {
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
        return exportText({ defaultName: 'SSB-attempts.' + fmt, text: text }).then(function (res) {
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
      }
    }
  };

  wireBackButton();
})();
