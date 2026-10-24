/*
 * Bundled material for the Android build.
 *
 * Everything the phone ships in assets/public/data: the WAT/SRT/TAT sets, the
 * classic plate manifest, the lecturette catalogue, the WAT hint packs, the
 * connectors and the 19 MB dictionary. Pure data access plus the lookups over
 * it - no network, no localStorage, no markup.
 *
 * One fetch per file: json() memoises the promise, so a screen that asks for the
 * same catalogue twice (boot prefetch, then the list) reads it once.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var DATA = 'data/';
  var jsonCache = Object.create(null);

  function json(name) {
    if (!jsonCache[name]) {
      jsonCache[name] = fetch(DATA + name).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    return jsonCache[name];
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

  function dictSummary() {
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

  var cache = Object.create(null);
  var classic = null;

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

  SSB.material = {
    classicCount: function () {
      return (classic || []).length;
    },
    hintCount: function () {
      return Object.keys(cache.hints || {}).length;
    },

    api: {
      loadData: function () {
        return Promise.all([json('wat.json'), json('srt.json'), json('tat.json')]).then(function (r) {
          return { wat: r[0], srt: r[1], tat: r[2] };
        });
      },

      tatClassic: function () {
        return json('tat-classic.json').then(function (list) {
          classic = (Array.isArray(list) ? list : []).map(tatItem);
          var hidden = window.SSB.store.tatHidden();
          return classic.filter(function (r) { return !hidden[r.id]; });
        });
      },

      // The bundled catalogue is lecturettes.json: 334 topics, of which 52 carry a
      // full hand-written or drafted script and 282 are speaking outlines. The old
      // twelve-topic lectures.json is only a fallback, in the same order as
      // readLecturettes() in src/main.js, so the phone and the desktop show the same
      // material instead of the phone quietly offering twelve rows out of 334.
      lecturesList: function () {
        return json('lecturettes.json')
          .catch(function () { return null; })
          .then(function (list) {
            if (Array.isArray(list) && list.length) return list;
            return json('lectures.json').then(function (d) {
              return d && d.lectures ? d.lectures : Array.isArray(d) ? d : [];
            });
          });
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

      // The library screen asks for the counts before it ever asks for a word,
      // so this has to load the file itself; answering with zeros made the phone
      // look like an empty dictionary.
      dictInfo: function () {
        return loadDict().then(function () {
          sentimentLists();
          return dictSummary();
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
    }
  };
})();
