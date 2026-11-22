/*
 * Newspaper analyser: one engine for the PC and the phone (no network, no AI).
 *
 * A newspaper PDF the person picks is read on the device with pdf.js, cut into
 * articles from the page layout (big type = headline; the text below it in the
 * same columns = its body), sorted into SSB-relevant sections with keyword
 * lists, ranked, and summarised extractively (TextRank picks real sentences).
 * Micro-notes, thinking prompts, a 30-minute reading plan and the "Line"
 * (earlier related stories) are built from the same text. The most important
 * stories are also cut out of the page as pictures, with the lines the notes
 * came from marked on them. Papers are kept in IndexedDB on the device; the
 * PDF itself is never stored or sent.
 *
 * window.SSBPaper = { analyze, plan, related, db, SECTIONS }
 */
(function () {
  'use strict';

  var MAX_PAGES = 48;
  var MAX_CUTS = 60; // stories cut out as pictures, most important first
  var CUT_SCALE = 2; // pixels per PDF point: a one-column story stays sharp on a phone
  var CUT_QUALITY = 0.6;
  var KEEP_CUTS = 5; // newest papers that keep their pictures; older ones keep text only

  // Each section has strong words (enough on their own), weak words (only add
  // weight) and abbreviations matched in capitals, so "SC" is the court and
  // not the letters inside a word. A story joins a section only on strong
  // evidence: a strong word in the headline, or two in the text.
  var SECTIONS = [
    { key: 'policy', label: 'Government Policies', weight: 18,
      strong: ['scheme', 'policy', 'cabinet', 'bill', 'ordinance', 'notification', 'notified', 'amendment', 'reform', 'reforms', 'guidelines', 'regulation', 'regulator', 'niti aayog', 'yojana', 'union government', 'central government', 'ministry', 'new rules', 'legislation', 'census', 'governance', 'welfare', 'subsidy'],
      weak: ['mission', 'launched', 'approved', 'rules', 'act', 'chief minister', 'centre', 'panel', 'committee', 'minister', 'govt', 'law'],
      abbr: ['NEET', 'UGC'] },
    { key: 'polity', label: 'Courts & Polity', weight: 14,
      strong: ['supreme court', 'high court', 'top court', 'apex court', 'constitution', 'constitutional', 'fundamental right', 'fundamental rights', 'right to privacy', 'election commission', 'electoral rolls', 'delimitation', 'judiciary', 'contempt', 'parliament', 'lok sabha', 'rajya sabha', 'federalism', 'governor', 'special intensive revision', 'model code of conduct', 'anti-defection'],
      weak: ['court', 'judge', 'verdict', 'bench', 'petition', 'plea', 'hearing', 'rights', 'polls', 'election', 'voters', 'opposition'],
      abbr: ['SC', 'HC', 'EC', 'ECI', 'CJI', 'PIL', 'SIR', 'CAG'] },
    { key: 'natsec', label: 'National Security', weight: 22,
      strong: ['terror', 'terrorist', 'terrorists', 'terrorism', 'militant', 'militants', 'militancy', 'insurgency', 'insurgent', 'insurgents', 'naxal', 'naxals', 'naxalism', 'maoist', 'maoists', 'left-wing extremism', 'extremist', 'extremists', 'infiltration', 'ied', 'security forces', 'internal security', 'afspa', 'radicalisation', 'espionage', 'cyber attack', 'cyberattack', 'anti-terror', 'counter-terror', 'security agencies', 'national security', 'paramilitary', 'jihadi', 'narco-terror'],
      weak: ['encounter', 'blast', 'drugs', 'smuggling', 'intelligence', 'manipur', 'jammu and kashmir', 'kashmir', 'security', 'cyber', 'bomb'],
      abbr: ['NIA', 'CRPF', 'BSF', 'ITBP', 'CISF', 'NSG', 'UAPA', 'J&K', 'LWE', 'NSA'] },
    { key: 'border', label: 'Border & Tensions', weight: 22,
      strong: ['line of control', 'line of actual control', 'ceasefire violation', 'standoff', 'disengagement', 'incursion', 'intrusion', 'cross-border', 'pakistan army', 'galwan', 'doklam', 'border dispute', 'border security', 'international border', 'border villages', 'vibrant villages', 'border infrastructure', 'border roads', 'buffer zone', 'transgression', 'border tension', 'border tensions', 'border talks', 'border areas', 'border guarding'],
      weak: ['border', 'ceasefire', 'ladakh', 'arunachal', 'sikkim', 'shelling', 'firing', 'patrolling', 'chinese army', 'pakistan'],
      abbr: ['LAC', 'LoC', 'PLA', 'BRO', 'BGB'] },
    { key: 'defence', label: 'Defence Developments', weight: 22,
      strong: ['army', 'navy', 'air force', 'indian army', 'indian navy', 'missile', 'missiles', 'brahmos', 'agni', 'tejas', 'rafale', 'submarine', 'submarines', 'warship', 'warships', 'frigate', 'destroyer', 'aircraft carrier', 'fighter jet', 'fighter jets', 'defence ministry', 'defence minister', 'ministry of defence', 'defence forces', 'armed forces', 'defence production', 'defence exports', 'defence procurement', 'defence deal', 'defence pact', 'defence cooperation', 'defence technology', 'defence budget', 'defence corridor', 'defence secretary', 'air defence', 'chief of defence staff', 'theatre command', 'theatre commands', 'military', 'agniveer', 'agniveers', 'agnipath', 'commissioned', 'inducted', 'induction', 'military exercise', 'joint exercise', 'war games', 'artillery', 'howitzer', 'soldier', 'soldiers', 'jawan', 'jawans', 'veterans', 'ex-servicemen', 'one rank one pension'],
      weak: ['drone', 'drones', 'exercise', 'fighter', 'defence', 'aircraft', 'warfare', 'weapons', 'ammunition', 'regiment', 'battalion', 'helicopter', 'helicopters', 'troops', 'combat'],
      abbr: ['DRDO', 'IAF', 'HAL', 'CDS', 'BEL', 'OROP', 'DAC'] },
    { key: 'intsec', label: 'International Security', weight: 18,
      strong: ['airstrike', 'airstrikes', 'air strike', 'air strikes', 'nuclear weapons', 'nuclear', 'hostage', 'hostages', 'hamas', 'hezbollah', 'houthi', 'houthis', 'nato', 'ukraine', 'russia', 'russian', 'israel', 'israeli', 'gaza', 'iran', 'iranian', 'strait of hormuz', 'red sea', 'south china sea', 'taiwan', 'north korea', 'sanctions', 'invasion', 'coup', 'missile strike', 'drone strike', 'drone attack', 'drone attacks', 'warplanes', 'bombing', 'civil war', 'junta', 'isis', 'al-qaeda', 'taliban', 'proxy war'],
      weak: ['war', 'conflict', 'troops', 'attack', 'attacks', 'strikes', 'killed', 'peace talks', 'militia', 'ceasefire'],
      abbr: ['IAEA', 'ISIS', 'IDF', 'NATO'] },
    { key: 'ir', label: 'IR & World Strategy', weight: 18,
      strong: ['bilateral', 'summit', 'external affairs', 'foreign minister', 'foreign secretary', 'foreign ministry', 'foreign policy', 'jaishankar', 'diplomatic', 'diplomacy', 'diplomat', 'diplomats', 'ambassador', 'high commission', 'high commissioner', 'united nations', 'security council', 'g20', 'g7', 'brics', 'quad', 'asean', 'bimstec', 'imec', 'treaty', 'strategic partnership', 'indo-pacific', 'trade deal', 'free trade agreement', 'memorandum of understanding', 'state visit', 'bilateral talks', 'joint statement', 'multilateral', 'geopolitical', 'geopolitics', 'world bank', 'global south', 'white house', 'kremlin', 'pentagon', 'trade talks', 'tariffs'],
      weak: ['agreement', 'visit', 'talks', 'pact', 'foreign', 'envoy', 'mediation', 'deal', 'president', 'prime minister', 'trump', 'putin', 'beijing', 'washington', 'visa'],
      abbr: ['MEA', 'UN', 'UNSC', 'UNGA', 'SCO', 'EU', 'WTO', 'IMF', 'FTA', 'SAARC', 'QUAD', 'ASEAN', 'BRICS', 'MoU'] },
    { key: 'economy', label: 'Economy', weight: 12,
      strong: ['repo rate', 'inflation', 'gdp', 'economy', 'economic', 'fiscal', 'deficit', 'budget', 'gst', 'tariff', 'exports', 'imports', 'investment', 'fdi', 'rupee', 'sensex', 'nifty', 'reserve bank', 'monetary policy', 'unemployment', 'manufacturing', 'disinvestment', 'monetisation', 'crude', 'oil prices', 'stock market', 'ipo', 'revenue', 'tax', 'taxes', 'current account', 'forex', 'trade deficit', 'capex', 'msme', 'msmes', 'banking', 'loans', 'credit'],
      weak: ['growth', 'trade', 'market', 'markets', 'bank', 'banks', 'crore', 'billion', 'jobs', 'prices', 'shares', 'investors', 'company', 'firms', 'industry', 'sales'],
      abbr: ['RBI', 'SEBI', 'Sebi', 'GDP', 'GST', 'FDI', 'FPI', 'FPIs', 'UPI', 'MSME', 'PSU', 'PSUs', 'LTCG', 'IPO', 'NPA', 'CPI', 'WPI', 'PLI'] }
  ];
  var SEC = {};
  SECTIONS.forEach(function (s) { SEC[s.key] = s; });
  var EDITORIAL = { key: 'editorial', label: 'Editorial & Opinion', weight: 20 };
  var OTHER = { key: 'other', label: 'Other News', weight: 0 };

  // A headline about a festival, a match or a film is not a security story,
  // whatever word it uses ("drone show", "defence of a cricket title").
  var SOFT_RE = /\b(diwali|deepavali|festival|festive|celebrat\w*|cricket|odi|t20|ipl|match|film|movie|actor|actress|bollywood|wedding|recipe|fashion|show|concert|traffic|temple|puja|pooja|bhajan|fireworks?|crackers|music|song|dance|fans?|tourists?|tourism)\b/i;
  var SOFTENED = { natsec: 1, border: 1, defence: 1, intsec: 1 };

  // Labels papers print at the top of a page ("TIMES NATION", "OPINION").
  // Checked in this order; the first that fits names the page.
  var LABELS = [
    ['edit', /\b(editorial|edit page|opinion|op-?ed|views|comment|ideas|contrapunto|perspective|leader)\b/i],
    ['world', /\b(global|world|international|foreign|abroad)\b/i],
    ['business', /\b(business|economy|markets?|money|finance|biz)\b/i],
    ['sport', /\b(sports?|cricket|football)\b/i],
    ['nation', /\b(nation|national|india)\b/i],
    ['soft', /\b(entertainment|lifestyle|festive|fiesta|special|back beat|wellness|fashion|travel|food|talking about|life|supplement|weekend)\b/i],
    ['city', /\b(city|metro|delhi|mumbai|kolkata|chennai|bengaluru|hyderabad|region|regional|state|states|uttarakhand|local)\b/i]
  ];

  // Adverts and notices: tenders, jobs, missing-person appeals, shop offers.
  var AD_HEAD = /^(appeal for identification|search for missing|missing|public notice|notice|e-?tender|tenders?|corrigendum|change of name|recruitment|admissions?|walk-?in|obituary|in memoriam|wanted|vacanc(y|ies)|for sale|e-?auction|auction|classifieds?)\b|\b(required|wanted|vacanc(y|ies)|tender)$|https?:|www\.|\.(com|in|org)\b|tender id/i;
  var AD_CUES = [/\btenders?\b/i, /\be-?tender/i, /\bbid(s|der|ders|ding)?\b/i, /\bcorrigendum\b/i, /\badvt\b/i, /\bapply (online|now|before)\b/i, /\blast date\b/i, /\bwalk-?in\b/i, /\bvacanc(y|ies)\b/i, /\brecruitment\b/i, /\beligib(le|ility)\b/i, /\badmissions? open\b/i, /\bcall (now|us|on)\b/i, /\bwhats ?app\b/i, /\btoll[- ]free\b/i, /\bhelpline\b/i, /\bterms (and|&) conditions\b/i, /\bpvt\.? ltd\b/i, /\bshowroom\b/i, /\bemi\b/i, /\bdiscount\b/i, /\bwww\./i, /https?:\/\//i, /[\w.-]+@[\w-]+\.[a-z]{2,}/i, /\b(ph|mob|mobile|tel|contact)\s*(no\.?)?\s*[:.]/i, /\b[6-9]\d{9}\b/, /\b0\d{2,4}[\s-]\d{6,8}\b/, /\bnotice inviting\b/i, /\be-?auction\b/i, /\bsd\/-/i, /\bnit no\b/i];

  var COUNTRIES = ['India', 'China', 'Pakistan', 'United States', 'US', 'USA', 'Russia', 'Ukraine', 'Israel', 'Iran', 'Bangladesh', 'Nepal', 'Bhutan', 'Sri Lanka', 'Maldives', 'Myanmar', 'Afghanistan', 'Japan', 'Australia', 'France', 'Germany', 'UK', 'Britain', 'Saudi Arabia', 'UAE', 'Qatar', 'Turkey', 'Taiwan', 'North Korea', 'South Korea', 'Vietnam', 'Philippines', 'Indonesia', 'Canada', 'Egypt', 'Syria', 'Iraq', 'Yemen', 'Sudan', 'European Union', 'EU', 'Gaza', 'Palestine', 'Mauritius', 'Seychelles'];
  var COUNTRY_ALIAS = { US: 'United States', USA: 'United States', Britain: 'UK', EU: 'European Union', Palestine: 'Gaza / Palestine', Gaza: 'Gaza / Palestine' };

  var STOP = {};
  ('a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their we our you your i not no yes do does did done has have had will would shall should can could may might must also than too very just more most such into over after before about against between through during under above up down out off again further once here there when where why how all any both each few other some own same only per said says say new one two three four five first last year years day days time government minister officials official people state states country countries india indian sources told according week month today yesterday tomorrow mr ms dr').split(' ').forEach(function (w) { STOP[w] = 1; });

  /* --------------------------------------------------------------- text utils */

  function r1(n) { return Math.round(n * 10) / 10; }

  function words(text) {
    return (String(text).toLowerCase().match(/[a-z][a-z'\-]{1,}/g) || []);
  }

  function sig(text) {
    return words(text).filter(function (w) { return w.length > 2 && !STOP[w]; });
  }

  function hasPhrase(lower, phrase) {
    return countPhrase(lower, phrase, 1) > 0;
  }

  function countPhrase(lower, phrase, max) {
    var n = 0;
    var cap = max || 20;
    var i = lower.indexOf(phrase);
    while (i >= 0 && n < cap) {
      var before = i === 0 ? ' ' : lower.charAt(i - 1);
      var after = lower.charAt(i + phrase.length) || ' ';
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) n++;
      i = lower.indexOf(phrase, i + 1);
    }
    return n;
  }

  var ABBR_RE = {};
  function abbrCount(text, abbr, max) {
    var re = ABBR_RE[abbr] || (ABBR_RE[abbr] = new RegExp('(^|[^A-Za-z0-9])' + abbr.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '(?![A-Za-z0-9])', 'g'));
    re.lastIndex = 0;
    var n = 0;
    while (n < max && re.exec(text)) n++;
    return n;
  }

  function sentences(text) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    if (!t) return [];
    // Protect common abbreviations so they do not end a sentence.
    t = t.replace(/\b(Mr|Mrs|Ms|Dr|Lt|Gen|Col|Maj|Capt|Brig|Adm|Rs|No|St|Jr|Sr|vs|etc|i\.e|e\.g|U\.S|U\.K)\./g, '$1§');
    var out = t.split(/(?<=[.?!])\s+(?=["'‘“(]?[A-Z0-9])/).map(function (s) { return s.replace(/§/g, '.').trim(); });
    // Papers repeat lines (pull-quotes, a story continued on another page): keep each sentence once.
    var seen = {};
    return out.filter(function (s) {
      var k = s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (s.length <= 25 || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  /* ------------------------------------------------------------ PDF reading */

  function readPages(lib, buf, onProgress) {
    return lib.getDocument({ data: buf, isEvalSupported: false }).promise.then(function (doc) {
      var pages = [];
      var total = Math.min(doc.numPages, MAX_PAGES);
      var next = function (n) {
        if (n > total) return { pages: pages, numPages: doc.numPages, doc: doc };
        if (onProgress) onProgress(n, total, 'read');
        return doc.getPage(n).then(function (p) {
          var vp = p.getViewport({ scale: 1 });
          return p.getTextContent().then(function (tc) {
            var items = [];
            tc.items.forEach(function (it) {
              if (!it.str) return;
              // A space the PDF sets as its own piece still separates two words.
              if (!it.str.trim()) {
                var prev = items[items.length - 1];
                if (prev && Math.abs(prev.y - it.transform[5]) < prev.h * 0.3 && !/\s$/.test(prev.str)) prev.str += ' ';
                return;
              }
              var h = Math.abs(it.transform[3]) || it.height || 0;
              if (!h) return;
              items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || it.str.length * h * 0.5, h: h });
            });
            pages.push({ n: n, width: vp.width, height: vp.height, items: items });
            p.cleanup();
            return next(n + 1);
          });
        });
      };
      return next(1);
    });
  }

  // Text runs on one baseline, split where a wide gap means another column.
  function pageLines(page) {
    var items = page.items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    items.forEach(function (it) {
      var line = null;
      for (var i = lines.length - 1; i >= 0 && i >= lines.length - 40; i--) {
        var L = lines[i];
        // Same baseline, same type size, and no column gutter in between.
        var hMax = Math.max(L.h, it.h);
        if (Math.abs(L.y - it.y) <= hMax * 0.35 && Math.abs(L.h - it.h) <= hMax * 0.12 &&
            it.x >= L.x1 - it.h * 0.5 && it.x - L.x1 <= Math.max(hMax * 0.6, 4)) {
          line = L;
          break;
        }
      }
      if (line) {
        var gap = it.x - line.x1;
        line.text += (gap > it.h * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
        line.x1 = Math.max(line.x1, it.x + it.w);
        line.h = Math.max(line.h, it.h);
        line.chars += it.str.length;
      } else {
        lines.push({ text: it.str, x0: it.x, x1: it.x + it.w, y: it.y, h: it.h, chars: it.str.length });
      }
    });
    return lines.filter(function (l) { return l.text.trim(); });
  }

  // Justified text spreads its words, so one printed line can come out as
  // pieces ("nal" … "Medical" … "Commission") with gaps nearly as wide as the
  // gutter between columns. Pieces on one baseline are joined again as long as
  // the joined line is no wider than one column of this page (the commonest
  // width of a full body line), so two columns are never joined.
  function joinPieces(lines, body) {
    var widths = {};
    lines.forEach(function (l) {
      if (Math.abs(l.h - body) > body * 0.2 || l.chars < 18) return;
      var k = Math.round((l.x1 - l.x0) / 2);
      widths[k] = (widths[k] || 0) + 1;
    });
    var best = null;
    Object.keys(widths).forEach(function (k) { if (best === null || widths[k] > widths[best]) best = k; });
    if (best === null) return lines;
    var colW = best * 2 + 3;
    var out = [];
    lines.slice().sort(function (a, b) { return b.y - a.y || a.x0 - b.x0; }).forEach(function (l) {
      if (Math.abs(l.h - body) <= body * 0.25) {
        for (var i = out.length - 1; i >= 0 && i >= out.length - 12; i--) {
          var A = out[i];
          if (Math.abs(A.y - l.y) > l.h * 0.3 || Math.abs(A.h - l.h) > l.h * 0.06) continue;
          var gap = l.x0 - A.x1;
          if (gap < -1 || gap > l.h * 1.6 || l.x1 - A.x0 > colW) continue;
          A.text = A.text.replace(/\s+$/, '') + ' ' + l.text.replace(/^\s+/, '');
          A.x1 = l.x1;
          A.chars += l.chars;
          return;
        }
      }
      out.push(l);
    });
    return out;
  }

  // The type size of a story's text: the first full lines of the leftmost
  // column under its headline (a story starts there; a boxed panel beside it,
  // or a short byline, does not decide it).
  function headStyle(h, lines, body) {
    var near = lines.filter(function (l) {
      if (l.y >= h.yLast || l.y < h.yLast - body * 14 || l.h >= h.h * 0.8 || l.chars < 20) return false;
      return Math.min(h.x1, l.x1) - Math.max(h.x0, l.x0) >= (l.x1 - l.x0) * 0.5;
    });
    if (!near.length) return 0;
    var minX = Math.min.apply(null, near.map(function (l) { return l.x0; }));
    var below = near.filter(function (l) { return l.x0 <= minX + body * 1.8; })
      .sort(function (a, b) { return b.y - a.y; }).slice(0, 5);
    var count = {};
    below.forEach(function (l) { var k = r1(l.h); count[k] = (count[k] || 0) + 1; });
    var best = null;
    Object.keys(count).forEach(function (k) { if (best === null || count[k] > count[best]) best = k; });
    return best === null ? 0 : +best;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }

  /* ------------------------------------------------------- what kind of page */

  // The page label at the top ("TIMES NATION", "OPINION") and the masthead
  // ("Estd. 1838 | VOL. 77 NO. 263") that only a front page carries.
  function pageKind(p, body) {
    var text = p.lines.map(function (l) { return l.text; }).join(' ');
    var masthead = /\bestd\.?\s*1[6-9]\d\d\b|\bvol\.?\s*\d+\s*,?\s*no\.?\s*\d+|\bRNI\s*(no|reg)/i.test(text);
    var cands = p.lines.filter(function (l) {
      if (l.y < p.height * 0.9 || l.h < body * 1.4) return false;
      var t = l.text.trim();
      if (/^([A-Za-z]\s)+[A-Za-z]$/.test(t)) t = t.replace(/\s/g, ''); // "W E L L N E S S"
      l.labelText = t;
      var nw = (t.match(/\S+/g) || []).length;
      return /^times\b/i.test(t) || (nw <= 4 && t === t.toUpperCase() && /[A-Z]{3}/.test(t));
    });
    var kind = '';
    var hit = null;
    for (var i = 0; i < LABELS.length && !kind; i++) {
      for (var j = 0; j < cands.length; j++) {
        if (LABELS[i][1].test(cands[j].labelText)) { kind = LABELS[i][0]; hit = cands[j]; break; }
      }
    }
    if (hit) hit.label = true;
    cands.forEach(function (l) { if (/^times\b/i.test(l.labelText)) l.label = true; });
    // Edit pages also carry fixed features with their own names.
    if (!kind && /\b(contrapunto|sacredspace|speaking tree|letters to the editor|edit page)\b/i.test(text)) kind = 'edit';
    return { kind: kind, masthead: masthead };
  }

  /* --------------------------------------------------------- cut into articles */

  function segment(pages) {
    var all = [];
    pages.forEach(function (p) { p.lines = pageLines(p); });
    // Body size: the size most characters are set in.
    var sizes = [];
    pages.forEach(function (p) { p.lines.forEach(function (l) { for (var i = 0; i < Math.min(l.chars, 200); i += 20) sizes.push(Math.round(l.h * 2) / 2); }); });
    var body = median(sizes) || 9;
    var isHead = function (l) {
      return !l.label && l.h >= body * 1.35 && l.text.replace(/[^A-Za-z]/g, '').length >= 6 &&
        !/^(the\s+)?times\s+(nation|city|global|business|sport|region|special)\b/i.test(l.text.trim());
    };

    pages.forEach(function (p) {
      p.lines = joinPieces(p.lines, body);
      var info = pageKind(p, body);
      p.kind = info.kind;
      p.masthead = info.masthead;
      var top = p.height;
      // 0. A drop cap (one big letter that starts a story) belongs at the start
      // of the first line beside it, not as a line of its own.
      p.lines = p.lines.filter(function (dc) {
        if (!/^[A-Z]$/.test(dc.text.trim()) || dc.h < body * 1.8) return true;
        var next = null;
        p.lines.forEach(function (l) {
          if (l === dc || l.h > body * 1.5) return;
          if (l.x0 < dc.x1 - 2 || l.x0 - dc.x1 > body * 2.5) return;
          if (l.y < dc.y - body * 0.5 || l.y > dc.y + dc.h) return;
          if (!next || l.y > next.y) next = l;
        });
        if (!next) return true;
        next.text = dc.text.trim() + next.text.replace(/^\s+/, '');
        next.x0 = dc.x0;
        return false;
      });
      // 1. Headlines: consecutive big lines that overlap horizontally are one headline.
      var heads = [];
      p.lines.forEach(function (l) {
        if (!isHead(l)) return;
        var prev = heads.filter(function (h) {
          return Math.abs(h.h - l.h) < l.h * 0.25 && h.yLast - l.y < l.h * 1.9 && h.yLast > l.y && Math.min(h.x1, l.x1) - Math.max(h.x0, l.x0) > 0;
        })[0];
        if (prev) {
          prev.text += ' ' + l.text.trim();
          prev.yLast = l.y;
          prev.x0 = Math.min(prev.x0, l.x0);
          prev.x1 = Math.max(prev.x1, l.x1);
        } else {
          heads.push({ text: l.text.trim(), x0: l.x0, x1: l.x1, y: l.y, yLast: l.y, h: l.h, lines: [] });
        }
      });
      // 1b. Smaller big type right under a headline, lined up with it (same
      // left edge or centred under it, at least half as wide), is its deck: the
      // second headline line in lighter type, not a new story taking its text.
      heads.sort(function (a, b) { return b.y - a.y; });
      heads.forEach(function (A, i) {
        if (A.dead) return;
        for (var j = i + 1; j < heads.length; j++) {
          var B = heads[j];
          if (B.dead) continue;
          var ov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          var aw = A.x1 - A.x0;
          var lined = Math.abs(B.x0 - A.x0) < A.h * 1.5 || Math.abs((B.x0 + B.x1) / 2 - (A.x0 + A.x1) / 2) < aw * 0.15;
          if (B.h < A.h * 0.85 && B.y < A.yLast && A.yLast - (B.y + B.h * 0.8) <= A.h * 0.9 &&
              ov >= (B.x1 - B.x0) * 0.6 && (B.x1 - B.x0) >= aw * 0.5 && lined) {
            A.deck = (A.deck ? A.deck + ' ' : '') + B.text;
            A.yLast = B.yLast;
            A.x0 = Math.min(A.x0, B.x0);
            A.x1 = Math.max(A.x1, B.x1);
            B.dead = true;
          }
        }
      });
      heads = heads.filter(function (h) { return !h.dead; });
      heads.forEach(function (h) { h.style = headStyle(h, p.lines, body); });
      // 2. Each body line belongs to the nearest headline above it that covers
      // its columns and whose story is set in the same type size; a boxed
      // panel in another size keeps its own lines and a story keeps its own.
      var orphans = [];
      p.lines.forEach(function (l) {
        if (isHead(l) || l.label) return;
        var best = null;
        var same = null;
        heads.forEach(function (h) {
          if (h.yLast <= l.y) return;
          var overlap = Math.min(h.x1, l.x1) - Math.max(h.x0, l.x0);
          if (overlap < (l.x1 - l.x0) * 0.5) return;
          if (!best || h.yLast < best.yLast) best = h;
          if (h.style && Math.abs(h.style - l.h) <= l.h * 0.025 && (!same || h.yLast < same.yLast)) same = h;
        });
        best = same || best;
        if (best) best.lines.push(l);
        else orphans.push(l);
      });
      // 3. Read each article column by column, top to bottom. Each line keeps
      // its place on the page and in the text, so notes can be marked on the cut-out.
      heads.forEach(function (h) {
        var cols = [];
        h.lines.forEach(function (l) {
          var c = cols.filter(function (c) { return Math.abs(c.x - l.x0) < body * 3; })[0];
          if (!c) { c = { x: l.x0, lines: [] }; cols.push(c); }
          c.lines.push(l);
        });
        cols.sort(function (a, b) { return a.x - b.x; });
        var text = '';
        var spots = [];
        var x0 = h.x0;
        var x1 = h.x1;
        var bottom = h.yLast - h.h * 0.3;
        cols.forEach(function (c) {
          c.lines.sort(function (a, b) { return b.y - a.y; }).forEach(function (l) {
            var t = l.text.replace(/\s+/g, ' ').trim();
            var s;
            if (/-$/.test(text) && /^[a-z]/.test(t)) {
              text = text.slice(0, -1);
              s = text.length;
              text += t;
            } else {
              if (text) text += ' ';
              s = text.length;
              text += t;
            }
            spots.push([r1(l.x0), r1(l.x1), r1(l.y), r1(l.h), s, text.length]);
            x0 = Math.min(x0, l.x0);
            x1 = Math.max(x1, l.x1);
            bottom = Math.min(bottom, l.y - l.h * 0.3);
          });
        });
        var wc = (text.match(/\S+/g) || []).length;
        if (wc < 25 && h.text.length < 30) return; // a caption or a label, not a story
        all.push({
          page: p.n,
          kind: p.kind,
          headline: h.text.replace(/\s+/g, ' ').trim(),
          deck: (h.deck || '').replace(/\s+/g, ' ').trim(),
          text: text,
          words: wc,
          headSize: h.h / body,
          topFrac: Math.max(0, Math.min(1, h.y / top)),
          editorial: p.kind === 'edit' || /^(editorial|opinion)\b/i.test(h.text),
          // The story's area on the page in PDF units: left, top, right, bottom.
          box: [r1(Math.max(0, x0 - 4)), r1(Math.min(p.height, h.y + h.h * 0.95 + 4)), r1(Math.min(p.width, x1 + 4)), r1(Math.max(0, bottom - 4))],
          spots: spots
        });
      });
      // 4. Text with no headline above it on the page: kept as one "briefs" item.
      // A page with almost no text is a wrap-around advert; its scraps are skipped.
      var briefs = orphans.map(function (l) { return l.text.trim(); }).join(' ');
      if (p.lines.length >= 120 && (briefs.match(/\S+/g) || []).length > 80) {
        all.push({ page: p.n, kind: p.kind, headline: 'In brief (page ' + p.n + ')', deck: '', text: briefs, words: (briefs.match(/\S+/g) || []).length, headSize: 1, topFrac: 0.2, editorial: false, brief: true });
      }
    });
    return { articles: all, bodySize: body, pages: pages };
  }

  /* ---------------------------------------------------- filter, classify, rank */

  function isAd(a) {
    if (AD_HEAD.test(a.headline.trim())) return true;
    var t = a.headline + ' ' + a.text.slice(0, 4000);
    var cues = AD_CUES.filter(function (re) { return re.test(t); }).length;
    return cues >= 3 || (cues >= 2 && a.words < 150);
  }

  // Text from a font the PDF does not map to letters (often Hindi type) comes
  // out as junk like "dk;kZy; uxj": too few real words to be read.
  function isJunk(a) {
    var t = a.headline + ' ' + a.text.slice(0, 1500);
    if ((t.match(/[ऀ-ॿ]/g) || []).length > t.length * 0.05) return true;
    var toks = t.match(/\S+/g) || [];
    if (toks.length < 8) return false;
    var good = toks.filter(function (w) {
      return /^[("'‘“]*[A-Za-z][A-Za-z'’\-]*[.,:;!?'’"”)]*$/.test(w) || /^[(₹$`]*[\d.,:%\-\/]+[a-zA-Z]{0,3}[.,:;)]*$/.test(w);
    }).length;
    return good / toks.length < 0.6;
  }

  function classify(a) {
    var head = a.headline + (a.deck ? ' ' + a.deck : '');
    var lowerHead = head.toLowerCase();
    var bodyRaw = a.text.slice(0, 6000);
    var lowerBody = bodyRaw.toLowerCase();
    // Abbreviations are not trusted in an all-capitals headline ("US" = us).
    var letters = head.replace(/[^A-Za-z]/g, '');
    var capsHead = letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.8;
    var soft = SOFT_RE.test(head);
    var scores = SECTIONS.map(function (s) {
      var sc = 0;
      var strong = 0;
      var headStrong = 0;
      s.strong.forEach(function (w) {
        if (hasPhrase(lowerHead, w)) { sc += 4; strong += 2; headStrong++; }
        var n = countPhrase(lowerBody, w, 3);
        sc += n * 1.5;
        strong += n;
      });
      s.weak.forEach(function (w) {
        if (hasPhrase(lowerHead, w)) sc += 1.5;
        sc += countPhrase(lowerBody, w, 2) * 0.5;
      });
      s.abbr.forEach(function (w) {
        if (!capsHead && abbrCount(head, w, 1)) { sc += 4; strong += 2; headStrong++; }
        var n = abbrCount(bodyRaw, w, 3);
        sc += n * 1.5;
        strong += n;
      });
      if (soft && SOFTENED[s.key] && !headStrong) sc *= 0.35;
      if (a.kind === 'business' && s.key === 'economy') sc += 3;
      if (a.kind === 'world' && (s.key === 'ir' || s.key === 'intsec')) sc += 3;
      return { s: s, sc: r1(sc), strong: strong };
    }).sort(function (x, y) { return y.sc - x.sc; });
    a.scores = {};
    scores.forEach(function (x) { a.scores[x.s.key] = x.sc; });
    if (a.editorial) return a.words >= 120 ? EDITORIAL : OTHER;
    if (a.kind === 'sport') return OTHER;
    var best = scores[0];
    if (best.sc < 5 || best.strong < 2) return OTHER;
    // A world page: another country's policy or security is world news here.
    if (a.kind === 'world' && !/\bindia/i.test(head)) {
      if (best.s.key === 'policy' || best.s.key === 'polity') return SEC.ir;
      if (best.s.key === 'natsec' || best.s.key === 'border' || best.s.key === 'defence') return SEC.intsec;
    }
    return best.s;
  }

  function countriesIn(text) {
    var found = {};
    COUNTRIES.forEach(function (c) {
      var re = new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', c.length <= 3 ? '' : 'i');
      if (re.test(text)) found[COUNTRY_ALIAS[c] || c] = 1;
    });
    delete found.India;
    return Object.keys(found).slice(0, 6);
  }

  function priority(a, weight) {
    var sc = 0;
    if (a.frontPage) sc += 30;
    sc += Math.min(18, (a.headSize - 1) * 10);
    sc += a.topFrac * 8;
    sc += Math.min(10, Math.log(Math.max(1, a.words)) * 1.6);
    sc += weight;
    sc += Math.min(9, a.countries.length * 3);
    if (a.brief) sc -= 25;
    if (a.words < 40) sc -= 10;
    if (a.kind === 'city') sc -= 6;
    if (a.kind === 'soft') sc -= 15;
    if (a.kind === 'sport') sc -= 30;
    return Math.max(1, Math.min(100, Math.round(sc)));
  }

  /* -------------------------------------------------- summaries and notes */

  // TextRank over sentences: similarity = shared significant words, normalised.
  function keyPoints(text, k) {
    var ss = sentences(text).slice(0, 80);
    if (ss.length <= k) return ss;
    var toks = ss.map(function (s) {
      var set = {};
      sig(s).forEach(function (w) { set[w] = 1; });
      return set;
    });
    var n = ss.length;
    var W = [];
    for (var i = 0; i < n; i++) {
      W.push([]);
      var ki = Object.keys(toks[i]);
      for (var j = 0; j < n; j++) {
        if (i === j) { W[i].push(0); continue; }
        var common = 0;
        ki.forEach(function (w) { if (toks[j][w]) common++; });
        var den = Math.log(ki.length + 1) + Math.log(Object.keys(toks[j]).length + 1);
        W[i].push(den > 0 ? common / den : 0);
      }
    }
    var out = W.map(function (row) { return row.reduce(function (s, v) { return s + v; }, 0); });
    var score = ss.map(function () { return 1; });
    for (var it = 0; it < 25; it++) {
      score = score.map(function (_, i2) {
        var s = 0;
        for (var j2 = 0; j2 < n; j2++) if (W[j2][i2] && out[j2]) s += (W[j2][i2] / out[j2]) * score[j2];
        return 0.15 + 0.85 * s;
      });
    }
    // A small lead bias: news puts the essentials first.
    score = score.map(function (s, i3) { return s * (i3 === 0 ? 1.25 : i3 < 3 ? 1.1 : 1); });
    var picked = score.map(function (s, i4) { return { s: s, i: i4 }; }).sort(function (a, b) { return b.s - a.s; }).slice(0, k)
      .sort(function (a, b) { return a.i - b.i; });
    return picked.map(function (p) { return ss[p.i]; });
  }

  function names(text) {
    var counts = {};
    var re = /\b([A-Z][a-z]+(?:\s+(?:of|the|and|for)?\s*[A-Z][a-z]+){1,3})\b/g;
    var m;
    while ((m = re.exec(text))) {
      var k = m[1].replace(/\s+/g, ' ');
      if (/^(The|This|That|In|On|At|For|But|And|However|Meanwhile|According)\b/.test(k)) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.keys(counts).filter(function (k) { return counts[k] >= 2; })
      .sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5);
  }

  function facts(text, skip) {
    return sentences(text).filter(function (s) {
      return skip.indexOf(s) < 0 &&
        /(\d[\d,.]*\s?(%|per cent|crore|lakh|billion|million|km|tonnes|mw|gw))|(Rs\.?\s?\d)|(\$\s?\d)|\b(19|20)\d\d\b/i.test(s);
    }).slice(0, 3);
  }

  function keyTerms(a, df, nDocs) {
    var tf = {};
    sig(a.headline + ' ' + a.headline + ' ' + a.text).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    return Object.keys(tf).map(function (w) {
      return { w: w, s: tf[w] * Math.log((nDocs + 1) / ((df[w] || 0) + 1)) };
    }).sort(function (x, y) { return y.s - x.s; }).slice(0, 6).map(function (x) { return x.w; });
  }

  // Where each key point (k) and fact (f) sits on the page: one box per line it
  // covers, cut at the first and last word, in PDF units [kind, left, top, right, bottom].
  function marks(a) {
    var out = [];
    var add = function (kind, s) {
      var start = a.text.indexOf(s);
      if (start < 0) return;
      var end = start + s.length;
      a.spots.forEach(function (sp) {
        var ls = sp[4];
        var le = sp[5];
        if (le <= start || ls >= end) return;
        var len = Math.max(1, le - ls);
        var fx0 = Math.max(0, (start - ls) / len);
        var fx1 = Math.min(1, (end - ls) / len);
        var w = sp[1] - sp[0];
        out.push([kind, r1(sp[0] + w * fx0), r1(sp[2] + sp[3] * 0.85), r1(sp[0] + w * fx1), r1(sp[2] - sp[3] * 0.25)]);
      });
    };
    a.points.forEach(function (s) { add('k', s); });
    a.facts.forEach(function (s) { add('f', s); });
    return out;
  }

  var PROMPTS = {
    policy: ['Why did the government act now? What problem does this solve?', 'Who gains and who loses from this policy?', 'Relevance: how does it touch ordinary citizens and the armed forces?'],
    polity: ['What exactly did the court or body decide, and on what ground?', 'Which right or constitutional value is involved?', 'Articulate: say what changes for citizens, in two lines.'],
    natsec: ['What is the threat here, and where did it come from?', 'How are the security forces and the government responding?', 'Relevance: what does it mean for internal security?'],
    border: ['Why are tensions rising (or easing) here, and why now?', 'What is India\'s position, and what are the options?', 'Relevance: what does it change on the ground for the forces?'],
    defence: ['What capability does this add, and against which threat?', 'Is it made in India? What does it mean for self-reliance?', 'Relevance: how does it change the Army, Navy or Air Force?'],
    intsec: ['Who are the sides and what does each want?', 'How does this affect India (oil, trade, diaspora, security)?', 'Relevance: what lesson does it hold for India\'s defence?'],
    ir: ['Why does this relationship matter to India right now?', 'Which countries gain, and what does India give and get?', 'Relevance: how does it fit India\'s strategic autonomy?'],
    economy: ['What caused this change in the economy?', 'Who gains, who loses: farmers, industry, consumers?', 'Relevance: what does it mean for jobs, prices and defence spending?'],
    editorial: ['What is the writer\'s main argument in one line?', 'Do you agree? Give one point for and one against.', 'Articulate: say the issue in two lines, as you would in a GD.'],
    other: ['Why is this in the news?', 'Does it connect to India\'s security, economy or society?', 'Articulate: say it in two lines.']
  };

  /* ----------------------------------------------------------------- analyze */

  function sha256(buf) {
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // The front page: a page with the masthead and real stories on it (an
  // e-paper often opens with a wrap-around advert that also has the masthead,
  // and a supplement's cover has its own label, like "TIMES CITY").
  // With no masthead found, the first page with three stories.
  function frontPages(arts) {
    var count = {};
    arts.forEach(function (a) { if (!a.brief && a.words >= 60) count[a.page] = (count[a.page] || 0) + 1; });
    var withHead = {};
    arts.forEach(function (a) { if (a.masthead && !a.kind && count[a.page] >= 3) withHead[a.page] = 1; });
    if (Object.keys(withHead).length) return withHead;
    var first = Object.keys(count).map(Number).sort(function (x, y) { return x - y; }).filter(function (n) { return count[n] >= 3; })[0];
    var out = {};
    if (first) out[first] = 1;
    return out;
  }

  // opts.cut === false skips the pictures (the text notes still work).
  // opts.background: the result comes back as soon as the text is sorted, and
  // res.cutting (a promise of the number of pictures) makes the cut-outs after,
  // saving each one as it is made, so the paper can be read meanwhile.
  function analyze(lib, buf, name, onProgress, opts) {
    var copy = buf.slice(0);
    var doc = null;
    var keepDoc = false;
    return Promise.all([sha256(copy), readPages(lib, buf, onProgress)]).then(function (r) {
      var sha = r[0];
      var read = r[1];
      doc = read.doc;
      var chars = 0;
      read.pages.forEach(function (p) { p.items.forEach(function (it) { chars += it.str.length; }); });
      if (chars < 400) {
        return { ok: false, error: 'scanned', detail: 'This PDF has no text layer (it is a scanned image), so it cannot be read without OCR.' };
      }
      var seg = segment(read.pages);
      var mast = {};
      seg.pages.forEach(function (p) { if (p.masthead) mast[p.n] = 1; });
      var skipped = 0;
      var arts = seg.articles.filter(function (a) {
        if (isAd(a) || isJunk(a)) { skipped++; return false; }
        a.masthead = !!mast[a.page];
        return true;
      });
      var front = frontPages(arts);
      var df = {};
      arts.forEach(function (a) {
        var seen = {};
        sig(a.headline + ' ' + a.text).forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
      });
      arts.forEach(function (a, i) {
        a.id = sha.slice(0, 10) + '-' + i;
        a.frontPage = !!front[a.page] && !a.brief;
        var section = classify(a);
        a.countries = countriesIn(a.headline + ' ' + a.text);
        a.priority = priority(a, section.weight);
        a.points = keyPoints(a.text, section.key === 'editorial' ? 5 : 3);
        a.facts = facts(a.text, a.points);
        a.names = names(a.text);
        a.terms = keyTerms(a, df, arts.length);
        a.prompts = PROMPTS[section.key] || PROMPTS.other;
        a.sectionKey = section.key;
        a.sectionLabel = section.label;
        a.minutes = Math.max(1, Math.round(a.words / 200));
        if (a.spots) a.marks = marks(a);
        delete a.spots;
        delete a.masthead;
      });
      arts.sort(function (x, y) { return y.priority - x.priority; });
      var paper = {
        id: sha.slice(0, 16),
        sha: sha,
        name: name,
        addedAt: Date.now(),
        pagesRead: read.pages.length,
        numPages: read.numPages,
        adsSkipped: skipped,
        frontPages: Object.keys(front).map(Number),
        articles: arts
      };
      if (opts && opts.cut === false) return { ok: true, paper: paper, cuts: [] };
      var picks = pickCuts(paper);
      if (opts && opts.background) {
        keepDoc = true;
        var job = cutOut(doc, paper, picks, onProgress, function (c) { return db.putCut(c); })
          .catch(function () { return []; })
          .then(function (cuts) { doc.destroy(); return cuts.length; });
        return { ok: true, paper: paper, cuts: [], cutting: job };
      }
      return cutOut(doc, paper, picks, onProgress).catch(function () { return []; }).then(function (cuts) {
        return { ok: true, paper: paper, cuts: cuts };
      });
    }).then(function (res) {
      if (doc && !keepDoc) doc.destroy();
      return res;
    }, function (err) {
      if (doc) doc.destroy();
      throw err;
    });
  }

  /* ------------------------------------------------------------- cut-outs */

  // The stories that get a picture (most important first); each is marked
  // a.cut = 1 up front, so the screen can show "being cut out" meanwhile.
  function pickCuts(paper) {
    if (typeof document === 'undefined') return [];
    var pick = paper.articles.filter(function (a) { return !a.brief && a.box && a.words >= 30; }).slice(0, MAX_CUTS);
    pick.forEach(function (a) { a.cut = 1; });
    return pick;
  }

  // WebP where the browser can write it (about a third smaller), else JPEG.
  function toPicture(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, 'image/webp', CUT_QUALITY); }).then(function (b) {
      if (b && b.type === 'image/webp') return b;
      return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', CUT_QUALITY + 0.05); });
    });
  }

  // The chosen stories are drawn from their page and cut out as pictures.
  // Each page is drawn once, the page with the most important story first,
  // and every chosen story on it is cut. onCut(cut) may save each one at once.
  function cutOut(doc, paper, pick, onProgress, onCut) {
    if (typeof document === 'undefined' || !doc || !pick.length) return Promise.resolve([]);
    var byPage = {};
    var order = [];
    pick.forEach(function (a) {
      if (!byPage[a.page]) { byPage[a.page] = []; order.push(a.page); }
      byPage[a.page].push(a);
    });
    var nums = order; // pick is sorted by priority, so pages come in order of their best story
    var canvas = document.createElement('canvas');
    var cuts = [];
    var i = 0;
    var next = function () {
      if (i >= nums.length) {
        canvas.width = 0;
        canvas.height = 0;
        return cuts;
      }
      var n = nums[i++];
      if (onProgress) onProgress(i, nums.length, 'cut');
      return doc.getPage(n).then(function (pg) {
        var vp = pg.getViewport({ scale: CUT_SCALE });
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return pg.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          return byPage[n].reduce(function (chain, a) {
            return chain.then(function () {
              var p1 = vp.convertToViewportPoint(a.box[0], a.box[1]);
              var p2 = vp.convertToViewportPoint(a.box[2], a.box[3]);
              var sx = Math.max(0, Math.floor(Math.min(p1[0], p2[0])));
              var sy = Math.max(0, Math.floor(Math.min(p1[1], p2[1])));
              var w = Math.min(canvas.width, Math.ceil(Math.max(p1[0], p2[0]))) - sx;
              var h = Math.min(canvas.height, Math.ceil(Math.max(p1[1], p2[1]))) - sy;
              if (w < 40 || h < 30) return null;
              var c2 = document.createElement('canvas');
              c2.width = w;
              c2.height = h;
              c2.getContext('2d').drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
              return toPicture(c2).then(function (blob) {
                c2.width = 0;
                c2.height = 0;
                if (!blob) return null;
                var cut = { id: a.id, paper: paper.id, blob: blob, w: w, h: h };
                cuts.push(cut);
                return onCut ? Promise.resolve(onCut(cut)).catch(function () {}) : null;
              });
            });
          }, Promise.resolve());
        }).then(function () {
          pg.cleanup();
          return next();
        });
      });
    };
    return next();
  }

  /* ------------------------------------------------------ 30-minute plan */

  // Reading the key points and notes takes about a minute per news item and
  // four per editorial; the plan fills 30 minutes in this order.
  var PLAN = [
    { label: 'Front page', minutes: 5, pick: function (a) { return a.frontPage && !a.brief; }, each: 1 },
    { label: 'Security, border and defence', minutes: 8, pick: function (a) { return a.sectionKey === 'natsec' || a.sectionKey === 'border' || a.sectionKey === 'defence'; }, each: 1 },
    { label: 'Government policies, courts and polity', minutes: 4, pick: function (a) { return a.sectionKey === 'policy' || a.sectionKey === 'polity'; }, each: 1 },
    { label: 'IR, world strategy and international security', minutes: 5, pick: function (a) { return a.sectionKey === 'ir' || a.sectionKey === 'intsec'; }, each: 1 },
    { label: 'Economy', minutes: 3, pick: function (a) { return a.sectionKey === 'economy'; }, each: 1 },
    { label: 'Editorial: read, then articulate', minutes: 5, pick: function (a) { return a.sectionKey === 'editorial' && a.words > 250; }, each: 5 }
  ];

  function plan(paper) {
    var used = {};
    var blocks = PLAN.map(function (b) {
      var n = Math.max(1, Math.floor(b.minutes / b.each));
      var items = paper.articles.filter(function (a) { return !used[a.id] && b.pick(a); }).slice(0, n);
      items.forEach(function (a) { used[a.id] = 1; });
      return { label: b.label, minutes: b.minutes, items: items };
    });
    // Unused minutes go to the next most important stories.
    var spare = 30 - blocks.reduce(function (s, b) { return s + Math.min(b.minutes, b.items.length * (b.label.indexOf('Editorial') === 0 ? 5 : 1)); }, 0);
    if (spare > 0) {
      var more = paper.articles.filter(function (a) { return !used[a.id] && !a.brief; }).slice(0, spare);
      if (more.length) blocks.push({ label: 'Also important', minutes: more.length, items: more });
    }
    return blocks.filter(function (b) { return b.items.length; });
  }

  /* ------------------------------------------------------------ the Line */

  function tokenSet(text) {
    var set = {};
    sig(text).forEach(function (w) { if (w.length > 3) set[w] = 1; });
    return set;
  }

  // Earlier stories that share enough significant words (or names) with this one.
  function related(article, history) {
    var mine = tokenSet(article.headline + ' ' + (article.points || []).join(' ') + ' ' + (article.names || []).join(' '));
    var keys = Object.keys(mine);
    if (!keys.length) return [];
    return history.map(function (h) {
      var theirs = h.tokens || tokenSet(h.headline + ' ' + (h.points || []).join(' '));
      var common = keys.filter(function (k) { return theirs[k]; }).length;
      var union = keys.length + Object.keys(theirs).length - common;
      return { h: h, score: union ? common / union : 0, common: common };
    }).filter(function (x) { return x.common >= 3 && x.score >= 0.12; })
      .sort(function (a, b) { return String(b.h.date).localeCompare(String(a.h.date)) || b.score - a.score; })
      .slice(0, 5)
      .map(function (x) { return x.h; });
  }

  /* ---------------------------------------------------------- local storage */

  var DB_NAME = 'ssb-newspaper';

  function open() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('papers')) d.createObjectStore('papers', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('cuts')) d.createObjectStore('cuts', { keyPath: 'id' }).createIndex('paper', 'paper');
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  // fn(stores) runs inside one transaction over the named stores.
  function tx(names, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(names, mode);
        var stores = {};
        names.forEach(function (n) { stores[n] = t.objectStore(n); });
        var out = fn(stores);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); db.close(); };
        t.onerror = function () { rej(t.error); db.close(); };
        t.onabort = function () { rej(t.error); db.close(); };
      });
    });
  }

  function dropCuts(store, paperId) {
    var req = store.index('paper').openKeyCursor(IDBKeyRange.only(paperId));
    req.onsuccess = function () {
      var c = req.result;
      if (!c) return;
      store.delete(c.primaryKey);
      c.continue();
    };
  }

  var db = {
    // The paper and its cut-outs; older papers past the newest KEEP_CUTS lose
    // their pictures (their notes stay), so the phone does not fill up.
    save: function (paper, cuts) {
      return tx(['papers', 'cuts'], 'readwrite', function (s) {
        s.papers.put(paper);
        (cuts || []).forEach(function (c) { s.cuts.put(c); });
      }).then(function () {
        return tx(['papers'], 'readonly', function (s) { return s.papers.getAll(); });
      }).then(function (all) {
        var old = (all || []).sort(function (a, b) { return b.addedAt - a.addedAt; }).slice(KEEP_CUTS);
        if (!old.length) return;
        return tx(['cuts'], 'readwrite', function (s) { old.forEach(function (p) { dropCuts(s.cuts, p.id); }); });
      });
    },
    get: function (id) { return tx(['papers'], 'readonly', function (s) { return s.papers.get(id); }); },
    putCut: function (cut) { return tx(['cuts'], 'readwrite', function (s) { s.cuts.put(cut); }); },
    cut: function (articleId) { return tx(['cuts'], 'readonly', function (s) { return s.cuts.get(articleId); }); },
    remove: function (id) {
      return tx(['papers', 'cuts'], 'readwrite', function (s) {
        s.papers.delete(id);
        dropCuts(s.cuts, id);
      });
    },
    countCuts: function (paperId) {
      return tx(['cuts'], 'readonly', function (s) { return s.cuts.index('paper').count(IDBKeyRange.only(paperId)); });
    },
    list: function () {
      return tx(['papers'], 'readonly', function (s) { return s.papers.getAll(); }).then(function (all) {
        return (all || []).map(function (p) {
          return { id: p.id, name: p.name, addedAt: p.addedAt, pagesRead: p.pagesRead, numPages: p.numPages, count: p.articles.length };
        }).sort(function (a, b) { return b.addedAt - a.addedAt; });
      });
    },
    // Every earlier story, light enough to compare against: headline, points, date, paper.
    history: function (exceptId) {
      return tx(['papers'], 'readonly', function (s) { return s.papers.getAll(); }).then(function (all) {
        var out = [];
        (all || []).forEach(function (p) {
          if (p.id === exceptId) return;
          p.articles.forEach(function (a) {
            if (a.brief) return;
            out.push({ headline: a.headline, points: a.points, date: new Date(p.addedAt).toISOString().slice(0, 10), paper: p.name, sectionLabel: a.sectionLabel });
          });
        });
        return out;
      });
    }
  };

  window.SSBPaper = {
    analyze: analyze,
    plan: plan,
    related: related,
    db: db,
    SECTIONS: SECTIONS.concat([EDITORIAL, OTHER]).map(function (s) { return { key: s.key, label: s.label }; }),
    _internal: { sentences: sentences, keyPoints: keyPoints, segment: segment, pageLines: pageLines, readPages: readPages, isAd: isAd, isJunk: isJunk }
  };
})();
