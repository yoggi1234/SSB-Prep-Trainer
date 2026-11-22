/*
 * Online lookups for the Android build.
 *
 * The four things the phone can fetch without a desktop process, each gated by
 * the online switch in Settings:
 *
 *   - Datamuse for word meanings and related words   (CORS enabled)
 *   - Google News for the live points on a lecturette
 *   - Google News for the "in the news" list
 *
 * Everything is best-effort: when a call fails the screens keep the bundled
 * material and say so, exactly as they do on the desktop with no connection.
 * The digest has its own module because its caching and fallback chain are
 * different; museum art has one because it stores pictures in IndexedDB.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var net = window.SSB.net;
  var store = window.SSB.store;

  // Read the saved switch, not the merged defaults: online lookup starts off
  // until the person turns it on, which is what this has always answered.
  function onlineOn() {
    // config() applies the defaults; a fresh install has nothing saved yet.
    return store.config().onlineEnabled === true;
  }

  function livePack(rec, cached, detail) {
    var points = rec.points || [];
    var groups = { now: [], india: [], gain: [], world: [] };
    points.forEach(function (p) { (groups[p.group] || groups.now).push(p); });
    var out = {
      ok: true,
      id: rec.id,
      points: points,
      groups: groups,
      checkedAt: rec.checkedAt || 0,
      checkedOn: net.isoDay(rec.checkedAt),
      source: rec.source || 'Google News',
      cached: !!cached
    };
    if (cached) out.offline = true;
    if (detail) out.detail = detail;
    return out;
  }

  function newsPack(rec, extra) {
    return Object.assign(
      { ok: true, items: rec.items || [], checkedAt: rec.checkedAt || 0, checkedOn: net.isoDay(rec.checkedAt) },
      extra || {}
    );
  }

  // The same chat call as aiCall() in src/main.js.
  function aiCall(ai, prompt, imageB64) {
    var content = imageB64
      ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageB64 } }]
      : prompt;
    return net.getText(ai.base + '/chat/completions', 120000, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ai.key ? { Authorization: 'Bearer ' + ai.key } : {}),
      body: JSON.stringify(Object.assign({ model: ai.model, stream: false, temperature: 0.6, messages: [{ role: 'user', content: content }] }, ai.extra))
    }).then(function (txt) { return JSON.parse(txt).choices[0].message.content || ''; });
  }

  function aiError(err) {
    var m = String((err && err.message) || err);
    return { ok: false, error: /HTTP 40[13]/.test(m) ? 'bad-key' : /HTTP 429/.test(m) ? 'busy' : 'failed', detail: m };
  }

  var probe = null;

  SSB.online = {
    // The one place the online switch is read. The digest and the museum ask
    // this rather than re-reading ssb-config, so the gate cannot drift.
    enabled: onlineOn,

    api: {
      onlineStatus: function () {
        return Promise.resolve({ enabled: onlineOn() });
      },

      onlineProbe: function () {
        if (!onlineOn()) return Promise.resolve({ enabled: false, online: false, at: Date.now() });
        if (probe && Date.now() - probe.at < 30000) {
          return Promise.resolve({ enabled: true, online: probe.online, at: probe.at });
        }
        return net.getJson('https://api.datamuse.com/words?max=1', 4000).then(
          function () {
            probe = { at: Date.now(), online: true };
            return { enabled: true, online: true, at: Date.now() };
          },
          function () {
            probe = { at: Date.now(), online: false };
            return { enabled: true, online: false, at: Date.now() };
          }
        );
      },

      onlineMeaning: function (word) {
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        var w = String(word || '').trim();
        if (!w || !/^[a-zA-Z][a-zA-Z' -]{0,40}$/.test(w)) return Promise.resolve({ ok: false, error: 'bad-word' });
        return net
          .getJson('https://api.datamuse.com/words?sp=' + encodeURIComponent(w) + '&md=dp&max=1', 7000)
          .then(
            function (rows) {
              var row = Array.isArray(rows) ? rows[0] : null;
              if (!row || !Array.isArray(row.defs) || !row.defs.length) {
                return { ok: false, error: 'no-definition', word: w };
              }
              var senses = row.defs.map(function (d) {
                var tab = String(d).indexOf('\t');
                return tab > 0
                  ? { pos: String(d).slice(0, tab), def: String(d).slice(tab + 1).trim() }
                  : { pos: '', def: String(d).trim() };
              });
              return { ok: true, word: row.word || w, senses: senses, source: 'datamuse' };
            },
            function (err) { return { ok: false, error: 'network', detail: err.message }; }
          );
      },

      onlineWords: function (opts) {
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        var o = opts || {};
        var theme = String(o.theme || 'duty').toLowerCase().replace(/[^a-z ]/g, '').slice(0, 40) || 'duty';
        var count = Math.max(10, Math.min(120, o.count || 60));
        return net
          .getJson('https://api.datamuse.com/words?ml=' + encodeURIComponent(theme) + '&max=' + count, 7000)
          .then(
            function (rows) {
              var words = [];
              (Array.isArray(rows) ? rows : []).forEach(function (r) {
                var x = String(r.word || '').trim();
                if (x && /^[a-zA-Z][a-zA-Z' -]*$/.test(x) && words.indexOf(x) < 0) words.push(x);
              });
              return { ok: true, theme: theme, words: words.slice(0, count), source: 'datamuse' };
            },
            function (err) { return { ok: false, error: 'network', detail: err.message }; }
          );
      },

      // Background facts for the lecturette writer, as lectures:facts in src/main.js:
      // the closest Wikipedia article as plain text, with its last-edited date.
      lectureFacts: function (topic) {
        var q = String(topic || '').trim().slice(0, 120);
        if (!q) return Promise.resolve({ ok: false, error: 'no-query' });
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        var api = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&';
        var search = function (s, n) {
          return net.getJson(api + 'action=query&list=search&srprop=&srlimit=' + n + '&srsearch=' + encodeURIComponent(s), 9000).then(function (found) {
            return (found && found.query && found.query.search) || [];
          });
        };
        var stems = function (s) {
          return (String(s).toLowerCase().match(/[a-z]{4,}/g) || []).map(function (w) { return w.slice(0, 5); });
        };
        var want = stems(q);
        // Same choice as wikiArticle() in src/main.js: an India article that holds every main word wins.
        var india = /\bindia/i.test(q) ? Promise.resolve([]) : search(q + ' in India', 5);
        return india
          .then(function (hits) {
            var hit = hits.filter(function (h) {
              return /\bIndia/.test(h.title) && want.every(function (w) { return stems(h.title).indexOf(w) >= 0; });
            })[0];
            return hit || search(q, 1).then(function (r) { return r[0] || null; });
          })
          .then(function (hit) {
            if (!hit) throw new Error('not-found');
            return net.getJson(
              // No exchars: the API caps it at 1,200 characters, one paragraph.
              api + 'action=query&prop=extracts|info|revisions&explaintext=1&inprop=url&rvprop=timestamp&titles=' +
                encodeURIComponent(hit.title),
              9000
            );
          })
          .then(function (page) {
            var p = page && page.query && page.query.pages && page.query.pages[0];
            if (!p || !p.extract) throw new Error('not-found');
            var rev = (p.revisions || [])[0] || {};
            return { ok: true, title: p.title, url: p.fullurl || '', updated: rev.timestamp || '', text: p.extract.slice(0, 20000) };
          })
          .catch(function (err) {
            if (err.message === 'not-found') return { ok: false, error: 'not-found' };
            return { ok: false, error: /429|too many/i.test(err.message) ? 'busy' : 'network', detail: err.message };
          });
      },

      // As update:check in src/main.js; the phone offers the APK.
      updateCheck: function () {
        return fetch('data/version.json').then(function (r) { return r.json(); }).then(function (v) {
          if (!onlineOn()) return { ok: false, error: 'offline', current: v.version };
          return net.getJson('https://api.github.com/repos/yoggi1234/SSB-Prep-Trainer/releases/latest', 10000).then(function (rel) {
            var file = (rel.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];
            return { ok: true, current: v.version, latest: String(rel.tag_name || ''), url: file ? file.browser_download_url : rel.html_url };
          }, function (err) {
            return { ok: false, error: 'network', detail: err.message, current: v.version };
          });
        });
      },

      aiBuiltIn: function () {
        return fetch('data/ai-keys.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
      },

      aiChat: function (opts) {
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        return aiCall(opts.ai, String(opts.prompt || '')).then(
          function (text) { return { ok: true, text: text, model: opts.ai.model }; },
          aiError
        );
      },

      // Five fresh PPDT stories for one picture, as ppdt:generate in src/main.js,
      // through the provider and key chosen in Settings -> AI writing.
      ppdtGenerate: function (id, file, ai) {
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        if (!ai || !ai.key) return Promise.resolve({ ok: false, error: 'no-key' });
        var image = fetch(file).then(function (r) { return r.blob(); }).then(function (blob) {
          return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(String(fr.result).split(',')[1]); };
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        });
        var prompt = fetch('data/ppdt-prompt.txt').then(function (r) { return r.text(); });
        return Promise.all([prompt, image])
          .then(function (r) { return aiCall(ai, r[0], r[1]); })
          .then(function (txt) {
            var out = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
            if (!out || !Array.isArray(out.stories) || !out.stories.length) throw new Error('no stories in the answer');
            return { ok: true, perception: out.perception || null, stories: out.stories, model: ai.model };
          })
          .catch(aiError);
      },

      newsIndex: function (opts) {
        var force = !!(opts && opts.force);
        var cached = store.readJson('ssb-news', null);
        var fresh = cached && Date.now() - (cached.checkedAt || 0) <= 30 * 60 * 1000;
        if (cached && fresh && !force) return Promise.resolve(newsPack(cached, { cached: true }));
        if (!onlineOn()) {
          return Promise.resolve(cached ? newsPack(cached, { cached: true, offline: true }) : { ok: false, error: 'offline' });
        }
        return net
          .googleNews('India defence OR "Indian Army" OR "SSB interview" OR India news', 18)
          .then(function (rows) {
            if (!rows.length) throw new Error('empty');
            var rec = { items: rows, checkedAt: Date.now() };
            store.writeJson('ssb-news', rec);
            return newsPack(rec, { cached: false });
          })
          .catch(function (err) {
            if (cached) return newsPack(cached, { cached: true, offline: true });
            return { ok: false, error: err.message === 'empty' ? 'empty' : 'network' };
          });
      },

      lecturesHot: function () {
        if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
        return net.googleNews('"SSB interview" OR "Services Selection Board" OR Indian Armed Forces', 12).then(
          function (rows) {
            if (!rows.length) return { ok: false, error: 'empty' };
            return { ok: true, items: rows, checkedAt: Date.now(), source: 'Google News' };
          },
          function (err) { return { ok: false, error: 'network', detail: err.message }; }
        );
      },

      // Today's points for one lecturette, cached per topic so a lost connection
      // still shows the last set with the day it was read.
      lecturesLive: function (opts) {
        var o = opts || {};
        var id = String(o.id || 'topic');
        var q = String(o.query || '').trim();
        var cached = store.readJson('ssb-live-' + id, null);
        if (!onlineOn()) return Promise.resolve(cached ? livePack(cached, true) : { ok: false, error: 'offline' });
        if (!q) return Promise.resolve(cached ? livePack(cached, true) : { ok: false, error: 'no-query' });
        return net
          // Only the last month, as newsPoints() in src/main.js.
          .googleNews(q + ' when:30d', 12)
          .then(function (rows) {
            if (!rows.length) throw new Error('empty');
            var rec = { id: id, query: q, points: rows, checkedAt: Date.now(), source: 'Google News' };
            store.writeJson('ssb-live-' + id, rec);
            return livePack(rec, false);
          })
          .catch(function (err) {
            if (cached) return livePack(cached, true, err.message);
            return { ok: false, error: err.message === 'empty' ? 'empty' : 'network', detail: err.message };
          });
      },

      lecturesLiveStatus: function () {
        var out = {};
        try {
          for (var i = 0; i < window.localStorage.length; i++) {
            var key = window.localStorage.key(i);
            if (!key || key.indexOf('ssb-live-') !== 0) continue;
            var rec = store.readJson(key, null);
            if (rec && rec.id) out[rec.id] = { checkedAt: rec.checkedAt || 0, checkedOn: net.isoDay(rec.checkedAt) };
          }
        } catch (_) {}
        return Promise.resolve(out);
      }
    }
  };
})();
