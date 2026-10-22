/*
 * Online extras for the Android build.
 *
 * The desktop app keeps every network call in the main process. On a phone the
 * page is the only process, so this file installs the same window.api functions
 * over the top of mobile/api.js:
 *
 *   - Datamuse for word meanings and related words      (CORS enabled)
 *   - Art Institute of Chicago for public-domain TAT art (CORS enabled)
 *   - Google News RSS through rss2json for headlines    (RSS has no CORS)
 *
 * Everything is best-effort: when a call fails the screens keep the bundled
 * material and say so, exactly as they do on the desktop with no connection.
 * The online switch in Settings gates every call.
 */
(function () {
  'use strict';

  function conf() {
    try {
      return JSON.parse(window.localStorage.getItem('ssb-config') || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function onlineOn() {
    return conf().onlineEnabled === true;
  }

  function isoDay(at) {
    return at ? new Date(at).toISOString().slice(0, 10) : '';
  }

  function readJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function getJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    var done = function () { if (timer) clearTimeout(timer); };
    return fetch(url, {
      signal: ctrl ? ctrl.signal : undefined,
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (body) { done(); return body; }, function (err) { done(); throw err; });
  }

  // Google News RSS is readable directly once CapacitorHttp is on: the native
  // HTTP layer is not subject to browser CORS, exactly like the desktop main
  // process. The rss2json bridge stays as a fallback for builds without it.
  function decodeEntities(text) {
    return String(text)
      .replace('<![CDATA[', '')
      .replace(']]>', '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  function tagText(body, name) {
    var open = '<' + name + '>';
    var close = '</' + name + '>';
    var a = body.indexOf(open);
    if (a < 0) return '';
    var b = body.indexOf(close, a + open.length);
    return b > a ? body.slice(a + open.length, b) : '';
  }

  function parseRss(xml, query, count) {
    var want = count || 12;
    var out = [];
    var parts = String(xml).split('<item>');
    for (var i = 1; i < parts.length && out.length < want; i++) {
      var body = parts[i].split('</item>')[0];
      var title = decodeEntities(tagText(body, 'title'));
      if (!title) continue;
      out.push({
        text: title,
        title: title,
        link: decodeEntities(tagText(body, 'link')),
        date: tagText(body, 'pubDate').trim(),
        query: query
      });
    }
    return out;
  }

  function googleNews(query, count) {
    var want = count || 12;
    var rss =
      'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-IN&gl=IN&ceid=IN:en';
    return fetch(rss, { headers: { Accept: 'application/rss+xml, application/xml' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (xml) {
        var rows = parseRss(xml, query, want);
        if (!rows.length) throw new Error('empty');
        return rows;
      })
      .catch(function () {
        var url =
          'https://api.rss2json.com/v1/api.json?count=' + want + '&rss_url=' + encodeURIComponent(rss);
        return getJson(url, 12000).then(function (body) {
          var items = (body && body.items) || [];
          return items
            .map(function (it) {
              var title = decodeEntities(it.title || '');
              return { text: title, title: title, link: it.link || '', date: it.pubDate || '', query: query };
            })
            .filter(function (x) { return x.text; });
        });
      });
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
      checkedOn: isoDay(rec.checkedAt),
      source: rec.source || 'Google News',
      cached: !!cached
    };
    if (cached) out.offline = true;
    if (detail) out.detail = detail;
    return out;
  }

  // One page per section, in the same order as the desktop digest.
  var DIGEST_SECTIONS = [
    { key: 'national', label: 'National', query: 'India government Parliament policy' },
    { key: 'international', label: 'International', query: 'world news United Nations summit' },
    { key: 'regional', label: 'Regional (States)', query: 'India state government news' },
    { key: 'defence', label: 'Defence', query: 'Indian Armed Forces defence ministry' },
    { key: 'politics', label: 'Politics', query: 'India politics election' },
    { key: 'financial', label: 'Financial', query: 'Sensex rupee RBI markets' },
    { key: 'economic', label: 'Economic', query: 'India economy growth exports' },
    { key: 'neighbour', label: 'Neighbouring Countries', query: 'Pakistan China Nepal Bangladesh Sri Lanka' },
    { key: 'science', label: 'Science', query: 'science research ISRO space' },
    { key: 'geopolitical', label: 'Geopolitical', query: 'geopolitics Indo-Pacific strategy' },
    { key: 'misc', label: 'Miscellaneous', query: 'India appointments awards exercise' },
    { key: 'war', label: 'War Section', query: 'war conflict military operation' }
  ];

  function digestPhonePack(rec, cached, detail) {
    var out = {
      ok: true,
      sections: (rec.sections || []).map(function (s) {
        return {
          key: s.key,
          label: s.label,
          items: (s.items || []).map(function (it) { return { title: it.title || it.text || '', link: it.link || '' }; })
        };
      }),
      at: rec.at || 0,
      checkedOn: isoDay(rec.at),
      source: 'Google News (on the phone)',
      cached: !!cached
    };
    if (detail === 'offline') out.offline = true;
    else if (detail) out.detail = detail;
    return out;
  }

  function newsPack(rec, extra) {
    return Object.assign(
      { ok: true, items: rec.items || [], checkedAt: rec.checkedAt || 0, checkedOn: isoDay(rec.checkedAt) },
      extra || {}
    );
  }

  /* ------------------------------------------------------------ museum art */

  // A data URL is far too big for localStorage, so fetched pictures live in
  // IndexedDB and survive a restart the way the desktop cache does.
  function museumDb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open('ssb-museum', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('pictures')) {
          req.result.createObjectStore('pictures', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function museumAll() {
    return museumDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('pictures', 'readonly').objectStore('pictures').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function museumPut(rows) {
    return museumDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pictures', 'readwrite');
        rows.forEach(function (r) { tx.objectStore('pictures').put(r); });
        tx.oncomplete = function () { resolve(rows.length); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  // Public-domain art comes from Wikimedia Commons: it sends CORS headers and
  // is not behind a bot challenge, unlike the museum APIs tried first. Every
  // result carries its licence, and only public-domain / CC0 files are kept.
  function commonsSearch(term) {
    var url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
      '&generator=search&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + term) +
      '&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640';
    return getJson(url, 12000).then(function (body) {
      var pages = (body && body.query && body.query.pages) || {};
      return Object.keys(pages).map(function (k) { return pages[k]; });
    });
  }

  function licenseOk(meta) {
    var v = String((meta && meta.LicenseShortName && meta.LicenseShortName.value) || '').toLowerCase();
    return v.indexOf('public domain') >= 0 || v.indexOf('cc0') >= 0;
  }

  function cleanTitle(title) {
    return String(title || '')
      .replace(/^File:/i, '')
      .replace(/.[a-z0-9]+$/i, '')
      .replace(/_/g, ' ')
      .trim();
  }

  function cleanArtist(meta) {
    var v = String((meta && meta.Artist && meta.Artist.value) || '');
    return v.replace(/<[^>]*>/g, '').replace(/s+/g, ' ').trim().slice(0, 120);
  }

  function fetchMuseum(want) {
    var terms = ['painting village life', 'painting harvest', 'painting market scene', 'painting peasants', 'painting street scene', 'painting family'];
    var added = [];
    var existing = {};
    return museumAll()
      .then(function (rows) {
        rows.forEach(function (r) { existing[r.id] = 1; });
        var chain = Promise.resolve();
        terms.forEach(function (term) {
          chain = chain.then(function () {
            if (added.length >= want) return null;
            return commonsSearch(term).then(function (pages) {
              var step = Promise.resolve();
              pages.forEach(function (page) {
                step = step.then(function () {
                  if (added.length >= want) return null;
                  var info = (page.imageinfo || [])[0];
                  if (!info || !info.thumburl || !licenseOk(info.extmetadata)) return null;
                  var id = 'commons-' + page.pageid;
                  if (existing[id]) return null;
                  return fetch(info.thumburl)
                    .then(function (r) {
                      if (!r.ok) throw new Error('HTTP ' + r.status);
                      return r.blob();
                    })
                    .then(blobToDataUrl)
                    .then(function (dataUrl) {
                      if (!dataUrl || dataUrl.length < 2048) return null;
                      existing[id] = 1;
                      added.push({
                        id: id,
                        title: cleanTitle(page.title) || 'Museum picture',
                        creator: cleanArtist(info.extmetadata),
                        date: '',
                        medium: '',
                        source: 'Wikimedia Commons (public domain)',
                        sourcePage: info.descriptionurl || '',
                        dataUrl: dataUrl
                      });
                    })
                    .catch(function () { return null; });
                });
              });
              return step;
            }).catch(function () { return null; });
          });
        });
        return chain;
      })
      .then(function () { return museumPut(added); })
      .then(function () {
        return museumAll().then(function (rows) {
          return { ok: true, added: added.length, total: rows.length };
        });
      });
  }

  /* ------------------------------------------------------------------ api */

  var online = {
    onlineStatus: function () {
      return Promise.resolve({ enabled: onlineOn() });
    },

    onlineProbe: function () {
      if (!onlineOn()) return Promise.resolve({ enabled: false, online: false, at: Date.now() });
      var cached = window.__netProbe;
      if (cached && Date.now() - cached.at < 30000) {
        return Promise.resolve({ enabled: true, online: cached.online, at: cached.at });
      }
      return getJson('https://api.datamuse.com/words?max=1', 4000).then(
        function () {
          window.__netProbe = { at: Date.now(), online: true };
          return { enabled: true, online: true, at: Date.now() };
        },
        function () {
          window.__netProbe = { at: Date.now(), online: false };
          return { enabled: true, online: false, at: Date.now() };
        }
      );
    },

    onlineMeaning: function (word) {
      if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
      var w = String(word || '').trim();
      if (!w || !/^[a-zA-Z][a-zA-Z' -]{0,40}$/.test(w)) return Promise.resolve({ ok: false, error: 'bad-word' });
      return getJson('https://api.datamuse.com/words?sp=' + encodeURIComponent(w) + '&md=dp&max=1', 7000).then(
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
      return getJson('https://api.datamuse.com/words?ml=' + encodeURIComponent(theme) + '&max=' + count, 7000).then(
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

    newsIndex: function (opts) {
      var force = !!(opts && opts.force);
      var cached = readJson('ssb-news');
      var fresh = cached && Date.now() - (cached.checkedAt || 0) <= 30 * 60 * 1000;
      if (cached && fresh && !force) return Promise.resolve(newsPack(cached, { cached: true }));
      if (!onlineOn()) {
        return Promise.resolve(cached ? newsPack(cached, { cached: true, offline: true }) : { ok: false, error: 'offline' });
      }
      return googleNews('India defence OR "Indian Army" OR "SSB interview" OR India news', 18)
        .then(function (rows) {
          if (!rows.length) throw new Error('empty');
          var rec = { items: rows, checkedAt: Date.now() };
          writeJson('ssb-news', rec);
          return newsPack(rec, { cached: false });
        })
        .catch(function (err) {
          if (cached) return newsPack(cached, { cached: true, offline: true });
          return { ok: false, error: err.message === 'empty' ? 'empty' : 'network' };
        });
    },

    // The Python digest engine cannot run in a WebView, but the thing the
    // person actually wants - today's current affairs, twelve sections - can
    // be built here from the same free Google News feeds. It is cached, so a
    // lost connection still opens yesterday's edition instead of a dead form.
    digestOnPhone: function (opts) {
      var force = !!(opts && opts.force);
      var cached = readJson('ssb-digest-phone');
      if (!force && cached && cached.sections && Date.now() - (cached.at || 0) < 20 * 60 * 1000) {
        return Promise.resolve(digestPhonePack(cached, true));
      }
      if (!onlineOn()) {
        return Promise.resolve(cached ? digestPhonePack(cached, true, 'offline') : { ok: false, error: 'offline' });
      }
      var jobs = DIGEST_SECTIONS.map(function (sec) {
        return googleNews(sec.query, 4).then(
          function (rows) { return { key: sec.key, label: sec.label, items: rows.slice(0, 4) }; },
          function () { return { key: sec.key, label: sec.label, items: [] }; }
        );
      });
      return Promise.all(jobs).then(function (sections) {
        var total = sections.reduce(function (n, s) { return n + s.items.length; }, 0);
        if (!total) throw new Error('empty');
        var rec = { at: Date.now(), sections: sections };
        writeJson('ssb-digest-phone', rec);
        return digestPhonePack(rec, false);
      }).catch(function (err) {
        if (cached) return digestPhonePack(cached, true, err.message);
        return { ok: false, error: err.message === 'empty' ? 'empty' : 'network', detail: err.message };
      });
    },

    lecturesHot: function () {
      if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
      return googleNews('"SSB interview" OR "Services Selection Board" OR Indian Armed Forces', 12).then(
        function (rows) {
          if (!rows.length) return { ok: false, error: 'empty' };
          return { ok: true, items: rows, checkedAt: Date.now(), source: 'Google News' };
        },
        function (err) { return { ok: false, error: 'network', detail: err.message }; }
      );
    },

    lecturesLive: function (opts) {
      var o = opts || {};
      var id = String(o.id || 'topic');
      var q = String(o.query || '').trim();
      var cached = readJson('ssb-live-' + id);
      if (!onlineOn()) return Promise.resolve(cached ? livePack(cached, true) : { ok: false, error: 'offline' });
      if (!q) return Promise.resolve(cached ? livePack(cached, true) : { ok: false, error: 'no-query' });
      return googleNews(q, 12)
        .then(function (rows) {
          if (!rows.length) throw new Error('empty');
          var rec = { id: id, query: q, points: rows, checkedAt: Date.now(), source: 'Google News' };
          writeJson('ssb-live-' + id, rec);
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
          var rec = readJson(key);
          if (rec && rec.id) out[rec.id] = { checkedAt: rec.checkedAt || 0, checkedOn: isoDay(rec.checkedAt) };
        }
      } catch (_) {}
      return Promise.resolve(out);
    },

    tatLibrary: function () {
      return museumAll()
        .then(function (rows) {
          return rows.map(function (r) {
            return {
              id: r.id,
              file: r.dataUrl,
              title: r.title || 'Museum picture',
              creator: r.creator || '',
              date: r.date || '',
              medium: r.medium || '',
              source: r.source || 'Wikimedia Commons (public domain)',
              license: 'Public domain',
              sourcePage: r.sourcePage || ''
            };
          });
        })
        .catch(function () { return []; });
    },

    tatOnline: function (opts) {
      if (!onlineOn()) return Promise.resolve({ ok: false, error: 'offline' });
      var want = Math.max(1, Math.min(24, (opts && opts.count) || 10));
      return fetchMuseum(want).catch(function (err) {
        return { ok: false, error: 'network', detail: err.message };
      });
    }
  };

  // api.js and this file load back to back, but keep the install order-proof.
  (function install(tries) {
    if (window.api) {
      Object.assign(window.api, online);
      return;
    }
    if (tries > 60) return;
    setTimeout(function () { install(tries + 1); }, 25);
  })(0);
})();
