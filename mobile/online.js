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
    return store.readJson('ssb-config', {}).onlineEnabled === true;
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
          .googleNews(q, 12)
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
