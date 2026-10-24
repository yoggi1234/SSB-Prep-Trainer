/*
 * Network transport for the Android build.
 *
 * The desktop app makes every request from the main process. A phone has only
 * the page, so this module is that process: small JSON/XML helpers with a
 * timeout, Google News RSS read through the native HTTP layer (the feed sends
 * no CORS header, so a browser fetch cannot read it), and the one date format
 * every cached record uses.
 *
 * Policy stays with the callers: nothing here decides whether a request is
 * allowed, caches an answer, or knows what the data means.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

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
      var title = decodeEntities(tagText(body, 'title')).trim();
      if (!title) continue;
      // Google News titles end in " - Publisher": split it off as the source,
      // and date the point by day, as cleanHeadline() does in src/main.js.
      var source = '';
      var dash = title.lastIndexOf(' - ');
      if (dash > 20) {
        source = title.slice(dash + 3).trim();
        title = title.slice(0, dash).trim();
      }
      var day = '';
      try {
        day = new Date(tagText(body, 'pubDate').trim()).toISOString().slice(0, 10);
      } catch (_) {}
      out.push({
        text: title,
        title: title,
        source: source,
        link: decodeEntities(tagText(body, 'link')),
        date: day,
        query: query
      });
    }
    return out;
  }

  // True inside the Capacitor WebView, where CapacitorHttp is available and not
  // subject to browser CORS, exactly like the desktop main process.
  function nativeHttp() {
    try {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (_) {
      return false;
    }
  }

  function readRss(url) {
    return fetch(url, { headers: { Accept: 'application/rss+xml, application/xml' } }).then(
      function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }
    );
  }

  // Google News has no CORS header, so this only succeeds on a device (native
  // HTTP) - the browser's live route is the Wikipedia portal in online.js.
  function googleNews(query, count) {
    var want = count || 12;
    var rss =
      'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-IN&gl=IN&ceid=IN:en';
    return readRss(rss).then(function (xml) {
      var rows = parseRss(xml, query, want);
      if (!rows.length) throw new Error('empty');
      return rows;
    });
  }

  function isoDay(at) {
    return at ? new Date(at).toISOString().slice(0, 10) : '';
  }

  SSB.net = {
    getJson: getJson,
    googleNews: googleNews,
    nativeHttp: nativeHttp,
    isoDay: isoDay
  };
})();
