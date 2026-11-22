/*
 * The 12-page news edition on the phone: a port of digest-tool/newsdigest
 * (sources.py, util.py, writer.py and draft.py) without the Python process.
 *
 * Same steps as `digest run today`: read the publisher RSS feeds and the Google
 * News searches for the last day, drop junk and stories already covered in the
 * last three editions, merge the same story from different outlets, pick the
 * war of the day, give every story to its best section, fetch the full text of
 * the lead articles, and write each page from real sentences (no AI model):
 * paragraph, figure tiles, story cards, key points, full forms, benefit,
 * advanced point, also in the news, sources and confidence. The draft it
 * returns has the shape draft.py writes, so pdf.js draws it as render.py does.
 *
 * Everything that touches the outside goes through `io` (fetch text, read and
 * write saved state), so the same engine runs in Node for testing.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.SSB = root.SSB || {};

  /* ----------------------------------------------------------- config.py */

  var CFG = {
    title: 'Daily News Digest',
    tzHours: 5.5,
    daysBack: 1,
    articlesPerSection: 3,
    layout: { max_key_points: 5, max_flow_steps: 6, max_snapshot_stories: 4, max_tiles: 4, max_full_forms: 40,
      max_also: 3, inline_meanings: false, max_meanings_per_paragraph: 6, inline_full_forms: false },
    feeds: [
      ['The Hindu', 'https://www.thehindu.com/news/national/feeder/default.rss', 'National'],
      ['The Hindu', 'https://www.thehindu.com/news/international/feeder/default.rss', 'International'],
      ['The Hindu', 'https://www.thehindu.com/news/national/other-states/feeder/default.rss', 'Regional (States)'],
      ['The Hindu', 'https://www.thehindu.com/business/Economy/feeder/default.rss', 'Economic'],
      ['The Hindu', 'https://www.thehindu.com/sci-tech/science/feeder/default.rss', 'Major Inventions and Science'],
      ['Times of India', 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', 'National'],
      ['Times of India', 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', 'International'],
      ['Times of India', 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', 'Financial'],
      ['Indian Express', 'https://indianexpress.com/section/india/feed/', 'National'],
      ['PIB', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', 'National'],
      ['Mint', 'https://www.livemint.com/rss/economy', 'Economic'],
      ['BBC', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'International'],
      ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'International'],
      ['ScienceDaily', 'https://www.sciencedaily.com/rss/top/science.xml', 'Major Inventions and Science']
    ],
    sections: [
      { name: 'National', queries: ['India government', 'Union Cabinet India', 'Supreme Court India'],
        keywords: ['union government', 'centre', 'ministry', 'cabinet', 'supreme court', 'high court', 'scheme',
          'pib', 'pm modi', 'prime minister', 'president murmu', 'nationwide', 'union minister', 'railway', 'census',
          'ugc', 'education', 'health ministry', 'lok sabha', 'rajya sabha'] },
      { name: 'International', queries: ['world news', 'United Nations'],
        keywords: ['un ', 'united nations', 'us ', 'president trump', 'europe', 'uk ', 'france', 'germany', 'japan',
          'africa', 'global', 'world', 'summit', 'election in', 'who ', 'foreign'] },
      { name: 'Regional (States)', queries: ['state government India chief minister'],
        keywords: ['chief minister', 'state government', 'assembly', 'district', 'governor'],
        exclude: ['gold', 'silver', 'share price', 'sensex'] },
      { name: 'Defence', queries: ['Indian Army OR Indian Navy OR Indian Air Force OR DRDO', 'India defence ministry'],
        keywords: ['army', 'navy', 'air force', 'iaf', 'drdo', 'missile', 'defence', 'military', 'exercise', 'warship',
          'submarine', 'fighter jet', 'rafale', 'tejas', 'brahmos', 'soldier', 'jawan', 'border', 'crpf', 'bsf',
          'coast guard', 'itbp', 'cds', 'agniveer'] },
      { name: 'Politics', queries: ['India politics BJP Congress', 'Election Commission India'],
        keywords: ['bjp', 'congress', 'party', 'election', 'poll', 'vote', 'candidate', 'opposition', 'mla', 'mp ',
          'rally', 'alliance', 'nda', 'india bloc', 'aap', 'tmc', 'dmk', 'manifesto'] },
      { name: 'Financial', queries: ['Sensex Nifty', 'RBI SEBI banking'],
        keywords: ['rbi', 'sebi', 'bank', 'sensex', 'nifty', 'stock', 'share', 'ipo', 'rupee', 'loan', 'repo',
          'investor', 'market', 'fund', 'insurance', 'credit', 'bond', 'crypto'] },
      { name: 'Economic', queries: ['India GDP inflation economy', 'India trade exports'],
        keywords: ['gdp', 'inflation', 'economy', 'economic', 'growth', 'trade', 'export', 'import', 'tariff', 'gst',
          'tax', 'fiscal', 'budget', 'cpi', 'wpi', 'iip', 'manufacturing', 'pmi', 'fdi', 'deficit', 'imf', 'world bank'] },
      { name: 'Neighbouring Countries', queries: ['Pakistan OR Bangladesh OR Nepal OR Sri Lanka India',
        'China OR Bhutan OR Maldives OR Myanmar OR Afghanistan India'],
        keywords: ['pakistan', 'china', 'chinese', 'nepal', 'bhutan', 'bangladesh', 'sri lanka', 'myanmar', 'maldives',
          'afghanistan', 'taliban', 'dhaka', 'kathmandu', 'colombo', 'islamabad', 'beijing', 'male', 'thimphu', 'kabul'] },
      { name: 'Major Inventions and Science', queries: ['ISRO', 'science discovery research'],
        keywords: ['isro', 'nasa', 'space', 'satellite', 'launch', 'scientist', 'research', 'study', 'discovery',
          'technology', 'ai ', 'artificial intelligence', 'quantum', 'vaccine', 'gene', 'climate', 'species',
          'invention', 'rocket', 'moon', 'mars', 'chip', 'semiconductor'] },
      { name: 'Geopolitical', queries: ['India foreign policy', 'Quad OR BRICS OR SCO OR G20'],
        keywords: ['strategic', 'geopolitic', 'alliance', 'quad', 'brics', 'sco', 'g20', 'g7', 'nato', 'indo-pacific',
          'sanction', 'treaty', 'bilateral', 'diplomat', 'external affairs', 'jaishankar', 'foreign minister', 'talks',
          'visit', 'ties'] },
      { name: 'Miscellaneous', queries: ['India award sports'],
        keywords: ['award', 'sport', 'cricket', 'olympic', 'medal', 'prize', 'festival', 'day ', 'index', 'report',
          'ranking', 'heritage', 'appointed', 'died', 'book', 'film'] },
      { name: 'WAR SECTION', war: true }
    ]
  };

  /* ------------------------------------------------------------- util.py */

  var STOP = {};
  ('a an the of to in on for and or but with at by from as is are was were be been it its this that these those ' +
    'into over after before about than amid says said say will would can could may might new has have had not no his her their ' +
    "our we you they he she who what when where why how all more most also up out off said india's indian india")
    .split(/\s+/).forEach(function (w) { STOP[w] = 1; });

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: ' - ', hellip: '...',
    rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', rupee: '₹' };

  function unescapeHtml(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === '#') {
        var n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] != null ? ENTITIES[e.toLowerCase()] : m;
    });
  }

  function cleanHtml(s) {
    s = String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ');
    s = unescapeHtml(s);
    s = s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/–/g, '-').replace(/—/g, ' - ')
      .replace(/�/g, "'").replace(/­/g, '');
    s = s.replace(/#(\w+)/g, function (m, w) { return w.replace(/_/g, ' '); });
    return s.replace(/\s+/g, ' ').trim();
  }

  function stripSourceSuffix(title) {
    title = title.replace(/\s+\|\s+[^|]{2,40}$/, '');
    return title.replace(/\s+-\s+[^-]{2,40}$/, '').trim();
  }

  var CUT_END = /(\.\.\.|…|\[…\]|\[\.\.\.\])\s*$/;

  function isCut(text) {
    return CUT_END.test(text || '');
  }

  function tidyCut(text) {
    if (!isCut(text)) return text;
    var body = text.replace(CUT_END, '').replace(/\s+$/, '');
    var re = /[.?!:;,](?=\s)/g;
    var m;
    var lastEnd = -1;
    while ((m = re.exec(body))) lastEnd = m.index + 1;
    if (lastEnd >= 0 && lastEnd >= body.length * 0.4) return body.slice(0, lastEnd).replace(/[,;:]+$/, '');
    return body.indexOf(' ') >= 0 ? body.slice(0, body.lastIndexOf(' ')).replace(/[,;:\-]+$/, '') : body;
  }

  var CREDIT_RE = /\|?\s*((photo|image|picture|video)\s*(credit|courtesy|source)s?|file (photo|image|picture))\s*:\s*(special arrangement|getty images|\S+)/gi;
  var JUNK_SENT = /(sign ?in|sign up|subscribe|unlock|download the app|click here|newsletter|read more|also read|follow us|log ?in to|whatsapp channel|google news|all rights reserved|cookie|advertisement|watch the video|listen to|report feedback|thank you for your feedback|feedback has been|translated by ai|share this (article|story)|copy link|font size|story continues|trending now)/i;
  var DATELINE = /^(?:[A-Z][\w.]+\s+-\s+)?(?:[A-Z][A-Z .,/]{2,40}(?:\(\w+\))?\s*[:\-]\s+|(?:[A-Z]{2,}\s+){3,}(?=[A-Z][a-z]))/;

  function isEnglish(text) {
    var letters = String(text).match(/\p{L}/gu) || [];
    if (!letters.length) return false;
    var ok = letters.filter(function (ch) { return ch.charCodeAt(0) < 128 || 'éèàçñüöäóíá'.indexOf(ch) >= 0; }).length;
    return ok / letters.length > 0.97;
  }

  function tokens(text) {
    return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return !STOP[w] && w.length > 2; });
  }

  function similarity(a, b) {
    var ta = new Set(tokens(a));
    var tb = new Set(tokens(b));
    if (!ta.size || !tb.size) return 0;
    var inter = 0;
    ta.forEach(function (t) { if (tb.has(t)) inter++; });
    var union = ta.size + tb.size - inter;
    return (inter / Math.min(ta.size, tb.size)) * 0.5 + (inter / union) * 0.5;
  }

  function sentences(text) {
    text = String(text || '').replace(CREDIT_RE, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/\s+×\s+/g, ' ¶ ');
    var parts = text.split(/(?<=[.!?।])\s+(?=[A-Z"'(])|\s*¶\s*/);
    var out = [];
    parts.forEach(function (p) {
      p = p.trim().replace(/^[ |]+|[ |]+$/g, '').replace(/^Loading\W*/, '');
      p = p.replace(DATELINE, '');
      if (p.length <= 25 || JUNK_SENT.test(p) || isCut(p) || !isEnglish(p)) return;
      if (!/[.!?]["'’”)]*$/.test(p)) return;
      if (out.some(function (q) { return similarity(p, q) > 0.8; })) return;
      out.push(p);
    });
    return out;
  }

  var NUM_RE = /(₹|Rs\.?\s?|USD\s?|INR\s?|\$|US\$|€|£)?\s?(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)[\s-]?(%|per cent|percent|crore|lakh|billion|million|trillion|bn|km|kilometres|tonnes|MW|GW|bps|basis points|years?|days?|people|killed|dead|soldiers|troops|drones|missiles|aircraft|jets|satellites|seats|votes|states|countries|nations|children|students|passengers|families|villages|workers|civilians|Indians|ships|vessels|patients|cases|deaths|injured|wounded|hostages|refugees)?\b/gi;
  var LINK = {};
  ['is', 'was', 'were', 'are', 'has', 'have', 'had', 'for', 'in', 'to', 'of', 'the', 'and', 'on', 'at', 'from', 'by', 'with',
    'as', 'a', 'an', 'that', 'which', 'this', 'it', 'be', 'been', 'will', 'would', 'while', 'but', 'or', 'so', 'than', 'about']
    .forEach(function (w) { LINK[w] = 1; });
  var UNITS = { per: 1, cent: 1, percent: 1, crore: 1, lakh: 1, billion: 1, million: 1, trillion: 1, usd: 1, inr: 1, rs: 1 };

  function words(s) {
    return s.match(/[A-Za-z][A-Za-z\-']*/g) || [];
  }

  function figureLabel(s, start, end) {
    var after = words(s.slice(end).split(/[,.;:()"]/)[0]).slice(0, 4);
    var beforeParts = s.slice(0, start).split(/[,.;:()"]/);
    var before = words(beforeParts[beforeParts.length - 1]);
    var w;
    if (after.length > 1 && { is: 1, was: 1, were: 1, are: 1, has: 1, have: 1, had: 1 }[after[0].toLowerCase()] &&
        !LINK[after[1].toLowerCase()]) {
      w = after.slice(1, 3);
    } else if (after.length && !LINK[after[0].toLowerCase()]) {
      w = after;
    } else {
      w = before.filter(function (x) { return !STOP[x.toLowerCase()] && !UNITS[x.toLowerCase()]; }).slice(-3);
    }
    while (w.length && (LINK[w[w.length - 1].toLowerCase()] || STOP[w[w.length - 1].toLowerCase()])) w = w.slice(0, -1);
    while (w.length && LINK[w[0].toLowerCase()]) w = w.slice(1);
    return w.join(' ');
  }

  function keyFigures(text, limit) {
    limit = limit || 6;
    var found = [];
    var seen = {};
    var list = sentences(text);
    if (!list.length) list = [text];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var m;
      NUM_RE.lastIndex = 0;
      while ((m = NUM_RE.exec(s))) {
        if (!m[0]) { NUM_RE.lastIndex++; continue; }
        var cur = m[1];
        var n = m[2];
        var unit = m[3];
        if (!(cur || unit)) continue;
        if (unit && /^year/i.test(unit) && /^(19|20)\d\d$/.test(n)) continue;
        if (/^(19|20)\d\d$/.test(n) && !cur) continue;
        cur = (cur || '').trim();
        if (/[A-Za-z]$/.test(cur)) cur += ' ';
        var value = (cur + n + (unit && unit !== '%' ? ' ' + unit : unit || '')).trim();
        value = value.replace(/^Rs\.?\s*/, 'Rs ').replace(/ {2}/g, ' ');
        if (seen[value.toLowerCase()]) continue;
        var mStart = m.index + (m[0].length - m[0].replace(/^\s+/, '').length);
        var mEnd = m.index + m[0].length;
        var before = (s.slice(0, mStart).match(/[A-Za-z][A-Za-z\-']+/g) || []).slice(-4);
        var after = (s.slice(mEnd).match(/[A-Za-z][A-Za-z\-']+/g) || []).slice(0, 3);
        var label = figureLabel(s, mStart, mEnd) ||
          (before.slice(-3).length ? before.slice(-3) : after).filter(function (x) { return !STOP[x.toLowerCase()]; }).join(' ') ||
          after.join(' ');
        seen[value.toLowerCase()] = 1;
        found.push({ value: value, label: label.slice(0, 40) });
        if (found.length >= limit) return found;
      }
    }
    return found;
  }

  function wholeSentences(text, n) {
    text = String(text || '').trim();
    if (text.length <= n) return text;
    var out = '';
    var parts = text.split(/(?<=[.!?"])\s+(?=[A-Z"'(])/);
    for (var i = 0; i < parts.length; i++) {
      if (out && out.length + 1 + parts[i].length > n) break;
      out = (out + ' ' + parts[i]).trim();
    }
    return out;
  }

  function shortText(text, n) {
    text = String(text || '').trim();
    if (text.length <= n) return text;
    var cut = text.slice(0, n);
    cut = cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length);
    return cut.replace(/[,;:\-]+$/, '') + '...';
  }

  function capitalize(w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Calendar arithmetic on YYYY-MM-DD strings, kept in UTC so the phone's own zone never shifts a day.
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function niceDate(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    return DAY_NAMES[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function todayIst() {
    return new Date(Date.now() + CFG.tzHours * 3600000).toISOString().slice(0, 10);
  }

  function istMs(iso, endOfDay) {
    return Date.parse(iso + 'T00:00:00Z') - CFG.tzHours * 3600000 + (endOfDay ? 86400000 - 1 : 0);
  }

  // Runs fn over items, n at a time; results come back in item order.
  function pool(items, n, fn, each) {
    var out = new Array(items.length);
    var next = 0;
    var done = 0;
    return new Promise(function (resolve) {
      if (!items.length) return resolve(out);
      function run() {
        if (next >= items.length) return;
        var i = next++;
        Promise.resolve()
          .then(function () { return fn(items[i]); })
          .catch(function () { return null; })
          .then(function (res) {
            out[i] = res;
            done++;
            if (each) each(done, items.length);
            if (done === items.length) resolve(out);
            else run();
          });
      }
      for (var k = 0; k < Math.min(n, items.length); k++) run();
    });
  }

  /* ---------------------------------------------------------- sources.py */

  var GN = 'https://news.google.com/rss/search?q=';
  var UA = 'Mozilla/5.0 (Linux; Android 14) NewsDigestCLI/1.0';

  function tag(body, names) {
    for (var i = 0; i < names.length; i++) {
      var m = new RegExp('<' + names[i] + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + names[i] + '>', 'i').exec(body);
      if (m) return m[1];
    }
    return '';
  }

  function feedItems(xml) {
    var out = [];
    var re = /<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi;
    var m;
    while ((m = re.exec(xml))) {
      var b = m[0];
      var link = cleanHtml(tag(b, ['link']));
      if (!link) {
        var lm = /<link[^>]*href="([^"]+)"/i.exec(b);
        link = lm ? unescapeHtml(lm[1]) : '';
      }
      out.push({
        title: cleanHtml(tag(b, ['title'])),
        summary: tag(b, ['description', 'summary', 'content:encoded', 'content']),
        link: link,
        when: cleanHtml(tag(b, ['pubDate', 'published', 'updated', 'dc:date'])),
        source: cleanHtml(tag(b, ['source']))
      });
    }
    return out;
  }

  function fetchFeed(io, url, name, hint, date) {
    return io.fetchText(url, 15000).then(function (xml) {
      var start = istMs(addDays(date, -CFG.daysBack), false);
      var end = istMs(date, true);
      var items = [];
      feedItems(xml).forEach(function (e) {
        var t = e.when ? Date.parse(e.when) : NaN;
        if (isFinite(t) && (t < start || t > end)) return;
        var title = e.title;
        var src = name;
        var summary;
        if (url.indexOf('news.google.com') >= 0) {
          var dash = title.lastIndexOf(' - ');
          src = e.source || cleanHtml(dash >= 0 ? title.slice(dash + 3) : title);
          title = stripSourceSuffix(title);
          summary = '';
        } else {
          summary = cleanHtml(e.summary);
        }
        title = tidyCut(stripSourceSuffix(title));
        if (!title || !isEnglish(title)) return;
        if (summary && !isEnglish(summary)) summary = '';
        var when = isFinite(t) ? new Date(t + CFG.tzHours * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '';
        items.push({ title: title, summary: summary, source: src, link: e.link, when: when, hint: hint, kind: 'web' });
      });
      return items;
    }, function () { return []; });
  }

  function googleNews(io, query, date, hint) {
    var after = addDays(date, -(CFG.daysBack + 1));
    var before = addDays(date, 1);
    var q = encodeURIComponent(query + ' after:' + after + ' before:' + before).replace(/%20/g, '+');
    return fetchFeed(io, GN + q + '&hl=en-IN&gl=IN&ceid=IN:en', 'Google News', hint, date);
  }

  // Google News RSS links hide the publisher URL; Google's own page gives it back (free, no key).
  function decodeGoogleNews(io, url) {
    var gid = url.split('?')[0].split('/').pop();
    return io.fetchText('https://news.google.com/rss/articles/' + gid, 15000, { headers: { 'User-Agent': UA } }).then(function (page) {
      var sg = /data-n-a-sg="([^"]+)"/.exec(page)[1];
      var ts = /data-n-a-ts="([^"]+)"/.exec(page)[1];
      var inner = ['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
        'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], gid, parseInt(ts, 10), sg];
      var body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', JSON.stringify(inner), null, 'generic']]]));
      return io.fetchText('https://news.google.com/_/DotsSplashUi/data/batchexecute', 15000, {
        method: 'POST', body: body,
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
      });
    }).then(function (txt) {
      // The phone's HTTP layer hands this reply back with its quotes escaped once more than the PC
      // sees, so the link is taken by its marker rather than by parsing the JSON.
      var m = /garturlres\\*"\s*,\s*\\*"(https?:(?:[^"\\]|\\+u[0-9a-fA-F]{4}|\\+\/)+)/.exec(txt);
      if (!m) throw new Error('no-link');
      return m[1].replace(/\\+u([0-9a-fA-F]{4})/g, function (x, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/\\+\//g, '/');
    });
  }

  // The article's own paragraphs; '' when blocked or paywalled (trafilatura's role on the desktop).
  function articleText(io, url) {
    if (!url) return Promise.resolve('');
    var real = url.indexOf('news.google.com') >= 0 ? decodeGoogleNews(io, url) : Promise.resolve(url);
    return real.then(function (u) {
      return io.fetchText(u, 15000, { headers: { 'User-Agent': UA } });
    }).then(function (html) {
      // Most news sites carry the whole story as schema.org "articleBody"; that is
      // the cleanest text there is, so it wins over scraping the paragraphs.
      var body = '';
      var ld = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
      var lm;
      while ((lm = ld.exec(html))) {
        var bm = /"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(lm[1]);
        if (bm) {
          try { body = JSON.parse('"' + bm[1] + '"'); } catch (_) { body = bm[1]; }
          body = cleanHtml(body);
          if (body.length > 300) return body;
        }
      }
      html = html.replace(/<(script|style|noscript|svg|figure|aside|nav|footer|header|form)[\s\S]*?<\/\1>/gi, ' ');
      var art = /<article[\s>][\s\S]*?<\/article>/i.exec(html);
      var scope = art && art[0].length > 1500 ? art[0] : html;
      var paras = [];
      var re = /<p[\s>]([\s\S]*?)<\/p>/gi;
      var m;
      while ((m = re.exec(scope))) {
        var t = cleanHtml(m[1].replace(/^[^>]*>/, ''));
        // Page furniture trafilatura would drop: "Published - 25 Oct 2026 11:23 am IST", bylines, captions.
        t = t.replace(/^(published|updated|last updated|posted)\b[^A-Za-z]*(on\s+)?[\w ,:.]*?\b(IST|GMT|UTC|am|pm)\b\s*-?\s*/i, '');
        if (t.length >= 40 && !JUNK_SENT.test(t) && !/^(by|written by|edited by|image|photo|file photo)\b/i.test(t)) paras.push(t);
      }
      return paras.join(' ');
    }).catch(function () { return ''; });
  }

  /* ----------------------------------------------------------- writer.py */

  var IGNORE_CAPS = {};
  ('I A AM PM OK TV ID II III IV VI VII VIII IX XI XII AND THE OF FOR IN ON TO BY AT IS IT BE NO AS OR SO HE WE US$ AN UP MR ' +
    'DR ST NEW ALL NOT BUT HAS WAS ARE NOW OUT SAYS LIVE WATCH VIDEO PHOTOS NEWS BREAKING UPDATE').split(' ')
    .forEach(function (w) { IGNORE_CAPS[w] = 1; });
  var STARTERS = {};
  ('The A An This That These Those It In On At After Over With Amid As According Two Three Four Five Several Many Some Its ' +
    'Their Recently Earlier Last Meanwhile However Now Today Yesterday During').split(' ').forEach(function (w) { STARTERS[w] = 1; });
  var NEGATIVE = /\b(war|attack|strike|killed|dead|clash|protest|row|tension|terror|blast|crisis|sanction|tariff|riot|violence|border|dispute|ban|accused|arrest|fire|flood|cyclone|earthquake|missile|drone|hostage|conflict|deficit|slump|fall)\w*/i;
  var BENEFIT_HINT = /\b(will help|help|boost|benefit|strengthen|improve|aims? to|aimed at|enable|create|jobs|self-relian|atmanirbhar|cheaper|faster|security|for india|india's)\w*/i;
  var DATELINE_START = /^[A-Z][A-Z .,/]{2,40}(\(\w+\))?\s*[:\-]\s+/;

  function Writer(data) {
    this.glossary = data.glossary;
    this.hardwords = data.hardwords;
    this.unknown = {};
    this.newsAbbr = {};
    this.abbrRe = {};
    var self = this;
    Object.keys(this.glossary).forEach(function (ab) {
      self.abbrRe[ab] = new RegExp('(?<![A-Za-z0-9])' + escapeRe(ab) + '(?![A-Za-z0-9])');
    });
  }

  // As writer.py: common ones are left out, and an article's own spelling-out comes first.
  var COMMON_ABBR = {};
  ('PM CM US USA UK UN EU UAE G20 G7 GDP IMF AI IT TV MP MLA MLC BJP RBI ISRO NASA WHO NATO FIR IPL ICC FIFA CEO VIP LPG CNG GST ' +
    'IAS IPS IIT IIM AIIMS CBI ED NDA ATM SMS PDF').split(' ').forEach(function (w) { COMMON_ABBR[w] = 1; });
  var ABBR_SKIP = { of: 1, and: 1, for: 1, the: 1, in: 1, on: 1, to: 1, '&': 1 };

  function initialsMatch(abbr, full) {
    var firsts = (full.match(/[A-Za-z]+/g) || []).filter(function (w) { return !ABBR_SKIP[w.toLowerCase()]; })
      .map(function (w) { return w[0].toUpperCase(); });
    var letters = abbr.toUpperCase().replace(/[^A-Z]/g, '').split('');
    if (firsts.length < 2 || !letters.length || letters[0] !== firsts[0]) return false;
    var at = 0;
    return letters.every(function (ch) {
      while (at < firsts.length && firsts[at] !== ch) at++;
      return at++ < firsts.length;
    });
  }

  Writer.prototype.learn = function (ab, full) {
    var w = full.split(' ');
    for (var i = 0; i < w.length; i++) {
      var tail = w.slice(i).join(' ');
      if (!ABBR_SKIP[w[i].toLowerCase()] && initialsMatch(ab, tail)) {
        this.newsAbbr[ab] = tail;
        return;
      }
    }
  };

  Writer.prototype.learnFullForms = function (text) {
    var name = "[A-Z][a-zA-Z-]+(?:\\s+(?:of|and|for|the|in|on|to|&)\\s+[A-Z][a-zA-Z-]+|\\s+[A-Z][a-zA-Z-]+)+";
    var m;
    var a = new RegExp('(' + name + ')\\s*\\(([A-Z][A-Za-z&]{1,7})\\)', 'g');
    while ((m = a.exec(text))) this.learn(m[2], m[1]);
    var b = new RegExp('\\b([A-Z][A-Z&]{1,7})\\s*\\((' + name + ')\\)', 'g');
    while ((m = b.exec(text))) this.learn(m[1], m[2]);
  };

  Writer.prototype.findAbbrs = function (text) {
    var self = this;
    var found = Object.keys(this.glossary).filter(function (ab) { return self.abbrRe[ab].test(text); });
    (text.match(/\b[A-Z][A-Z0-9&]{1,6}\b/g) || []).forEach(function (tok) {
      if (!self.glossary[tok] && !IGNORE_CAPS[tok] && !/^\d+$/.test(tok)) self.unknown[tok] = (self.unknown[tok] || 0) + 1;
    });
    found.sort(function (a, b) { return text.indexOf(a) - text.indexOf(b); });
    return found;
  };

  Writer.prototype.annotate = function (text, used) {
    var lay = CFG.layout;
    used = used || new Set();
    var inserts = [];
    var self = this;
    if (lay.inline_full_forms) {
      this.findAbbrs(text).forEach(function (ab) {
        if (used.has(ab) || COMMON_ABBR[ab]) return;
        var g = self.glossary[ab];
        var m = new RegExp('(?<![A-Za-z0-9])' + escapeRe(ab) + '(?![A-Za-z0-9])(?!\\s*\\()').exec(text);
        var isTerm = g.full.toLowerCase().indexOf(ab.toLowerCase()) === 0;
        if (!m || (!isTerm && text.toLowerCase().indexOf(g.full.toLowerCase()) >= 0)) {
          used.add(ab);
          return;
        }
        inserts.push([m.index + m[0].length, isTerm ? ' (' + g.does + ')' : ' (' + g.full + ')']);
        used.add(ab);
      });
    }
    if (lay.inline_meanings) {
      var n = 0;
      var keys = Object.keys(this.hardwords);
      for (var i = 0; i < keys.length && n < lay.max_meanings_per_paragraph; i++) {
        var w = keys[i];
        if (used.has(w)) continue;
        var m2 = new RegExp('\\b' + escapeRe(w) + '\\b(?!\\s*\\()', 'i').exec(text);
        if (m2) {
          inserts.push([m2.index + m2[0].length, ' (' + this.hardwords[w] + ')']);
          used.add(w);
          n++;
        }
      }
    }
    inserts.sort(function (a, b) { return a[0] - b[0]; });
    var out = '';
    var last = 0;
    inserts.forEach(function (ins) {
      if (ins[0] < last) return;
      out += text.slice(last, ins[0]) + ins[1];
      last = ins[0];
    });
    return out + text.slice(last);
  };

  Writer.prototype.fullFormsFor = function (text, extra) {
    var res = [];
    var self = this;
    (extra || []).concat(text.match(/(?<![A-Za-z0-9])[A-Z][A-Za-z0-9&]*[A-Z0-9](?![A-Za-z0-9])/g) || []).forEach(function (ab) {
      if (COMMON_ABBR[ab] || IGNORE_CAPS[ab] || res.some(function (r) { return r.abbr === ab; })) return;
      var full = self.newsAbbr[ab] || (self.glossary[ab] && self.glossary[ab].full) || '';
      if (full && full.toLowerCase().indexOf(ab.toLowerCase()) !== 0) res.push({ abbr: ab, full: full, does: '' });
    });
    return res;
  };

  function attribute(sentence, source) {
    var first = sentence.split(' ')[0];
    if (STARTERS[first]) sentence = sentence.charAt(0).toLowerCase() + sentence.slice(1);
    return 'According to ' + source + ', ' + sentence;
  }

  Writer.prototype.paragraph = function (lead, others) {
    var sents = [];
    sentences(lead.text || lead.summary || '').forEach(function (s) {
      s = s.replace(DATELINE_START, '');
      if (/^(also read|click|subscribe|follow us|read more)/i.test(s)) return;
      if (sents.some(function (x) { return similarity(s, x) > 0.75; })) return;
      sents.push(s);
    });
    var body = sents.slice(0, 5);
    if (!body.length) body = [lead.title.replace(/\.+$/, '') + '.'];
    var para = [attribute(body[0], lead.sources[0])].concat(body.slice(1));
    if (lead.summary && !lead.text && !isCut(lead.summary) && para.join(' ').indexOf(lead.summary) < 0) para.push(lead.summary);
    var seen = [lead.title];
    (lead.items || []).slice(1).forEach(function (it) {
      if (para.length >= 6) return;
      var t = stripSourceSuffix(it.title);
      if (it.source !== lead.sources[0] && seen.every(function (x) { return similarity(t, x) < 0.8; })) {
        para.push(it.source + ' reported it as: "' + t + '".');
        seen.push(t);
      }
    });
    others.slice(0, 1).forEach(function (o) {
      var s = sentences(o.summary || '');
      para.push('In related news, ' + o.sources[0] + ' reported: ' + (s.length ? s[0] : o.title.replace(/\.+$/, '') + '.'));
    });
    return wholeSentences(para.join(' '), 1050);
  };

  Writer.prototype.context = function (story) {
    var title = stripSourceSuffix(story.title);
    var sents = [];
    var list = sentences((story.text || '') + ' ' + (story.summary || ''));
    for (var i = 0; i < list.length && sents.length < 4; i++) {
      var s = list[i].replace(DATELINE_START, '');
      if (s.length < 300 && similarity(s, title) < 0.7 && !sents.some(function (x) { return similarity(s, x) > 0.75; })) sents.push(s);
    }
    return sents.length ? wholeSentences(sents.slice(0, 2).join(' '), 260) : '';
  };

  Writer.prototype.benefit = function (section, stories, headline) {
    var negative = NEGATIVE.test(headline) || section === 'WAR SECTION';
    var label = negative ? 'WHY IT MATTERS FOR INDIA' : 'BENEFIT FOR INDIA';
    var pool2 = [];
    stories.slice(0, 4).forEach(function (st) {
      sentences((st.text || '') + ' ' + (st.summary || '')).forEach(function (s) {
        if (BENEFIT_HINT.test(s) && s.length < 260) pool2.push(s);
      });
    });
    if (!pool2.length) {
      stories.slice(0, 5).forEach(function (st) {
        (st.items || []).slice(0, 3).forEach(function (it) {
          if (/\bindia/i.test(it.title)) pool2.push(it.title + ' (' + it.source + ')');
        });
      });
      pool2 = pool2.slice(0, 2);
    }
    if (pool2.length) return [label, pool2.slice(0, 2)];
    return [label, ["No direct India angle was stated in today's sources (verify)."]];
  };

  function pickFact(facts, section, text, avoid) {
    var low = ' ' + text.toLowerCase() + ' ';
    var best = null;
    var bestScore = 0;
    facts.forEach(function (f) {
      if (avoid.has(f.fact) || !f.keys) return;
      var score = f.keys.reduce(function (n, k) { return n + low.split(k).length - 1; }, 0);
      if (score > bestScore) {
        best = f.fact;
        bestScore = score;
      }
    });
    if (best) return best;
    for (var i = 0; i < facts.length; i++) if (facts[i].section === section) return facts[i].fact;
    return '';
  }

  /* ------------------------------------------------------------ draft.py */

  var STATES = ['andhra pradesh', 'arunachal', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana', 'himachal',
    'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
    'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand',
    'west bengal', 'delhi', 'jammu', 'kashmir', 'ladakh', 'puducherry', 'chandigarh', 'bengaluru', 'chennai', 'kolkata',
    'mumbai', 'hyderabad', 'lucknow', 'patna', 'thrissur', 'kochi', 'bhopal', 'jaipur', 'guwahati', 'imphal', 'andaman'];
  var JUNK = /(gold (rate|price)|silver (rate|price)|petrol.{0,10}price|price today|horoscope|live updates|\blive:|\bwatch:|photos:|in pics|quiz|wordle|how to |recipe|bigg boss|weather today|lottery|result live|box office|ott release|news and video|latest news, )/i;
  var SPORTS = /\b(ipl|cricket|fifa|football|hockey|tennis|badminton|chess|olympic|medal|tournament|t20|odi|test match|wicket|pacer|batter|squad|coach|league|grand prix|kabaddi)\b/i;
  var PLACES = ['Pakistan', 'China', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka', 'Myanmar', 'Maldives', 'Afghanistan',
    'Russia', 'Ukraine', 'Iran', 'Israel', 'Gaza', 'Japan', 'France', 'Germany', 'Saudi Arabia', 'Yemen', 'Sudan', 'Taiwan',
    'Qatar', 'Canada', 'Australia', 'Africa', 'Europe', 'Trump', 'Supreme Court'];

  function score(item, sec) {
    var title = item.title.toLowerCase();
    var body = (item.summary || '').toLowerCase().slice(0, 600);
    if ((sec.exclude || []).some(function (k) { return title.indexOf(k) >= 0; })) return 0;
    if (SPORTS.test(item.title)) return sec.name === 'Miscellaneous' ? 5 : 0;
    var s = 0;
    (sec.keywords || []).forEach(function (k) {
      if (title.indexOf(k) >= 0) s += 3;
      else if (body.indexOf(k) >= 0) s += 1;
    });
    if (sec.name.indexOf('Regional') === 0) {
      STATES.forEach(function (st) {
        if (title.indexOf(st) >= 0) s += 3;
        if (body.indexOf(st) >= 0) s += 1;
      });
    }
    if (item.hint === sec.name && s) s += 2;
    return s;
  }

  function best(sections, item) {
    var top = sections[0];
    var topScore = score(item, top);
    for (var i = 1; i < sections.length; i++) {
      var s = score(item, sections[i]);
      if (s > topScore) {
        top = sections[i];
        topScore = s;
      }
    }
    return [top, topScore];
  }

  function cluster(items) {
    var clusters = [];
    items.forEach(function (it) {
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        if (similarity(it.title, c.title) >= 0.55) {
          c.items.push(it);
          if (c.sources.indexOf(it.source) < 0) c.sources.push(it.source);
          if ((it.summary || '').length > (c.summary || '').length) c.summary = it.summary;
          if (it.text && !c.text) c.text = it.text;
          if (!c.link && it.link && it.link.indexOf('news.google') < 0) c.link = it.link;
          return;
        }
      }
      clusters.push({ title: it.title, summary: it.summary || '', text: it.text || '', link: it.link || '',
        sources: [it.source], items: [it], hint: it.hint || '', kind: it.kind || 'web' });
    });
    return clusters;
  }

  function disagreements(c) {
    var byUnit = {};
    c.items.forEach(function (it) {
      keyFigures(it.title + '. ' + (it.summary || ''), 8).forEach(function (f) {
        var unit = f.value.indexOf(' ') >= 0 ? f.value.split(' ').pop().toLowerCase() : f.value.indexOf('%') >= 0 ? '%' : '';
        if (['killed', 'dead', 'soldiers', 'troops'].indexOf(unit) < 0) return;
        byUnit[unit] = byUnit[unit] || {};
        byUnit[unit][f.value] = byUnit[unit][f.value] || {};
        byUnit[unit][f.value][it.source] = 1;
      });
    });
    var notes = [];
    Object.keys(byUnit).forEach(function (unit) {
      var vals = byUnit[unit];
      var srcs = {};
      Object.keys(vals).forEach(function (v) { Object.keys(vals[v]).forEach(function (s) { srcs[s] = 1; }); });
      if (Object.keys(vals).length > 1 && Object.keys(srcs).length > 1) {
        notes.push('Sources differ on figures: ' + Object.keys(vals).slice(0, 3).map(function (v) {
          return Object.keys(vals[v]).sort().join(', ') + ': ' + v;
        }).join('; ') + ' (verify)');
      }
    });
    return notes;
  }

  function chooseWar(wars, log, date, items) {
    var counts = wars.map(function (w) {
      return [items.filter(function (it) {
        var t = it.title.toLowerCase();
        return w.keywords.some(function (k) { return t.indexOf(k) >= 0; });
      }).length, w];
    });
    counts.sort(function (a, b) { return b[0] - a[0]; });
    var yday = log[addDays(date, -1)];
    var topN = counts[0][0];
    var top = counts[0][1];
    if (top.name === yday && counts.length > 1) {
      var secondN = counts[1][0];
      var second = counts[1][1];
      if (topN < 2 * Math.max(secondN, 1) || topN < 8) {
        return [second, 'auto: most in the news after ' + top.name + ' (covered yesterday; ' + secondN + ' headlines today)'];
      }
      return [top, 'auto: covered yesterday too, but big news today (' + topN + ' headlines)'];
    }
    return [top, 'auto: most in the news today (' + topN + ' headlines)'];
  }

  /* ------------------- nothing printed twice, as Seen / drop_repeats in draft.py */

  var REPEAT_DAYS = 14;

  function noBrackets(s) {
    return String(s).replace(/\s*\([^()]*\)/g, '').trim();
  }

  function pageLines(p) {
    var out = sentences(p.paragraph || '').concat([p.headline || '']);
    ['key_points', 'also', 'benefit', 'advanced'].forEach(function (f) { out = out.concat(p[f] || []); });
    ((p.flow && p.flow.steps) || []).forEach(function (s) {
      var parts = String(s).split('\n');
      out = out.concat([parts[0]], sentences(parts.slice(1).join(' ')));
    });
    (p.stories || []).forEach(function (s) { out.push(s.title); out = out.concat(sentences(s.para || '')); });
    return out.map(noBrackets).filter(Boolean);
  }

  function figuresIn(text) {
    return String(text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || [];
  }

  function Seen(lines) {
    this.sets = lines.map(function (x) { return { set: new Set(tokens(x)), line: x }; });
    this.figs = new Set(figuresIn(lines.join(' ')));
  }
  Seen.prototype.best = function (text, need) {
    var t = new Set(tokens(text));
    var top = 0;
    var line = '';
    if (t.size) {
      this.sets.forEach(function (o) {
        var n = 0;
        t.forEach(function (w) { if (o.set.has(w)) n++; });
        if (!n) return;
        var sc = (n / Math.min(t.size, o.set.size)) * 0.5 + (n / (t.size + o.set.size - n)) * 0.5;
        if (sc > top) { top = sc; line = o.line; }
      });
    }
    return top >= need ? line : '';
  };
  Seen.prototype.has = function (text) { return !!this.best(text, 0.8); };
  Seen.prototype.storyState = function (title) {
    var line = this.best(title, 0.7);
    if (!line) return 'new';
    var old = new Set(tokens(line));
    var fresh = Array.from(new Set(tokens(title))).filter(function (w) { return !old.has(w); });
    var figs = this.figs;
    return figuresIn(title).some(function (n) { return !figs.has(n); }) || fresh.length >= 3 ? 'update' : 'same';
  };

  function dropRepeats(page, seen) {
    var isFresh = function (x) { return !seen.has(noBrackets(x)); };
    ['key_points', 'also', 'benefit', 'advanced'].forEach(function (f) {
      page[f] = (Array.isArray(page[f]) ? page[f] : page[f] ? [page[f]] : []).filter(isFresh);
    });
    if (page.flow && page.flow.steps) {
      page.flow.steps = page.flow.steps.filter(function (s) { return isFresh(String(s).split('\n')[0]); });
    }
    var kept = String(page.paragraph || '').split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter(isFresh);
    page.paragraph = kept.join(' ') || page.headline || '';
    (page.stories || []).forEach(function (s) {
      s.para = String(s.para || '').split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter(isFresh).join(' ');
    });
    return page;
  }

  /* ---------------------------------- newspaper PDFs, as sources.py read_pdfs */

  var MONTH_NUM = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function isoDate(y, m, d) {
    return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  }

  // The commonest date on the first pages, or one in the file name; '' when there is none.
  function pdfDate(name, text) {
    var t = text.slice(0, 6000).toLowerCase();
    var found = [];
    var m;
    var a = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(20\d\d)\b/g;
    while ((m = a.exec(t))) if (MONTH_NUM[m[2].slice(0, 3)]) found.push(isoDate(m[3], MONTH_NUM[m[2].slice(0, 3)], m[1]));
    var b = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b/g;
    while ((m = b.exec(t))) if (MONTH_NUM[m[1].slice(0, 3)]) found.push(isoDate(m[3], MONTH_NUM[m[1].slice(0, 3)], m[2]));
    var f = /(20\d\d)[-_.]?(\d\d)[-_.]?(\d\d)/.exec(name);
    if (f) found.push(isoDate(f[1], +f[2], +f[3]));
    var count = {};
    found.forEach(function (d) { count[d] = (count[d] || 0) + 1; });
    return Object.keys(count).sort(function (x, y) { return count[y] - count[x]; })[0] || '';
  }

  function guessPaper(name, text) {
    var low = (name + ' ' + text.slice(0, 3000)).toLowerCase();
    var names = [['hindu', 'The Hindu'], ['times of india', 'Times of India'], ['toi', 'Times of India'], ['acc', 'ACC Defence Academy'],
      ['express', 'Indian Express'], ['mint', 'Mint'], ['hindustan times', 'Hindustan Times'], ['business standard', 'Business Standard']];
    for (var i = 0; i < names.length; i++) if (low.indexOf(names[i][0]) >= 0) return names[i][1];
    return name.replace(/\.[^.]*$/, '');
  }

  // A short headline line and the paragraph text after it; pages are separated by \f.
  function pdfArticles(text, paper) {
    var items = [];
    text.split('\f').forEach(function (page, p) {
      page.split(/\n\s*\n/).forEach(function (block) {
        var lines = block.split('\n').map(function (l) { return l.replace(/\s{3,}/g, '  ').trim(); }).filter(Boolean);
        if (!lines.length) return;
        var body = lines.join(' ').replace(/-\s+(?=[a-z])/g, '');
        if (body.length < 160) return;
        var head = lines[0];
        if (head.length > 110 || head.length < 15) head = shortText(sentences(body)[0] || body, 100);
        items.push({ title: cleanHtml(head), summary: cleanHtml(body.slice(0, 1800)), source: paper, link: '', when: '', hint: '', kind: 'pdf',
          text: body.slice(0, 6000), page: p + 1 });
      });
    });
    return items;
  }

  // pdfs = [{ name, text }]. A paper of another date is left out rather than reported as today's news.
  function readPapers(pdfs, date, report) {
    var out = [];
    (pdfs || []).forEach(function (f) {
      var words = f.text.split(/\s+/).filter(Boolean).length;
      if (words < 60) {
        report.push(f.name + ': almost no text, it looks like a scanned PDF, so it was skipped.');
        return;
      }
      var d = pdfDate(f.name, f.text);
      if (d && d !== date) {
        report.push(f.name + ': dated ' + d + ', not today, so it was skipped.');
        return;
      }
      var items = pdfArticles(f.text, guessPaper(f.name, f.text));
      report.push(f.name + ': ' + items.length + ' story blocks read.');
      out = out.concat(items);
    });
    return out;
  }

  var VAGUE = /\b(significant|important|importance|crucial|key development|highlights?|underscores?|remains? to be seen|various|several aspects|in recent times|it is worth|plays? a (vital|key|major) role|stay tuned|more details|developing story|could have implications|far-reaching)\b/i;

  /* ---------------------------------------------- state page, as draft.py */

  var STATE_PAGE_STORIES = 13;
  var STATE_NOISE = /\b(murder|rape|stabbed|robbery|accident|actor|actress|movie|film|trailer|ott|web series|school holiday|admit card|recruitment|vacancy|exam date|rashifal|panchang)\b/i;

  function isStateStory(c, state) {
    if (SPORTS.test(c.title) || STATE_NOISE.test(c.title)) return false;
    return new RegExp('\\b' + escapeRe(state) + '\\b', 'i').test(c.title) ||
      (c.hint === state + ' News' && (c.summary || '').toLowerCase().indexOf(state.toLowerCase()) >= 0);
  }

  /* ---------------------------------------------- timeline, as timeline.py */

  var TL_GENERIC = new Set(('government minister ministers court supreme high state states centre chief prime president report reports news today ' +
    'year years day days week month first second last big major people world country countries national global plan plans talks meeting meet set ' +
    'make makes made move calls call seeks amid crore lakh billion million percent rise rises fall falls market markets stock stocks sensex nifty ends ' +
    'election elections party congress bjp modi trump pakistan china russia ukraine bangladesh nepal delhi approves approved announces announced ' +
    'launches launch launched scheme boost').split(' '));

  function tlKeys(title) {
    return new Set(tokens(title).filter(function (t) { return !TL_GENERIC.has(t) && !/^\d+$/.test(t); }));
  }

  function sameStory(a, b, common) {
    var ka = tlKeys(a);
    var kb = tlKeys(b);
    var shared = Array.from(ka).filter(function (w) { return kb.has(w); });
    var rare = shared.filter(function (w) { return !common.has(w); });
    return ((rare.length >= 2 && shared.length >= 2) || shared.length >= 4) && shared.length / Math.max(1, Math.min(ka.size, kb.size)) >= 0.5;
  }

  /* ------------------------------------------- edition-wide duplicate check */
  var NUM_WORDS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
  function stem(w) {
    if (NUM_WORDS[w]) return NUM_WORDS[w];
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  var HEAD_CACHE = {};
  function headKey(title) {
    var hit = HEAD_CACHE[title];
    if (hit) return hit;
    var t =stripSourceSuffix(String(title || '').replace(/^UPDATE:\s*/i, '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
    var list = (t.match(/[a-z0-9]+/g) || []).filter(function (w) { return !STOP[w] && (w.length > 2 || /^\d+$/.test(w)); }).map(stem);
    return (HEAD_CACHE[title] = { words: new Set(list), text: ' ' + list.join(' ') + ' ' });
  }
  function duplicateTitles(a, b) {
    var ka = headKey(a);
    var kb = headKey(b);
    if (!ka.words.size || !kb.words.size) return false;
    if ((ka.words.size >= 4 && kb.text.indexOf(ka.text) >= 0) || (kb.words.size >= 4 && ka.text.indexOf(kb.text) >= 0)) return true;
    var shared = Array.from(ka.words).filter(function (w) { return kb.words.has(w); });
    var jac = shared.length / (ka.words.size + kb.words.size - shared.length);
    if (jac >= 0.6) return true;
    var overlap = shared.length / Math.min(ka.words.size, kb.words.size);
    if (shared.length >= 4 && overlap >= 0.6) return true;
    var specific = shared.filter(function (w) { return !TL_GENERIC.has(w) && !TL_GENERIC.has(w + 's') && !/^\d+$/.test(w); });
    return shared.length >= 3 && specific.length >= 2 && shared.length / Math.min(ka.words.size, kb.words.size) >= 0.5;
  }
  // lists: arrays of stories in priority order; edited in place. Returns how many were dropped.
  function dedupStories(lists) {
    var kept = [];
    var dropped = 0;
    lists.forEach(function (b) {
      b.slice().forEach(function (c) {
        var titles = [c.title].concat((c.items || []).slice(0, 4).map(function (i) { return i.title; }));
        var same = kept.filter(function (k) {
          return k !== c && titles.some(function (t) { return k.titles.some(function (u) { return duplicateTitles(t, u); }); });
        })[0];
        if (!same) { c.titles = titles; kept.push(c); return; }
        b.splice(b.indexOf(c), 1);
        dropped++;
        same.sources = same.sources || [];
        (c.sources || []).forEach(function (s) { if (same.sources.indexOf(s) < 0) same.sources.push(s); });
        same.items = (same.items || []).concat(c.items || []);
        if ((c.text || '').length > (same.text || '').length) same.text = c.text;
        if ((c.summary || '').length > (same.summary || '').length) same.summary = c.summary;
        if (!same.link && c.link) same.link = c.link;
      });
    });
    kept.forEach(function (k) { delete k.titles; });
    return dropped;
  }

  function addToTimeline(threads, draft) {
    var date = draft.date;
    threads.forEach(function (t) { t.events = t.events.filter(function (e) { return e.date !== date; }); });
    threads = threads.filter(function (t) { return t.events.length; });
    var stories = [];
    draft.pages.forEach(function (p) {
      if (!(p.stories || []).length) return;
      var section = p.section || p.name.split(':')[0].replace(' (continued)', '');
      stories.push([section, p.headline, String(p.paragraph || '').slice(0, 500), p.stories[0].sources || [], p.stories[0].link || '']);
      p.stories.slice(1).forEach(function (s) { stories.push([section, stripSourceSuffix(s.title), '', s.sources || [], s.link || '']); });
    });
    var count = {};
    var all = [].concat.apply([], threads.map(function (t) { return t.events.map(function (e) { return e.headline; }); })).concat(stories.map(function (s) { return s[1]; }));
    all.forEach(function (h) { tlKeys(h).forEach(function (w) { count[w] = (count[w] || 0) + 1; }); });
    var common = new Set(Object.keys(count).filter(function (w) { return count[w] > Math.max(5, all.length * 0.005); }));
    stories.forEach(function (s) {
      var ev = { date: date, headline: s[1], text: s[2], sources: s[3], link: s[4] };
      var hit = null;
      for (var i = threads.length - 1; i >= 0 && !hit; i--) {
        var t = threads[i];
        var gap = Math.abs(Date.parse(t.events[t.events.length - 1].date) - Date.parse(date)) / 86400000;
        if (gap <= 21 && t.events.slice(-3).some(function (e) { return sameStory(s[1], e.headline, common); })) hit = t;
      }
      if (!hit) threads.push({ id: date + '-' + threads.length, section: s[0], title: s[1], events: [ev] });
      else if (!hit.events.some(function (e) { return e.date === date && sameStory(s[1], e.headline, common); })) hit.events.push(ev);
    });
    // Phone storage is small: a story silent for three months leaves the phone.
    return threads.filter(function (t) { return (Date.parse(date) - Date.parse(t.events[t.events.length - 1].date)) / 86400000 <= 90; });
  }

  function storyRef(c) {
    var plain = stripSourceSuffix(c.title);
    var noted = !c.text && /verify\)$/.test(c.summary || '');
    var keep = sentences((c.text || '') + ' ' + (c.summary || '')).filter(function (s) { return similarity(s, plain) < 0.85; });
    return { title: c.title, sources: c.sources, link: c.link || '', para: noted ? wholeSentences(c.summary, 800) : wholeSentences(keep.join(' '), 800), verify: c.sources.length < 2, kind: c.kind };
  }

  function confidence(lead) {
    var n = lead.sources.length;
    return n === 1 ? 'Low - single source, verify' : n === 2 ? 'Medium - 2 sources' : 'High - ' + n + ' sources';
  }

  function label(text, glossary) {
    text = text.replace(/#(\w+)/g, function (m, w) { return w.replace(/_/g, ' '); });
    if (/^[A-Za-z][^:]{1,27}:\s/.test(text)) return text;
    var hit = null;
    STATES.forEach(function (st) {
      var m = new RegExp('\\b' + escapeRe(st) + '\\b', 'i').exec(text);
      if (m && (!hit || m.index < hit[0])) hit = [m.index, st.replace(/\b\w/g, function (c) { return c.toUpperCase(); })];
    });
    PLACES.concat(Object.keys(glossary).filter(function (k) { return /[A-Z]/.test(k) && k.length <= 7; })).forEach(function (name) {
      var m = new RegExp('(?<![A-Za-z0-9])' + escapeRe(name) + '(?![A-Za-z0-9])').exec(text);
      if (m && (!hit || m.index < hit[0])) hit = [m.index, name];
    });
    return hit && hit[0] > 0 && hit[0] < 120 ? hit[1] + ': ' + text : text;
  }

  function sourcesOf(stories) {
    var order = [];
    stories.slice(0, 8).forEach(function (c) {
      (c.items || []).forEach(function (it) { if (order.indexOf(it.source) < 0) order.push(it.source); });
    });
    return order.slice(0, 8);
  }

  function advanced(fact, pageText, writer, usedWords) {
    var pts = fact ? [fact] : [];
    var low = pageText.toLowerCase();
    var keys = Object.keys(writer.hardwords);
    for (var i = 0; i < keys.length; i++) {
      var w = keys[i];
      if (!usedWords.has(w) && w.length > 5 && new RegExp('\\b' + escapeRe(w) + '\\b').test(low)) {
        pts.push(capitalize(w) + ' means ' + writer.hardwords[w] + '.');
        usedWords.add(w);
        break;
      }
    }
    return pts;
  }

  function snapshotPool(others) {
    var kp = CFG.layout.max_key_points;
    var snap = CFG.layout.max_snapshot_stories;
    var p = others.slice(kp, kp + snap + 3);
    return p.length >= 2 ? p : others.slice(0, snap);
  }

  function buildPage(n, sec, stories, writer, facts, usedFacts) {
    var lay = CFG.layout;
    var name = sec.name;
    var page = { n: n, name: name, locked: [], notes: [], stories: stories.slice(0, 12).map(storyRef) };
    if (!stories.length) {
      page.headline = 'No major story found for this section today';
      page.paragraph = 'The free sources checked today did not give a clear story for this section.';
      page.tiles = [];
      page.flow = { mode: 'snapshot', title: 'AT A GLANCE', steps: [] };
      page.key_points = [];
      page.full_forms = [];
      page.benefit_label = 'BENEFIT FOR INDIA';
      page.benefit = ['-'];
      page.advanced = [pickFact(facts, name, name, usedFacts)];
      page.also = [];
      page.sources = [];
      page.confidence = '-';
      return page;
    }
    var lead = stories[0];
    var others = stories.slice(1);
    var used = new Set();
    var headline = stripSourceSuffix(lead.title).replace('UPDATE: ', 'UPDATE - ');
    var raw = writer.paragraph(lead, others);
    var para = writer.annotate(raw, used);
    var pageText = [headline, raw].concat(others.slice(0, 8).map(function (o) { return o.title; })).join(' ');

    var tiles = keyFigures((lead.text || '') + ' ' + (lead.summary || '') + ' ' + lead.title, lay.max_tiles);
    if (tiles.length < 3) {
      var verified = stories.filter(function (c) { return c.sources.length > 1; }).length;
      var allSrc = {};
      stories.forEach(function (c) { c.sources.forEach(function (s) { allSrc[s] = 1; }); });
      tiles = tiles.concat([{ value: String(stories.length), label: 'stories today' },
        { value: String(Object.keys(allSrc).length), label: 'sources checked' },
        { value: String(verified), label: 'stories with 2+ sources' }].slice(0, lay.max_tiles - tiles.length));
    }

    var kps = others.slice(0, lay.max_key_points).map(function (c) {
      var s = sentences(c.summary || '');
      var txt = s.length && s[0].length < 230 ? s[0] : stripSourceSuffix(c.title);
      var mark = c.sources.length > 1 ? '' : '; verify';
      return label(writer.annotate(txt, used), writer.glossary) + ' (' + c.sources.slice(0, 2).join(', ') + mark + ')';
    });
    var ctx = snapshotPool(others).map(function (c) { return [c, writer.context(c)]; });
    var snap = ctx.filter(function (x) { return x[1]; }).concat(ctx.filter(function (x) { return !x[1]; })).slice(0, lay.max_snapshot_stories);
    var steps = snap.map(function (x) { return (stripSourceSuffix(x[0].title) + '\n' + x[1]).trim(); });
    var shown = new Set(snap.map(function (x) { return x[0]; }));
    var also = others.slice(lay.max_key_points).filter(function (c) { return !shown.has(c); }).map(function (c) {
      return label(stripSourceSuffix(c.title), writer.glossary) + (c.sources.length > 1 ? '' : ' (verify)');
    }).slice(0, lay.max_also);
    var ben = writer.benefit(name, stories, headline);
    var fact = pickFact(facts, name, pageText, usedFacts);
    usedFacts.add(fact);
    page.headline = headline;
    page.paragraph = para;
    page.tiles = tiles.slice(0, lay.max_tiles);
    page.flow = { mode: 'snapshot', title: 'OTHER STORIES AT A GLANCE', steps: steps };
    page.key_points = kps;
    page.full_forms = writer.fullFormsFor(pageText).slice(0, lay.max_full_forms);
    page.benefit_label = ben[0];
    page.benefit = ben[1];
    page.advanced = advanced(fact, pageText, writer, usedFacts);
    page.also = also;
    page.sources = sourcesOf(stories);
    page.confidence = confidence(lead);
    page.notes = page.notes.concat(disagreements(lead));
    if (lead.sources.length < 2) page.headline_verify = true;
    return page;
  }

  function buildWarPage(n, sec, war, why, stories, writer, facts, usedFacts, warLog) {
    var lay = CFG.layout;
    var used = new Set();
    var page = { n: n, name: sec.name + ': ' + (war.short || war.name), locked: [], notes: ['War chosen: ' + war.name + ' - ' + why],
      stories: stories.slice(0, 12).map(storyRef), war_name: war.name };
    var timeline = (war.timeline || []).slice();
    var latest = stories[0] || null;
    var room = 8 - (latest ? 1 : 0);
    var steps = timeline.length > room ? timeline.slice(-room) : timeline.slice();
    if (latest) steps.push('Now: ' + stripSourceSuffix(latest.title));
    var raw;
    var headline;
    if (latest) {
      raw = writer.paragraph(latest, stories.slice(1));
      headline = stripSourceSuffix(latest.title);
    } else {
      raw = 'No fresh ' + war.name + " story was found in today's free sources; the flowchart shows the background only.";
      headline = war.name;
    }
    var pageText = [headline, raw].concat(stories.slice(0, 8).map(function (c) { return c.title; })).concat(timeline).join(' ');
    var kps = stories.slice(1, lay.max_key_points + 1).map(function (c) {
      var mark = c.sources.length > 1 ? '' : '; verify';
      return label(writer.annotate(stripSourceSuffix(c.title), used), writer.glossary) + ' (' + c.sources.slice(0, 2).join(', ') + mark + ')';
    });
    var tiles = keyFigures(stories.slice(0, 3).map(function (c) { return c.text || c.summary || c.title; }).join(' '), lay.max_tiles);
    if (tiles.length < 3) {
      var allSrc = {};
      stories.forEach(function (c) { c.sources.forEach(function (s) { allSrc[s] = 1; }); });
      tiles = tiles.concat([{ value: String(stories.length), label: 'headlines today' },
        { value: String(Object.keys(allSrc).length), label: 'sources' },
        { value: timeline.length ? timeline[0].split(':')[0] : '-', label: 'first event' }].slice(0, lay.max_tiles - tiles.length));
    }
    var benefit = war.india || writer.benefit('WAR SECTION', stories, headline)[1];
    var warText = [war.name].concat(war.keywords || []).concat([headline]).join(' ');
    var fact = pickFact(facts, 'WAR SECTION', warText, usedFacts) || pickFact(facts, 'WAR SECTION', pageText, usedFacts);
    usedFacts.add(fact);
    var recent = Object.keys(warLog).sort().slice(-3).map(function (k) {
      var d = new Date(k + 'T00:00:00Z');
      return ('0' + d.getUTCDate()).slice(-2) + ' ' + MONTH_NAMES[d.getUTCMonth()].slice(0, 3) + ': ' + String(warLog[k]).split(' (')[0];
    });
    page.headline = headline;
    page.paragraph = writer.annotate(raw, used);
    page.tiles = tiles.slice(0, lay.max_tiles);
    page.flow = { mode: 'flow', title: 'HOW IT STARTED AND MAIN EVENTS', steps: steps };
    page.key_points = kps;
    page.full_forms = writer.fullFormsFor(pageText, war.full_forms || []).slice(0, lay.max_full_forms);
    page.benefit_label = 'WHY IT MATTERS FOR INDIA';
    page.benefit = benefit;
    page.advanced = advanced(fact, pageText, writer, usedFacts);
    page.also = stories.slice(lay.max_key_points + 1, lay.max_key_points + 3).map(function (c) {
      return label(stripSourceSuffix(c.title), writer.glossary) + (c.sources.length > 1 ? '' : ' (verify)');
    }).concat(recent.length ? ['Wars covered recently: ' + recent.join(', ')] : []);
    page.sources = sourcesOf(stories).concat(['Background timeline: built-in history notes (wars.json)']);
    page.confidence = latest ? confidence(latest) : 'Background only';
    if (latest) page.notes = page.notes.concat(disagreements(latest));
    return page;
  }

  /*
   * io = { fetchText(url, ms, init) -> Promise<string>, read(key, fallback), write(key, value) }
   * data = { glossary, hardwords, facts, wars }   (digest-tool/newsdigest/data/*.json)
   * progress(text, done, total) is optional.
   */
  function collect(io, data, opts) {
    opts = opts || {};
    var progress = opts.progress || function () {};
    var date = opts.date || todayIst();
    var state = opts.state || '';
    var wars = data.wars.wars || [];
    var writer = new Writer(data);
    var jobs = CFG.feeds.map(function (f) { return { url: f[1], name: f[0], hint: f[2] }; });
    CFG.sections.forEach(function (sec) {
      (sec.queries || []).forEach(function (q) { jobs.push({ gn: q, hint: sec.name }); });
    });
    wars.forEach(function (w) { jobs.push({ gn: w.query, hint: 'WAR SECTION' }); });
    if (state) {
      ['government OR "chief minister" OR cabinet', 'development OR scheme OR assembly OR "high court"'].forEach(function (q) {
        jobs.push({ gn: '"' + state + '" ' + q, hint: state + ' News' });
      });
    }

    if (opts.noWeb) jobs = [];
    var paperReport = [];
    var paperItems = readPapers(opts.pdfs, date, paperReport);
    progress('Fetching free news feeds', 0, jobs.length);
    return pool(jobs, 8, function (j) {
      return j.gn ? googleNews(io, j.gn, date, j.hint) : fetchFeed(io, j.url, j.name, j.hint, date);
    }, function (d, t) { progress('Fetching free news feeds', d, t); }).then(function (results) {
      var webItems = paperItems.concat([].concat.apply([], results.map(function (r) { return r || []; })));
      if (!webItems.length) throw new Error('no-news');

      var history = io.read('ssb-digest-history', {});
      var oldLines = [];
      var oldAdvanced = [];
      var oldTitles = [];
      Object.keys(history).forEach(function (k) {
        if (k >= addDays(date, -REPEAT_DAYS) && k < date) {
          oldLines = oldLines.concat(history[k].lines || history[k].titles || []);
          oldAdvanced = oldAdvanced.concat(history[k].advanced || []);
          oldTitles = oldTitles.concat(history[k].titles || []);
        }
      });
      var seen = new Seen(Array.from(new Set(oldLines)));
      var all = [];
      var repeats = 0;
      webItems.forEach(function (it) {
        if (JUNK.test(it.title)) return;
        var st = seen.storyState(it.title);
        if (st === 'same') { repeats++; return; }
        if (st === 'update') it.title = 'UPDATE: ' + it.title;
        all.push(it);
      });

      progress('Merging ' + all.length + ' headlines into stories');
      var clusters = cluster(all);

      var warLog = io.read('ssb-digest-warlog', Object.assign({}, data.wars.log || {}));
      var chosen = chooseWar(wars, warLog, date, all);
      var w = chosen[0];
      var why = chosen[1];
      var warClusters = clusters.filter(function (c) {
        var t = c.title.toLowerCase();
        return w.keywords.some(function (k) { return t.indexOf(k) >= 0; });
      });
      warClusters.sort(function (a, b) { return b.sources.length - a.sources.length; });
      var warTop = new Set(warClusters.slice(0, 8));

      var sections = CFG.sections.filter(function (s) { return !s.war; });
      var buckets = {};
      var stateStories = [];
      sections.forEach(function (s) { buckets[s.name] = []; });
      clusters.forEach(function (c) {
        if (warTop.has(c) || (c.hint === 'WAR SECTION' && warClusters.indexOf(c) >= 0)) return;
        if (state && isStateStory(c, state)) { stateStories.push(c); return; }
        var b = best(sections, c);
        if (b[1] <= 0) return;
        c.score = b[1];
        buckets[b[0].name].push(c);
      });
      var rank = function (c) {
        return c.score * 2 + Math.min(c.sources.length, 6) * 2 + (c.kind === 'pdf' ? 4 : 0) + (c.summary ? 1 : 0);
      };
      Object.keys(buckets).forEach(function (k) { buckets[k].sort(function (a, b) { return rank(b) - rank(a); }); });

      // Full text for the lead stories and the story cards (free; skipped if blocked).
      var kp = CFG.layout.max_key_points;
      var snapN = CFG.layout.max_snapshot_stories;
      var todo = [];
      Object.keys(buckets).map(function (k) { return buckets[k]; }).concat([warClusters, stateStories]).forEach(function (b) {
        b.slice(0, STATE_PAGE_STORIES).forEach(function (c) {
          if (!c.text && todo.indexOf(c) < 0) todo.push(c);
        });
      });
      return pool(todo, 10, function (c) {
        var links = [c.link].concat(c.items.map(function (i) { return i.link; })).filter(Boolean)
          .filter(function (l, i, a) { return a.indexOf(l) === i; }).slice(0, 3);
        var tryNext = function (i) {
          if (i >= links.length) return '';
          return articleText(io, links[i]).then(function (txt) { return txt.length > 300 ? txt : tryNext(i + 1); });
        };
        return tryNext(0).then(function (txt) { if (txt) c.text = txt.slice(0, 6000); return txt; });
      }, function (d, t) { progress('Downloading full articles', d, t); }).then(function () {
        // As step 6a in draft.py: one event in several outlets' words is printed once.
        var mergeEvents = function () {
          var lists = Object.keys(buckets).map(function (k) { return buckets[k]; }).concat([warClusters, stateStories]);
          // "common" depends on the corpus, as in draft.py: today's headlines within today, two weeks against the past
          var commonOf = function (all) {
            var count = {};
            all.forEach(function (h) { tlKeys(h).forEach(function (w) { count[w] = (count[w] || 0) + 1; }); });
            return new Set(Object.keys(count).filter(function (w) { return count[w] > Math.max(5, all.length * 0.005); }));
          };
          var today = [].concat.apply([], lists.map(function (b) { return b.map(function (c) { return c.title; }); }));
          var commonToday = commonOf(today);
          var commonPast = commonOf(today.concat(oldTitles));
          var common = commonToday;
          var sameEvent = function (a, b) {
            if (!sameStory(a.title, b.title, common)) return false;
            var ka = tlKeys(a.title);
            var rare = Array.from(tlKeys(b.title)).filter(function (w) { return ka.has(w) && !common.has(w); });
            if (rare.length >= 2) return true;
            var ta = a.text || a.summary || '';
            var tb = b.text || b.summary || '';
            return !!(ta && tb) && similarity(a.title + ' ' + ta.slice(0, 400), b.title + ' ' + tb.slice(0, 400)) >= 0.4;
          };
          var told = oldTitles.map(function (t) { return { title: t, text: '' }; });
          var toldFigs = new Set(figuresIn(oldLines.join(' ')));
          var kept = [];
          lists.forEach(function (b) {
            b.slice().forEach(function (c) {
              var war = warClusters.indexOf(c) >= 0;
              var fresh = figuresIn(c.title).some(function (n) { return !toldFigs.has(n); });
              common = commonPast;
              var retold = !war && !fresh && told.some(function (o) { return sameEvent(c, o); });
              common = commonToday;
              if (retold) {
                b.splice(b.indexOf(c), 1);
                return;
              }
              var same = kept.filter(function (k) { return k !== c && k.group.some(function (g) { return sameEvent(c, g); }); })[0];
              if (!same) { c.group = [c]; kept.push(c); return; }
              if (war && b !== warClusters) return;
              b.splice(b.indexOf(c), 1);
              same.group.push(c);
              c.sources.forEach(function (s) { if (same.sources.indexOf(s) < 0) same.sources.push(s); });
              same.items = same.items.concat(c.items);
              if (!same.text && c.text) same.text = c.text;
            });
          });
        };
        mergeEvents();
        // One more pass over the whole edition: the same story is printed once, war page first, then state page, then topics.
        var dd = dedupStories([warClusters, stateStories].concat(Object.keys(buckets).map(function (k) { return buckets[k]; })));
        if (dd) progress('Removed ' + dd + ' repeated stories');

        // As explain_headlines in writer.py: only stories with no word of their own, marked, no new figures.
        var bare = [];
        Object.keys(buckets).map(function (k) { return buckets[k]; }).concat([warClusters, stateStories]).forEach(function (b) {
          b.slice(0, STATE_PAGE_STORIES).forEach(function (c) { if (!c.text && !c.summary && bare.indexOf(c) < 0) bare.push(c); });
        });
        if (!opts.ask || !bare.length) return null;
        progress('Explaining ' + bare.length + ' headlines with AI');
        var batches = [];
        for (var i = 0; i < bare.length; i += 10) batches.push(bare.slice(i, i + 10));
        return batches.reduce(function (chain, batch) {
          return chain.then(function () {
            var facts = batch.map(function (c) { return [c.title].concat(c.items.slice(1, 4).map(function (it) { return it.title; })).join(' | '); });
            return opts.ask('You explain news headlines for an Indian defence exam student. For each numbered story, write 2 short sentences in simple English saying what it is about and why it matters, using ONLY the headline and the related headlines given. Do not add any number, date, name or fact that is not in them. Be concrete: say who did what. If the headlines do not say enough for that, write SKIP for that number. Answer with lines like 1: text' + '\n' + facts.map(function (f, n) { return (n + 1) + ': ' + f; }).join('\n')).then(function (out) {
              String(out || '').split('\n').forEach(function (line) {
                var m = /^\s*[-*#]*\s*(\d+)\s*:\s*(.+)$/.exec(line);
                if (!m || +m[1] < 1 || +m[1] > batch.length) return;
                var have = facts[+m[1] - 1].replace(/,/g, '');
                var own = new Set(tokens(facts[+m[1] - 1]));
                var kept = sentences(m[2]).filter(function (s) {
                  // as explain_headlines: grounded in these headlines, no invented figure, no filler
                  return (s.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).every(function (n) { return have.indexOf(n) >= 0; }) &&
                    !VAGUE.test(s) && tokens(s).filter(function (w) { return own.has(w); }).length >= 2;
                });
                if (kept.length) batch[+m[1] - 1].summary = kept.join(' ') + ' (AI summary from the headlines, verify)';
              });
            }, function () {});
          });
        }, Promise.resolve()).then(mergeEvents); // stories that only now have a note can be matched by it
      }).then(function () {
        clusters.forEach(function (c) { writer.learnFullForms([c.title, c.summary || '', c.text || ''].join(' ')); });
        var usedFacts = new Set(oldAdvanced);
        var pages = CFG.sections.map(function (sec, i) {
          progress('Writing page ' + (i + 1) + ': ' + sec.name, i + 1, CFG.sections.length);
          return sec.war
            ? buildWarPage(i + 1, sec, w, why, warClusters, writer, data.facts, usedFacts, warLog)
            : buildPage(i + 1, sec, buckets[sec.name], writer, data.facts, usedFacts);
        });
        if (state) {
          stateStories.sort(function (a, b) { return b.sources.length - a.sources.length; });
          [stateStories.slice(0, STATE_PAGE_STORIES), stateStories.slice(STATE_PAGE_STORIES, 2 * STATE_PAGE_STORIES)].forEach(function (part, k) {
            if (!part.length && k) return;
            var pg = buildPage(pages.length + 1, { name: state + ' News' + (k ? ' (continued)' : '') }, part, writer, data.facts, usedFacts);
            pg.section = state + ' News';
            pages.push(pg);
          });
        }
        pages.forEach(function (p) {
          if ((p.stories || []).length) {
            var text = [p.headline, p.paragraph].concat(p.stories.slice(0, 13).map(function (s) { return s.title; })).join(' ');
            p.full_forms = writer.fullFormsFor(text, (p.full_forms || []).map(function (f) { return f.abbr; })).slice(0, CFG.layout.max_full_forms);
          }
          dropRepeats(p, seen);
        });
        return {
          state: state, papers: paperReport,
          date: date, day: niceDate(date), title: CFG.title, war: { name: w.name, why: why },
          headlines: webItems.length, stories: clusters.length, repeats: repeats, articles: todo.filter(function (c) { return c.text; }).length,
          unknown_abbreviations: Object.keys(writer.unknown).sort().slice(0, 40), llm_used: false, pages: pages
        };
      });
    });
  }

  // cli.py record_history: remember today's headlines and war so the next editions skip repeats.
  function record(io, draft) {
    var history = io.read('ssb-digest-history', {});
    history[draft.date] = {
      titles: draft.pages.map(function (p) { return p.headline; })
        .concat([].concat.apply([], draft.pages.map(function (p) { return (p.stories || []).slice(0, 6).map(function (s) { return s.title; }); }))),
      lines: [].concat.apply([], draft.pages.map(pageLines)),
      advanced: [].concat.apply([], draft.pages.map(function (p) { return p.advanced || []; })),
      war: draft.war.name
    };
    // Only the repeat window matters; older days are dropped so storage stays small.
    Object.keys(history).forEach(function (k) { if (k < addDays(draft.date, -REPEAT_DAYS)) delete history[k]; });
    io.write('ssb-digest-history', history);
    var log = io.read('ssb-digest-warlog', {});
    log[draft.date] = draft.war.name;
    io.write('ssb-digest-warlog', log);
    io.write('ssb-timeline', addToTimeline(io.read('ssb-timeline', []), draft));
  }

  root.SSB.edition = { articleText: articleText, readPapers: readPapers, pdfDate: pdfDate, Seen: Seen, dropRepeats: dropRepeats, addToTimeline: addToTimeline, sameStory: sameStory, dedupStories: dedupStories, duplicateTitles: duplicateTitles, Writer: Writer, collect: collect, record: record, today: todayIst, sentences: sentences, keyFigures: keyFigures };
})();
