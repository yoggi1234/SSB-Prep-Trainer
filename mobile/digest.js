/*
 * The News Digest on the Android build.
 *
 * The desktop compiles the digest with a Python engine in a separate process.
 * A WebView cannot run that, so this module is the phone's whole digest: it
 * collects today's stories from free feeds, groups them into the twelve
 * sections, caches the edition, and guarantees that opening the tab always
 * shows a real edition instead of a dead form:
 *
 *   live feeds -> last edition saved on this phone -> bundled reference edition
 *
 * Transport (RSS, JSON, timeouts) is in net.js; the record format and the
 * fallback order are here, because only the digest cares about them.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var net = window.SSB.net;
  var store = window.SSB.store;

  // One page per section, in the same order as the desktop digest. The device
  // reads these from Google News through the native HTTP layer; the browser's
  // Wikipedia edition keeps its own editorial sections instead of forcing global
  // stories into these India-centric buckets - a word-matching classifier put
  // "West Bank" under Financial and a prize win under War.
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
          items: (s.items || []).map(function (it) {
            return { title: it.title || it.text || '', link: it.link || '', source: it.source || '', date: it.date || '' };
          })
        };
      }),
      at: rec.at || 0,
      checkedOn: net.isoDay(rec.at),
      source: rec.source || 'Google News (on the phone)',
      cached: !!cached
    };
    if (detail === 'offline') out.offline = true;
    else if (detail) out.detail = detail;
    return out;
  }

  // The reference edition ships inside the APK: twelve sections of standing
  // context written into data/digest-offline.json. It is deliberately not
  // today's news, and the screen says so, but it means the digest tab always
  // has a real edition to show when there is no connection and no saved one.
  var refEdition = null;
  function digestReference() {
    if (refEdition) return Promise.resolve(refEdition);
    return fetch('data/digest-offline.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var pack = digestPhonePack({ at: 0, sections: data.sections || [] }, true);
        pack.reference = true;
        pack.edition = data.edition || 'reference';
        pack.note = data.note || '';
        pack.source = 'Bundled reference edition';
        pack.checkedOn = '';
        refEdition = pack;
        return pack;
      })
      .catch(function () { return null; });
  }

  // Whatever happens, answer with an edition: today's if the feeds arrived,
  // yesterday's if a copy was saved, the bundled reference if neither exists.
  // This is what stops the tab dead-ending on "turn online lookup on".
  function digestFallback(cached, detail) {
    if (cached && cached.sections && cached.sections.length) {
      return Promise.resolve(digestPhonePack(cached, true, detail));
    }
    return digestReference().then(function (ref) {
      if (ref) {
        if (detail && detail !== 'offline') ref.detail = detail;
        return ref;
      }
      return { ok: false, error: detail || 'network' };
    });
  }

  /* ---------------------------------------- browser edition (no native HTTP) */

  // Live edition for browsers: Wikipedia's Current Events portal. It is the one
  // genuinely current news source that sends Access-Control-Allow-Origin, needs
  // no key and no proxy, and its day pages are small structured wikitext.
  var CE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  // Wiki markup -> one readable line: links keep their label, citations keep the
  // source name in brackets, templates and refs are dropped.
  function ceText(s) {
    return String(s)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\s*\(([^)]*)\)\]/g, ' ($1)')
      .replace(/\[https?:\/\/[^\s\]]+\]/g, ' ')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/'''?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // A day page looks like "*[[Topic]]" for a subject, then "**"/"***" lines with
  // the sentences themselves.
  function ceItems(wikitext) {
    var items = [];
    var topic = '';
    String(wikitext).split('\n').forEach(function (line) {
      var m = /^(\*+)\s*(.+)$/.exec(line);
      if (!m) return;
      var raw = m[2].trim();
      var text = ceText(raw);
      if (!text) return;
      // Every real story ends with a citation like "[https://… (Reuters)]"; the
      // subject and sub-subject lines are bare links. That is what tells them apart
      // (a comma-separated link list such as "Yemeni civil war, al-Qaeda insurgency"
      // is a heading, not a sentence).
      if (!/\[https?:\/\//.test(raw)) {
        if (m[1].length === 1) topic = text;
        return;
      }
      if (text.length < 40) return;
      items.push({ title: text, topic: topic });
    });
    return items;
  }

  function ceDay(offsetDays) {
    var d = new Date(Date.now() - offsetDays * 86400000);
    var page =
      'Portal:Current_events/' + d.getUTCFullYear() + '_' + CE_MONTHS[d.getUTCMonth()] + '_' + d.getUTCDate();
    return net
      .getJson(
        'https://en.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent(page) +
          '&prop=wikitext&format=json&origin=*',
        9000
      )
      .then(
        function (body) {
          var text = body && body.parse && body.parse.wikitext && body.parse.wikitext['*'];
          return text ? ceItems(text) : [];
        },
        function () { return []; }
      );
  }

  // Groups the day's stories under the portal's own subject headings, in the
  // order they appear. No keyword guessing, so a story is never filed under a
  // section it has nothing to do with.
  function topicSections(items) {
    var out = [];
    items.forEach(function (it) {
      var label = it.topic || 'Current events';
      var sec = null;
      for (var i = 0; i < out.length; i++) {
        if (out[i].label === label) { sec = out[i]; break; }
      }
      if (!sec) {
        if (out.length >= 12) return;
        sec = { key: 'topic-' + out.length, label: label, items: [] };
        out.push(sec);
      }
      if (sec.items.length < 4) sec.items.push({ title: it.title, link: '' });
    });
    return out.filter(function (s) { return s.items.length; });
  }

  function currentEventsLive() {
    // Today's page fills up during the day, so yesterday is merged in behind it.
    return Promise.all([ceDay(0), ceDay(1)]).then(function (days) {
      var seen = {};
      var items = [];
      days.forEach(function (list) {
        list.forEach(function (it) {
          var key = it.title.slice(0, 60).toLowerCase();
          if (seen[key]) return;
          seen[key] = 1;
          items.push(it);
        });
      });
      if (!items.length) throw new Error('empty');
      return topicSections(items);
    });
  }

  /* ------------------------------------------------------------------- api */

  // Nothing here can succeed: the engine is a Python process the desktop owns.
  // They still answer "unsupported" instead of throwing so a screen shared with
  // the desktop keeps rendering and can say why.
  var desktopOnly = { ok: false, error: 'unsupported' };

  SSB.digest = {
    api: {
      // The Python engine cannot run in a WebView, but the thing the person
      // actually wants - today's current affairs, twelve sections - can be built
      // here from the same free feeds. It is cached, so a lost connection still
      // opens yesterday's edition instead of a dead form.
      digestOnPhone: function (opts) {
        var force = !!(opts && opts.force);
        var cached = store.readJson('ssb-digest-phone', null);
        if (!force && cached && cached.sections && Date.now() - (cached.at || 0) < 20 * 60 * 1000) {
          return Promise.resolve(digestPhonePack(cached, true));
        }
        if (!window.SSB.online.enabled()) {
          return digestFallback(cached, 'offline');
        }
        // Device: Google News through the native HTTP layer. Browser: the Wikipedia
        // Current Events portal, which is the transport that survives CSP and CORS.
        var live = net.nativeHttp()
          ? Promise.all(
              DIGEST_SECTIONS.map(function (sec) {
                // when:2d keeps evergreen explainer pages out of a daily edition.
                return net.googleNews(sec.query + ' when:2d', 4).then(
                  function (rows) { return { key: sec.key, label: sec.label, items: rows.slice(0, 4) }; },
                  function () { return { key: sec.key, label: sec.label, items: [] }; }
                );
              })
            )
          : currentEventsLive();
        return live
          .then(function (sections) {
            var total = sections.reduce(function (n, s) { return n + s.items.length; }, 0);
            if (!total) throw new Error('empty');
            var rec = {
              at: Date.now(),
              source: net.nativeHttp() ? 'Google News (on the phone)' : 'Wikipedia Current Events',
              sections: sections
            };
            store.writeJson('ssb-digest-phone', rec);
            return digestPhonePack(rec, false);
          })
          .catch(function (err) {
            return digestFallback(cached, err.message);
          });
      },

      digestStatus: function () {
        return Promise.resolve({ ok: false, error: 'unsupported', unsupported: true, python: null });
      },
      digestRun: function () {
        return Promise.resolve(desktopOnly);
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
      }
    }
  };
})();
