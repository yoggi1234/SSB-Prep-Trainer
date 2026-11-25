'use strict';

/* SSB Prep Trainer - renderer. Plain DOM, no frameworks, no network. */
(function () {
  var appEl = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ------------------------------------------------------------- helpers */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function clock(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
  }

  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(iso || '');
    }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 2600);
  }

  // WCAG contrast between two hex colours, so the theme check can prove the
  // softer background did not cost legibility.
  function contrastRatio(a, b) {
    function lum(hex) {
      var h = String(hex).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var rgb = [0, 2, 4].map(function (i) {
        var c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    var l1 = lum(a);
    var l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // A picture can arrive as an absolute path on this computer, as a URL the
  // page can load as-is (the Android bundle uses 'data/tat-classic/…'), or as
  // a data:/blob: URL from the phone's own picker. Only a Windows path needs
  // turning into a file:// URL; the rest must be left alone or the picture
  // silently fails to load.
  function fileUrl(p) {
    var s = String(p == null ? '' : p).replace(/\\/g, '/');
    if (/^(data:|blob:|https?:|file:|content:)/i.test(s)) return s;
    if (/^[a-zA-Z]:\//.test(s)) return 'file:///' + s;
    if (s.charAt(0) === '/') return 'file://' + s;
    return s;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* --------------------------------------------------------------- state */

  var S = {
    view: 'home',
    data: { wat: null, srt: null, tat: null },
    config: {},
    attempts: [],
    tatImages: [],
    tatLibrary: [],
    tatClassic: [],
    tatBin: [],
    tatGone: 0,
    tatGoneItems: [],
    newsIndex: null,
    dashSel: 0,
    dashAuto: true,
    dashTimer: null,
    lectures: [],
    hints: {}, // word -> { simple, natural, positive, leadership, factual, general }
    meaningToken: 0,
    pending: { test: 'wat', setIndex: 0, source: 'builtin' },
    session: null,
    refs: null,
    openAttempt: null
  };

  var TICK = null;

  /* ------------------------------------------------------------ metadata */

  var META = {
    tat: {
      code: 'TAT',
      name: 'Thematic Apperception Test',
      blurb: 'Story writing on picture prompts. 12 slides (11 scenes + 1 blank).'
    },
    wat: {
      code: 'WAT',
      name: 'Word Association Test',
      blurb: 'One word at a time; write the first meaningful sentence it brings to mind.'
    },
    srt: {
      code: 'SRT',
      name: 'Situation Reaction Test',
      blurb: 'Reactions to situations, written against the clock. Realistic, practical action.'
    }
  };

  function builtinSets(test) {
    if (test === 'tat') return [{ id: 'tat-shuffled', name: 'Shuffled pictures', items: [] }];
    var pack = S.data[test];
    if (!pack || !Array.isArray(pack.sets)) return [];
    return pack.sets.map(function (s) {
      return { id: s.id, name: s.name, items: s.items || s.words || s.situations || s.scenes || [], slides: s.slides };
    });
  }

  function customSets(test) {
    var c = (S.config.custom && S.config.custom[test]) || [];
    return c.map(function (s) {
      return { id: s.id, name: s.name + ' (mine)', items: s.items.slice(), custom: true };
    });
  }

  // Sets published by the master PC and fetched with Refresh content. On the
  // master itself its own sets are already listed as "(mine)", so those ids are skipped.
  function sharedSets(test) {
    var pack = S.config && S.config.sharedContent;
    var list = (pack && Array.isArray(pack[test])) ? pack[test] : [];
    var own = {};
    ((S.config.custom && S.config.custom[test]) || []).forEach(function (c) { own[c.id] = 1; });
    return list.filter(function (x) { return x && !own[x.id] && Array.isArray(x.items) && x.items.length; }).map(function (x) {
      return { id: 'shared-' + x.id, name: x.name + ' (update)', items: x.items.slice(), shared: true };
    });
  }

  function allSets(test) {
    return builtinSets(test).concat(sharedSets(test), customSets(test));
  }

  function sharedLabel() {
    var pack = S.config && S.config.sharedContent;
    if (!pack) return 'No content updates on this ' + (onPhone() ? 'phone' : 'computer') + ' yet.';
    var d = '';
    try { d = new Date(pack.published).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) {}
    return 'Content update v' + pack.version + (d ? ' (' + d + ')' : '') + ': ' + (pack.wat || []).length + ' WAT and ' + (pack.srt || []).length + ' SRT sets.';
  }

  // Refresh content: read the master's pack and keep it in the settings, so it
  // works offline afterwards on this device.
  function refreshContent(btn, test) {
    if (!window.api.contentFetch) return;
    if (!(S.config && S.config.onlineEnabled)) {
      toast('Turn on Online lookup in Settings first, then press Refresh content.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    var before = sharedSets(test).length;
    var oldVer = (S.config.sharedContent && S.config.sharedContent.version) || 0;
    window.api.contentFetch().then(function (r) {
      if (!r || !r.ok) {
        btn.disabled = false;
        btn.textContent = 'Refresh content';
        toast(r && r.error === 'none' ? 'The master has not published any content yet.'
          : r && r.error === 'offline' ? 'Turn on Online lookup in Settings first.'
          : r && r.error === 'damaged' ? 'The content file looks damaged, so it was not used. Ask the master to publish again.'
          : 'Could not reach the content server. Check the internet and try again.');
        return;
      }
      S.config.sharedContent = r.pack;
      return Promise.resolve(window.api.setConfig({ sharedContent: r.pack })).then(function () {
        var now = sharedSets(test).length;
        toast(r.pack.version === oldVer ? 'Already up to date (v' + r.pack.version + ').'
          : 'Updated to v' + r.pack.version + ': ' + now + ' ' + test.toUpperCase() + ' set' + (now === 1 ? '' : 's') + ' from the master' + (now > before ? ' (' + (now - before) + ' new)' : '') + '.');
        render();
      });
    }, function () {
      btn.disabled = false;
      btn.textContent = 'Refresh content';
      toast('Could not reach the content server.');
    });
  }

  function builtinRaw(test) {
    var pack = S.data[test];
    if (!pack || !Array.isArray(pack.sets)) return [];
    return pack.sets;
  }

  /* ------------------------------------------------------------- render */

  // The dashboard is the only navigation surface: every section is a tile, and
  // the top bar keeps nothing but the name and the connection light. Adding a
  // screen means adding a tile here (and a branch in render()).
  var TILES = [
    { id: 'tutorial', label: 'How to use this app', code: 'HELP' },
    { id: 'tat', label: 'TAT', code: 'TAT', test: true },
    { id: 'wat', label: 'WAT', code: 'WAT', test: true },
    { id: 'srt', label: 'SRT', code: 'SRT', test: true },
    { id: 'ppdt', label: 'PPDT', code: 'PPDT' },
    { id: 'lecturette', label: 'Lecturette', code: 'LECT' },
    { id: 'topics', label: 'Important Topics', code: 'NOTES' },
    { id: 'digest', label: 'News Digest', code: 'NEWS' },
    { id: 'timeline', label: 'News Timeline', code: 'LINE' },
    { id: 'paper', label: 'Newspaper', code: 'PAPER' },
    { id: 'add', label: 'Add material', code: 'ADD' },
    { id: 'bin', label: 'Bin', code: 'BIN' },
    { id: 'settings', label: 'Settings', code: 'SET' }
  ];

  // The same screens run on Windows and inside the Android app; copy that
  // names a file, a folder, a keyboard or the PC asks this first.
  function onPhone() {
    return !!(window.api && window.api.android);
  }

  function netChip() {
    // S.net: 'checking' | 'online' | 'offline' | 'disabled'. The page itself
    // can never reach the network (CSP), so this mirrors the main process's
    // honest probe. Offline is not an error state — it just means extras are
    // unavailable and everything keeps working from bundled data.
    var st = S.net || 'checking';
    var map = {
      checking: ['', 'checking…'],
      online: ['ok', 'online'],
      offline: ['', 'offline'],
      disabled: ['', 'online off']
    };
    var m = map[st] || map.checking;
    return (
      '<span class="chip ' + m[0] + ' net-chip net-' + st + '" id="netChip" ' +
      'title="Extra online features use the internet. Everything else works without it.">' +
      esc(m[1]) + '</span>'
    );
  }

  // Ask the main process whether the internet is reachable, then update the
  // chip without a full re-render. Cheap, cached, and safe to call often.
  function refreshNet(initial) {
    window.api
      .onlineProbe()
      .then(function (res) {
        S.net = !res || res.enabled === false ? 'disabled' : res.online ? 'online' : 'offline';
        updateNetChip();
      })
      .catch(function () {
        S.net = 'offline';
        updateNetChip();
      })
      .then(function () {
        // Re-check in the background so a dropped connection is noticed and a
        // restored one is picked up, without ever prompting the user.
        if (initial) setTimeout(function () { refreshNet(true); }, 60000);
      });
  }

  function updateNetChip() {
    var el = document.getElementById('netChip');
    if (!el) return;
    var st = S.net || 'checking';
    var map = {
      checking: ['', 'checking…'],
      online: ['ok', 'online'],
      offline: ['', 'offline'],
      disabled: ['', 'online off']
    };
    var m = map[st] || map.checking;
    el.className = 'chip ' + m[0] + ' net-chip net-' + st;
    el.textContent = m[1];
  }
  function topbar() {
    // No menu here: sections live on the dashboard tiles. The name doubles as
    // the way home from any screen.
    return (
      '<div class="topbar">' +
      '<div class="brand"><img class="brand-logo" src="logo.png" alt="" /> SSB Prep Trainer' +
      netChip() + '</div>' +
      '<div class="topnav">' +
      '<button class="navlink' +
      (S.view === 'home' ? ' active' : '') +
      '" data-goto="home" title="Back to the dashboard">⌂ Dashboard</button>' +
      '</div>' +
      '</div>'
    );
  }

  function shell(bodyHtml) {
    appEl.innerHTML = topbar() + bodyHtml;
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () {
        goto(b.getAttribute('data-goto'));
      });
    });
    wireExternal(appEl);
  }

  function body(content) {
    shell('<div class="scroll"><div class="wrap">' + content + '</div></div>');
  }

  function goto(view) {
    if (S.view === 'diagnostics' && view !== 'diagnostics' && DIAG_TIMER) {
      clearInterval(DIAG_TIMER);
      DIAG_TIMER = null;
    }
    if (S.session) {
      var name = META[S.session.test] ? META[S.session.test].code : 'test';
      var leave = window.confirm(
        'Your ' + name + ' attempt is still running.\n\nLeave without saving it?'
      );
      if (!leave) return;
      S.session = null;
      S.refs = null;
      stopTick();
      window.api.keepAwake(false);
    }
    if (view !== 'home') stopDashTimer();
    if (view !== 'lecturette') {
      stopLectTimer();
      window.api.keepAwake(false);
      var lex = lectState();
      lex.run = null;
      lex.mode = 'list';
      lex.summary = null;
    }
    S.view = view;
    render();
  }

  function render() {
    if (S.view === 'home') return renderHome();
    if (S.view === 'library') return renderLibrary();
    if (S.view === 'history') return renderHistory();
    if (S.view === 'settings') return renderSettings();
    if (S.view === 'setup') return renderSetup();
    if (S.view === 'result') return renderResult();
    if (S.view === 'lecturette') return renderLecturette();
    if (S.view === 'ppdt') return renderPpdt();
    if (S.view === 'digest') return renderDigest();
    if (S.view === 'timeline') return renderTimeline();
    if (S.view === 'topics') return renderTopics();
    if (S.view === 'paper') return renderPaper();
    if (S.view === 'tutorial') return renderTutorial();
    if (S.view === 'add') return renderAdd();
    if (S.view === 'bin') return renderBin();
    if (S.view === 'diagnostics') return renderDiagnostics();
    if (S.view.indexOf('run:') === 0) return; // run views mount themselves
    return renderHome();
  }

  /* ------------------------------------------------------------ home view */



  /* ----------------------------------------------------------- dashboard */

  function lectScriptCount() {
    return lectTopics().filter(function (t) {
      return t.source === 'curated' || t.source === 'draft';
    }).length;
  }

  // One tile's blurb and its three little facts. Test tiles show their live
  // timings; the other sections show a count that matters for that screen.
  function dashMeta(t) {
    if (t.test) {
      var m = META[t.id];
      var sets = allSets(t.id);
      var rows = '';
      if (t.id === 'wat') {
        rows =
          '<li><span>Words per set</span><b>60</b></li>' +
          '<li><span>Time per word</span><b>' + S.config.watPerWordSec + ' sec</b></li>' +
          '<li><span>Total</span><b>' + clock(60 * S.config.watPerWordSec * 1000) + '</b></li>';
      } else if (t.id === 'srt') {
        rows =
          '<li><span>Situations per set</span><b>60</b></li>' +
          '<li><span>Total time</span><b>' + S.config.srtTotalMin + ' min</b></li>' +
          '<li><span>Avg per situation</span><b>~30 sec</b></li>';
      } else {
        rows =
          '<li><span>Slides</span><b>11 + 1 blank</b></li>' +
          '<li><span>View / think / write</span><b>' + S.config.tatViewSec + 's / ' + tatThinkSec() + 's / ' + S.config.tatWriteSec / 60 + ' min</b></li>' +
          '<li><span>Total</span><b>' +
          Math.round((12 * (S.config.tatViewSec + tatThinkSec() + S.config.tatWriteSec)) / 60) +
          ' min</b></li>';
      }
      return {
        code: m.code,
        chip: m.name,
        blurb: m.blurb,
        rows: rows + '<li><span>Practice sets</span><b>' + sets.length + '</b></li>'
      };
    }
    if (t.id === 'ppdt') {
      var pc = S.config;
      return {
        code: t.code,
        chip: (S.ppdt || []).length + ' pictures',
        blurb: 'A hazy picture for a few seconds, a moment to think, then your story — with five model stories to compare.',
        rows:
          '<li><span>View / think / write</span><b>' + (pc.ppdtViewSec || 30) + 's · ' + (pc.ppdtThinkSec || 30) + 's · ' +
          Math.round((pc.ppdtWriteSec || 240) / 60) + 'm</b></li>' +
          '<li><span>Blur</span><b>' + (pc.ppdtBlur == null ? 40 : pc.ppdtBlur) + '%</b></li>' +
          '<li><span>Model stories</span><b>5 per picture</b></li>'
      };
    }
    if (t.id === 'lecturette') {
      var topics = lectTopics().length;
      var scripts = lectScriptCount();
      return {
        code: t.code,
        chip: topics + ' topics',
        blurb: 'Press Generate for a full three-minute speech, with the latest news on that topic below it.',
        rows:
          '<li><span>Pattern</span><b>30s · 2m · 30s</b></li>' +
          '<li><span>Lectures written</span><b>' + Object.keys((S.config && S.config.lectWritten) || {}).length + '</b></li>' +
          '<li><span>Topics</span><b>' + topics + '</b></li>'
      };
    }
    if (t.id === 'library') {
      return {
        code: t.code,
        chip: '123,913 words',
        blurb: 'Every word with a plain meaning, search, sentiment tabs and a random-word drill.',
        rows:
          '<li><span>Lookup</span><b>offline + online</b></li>' +
          '<li><span>Model sentences</span><b>5 per word</b></li>' +
          '<li><span>Sets</span><b>custom</b></li>'
      };
    }
    if (t.id === 'digest') {
      return {
        code: t.code,
        chip: onPhone() ? 'today\'s edition' : 'separate engine',
        blurb: onPhone()
          ? 'Today\'s current affairs in twelve sections, built on the phone; an edition opens even offline.'
          : 'Free news feeds and your own newspaper PDFs into a 12-page daily digest.',
        rows:
          '<li><span>Sections</span><b>12</b></li>' +
          '<li><span>Feeds</span><b>' + (onPhone() ? 'Google News' : 'RSS + Google') + '</b></li>' +
          '<li><span>Output</span><b>' + (onPhone() ? 'on screen' : 'PDF') + '</b></li>'
      };
    }
    if (t.id === 'history') {
      return {
        code: t.code,
        chip: S.attempts.length + ' saved',
        blurb: 'Every attempt you saved, with what you wrote and how long you took.',
        rows:
          '<li><span>Export</span><b>text</b></li>' +
          '<li><span>Delete</span><b>per attempt</b></li>' +
          '<li><span>Storage</span><b>' + (onPhone() ? 'on this phone' : 'local file') + '</b></li>'
      };
    }
    if (t.id === 'add') {
      return {
        code: t.code,
        chip: 'your material',
        blurb: 'Upload PPDT and TAT pictures, and import WAT, SRT and lecture topics from Excel.',
        rows:
          '<li><span>TAT pictures</span><b>' + (S.tatImages || []).length + ' yours</b></li>' +
          '<li><span>WAT sets</span><b>' + customSets('wat').length + ' yours</b></li>' +
          '<li><span>Wrong picture?</span><b>move to bin</b></li>'
      };
    }
    if (t.id === 'tutorial') {
      return {
        code: t.code,
        chip: 'start here',
        blurb: 'A Hindi–English video of every feature, a short guide to each section, and how to add free AI keys for better answers.',
        rows:
          '<li><span>Video</span><b>Hindi + English</b></li>' +
          '<li><span>Guide</span><b>every section</b></li>' +
          '<li><span>AI keys</span><b>step by step</b></li>'
      };
    }
    if (t.id === 'paper') {
      return {
        code: t.code,
        chip: 'your PDF',
        blurb: 'Load a newspaper PDF: stories ranked and sorted, key points, notes and a 30-minute plan.',
        rows: ''
      };
    }
    if (t.id === 'topics') {
      var tdb = S.topicsDb && S.topicsDb.data && S.topicsDb.data.index;
      var tHave = tdb ? Object.keys(S.topicsDb.data.local || {}).length : 0;
      return {
        code: t.code,
        chip: tdb ? tdb.topics.length + ' topics' : 'study notes',
        blurb: 'Lecturette and GD notes, one PDF per topic. Download once, then read it offline.',
        rows:
          '<li><span>Source</span><b>GitHub</b></li>' +
          '<li><span>On this ' + (onPhone() ? 'phone' : 'PC') + '</span><b>' + (tdb ? tHave + ' PDFs' : 'none yet') + '</b></li>' +
          '<li><span>Updates</span><b>auto-checked</b></li>'
      };
    }
    if (t.id === 'timeline') {
      return {
        code: t.code,
        chip: 'follow-ups',
        blurb: 'Every story from your digests and newspapers by section, with later reports added under the first one and the paper\'s cut-out a tap away.',
        rows: '<li><span>Grouped by</span><b>section</b></li><li><span>Search</span><b>any topic</b></li><li><span>Grows with</span><b>each digest</b></li>'
      };
    }
    if (t.id === 'bin') {
      var binN = (S.tatBin || []).length;
      return {
        code: t.code,
        chip: binN + ' waiting',
        blurb: 'Pictures you took out of the test. Nothing is destroyed until you say so.',
        rows:
          '<li><span>Restore</span><b>any time</b></li>' +
          '<li><span>Delete forever</span><b>one click</b></li>' +
          '<li><span>Stored</span><b>' + (onPhone() ? 'on this phone' : 'on this PC') + '</b></li>'
      };
    }
    return {
      code: t.code,
      chip: 'timings',
      blurb: 'Timings, shuffling, your own sets and the online switch.',
      rows:
        '<li><span>Online</span><b>' + (S.config.onlineEnabled ? 'on' : 'off') + '</b></li>' +
        '<li><span>WAT</span><b>' + S.config.watPerWordSec + 's per word</b></li>' +
        '<li><span>SRT</span><b>' + S.config.srtTotalMin + ' min</b></li>'
    };
  }

  // One plain, full-width row per section: the dashboard is a list you scroll
  // and tap, on the phone and on the PC alike.
  function dashTile(t, i) {
    var meta = dashMeta(t);
    return (
      '<button class="dash-row" data-tile="' + t.id + '" data-index="' + i + '">' +
      '<span class="dash-code">' + esc(meta.code) + '</span>' +
      '<span class="dash-text"><span class="dash-title">' + esc(t.label) + '</span>' +
      '<span class="dash-sub">' + esc(meta.blurb) + '</span></span>' +
      '<span class="chip dash-chip">' + esc(meta.chip) + '</span>' +
      '<span class="dash-go" aria-hidden="true">›</span>' +
      '</button>'
    );
  }

  function stopDashTimer() {
    if (S.dashTimer) clearInterval(S.dashTimer);
    S.dashTimer = null;
  }

  function dashTiles() {
    return Array.prototype.slice.call(appEl.querySelectorAll('[data-tile]'));
  }

  function selectTile(i) {
    var tiles = dashTiles();
    if (!tiles.length) return;
    S.dashSel = (i + tiles.length) % tiles.length;
    tiles.forEach(function (el, idx) {
      el.classList.toggle('sel', idx === S.dashSel);
    });
  }

  function dashColumns() {
    var dash = document.getElementById('dash');
    if (!dash) return 1;
    var cols = getComputedStyle(dash).gridTemplateColumns.split(' ').filter(Boolean).length;
    return cols || 1;
  }

  function onDashKey(e) {
    if (S.view !== 'home') return;
    var tiles = dashTiles();
    if (!tiles.length) return;
    var cols = dashColumns();
    var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : e.key === 'ArrowUp' ? -cols : 0;
    if (!step) return;
    e.preventDefault();
    S.dashAuto = false;
    selectTile(S.dashSel + step);
    if (tiles[S.dashSel]) tiles[S.dashSel].focus();
  }

  function openTile(id) {
    stopDashTimer();
    var t = null;
    for (var i = 0; i < TILES.length; i++) if (TILES[i].id === id) t = TILES[i];
    if (t && t.test) {
      S.pending.test = id;
      S.pending.setIndex = 0;
      S.pending.source = 'builtin';
      S.view = 'setup';
      render();
      return;
    }
    goto(id);
  }

  function wireUpdate() {
    var later = document.getElementById('updateLater');
    if (later) later.addEventListener('click', function () { S.updateHidden = S.update.latest; render(); });
    if (document.querySelector('.update-note')) wireExternal(document.querySelector('.update-note'));
  }

  // A plain list: one tap or click opens a section, the page scrolls normally,
  // and on the PC the arrow keys move between rows (Enter opens). Nothing moves
  // on its own.
  function wireDash() {
    wireUpdate();
    var tiles = dashTiles();
    if (!tiles.length) return;
    stopDashTimer();
    S.dashAuto = false;
    S.dashSel = Math.min(S.dashSel || 0, tiles.length - 1);
    selectTile(S.dashSel);
    tiles.forEach(function (b, i) {
      b.addEventListener('focus', function () { selectTile(i); });
      b.addEventListener('click', function () { openTile(b.getAttribute('data-tile')); });
    });
    if (!S.dashKeysBound) {
      document.addEventListener('keydown', onDashKey);
      S.dashKeysBound = true;
    }
  }

  function renderHome() {
    var attempts = S.attempts;
    var counts = { tat: 0, wat: 0, srt: 0 };
    attempts.forEach(function (a) {
      if (counts[a.test] !== undefined) counts[a.test]++;
    });
    var last = attempts[0];
    var stats =
      '<div class="stat">' +
      '<div class="box"><div class="num">' + attempts.length + '</div><div class="lbl">saved attempts</div></div>' +
      '<div class="box"><div class="num">' + counts.tat + '</div><div class="lbl">TAT practices</div></div>' +
      '<div class="box"><div class="num">' + counts.wat + '</div><div class="lbl">WAT practices</div></div>' +
      '<div class="box"><div class="num">' + counts.srt + '</div><div class="lbl">SRT practices</div></div>' +
      '<div class="box"><div class="num">' + (S.tatBin || []).length + '</div><div class="lbl">pictures in the bin</div></div>' +
      '<div class="box"><div class="num">' + (last ? esc(last.setName) : '—') + '</div><div class="lbl">most recent set</div></div>' +
      '</div>';

    body(
      '<div class="dashhead">' +
      '<div>' +
      '<h1>SSB Prep Trainer</h1>' +
      '<p class="lead">' + (onPhone() ? 'Tap' : 'Click') + ' a section to open it. ' +
      (S.config.onlineEnabled
        ? 'Everything works offline; online extras refresh when there is a connection.'
        : 'Online extras are off, so everything runs from what is saved here.') +
      (onPhone() ? '' : ' Keys: <b>↑ ↓</b> to move, <b>Enter</b> to open.') + '</p>' +
      '</div>' +
      '<div class="dashbadge"><b>' + TILES.length + '</b><span>sections</span></div>' +
      '</div>' +
      updateBanner() +
      tourInvite() +
      '<div class="dash" id="dash">' + TILES.map(dashTile).join('') + '</div>' +
      '<h2>At a glance</h2>' + stats +
      '<div class="note">Timings follow the format commonly reported for the SSB psychology battery: ' +
      '<b>TAT</b> 12 slides: ' + S.config.tatViewSec + ' seconds to view, ' + tatThinkSec() + ' seconds to form your idea with no picture, and ' + S.config.tatWriteSec / 60 + ' minutes to write each story; ' +
      '<b>WAT</b> 60 words, one every ' + S.config.watPerWordSec + ' seconds; ' +
      '<b>SRT</b> 60 situations in ' + S.config.srtTotalMin + ' minutes. Change any of these in <b>Settings</b>.</div>' +
      '<p class="small muted" style="margin-top:14px">Practice material is compiled from publicly published SSB preparation material and rewritten for this app. ' +
      'See the material notes at the bottom of <b>Settings</b>.</p>'
    );

    wireDash();
    wireTourInvite();
  }

  /* ----------------------------------------------------------- setup view */

  function renderSetup() {
    var test = S.pending.test;
    var m = META[test];
    var sets = allSets(test);
    var images = S.tatImages;

    var anyPictures = test === 'tat' && picturePool().length >= 11;
    var canShare = test !== 'tat' && !!window.api.contentFetch;
    var shareCard = canShare
      ? '<div class="card content-card" style="margin-top:14px"><div class="row" style="align-items:center;justify-content:space-between">' +
        '<span class="small"><b>Content updates</b><br><span class="muted">' + esc(sharedLabel()) + '</span></span>' +
        '<button class="btn sm" id="refreshContent">Refresh content</button></div></div>'
      : '';
    var wireShare = function () {
      var rb = document.getElementById('refreshContent');
      if (rb) rb.addEventListener('click', function () { refreshContent(rb, test); });
    };
    if (test === 'tat' ? !anyPictures : !sets.length) {
      body(
        '<h1>' + esc(m.code || test.toUpperCase()) + '</h1>' +
        '<div class="empty">Nothing is loaded for this test yet. Open <b>Add material</b> and import your Excel sheet.</div>' +
        '<div class="row"><button class="btn primary" id="setupAdd">Add material</button><button class="btn ghost" id="setupHome">Dashboard</button></div>' +
        shareCard
      );
      wireShare();
      document.getElementById('setupAdd').addEventListener('click', function () { goto('add'); });
      document.getElementById('setupHome').addEventListener('click', function () { goto('home'); });
      return;
    }

    var opts = sets
      .map(function (s, i) {
        // A built-in TAT set draws its pictures fresh each time, so it has no fixed list to count.
        var count = test === 'tat' && !s.items.length ? '11 pictures + 1 blank' : s.items.length + ' items';
        return '<option value="' + i + '"' + (i === S.pending.setIndex ? ' selected' : '') + '>' + esc(s.name) + ' — ' + count + '</option>';
      })
      .join('');

    var extra = '';
    if (test === 'tat') {
      extra =
        '<div class="note" style="margin-top:12px">Every set draws eleven pictures at random from ' + picturePool().length +
        ', the same pictures PPDT uses, and recent ones are held back. Upload more in <b>Add material</b>.</div>';
    }

    body(
      '<button class="btn ghost sm" id="back">← Back</button>' +
        '<h1 style="margin-top:14px">' + m.code + ' — ' + m.name + '</h1>' +
        '<p class="lead">' + esc(m.blurb) + '</p>' +
        '<h2>Choose a practice set</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Practice set</label><div class="ctl">' +
        (sets.length ? '<select id="setSel">' + opts + '</select>' : '<span class="muted">No sets available</span>') +
        '</div></div>' +
        // TAT draws fresh pictures for every set, so it has no order to shuffle.
        (test === 'tat'
          ? ''
          : '<div class="field"><label>Shuffle the order<br><span class="small muted">' +
            (test === 'wat' ? 'Word' : 'Situation') + ' order varies each time</span></label>' +
            '<div class="ctl"><button class="toggle' +
            (test === 'wat' ? (S.config.shuffleWAT ? ' on' : '') : S.config.shuffleSRT ? ' on' : '') +
            '" id="shuffleT"></button></div></div>') +
        '<div class="field"><label>Timings<br><span class="small muted">Change these in Settings</span></label><div class="ctl muted small">' +
        timingSummary(test) +
        '</div></div>' +
        '</div>' +
        extra +
        '<div class="row" style="margin-top:22px">' +
        '<button class="btn primary" id="go">Start ' + m.code + '</button>' +
        '<button class="btn" id="goSettings">Edit timings</button>' +
        '</div>' +
        shareCard
    );
    wireShare();

    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { goto('home'); });

    var sel = document.getElementById('setSel');
    if (sel) {
      sel.addEventListener('change', function () {
        S.pending.setIndex = parseInt(sel.value, 10) || 0;
      });
    }

    var sh = document.getElementById('shuffleT');
    if (sh) {
      sh.addEventListener('click', function () {
        var key = test === 'wat' ? 'shuffleWAT' : 'shuffleSRT';
        S.config[key] = !S.config[key];
        window.api.setConfig({ [key]: S.config[key] });
        sh.classList.toggle('on', S.config[key]);
      });
    }

    var pick = document.getElementById('pickImgs');
    if (pick) {
      pick.addEventListener('click', function () {
        window.api.pickTatImages().then(function (list) {
          S.tatImages = list || [];
          // Eleven pictures are enough to practise with; switch to them at once.
          if (S.tatImages.length >= 11) {
            S.config.tatSource = 'mine';
            window.api.setConfig({ tatSource: 'mine' });
          }
          toast(S.tatImages.length + ' picture(s) available');
          render();
        });
      });
    }

    var manage = document.getElementById('manageImgs');
    if (manage) {
      manage.addEventListener('click', function () { goto('add'); });
    }

    var srcSel = document.getElementById('tatSource');
    if (srcSel) {
      srcSel.addEventListener('change', function () {
        S.config.tatSource = srcSel.value;
        window.api.setConfig({ tatSource: srcSel.value });
        render();
      });
    }

    var clr = document.getElementById('clearImgs');
    if (clr) {
      clr.addEventListener('click', function () {
        window.api.clearTatImages().then(function () {
          S.tatImages = [];
          if (S.config.tatSource === 'mine') {
            S.config.tatSource = 'classic';
            window.api.setConfig({ tatSource: 'classic' });
          }
          render();
        });
      });
    }

    var fetchOnline = document.getElementById('fetchOnlineImgs');
    if (fetchOnline) {
      fetchOnline.addEventListener('click', function () {
        fetchOnline.disabled = true;
        toast('Fetching public-domain pictures — a few seconds, the museum is asked politely…');
        window.api
          .tatOnline({ count: 20 })
          .then(function (res) {
            fetchOnline.disabled = false;
            if (res && res.ok) {
              toast(res.added + ' new picture(s) added — library now ' + res.total);
              return window.api.tatLibrary().then(function (lib) {
                S.tatLibrary = lib || [];
                render();
              });
            }
            if (res && res.error === 'offline') toast('Turn on Online lookup in Settings first.');
            else if (res && res.error === 'blocked') toast('The museum refused the request just now — try again in a minute.');
            else toast('No new pictures were available just now.');
          })
          .catch(function (err) {
            fetchOnline.disabled = false;
            toast('Picture fetch failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    var gs = document.getElementById('goSettings');
    if (gs) gs.addEventListener('click', function () { goto('settings'); });

    var go = document.getElementById('go');
    if (go) {
      go.disabled = !sets.length;
      go.addEventListener('click', function () { start(test, S.pending.setIndex); });
    }
  }

  function timingSummary(test) {
    if (test === 'wat') return S.config.watPerWordSec + 's per word × 60';
    if (test === 'srt') return S.config.srtTotalMin + ' minutes total';
    return S.config.tatViewSec + 's view + ' + tatThinkSec() + 's idea + ' + (S.config.tatWriteSec / 60) + ' min write × 12 slides';
  }

  /* ------------------------------------------------------------ run start */

  function start(test, setIndex) {
    var sets = allSets(test);
    var set = sets[setIndex];
    if (!set) {
      toast('That practice set is unavailable');
      return;
    }
    var items;

    if (test === 'wat') {
      items = set.items.map(function (w) { return { prompt: w, response: '' }; });
      if (S.config.shuffleWAT) items = shuffle(items);
    } else if (test === 'srt') {
      items = set.items.map(function (s) { return { prompt: s, response: '' }; });
      if (S.config.shuffleSRT) items = shuffle(items);
    } else {
      items = buildTatSlides(set);
    }

    S.session = {
      test: test,
      setName: set.name,
      items: items,
      index: 0,
      phase: test === 'tat' ? 'view' : 'run',
      deadline: 0,
      remaining: 0,
      paused: false,
      pausedRemaining: 0,
      startedAt: Date.now(),
      endedAt: null,
      stopwatch: 0
    };

    window.api.keepAwake(true);
    // A cue at the start, and one at the end, so the test can be run with your
    // eyes on the paper rather than the screen.
    cue('start');
    S.view = 'run:' + test;
    if (test === 'wat') mountWat();
    else if (test === 'srt') mountSrt();
    else mountTat();
    startTick();
  }

  // Picks the pictures for one TAT set. Every file in a set is different, and
  // pictures used in the last few sets are held back, so the same scene does
  // not come round again and again. The ids remembered are the library ids,
  // not the paths, so nothing depends on where a file happens to sit.
  // The picture source picks the pool: the classic TAT set by default, the
  // big museum library, or your own folder once it holds at least eleven.
  // TAT and PPDT draw on the same pictures: the bundled set plus any you upload.
  function picturePool() {
    return (S.ppdt || []).concat((S.tatImages || []).filter(Boolean).map(function (p, i) {
      return { id: 'mine-' + i, file: p, title: 'My picture ' + (i + 1) };
    }));
  }

  function tatPool() {
    return picturePool();
  }

  function pickTatPictures(count) {
    var pool = tatPool();
    if (pool.length < count) return [];

    var seen = {};
    var unique = [];
    pool.forEach(function (p) {
      var id = String(p.id || p.file);
      var file = String(p.file);
      if (seen[id] || seen[file]) return;
      seen[id] = 1;
      seen[file] = 1;
      unique.push(p);
    });
    if (unique.length < count) return [];

    var recent = {};
    (S.config.tatRecent || []).forEach(function (id) {
      recent[String(id)] = 1;
    });
    var fresh = [];
    var used = [];
    unique.forEach(function (p) {
      (recent[String(p.id)] ? used : fresh).push(p);
    });

    // Hold back as many recent pictures as the pool allows (220 at most), so
    // a small set still comes round only after every other picture has been used.
    var hold = Math.min(220, Math.max(0, unique.length - count));
    var pick = shuffle(fresh).concat(shuffle(used)).slice(0, count);
    S.config.tatRecent = pick
      .map(function (p) { return String(p.id); })
      .concat(S.config.tatRecent || [])
      .slice(0, hold);
    window.api.setConfig({ tatRecent: S.config.tatRecent });
    return pick;
  }

  function buildTatSlides(set) {
    var picked = pickTatPictures(11);
    var slides = [];
    if (picked.length >= 11) {
      slides = picked.slice(0, 11).map(function (p, i) {
        return { kind: 'image', src: fileUrl(p.file), prompt: p.title || ('Picture ' + (i + 1)), response: '' };
      });
    } else {
      var raw = builtinRaw('tat');
      var byId = raw.filter(function (s) { return s.id === set.id; })[0];
      var scenes = (byId && byId.scenes) || set.items || [];
      for (var j = 0; j < 11; j++) {
        slides.push({ kind: 'scene', prompt: scenes[j] || 'Blank slide', response: '' });
      }
    }
    slides.push({ kind: 'blank', prompt: 'Blank slide — write your own story', response: '' });
    return slides;
  }

  /* --------------------------------------------------------------- ticking */

  function startTick() {
    stopTick();
    TICK = setInterval(tick, 100);
  }

  function stopTick() {
    if (TICK) clearInterval(TICK);
    TICK = null;
  }

  function tatThinkSec() {
    return (S.config && S.config.tatThinkSec) || 30;
  }

  function durationFor(session) {
    if (session.test === 'wat') return S.config.watPerWordSec * 1000;
    if (session.test === 'srt') return S.config.srtTotalMin * 60 * 1000;
    return session.phase === 'view' ? S.config.tatViewSec * 1000 : session.phase === 'think' ? tatThinkSec() * 1000 : S.config.tatWriteSec * 1000;
  }

  function tick() {
    var s = S.session;
    if (!s || !S.refs) return;
    s.stopwatch = Date.now() - s.startedAt;
    if (s.paused) return;

    s.remaining = s.deadline - Date.now();
    var dur = durationFor(s);

    if (s.test === 'wat') {
      if (s.remaining <= 0) {
        advanceWat();
        return;
      }
      updateBar(S.refs.bar, s.remaining / dur);
      S.refs.clock.textContent = Math.ceil(s.remaining / 1000);
      S.refs.clock.classList.toggle('urgent', s.remaining <= 5000);
    } else if (s.test === 'srt') {
      if (s.remaining <= 0) {
        finish('time');
        return;
      }
      S.refs.clock.textContent = clock(s.remaining);
      S.refs.clock.classList.remove('low', 'critical');
      if (s.remaining <= 60000) S.refs.clock.classList.add('critical');
      else if (s.remaining <= 300000) S.refs.clock.classList.add('low');
    } else {
      if (s.remaining <= 0) {
        if (s.phase === 'view') toThinkPhase();
        else if (s.phase === 'think') toWritePhase();
        else advanceTat();
        return;
      }
      updateBar(S.refs.bar, s.remaining / dur);
      S.refs.clock.textContent = clock(s.remaining);
      // The warning is a share of the phase, not a fixed minute: a 30-second
      // practice write would otherwise be "one minute left" from the start.
      var warn =
        s.phase !== 'write'
          ? Math.min(10000, Math.max(3000, S.config.tatViewSec * 1000 * 0.34))
          : Math.min(60000, Math.max(5000, S.config.tatWriteSec * 1000 * 0.25));
      S.refs.clock.classList.toggle('urgent', s.remaining <= warn);
      if (S.refs.writeClockNum && S.refs.writeStage && !S.refs.writeStage.hidden) {
        S.refs.writeClockNum.textContent = clock(s.remaining);
        S.refs.writeClockNum.classList.toggle('urgent', s.remaining <= warn);
        // The warning sits a little above the digits, where the eye already
        // is, so it does not need the clock itself to change colour.
        var wn = document.getElementById('wsWarn');
        if (wn) {
          wn.hidden = s.remaining > warn;
          wn.textContent =
            s.remaining <= 10000 ? 'Ten seconds left' : warn <= 30000 ? 'Almost time' : 'One minute left';
        }
      }
    }
  }

  function updateBar(bar, frac) {
    if (!bar) return;
    var pct = Math.max(0, Math.min(1, frac)) * 100;
    bar.style.width = pct.toFixed(2) + '%';
    var prog = bar.parentNode;
    if (prog) prog.classList.toggle('warn', pct < 25);
  }

  function pauseResume() {
    var s = S.session;
    if (!s) return;
    if (s.paused) {
      s.paused = false;
      s.deadline = Date.now() + s.pausedRemaining;
    } else {
      s.paused = true;
      s.pausedRemaining = Math.max(0, s.deadline - Date.now());
      s.remaining = s.pausedRemaining;
    }
    var btn = document.getElementById('pauseBtn');
    if (btn) btn.textContent = s.paused ? 'Resume' : 'Pause';
    if (S.refs && S.refs.clock) S.refs.clock.textContent = s.paused ? 'PAUSED' : S.refs.clock.textContent;
    if (s.test === 'tat') applyTatPhase();
    else {
      var ta = document.querySelector('textarea.answer');
      if (ta) ta.disabled = s.paused;
    }
    return s.paused;
  }

  /* --------------------------------------------------------------- WAT run */

  // The WAT screen is deliberately answer-free: you write in a practice copy,
  // so the app shows the word, its plain meaning and one large clock. Nothing
  // here can be typed into, which keeps the practice true to the real test.
  function mountWat() {
    var s = S.session;
    var dur = S.config.watPerWordSec;
    shell(
      '<div class="run">' +
        '<div class="runbar">' +
        '<span class="chip ok">WAT</span>' +
        '<span class="chip">' + esc(s.setName) + '</span>' +
        '<span class="chip" id="counter"></span>' +
        '<span class="spacer"></span>' +
        '<button class="btn ghost sm" id="pauseBtn">Pause</button>' +
        '<button class="btn danger sm" data-end="1">End &amp; review</button>' +
        '</div>' +
        '<div class="runbody">' +
        '<div class="progress"><i id="bar"></i></div>' +
        '<div class="wat-stage solo">' +
        '<div class="wat-clock" id="clock">' + dur + '</div>' +
        '<div class="word" id="word"></div>' +
        '<div class="wat-meaning" id="meaning"></div>' +
        '<div class="wat-copy">Write your sentence in your practice copy. Nothing is typed here — ' +
        'the next word appears on its own.</div>' +
        '</div>' +
        '<div class="footbar">' +
        '<span class="hint">The word changes automatically after <b>' + dur + ' seconds</b>, exactly as in the real test. ' +
        'Never leave a word blank — even a short, positive sentence counts.</span>' +
        '<span class="right">' +
        '<button class="btn primary sm" id="nextBtn">Next word →</button></span>' +
        '</div>' +
        '</div>' +
        '</div>'
    );

    S.refs = {
      bar: document.getElementById('bar'),
      clock: document.getElementById('clock'),
      word: document.getElementById('word'),
      meaning: document.getElementById('meaning'),
      counter: document.getElementById('counter')
    };

    document.getElementById('nextBtn').addEventListener('click', function () { advanceWat(); });
    document.getElementById('pauseBtn').addEventListener('click', pauseResume);
    document.querySelector('[data-end]').addEventListener('click', function () { finish('manual'); });

    S.session.deadline = Date.now() + dur * 1000;
    paintWat();
  }

  function paintWat() {
    var s = S.session;
    if (!s) return;
    S.refs.word.textContent = s.items[s.index].prompt;
    S.refs.counter.textContent = 'Word ' + (s.index + 1) + ' / ' + s.items.length;
    S.refs.clock.classList.remove('urgent');
    if (!s.paused) {
      S.refs.clock.textContent = Math.ceil(Math.max(0, s.deadline - Date.now()) / 1000);
    }
    updateBar(S.refs.bar, 1);
    showMeaning(s.items[s.index].prompt);
  }

  // A plain-language meaning for the current word. The built-in sets ship a
  // hand-written line; any other word (a custom set, or an online set) falls
  // back to the shortest definition in the offline dictionary.
  function showMeaning(word) {
    if (!S.refs || !S.refs.meaning) return;
    var key = String(word || '').toLowerCase().trim();
    var hint = (S.hints || {})[key];
    if (hint && hint.simple) {
      S.refs.meaning.textContent = hint.simple;
      return;
    }
    S.refs.meaning.textContent = '';
    var token = ++S.meaningToken;
    window.api
      .dictGet(key)
      .then(function (res) {
        if (token !== S.meaningToken || !S.refs || !S.refs.meaning) return;
        if (!res || !res.ok || !res.entry || !res.entry.senses.length) return;
        var best = res.entry.senses[0].def;
        res.entry.senses.forEach(function (s) {
          if (s.def && s.def.length < best.length) best = s.def;
        });
        S.refs.meaning.textContent = best;
      })
      .catch(function () {});
  }

  function advanceWat() {
    var s = S.session;
    if (!s) return;
    s.index++;
    if (s.index >= s.items.length) {
      finish('complete');
      return;
    }
    if (!s.paused) s.deadline = Date.now() + S.config.watPerWordSec * 1000;
    else s.pausedRemaining = S.config.watPerWordSec * 1000;
    paintWat();
    cue('next');
  }

  /* --------------------------------------------------------------- SRT run */

  // The SRT has no typing box, like the WAT and the TAT: the reaction is
  // written in the practice copy. The run therefore tracks how many
  // situations you have been through rather than what you typed - a
  // situation counts as answered the moment you move away from it. Older
  // attempts still carry the answers that were typed before this changed.
  function itemDone(it) {
    return !!it.done || !!String(it.response || '').trim();
  }

  function mountSrt() {
    var s = S.session;
    shell(
      '<div class="run">' +
        '<div class="runbar">' +
        '<span class="chip ok">SRT</span>' +
        '<span class="chip">' + esc(s.setName) + '</span>' +
        '<span class="chip" id="counter"></span>' +
        '<span class="spacer"></span>' +
        '<span class="countdown-big" id="clock"></span>' +
        '<button class="btn ghost sm" id="pauseBtn">Pause</button>' +
        '<button class="btn danger sm" data-end="1">End &amp; review</button>' +
        '</div>' +
        '<div class="runbody srtpage">' +
        '<div class="srt-grid">' +
        '<div class="srt-main">' +
        // The real test gives you a booklet and a pen, not a text box: the run
        // screen points at the practice copy instead of collecting typing.
        '<div class="situation" id="situation"></div>' +
        '<div class="srt-copy"><b>Write your reaction in your practice copy</b>' +
        '<span>One line per situation, in the same order as the numbers.</span></div>' +
        '<div class="footbar">' +
        '<button class="btn sm" id="prevBtn">← Previous</button>' +
        '<button class="btn sm" id="nextBtn">Next →</button>' +
        '<span class="right small muted">There is no per-situation clock in the real test — only the total.</span>' +
        '</div>' +
        '</div>' +
        '<div class="nav-panel">' +
        '<h3>Situations</h3>' +
        '<span class="small muted" id="answered"></span>' +
        '<div class="nav-grid" id="navGrid"></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>'
    );

    var grid = document.getElementById('navGrid');
    for (var i = 0; i < s.items.length; i++) {
      var b = document.createElement('button');
      b.className = 'qbtn';
      b.textContent = String(i + 1);
      b.setAttribute('data-i', String(i));
      b.addEventListener('click', function (e) {
        gotoItem(parseInt(e.currentTarget.getAttribute('data-i'), 10));
      });
      grid.appendChild(b);
    }

    S.refs = {
      clock: document.getElementById('clock'),
      situation: document.getElementById('situation'),
      counter: document.getElementById('counter'),
      answered: document.getElementById('answered'),
      grid: grid
    };

    document.getElementById('prevBtn').addEventListener('click', function () { gotoItem(S.session.index - 1); });
    document.getElementById('nextBtn').addEventListener('click', function () { gotoItem(S.session.index + 1); });
    document.getElementById('pauseBtn').addEventListener('click', pauseResume);
    document.querySelector('[data-end]').addEventListener('click', function () { finish('manual'); });

    s.deadline = Date.now() + S.config.srtTotalMin * 60 * 1000;
    paintSrt();
  }

  function gotoItem(i) {
    var s = S.session;
    if (!s) return;
    if (i < 0 || i >= s.items.length) return;
    // Leaving a situation marks it answered: the answer itself is in the
    // practice copy, so the count can only be "how many you have passed".
    s.items[s.index].done = true;
    s.index = i;
    paintSrt();
  }

  function paintSrt() {
    var s = S.session;
    if (!s) return;
    S.refs.situation.textContent = s.items[s.index].prompt;
    S.refs.counter.textContent = 'Situation ' + (s.index + 1) + ' of ' + s.items.length;
    paintSrtNav();
  }

  function paintSrtNav() {
    var s = S.session;
    if (!s || !S.refs || !S.refs.grid) return;
    var kids = S.refs.grid.children;
    var done = 0;
    for (var i = 0; i < kids.length; i++) {
      var answered = !!(s.items[i] && itemDone(s.items[i]));
      if (answered) done++;
      kids[i].classList.toggle('answered', answered);
      kids[i].classList.toggle('current', i === s.index);
    }
    S.refs.answered.textContent = done + ' of ' + s.items.length + ' answered';
  }

  /* --------------------------------------------------------------- TAT run */

  function mountTat() {
    var s = S.session;
    shell(
      '<div class="run">' +
        '<div class="runbar">' +
        '<span class="chip ok">TAT</span>' +
        '<span class="chip">' + esc(s.setName) + '</span>' +
        '<span class="chip" id="counter"></span>' +
        '<span class="spacer"></span>' +
        '<button class="btn ghost sm" id="peekBtn">Re-show prompt</button>' +
        '<button class="btn ghost sm" id="pauseBtn">Pause</button>' +
        '<button class="btn danger sm" data-end="1">End &amp; review</button>' +
        '</div>' +
        '<div class="runbody">' +
        '<div class="progress"><i id="bar"></i></div>' +
        '<div class="tat-stage">' +
        '<div class="slidebox" id="slidebox">' +
        '<div class="phase" id="phase">Viewing</div>' +
        '<div class="clocknum" id="clock">30</div>' +
        '<div id="slideContent"></div>' +
        '</div>' +
        '<div class="tat-copy"><span>' + S.config.tatViewSec + ' seconds with the picture, ' + tatThinkSec() + ' seconds without it to form your idea, then ' +
        (S.config.tatWriteSec / 60) + ' minutes to write in your practice copy.</span></div>' +
        '</div>' +
        '<div class="footbar">' +
        '<span class="hint" id="hint"></span>' +
        '<span class="right"><button class="btn primary sm btn-next" id="nextBtn">Next slide →</button></span>' +
        '</div>' +
        '</div>' +
        // Writing gets a sheet of its own over the whole window: no picture, no
        // run bar, no slide counter - just the time, the slide number and the
        // one button that moves on, exactly as the board works.
        '<div class="write-stage" id="writeStage" hidden>' +
        '<div class="ws-top"><span class="ws-phase">Writing</span><span class="ws-slide" id="wsSlide"></span></div>' +
        '<div class="ws-main">' +
        '<div class="ws-warn" id="wsWarn" hidden>One minute left</div>' +
        '<div class="ws-num" id="writeClockNum">4:00</div>' +
        '<div class="ws-sub" id="wsSub">Write the story in your practice copy</div>' +
        '</div>' +
        '<div class="ws-actions">' +
        '<button class="btn ghost" id="peekBtn2">Show prompt</button>' +
        '<button class="btn ghost" data-end="2">End &amp; review</button>' +
        '<button class="btn primary btn-next" id="nextBtn2">Next slide →</button>' +
        '</div>' +
        '</div>' +
        '<button class="btn primary peek-back" id="peekBack" hidden>Back to the clock</button>' +
        '</div>'
    );

    S.refs = {
      bar: document.getElementById('bar'),
      clock: document.getElementById('clock'),
      phase: document.getElementById('phase'),
      slideContent: document.getElementById('slideContent'),
      slidebox: document.getElementById('slidebox'),
      writeStage: document.getElementById('writeStage'),
      writeClockNum: document.getElementById('writeClockNum'),
      counter: document.getElementById('counter'),
      hint: document.getElementById('hint')
    };

    function nextSlide() {
      if (!S.session) return;
      if (S.session.phase === 'view') toThinkPhase();
      else if (S.session.phase === 'think') toWritePhase();
      else advanceTat();
    }
    document.getElementById('nextBtn').addEventListener('click', nextSlide);
    document.getElementById('nextBtn2').addEventListener('click', nextSlide);
    // The one deliberate exception: you asked to see the picture again. The
    // clock steps aside, and a single button brings it back.
    function togglePeek() {
      var live = S.session;
      if (!live || live.phase !== 'write') return;
      live.peeking = !live.peeking;
      applyTatPhase();
      toast(live.peeking
        ? 'Prompt shown again — in the real test it stays out of sight.'
        : 'Back to the writing clock.');
    }
    document.getElementById('peekBtn').addEventListener('click', togglePeek);
    document.getElementById('peekBtn2').addEventListener('click', togglePeek);
    document.getElementById('peekBack').addEventListener('click', togglePeek);
    document.getElementById('pauseBtn').addEventListener('click', pauseResume);
    Array.prototype.forEach.call(document.querySelectorAll('[data-end]'), function (b) {
      b.addEventListener('click', function () { finish('manual'); });
    });

    s.phase = 'view';
    s.deadline = Date.now() + S.config.tatViewSec * 1000;
    paintTat();
  }

  function paintTat() {
    var s = S.session;
    if (!s) return;
    var item = s.items[s.index];
    var content = '';
    if (item.kind === 'image') content = '<img class="slide-img" src="' + esc(item.src) + '" alt="TAT practice picture" />';
    else if (item.kind === 'blank') content = '<div class="slide-blank">Blank slide — the twelfth slide is always blank. Write your own story here.</div>';
    else content = '<div class="slide-text">' + esc(item.prompt) + '</div>';
    S.refs.slideContent.innerHTML = content;
    S.refs.counter.textContent = 'Slide ' + (s.index + 1) + ' / ' + s.items.length;
    s.peeking = false;
    applyTatPhase();
  }

  function applyTatPhase() {
    var s = S.session;
    if (!s || !S.refs || s.test !== 'tat') return;
    var thinking = s.phase === 'think';
    var viewing = s.phase === 'view' || thinking;
    var peeking = !viewing && !!s.peeking;
    S.refs.phase.textContent = thinking ? 'Picture removed' : viewing ? 'Viewing' : 'Writing';
    S.refs.clock.textContent = thinking ? tatThinkSec() : viewing ? S.config.tatViewSec : clock(S.config.tatWriteSec * 1000);
    if (thinking) S.refs.slideContent.innerHTML = '<div class="tat-think"><b>Analyse and create your idea</b><span>Who is the hero, what led to this, what do they do, and how does it end?</span></div>';
    // The picture is never on screen while the story is being written: the
    // clock covers the whole window instead, which is what the board does.
    S.refs.slideContent.hidden = !viewing && !peeking;
    if (S.refs.writeStage) S.refs.writeStage.hidden = viewing || peeking;
    if (S.refs.writeClockNum && !viewing) {
      S.refs.writeClockNum.textContent = clock(Math.max(0, s.deadline - Date.now()));
    }
    var slideLabel = document.getElementById('wsSlide');
    if (slideLabel) slideLabel.textContent = 'Slide ' + (s.index + 1) + ' of ' + s.items.length;
    var sub = document.getElementById('wsSub');
    if (sub) sub.textContent = 'Write the story in your practice copy · ' + (S.config.tatWriteSec / 60) + ' minutes';
    var back = document.getElementById('peekBack');
    if (back) back.hidden = !peeking;
    S.refs.hint.textContent = viewing ? '' : 'Aim for a clear beginning, a practical action and a settled ending.';
    document.getElementById('peekBtn').style.display = 'none';
    if (!s.paused) updateBar(S.refs.bar, 1);
  }

  function toThinkPhase() {
    var s = S.session;
    s.phase = 'think';
    s.deadline = Date.now() + tatThinkSec() * 1000;
    applyTatPhase();
    cue('next');
  }

  function toWritePhase() {
    var s = S.session;
    s.phase = 'write';
    s.peeking = false;
    s.deadline = Date.now() + S.config.tatWriteSec * 1000;
    applyTatPhase();
    cue('write');
  }

  function advanceTat() {
    var s = S.session;
    if (!s) return;
    s.index++;
    if (s.index >= s.items.length) {
      finish('complete');
      return;
    }
    s.phase = 'view';
    s.deadline = Date.now() + S.config.tatViewSec * 1000;
    paintTat();
    cue('next');
  }

  /* ----------------------------------------------------------- finishing */

  function finish(reason) {
    var s = S.session;
    if (!s) return;
    if (S.refs && S.refs.input) s.items[s.index].response = S.refs.input.value;
    // The situation you are looking at when you stop has been worked on too.
    if (s.test === 'srt') s.items[s.index].done = true;
    stopTick();
    cue('end');
    window.api.keepAwake(false);
    s.endedAt = Date.now();

    var answered = s.items.filter(function (i) { return itemDone(i); }).length;
    var record = {
      test: s.test,
      setName: s.setName,
      startedAt: new Date(s.startedAt).toISOString(),
      endedAt: new Date(s.endedAt).toISOString(),
      durationMs: s.endedAt - s.startedAt,
      reason: reason,
      total: s.items.length,
      answered: answered,
      // WAT and TAT only move forward, so the slide on screen is how far you got.
      reached: Math.min(s.items.length, s.index + 1),
      items: s.items.map(function (i) {
        return { prompt: i.prompt, kind: i.kind || 'text', src: i.src || '', response: i.response || '' };
      })
    };

    S.lastResult = record;
    window.api.addAttempt(record).then(function (saved) {
      S.attempts.unshift(saved);
      S.session = null;
      S.refs = null;
      S.view = 'result';
      render();
    });
  }

  /* -------------------------------------------------------- result view */

  // Five model sentences per word, one per style the SSB looks for: a natural
  // first thought, a positive outlook, a leadership response, a factual
  // statement and a general remark. Written by hand for the built-in sets.
  var SENTENCE_STYLES = [
    { key: 'natural', label: 'Natural' },
    { key: 'positive', label: 'Positive' },
    { key: 'leadership', label: 'Leadership' },
    { key: 'factual', label: 'Factual' },
    { key: 'general', label: 'General' }
  ];

  function hintFor(word) {
    return (S.hints || {})[String(word || '').toLowerCase().trim()] || null;
  }

  // Your own five sentences for a word, saved on this machine. Kept beside the
  // built-in models so you can compare what you wrote with what the app offers.
  function savedSentencesFor(word) {
    var all = (S.config && S.config.watSentences) || {};
    return all[String(word || '').toLowerCase().trim()] || null;
  }

  function mySentencesHtml(word) {
    var key = String(word || '').toLowerCase().trim();
    var saved = savedSentencesFor(word) || {};
    var mine = SENTENCE_STYLES.map(function (st) {
      var v = saved[st.key];
      if (!v) return '';
      return (
        '<div class="mine-row">' +
        '<span class="mine-tag">My ' + st.label.toLowerCase() + '</span>' +
        '<span class="mine-text">' + esc(v) + '</span>' +
        '</div>'
      );
    }).join('');

    var fields = SENTENCE_STYLES.map(function (st) {
      return (
        '<label class="mine-field"><span>' + st.label + '</span>' +
        '<input type="text" data-wsent="' + esc(key) + '" data-wstyle="' + st.key + '" value="' + esc(saved[st.key] || '') + '" spellcheck="false" placeholder="' + st.label + ' sentence" />' +
        '</label>'
      );
    }).join('');

    return (
      '<div class="mine">' +
      mine +
      '<details class="mine-edit">' +
      '<summary>' + (mine ? 'Edit my sentences' : 'Write my own five sentences') + '</summary>' +
      '<div class="mine-fields">' + fields + '</div>' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn sm" data-wsave="' + esc(key) + '">Save my sentences</button>' +
      '</div>' +
      '</details>' +
      '</div>'
    );
  }

  // Saves are wired after each render, on the buttons that are on screen.
  function wireMySentences() {
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-wsave]'), function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-wsave');
        var set = {};
        Array.prototype.forEach.call(appEl.querySelectorAll('[data-wsent]'), function (f) {
          if (f.getAttribute('data-wsent') !== key) return;
          set[f.getAttribute('data-wstyle')] = String(f.value || '').trim();
        });
        S.config.watSentences = S.config.watSentences || {};
        S.config.watSentences[key] = set;
        window.api.setConfig({ watSentences: S.config.watSentences }).then(function () {
          toast('Saved your sentences for \u201c' + key + '\u201d');
          render();
        });
      });
    });
  }

  function modelSentencesHtml(word) {
    var h = hintFor(word);
    if (!h) return '';
    var lines = SENTENCE_STYLES.map(function (st) {
      var text = h[st.key];
      if (!text) return '';
      return (
        '<div class="model-row">' +
        '<span class="model-tag ' + st.key + '">' + st.label + '</span>' +
        '<span class="model-text">' + esc(text) + '</span>' +
        '</div>'
      );
    }).join('');

    // Sixth line: the word as it actually appeared in today's news. Only shown
    // when a headline really contains the word, and attributed, never invented.
    var news = newsExampleFor(word);
    if (news) {
      lines +=
        '<div class="model-row">' +
        '<span class="model-tag news">News</span>' +
        '<span class="model-text">“' + esc(news.text) + '”' +
        (news.source || news.date
          ? ' <span class="muted small">— ' + esc([news.source, news.date].filter(Boolean).join(', ')) + '</span>'
          : '') +
        '</span>' +
        '</div>';
    }
    return (
      '<div class="model-word">' +
      '<div class="model-head"><b>' + esc(word) + '</b>' +
      (h.simple ? '<span class="small muted">' + esc(h.simple) + '</span>' : '') +
      '</div>' +
      lines +
      mySentencesHtml(word) +
      '</div>'
    );
  }

  function tatGalleryHtml(items) {
    return (items || []).map(function (it, i) {
      return (
        '<figure class="tat-thumb">' +
        (it.src
          ? '<img src="' + esc(it.src) + '" alt="Slide ' + (i + 1) + '" />'
          : '<div class="tat-thumb-ph">' + esc(it.prompt) + '</div>') +
        '<figcaption>' + (i + 1) + '. ' + esc(it.prompt) + '</figcaption>' +
        '</figure>'
      );
    }).join('');
  }

  // Attempts saved before `reached` existed only know the set size.
  function practised(r) {
    return r.reached && r.reached < r.total ? r.reached + ' / ' + r.total : String(r.total);
  }

  function renderResult() {
    var r = S.lastResult;
    // The news line for a WAT word needs the headline index; ask once, off the
    // clock, and the screen simply renders without it if nothing comes back.
    if (r && r.test === 'wat' && !S.newsIndex && !S.newsLoading) loadNewsIndex(false);
    if (!r) {
      goto('home');
      return;
    }
    var m = META[r.test];
    // WAT and TAT were never typed into; an SRT attempt from before this
    // change can still carry its typed answers, which are shown as they are.
    var blankText = r.test === 'srt' ? 'written in your practice copy' : 'left blank';
    var rows = r.items
      .map(function (it, i) {
        var ans = String(it.response || '').trim();
        return (
          '<div class="qa">' +
          '<div class="n">' + (i + 1) + '</div>' +
          '<div class="q">' + esc(it.prompt) + '</div>' +
          '<div class="a' + (ans ? '' : ' blank') + '">' + (ans ? esc(ans) : blankText) + '</div>' +
          '</div>'
        );
      })
      .join('');

    var isWat = r.test === 'wat';
    var isTat = r.test === 'tat';
    var stats = isWat
      ? '<div class="stat">' +
        '<div class="box"><div class="num">' + practised(r) + '</div><div class="lbl">words practised</div></div>' +
        '<div class="box"><div class="num">' + clock(r.durationMs) + '</div><div class="lbl">time on task</div></div>' +
        '<div class="box"><div class="num">' + r.items.filter(function (i) { return !!hintFor(i.prompt); }).length + '</div><div class="lbl">with model sentences</div></div>' +
        '</div>'
      : isTat
        ? '<div class="stat">' +
          '<div class="box"><div class="num">' + practised(r) + '</div><div class="lbl">slides practised</div></div>' +
          '<div class="box"><div class="num">' + clock(r.durationMs) + '</div><div class="lbl">time on task</div></div>' +
          '<div class="box"><div class="num">' + (r.reason === 'manual' ? 'ended early' : 'completed') + '</div><div class="lbl">session</div></div>' +
          '</div>'
        : '<div class="stat">' +
          '<div class="box"><div class="num">' + r.answered + ' / ' + r.total + '</div><div class="lbl">answered in copy</div></div>' +
          '<div class="box"><div class="num">' + (r.total - r.answered) + '</div><div class="lbl">not reached</div></div>' +
          '<div class="box"><div class="num">' + clock(r.durationMs) + '</div><div class="lbl">time on task</div></div>' +
          '</div>';

    var models = isWat
      ? r.items.map(function (it) { return modelSentencesHtml(it.prompt); }).join('')
      : '';
    var answerSection = isWat
      ? '<h2>Model sentences — five ways to answer each word</h2>' +
        '<p class="lead small">Read them against what you wrote in your copy. One natural reaction, one positive, ' +
        'one leadership, one factual and one general sentence — the shapes SSB assessors look for.</p>' +
        '<div class="card model-list">' +
        (models || '<div class="muted">No model sentences for this set — it was not one of the built-in sets.</div>') +
        '</div>'
      : isTat
        ? '<h2>Slides you practised</h2>' +
          '<p class="lead small">You wrote these in your practice copy. The pictures are listed in the order they came, ' +
          'including the blank twelfth slide.</p>' +
          '<div class="card tat-gallery">' + tatGalleryHtml(r.items) + '</div>'
        : r.test === 'srt'
          ? '<h2>Situations you practised</h2>' +
            '<p class="lead small">Your reactions are in your practice copy. The situations are listed in the order they came, ' +
            'and an answer typed on an older version of this screen is still shown.</p>' +
            '<div class="card">' + rows + '</div>'
          : '<h2>Your answers</h2>' +
            '<div class="card">' + rows + '</div>';

    body(
      '<h1>' + m.code + ' attempt saved</h1>' +
        '<p class="lead">' + esc(r.setName) + ' · ' + fmtDate(r.startedAt) + ' · ' + clock(r.durationMs) + ' spent' +
        (r.reason === 'manual' ? ' (ended early)' : r.reason === 'time' ? ' (time up)' : ' (set completed)') + '</p>' +
        stats +
        '<div class="row" style="margin:20px 0">' +
        '<button class="btn primary" id="again">Practise this set again</button>' +
        '<button class="btn" id="export">' + (onPhone() ? 'Copy this attempt' : 'Export this attempt (.txt)') + '</button>' +
        '<button class="btn ghost" id="home">Home</button>' +
        '</div>' +
        answerSection
    );

    document.getElementById('again').addEventListener('click', function () {
      var idx = allSets(r.test).map(function (s) { return s.name; }).indexOf(r.setName);
      start(r.test, idx < 0 ? 0 : idx);
    });
    document.getElementById('export').addEventListener('click', function () {
      window.api
        .exportText({ defaultName: 'SSB-' + r.test.toUpperCase() + '-' + r.setName.replace(/\s+/g, '-') + '.txt', text: attemptToText(r) })
        .then(function (res) {
          if (res && res.saved) toast(res.path === 'clipboard' ? 'Copied — paste it into any app' : 'Saved to ' + res.path);
        });
    });
    document.getElementById('home').addEventListener('click', function () { goto('home'); });
    wireMySentences();
  }

  function attemptToText(r) {
    var lines = [];
    lines.push('SSB Prep Trainer — ' + META[r.test].code + ' practice attempt');
    lines.push('Set: ' + r.setName);
    lines.push('Started: ' + fmtDate(r.startedAt) + '   Duration: ' + clock(r.durationMs));
    lines.push('Answered: ' + r.answered + ' of ' + r.total);
    lines.push('');
    r.items.forEach(function (it, i) {
      lines.push((i + 1) + '. ' + it.prompt);
      if (r.test === 'wat') {
        var h = hintFor(it.prompt);
        if (h && h.simple) lines.push('   Meaning: ' + h.simple);
        SENTENCE_STYLES.forEach(function (st) {
          if (h && h[st.key]) lines.push('   ' + st.label + ': ' + h[st.key]);
        });
      } else if (r.test === 'tat') {
        lines.push('   (written in your practice copy)');
      } else if (r.test === 'srt') {
        var typed = String(it.response || '').trim();
        lines.push('   ' + (typed || '(written in your practice copy)').replace(/\n/g, '\n   '));
      } else {
        lines.push('   ' + (String(it.response || '').trim() || '(left blank)').replace(/\n/g, '\n   '));
      }
      lines.push('');
    });
    return lines.join('\r\n');
  }

  /* -------------------------------------------------------------- PPDT */

  // Picture Perception and Description Test: a hazy picture for a short look,
  // a moment to note the characters (number, age, sex, mood, action), then the
  // story in your practice copy. Afterwards the picture is shown clearly with
  // five model stories (Problem -> Action -> Outcome, one per officer-like
  // quality angle), written ahead for some pictures and on request for any.
  var PPDT_TYPES = ['Leadership', 'Social responsibility', 'Courage in a crisis', 'Initiative and achievement', 'Teamwork'];

  function ppdtState() {
    if (!S.pp) S.pp = { mode: 'setup', pic: null, phase: 'view', deadline: 0, remaining: 0, paused: false, timer: null,
      model: null, tab: 0, gen: null };
    return S.pp;
  }

  function ppdtCfg(key, dflt) {
    var v = S.config[key];
    return v == null || v === '' ? dflt : Number(v);
  }

  function ppdtPhases() {
    return [
      { id: 'view', label: 'Look', secs: ppdtCfg('ppdtViewSec', 30) },
      { id: 'think', label: 'Think', secs: ppdtCfg('ppdtThinkSec', 30) },
      { id: 'write', label: 'Write', secs: ppdtCfg('ppdtWriteSec', 240) }
    ].filter(function (p) { return p.secs > 0; });
  }

  // A PPDT picture, and now and then a classic TAT plate (as boards do),
  // never one seen in the last 150 rounds while others remain.
  function ppdtPick() {
    var pool = picturePool();
    if (!pool.length) return null;
    var recent = S.config.ppdtRecent || [];
    var fresh = pool.filter(function (p) { return recent.indexOf(String(p.id)) < 0; });
    var pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
    S.config.ppdtRecent = [String(pick.id)].concat(recent).slice(0, 150);
    window.api.setConfig({ ppdtRecent: S.config.ppdtRecent });
    return pick;
  }

  function stopPpdtTimer() {
    var P = ppdtState();
    if (P.timer) clearInterval(P.timer);
    P.timer = null;
  }

  function renderPpdt() {
    var P = ppdtState();
    if (P.mode === 'run' && P.pic) return mountPpdt();
    if (P.mode === 'review' && P.pic) return renderPpdtReview();
    var phases = ppdtPhases();
    body(
      '<button class="btn ghost sm" id="back">← Back</button>' +
        '<h1 style="margin-top:14px">PPDT — Picture Perception and Description Test</h1>' +
        '<p class="lead">At the board a hazy picture is shown for a short time. You note the characters — how many, their age, ' +
        'sex and mood (positive, negative or neutral) and what they are doing — then write a story: what led to the scene, ' +
        'what the hero does, and how it ends. Afterwards you narrate it and the group discusses.</p>' +
        '<p class="small muted">Pick the hero in the first seconds; give them a name and age.</p>' +
        '<div class="card">' +
        '<div class="field"><label>This round<br><span class="small muted">Change the times and the blur in Settings</span></label>' +
        '<div class="ctl muted small">' + phases.map(function (p) { return p.label + ' ' + (p.secs >= 120 ? Math.round(p.secs / 60) + ' min' : p.secs + 's'); }).join(' · ') +
        ' · blur ' + ppdtCfg('ppdtBlur', 40) + '%</div></div>' +
        '<div class="field"><label>Pictures<br><span class="small muted">' + (S.ppdt || []).length + ' PPDT pictures' +
        '</span></label>' +
        '<div class="ctl"><button class="btn primary" id="ppdtGo">Start PPDT</button></div></div>' +
        '</div>' +
        '<div class="note" style="margin-top:12px"><b>A story that scores:</b> ' +
        'about 2 lines on what led to the scene, 4–5 on what the hero does step by step, 2 on a realistic outcome. ' +
        'Stay with what the picture shows — no invented disasters — and write in the past tense.</div>'
    );
    document.getElementById('back').addEventListener('click', function () { goto('home'); });
    document.getElementById('ppdtGo').addEventListener('click', startPpdt);
  }

  function startPpdt() {
    var P = ppdtState();
    var pic = ppdtPick();
    if (!pic) return toast('No PPDT pictures are loaded in this copy of the app yet.');
    P.pic = pic;
    P.mode = 'run';
    P.model = null;
    P.gen = null;
    P.tab = 0;
    P.paused = false;
    P.phaseIdx = 0;
    P.remaining = ppdtPhases()[0].secs;
    P.deadline = Date.now() + P.remaining * 1000;
    window.api.keepAwake(true);
    cue('start');
    render();
  }

  function mountPpdt() {
    var P = ppdtState();
    var blurPx = (ppdtCfg('ppdtBlur', 40) / 100) * 8;
    shell(
      '<div class="run">' +
        '<div class="runbar">' +
        '<span class="chip ok">PPDT</span>' +
        '<span class="chip" id="ppdtPhase"></span>' +
        '<span class="spacer"></span>' +
        '<span class="countdown-big" id="ppdtClock"></span>' +
        '<button class="btn ghost sm" id="ppdtPause">Pause</button>' +
        '<button class="btn sm" id="ppdtNext">Next →</button>' +
        '<button class="btn danger sm" id="ppdtEnd">End &amp; review</button>' +
        '</div>' +
        '<div class="runbody">' +
        '<div class="progress"><i id="ppdtBar"></i></div>' +
        '<div class="ppdt-stage" id="ppdtStage">' +
        '<img class="ppdt-img" id="ppdtImg" alt="PPDT picture" src="' + esc(fileUrl(P.pic.file)) + '" style="filter:blur(' + blurPx.toFixed(1) + 'px) contrast(0.85) grayscale(0.25)" />' +
        '<div class="ppdt-note" id="ppdtNote" hidden></div>' +
        '</div>' +
        '</div>' +
        '</div>'
    );
    document.getElementById('ppdtPause').addEventListener('click', function () {
      P.paused = !P.paused;
      if (!P.paused) P.deadline = Date.now() + P.remaining * 1000;
      paintPpdt();
    });
    document.getElementById('ppdtNext').addEventListener('click', function () { ppdtNextPhase(); });
    document.getElementById('ppdtEnd').addEventListener('click', function () { finishPpdt(); });
    paintPpdt();
    stopPpdtTimer();
    P.timer = setInterval(ppdtTick, 250);
  }

  function paintPpdt() {
    var P = ppdtState();
    var phases = ppdtPhases();
    var ph = phases[P.phaseIdx];
    var clockEl = document.getElementById('ppdtClock');
    if (!clockEl || !ph) return;
    clockEl.textContent = clock(P.remaining * 1000);
    clockEl.classList.toggle('low', P.remaining <= 10);
    document.getElementById('ppdtPhase').textContent = ph.label + ' · ' + (P.phaseIdx + 1) + ' of ' + phases.length;
    document.getElementById('ppdtPause').textContent = P.paused ? 'Resume' : 'Pause';
    document.getElementById('ppdtBar').style.width = (Math.max(0, Math.min(1, P.remaining / ph.secs)) * 100).toFixed(1) + '%';
    var img = document.getElementById('ppdtImg');
    var note = document.getElementById('ppdtNote');
    img.hidden = ph.id !== 'view';
    note.hidden = ph.id === 'view';
    if (ph.id === 'think') {
      note.innerHTML = '<h2>Note it in your copy</h2><p>How many characters · age · sex · mood (+ / − / neutral) · what each is doing.</p>' +
        '<p>Then decide your hero and what they will do.</p>';
    } else if (ph.id === 'write') {
      note.innerHTML = '<div class="ws-num">' + clock(P.remaining * 1000) + '</div>' +
        '<p>Write the story in your practice copy: what led to it, what the hero does, how it ends.</p>';
    }
  }

  function ppdtNextPhase() {
    var P = ppdtState();
    var phases = ppdtPhases();
    if (P.phaseIdx >= phases.length - 1) return finishPpdt();
    P.phaseIdx += 1;
    P.remaining = phases[P.phaseIdx].secs;
    P.deadline = Date.now() + P.remaining * 1000;
    cue(phases[P.phaseIdx].id === 'write' ? 'write' : 'next');
    paintPpdt();
  }

  function ppdtTick() {
    var P = ppdtState();
    if (S.view !== 'ppdt' || P.mode !== 'run') return stopPpdtTimer();
    if (P.paused) return;
    P.remaining = Math.max(0, Math.ceil((P.deadline - Date.now()) / 1000));
    if (P.remaining === 0) return ppdtNextPhase();
    paintPpdt();
  }

  function finishPpdt() {
    var P = ppdtState();
    stopPpdtTimer();
    cue('end');
    window.api.keepAwake(false);
    P.mode = 'review';
    P.model = null;
    render();
    window.api.ppdtStories(P.pic.id).then(function (res) {
      P.model = res || false;
      if (S.view === 'ppdt' && P.mode === 'review') render();
    });
  }

  function ppdtGenError(r) {
    if (!r) return 'Nothing came back.';
    if (r.error === 'offline') return 'Turn online lookup on in Settings to write stories.';
    return aiErrorText(r);
  }

  function renderPpdtReview() {
    var P = ppdtState();
    var m = P.model;
    var perc = m && m.perception;
    var stories = (m && m.stories) || [];
    var tab = Math.min(P.tab || 0, Math.max(0, stories.length - 1));
    var s = stories[tab];
    var chars = perc && perc.characters ? perc.characters.map(function (c) {
      return '<li><b>' + esc(c.who || 'person') + '</b> — ' + esc([c.age ? c.age + ' yrs' : '', c.gender, c.mood].filter(Boolean).join(', ')) +
        (c.action ? ': ' + esc(c.action) : '') + '</li>';
    }).join('') : '';
    var model = m === null
      ? '<div class="empty">Opening the model stories…</div>'
      : stories.length
        ? (perc ? '<div class="card"><h3>What the picture shows</h3><ul class="ppdt-chars">' + chars + '</ul>' +
            (perc.setting ? '<p class="small muted">' + esc(perc.setting) + (perc.theme ? ' — ' + esc(perc.theme) : '') + '</p>' : '') + '</div>' : '') +
          '<div class="tabs ppdt-tabs">' + stories.map(function (st, i) {
            return '<button class="navlink' + (i === tab ? ' active' : '') + '" data-pptab="' + i + '">' + esc(st.type || PPDT_TYPES[i] || 'Story ' + (i + 1)) + '</button>';
          }).join('') + '</div>' +
          '<div class="card ppdt-story"><h3>' + esc(s.title || s.type) + '</h3><p>' + esc(s.story) + '</p>' +
          (s.olqs && s.olqs.length ? '<div class="words">' + s.olqs.map(function (q) { return '<span class="chip">' + esc(q) + '</span>'; }).join('') + '</div>' : '') +
          '</div>'
        : '<div class="note">No model stories for this picture yet. Press <b>Write 5 stories</b> to have them written now.</div>';
    body(
      '<h1>PPDT — compare your story</h1>' +
        '<div class="ppdt-review"><img class="ppdt-img clear" alt="PPDT picture" src="' + esc(fileUrl(P.pic.file)) + '" /></div>' +
        '<div class="row" style="margin:14px 0">' +
        '<button class="btn primary" id="ppdtAgain">Next picture</button>' +
        '<button class="btn" id="ppdtGen"' + (P.gen && P.gen.busy ? ' disabled' : '') + '>' +
        (P.gen && P.gen.busy ? 'Writing stories…' : stories.length ? 'Write 5 new stories' : 'Write 5 stories') + '</button>' +
        '<button class="btn danger" id="ppdtDrop">Take this picture out</button>' +
        '<button class="btn ghost" id="ppdtHome">Dashboard</button></div>' +
        (P.gen && P.gen.error ? '<div class="note">' + esc(P.gen.error) + '</div>' : '') +
        model +
        '<p class="small muted" style="margin-top:12px">Model stories are a guide to the shape, not answers to copy: ' +
        'compare your hero, your actions and your ending with them.' + (m && m.model ? ' Written by ' + esc(m.model) + '.' : '') + '</p>'
    );
    document.getElementById('ppdtAgain').addEventListener('click', startPpdt);
    document.getElementById('ppdtHome').addEventListener('click', function () { P.mode = 'setup'; goto('home'); });
    document.getElementById('ppdtDrop').addEventListener('click', function () {
      var gone = P.pic;
      P.mode = 'setup';
      dropPicture({ id: gone.id, kind: 'library', file: gone.file, title: gone.title, source: gone.source });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-pptab]'), function (b) {
      b.addEventListener('click', function () { P.tab = parseInt(b.getAttribute('data-pptab'), 10); render(); });
    });
    document.getElementById('ppdtGen').addEventListener('click', function () {
      if (P.gen && P.gen.busy) return;
      var pic = P.pic;
      P.gen = { busy: true };
      render();
      aiFirstWorking(aiChain(true), function (ai) { return window.api.ppdtGenerate(pic.id, pic.file, ai); }).then(function (r) {
        if (P.pic !== pic) return;
        P.gen = { busy: false, error: r && r.ok ? '' : ppdtGenError(r) };
        if (r && r.ok) {
          P.model = { perception: r.perception, stories: r.stories, model: r.model };
          P.tab = 0;
          toast('Five stories written');
        }
        if (S.view === 'ppdt') render();
      });
    });
  }

  /* ------------------------------------------------------- free AI writing */

  // All of these answer the same chat API, so a provider is only an address and
  // a model name. They are tried in this order until one answers, so one being
  // down or out of free quota never stops the writing.
  var AI_PROVIDERS = {
    local: { label: 'Ollama app on this PC', base: 'http://localhost:11434/v1', model: 'gemma4:31b-cloud', pc: true, vision: true },
    // Needs no account and no key, so a shared copy can write lectures from its first run.
    free: { label: 'Pollinations (no login)', base: 'https://text.pollinations.ai/openai', model: 'openai', noLogin: true,
      // Left to itself this model spends its whole allowance thinking and returns nothing.
      extra: { max_tokens: 4000, reasoning_effort: 'low' } },
    gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash', url: 'https://aistudio.google.com/apikey', vision: true },
    groq: { label: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', url: 'https://console.groq.com/keys' },
    openrouter: { label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openrouter/free', url: 'https://openrouter.ai/keys' },
    ollama: { label: 'Ollama cloud', base: 'https://ollama.com/v1', model: 'gemma4:31b', url: 'https://ollama.com/settings/keys', vision: true }
  };

  // Keys built into this copy of the app (data/ai-keys.json), so a person it is
  // shared with has working AI with no setup. A key they paste themselves goes first.
  var AI_BUILT_IN = {};
  Promise.resolve(window.api.aiBuiltIn && window.api.aiBuiltIn()).then(function (k) { AI_BUILT_IN = k || {}; }, function () {});

  function aiSettings(id) {
    var c = S.config || {};
    var p = AI_PROVIDERS[id];
    var mine = (c.aiKeys || {})[id] || (id === 'ollama' ? c.ollamaKey : '') || '';
    return { id: id, label: p.label, base: p.base, extra: p.extra, model: (c.aiModels || {})[id] || p.model, key: mine || AI_BUILT_IN[id] || '' };
  }

  function aiChain(needPicture) {
    return Object.keys(AI_PROVIDERS).filter(function (id) {
      var p = AI_PROVIDERS[id];
      if (needPicture && !p.vision) return false;
      return p.pc ? !onPhone() : p.noLogin || !!aiSettings(id).key;
    }).map(aiSettings);
  }

  function aiReady() {
    return !!(S.config && S.config.onlineEnabled) && aiChain().length > 0;
  }

  // ask(settings) -> a result; moves down the chain until one succeeds.
  function aiFirstWorking(chain, ask) {
    var at = 0;
    var last = { ok: false, error: 'no-key' };
    var next = function () {
      if (at >= chain.length) return Promise.resolve(last);
      return Promise.resolve(ask(chain[at++])).then(function (r) {
        if (r && r.ok) return r;
        last = r || last;
        if (last.error === 'offline') return last;
        return next();
      }, function (err) {
        last = { ok: false, error: 'failed', detail: err && err.message };
        return next();
      });
    };
    return next();
  }

  function aiAsk(prompt) {
    return aiFirstWorking(aiChain(), function (ai) { return window.api.aiChat({ ai: ai, prompt: prompt }); });
  }

  function aiErrorText(r) {
    if (!r) return 'Nothing came back.';
    if (r.error === 'offline') return 'Turn Online lookup on first.';
    if (r.error === 'no-key') return 'This needs an AI that can read pictures. In Settings → AI writing, press Log in / Sign up next to Google Gemini and paste the free key.';
    if (r.error === 'no-ai') return 'The Ollama app is not running on this PC, and no other provider has a key. Open it or add a key in Settings.';
    if (r.error === 'bad-key') return 'The provider refused this key. Copy it again with no spaces (' + (r.detail || '') + ').';
    if (r.error === 'busy') return 'Every free limit is used up for now. Wait a minute, or add another provider in Settings.';
    return 'The AI did not answer (' + (r.detail || r.error || 'unknown') + ').';
  }

  var LECT_PROMPT =
    'Act as an SSB (Services Selection Board) lecturette coach. Write a confident, well-structured 3-minute lecturette in simple English.\n' +
    'TOPIC: {{topic}}\n\n' +
    'Structure:\n' +
    '1. Introduction, 30 seconds: a natural greeting, introduce the topic, its meaning and definition, a brief history or background.\n' +
    '2. Body, 2 minutes: cover what fits the topic: present situation, major causes, advantages and disadvantages or both sides, comparison with a related issue, ' +
    'impact on India, society, the economy, national security or the world. Include at least one fact, figure or recent news example from the FACTS below. ' +
    'Discuss government initiatives, achievements, shortcomings or practical solutions where relevant.\n' +
    '3. Conclusion, 30 seconds: summarise the message, future possibilities and key challenges, practical steps, a clear balanced personal opinion, a strong closing sentence ending with "Thank you."\n\n' +
    'Rules:\n' +
    '- Simple, natural, everyday English that an SSB candidate would speak aloud. Short sentences and smooth transitions. No difficult words.\n' +
    '- At least 370 words and at most 420: an answer under 350 words is a failure. Use four to six body paragraphs. Full sentences only, never bullet points.\n' +
    '- Sound like a real candidate speaking to assessors, not an academic essay.\n' +
    '- Adapt the structure to the topic; do not force history or advantages where they do not fit. Focus on India where appropriate.\n' +
    '- Every number, date, name of a report and quotation must come from the FACTS below. Never invent one. If the FACTS have no quote, use no quote.\n\n' +
    'Answer with JSON only, in this shape:\n' +
    '{"intro":["paragraph"],"body":[{"head":"short heading","text":"paragraph"}],"conclusion":["paragraph"],"keywords":["5 to 7 memory cues"],"line":"one strong line to remember"}\n\n' +
    'FACTS:\n{{facts}}';

  // A sentence with a figure the sources do not hold is taken out: a model's
  // made-up statistic must never reach a candidate who will repeat it to a board.
  function lectVerified(text, facts) {
    var have = String(facts).replace(/,/g, '');
    return String(text).replace(/([.!?])\s+(?=[A-Z"])/g, '$1\n').split('\n').filter(function (s) {
      return (s.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) || []).every(function (n) {
        return n.length < 2 || have.indexOf(n) >= 0;
      });
    }).join(' ');
  }

  // The model's answer -> the same shape lectCompose() gives, or null if it is not a lecture.
  function lectFromAi(text, facts, sources, model) {
    var out;
    try {
      out = JSON.parse(String(text).slice(String(text).indexOf('{'), String(text).lastIndexOf('}') + 1));
    } catch (_) {
      return null;
    }
    var clean = function (list) {
      return (Array.isArray(list) ? list : [list]).map(function (p) { return lectVerified(p, facts); }).filter(Boolean);
    };
    var bodyParts = (Array.isArray(out.body) ? out.body : []).map(function (b) {
      return typeof b === 'string' ? { head: '', text: b } : b;
    }).filter(function (b) { return b && b.text; });
    var speech = {
      intro: clean(out.intro),
      body: bodyParts.map(function (b) { return lectVerified(b.text, facts); }),
      conclusion: clean(out.conclusion),
      heads: bodyParts.map(function (b) { return b.head || ''; })
    };
    var countAll = function () { return lectWordCount(speech.intro.concat(speech.body, speech.conclusion)); };
    // Three minutes is three minutes: a long answer loses the last sentence of its longest paragraph.
    for (var guard = 0; countAll() > 420 && guard < 60; guard++) {
      var at = 0;
      speech.body.forEach(function (p, i) { if (p.length > speech.body[at].length) at = i; });
      var parts = String(speech.body[at]).replace(/([.!?])\s+(?=[A-Z"])/g, '$1\n').split('\n');
      if (parts.length < 2) {
        if (speech.body.length < 3) break;
        speech.body.pop();
        speech.heads.pop();
        continue;
      }
      parts.pop();
      speech.body[at] = parts.join(' ');
    }
    var words = countAll();
    if (words < 220 || !speech.intro.length || !speech.conclusion.length) return null;
    return {
      speech: speech, words: words, keywords: (out.keywords || []).slice(0, 7), line: out.line || '',
      sources: sources, model: model, writtenAt: new Date().toISOString()
    };
  }

  // Timeline threads that speak to this topic: most of its telling words in one headline.
  function timelineFor(topic) {
    var want = (String(topic).toLowerCase().match(/[a-z]{4,}/g) || []).filter(function (w) { return LECT_STOP.indexOf(w) < 0 && w !== 'india'; });
    if (!want.length) return [];
    return (S.timeline || []).map(function (t) {
      var text = t.events.map(function (e) { return e.headline; }).join(' ').toLowerCase();
      return { t: t, n: want.filter(function (w) { return text.indexOf(w) >= 0; }).length };
    }).filter(function (x) { return x.n >= Math.ceil(want.length * 0.6); })
      .sort(function (a, b) { return b.n - a.n || timelineLast(b.t).localeCompare(timelineLast(a.t)); })
      .slice(0, 5).map(function (x) { return x.t; });
  }

  function timelineLast(t) {
    return t.events[t.events.length - 1].date;
  }

  function timelineEventsHtml(t) {
    return '<ol class="tl-events">' + t.events.map(function (e) {
      return '<li><div class="small muted">' + esc(e.date) + (e.sources && e.sources.length ? ' · ' + esc(e.sources.slice(0, 3).join(', ')) : '') + '</div>' +
        '<b>' + esc(e.headline) + '</b>' + (e.text ? '<p>' + esc(e.text) + '</p>' : '') +
        (/^https?:\/\//.test(e.link || '') ? '<button class="btn sm ghost" data-external="' + esc(e.link) + '">Open the source</button>' : '') +
        (e.paperArt ? '<button class="btn sm ghost" data-tlcut="' + esc(e.paperArt) + '">Show the cut-out</button><div class="paper-cut" hidden></div>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function timelineCard(t) {
    var n = t.events.length - 1;
    return '<details class="card tl-thread"><summary><b>' + esc(t.events[n].headline) + '</b>' +
      (n ? ' <span class="chip ok">' + n + ' follow-up' + (n > 1 ? 's' : '') + '</span>' : '') +
      '<div class="small muted">' + esc(t.section) + ' · ' + esc(t.events[0].date) + (n ? ' to ' + esc(timelineLast(t)) : '') + '</div></summary>' +
      timelineEventsHtml(t) + '</details>';
  }

  function loadTimeline() {
    return Promise.resolve(window.api.timelineLoad ? window.api.timelineLoad() : []).then(function (list) {
      return paperIntoTimeline(list || []).catch(function () { return list || []; });
    }).then(function (list) {
      S.timeline = list;
    }).catch(function () { S.timeline = []; });
  }

  // The saved newspapers add their stories to the timeline: a story that
  // matches an existing thread (most of its headline words are shared) joins it
  // as a follow-up, the rest start their own thread under the paper's section.
  // Each such event keeps its article id, so the timeline can show the cut-out.
  // The newspaper's sections, filed under the timeline's own tabs (the ones
  // the News Digest uses), so the tabs do not split in two.
  var TL_SECTION = { policy: 'National', polity: 'Politics', natsec: 'National', border: 'Defence', defence: 'Defence',
    intsec: 'WAR SECTION', ir: 'International', economy: 'Economic', editorial: 'Miscellaneous', other: 'National' };
  var TL_STOP = ['with', 'from', 'that', 'this', 'will', 'after', 'over', 'into', 'says', 'said', 'amid', 'more', 'than', 'have', 'been', 'their', 'about', 'india'];
  function tlWords(s) {
    var seen = {};
    return (String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter(function (w) {
      if (TL_STOP.indexOf(w) >= 0 || seen[w]) return false;
      seen[w] = 1;
      return true;
    });
  }
  function tlSame(a, b) {
    if (a.length < 2 || b.length < 2) return false;
    var shared = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
    return shared >= 2 && shared / Math.min(a.length, b.length) >= 0.6;
  }

  function paperIntoTimeline(list) {
    var SP = window.SSBPaper;
    if (!SP || !SP.db || !SP.db.all) return Promise.resolve(list);
    return SP.db.all().then(function (papers) {
      var threads = list.map(function (t) {
        return { section: t.section, title: t.title, id: t.id, events: t.events.slice(), words: tlWords(t.events.map(function (e) { return e.headline; }).join(' ')) };
      });
      S.tlArts = {};
      (papers || []).sort(function (a, b) { return a.addedAt - b.addedAt; }).forEach(function (p) {
        var date = new Date(p.addedAt).toISOString().slice(0, 10);
        var name = String(p.name || 'Newspaper').replace(/\.pdf$/i, '');
        (p.articles || []).forEach(function (a) {
          if (!a || a.brief || !a.headline || (a.words || 0) < 120 || (a.priority || 0) < 45) return;
          S.tlArts[a.id] = a;
          var ev = { date: date, headline: a.headline, text: (a.points && a.points[0]) || '', sources: [name + ', page ' + a.page], paperArt: a.id };
          var w = tlWords(a.headline);
          var hit = threads.filter(function (t) { return tlSame(w, t.words); })[0];
          if (hit) {
            if (hit.events.some(function (e) { return e.headline === ev.headline; })) return;
            hit.events.push(ev);
            hit.events.sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); });
            hit.words = hit.words.concat(w.filter(function (x) { return hit.words.indexOf(x) < 0; }));
          } else {
            threads.push({ section: TL_SECTION[a.sectionKey] || 'National', title: a.headline, id: 'paper-' + a.id, events: [ev], words: w });
          }
        });
      });
      return threads.map(function (t) { return { section: t.section, title: t.title, id: t.id, events: t.events }; });
    });
  }

  // Opens the newspaper cut-out of one timeline event in place.
  function wireTimelineCuts(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-tlcut]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-tlcut');
        var a = S.tlArts && S.tlArts[id];
        var holder = b.nextElementSibling;
        if (!a || !holder) return;
        if (!holder.hidden) { holder.hidden = true; b.textContent = 'Show the cut-out'; return; }
        holder.hidden = false;
        b.textContent = 'Hide the cut-out';
        if (holder.getAttribute('data-done')) return;
        holder.setAttribute('data-done', '1');
        holder.innerHTML = '<span class="small muted">Loading the cut-out…</span>';
        window.SSBPaper.db.cut(id).then(function (c) {
          if (!c || !c.blob) {
            holder.innerHTML = '<span class="small muted">No cut-out kept for this story (pictures are kept for the newest 5 papers only).</span>';
            return;
          }
          var url = URL.createObjectURL(c.blob);
          holder.innerHTML = paperCutHtml(a, url, c.w);
          var wrap = holder.querySelector('.cut-wrap');
          holder.querySelector('[data-cutmarks]').addEventListener('click', function (e) {
            var off = wrap.classList.toggle('nomarks');
            e.target.textContent = off ? 'Show marks' : 'Hide marks';
          });
          holder.querySelector('[data-cutzoom]').addEventListener('click', function (e) {
            var on = wrap.classList.toggle('zoomed');
            e.target.textContent = on ? 'Zoom out' : 'Zoom in';
          });
        }, function () {
          holder.innerHTML = '<span class="small muted">The cut-out could not be opened.</span>';
        });
      });
    });
  }

  function renderTimeline() {
    if (!S.timeline) {
      body('<h1>News Timeline</h1><div class="empty">Opening your timeline…</div>');
      loadTimeline().then(function () { if (S.view === 'timeline') renderTimeline(); });
      return;
    }
    var V = S.tlView || (S.tlView = { section: 'All', q: '', only: false });
    var counts = { All: S.timeline.length };
    S.timeline.forEach(function (t) { counts[t.section] = (counts[t.section] || 0) + 1; });
    var q = V.q.toLowerCase();
    var list = S.timeline.filter(function (t) {
      return (V.section === 'All' || t.section === V.section) && (!V.only || t.events.length > 1) &&
        (!q || JSON.stringify(t.events).toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return timelineLast(b).localeCompare(timelineLast(a)) || b.events.length - a.events.length; });
    body(
      '<h1>News Timeline</h1>' +
      '<p class="lead">Every story from your digests and your newspapers (high and medium priority), section by section. A later report on the same story is added under it as a follow-up; a newspaper story has its cut-out one tap away.</p>' +
      '<div class="tabs">' + Object.keys(counts).map(function (s) {
        return '<button class="navlink' + (s === V.section ? ' active' : '') + '" data-tlsec="' + esc(s) + '">' + esc(s) + ' (' + counts[s] + ')</button>';
      }).join('') + '</div>' +
      '<div class="row" style="margin:12px 0"><input id="tlSearch" type="search" class="textinput" placeholder="Search a topic" value="' + esc(V.q) + '" />' +
      '<label class="small"><input id="tlOnly" type="checkbox"' + (V.only ? ' checked' : '') + ' /> Only with follow-ups</label></div>' +
      '<div class="small muted">' + list.length + ' stories' + (list.length > 200 ? ', newest 200 shown' : '') + '</div>' +
      (list.length ? list.slice(0, 200).map(timelineCard).join('') : '<div class="empty">Nothing here yet. Each digest you make adds to this screen.</div>')
    );
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tlsec]'), function (b) {
      b.addEventListener('click', function () { V.section = b.getAttribute('data-tlsec'); renderTimeline(); });
    });
    var box = document.getElementById('tlSearch');
    box.addEventListener('change', function () { V.q = box.value; renderTimeline(); });
    document.getElementById('tlOnly').addEventListener('change', function (e) { V.only = e.target.checked; renderTimeline(); });
    wireExternal(appEl);
    wireTimelineCuts(appEl);
  }

  /* ------------------------------------------- Important Topics Database */
  // The list and the PDFs live on the repo's `topics-db` branch; window.api
  // fetches them (main process on Windows, mobile/topics.js on the phone).

  var TOPIC_CATS = ['All', 'INDL PSN', 'Additional', 'Know Your Armed Forces', 'GD Guide', 'Coaching'];

  function topicsState() {
    return S.topicsDb || (S.topicsDb = { data: null, loading: false, q: '', cat: 'All', mine: false, busy: {} });
  }

  function loadTopics(force) {
    var T = topicsState();
    T.loading = true;
    var ask = function () { return Promise.resolve(window.api.topicsIndex({ force: !!force })); };
    return ask()
      // A phone that has just woken up can take a few seconds to get its
      // network back, so a failed first fetch is tried once more on its own.
      .then(function (r) {
        if (r && !r.index && r.enabled) {
          return new Promise(function (res) { setTimeout(res, 3000); }).then(ask);
        }
        return r;
      })
      .then(function (r) { T.data = r || { ok: false }; })
      .catch(function (e) { T.data = { ok: false, error: (e && e.message) || 'unknown' }; })
      .then(function () {
        T.loading = false;
        if (S.view === 'topics') renderTopics();
      });
  }

  function topicSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
  }

  function topicError(e) {
    if (e === 'online-off') return 'Turn on Online in Settings to download topics.';
    if (e === 'not-in-list') return 'That topic is no longer in the list. Tap "Check for new topics".';
    if (e === 'not-downloaded') return 'Download the topic first.';
    return 'Could not do that (' + (e || 'unknown') + ').';
  }

  function topicRow(t) {
    var T = topicsState();
    var mine = (T.data.local || {})[t.file];
    var st = T.busy[t.file] ? 'busy' : !mine ? 'none' : mine === t.sha256 ? 'have' : 'old';
    var f = esc(t.file);
    var btns =
      st === 'busy'
        ? '<button class="btn sm" disabled>Downloading…</button>'
        : st === 'none'
          ? '<button class="btn primary sm" data-tpget="' + f + '">Download</button>'
          : (st === 'old' ? '<button class="btn primary sm" data-tpget="' + f + '">Update</button>' : '') +
            '<button class="btn' + (st === 'have' ? ' primary' : '') + ' sm" data-tpopen="' + f + '">Open</button>' +
            '<button class="btn ghost sm" data-tpdel="' + f + '" title="Remove the copy on this device">×</button>';
    return (
      '<div class="card lectcard"><div class="lechead"><div>' +
      '<div class="lectitle"><span class="chip">' + esc(t.id) + '</span> ' + esc(t.title) + '</div>' +
      '<div class="small muted">' + esc(t.category) +
      (t.remarks ? ' · Remarks ' + esc(t.remarks) : '') +
      (t.see ? ' · same notes as topic ' + esc(t.see) : '') +
      ' · ' + esc(String(t.pages)) + ' pages · ' + topicSize(t.size) +
      (st === 'have' ? ' · <b>on this device</b>' : '') +
      (st === 'old' ? ' · <b>new version available</b>' : '') +
      '</div></div><div class="row">' + btns + '</div></div></div>'
    );
  }

  function renderTopics() {
    var T = topicsState();
    var head =
      '<h1>Important Topics</h1>' +
      '<p class="lead">Lecturette and GD notes, one PDF per topic. Download a topic once; after that it opens even without internet.</p>';
    if (!T.data) {
      body(head + '<div class="empty">Opening the topic list…</div>');
      if (!T.loading) loadTopics(false);
      return;
    }
    var d = T.data;
    var ix = d.index;
    if (!ix) {
      body(
        head +
          '<div class="empty">' +
          (d.enabled
            ? 'Could not fetch the topic list' + (d.error ? ' (' + esc(d.error) + ')' : '') + '. Check the internet connection and try again.'
            : 'Turn on <b>Online</b> in Settings to fetch the topic list.') +
          '</div><div class="row"><button class="btn primary" id="tpRetry">Try again</button></div>'
      );
      document.getElementById('tpRetry').addEventListener('click', function () {
        T.data = null;
        renderTopics();
        loadTopics(true);
      });
      return;
    }
    var local = d.local || {};
    var q = T.q.toLowerCase();
    var counts = { All: ix.topics.length };
    ix.topics.forEach(function (t) { counts[t.category] = (counts[t.category] || 0) + 1; });
    var list = ix.topics.filter(function (t) {
      return (T.cat === 'All' || t.category === T.cat) && (!T.mine || local[t.file]) &&
        (!q || (t.id + ' ' + t.title + ' ' + (t.remarks || '')).toLowerCase().indexOf(q) >= 0);
    });
    var note = d.source === 'live'
      ? 'list checked just now'
      : 'saved list from ' + (ix.fetchedAt ? new Date(ix.fetchedAt).toLocaleDateString() : ix.updated);
    if (!d.enabled) note += ' · Online is off, so downloads are paused';
    else if (d.error && d.source !== 'live') note += ' · could not refresh (' + d.error + ')';
    body(
      head +
        '<div class="tabs">' +
        TOPIC_CATS.filter(function (c) { return counts[c]; }).map(function (c) {
          return '<button class="navlink' + (c === T.cat ? ' active' : '') + '" data-tpcat="' + esc(c) + '">' + esc(c) + ' (' + counts[c] + ')</button>';
        }).join('') +
        '</div>' +
        '<div class="row" style="margin:12px 0">' +
        '<input id="tpSearch" type="search" class="textinput" placeholder="Search topics" value="' + esc(T.q) + '" />' +
        '<label class="small"><input id="tpMine" type="checkbox"' + (T.mine ? ' checked' : '') + ' /> Downloaded only</label>' +
        '<button class="btn sm" id="tpRefresh">Check for new topics</button>' +
        (onPhone() ? '' : '<button class="btn sm ghost" id="tpFolder">Open folder</button>') +
        '</div>' +
        '<div class="small muted" id="tpStatus">' + list.length + ' shown · ' + Object.keys(local).length + ' of ' + esc(String(ix.files)) +
        ' PDFs on this ' + (onPhone() ? 'phone' : 'computer') + ' · ' + esc(note) + '</div>' +
        (list.length ? list.map(topicRow).join('') : '<div class="empty">No topic matches.</div>')
    );

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tpcat]'), function (b) {
      b.addEventListener('click', function () { T.cat = b.getAttribute('data-tpcat'); renderTopics(); });
    });
    var box = document.getElementById('tpSearch');
    box.addEventListener('change', function () { T.q = box.value; renderTopics(); });
    document.getElementById('tpMine').addEventListener('change', function (e) { T.mine = e.target.checked; renderTopics(); });
    document.getElementById('tpRefresh').addEventListener('click', function () {
      document.getElementById('tpStatus').textContent = 'Checking for new topics…';
      loadTopics(true);
    });
    var folder = document.getElementById('tpFolder');
    if (folder) folder.addEventListener('click', function () { window.api.topicsFolder(); });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tpget]'), function (b) {
      b.addEventListener('click', function () {
        var file = b.getAttribute('data-tpget');
        T.busy[file] = true;
        renderTopics();
        Promise.resolve(window.api.topicsDownload(file)).then(function (r) {
          delete T.busy[file];
          if (r && r.ok) {
            T.data.local = Object.assign({}, T.data.local, (function (o) { o[file] = r.sha; return o; })({}));
            toast('Downloaded. Tap Open to read it.');
          } else {
            toast(topicError(r && r.error));
          }
          if (S.view === 'topics') renderTopics();
        });
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tpopen]'), function (b) {
      b.addEventListener('click', function () {
        Promise.resolve(window.api.topicsOpen(b.getAttribute('data-tpopen'))).then(function (r) {
          if (!r || !r.ok) toast(topicError(r && r.error));
        });
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tpdel]'), function (b) {
      b.addEventListener('click', function () {
        var file = b.getAttribute('data-tpdel');
        Promise.resolve(window.api.topicsRemove(file)).then(function () {
          var next = Object.assign({}, T.data.local);
          delete next[file];
          T.data.local = next;
          toast('Removed from this ' + (onPhone() ? 'phone' : 'computer') + '. You can download it again any time.');
          if (S.view === 'topics') renderTopics();
        });
      });
    });
  }

  /* ------------------------------------------------- Newspaper analyser */
  // The engine is src/renderer/paper.js (window.SSBPaper), shared with the
  // phone. A PDF is read on the device; only the extracted text is kept.

  function paperState() {
    return S.paperUi || (S.paperUi = { list: null, cur: null, tab: 'plan', busy: '', hist: null });
  }

  function paperPriority(p) {
    return p >= 70 ? 'High' : p >= 45 ? 'Medium' : 'Low';
  }

  // Notes from the free AI chain are a study aid only, so the prompt holds the
  // model to the story's own facts.
  var PAPER_AI_PROMPT =
    'You are an SSB interview and group discussion coach. Read this newspaper story and write short study notes in simple English (class 10 level).\n' +
    'Use ONLY facts that are in the story. Do not add any number, name or date that is not in it. If the story does not say something, leave it out.\n\n' +
    'Give, with these headings:\n' +
    'Summary: 3 short lines.\n' +
    'Key facts: up to 5 bullet points, each with its number, name or place.\n' +
    'Why it matters for India: 2 lines.\n' +
    'GD points: one point for and one against.\n' +
    'Interview questions: two questions an SSB interviewer might ask on this.\n' +
    'Think about it: answer each of these questions in 2 short lines, using the story (say plainly if the story does not tell): {{think}}\n' +
    'Since the paper: only if LATEST HEADLINES below are given and are about the same event, up to 3 bullet points on what happened after, ' +
    'each ending with the source and date in brackets. Use only those headlines for this part. If none fit, write "No newer report found."\n\n' +
    'HEADLINE: {{head}}\n\nSTORY:\n{{text}}\n\nLATEST HEADLINES (from Google News, may be newer than the paper):\n{{latest}}';

  function paperLatestText(a) {
    return (a.latest || []).map(function (n) { return '- ' + n.title + ' (' + (n.source || 'news') + ', ' + (n.date || 'recent') + ')'; }).join('\n') || '(none)';
  }

  function paperPrompt(a) {
    var text = a.text.length > 6000 ? a.text.slice(0, 6000) : a.text;
    var think = (a.prompts || []).map(function (q, i) { return (i + 1) + ') ' + q; }).join(' ');
    return PAPER_AI_PROMPT.replace('{{head}}', a.headline).replace('{{text}}', text).replace('{{latest}}', paperLatestText(a)).replace('{{think}}', think);
  }

  // The words to search Google News with: the headline, cut to its key words.
  function paperQuery(a) {
    var words = String(a.headline || '').replace(/[“”"‘’]/g, ' ').replace(/[^A-Za-z0-9&\- ]/g, ' ').split(/\s+/).filter(function (w) {
      return w.length > 2 && !/^(the|and|for|with|from|after|over|into|amid|says|said|will|has|have|was|are|its|new)$/i.test(w);
    });
    return words.slice(0, 7).join(' ');
  }

  // Figures in a fact sentence are shown in bold, so the number is what the eye lands on.
  function paperFactHtml(sv) {
    return esc(sv).replace(/((?:₹|Rs\.?|\$)\s?[\d,.]+(?:\s?(?:crore|lakh|billion|million|trillion))?|\b[\d,.]*\d\s?(?:%|per cent|crore|lakh|billion|million|km|tonnes|MW|GW)|\b(?:19|20)\d\d(?:-\d\d)?\b)/gi, '<b>$1</b>');
  }

  function paperLatestHtml(a) {
    if (a.latest && a.latest.length) {
      return '<ul class="small">' + a.latest.map(function (n) {
        return '<li><a href="#" data-extlink="' + esc(n.link) + '">' + esc(n.title) + '</a> <span class="muted">(' + esc(n.source || 'news') + (n.date ? ', ' + esc(n.date) : '') + ')</span></li>';
      }).join('') + '</ul><div class="small muted">From Google News. Headlines only: open one to read it in the browser.</div>';
    }
    if (a.latest) return '<span class="small muted">No newer report found on the internet.</span>';
    return '<button class="btn ghost sm" data-latestbtn>Find the latest on this</button> <span class="small muted">Needs the internet (no AI key needed).</span>';
  }

  function paperAiHtml(text) {
    return '<div class="paper-ai-text">' + esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(–-])\*([^*\s][^*\n]*?[^*\s]|[^*\s])\*(?=[\s).,;:]|$)/gm, '$1<i>$2</i>').replace(/\n/g, '<br>') + '</div>' +
      '<div class="small muted">Written by an AI from the story\'s text and the latest headlines. Check any fact against the cut-out above before you use it.</div>';
  }

  // The story's cut-out with the key points (yellow) and the facts (green)
  // marked where they are printed. Marks are placed in % of the story's area.
  function paperCutHtml(a, url, px) {
    var b = a.box;
    var W = b[2] - b[0] || 1;
    var H = b[1] - b[3] || 1;
    var pc = function (v) { return Math.max(0, Math.min(100, v)).toFixed(2) + '%'; };
    var marks = (a.marks || []).map(function (m) {
      return '<i class="mk mk-' + m[0] + '" style="left:' + pc(((m[1] - b[0]) / W) * 100) + ';top:' + pc(((b[1] - m[2]) / H) * 100) +
        ';width:' + pc(((m[3] - m[1]) / W) * 100) + ';height:' + pc(((m[2] - m[4]) / H) * 100) + '"></i>';
    }).join('');
    return '<div class="cut-tools small"><span><i class="mk-key mk-k"></i>key points</span><span><i class="mk-key mk-f"></i>numbers and facts</span>' +
      '<button class="btn ghost sm" data-cutmarks>Hide marks</button><button class="btn ghost sm" data-cutzoom>Zoom in</button></div>' +
      // Never wider than the picture itself, so a one-column story stays sharp.
      '<div class="cut-scroll"><div class="cut-wrap" style="--cw:' + (px ? Math.round(px) + 'px' : '100%') + '"><img src="' + url + '" alt="This story as printed in the paper" />' + marks + '</div></div>';
  }

  function paperStory(a, i) {
    var meta = [esc(a.sectionLabel), 'page ' + a.page, paperPriority(a.priority) + ' priority']
      .concat(a.frontPage ? ['front page'] : [])
      .concat(a.countries.length ? [esc(a.countries.join(', '))] : []);
    return (
      '<details class="card paper-story" data-story="' + i + '">' +
      '<summary><b>' + esc(a.headline) + '</b>' +
      (a.deck ? '<div class="small">' + esc(a.deck) + '</div>' : '') +
      '<div class="small muted">' + meta.join(' · ') + '</div></summary>' +
      '<div class="paper-body">' +
      (a.cut ? '<h4>From the page</h4><div class="paper-cut" data-cut="' + i + '"><span class="small muted">Loading the cut-out…</span></div>' : '') +
      '<h4>Key points</h4><ul>' + a.points.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '<h4>Micro-notes</h4><ul class="small">' +
      (a.facts.length ? a.facts.map(function (sv) { return '<li>' + paperFactHtml(sv) + '</li>'; }).join('') : '') +
      (a.terms.length ? '<li><b>Key terms:</b> ' + esc(a.terms.join(', ')) + '</li>' : '') +
      (a.names.length ? '<li><b>Names:</b> ' + esc(a.names.join(', ')) + '</li>' : '') +
      ((a.places || []).length ? '<li><b>Places in India:</b> ' + esc(a.places.join(', ')) + '</li>' : '') +
      '<li><b>Reading time:</b> about ' + a.minutes + ' min for the full story</li>' +
      '</ul>' +
      ((a.glossary || []).length ? '<h4>Short forms</h4><ul class="small">' + a.glossary.map(function (g) { return '<li><b>' + esc(g.abbr) + '</b>: ' + esc(g.full) + '</li>'; }).join('') + '</ul>' : '') +
      ((a.quotes || []).length ? '<h4>Who said what</h4><ul class="small">' + a.quotes.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '') +
      (a.other ? '<h4>The other side <span class="muted small">(from the story, for a balanced GD point)</span></h4><p class="small">' + esc(a.other) + '</p>' : '') +
      '<h4>Think about it <span class="muted small">(answers from the story)</span></h4><ol class="small think">' + a.prompts.map(function (s, qi) {
        var ans = (a.think && a.think[qi]) || [];
        return '<li><b>' + esc(s) + '</b>' +
          (ans.length ? '<div class="think-a">' + ans.map(esc).join(' ') + '</div>'
            : '<div class="think-a muted">The story does not answer this; think it through yourself' + (a.ai ? ' (or see the AI answer below).' : '.') + '</div>') + '</li>';
      }).join('') + '</ol>' +
      '<h4>Line: earlier stories</h4><div class="small paper-line" data-line="' + i + '">Looking for earlier stories…</div>' +
      '<h4>Latest on this <span class="muted">(internet)</span></h4><div class="paper-latest" data-latest="' + i + '">' + paperLatestHtml(a) + '</div>' +
      '<h4>AI notes <span class="muted">(optional)</span></h4><div class="paper-ai" data-ai="' + i + '">' +
      (a.ai ? paperAiHtml(a.ai) : '<button class="btn ghost sm" data-aibtn="' + i + '">Ask the free AI for notes</button>' +
        ' <span class="small muted">Needs the internet. Everything above is made on this ' + (onPhone() ? 'phone' : 'computer') + ' without AI.</span>') +
      '</div>' +
      '<details class="paper-full"><summary class="small">Full text</summary><p class="small">' + esc(a.text) + '</p></details>' +
      '</div></details>'
    );
  }

  function showPaperCut(d, a) {
    var box = d.querySelector('[data-cut]');
    if (!box || box.getAttribute('data-done')) return;
    box.setAttribute('data-done', '1');
    var P = paperState();
    window.SSBPaper.db.cut(a.id).then(function (c) {
      if (!c || !c.blob) {
        if (P.cutting && P.cur && P.cutting.id === P.cur.id) {
          // Still being made in the background: look again in a moment.
          box.innerHTML = '<span class="small muted">Being cut out of the page… it appears here in a moment.</span>';
          setTimeout(function () {
            if (!document.body.contains(box)) return;
            box.removeAttribute('data-done');
            showPaperCut(d, a);
          }, 3000);
          return;
        }
        box.innerHTML = '<span class="small muted">No cut-out for this story (pictures are kept for the newest 5 papers only). The notes are still here.</span>';
        return;
      }
      var url = URL.createObjectURL(c.blob);
      (P.urls = P.urls || []).push(url);
      box.innerHTML = paperCutHtml(a, url, c.w);
      var wrap = box.querySelector('.cut-wrap');
      box.querySelector('[data-cutmarks]').addEventListener('click', function (e) {
        var off = wrap.classList.toggle('nomarks');
        e.target.textContent = off ? 'Show marks' : 'Hide marks';
      });
      box.querySelector('[data-cutzoom]').addEventListener('click', function (e) {
        var big = wrap.classList.toggle('zoom');
        e.target.textContent = big ? 'Zoom out' : 'Zoom in';
      });
    }, function () {
      box.innerHTML = '<span class="small muted">The cut-out could not be opened.</span>';
    });
  }

  function askPaperAi(btn, a) {
    var box = btn.closest('[data-ai]');
    if (!aiReady()) {
      toast('Turn on Online lookup in Settings (AI writing) to use this. The notes above need no AI.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Writing notes…';
    paperFillLatest(a).then(function () { return aiAsk(paperPrompt(a)); }).then(function (r) {
      if (!r || !r.ok || !r.text) {
        btn.disabled = false;
        btn.textContent = 'Ask the free AI for notes';
        toast(aiErrorText(r));
        return;
      }
      a.ai = String(r.text).trim();
      box.innerHTML = paperAiHtml(a.ai);
      paperRefreshStory(a);
      var P = paperState();
      if (P.cur) window.SSBPaper.db.save(P.cur).catch(function () {});
    });
  }

  // Latest coverage of one story; kept on the story, so it shows offline later too.
  function paperFillLatest(a) {
    if (a.latest || !window.api.paperNews || !(S.config && S.config.onlineEnabled)) return Promise.resolve(a.latest || null);
    var q = paperQuery(a);
    if (!q) return Promise.resolve(null);
    return Promise.resolve(window.api.paperNews(q)).then(function (r) {
      if (r && r.ok) a.latest = r.items || [];
      return a.latest || null;
    }, function () { return null; });
  }

  // Redraw one story's internet parts if it is on screen right now.
  function paperRefreshStory(a) {
    var P = paperState();
    if (S.view !== 'paper' || !P.shown) return;
    var i = P.shown.indexOf(a);
    if (i < 0) return;
    var lb = appEl.querySelector('[data-latest="' + i + '"]');
    if (lb) { lb.innerHTML = paperLatestHtml(a); wireLatest(lb, a); }
    var ab = appEl.querySelector('[data-ai="' + i + '"]');
    if (ab && a.ai) ab.innerHTML = paperAiHtml(a.ai);
  }

  // The online helper: with Online lookup on, the most important stories get
  // their latest coverage (Google News, no key) and, when an AI key is set,
  // AI notes, one story at a time in the background. Off with the switch on the
  // paper's screen; nothing here is needed for the offline notes.
  var PAPER_AUTO_MAX = 8;

  function paperAutoOn() {
    return !!(S.config && S.config.onlineEnabled) && S.config.paperAuto !== false;
  }

  function paperAutoStatus() {
    var P = paperState();
    var j = P.auto;
    if (!(S.config && S.config.onlineEnabled)) return 'Online helper: off (turn on Online lookup in Settings to add the latest news and AI notes to the top stories).';
    if (S.config.paperAuto === false) return 'Online helper: paused.';
    if (j && j.id === (P.cur && P.cur.id)) {
      if (!j.total) return 'Online helper: the top stories are already filled in.';
      return j.done >= j.total ? 'Online helper: the top ' + j.total + ' stories have their latest news' + (aiReady() ? ' and AI notes.' : '. Add an AI key in Settings for AI notes too.')
        : 'Online helper: working on story ' + (j.done + 1) + ' of ' + j.total + ' (latest news' + (aiReady() ? ' + AI notes' : '') + ')…';
    }
    return 'Online helper: ready.';
  }

  function paperAutoStart(paper) {
    var P = paperState();
    if (!paper || !paperAutoOn() || (P.auto && P.auto.id === paper.id && P.auto.running)) return;
    var todo = paper.articles.filter(function (a) { return !a.brief && a.words >= 120 && (!a.latest || (aiReady() && !a.ai)); }).slice(0, PAPER_AUTO_MAX);
    if (!todo.length) {
      if (!P.auto || P.auto.id !== paper.id) P.auto = { id: paper.id, total: 0, done: 0 };
      return;
    }
    var job = P.auto = { id: paper.id, total: todo.length, done: 0, running: true };
    var say = function () { var el = document.getElementById('paperAuto'); if (el) el.textContent = paperAutoStatus(); };
    var step = function () {
      if (P.auto !== job || !paperAutoOn() || job.done >= todo.length) { job.running = false; say(); return; }
      var a = todo[job.done];
      paperFillLatest(a).then(function () {
        if (!aiReady() || a.ai) return null;
        return aiAsk(paperPrompt(a)).then(function (r) { if (r && r.ok && r.text) a.ai = String(r.text).trim(); }, function () {});
      }).then(function () {
        job.done++;
        window.SSBPaper.db.save(paper).catch(function () {});
        paperRefreshStory(a);
        say();
        // A short pause between stories keeps inside the free AI limits.
        setTimeout(step, aiReady() ? 2500 : 600);
      });
    };
    say();
    step();
  }

  function wireLatest(box, a) {
    var lbtn = box.querySelector('[data-latestbtn]');
    if (lbtn) lbtn.addEventListener('click', function () {
      if (!(S.config && S.config.onlineEnabled)) { toast('Turn on Online lookup in Settings first.'); return; }
      lbtn.disabled = true;
      lbtn.textContent = 'Searching…';
      a.latest = null;
      paperFillLatest(a).then(function (got) {
        if (!got) { lbtn.disabled = false; lbtn.textContent = 'Find the latest on this'; toast('Could not reach Google News. Try again.'); return; }
        var P = paperState();
        if (P.cur) window.SSBPaper.db.save(P.cur).catch(function () {});
        box.innerHTML = paperLatestHtml(a);
        wireLatest(box, a);
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-extlink]'), function (l) {
      l.addEventListener('click', function (e) {
        e.preventDefault();
        var u = l.getAttribute('data-extlink');
        if (/^https:\/\//.test(u) && window.api.openExternal) window.api.openExternal(u);
      });
    });
  }

  function paperHistory() {
    var P = paperState();
    if (P.hist) return Promise.resolve(P.hist);
    var mine = window.SSBPaper.db.history(P.cur && P.cur.id).catch(function () { return []; });
    var tl = Promise.resolve(window.api.timelineLoad ? window.api.timelineLoad() : []).catch(function () { return []; });
    return Promise.all([mine, tl]).then(function (r) {
      var fromTimeline = [];
      (r[1] || []).forEach(function (t) {
        (t.events || []).forEach(function (e) {
          fromTimeline.push({ headline: e.headline, points: [], date: e.date || '', paper: 'News Timeline', sectionLabel: t.section });
        });
      });
      P.hist = (r[0] || []).concat(fromTimeline);
      return P.hist;
    });
  }

  function wirePaperStories(list) {
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-story]'), function (d) {
      var ai = d.querySelector('[data-aibtn]');
      if (ai) ai.addEventListener('click', function () { askPaperAi(ai, list[+d.getAttribute('data-story')]); });
      var lb = d.querySelector('[data-latest]');
      if (lb) wireLatest(lb, list[+d.getAttribute('data-story')]);
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        var a = list[+d.getAttribute('data-story')];
        if (a.cut) showPaperCut(d, a);
        var box = d.querySelector('[data-line]');
        if (!box || box.getAttribute('data-done')) return;
        paperHistory().then(function (hist) {
          var rel = window.SSBPaper.related(a, hist);
          box.setAttribute('data-done', '1');
          box.innerHTML = rel.length
            ? '<ul>' + rel.map(function (h) {
                return '<li><b>' + esc(h.date) + '</b> · ' + esc(h.headline) + ' <span class="muted">(' + esc(h.paper) + ')</span></li>';
              }).join('') + '</ul>'
            : '<span class="muted">No earlier story on this yet. Each paper you load builds the Line.</span>';
        });
      });
    });
  }

  function paperCutStatus() {
    var c = paperState().cutting;
    return 'Cutting the main stories out of the page in the background' + (c && c.total ? ' (page ' + c.n + ' of ' + c.total + ')' : '') +
      '. You can read meanwhile; each picture appears when it is ready.';
  }

  function loadPaperFile(file) {
    var P = paperState();
    if (P.cutting) {
      toast('The last paper is still being cut out. Load the next one when it finishes.');
      return;
    }
    P.busy = 'Opening ' + file.name + '…';
    renderPaper();
    var say = function (t) {
      P.busy = t;
      var el = document.getElementById('paperBusy');
      if (el) el.textContent = t;
    };
    Promise.all([import('./lib/pdf.min.js'), file.arrayBuffer()])
      .then(function (r) {
        var lib = r[0];
        lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
        return window.SSBPaper.analyze(lib, r[1], file.name, function (n, total, phase) {
          if (phase !== 'cut') return say('Reading page ' + n + ' of ' + total + '…');
          if (!P.cutting) return;
          P.cutting.n = n;
          P.cutting.total = total;
          var el = document.getElementById('paperCutStatus');
          if (el) el.textContent = paperCutStatus();
        }, { background: true });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.detail || res.error);
        if (!res.paper.articles.length) throw new Error('no stories could be found in this PDF');
        say('Saving…');
        return window.SSBPaper.db.save(res.paper).then(function () {
          S.timeline = null; // the new paper's stories join the timeline next time it opens
          if (res.cutting) {
            P.cutting = { id: res.paper.id, n: 0, total: 0 };
            res.cutting.then(function (made) {
              P.cutting = null;
              var el = document.getElementById('paperCutStatus');
              if (el) el.textContent = made + ' stories cut out of the page. Open a story to see it with its key lines marked.';
            });
          }
          return res.paper;
        });
      })
      .then(function (paper) {
        P.busy = '';
        P.list = null;
        P.cur = paper;
        P.tab = 'plan';
        P.hist = null;
        toast(paper.articles.length + ' stories found and sorted' + (paper.adsSkipped ? ', ' + paper.adsSkipped + ' adverts skipped.' : '.'));
        // Only redraw if the Newspaper screen is still showing (the person may
        // have moved on, or be in the guided tour, while the paper was read).
        if (S.view === 'paper') renderPaper();
      })
      .catch(function (err) {
        P.busy = '';
        toast('Could not read that PDF: ' + ((err && err.message) || 'unknown error'));
        if (S.view === 'paper') renderPaper();
      });
  }

  // A paper saved by an older version has no short forms, quotes, "other side"
  // or the fuller fact lines. They come from the story's own text, so they are
  // made again here when the paper is opened (in memory; nothing is lost).
  function paperUpgrade(p) {
    var x = window.SSBPaper && window.SSBPaper._x;
    if (!x || !p || !Array.isArray(p.articles)) return;
    p.articles.forEach(function (a) {
      if (!a || typeof a.text !== 'string') return;
      if (!a.think && x.thinkAnswers) {
        try { a.think = x.thinkAnswers(a.text, a.prompts || []); } catch (_) { /* no answers then */ }
      }
      if (a.quotes !== undefined) return;
      try {
        a.points = a.points || [];
        a.facts = x.facts(a.text, a.points);
        a.glossary = x.glossary(a.text);
        a.quotes = x.quotes(a.text);
        a.other = x.otherSide(a.text, a.points.concat(a.facts));
        a.places = a.places || x.placesIn((a.headline || '') + ' ' + a.text);
      } catch (_) { /* keep the saved notes as they were */ }
    });
  }

  function renderPaper() {
    var P = paperState();
    var SP = window.SSBPaper;
    if (!SP) {
      body('<h1>Newspaper</h1><div class="empty">The newspaper reader did not load. Please restart the app.</div>');
      return;
    }
    if (P.cur) return renderPaperView();
    if (!P.list) {
      body('<h1>Newspaper</h1><div class="empty">Opening your newspapers…</div>');
      SP.db.list().then(function (l) { P.list = l; }, function () { P.list = []; }).then(function () { if (S.view === 'paper') renderPaper(); });
      return;
    }
    body(
      '<h1>Newspaper</h1>' +
      '<p class="lead">Load today\'s newspaper PDF. The app cuts it into stories, skips the adverts, ranks the stories, sorts them into your sections and writes notes. ' +
      'The main stories are also cut out of the page with the key lines marked. ' +
      'Everything happens on this ' + (onPhone() ? 'phone' : 'computer') + ': the PDF is not uploaded or kept, only the text and the cut-outs of the newest ' +
      '5 papers.</p>' +
      '<div class="row" style="margin:12px 0">' +
      '<label class="btn primary" id="paperLoadBtn">Load a newspaper PDF<input id="paperFile" type="file" accept="application/pdf,.pdf" hidden /></label></div>' +
      (P.busy ? '<div class="note" id="paperBusy">' + esc(P.busy) + '</div>' : '') +
      '<h2>Your newspapers</h2>' +
      (P.list.length
        ? P.list.map(function (p) {
            return '<div class="card lectcard"><div class="lechead"><div>' +
              '<div class="lectitle">' + esc(p.name.replace(/\.pdf$/i, '')) + '</div>' +
              '<div class="small muted">' + new Date(p.addedAt).toLocaleDateString() + ' · ' + p.count + ' stories · ' + p.pagesRead + ' pages read</div></div>' +
              '<div class="row"><button class="btn primary sm" data-popen="' + esc(p.id) + '">Open</button>' +
              '<button class="btn ghost sm" data-pdel="' + esc(p.id) + '" title="Delete this paper">×</button></div></div></div>';
          }).join('')
        : '<div class="empty">No newspaper yet. Load one above; text-based e-paper PDFs work best (a scanned image PDF has no text to read).</div>')
    );
    var input = document.getElementById('paperFile');
    input.addEventListener('change', function () { if (input.files && input.files[0]) loadPaperFile(input.files[0]); });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-popen]'), function (b) {
      b.addEventListener('click', function () {
        SP.db.get(b.getAttribute('data-popen')).then(function (p) {
          if (!p) return;
          paperUpgrade(p);
          P.cur = p;
          P.tab = 'plan';
          P.hist = null;
          renderPaper();
        });
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-pdel]'), function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this newspaper and its notes from this ' + (onPhone() ? 'phone' : 'computer') + '?')) return;
        SP.db.remove(b.getAttribute('data-pdel')).then(function () { P.list = null; renderPaper(); });
      });
    });
  }

  function renderPaperView() {
    var P = paperState();
    var SP = window.SSBPaper;
    (P.urls || []).forEach(function (u) { URL.revokeObjectURL(u); });
    P.urls = [];
    var paper = P.cur;
    var arts = paper.articles;
    var tabs = [['plan', '30-min plan'], ['sections', 'By section'], ['editorial', 'Editorials'], ['all', 'All stories']];
    var list = [];
    var html = '';
    if (P.tab === 'plan') {
      SP.plan(paper).forEach(function (b) {
        html += '<h2>' + esc(b.label) + ' <span class="small muted">· about ' + b.minutes + ' min</span></h2>';
        b.items.forEach(function (a) { html += paperStory(a, list.length); list.push(a); });
      });
      if (!list.length) html = '<div class="empty">No stories to plan.</div>';
    } else if (P.tab === 'sections') {
      SP.SECTIONS.forEach(function (s) {
        var group = arts.filter(function (a) { return a.sectionKey === s.key; });
        if (!group.length) return;
        html += '<h2>' + esc(s.label) + ' <span class="small muted">· ' + group.length + '</span></h2>';
        group.forEach(function (a) { html += paperStory(a, list.length); list.push(a); });
      });
    } else {
      list = arts.filter(function (a) { return P.tab === 'all' || a.sectionKey === 'editorial'; });
      html = list.length ? list.map(paperStory).join('') : '<div class="empty">No editorial page was found in this paper.</div>';
    }
    body(
      '<div class="row"><button class="btn sm" id="paperBack">← Newspapers</button></div>' +
      '<h1>' + esc(paper.name.replace(/\.pdf$/i, '')) + '</h1>' +
      '<div class="small muted">' + new Date(paper.addedAt).toLocaleDateString() + ' · ' + arts.length + ' stories · ' +
      paper.pagesRead + ' of ' + paper.numPages + ' pages read · tap a story to see its notes</div>' +
      (P.cutting && P.cutting.id === paper.id ? '<div class="note small" id="paperCutStatus" style="margin-top:8px">' + esc(paperCutStatus()) + '</div>' : '') +
      (window.api.paperNews ? '<div class="row small" style="margin-top:8px;align-items:center"><span class="muted" id="paperAuto">' + esc(paperAutoStatus()) + '</span>' +
        (S.config && S.config.onlineEnabled ? '<button class="btn ghost sm" id="paperAutoT">' + (S.config.paperAuto === false ? 'Turn on' : 'Pause') + '</button>' : '') + '</div>' : '') +
      '<div class="tabs" style="margin:12px 0">' + tabs.map(function (t) {
        return '<button class="navlink' + (t[0] === P.tab ? ' active' : '') + '" data-ptab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('') + '</div>' +
      html
    );
    document.getElementById('paperBack').addEventListener('click', function () { P.cur = null; P.list = null; renderPaper(); });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-ptab]'), function (b) {
      b.addEventListener('click', function () { P.tab = b.getAttribute('data-ptab'); renderPaper(); });
    });
    P.shown = list;
    wirePaperStories(list);
    var at = document.getElementById('paperAutoT');
    if (at) at.addEventListener('click', function () {
      S.config.paperAuto = S.config.paperAuto === false;
      window.api.setConfig({ paperAuto: S.config.paperAuto });
      if (S.config.paperAuto) paperAutoStart(paper); else P.auto = null;
      renderPaper();
    });
    paperAutoStart(paper);
  }

  /* --------------------------------------------- How to use this app */
  // Two ways to learn the app, both in Hindi + English: the guided tour
  // (tour.js; offline, it lights up the real screens one step at a time with a
  // voice clip per step) and the full video. The video lives on the repo's
  // topics-db branch, so it can be replaced without a new app version and does
  // not make the app bigger; it streams full screen only when asked.
  var TUTORIAL_URL = 'https://raw.githubusercontent.com/yoggi1234/SSB-Prep-Trainer/topics-db/video/tutorial.mp4';
  var TUTORIAL_PAGE = 'https://github.com/yoggi1234/SSB-Prep-Trainer/blob/topics-db/video/tutorial.mp4';
  // [seconds, title] for the chapter buttons on the video (13 min 10 s).
  var TUTORIAL_CHAPTERS = [
    [0, 'Intro'], [33, 'Dashboard'], [84, 'TAT · WAT · SRT'], [221, 'PPDT'], [305, 'Lecturette'],
    [358, 'Important Topics'], [397, 'News Digest · Timeline'], [457, 'Newspaper'], [559, 'Add material'],
    [603, 'Bin'], [623, 'Settings · AI keys'], [760, 'Outro']
  ];

  // Each step: the screen to open, the part to light up (a selector; '' for a
  // card in the middle) and what the card says, in Roman Hindi-English. The
  // voice clip tour/<id>.mp3 says the same in Hindi script with English terms
  // (tools/tour-voice.json, made by tools/make-tour-voice.py). Screens that
  // load over the internet or start a program (Important Topics, News Digest)
  // are shown by their dashboard row, so the tour never waits on a network.
  // The smoke suite walks every step on the PC, so a renamed button fails it.
  // only: 'desktop' | 'phone' for a step that differs between the two.
  var TOUR_STEPS = [
    { id: 'welcome', view: 'home', target: '', title: 'Welcome! Chalo app dekhte hain',
      text: 'Yeh chhota sa tour aapko app ka har section dikhayega, Hindi aur English mein. Aage badhne ke liye Next dabao. Kabhi bhi band karna ho to "Skip tour" dabao.' },
    { id: 'dashboard', view: 'home', target: '[data-tile="tutorial"]', title: 'Dashboard: app ka main menu',
      text: 'Har row ek section hai; tour ke baad row dabao aur woh section khul jaayega. Yeh roshan row "How to use this app" hai: yahan yeh tour dobara chala sakte ho, aur internet ho to poora video bhi dekh sakte ho.' },
    { id: 'netchip', view: 'home', target: '#netChip', title: 'Internet ka chip',
      text: 'Yeh chip batata hai: "online", "offline" ya "online off". "Online off" ka matlab hai Settings mein Online lookup band hai. Practice tests bina internet ke chalte hain; sirf online extras ko internet chahiye, jaise live news aur AI.' },
    { id: 'tat', view: 'setup:tat', target: '#go, #setupAdd', title: 'TAT: Thematic Apperception Test',
      text: '12 slides: 11 pictures aur ek blank. Shuru ki timing: har picture 30 second dekho, 30 second socho, phir 4 minute mein story apni copy mein likho (Settings mein badal sakte ho). Tour ke baad "Start TAT" dabaoge to test turant shuru ho jaayega.' },
    { id: 'wat', view: 'setup:wat', target: '#setSel', title: 'WAT: Word Association Test',
      text: 'Poore set mein 60 shabd hote hain, aur shuru mein har shabd 15 second ke liye aata hai. Shabd dekhte hi jo pehla meaningful sentence mann mein aaye, copy mein likho. Yahan se practice set chunte hain.' },
    { id: 'srt', view: 'setup:srt', target: '#shuffleT', title: 'SRT: Situation Reaction Test',
      text: 'Poore set mein 60 situations hoti hain, aur shuru mein poore set ke liye 30 minute. Har situation par apna practical reaction copy mein likho. Yeh Shuffle switch on ho to har baar order badal jaata hai.' },
    { id: 'ppdt', view: 'ppdt', target: '#ppdtGo', title: 'PPDT',
      text: 'Ek dhundhli picture 30 second dikhti hai, phir 30 second socho, phir 4 minute mein story apni copy mein likho. Round ke baad saaf picture dikhti hai. Kai pictures ki model stories pehle se hain; baaki ke liye review screen par "Write 5 stories" se AI likh deta hai (AI chahiye: Settings mein key, ya PC par Ollama app).' },
    { id: 'lecturette', view: 'lecturette', target: '[data-lectwrite]:not([disabled])', title: 'Lecturette',
      text: 'List ke kisi bhi topic par "Generate lecture" dabao: Wikipedia aur latest news se 3 minute ka speech banta hai, 30 second intro, 2 minute body, 30 second conclusion. Likhte hi lecture khulta hai aur ghadi chal padti hai; baad mein "Open lecture" se dobara khol sakte ho. Iske liye Online lookup on hona chahiye.' },
    { id: 'topics', view: 'home', target: '[data-tile="topics"]', title: 'Important Topics',
      text: 'Lecturette aur GD ke study notes, har topic ka ek PDF. Pehli baar internet se Download karo (Online lookup on ho); phir woh bina internet ke bhi khul jaata hai.' },
    { id: 'digest-pc', only: 'desktop', view: 'home', target: '[data-tile="digest"]', title: 'News Digest',
      text: 'Current affairs ka PDF: National, International, Defence, Economy samet 12 sections, aur state chuno to uske page bhi. Khabrein internet se aati hain. PC par iske liye Python aur uski libraries chahiye; steps screen par likhe hain.' },
    { id: 'digest-phone', only: 'phone', view: 'home', target: '[data-tile="digest"]', title: 'News Digest',
      text: 'Aaj ki khabrein 12 sections mein, aur state chuno to ek aur; bina internet ke pichhla saved edition khulta hai. "Make the PDF" se digest PDF banta hai, aur "Add newspaper PDF" se apna akhbaar bhi usmein jod sakte ho.' },
    { id: 'timeline', view: 'timeline', target: '#tlSearch', title: 'News Timeline',
      text: 'Digest ki har khabar apne section mein, aur baad ki follow-up reports usi ke neeche judti jaati hain. Kisi topic ko search karo aur uski poori kahani shuru se dekho. Har naya digest ise aur bharta hai.' },
    { id: 'paper', view: 'paper', target: '#paperLoadBtn', title: 'Newspaper',
      text: 'Yahan apna e-paper PDF load karo (text wala PDF; scan ki hui photo-PDF nahi chalegi). App ads hata deta hai, khabron ko sections mein lagata hai, key points aur notes banata hai, aur 30 minute ka reading plan deta hai. Sab kuch isi device par hota hai.' },
    { id: 'add', view: 'add', target: '#addTatPics', title: 'Add material',
      text: 'Apne phone ya PC ki pictures add karo (internet nahi chahiye); woh PPDT aur TAT dono mein aa jaati hain. Excel sheet se apne WAT words, SRT situations aur lecture topics bhi jod sakte ho.' },
    { id: 'bin', view: 'bin', target: '#app .lead', title: 'Bin',
      text: 'PPDT review par "Take this picture out" se hatayi gayi pictures yahan aati hain; woh PPDT aur TAT dono se bahar rehti hain. "Restore" se wapas la sakte ho. "Delete forever" ya "Empty the bin" se picture hamesha ke liye nikal jaati hai, phir bhi neeche "Undo" se laut sakti hai.' },
    { id: 'online', view: 'settings', target: '[data-toggle="onlineEnabled"]', title: 'Settings: Online lookup',
      text: 'Yeh switch on ho to live news, lecture writer, AI, video, Important Topics ka download aur update check chalte hain. Off ho to bhi saare tests bina internet ke chalte rahenge.' },
    { id: 'aikey', view: 'settings', target: '#aiRow-gemini', title: 'Free AI key: behtar answers',
      text: 'Tour ke baad: Google Gemini wale hisse mein "Log in / Sign up (free)" dabao, Google se sign in karke "Create API key" dabao, aur key is box mein paste karo. Key sirf isi device par rehti hai, aur Online lookup on hona chahiye. Bina key ke bhi lecture ban jaata hai; key se answers behtar hote hain aur PPDT stories bhi milti hain.' },
    { id: 'timings', view: 'settings', target: '[data-num="watPerWordSec"]', title: 'Timings badlo',
      text: 'TAT, WAT, SRT aur PPDT ki timing yahin badal sakte ho, jaise WAT mein har shabd ke seconds. WAT aur SRT ki shuru ki timing asli test jaisi hai; TAT aur PPDT ki apni practice ke hisaab se set kar lo.' },
    { id: 'finish', view: 'home', target: '', title: 'Bas, tour khatam!',
      text: 'Ab practice shuru karo. Yeh tour "How to use this app" mein kabhi bhi dobara chala sakte ho; poora video bhi wahin hai (internet chahiye). All the best!' }
  ];
  TOUR_STEPS.forEach(function (s) { s.audio = s.id + '.mp3'; });

  function tourSteps() {
    return TOUR_STEPS.filter(function (s) {
      return !s.only || (s.only === 'phone') === onPhone();
    });
  }

  // The voice clips run about 19 seconds a step.
  function tourMinutes() {
    return Math.max(1, Math.round((tourSteps().length * 19) / 60));
  }

  // The tour's own names for screens that share one S.view: each test's setup
  // ('setup:tat'), and the start pages of PPDT, Newspaper and Lecturette,
  // which are opened fresh so a leftover round or an open paper never shows.
  function tourView() {
    if (S.view === 'setup' && S.pending) return 'setup:' + S.pending.test;
    return S.view;
  }

  function tourOpen(view) {
    if (view.indexOf('setup:') === 0) return openTile(view.slice(6));
    if (view === 'ppdt') {
      stopPpdtTimer();
      ppdtState().mode = 'setup';
    }
    if (view === 'paper') paperState().cur = null;
    if (view === 'lecturette') {
      var L = lectState();
      L.cat = 'all';
      L.q = '';
    }
    goto(view);
  }

  // Starts the tour from the dashboard. When it ends (finished or skipped) it
  // is marked as seen, so the first-time invitation does not come back.
  function startTour(from) {
    if (!window.SSBTour) {
      toast('The guided tour did not load. Please restart the app.');
      return;
    }
    if (S.session) return; // never over a running test
    tourRunning = true; // keeps the "New here?" card off the dashboard meanwhile
    goto('home');
    // The tour opens fresh start pages (Newspaper, PPDT, Lecturette, a test's
    // setup); what was open before comes back when it ends. A PPDT round that
    // was still ticking is not resumed: it comes back as its start page.
    var openPaper = paperState().cur;
    var pp = ppdtState();
    var keepPpdt = { mode: pp.mode === 'run' ? 'setup' : pp.mode, pic: pp.pic };
    var lex = lectState();
    var keepLect = { cat: lex.cat, q: lex.q };
    var keepPending = S.pending ? { test: S.pending.test, setIndex: S.pending.setIndex, source: S.pending.source } : null;
    window.SSBTour.start(tourSteps(), {
      go: tourOpen,
      view: tourView,
      audioBase: 'tour/',
      voice: !(S.config && S.config.tourVoice === false),
      onVoice: function (on) {
        S.config.tourVoice = on;
        window.api.setConfig({ tourVoice: on });
      },
      onEnd: function (r) {
        tourRunning = false;
        if (openPaper && !paperState().cur) paperState().cur = openPaper;
        stopPpdtTimer();
        ppdtState().mode = keepPpdt.mode;
        ppdtState().pic = keepPpdt.pic;
        lectState().cat = keepLect.cat;
        lectState().q = keepLect.q;
        if (keepPending) Object.assign(S.pending, keepPending);
        S.config.tourSeen = true;
        window.api.setConfig({ tourSeen: true });
        if (r.done) toast('Tour finished. Open "How to use this app" any time to see it again.');
        goto(from === 'tutorial' ? 'tutorial' : 'home');
        // Keyboard focus lands somewhere sensible, not on the page itself.
        var f = from === 'tutorial' ? document.getElementById('tourStart') : appEl.querySelector('.dash-row');
        if (f) f.focus();
      }
    });
  }

  // A one-time invitation on the dashboard for someone who has not seen the tour.
  var tourRunning = false;
  function tourInvite() {
    var c = S.config || {};
    if (c.tourSeen || c.tourInviteClosed || tourRunning) return '';
    return '<div class="card tour-invite" id="tourInvite"><div class="tut-grow"><b>New here?</b> ' +
      '<span class="small">Take the guided tour: the app shows you every section in Hindi + English, with voice. About ' + tourMinutes() + ' minutes.</span></div>' +
      '<button class="btn primary sm" id="tourInviteStart">Start the tour</button>' +
      '<button class="btn ghost sm" id="tourInviteLater">Not now</button></div>';
  }

  function wireTourInvite() {
    var go = document.getElementById('tourInviteStart');
    var later = document.getElementById('tourInviteLater');
    if (go) go.addEventListener('click', function () { startTour('home'); });
    if (later) {
      later.addEventListener('click', function () {
        S.config.tourInviteClosed = true;
        window.api.setConfig({ tourInviteClosed: true });
        var box = document.getElementById('tourInvite');
        if (box) box.parentNode.removeChild(box);
        toast('You can start the tour any time from "How to use this app".');
      });
    }
  }

  // The full video, over the whole app (not a box on the page), with a close
  // button; it tries true full screen, sideways on a phone.
  var tutPlayerClose = null; // set while the video is open
  function playTutorialVideo() {
    if (tutPlayerClose) return;
    if (!(S.config && S.config.onlineEnabled)) {
      toast('Turn on Online lookup in Settings to watch the video. The guided tour works without the internet.');
      return;
    }
    var ov = document.createElement('div');
    ov.className = 'tut-player';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Tutorial video');
    ov.innerHTML =
      '<video controls autoplay playsinline poster="tutorial-poster.jpg" src="' + TUTORIAL_URL + '"></video>' +
      (TUTORIAL_CHAPTERS.length
        ? '<div class="tut-chaps">' + TUTORIAL_CHAPTERS.map(function (c) {
            return '<button type="button" data-seek="' + c[0] + '">' + Math.floor(c[0] / 60) + ':' + ('0' + (c[0] % 60)).slice(-2) + ' ' + esc(c[1]) + '</button>';
          }).join('') + '</div>'
        : '') +
      '<div class="tut-msg" hidden></div>' +
      '<button type="button" class="tut-close" aria-label="Close the video" title="Close">&times;</button>';
    document.body.appendChild(ov);
    var v = ov.querySelector('video');
    var msg = ov.querySelector('.tut-msg');
    var onKey = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    // Leaving the app pauses the video; the phone's Back button closes it.
    var onHidden = function () { if (document.hidden) v.pause(); };
    var close = function () {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onHidden);
      tutPlayerClose = null;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {}
      try {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      } catch (_) {}
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    };
    tutPlayerClose = close;
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHidden);
    ov.querySelector('.tut-close').addEventListener('click', close);
    v.addEventListener('error', function () {
      msg.hidden = false;
      msg.innerHTML = 'The video could not be loaded. Check the internet and try again.<br>' +
        '<button type="button" class="btn sm" data-external="' + TUTORIAL_PAGE + '">Open it on GitHub</button>';
      wireExternal(msg);
    });
    Array.prototype.forEach.call(ov.querySelectorAll('[data-seek]'), function (b) {
      b.addEventListener('click', function () {
        v.currentTime = +b.getAttribute('data-seek');
        v.play().catch(function () {});
      });
    });
    try {
      if (ov.requestFullscreen) {
        ov.requestFullscreen().then(function () {
          if (onPhone() && screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
        }).catch(function () {});
      }
    } catch (_) {}
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function renderTutorial() {
    // Open works like the dashboard row: a test opens its setup screen.
    var guide = TILES.filter(function (t) { return t.id !== 'tutorial'; }).map(function (t) {
      var m = dashMeta(t);
      return '<div class="card tut-row"><div><b>' + esc(t.label) + '</b><div class="small">' + esc(m.blurb || '') + '</div></div>' +
        '<button class="btn sm" data-tileopen="' + t.id + '">Open</button></div>';
    }).join('');
    body(
      '<h1>How to use this app</h1>' +
      '<p class="lead">Two ways to learn the app, both in Hindi + English. The same app runs on the phone and on the PC.</p>' +
      '<div class="card tut-card"><div class="tut-grow"><b>Guided tour</b>' +
      '<div class="small">The app lights up each section, one step at a time, and explains it, with voice. ' +
      'About ' + tourMinutes() + ' minutes. Works without the internet. Skip any time.</div></div>' +
      '<button class="btn primary" id="tourStart">Start the guided tour</button></div>' +
      '<div class="card tut-card"><img class="tut-thumb" src="tutorial-poster.jpg" alt="" />' +
      '<div class="tut-grow"><b>Full video</b><div class="small">Every feature, step by step, and how to add free AI keys. ' +
      'Plays full screen; needs the internet.</div></div>' +
      '<button class="btn" id="tutPlay">Play the video</button></div>' +
      '<h2>Better answers with free AI keys</h2>' +
      '<div class="card"><ol class="tut-steps">' +
      '<li>Open <b>Settings</b> and turn on <b>Online lookup</b>.</li>' +
      '<li>In <b>AI writing</b>, press <b>Log in / Sign up</b> next to <b>Google Gemini</b> (free). Sign in with Google and press <b>Create API key</b>.</li>' +
      '<li>Copy the key and paste it in the box next to Google Gemini. It is kept only on this ' + (onPhone() ? 'phone' : 'computer') + '.</li>' +
      '<li>Optional: add free keys for <b>Groq</b>, <b>OpenRouter</b> or <b>Ollama cloud</b> the same way. The app tries them in order, so if one is busy the next one answers.</li>' +
      (onPhone() ? '' : '<li>On a PC you can also run the free <b>Ollama</b> app; the trainer uses it first when it is open.</li>') +
      '<li>AI is used for lecturettes, PPDT model stories and newspaper notes. Everything else works without it.</li>' +
      '</ol><button class="btn primary sm" data-goto="settings">Open Settings</button></div>' +
      '<h2>Every section in one line</h2>' + guide
    );
    document.getElementById('tourStart').addEventListener('click', function () { startTour('tutorial'); });
    document.getElementById('tutPlay').addEventListener('click', playTutorialVideo);
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-tileopen]'), function (b) {
      b.addEventListener('click', function () { openTile(b.getAttribute('data-tileopen')); });
    });
  }

  function wireExternal(root) {
    // Screens add links after the shell has wired its own; each link must open once, not twice.
    Array.prototype.forEach.call(root.querySelectorAll('[data-external]:not([data-wired])'), function (b) {
      b.setAttribute('data-wired', '1');
      b.addEventListener('click', function (e) {
        e.preventDefault();
        window.api.openExternal(b.getAttribute('data-external'));
      });
    });
  }

  /* ------------------------------------------- news saved under each topic */

  var TOPIC_NEWS_EVERY = 6 * 3600 * 1000;
  var TOPIC_NEWS_KEEP = 20;
  var topicSweeping = false;

  function mergeTopicNews(old, fresh) {
    var seen = {};
    return fresh.map(function (p) { return { text: p.text, source: p.source || '', date: p.date || '', link: p.link || '' }; }).concat(old || [])
      .filter(function (p) {
        var k = String(p.text).toLowerCase();
        if (!p.text || seen[k]) return false;
        seen[k] = 1;
        return true;
      })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .slice(0, TOPIC_NEWS_KEEP);
  }

  // One topic at a time with a pause, so the news service is never hammered. The
  // clock is saved too, so a restart carries on where the last sweep stopped.
  function sweepTopicNews() {
    if (topicSweeping || !S.config || !S.config.onlineEnabled || window.__noStateGate) return;
    var due = (S.lectures || []).filter(function (t) { return Date.now() - ((S.config.topicNewsAt || {})[t.id] || 0) > TOPIC_NEWS_EVERY; });
    if (!due.length) return;
    topicSweeping = true;
    var i = 0;
    var next = function () {
      if (i >= due.length || !S.config.onlineEnabled) { topicSweeping = false; return; }
      var t = due[i++];
      window.api.lecturesLive({ id: t.id, query: t.query || t.topic, force: true }).then(function (r) {
        var news = Object.assign({}, S.config.topicNews);
        var at = Object.assign({}, S.config.topicNewsAt);
        if (r && r.ok && !r.offline) {
          news[t.id] = mergeTopicNews(news[t.id], r.points || []);
          at[t.id] = Date.now();
          S.config.topicNews = news;
          S.config.topicNewsAt = at;
          return window.api.setConfig({ topicNews: news, topicNewsAt: at });
        }
      }).catch(function () {}).then(function () { setTimeout(next, 2500); });
    };
    next();
  }

  /* --------------------------------------------------- import from Excel */

  // An .xlsx file is a zip of XML. The browser engine already inflates zip data
  // and parses XML, so reading column A needs no library on either platform.
  function zipEntries(buf) {
    var view = new DataView(buf);
    var end = buf.byteLength - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0) throw new Error('This is not an Excel .xlsx file.');
    var count = view.getUint16(end + 10, true);
    var at = view.getUint32(end + 16, true);
    var out = {};
    for (var i = 0; i < count; i++) {
      var nameLen = view.getUint16(at + 28, true);
      var name = new TextDecoder().decode(new Uint8Array(buf, at + 46, nameLen));
      out[name] = { method: view.getUint16(at + 10, true), size: view.getUint32(at + 20, true), local: view.getUint32(at + 42, true) };
      at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return out;
  }

  function zipText(buf, entry) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This phone\'s Android System WebView is too old to read Excel. Update it from the Play Store.');
    var start = entry.local + 30 + new DataView(buf).getUint16(entry.local + 26, true) + new DataView(buf).getUint16(entry.local + 28, true);
    var raw = new Blob([new Uint8Array(buf, start, entry.size)]);
    if (entry.method === 0) return raw.text();
    return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }

  function cellText(node) {
    return Array.prototype.map.call(node.getElementsByTagName('t'), function (t) { return t.textContent; }).join('');
  }

  // Every row of the first sheet, as a list of cell texts by column.
  function readXlsxRows(buf) {
    var files = zipEntries(buf);
    var sheet = Object.keys(files).filter(function (n) { return /^xl\/worksheets\/sheet\d*\.xml$/.test(n); }).sort(function (a, b) {
      return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
    })[0];
    if (!sheet) return Promise.reject(new Error('No sheet found in this file.'));
    return Promise.all([zipText(buf, files[sheet]), files['xl/sharedStrings.xml'] ? zipText(buf, files['xl/sharedStrings.xml']) : '<a/>']).then(function (r) {
      var parse = function (x) { return new DOMParser().parseFromString(x, 'application/xml'); };
      var shared = Array.prototype.map.call(parse(r[1]).getElementsByTagName('si'), cellText);
      return Array.prototype.map.call(parse(r[0]).getElementsByTagName('row'), function (row) {
        var cols = [];
        Array.prototype.forEach.call(row.getElementsByTagName('c'), function (c) {
          var ref = /^([A-Z])\d/.exec(c.getAttribute('r') || '');
          if (!ref) return;
          var v = c.getElementsByTagName('v')[0];
          cols[ref[1].charCodeAt(0) - 65] = String(c.getAttribute('t') === 's' ? shared[+v.textContent] || '' : c.getAttribute('t') === 'inlineStr' ? cellText(c) : v ? v.textContent : '').trim();
        });
        return cols;
      }).filter(function (c) { return c.some(Boolean); });
    });
  }

  var IMPORT_HEADS = { srt: /situation|\bsrt\b|question/i, lect: /\btopics?\b|lectur/i, wat: /\bwords?\b|\bwat\b/i };

  // The headings say which column holds what. A section's own kind is tried first; a sheet
  // that plainly holds another kind is refused rather than loaded into the wrong test.
  function importKind(headings, fileName, want) {
    var find = function (re) {
      for (var i = 0; i < headings.length; i++) if (re.test(String(headings[i] || ''))) return i;
      return -1;
    };
    var names = { srt: 'SRT', wat: 'WAT', lect: 'lecture topic' };
    var order = want ? [want] : ['srt', 'lect', 'wat'];
    for (var t = 0; t < order.length; t++) {
      var col = find(IMPORT_HEADS[order[t]]);
      if (col >= 0) return { kind: order[t], col: col, cat: find(/categor|theme/i), header: true };
    }
    if (want) {
      Object.keys(IMPORT_HEADS).forEach(function (other) {
        if (find(IMPORT_HEADS[other]) >= 0) throw new Error('This sheet holds ' + names[other] + ' data. Use the ' + names[other] + ' section instead.');
      });
      return { kind: want, col: 0, cat: 1 };
    }
    var n = String(fileName).toLowerCase();
    var kind = /wat|word/.test(n) ? 'wat' : /srt|situation/.test(n) ? 'srt' : /lect|topic/.test(n) ? 'lect' : '';
    return kind ? { kind: kind, col: 0, cat: 1 } : null;
  }

  // Same text whatever its capitals, spacing or punctuation.
  function textKey(text) {
    return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');
  }

  function uniqueTexts(list) {
    var seen = {};
    return list.filter(function (x) {
      var k = textKey(x);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  var FP_SPELLING = { defense: 'defence', programme: 'program', organisation: 'organization', indigenization: 'indigenisation', labour: 'labor', centre: 'center' };
  var FP_SKIP = ['the', 'of', 'in', 'and', 'on', 'a', 'an', 'for', 'to', 'its', 'by', 'with', 'india', 'indian', 'role', 'impact'];

  // A topic's fingerprint: "E-Commerce", "E commerce" and "Ecommerce in India" must meet.
  // Brackets go ("Artificial Intelligence (AI)"), spelling and plurals are evened out,
  // and the words are sorted so their order cannot hide a repeat.
  function topicWords(text) {
    var bare = String(text).replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/\be[\s-]+(commerce|governance|learning|waste|vehicles?)\b/g, 'e$1');
    var words = (bare.match(/[a-z0-9]+/g) || []).map(function (w) {
      w = FP_SPELLING[w] || w;
      return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
    }).filter(function (w) { return FP_SKIP.indexOf(w) < 0; });
    return words.length ? words : [textKey(text)];
  }

  function lectKey(text) {
    return topicWords(text).slice().sort().join(' ');
  }

  // Exact fingerprints are found in one step; this catches a word or so of difference.
  function nearlySameTopic(a, b) {
    if (a.length < 3 || b.length < 3) return false;
    var shared = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
    return shared / (a.length + b.length - shared) >= 0.75;
  }

  // Each row is new, or names the existing topic it repeats.
  function checkTopics(rows, existing) {
    var byKey = {};
    var known = [];
    var remember = function (topic) {
      byKey[lectKey(topic)] = topic;
      known.push({ topic: topic, words: topicWords(topic) });
    };
    existing.forEach(remember);
    var fresh = [];
    var repeats = [];
    rows.forEach(function (r) {
      var words = topicWords(r[0]);
      var same = byKey[lectKey(r[0])] || (known.filter(function (k) { return nearlySameTopic(words, k.words); })[0] || {}).topic;
      if (same) {
        repeats.push({ topic: r[0], same: same });
        return;
      }
      remember(r[0]);
      fresh.push(r);
    });
    return { fresh: fresh, repeats: repeats };
  }

  // Replaces the lists an earlier sheet brought in; lists typed by hand stay.
  function importRows(kind, rows) {
    var cfg = S.config;
    if (kind === 'lect') {
      var check = checkTopics(rows, (S.lecturesBase || []).concat(cfg.lectOwn || []).map(function (t) { return t.topic; }));
      var dup = check.repeats;
      var added = check.fresh.map(function (r) {
        return { id: lectSlug(r[0]), topic: r[0], category: r[1] || 'Your topics' };
      });
      var own = (cfg.lectOwn || []).concat(added).sort(function (a, b) {
        return String(a.category || '').localeCompare(String(b.category || '')) || a.topic.localeCompare(b.topic);
      });
      cfg.lectOwn = own;
      return window.api.setConfig({ lectOwn: own }).then(function () {
        S.lectures = lectWithWritten(S.lecturesBase || []);
        return rows.length + ' rows read.\n' + added.length + ' new topics added and sorted.\n' + dup.length + ' duplicates skipped' +
          (dup.length ? ':\n' + dup.map(function (d) { return d.topic === d.same ? d.topic : d.topic + '  =  ' + d.same; }).join('\n') : '.');
      });
    }
    // A sheet's own numbering ("41. He was...") would clash with the app's
    // "Situation 1 of 60" once the order is shuffled, so it is dropped.
    var cleaned = uniqueTexts(rows.map(function (r) { return String(r[0]).replace(/^\s*\d{1,3}\s*[.)]\s+/, ''); }));
    var builtIn = {};
    builtinSets(kind).forEach(function (s) { s.items.forEach(function (x) { builtIn[textKey(x)] = 1; }); });
    var items = cleaned.filter(function (x) { return !builtIn[textKey(x)]; });
    var size = 60;
    var sets = [];
    for (var i = 0; i < items.length; i += size) {
      sets.push({ id: 'excel-' + kind + '-' + (sets.length + 1), name: kind.toUpperCase() + ' sheet ' + (sets.length + 1), items: items.slice(i, i + size) });
    }
    cfg.custom = cfg.custom || { tat: [], wat: [], srt: [] };
    cfg.custom[kind] = (cfg.custom[kind] || []).filter(function (s) { return String(s.id).indexOf('excel-') !== 0; }).concat(sets);
    return window.api.setConfig({ custom: cfg.custom }).then(function () {
      return rows.length + ' rows read.\n' + items.length + ' new ' + kind.toUpperCase() + ' items added in ' + sets.length + ' set' + (sets.length === 1 ? '' : 's') + '.\n' +
        (rows.length - cleaned.length) + ' repeats inside the sheet and ' + (cleaned.length - items.length) + ' already in the app were skipped.';
    });
  }

  function importFile(file, want) {
    return file.arrayBuffer().then(function (buf) {
      if (/\.txt$/i.test(file.name)) {
        return new TextDecoder().decode(buf).split(/\r?\n/).map(function (l) { return [l.trim(), '']; }).filter(function (c) { return c[0]; });
      }
      return readXlsxRows(buf);
    }).then(function (rows) {
      if (!rows.length) throw new Error('This sheet is empty.');
      var k = importKind(rows[0], file.name, want);
      if (!k) throw new Error('Head a column Word, Situation or Topic, or use one of those words in the file name.');
      var body = (k.header ? rows.slice(1) : rows).map(function (r) { return [r[k.col] || '', k.cat >= 0 ? r[k.cat] || '' : '']; }).filter(function (r) { return r[0]; });
      return importRows(k.kind, body);
    });
  }

  /* ------------------------------------------- lecturette — 3-minute pattern */

  // The SSB lecturette is a three-minute talk: 30 seconds intro, two minutes
  // body, 30 seconds conclusion. The clock moves through the phases on its own
  // and the whole pattern is laid out for you. Nothing is typed here — the
  // candidate speaks aloud and keeps notes on paper.
  var LECT_PHASES = [
    {
      id: 'intro',
      label: 'Intro',
      secs: 30,
      cue: 'Meaning · brief history · original background · why it came about'
    },
    {
      id: 'body',
      label: 'Body',
      secs: 120,
      cue: 'Present state · explanation · a parallel · pros and cons · quote, fact or figure · impact'
    },
    {
      id: 'conclusion',
      label: 'Conclusion',
      secs: 30,
      cue: 'Future possibilities · challenges · precautions to exercise · your own opinion'
    }
  ];

  function lectState() {
    if (!S.lect) {
      S.lect = {
        mode: 'list',
        board: 'all',
        cat: 'all',
        q: '',
        open: {},
        run: null,
        hot: null,
        hotBusy: false,
        timer: null,
        summary: null,
        // Current points per topic, cached on disk for three months.
        live: null,
        liveStatus: null
      };
    }
    return S.lect;
  }

  function lectTopics() {
    return Array.isArray(S.lectures) ? S.lectures : [];
  }

  function asList(v) {
    if (Array.isArray(v)) return v.slice();
    if (v === null || v === undefined || v === '') return [];
    return [String(v)];
  }

  function lectBoards() {
    var seen = {};
    lectTopics().forEach(function (t) {
      asList(t.boards).forEach(function (b) {
        seen[b] = 1;
      });
    });
    return Object.keys(seen).sort();
  }

  function stopLectTimer() {
    var L = lectState();
    if (L.timer) clearInterval(L.timer);
    L.timer = null;
  }

  function lectBullets(items) {
    return asList(items)
      .map(function (x) {
        return '<li>' + esc(x) + '</li>';
      })
      .join('');
  }

  // Where this topic's material came from. The app ships three kinds, and the
  // screen says which one you are looking at instead of pretending they match.
  function lectSourceLabel(t) {
    if (t.written) return 'Written for you';
    if (t.source === 'own') return 'Your topic';
    if (t.source === 'curated') return 'Hand-written';
    if (t.source === 'draft') return 'Draft script';
    if (t.outline) return 'Outline';
    return 'Topic';
  }

  function lectSourceNote(t) {
    if (t.written) return 'Written for you from the dated sources listed above. Read them once before you speak — facts change.';
    if (t.source === 'curated') return 'Hand-written for this app: it carries a figure and a quote.';
    if (t.source === 'draft') return 'A full drafted script. No figures were supplied with it, so quote only what you have checked yourself.';
    return 'A speaking outline, not a script. Fill it with the current points below and your own examples.';
  }

  function lectKeywordsHtml(t) {
    var words = asList(t.keywords);
    if (!words.length) return '';
    return (
      '<div class="lectblock"><div class="lectlabel">Quick revision — your memory cues</div>' +
      '<div class="words">' +
      words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') +
      '</div></div>'
    );
  }

  // Only fields that actually hold something are shown. A row reading "Figure
  // —" would suggest a checked figure that does not exist.
  function lectFactsHtml(t) {
    var rows = [];
    if (t.fact) rows.push('<div class="fact"><b>Fact</b><span>' + esc(t.fact) + '</span></div>');
    if (t.statistic) rows.push('<div class="fact"><b>Figure</b><span>' + esc(t.statistic) + '</span></div>');
    if (t.quote && t.quote.text) {
      rows.push(
        '<div class="fact"><b>Quote</b><span>“' + esc(t.quote.text) + '”' +
        (t.quote.who ? ' <span class="muted">— ' + esc(t.quote.who) + '</span>' : '') +
        '</span></div>'
      );
    }
    asList(t.facts).forEach(function (f) {
      if (!f || (!f.label && !f.value)) return;
      rows.push('<div class="fact"><b>' + esc(f.label || '') + '</b><span>' + esc(f.value || '') + '</span></div>');
    });

    if (t.line) rows.push('<div class="fact"><b>Closing line</b><span>' + esc(t.line) + '</span></div>');
    // A written script names every source it quotes, with the date, so each
    // fact can be checked before it is spoken.
    asList(t.sources).forEach(function (s) {
      rows.push(
        '<div class="fact"><b>Source</b><span>' + esc(s.label || '') +
        (s.date ? ' <span class="muted">· ' + esc(s.date) + '</span>' : '') +
        (s.link ? ' <button class="btn sm ghost" data-external="' + esc(s.link) + '">Check</button>' : '') +
        '</span></div>'
      );
    });

    var words = asList(t.keywords);
    return (
      '<div class="lectfacts">' +
      '<h3>' + (t.written ? 'Facts and sources' : 'Facts to quote') + '</h3>' +
      (rows.length ? rows.join('') : '<div class="small muted">No figures come bundled with this topic. Use the current points below, and quote only what you have read yourself.</div>') +
      (words.length
        ? '<div class="fact"><b>Cues</b><span>' + esc(words.join(' · ')) + '</span></div>'
        : '') +
      '<div class="small muted" style="margin-top:10px">' + esc(lectSourceNote(t)) + '</div>' +
      '</div>'
    );
  }

  function lectHotError(r) {
    if (!r) return 'Nothing came back.';
    if (r.error === 'offline') return 'Online lookup is off — turn it on in Settings first.';
    if (r.error === 'network') return 'Could not reach the news feed.' + (r.detail ? ' (' + r.detail + ')' : '');
    if (r.error === 'empty') return 'The feed had no headlines just now.';
    return 'Fetch failed (' + (r.error || 'unknown') + ').';
  }

  function lectHotHtml() {
    var L = lectState();
    var inner;
    if (!S.config.onlineEnabled) {
      inner =
        '<div class="small muted">Online lookup is off, so only the bundled topics are available. Turn it on under ' +
        '<b>Word library → Extra words from the internet</b> to pull today\'s headlines.</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn sm" id="lectToLibrary">Open Word library</button></div>';
    } else if (L.hotBusy) {
      inner = '<div class="small muted">Fetching today\'s SSB and defence headlines…</div>';
    } else if (L.hot) {
      inner = L.hot.ok
        ? '<div class="words">' +
          L.hot.items
            .map(function (h, i) {
              return '<button class="wchip hotitem" data-hot="' + i + '">' + esc(h.title) + '</button>';
            })
            .join('') +
          '</div>' +
          '<div class="row" style="margin-top:12px">' +
          '<button class="btn sm" id="lectHotAgain">Refresh</button>' +
          '<span class="chip">' + L.hot.items.length + ' headlines · ' + esc(L.hot.source || 'news') + '</span>' +
          '</div>' +
          '<div class="small muted" style="margin-top:8px">Press a headline to practise it as a topic — the same three-minute pattern applies.</div>'
        : '<div class="small muted">' + esc(lectHotError(L.hot)) + '</div>' +
          '<div class="row" style="margin-top:10px"><button class="btn sm" id="lectHotAgain">Try again</button></div>';
    } else {
      inner = '<div class="row" style="margin-top:10px"><button class="btn primary sm" id="lectHot">Fetch hot topics</button></div>';
    }
    return (
      '<h2>Hot topics from the internet</h2>' +
      '<div class="card onlinecard">' +
      '<div class="small muted">Recent SSB and Armed Forces headlines, so your lecturette sounds current. ' +
      'They are fetched only when you ask, and need online lookup turned on.</div>' +
      inner +
      '</div>'
    );
  }

  function lectRunTopic(topic, extra) {
    var t = {
      id: topic.id || '',
      query: topic.query || topic.topic || '',
      source: topic.source || '',
      outline: !!topic.outline,
      speech: topic.speech || null,
      words: topic.words || 0,
      line: topic.line || '',
      written: !!topic.written,
      sources: topic.sources || [],
      keywords: topic.keywords || [],
      topic: topic.topic || 'Untitled topic',
      theme: topic.theme || '',
      intro: topic.intro || {},
      body: topic.body || {},
      conclusion: topic.conclusion || {},
      fact: topic.fact || '',
      statistic: topic.statistic || '',
      quote: topic.quote || { text: '', who: '' },
      facts: topic.facts || [],
      hot: !!extra && !!extra.hot,
      link: (extra && extra.link) || ''
    };
    return t;
  }

  /* ---------------------------------------------- lecturette writer */

  // Writes a three-minute script from two dated sources: the closest Wikipedia
  // article for the background and the latest news points for "where it stands
  // today". Facts are quoted, never invented, and the script lists its sources
  // with their dates. About 380 words: 30 s intro, 2 min body, 30 s conclusion.
  var LECT_PLAIN = [
    [/\bapproximately\b/gi, 'about'], [/\butili[sz]e[sd]?\b/gi, 'use'], [/\bcommenced\b/gi, 'began'],
    [/\bsubsequently\b/gi, 'later'], [/\bin order to\b/gi, 'to'], [/\bnumerous\b/gi, 'many'],
    [/\bprior to\b/gi, 'before'], [/\bpurchase[sd]?\b/gi, 'buy'], [/\bdemonstrate[sd]?\b/gi, 'show']
  ];

  function lectSentences(text) {
    var main = String(text || '').split(/\n==\s*(See also|References|Notes|External links|Further reading)\s*==/)[0];
    var out = [];
    main.split('\n').forEach(function (line) {
      if (/^\s*==/.test(line)) return;
      var clean = line;
      // Nested brackets come off from the inside out.
      for (var k = 0; k < 3; k++) clean = clean.replace(/\s*\([^()]*\)/g, '');
      clean = clean.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
      // A sentence ends at . ! ? followed by a capital, so "4.9%" stays whole.
      clean.replace(/([.!?])\s+(?=[A-Z"])/g, '$1\n').split('\n').forEach(function (s) {
        s = s.trim();
        var words = s.split(' ').length;
        // The opening sentence is the definition, so it is kept even when long.
        var limit = out.length ? 32 : 60;
        if (words < 6 || words > limit || !/^[A-Z0-9"]/.test(s) || !/[.!?]$/.test(s) || /may refer to|;|:$/.test(s)) return;
        // "They…", "This…" and the like mean nothing once lifted out of their paragraph.
        if (out.length && /^(They|These|This|It|Its|He|She|His|Her|Such|Those|Their|However|But|And|Also)\b/.test(s)) return;
        LECT_PLAIN.forEach(function (r) {
          s = s.replace(r[0], function (m) { return /^[A-Z]/.test(m) ? r[1].charAt(0).toUpperCase() + r[1].slice(1) : r[1]; });
        });
        if (out.indexOf(s) < 0) out.push(s);
      });
    });
    return out;
  }

  function lectWordCount(paras) {
    return paras.join(' ').split(/\s+/).filter(Boolean).length;
  }

  // Takes sentences off the front of the list until roughly `words` are used.
  function lectTake(list, words) {
    var out = [];
    while (list.length && lectWordCount(out) < words) out.push(list.shift());
    return out.join(' ');
  }

  // Sentences that carry one kind of point, taken out of the pool so no fact is
  // said twice. Nothing is forced: a kind with no matching sentence is skipped.
  function lectPick(pool, re, n) {
    var out = [];
    for (var i = 0; i < pool.length && out.length < n; i++) {
      if (re.test(pool[i])) out.push(pool.splice(i--, 1)[0]);
    }
    return out.join(' ');
  }

  var LECT_STOP = ('about after again also among been before being between both but could during each from have into ' +
    'its many more most much only other over said same such than that their them then there these they this those ' +
    'through under until very were what when where which while will with would your first second third known called ' +
    'including became since later used made part well within based however people years year world').split(' ');

  // Five to seven memory cues: the words the facts lean on most.
  function lectCues(topic, text) {
    var count = {};
    var own = String(topic).toLowerCase();
    (String(text).toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).forEach(function (w) {
      if (LECT_STOP.indexOf(w) < 0 && own.indexOf(w) < 0) count[w] = (count[w] || 0) + 1;
    });
    return Object.keys(count)
      .sort(function (a, b) { return count[b] - count[a]; })
      .slice(0, 6)
      .concat([topic]);
  }

  // The SSB pattern: intro 30 s (greeting, meaning, history), body 2 min
  // (present status, causes, both sides, India, a dated fact or news example,
  // government steps, a quote only if a real one is bundled), conclusion 30 s
  // (summary, future and challenges, precautions, opinion, closing line).
  // 350–420 words. Every fact comes from a dated source; nothing is invented.
  function lectCompose(base, facts, live) {
    var topic = base.topic;
    var pool = lectSentences(facts.text);
    var points = ((live && live.ok && live.points) || []).slice(0, 3);
    var sources = [{ label: 'Wikipedia — ' + facts.title, date: String(facts.updated || '').slice(0, 10), link: facts.url || '' }];

    var meaning = pool.shift() || '';
    var history = lectPick(pool, /\b(1[89]\d\d|20\d\d|founded|established|began|introduced|launched|origin|history)\b/i, 2);
    var intro = [
      'Good morning, respected members of the board. My topic today is ' + topic + '. ' + meaning,
      (history ? 'A little background. ' + history + ' ' : '') +
        'In the next three minutes, I will talk about where it stands today, its two sides, what it means for India, and the way ahead.'
    ];

    var news = points
      .map(function (p) {
        sources.push({ label: p.source || 'News', date: p.date || '', link: p.link || '' });
        var t = String(p.text || '').replace(/\s+[-–—]\s+[^-–—]+$/, '').replace(/[.!?]*$/, '');
        return t + (p.source ? ', as reported by ' + p.source : '') + '.';
      })
      .join(' ');
    // A "positive" that says "not successful" is not one.
    var plus = lectPick(pool, /^(?!.*\b(not|never|no|fail\w*|unsuccessful|lack\w*)\b).*\b(benefit|improv|growth|success|strength|boost|achiev|increase)/i, 1);
    var minus = lectPick(pool, /\b(critici|concern|challenge|problem|risk|oppos|controvers|threat|shortage|delay|declin|unsuccessful|failed)/i, 1);
    var govt = lectPick(pool, /\b(government|ministry|scheme|policy|programme|mission|parliament)\b/i, 1);
    var india = lectPick(pool, /\bIndia/, 2);
    var quote = base.quote && base.quote.text ? '"' + base.quote.text + '"' + (base.quote.who ? ' — ' + base.quote.who + '.' : '') : '';

    // Body paragraphs carry a short heading each, so the script reads like a
    // prepared talk; a paragraph with nothing true to say is left out.
    var body = [];
    var heads = [];
    var add = function (head, text) {
      if (!text) return;
      heads.push(head);
      body.push(text);
    };
    add('Present situation', (news ? 'In recent news, ' + news + ' ' : '') + lectTake(pool, news ? 25 : 55));
    add('Background and causes', lectTake(pool, 40));
    add('Advantages', plus);
    add('Challenges and concerns', minus);
    add('What it means for India', india);
    add('Government initiatives and the way forward', govt);
    if (quote) add('In the words of others', quote);

    var closing = 'Handled with vision and discipline, ' + topic + ' can become a source of strength for India.';
    var conclusion = [
      'To sum up, ' + topic + ' matters to every citizen, and to every future officer. ' +
        'In the years ahead, the chances are real, but so are the challenges, and both need careful planning. ' +
        'We must stay well informed, check facts before we act, and take practical steps at every level. ' +
        'In my opinion, India should build on its strengths here, learn from others, and move with both speed and care. ' +
        closing + ' Thank you.'
    ];

    // Fill to about three minutes with background the pool still holds, never past 420 words.
    var speech = { intro: intro, body: body, conclusion: conclusion, heads: heads };
    var all = function () { return speech.intro.concat(speech.body, speech.conclusion); };
    while (lectWordCount(all()) < 350 && pool.length && lectWordCount(all()) + pool[0].split(' ').length <= 420) {
      speech.body[0] += ' ' + pool.shift();
    }
    // Over 420 words: drop the last sentence of the longest body paragraph,
    // never a paragraph's opening line.
    for (var guard = 0; lectWordCount(all()) > 420 && guard < 20; guard++) {
      var at = 0;
      speech.body.forEach(function (p, i) { if (p.length > speech.body[at].length) at = i; });
      var parts = speech.body[at].replace(/([.!?])\s+(?=[A-Z"])/g, '$1\n').split('\n');
      if (parts.length < 3) break;
      parts.pop();
      speech.body[at] = parts.join(' ');
    }
    return {
      speech: speech,
      words: lectWordCount(all()),
      keywords: lectCues(topic, facts.text),
      line: closing,
      sources: sources,
      writtenAt: new Date().toISOString()
    };
  }

  function lectSlug(text) {
    return 'own-' + String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  // The bundled catalogue plus your own topics, with any script written for you
  // laid over the topic it belongs to. Kept in Settings, so it survives restarts.
  function lectWithWritten(base) {
    var cfg = S.config || {};
    var written = cfg.lectWritten || {};
    var inBase = {};
    base.forEach(function (t) { inBase[lectKey(t.topic)] = 1; });
    var own = (cfg.lectOwn || []).filter(function (o) { return !inBase[lectKey(o.topic)]; }).map(function (o) {
      return { id: o.id, topic: o.topic, query: o.topic, theme: 'Your topic', category: o.category || 'Your topics', boards: [], source: 'own' };
    });
    return own.concat(base).map(function (t) {
      var w = written[t.id];
      return w
        ? Object.assign({}, t, {
            speech: w.speech, words: w.words, sources: w.sources, line: w.line || '',
            keywords: w.keywords || t.keywords, written: true
          })
        : t;
    });
  }

  function lectWriteError(r) {
    if (!r) return 'Nothing came back.';
    if (r.error === 'offline') return 'Turn online lookup on in Settings to write a lecture — it needs the latest facts.';
    if (r.error === 'not-found') return 'No reliable article was found for that topic. Try a shorter or more common name.';
    if (r.error === 'network') return 'Could not reach Wikipedia just now. Try again in a minute.';
    if (r.error === 'busy') return 'Wikipedia is busy and asked us to slow down. Try again in a minute or two.';
    return 'Could not write it (' + (r.error || 'unknown') + ').';
  }

  function writeLecture(topic) {
    var L = lectState();
    var text = String(topic.topic || '').trim();
    if (!text || L.writing) return;
    var id = topic.id || lectSlug(text);
    L.writing = id;
    render();
    Promise.all([
      window.api.lectureFacts(topic.query || text),
      window.api.lecturesLive({ id: id, query: topic.query || text, force: true }).catch(function () { return null; })
    ])
      .then(function (r) {
        var saved = ((S.config.topicNews || {})[id] || []).slice(0, 8);
        var usable = (r[1] && r[1].ok && r[1].points && r[1].points.length) || saved.length;
        // A broad topic may have no one article; recent news is enough for the AI to work from.
        if ((!r[0] || !r[0].ok) && aiReady() && usable) r[0] = { ok: true, title: text, text: '', url: '', updated: '' };
        if (!r[0] || !r[0].ok) {
          L.writing = null;
          toast(lectWriteError(r[0]));
          render();
          return;
        }
        var cfg = S.config || {};
        var written = Object.assign({}, cfg.lectWritten || {});
        var points = ((r[1] && r[1].ok && r[1].points) || []).slice(0, 6);
        var factText = (topic.about ? 'What this topic covers: ' + topic.about + '\n' : '') +
          points.concat(saved).map(function (p) { return (p.date || '') + ': ' + p.text + ' (' + (p.source || 'news') + ')'; }).join('\n') + '\n' + String(r[0].text).slice(0, 7000);
        var sources = [{ label: 'Wikipedia — ' + r[0].title, date: String(r[0].updated || '').slice(0, 10), link: r[0].url || '' }]
          .concat(points.slice(0, 3).map(function (p) { return { label: p.source || 'News', date: p.date || '', link: p.link || '' }; }));
        var write = aiReady()
          ? aiAsk(LECT_PROMPT.replace('{{topic}}', text).replace('{{facts}}', factText))
          : Promise.resolve(null);
        return write.then(function (ans) {
        var fromAi = ans && ans.ok ? lectFromAi(ans.text, factText, sources, ans.model) : null;
        if (ans && !fromAi) toast(ans.ok ? 'The AI answer was not a usable lecture, so this one is built from the sources.' : aiErrorText(ans));
        written[id] = fromAi || lectCompose(Object.assign({}, topic, { topic: text }), r[0], r[1]);
        var patch = { lectWritten: written };
        if (!topic.id) {
          var own = (cfg.lectOwn || []).filter(function (o) { return o.id !== id; });
          own.unshift({ id: id, topic: text });
          patch.lectOwn = own;
        }
        return window.api.setConfig(patch).then(function (next) {
          S.config = next;
          S.lectures = lectWithWritten(S.lecturesBase || []);
          L.writing = null;
          toast('Lecture written — ' + written[id].words + ' words');
          var done = S.lectures.filter(function (t) { return t.id === id; })[0];
          // Only if the person is still waiting here; they may have moved on while it was written.
          if (done && S.view === 'lecturette') startLecture(done, null);
          else render();
        });
        });
      })
      .catch(function (err) {
        L.writing = null;
        toast('Could not write it: ' + ((err && err.message) || 'error'));
        render();
      });
  }

  function randomLecture(shown) {
    var pool = shown && shown.length ? shown : lectTopics();
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function lectCats() {
    var seen = {};
    lectTopics().forEach(function (t) {
      if (t.category) seen[t.category] = 1;
    });
    return Object.keys(seen).sort();
  }

  function lectFiltered() {
    var L = lectState();
    var q = (L.q || '').trim().toLowerCase();
    return lectTopics().filter(function (t) {
      if (L.board !== 'all' && asList(t.boards).indexOf(L.board) < 0) return false;
      if (L.cat !== 'all' && (t.category || '') !== L.cat) return false;
      if (!q) return true;
      var hay = (t.topic + ' ' + (t.category || '') + ' ' + asList(t.keywords).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function lectLiveId(t) {
    if (t.id) return t.id;
    return 'hot-' + String(t.topic || 'topic').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  }

  // Current points for the open topic. The main process keeps a copy on disk and
  // refreshes it every three months, so this never has to fail: with no network
  // it returns the saved points and says they are saved.
  function loadLive(force) {
    var L = lectState();
    var R = L.run;
    if (!R) return;
    var t = R.topic;
    var id = lectLiveId(t);
    var previous = L.live && L.live.id === id ? L.live.res : null;
    L.live = { id: id, busy: true, res: previous, force: !!force };
    paintLive();
    window.api
      .lecturesLive({ id: id, query: t.query || t.topic, force: !!force })
      .then(function (res) {
        L.live = { id: id, busy: false, res: res || { ok: false, error: 'empty' } };
        paintLive();
      })
      .catch(function (err) {
        L.live = {
          id: id,
          busy: false,
          res: previous || { ok: false, error: 'network', detail: err && err.message }
        };
        paintLive();
      });
  }

  function lectLiveErrorText(res) {
    if (res.error === 'offline') {
      return 'Online lookup is off and no points are saved for this topic yet. Turn it on in Settings to fill this panel.';
    }
    if (res.error === 'network') {
      return 'Could not reach the news feed just now' + (res.detail ? ' (' + res.detail + ')' : '') + '. Try again later — anything already saved stays.';
    }
    if (res.error === 'empty') return 'The feed had nothing for this topic just now. Try again in a while.';
    if (res.error === 'no-query') return 'No search terms are set for this topic.';
    return 'No current points yet (' + (res.error || 'unknown') + ').';
  }

  function newsPointLi(p) {
    var meta = [p.source, p.date].filter(Boolean).join(' · ');
    return (
      '<li><span>' + esc(p.text) + '</span>' +
      (meta ? ' <span class="small muted">' + esc(meta) + '</span>' : '') +
      (p.link ? ' <button class="btn sm ghost" data-external="' + esc(p.link) + '">Open</button>' : '') +
      '</li>'
    );
  }

  // The points are grouped the way a lecturette is asked for them: what is
  // happening, how India is affected, what India gains, and the outside view.
  // Sorting is by keyword on the published headline; nothing is summarised or
  // added, and the paper is named so the full story can be checked.
  function lectNewsGroupsHtml(res) {
    var groups = res.groups;
    var order = [
      ['now', 'How it is going'],
      ['india', 'How India is affected'],
      ['gain', 'What India gains'],
      ['world', 'From the world']
    ];
    var out = '';
    if (groups) {
      order.forEach(function (g) {
        var arr = groups[g[0]] || [];
        if (!arr.length) return;
        out +=
          '<div class="newsgroup"><h4>' +
          esc(g[1]) +
          ' · ' +
          arr.length +
          '</h4><ul>' +
          arr.slice(0, 4).map(newsPointLi).join('') +
          '</ul></div>';
      });
    }
    if (!out) out = '<ol class="livepoints">' + (res.points || []).map(newsPointLi).join('') + '</ol>';
    return (
      out +
      '<div class="small muted" style="margin-top:8px">Read a point aloud as it is, then add your own line on why it matters. ' +
      'Open a headline to check the full story before quoting it.</div>'
    );
  }

  function lectLiveHtml() {
    var L = lectState();
    if (!L.run) return '';
    var live = L.live || {};
    var res = live.res;
    var inner = '';

    if (res && res.ok && res.points && res.points.length) {
      if (res.offline) {
        inner +=
          '<div class="note">No connection right now — showing the points saved on ' +
          esc(res.checkedOn || 'an earlier date') + '. They are kept for three months, so the panel still works offline.</div>';
      }
      inner += lectNewsGroupsHtml(res) +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm" id="lectLiveAgain">Refresh now</button>' +
        '<span class="chip">checked ' + esc(res.checkedOn || '—') + '</span>' +
        (res.dueOn ? '<span class="chip">next check ' + esc(res.dueOn) + '</span>' : '') +
        '<span class="chip">' + res.points.length + ' points</span>' +
        '</div>';
    } else if (res && !res.ok && res.error === 'offline') {
      inner =
        '<div class="small muted">' + esc(lectLiveErrorText(res)) + '</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm" id="lectLiveAgain">Try again</button>' +
        '<button class="btn sm ghost" id="lectLiveSettings">Settings</button>' +
        '</div>';
    } else if (res && !res.ok) {
      inner =
        '<div class="small muted">' + esc(lectLiveErrorText(res)) + '</div>' +
        '<div class="row" style="margin-top:10px"><button class="btn sm" id="lectLiveAgain">Try again</button></div>';
    } else {
      inner = '<div class="small muted">Checking for current points…</div>';
    }

    if (live.busy && res && res.ok) {
      inner = '<div class="small muted" style="margin-bottom:8px">Refreshing…</div>' + inner;
    }

    return (
      '<div class="card lectlive" id="lectLiveCard">' +
      '<div class="lectlivehead">' +
      '<h3>Current points</h3>' +
      '<span class="small muted">In point form, checked every three months. Say two or three of these aloud and the lecturette sounds current.</span>' +
      '</div>' +
      inner +
      '</div>'
    );
  }

  function paintLive() {
    var el = document.getElementById('lectLive');
    if (!el) return;
    var runTopic = (lectState().run && lectState().run.topic) || {};
    var mine = timelineFor(runTopic.topic || '');
    var kept = ((S.config.topicNews || {})[runTopic.id] || (lectSaved()[runTopic.id] || {}).news || []).slice(0, 15);
    el.innerHTML = (kept.length
      ? '<div class="card"><h3>Latest news on this topic</h3><ul class="tl-events">' + kept.map(function (p) {
          return '<li><div class="small muted">' + esc(p.date) + (p.source ? ' · ' + esc(p.source) : '') + '</div>' + esc(p.text) +
            (/^https?:\/\//.test(p.link) ? ' <button class="btn sm ghost" data-external="' + esc(p.link) + '">Open</button>' : '') + '</li>';
        }).join('') + '</ul></div>'
      : '') + (mine.length
      ? '<div class="card"><h3>Follow-ups from your digest timeline</h3>' + mine.map(timelineCard).join('') + '</div>'
      : '') + (kept.length ? '' : lectLiveHtml());
    if (!S.timeline) loadTimeline().then(function () { if (S.view === 'lecturette' && S.timeline.length) paintLive(); });
    var again = document.getElementById('lectLiveAgain');
    if (again) again.addEventListener('click', function () { loadLive(true); });
    var settings = document.getElementById('lectLiveSettings');
    if (settings) settings.addEventListener('click', function () { goto('settings'); });
    wireExternal(el);
  }

  // Which topics already have points on disk. Read once at boot; only a changed
  // set triggers a re-render, so this can never loop.
  function refreshLiveStatus() {
    window.api
      .lecturesLiveStatus()
      .then(function (map) {
        var L = lectState();
        var before = L.liveStatus ? Object.keys(L.liveStatus).length : 0;
        L.liveStatus = map || {};
        var after = Object.keys(L.liveStatus).length;
        if (after !== before && S.view === 'lecturette' && L.mode === 'list') render();
      })
      .catch(function () {});
  }

  function renderLecturette() {
    var L = lectState();
    if (L.mode === 'run' && L.run) return mountLecture();
    if (L.mode === 'done') return renderLectDone();
    return renderLectList();
  }

  function lectSaved() {
    return (S.config && S.config.lectSaved) || {};
  }

  function saveLectureOffline(t) {
    var saved = Object.assign({}, lectSaved());
    saved[t.id] = { at: new Date().toISOString(), news: ((S.config.topicNews || {})[t.id] || []).slice() };
    S.config.lectSaved = saved;
    return window.api.setConfig({ lectSaved: saved }).then(function () { toast('Saved offline. Find it under Saved offline in Lecturette.'); });
  }

  function renderLectList() {
    var L = lectState();
    var topics = lectTopics();
    var q = (L.q || '').trim().toLowerCase();
    var news = (S.config && S.config.topicNews) || {};
    var shown = topics.filter(function (t) {
      if (L.cat === '__saved') return !!lectSaved()[t.id] && (!q || t.topic.toLowerCase().indexOf(q) >= 0);
      return (L.cat === 'all' || !L.cat || t.category === L.cat) && (!q || (t.topic + ' ' + (t.category || '')).toLowerCase().indexOf(q) >= 0);
    });
    var rows = '';
    var lastCat = null;
    shown.forEach(function (t) {
      if (t.category !== lastCat) {
        lastCat = t.category;
        rows += '<h2>' + esc(lastCat || 'Topics') + '</h2>';
      }
      var idx = topics.indexOf(t);
      var saved = (news[t.id] || []).length;
      rows += '<div class="card lectcard"><div class="lechead"><div><div class="lectitle">' + esc(t.topic) + '</div>' +
        (saved ? '<div class="small muted">' + saved + ' news item' + (saved > 1 ? 's' : '') + ' saved</div>' : '') +
        '</div><div class="row" style="margin:0">' +
        (t.written ? '<button class="btn primary sm" data-lectstart="' + idx + '">Open lecture</button>' : '') +
        (t.written && !lectSaved()[t.id] ? '<button class="btn sm" data-lectsave="' + idx + '">Save offline</button>' : '') +
        (lectSaved()[t.id] ? '<span class="chip ok">Saved offline</span>' : '') +
        '<button class="btn' + (t.written ? ' ghost' : ' primary') + ' sm" data-lectwrite="' + idx + '"' + (L.writing ? ' disabled' : '') + '>' +
        (L.writing === t.id ? 'Writing…' : t.written ? 'Generate again' : 'Generate lecture') + '</button></div></div></div>';
    });
    body(
      '<h1>Lecturette</h1>' +
      '<p class="lead">Press <b>Generate lecture</b> for a full three-minute speech. It stays saved here, with the latest news on that topic below it.</p>' +
      '<div class="card lectform"><div class="field"><label for="lectCat">Category</label><div class="ctl"><select id="lectCat"><option value="all">All ' + topics.length + ' topics</option>' +
      '<option value="__saved"' + (L.cat === '__saved' ? ' selected' : '') + '>Saved offline (' + Object.keys(lectSaved()).length + ')</option>' +
      lectCats().map(function (c) { return '<option' + (L.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="lectSearch">Find a topic</label><div class="ctl"><input id="lectSearch" class="textinput" type="search" value="' + esc(L.q || '') + '"></div></div></div>' +
      (rows || '<div class="empty">No topic matches.</div>')
    );
    document.getElementById('lectCat').addEventListener('change', function (e) { L.cat = e.target.value; render(); });
    document.getElementById('lectSearch').addEventListener('change', function (e) { L.q = e.target.value; render(); });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectstart]'), function (b) {
      b.addEventListener('click', function () { startLecture(topics[+b.getAttribute('data-lectstart')], null); });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectwrite]'), function (b) {
      b.addEventListener('click', function () { writeLecture(topics[+b.getAttribute('data-lectwrite')]); });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectsave]'), function (b) {
      b.addEventListener('click', function () { saveLectureOffline(topics[+b.getAttribute('data-lectsave')]).then(render); });
    });
  }

  function fetchHotTopics() {
    var L = lectState();
    L.hotBusy = true;
    L.hot = null;
    render();
    window.api
      .lecturesHot()
      .then(function (res) {
        L.hotBusy = false;
        L.hot = res || { ok: false, error: 'empty' };
        render();
      })
      .catch(function (err) {
        L.hotBusy = false;
        L.hot = { ok: false, error: 'network', detail: err && err.message };
        render();
      });
  }

  function startLecture(topic, extra) {
    var L = lectState();
    // Topics carry no script of their own; there is nothing to show until one is generated.
    if (!extra && !(topic.speech && topic.speech.intro && topic.speech.intro.length)) return writeLecture(topic);
    L.summary = null;
    L.run = {
      topic: lectRunTopic(topic, extra),
      phase: 0,
      remaining: LECT_PHASES[0].secs,
      // The clock counts down to a deadline, so a phone that slows the page in
      // the background cannot stretch the three minutes.
      deadline: Date.now() + LECT_PHASES[0].secs * 1000,
      paused: false,
      startedAt: Date.now(),
      done: false
    };
    L.mode = 'run';
    S.view = 'lecturette';
    window.api.keepAwake(true);
    cue('start');
    render();
  }

  function mountLecture() {
    var L = lectState();
    var R = L.run;
    if (!R) return renderLectList();
    var t = R.topic;

    if (!document.getElementById('lectClock')) {
      shell(
        '<div class="run">' +
          '<div class="runbar">' +
          '<span class="chip ok">LECTURETTE</span>' +
          '<span class="chip" id="lectPhaseChip"></span>' +
          '<span class="chip">' + esc(t.hot ? 'headline topic' : t.theme || 'topic') + '</span>' +
          '<span class="spacer"></span>' +
          '<span class="countdown-big" id="lectClock"></span>' +
          '<button class="btn ghost sm" id="lectPause">Pause</button>' +
          '<button class="btn sm" id="lectNext">Next phase →</button>' +
          '<button class="btn primary sm" id="lectFinish">Finish</button>' +
          '</div>' +
          '<div class="runbody lectpage">' +
          '<div class="progress"><i id="lectBar"></i></div>' +
          '<div class="lect-cue" id="lectCue"></div>' +
          '<div class="lect-grid">' +
          '<div class="lect-main" id="lectBody"></div>' +
          '<aside class="lect-side">' + lectFactsHtml(t) + '</aside>' +
          '</div>' +
          '<div id="lectLive" class="lectlivedock"></div>' +
          '<div class="footbar">' +
          '<span class="hint">The phase changes by itself. Look up from the screen, speak in points, and keep your notebook open.</span>' +
          '<span class="right"><button class="btn primary sm" id="lectSaveNow">Save offline</button> <button class="btn ghost sm" id="lectList">All topics</button></span>' +
          '</div>' +
          '</div>' +
          '</div>'
      );

      document.getElementById('lectPause').addEventListener('click', function () { lecturePause(); });
      document.getElementById('lectNext').addEventListener('click', function () { lectureNextPhase(); });
      document.getElementById('lectFinish').addEventListener('click', function () { finishLecture('manual'); });
      document.getElementById('lectList').addEventListener('click', function () { leaveLecture(); });
      document.getElementById('lectSaveNow').addEventListener('click', function () {
        var tp = lectState().run && lectState().run.topic;
        if (tp) saveLectureOffline(tp);
      });
    }

    paintLecture(true);
    stopLectTimer();
    L.timer = setInterval(lectTick, 1000);
    // Current points load in the background: the clock starts either way, and
    // a failed fetch only leaves the panel telling you what is saved.
    loadLive(false);
  }

  function paintLecture(buildBody) {
    var R = lectState().run;
    if (!R) return;
    var phase = LECT_PHASES[R.phase];
    var clockEl = document.getElementById('lectClock');
    var chip = document.getElementById('lectPhaseChip');
    var bar = document.getElementById('lectBar');
    var cue = document.getElementById('lectCue');
    var bodyEl = document.getElementById('lectBody');
    var pauseBtn = document.getElementById('lectPause');

    if (clockEl) {
      clockEl.textContent = clock(R.remaining * 1000);
      clockEl.classList.toggle('low', R.remaining <= 10);
    }
    if (chip) chip.textContent = phase.label + ' · ' + phase.secs + 's';
    if (pauseBtn) pauseBtn.textContent = R.paused ? 'Resume' : 'Pause';
    if (bar) {
      var pct = Math.max(0, Math.min(1, R.remaining / phase.secs)) * 100;
      bar.style.width = pct.toFixed(2) + '%';
      var prog = bar.parentNode;
      if (prog) prog.classList.toggle('warn', pct < 25);
    }
    if (buildBody && cue) {
      cue.innerHTML = '<b>' + esc(phase.label) + ' — ' + phase.secs + ' seconds.</b> ' + esc(phase.cue);
    }
    if (buildBody && bodyEl) {
      bodyEl.innerHTML =
        '<h2 class="lecttopic">' + esc(R.topic.topic) + '</h2>' + lectPhaseBodyHtml(R.topic, R.phase);
    }
  }


  function lectPhaseBodyHtml(t, phaseIdx) {
    var id = LECT_PHASES[phaseIdx].id;

    if (t.hot) {
      var guide = {
        intro: [
          'Say what the topic means in one sentence.',
          'Give the background in two lines.',
          'Say why it is in the news right now.'
        ],
        body: [
          'Present the facts as they stand.',
          'Draw one parallel or comparison.',
          'Two advantages and two disadvantages.',
          'One figure, date or line you remember.',
          'Say what it changes for India.'
        ],
        conclusion: [
          'What may happen next.',
          'The biggest challenge.',
          'The precaution that should be taken.',
          'Your own clear opinion.'
        ]
      };
      return (
        '<div class="lectblock"><div class="lectlabel">Headline</div><p>' + esc(t.topic) + '</p></div>' +
        '<div class="lectblock"><div class="lectlabel">Cover in this phase</div><ul>' + lectBullets(guide[id]) + '</ul></div>' +
        (t.link ? '<div class="row"><button class="btn sm ghost" data-external="' + esc(t.link) + '">Open the source</button></div>' : '')
      );
    }

    // A full script reads as one page, like a prepared talk: the three parts
    // with their times, body paragraphs under short headings, and the part
    // being spoken now marked rather than the others hidden.
    if (t.speech && t.speech.intro && t.speech.intro.length) {
      var heads = t.speech.heads || [];
      var part = function (n, key, title) {
        var paras = (t.speech[key] || [])
          .map(function (p, i) {
            return (key === 'body' && heads[i] ? '<h4 class="lecthead">' + esc(heads[i]) + '</h4>' : '') +
              '<p class="lectpara">' + esc(p) + '</p>';
          })
          .join('');
        return (
          '<h3 class="lectpart' + (key === id ? ' now' : '') + '">' + n + '. ' + title +
          (key === id ? ' <span class="chip ok">speaking now</span>' : '') + '</h3>' + paras
        );
      };
      return (
        '<div class="lectessay">' +
        part(1, 'intro', 'Introduction — 30 seconds') +
        part(2, 'body', 'Body — 2 minutes') +
        part(3, 'conclusion', 'Conclusion — 30 seconds') +
        (t.words ? '<p class="small muted">' + t.words + ' words — about three minutes at a calm pace.</p>' : '') +
        '</div>' +
        lectKeywordsHtml(t)
      );
    }

    if (id === 'intro') {
      return (
        '<div class="lectblock"><div class="lectlabel">What it means</div><p>' + esc(t.intro.meaning || '') + '</p></div>' +
        (t.intro.history
          ? '<div class="lectblock"><div class="lectlabel">Brief history</div><p>' + esc(t.intro.history) + '</p></div>'
          : '') +
        '<div class="lectblock"><div class="lectlabel">Why it came about</div><p>' + esc(t.intro.origin || '') + '</p></div>' +
        lectKeywordsHtml(t)
      );
    }

    if (id === 'body') {
      return (
        '<div class="lectblock"><div class="lectlabel">Present state and explanation</div><p>' + esc(t.body.present || '') + '</p></div>' +
        '<div class="lectblock"><div class="lectlabel">Draw this parallel</div><p>' + esc(t.body.parallels || '') + '</p></div>' +
        '<div class="lectcols">' +
        '<div class="lectblock"><div class="lectlabel ok">Advantages</div><ul>' + lectBullets(t.body.advantages) + '</ul></div>' +
        '<div class="lectblock"><div class="lectlabel bad">Disadvantages</div><ul>' + lectBullets(t.body.disadvantages) + '</ul></div>' +
        '</div>' +
        '<div class="lectblock"><div class="lectlabel">Impact</div><p>' + esc(t.body.impact || '') + '</p></div>' +
        '<div class="lectcallout"><b>Quote:</b> “' + esc((t.quote && t.quote.text) || '') + '”' +
        (t.quote && t.quote.who ? ' <span class="muted">— ' + esc(t.quote.who) + '</span>' : '') +
        '<br><b>Figure:</b> ' + esc(t.statistic || '') + '</div>'
      );
    }

    return (
      '<div class="lectblock"><div class="lectlabel">Future possibilities</div><p>' + esc(t.conclusion.future || '') + '</p></div>' +
      '<div class="lectblock"><div class="lectlabel">Challenges</div><ul>' + lectBullets(t.conclusion.challenges) + '</ul></div>' +
      '<div class="lectblock"><div class="lectlabel">Precautions to exercise</div><ul>' + lectBullets(t.conclusion.precautions) + '</ul></div>' +
      '<div class="lectblock opinion"><div class="lectlabel">Your opinion — end here</div><p>' + esc(t.conclusion.opinion || '') + '</p></div>'
    );
  }

  function lecturePause() {
    var R = lectState().run;
    if (!R || R.done) return false;
    R.paused = !R.paused;
    // Resuming sets a new deadline from what was left when the clock stopped.
    if (!R.paused) R.deadline = Date.now() + R.remaining * 1000;
    paintLecture(false);
    return R.paused;
  }

  function lectEnterPhase(R, phase) {
    R.phase = phase;
    R.remaining = LECT_PHASES[phase].secs;
    R.deadline = Date.now() + R.remaining * 1000;
    paintLecture(true);
    cue('next');
  }

  function lectureNextPhase() {
    var L = lectState();
    var R = L.run;
    if (!R || R.done) return;
    if (R.phase >= LECT_PHASES.length - 1) {
      finishLecture('manual');
      return;
    }
    lectEnterPhase(R, R.phase + 1);
  }

  function lectTick() {
    var L = lectState();
    var R = L.run;
    if (!R || R.done || R.paused) return;
    R.remaining = Math.max(0, Math.ceil((R.deadline - Date.now()) / 1000));
    if (R.remaining === 0) {
      if (R.phase < LECT_PHASES.length - 1) {
        lectEnterPhase(R, R.phase + 1);
        toast('Time — now the ' + LECT_PHASES[R.phase].label.toLowerCase() + ' (' + LECT_PHASES[R.phase].secs + ' seconds)');
      } else {
        finishLecture('time');
      }
      return;
    }
    paintLecture(false);
  }

  function finishLecture(reason) {
    var L = lectState();
    var R = L.run;
    if (!R) return;
    stopLectTimer();
    cue('end');
    window.api.keepAwake(false);
    R.done = true;
    L.summary = {
      topic: R.topic.topic,
      topicRef: R.topic,
      reason: reason,
      spent: Date.now() - R.startedAt
    };
    L.mode = 'done';
    L.run = null;
    render();
  }

  function leaveLecture() {
    stopLectTimer();
    window.api.keepAwake(false);
    var L = lectState();
    L.run = null;
    L.mode = 'list';
    render();
  }

  function renderLectDone() {
    var L = lectState();
    var sm = L.summary || {};
    body(
      '<h1>Lecturette finished</h1>' +
      '<p class="lead">' + esc(sm.topic || 'Topic') + ' · ' + clock(sm.spent || 0) + ' on the clock ' +
      (sm.reason === 'time' ? '(all three phases ran out)' : '(finished early)') + '</p>' +
      '<div class="note">Score yourself honestly against the pattern. Did the <b>intro</b> say what the topic means and where it came from? ' +
      'Did the <b>body</b> give the present state, a parallel, both sides and one figure or quote? ' +
      'Did the <b>conclusion</b> end with a clear opinion?</div>' +
      '<div class="row" style="margin-top:20px">' +
      '<button class="btn primary" id="lectAnother">Back to topics</button>' +
      '<button class="btn" id="lectRepeat">Repeat this topic</button>' +
      '<button class="btn ghost" id="lectHome">Home</button>' +
      '</div>'
    );
    document.getElementById('lectAnother').addEventListener('click', function () { leaveLecture(); });
    document.getElementById('lectRepeat').addEventListener('click', function () {
      if (sm.topicRef) startLecture(sm.topicRef, null);
      else leaveLecture();
    });
    document.getElementById('lectHome').addEventListener('click', function () { goto('home'); });
  }

  /* --------------------------------------------------------------- bin */

  // A picture that came out wrong leaves the test but is not destroyed. The bin
  // shows it with the date it was removed, and offers restore or delete for good.
  function renderBin() {
    var bin = S.tatBin || [];
    var items = bin
      .map(function (b) {
        var src = b.saved || b.file;
        return (
          '<div class="bin-item" data-bin="' + esc(b.id) + '">' +
          (src
            ? '<img src="' + esc(fileUrl(src)) + '" alt="" loading="lazy" />'
            : '<div class="tat-thumb-ph">No preview saved</div>') +
          '<div class="bin-cap" title="' + esc(b.title) + '">' + esc(b.title) + '</div>' +
          '<div class="bin-cap">' +
          esc((b.removedAt || '').slice(0, 10)) +
          ' · ' +
          esc(b.kind === 'mine' ? 'your picture' : b.kind === 'classic' ? 'classic set' : 'library') +
          '</div>' +
          '<div class="bin-actions">' +
          '<button class="btn sm" data-restore="' + esc(b.id) + '">Restore</button>' +
          '<button class="btn sm danger" data-purge="' + esc(b.id) + '">Delete forever</button>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    body(
      '<h1>Bin</h1>' +
        '<p class="lead">Pictures you took out on the PPDT review screen. They stay out of both PPDT and TAT, and nothing is ' +
        'destroyed until you press <b>Delete forever</b> or <b>Empty the bin</b>. Restore puts a picture straight back into its source.</p>' +
        (bin.length
          ? '<div class="row" style="margin-bottom:14px">' +
            '<span class="chip">' + bin.length + ' picture' + (bin.length === 1 ? '' : 's') + '</span>' +
            '<button class="btn sm danger" id="emptyBin">Empty the bin</button>' +
            '<button class="btn sm ghost" id="binAdd">Open PPDT</button>' +
            '</div>' +
            '<div class="bin-grid">' + items + '</div>'
          : '<div class="empty">The bin is empty. A wrong picture can be taken out from the PPDT review screen, and it will wait here.</div>' +
            '<div class="row" style="margin-top:14px"><button class="btn primary" id="binAdd">Open PPDT</button></div>') +
        (S.tatGone
          ? '<h3 style="margin-top:24px">Deleted for good — ' + S.tatGone + '</h3>' +
            '<div class="card"><div class="small muted" style="margin-bottom:10px">Out of every TAT test, and still out after a restart. ' +
            'A bundled picture is never really lost from the app, so any of these can be undone.</div>' +
            '<ul style="list-style:none;margin:0;padding:0">' +
            (S.tatGoneItems || []).map(function (g) {
              return (
                '<li class="diag-row"><span>' + esc(g.title || g.id) + ' · ' + esc((g.at || '').slice(0, 10)) + '</span>' +
                '<button class="btn sm" data-resurrect="' + esc(g.id) + '">Undo</button></li>'
              );
            }).join('') +
            '</ul>' +
            '<div class="row" style="margin-top:12px"><button class="btn sm" id="resetGone">Bring them all back</button></div></div>'
          : '')
    );

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-restore]'), function (b) {
      b.addEventListener('click', function () {
        restorePicture(b.getAttribute('data-restore'));
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-purge]'), function (b) {
      b.addEventListener('click', function () {
        purgePicture(b.getAttribute('data-purge'));
      });
    });

    var empty = document.getElementById('emptyBin');
    if (empty) {
      empty.addEventListener('click', function () {
        var n = (S.tatBin || []).length;
        if (!n) return;
        if (!window.confirm('Delete ' + n + ' picture' + (n === 1 ? '' : 's') + ' for good? This cannot be undone.')) return;
        window.api.tatEmptyBin().then(function () {
          S.tatBin = [];
          refreshTatSources();
          toast('Bin emptied');
          render();
        });
      });
    }
    var add = document.getElementById('binAdd');
    if (add) add.addEventListener('click', function () { goto('ppdt'); });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-resurrect]'), function (b) {
      b.addEventListener('click', function () {
        resurrectPicture(b.getAttribute('data-resurrect'));
      });
    });
    var reset = document.getElementById('resetGone');
    if (reset) {
      reset.addEventListener('click', function () {
        window.api.tatResetGone().then(function () {
          S.tatGone = 0;
          S.tatGoneItems = [];
          return refreshTatSources();
        }).then(function () {
          toast('Every deleted picture is back in the test');
          render();
        });
      });
    }
  }

  function resurrectPicture(id) {
    return window.api.tatResurrect(id).then(function () {
      return refreshTatSources();
    }).then(function () {
      toast('Picture back in the test');
      render();
    });
  }

  function refreshTatSources() {
    return Promise.all([
      window.api.tatLibrary(),
      window.api.tatClassic(),
      window.api.listTatImages(),
      window.api.tatBin(),
      window.api.tatGoneList(),
      window.api.ppdtList ? window.api.ppdtList() : []
    ]).then(function (res) {
      S.tatLibrary = res[0] || [];
      S.tatClassic = res[1] || [];
      S.tatImages = res[2] || [];
      S.tatBin = res[3] || [];
      S.tatGoneItems = res[4] || [];
      S.tatGone = S.tatGoneItems.length;
      S.ppdt = res[5] || [];
    });
  }

  function dropPicture(payload) {
    return window.api.tatRemove(payload).then(function (res) {
      if (res && res.bin) S.tatBin = res.bin;
      return refreshTatSources().then(function () {
        toast('Moved to the bin — restore it any time');
        render();
      });
    });
  }

  function restorePicture(id) {
    return window.api.tatRestore(id).then(function (res) {
      if (res && res.bin) S.tatBin = res.bin;
      return refreshTatSources().then(function () {
        toast('Picture restored');
        render();
      });
    });
  }

  function purgePicture(id) {
    return window.api.tatPurge(id).then(function (res) {
      if (res && res.bin) S.tatBin = res.bin;
      return refreshTatSources().then(function () {
        toast('Deleted for good');
        render();
      });
    });
  }

  /* ------------------------------------------------------- add material */

  function pickCard(src, title, payload, sub) {
    return (
      '<div class="pick">' +
      (src ? '<img src="' + esc(fileUrl(src)) + '" alt="" loading="lazy" />' : '<div class="tat-thumb-ph">No picture</div>') +
      '<button class="pick-rm" title="Move to the bin" data-drop="' + esc(JSON.stringify(payload)) + '">×</button>' +
      '<div class="pick-cap" title="' + esc(title) + '">' + esc(title) + '</div>' +
      (sub ? '<div class="pick-cap">' + esc(sub) + '</div>' : '') +
      '</div>'
    );
  }

  function importCard(kind, title, help, count) {
    return '<h2>' + esc(title) + '</h2><div class="card"><p class="small muted" style="margin-top:0">' + help + '</p>' +
      '<div class="row"><input data-import="' + kind + '" type="file"' + (onPhone() ? '' : ' accept=".xlsx"') + ' aria-label="' + esc(title) + ' Excel file" />' +
      '<span class="chip">' + esc(count) + '</span></div><div class="note import-out" id="importOut-' + kind + '" hidden></div></div>';
  }

  function renderAdd() {
    var mine = (S.tatImages || []).length;
    var sets = function (k) { return customSets(k).reduce(function (n, x) { return n + x.items.length; }, 0); };
    body(
      '<h1>Add material</h1>' +
      '<h2>PPDT and TAT pictures</h2>' +
      '<div class="card"><p class="small muted" style="margin-top:0">Pictures you upload join both tests, alongside the ' + (S.ppdt || []).length + ' built in. A wrong picture can be taken out from the PPDT review screen, and brought back from the Bin.</p>' +
      '<div class="row"><button class="btn primary" id="addTatPics">Upload pictures…</button>' +
      '<span class="chip">' + mine + ' uploaded</span>' +
      (mine ? '<button class="btn sm ghost" id="clearPics">Remove uploaded</button>' : '') + '</div><div class="note import-out" id="importOut-pics" hidden></div></div>' +
      importCard('wat', 'WAT words', 'A column headed <b>Word</b> or <b>WAT</b>. Other columns are ignored.', sets('wat') + ' added') +
      importCard('srt', 'SRT situations', 'A column headed <b>Situation</b>, <b>SRT</b> or <b>Question</b>.', sets('srt') + ' added') +
      importCard('lect', 'Lecture topics', 'A column headed <b>Topic</b>, and <b>Category</b> if you have one. Repeats are found even when worded a little differently.', (S.config.lectOwn || []).length + ' added') +
      masterCardHtml()
    );
    wireMasterCard();
    document.getElementById('addTatPics').addEventListener('click', function () {
      window.api.pickTatImages().then(function (list) {
        S.tatImages = list || [];
        return window.api.tatLastPick();
      }).then(function (r) {
        S.importMsg = { kind: 'pics', text: r.added + ' new pictures added. ' + r.duplicates + ' duplicates skipped: the same picture is already in the app.' };
        renderAdd();
      });
    });
    var clearPics = document.getElementById('clearPics');
    if (clearPics) {
      clearPics.addEventListener('click', function () {
        window.api.clearTatImages().then(function () { S.tatImages = []; renderAdd(); });
      });
    }
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-import]'), function (input) {
      var kind = input.getAttribute('data-import');
      input.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var done = function (msg) {
          S.importMsg = { kind: kind, text: msg };
          renderAdd();
        };
        importFile(file, kind).then(done, function (err) {
          done('Could not load that file: ' + ((err && err.message) || 'unknown error'));
        });
      });
    });
    if (S.importMsg) {
      var impOut = document.getElementById('importOut-' + S.importMsg.kind);
      impOut.textContent = S.importMsg.text;
      impOut.hidden = false;
      S.importMsg = null;
    }
  }

  /* ------------------------------------------------- master copy: publish */

  // The PC with a GitHub key is the master: its own WAT and SRT sets (the
  // "(mine)" ones above) go to every phone that presses Refresh content.
  function masterPack() {
    var pick = function (test) {
      return ((S.config.custom && S.config.custom[test]) || []).map(function (c) {
        return {
          id: String(c.id),
          name: String(c.name || 'Set').slice(0, 80),
          items: (c.items || []).map(function (i) { return String(i).trim().slice(0, 600); }).filter(Boolean).slice(0, 500)
        };
      }).filter(function (c) { return c.items.length; });
    };
    return { format: 1, wat: pick('wat'), srt: pick('srt') };
  }

  function masterCardHtml() {
    if (onPhone() || !window.api.contentPublish || !S.isMaster) return '';
    var pk = masterPack();
    var has = !!(S.config.masterToken);
    var last = S.config.masterPublished;
    return '<h2>Master copy: send to every phone</h2>' +
      '<div class="card"><p class="small muted" style="margin-top:0">Your own WAT and SRT sets (the ones marked <b>mine</b>) are published from this PC. ' +
      'Every phone gets them when someone presses <b>Refresh content</b> on its WAT or SRT screen. TAT pictures are not sent: the app\'s GitHub is public, and TAT pictures are copyrighted.</p>' +
      '<div class="field"><label>GitHub key<br><span class="small muted">' + (has ? 'Saved on this PC only' : 'Needed once, to publish') + '</span></label>' +
      '<div class="ctl"><input type="password" id="masterTok" autocomplete="off" placeholder="' + (has ? '•••••••• (saved)' : 'github_pat_…') + '" style="min-width:260px">' +
      ' <button class="btn sm" id="masterTokSave">Save key</button>' + (has ? ' <button class="btn sm ghost" id="masterTokClear">Remove key</button>' : '') + '</div></div>' +
      '<div class="row" style="align-items:center">' +
      '<button class="btn primary" id="masterPublish"' + (has ? '' : ' disabled') + '>Publish to all phones</button>' +
      '<span class="small muted">Will send ' + pk.wat.length + ' WAT and ' + pk.srt.length + ' SRT sets.' +
      (last ? ' Last published: v' + esc(last.version) + ', ' + esc(new Date(last.published).toLocaleString('en-IN')) + '.' : '') + '</span></div>' +
      '<div class="note import-out" id="masterOut" hidden></div></div>';
  }

  function wireMasterCard() {
    var save = document.getElementById('masterTokSave');
    if (!save) return;
    var out = document.getElementById('masterOut');
    var say = function (t) { out.textContent = t; out.hidden = false; };
    save.addEventListener('click', function () {
      var v = document.getElementById('masterTok').value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(v)) { say('That does not look like a GitHub key. It starts with github_pat_ and has no spaces.'); return; }
      S.config.masterToken = v;
      window.api.setConfig({ masterToken: v }).then(function () { toast('GitHub key saved on this PC.'); renderAdd(); });
    });
    var clr = document.getElementById('masterTokClear');
    if (clr) clr.addEventListener('click', function () {
      S.config.masterToken = '';
      window.api.setConfig({ masterToken: '' }).then(function () { renderAdd(); });
    });
    var pub = document.getElementById('masterPublish');
    pub.addEventListener('click', function () {
      if (!S.config.onlineEnabled) { say('Turn on Online lookup in Settings first.'); return; }
      var pk = masterPack();
      if (!pk.wat.length && !pk.srt.length) { say('There is nothing to send yet. Import WAT words or SRT situations above first.'); return; }
      pub.disabled = true;
      pub.textContent = 'Publishing…';
      window.api.contentPublish(pk).then(function (r) {
        pub.disabled = false;
        pub.textContent = 'Publish to all phones';
        if (!r || !r.ok) {
          say(r && r.error === 'bad-token' ? 'GitHub refused the key. Make a new one with Contents: Read and write on SSB-Prep-Trainer, and save it again.'
            : r && r.error === 'no-token' ? 'Save the GitHub key first.'
            : r && r.error === 'offline' ? 'Turn on Online lookup in Settings first.'
            : 'Could not publish: ' + ((r && (r.detail || r.error)) || 'unknown') + '.');
          return;
        }
        var mark = { version: r.version, published: r.published };
        S.config.masterPublished = mark;
        window.api.setConfig({ masterPublished: mark });
        say('Published v' + r.version + ': ' + pk.wat.length + ' WAT and ' + pk.srt.length + ' SRT sets. Phones get them with Refresh content (it can take a minute).');
      });
    });
  }

  function validWords(text) {
    var seen = {};
    var out = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach(function (line) {
        var w = line.trim();
        if (!/^[A-Za-z][A-Za-z' -]{0,24}$/.test(w)) return;
        var key = w.toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        out.push(w);
      });
    return out;
  }

  /* ------------------------------------------------------- news examples */

  // Headlines used for the sixth WAT example. Loaded once at boot, kept for
  // three months by the main process, and never required: without it WAT simply
  // shows the five hand-written sentences.
  function loadNewsIndex(force) {
    if (S.newsLoading) return;
    S.newsLoading = true;
    window.api
      .newsIndex({ force: !!force })
      .then(function (res) {
        S.newsIndex = res && res.ok ? res : { ok: false };
      })
      .catch(function () {
        S.newsIndex = { ok: false };
      })
      .then(function () {
        S.newsLoading = false;
      });
  }

  function newsExampleFor(word) {
    var items = S.newsIndex && S.newsIndex.items;
    if (!items || !items.length) return null;
    var w = String(word || '').toLowerCase().trim();
    if (w.length < 4) return null;
    var stem = w.replace(/(ing|ed|es|s)$/, '') || w;
    if (stem.length < 3) stem = w;
    var safe = stem.replace(/[^a-z]/g, '');
    if (!safe) return null;
    var re = new RegExp('\\b' + safe, 'i');
    for (var i = 0; i < items.length; i++) {
      if (re.test(items[i].text || '')) return items[i];
    }
    return null;
  }

  /* ------------------------------------------------------- library view */

  function libState() {
    if (!S.lib) {
      S.lib = {
        info: null,
        tab: 'all',
        query: '',
        items: [],
        offset: 0,
        limit: 60,
        hasMore: false,
        busy: false,
        started: false,
        open: {},
        connectors: null,
        online: null,
        theme: 'duty',
        fetching: false,
        fetched: null
      };
    }
    return S.lib;
  }

  function cap(p) {
    var s = String(p || '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function libFetchError(r) {
    if (!r) return 'Nothing came back.';
    if (r.error === 'offline') return 'Turn on online lookup first.';
    if (r.error === 'network') return 'Could not reach the dictionary. Check your connection.' + (r.detail ? ' (' + r.detail + ')' : '');
    if (r.error === 'no-definition') return 'The online dictionary had no meaning for that word.';
    if (r.error === 'bad-word') return 'That word cannot be looked up.';
    return 'Lookup failed (' + (r.error || 'unknown') + ').';
  }

  function libStatHtml(L) {
    var info = L.info;
    if (!info) return '<div class="empty">Reading the word library…</div>';
    return (
      '<div class="stat">' +
      '<div class="box"><div class="num">' + info.words.toLocaleString() + '</div><div class="lbl">words in library</div></div>' +
      '<div class="box"><div class="num">' + info.withDefinitions.toLocaleString() + '</div><div class="lbl">with meanings</div></div>' +
      '<div class="box"><div class="num">' + info.positive.toLocaleString() + '</div><div class="lbl">positive words</div></div>' +
      '<div class="box"><div class="num">' + info.negative.toLocaleString() + '</div><div class="lbl">negative words</div></div>' +
      '</div>'
    );
  }

  function libTabsHtml(L) {
    return [
      ['all', 'All words'],
      ['positive', 'Positive'],
      ['negative', 'Negative'],
      ['connectors', 'Action verbs']
    ]
      .map(function (t) {
        return (
          '<button class="navlink' + (L.tab === t[0] ? ' active' : '') + '" data-libt="' + t[0] + '">' + t[1] + '</button>'
        );
      })
      .join('');
  }

  function libRowHtml(it) {
    var L = libState();
    var open = L.open[it.word];
    var badge;
    if (it.sentiment > 0) badge = '<span class="chip ok">positive +' + it.sentiment + '</span>';
    else if (it.sentiment < 0) badge = '<span class="chip bad">negative ' + it.sentiment + '</span>';
    else if (it.senseCount) badge = '<span class="chip">' + it.senseCount + ' meaning' + (it.senseCount === 1 ? '' : 's') + '</span>';
    else badge = '<span class="chip warn">no offline meaning</span>';

    var defs = '';
    if (open === 'loading') {
      defs = '<div class="defs muted small">Looking up…</div>';
    } else if (Array.isArray(open) && open.length) {
      defs =
        '<div class="defs">' +
        open
          .map(function (s) {
            return '<div class="def"><span class="pos">' + esc(cap(s.pos)) + '</span>' + esc(s.def) + '</div>';
          })
          .join('') +
        (open.remote ? '<div class="muted small" style="margin-top:6px">fetched from the internet</div>' : '') +
        '</div>';
    } else if (open === 'none') {
      defs =
        '<div class="defs muted small">No meaning stored offline for this word.' +
        (L.online && L.online.enabled ? ' The online lookup found nothing for it either.' : ' Turn on <b>online lookup</b> below to fetch one.') +
        '</div>';
    }

    return (
      '<div class="wordrow' + (open ? ' open' : '') + '">' +
      '<div class="whead">' +
      '<div class="wleft">' +
      '<div class="wtop"><b class="w">' + esc(it.word) + '</b>' +
      (it.pos ? '<span class="chip">' + esc(cap(it.pos)) + '</span>' : '') +
      badge +
      '</div>' +
      (it.preview ? '<div class="muted small wprev">' + esc(it.preview) + '</div>' : '') +
      '</div>' +
      '<button class="btn sm' + (open ? ' ghost' : '') + '" data-meaning="' + esc(it.word) + '">' +
      (open ? 'Hide' : 'Meaning') +
      '</button>' +
      '</div>' +
      defs +
      '</div>'
    );
  }

  function onlinePanelHtml(L) {
    var on = !!(L.online && L.online.enabled);
    var extra = '';
    if (on) {
      var result = '';
      if (L.fetching) {
        result = '<div class="muted small">Fetching…</div>';
      } else if (L.fetched) {
        result = L.fetched.ok
          ? '<div class="muted small">' + L.fetched.words.length + ' words fetched for “' + esc(L.fetched.theme) + '”.</div>' +
            '<div class="words">' +
            L.fetched.words
              .map(function (w) {
                return '<span class="wchip">' + esc(w) + '</span>';
              })
              .join('') +
            '</div>' +
            '<div class="row" style="margin-top:12px"><button class="btn primary sm" id="libSaveSet">Save as a new WAT practice set</button></div>'
          : '<div class="muted small">' + esc(libFetchError(L.fetched)) + '</div>';
      }
      extra =
        '<div class="card onlinecard">' +
        '<div class="field"><label>Theme for a new word list<br><span class="small muted">for example: duty, courage, teamwork, discipline, sacrifice</span></label>' +
        '<div class="ctl"><input id="libTheme" type="text" value="' + esc(L.theme) + '" />' +
        '<button class="btn" id="libFetch">Fetch 60 words</button></div></div>' +
        result +
        '<div class="note plain"><b>SRT and TAT:</b> no free public service publishes situation lists or picture sets through an API, ' +
        'and the app will not scrape other people’s practice material. Use <b>TAT → Add pictures…</b> for your own pictures, or paste ' +
        'your own situations in <b>Settings</b>. These buttons open a search so you can find sources yourself:</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<button class="btn sm ghost" data-external="https://www.google.com/search?q=SSB+SRT+situation+reaction+test+practice+60+situations">Find SRT sets</button>' +
        '<button class="btn sm ghost" data-external="https://www.google.com/search?q=SSB+TAT+pictures+practice+set">Find TAT pictures</button>' +
        '</div>' +
        '</div>';
    }

    return (
      '<h2>Extra words from the internet</h2>' +
      '<div class="note">Optional, and off by default — everything above works with no connection. When it is on, the app asks a free ' +
      'public dictionary (Datamuse) for word meanings and new word lists. <b>No account, no key, no subscription.</b> The page itself stays ' +
      'locked to offline; lookups run in the background.</div>' +
      '<div class="row" style="margin:14px 0">' +
      '<button class="btn ' + (on ? '' : 'primary') + '" id="libOnline">' + (on ? 'Turn online lookup off' : 'Turn online lookup on') + '</button>' +
      '<span class="chip ' + (on ? 'ok' : '') + '">' + (on ? 'online lookup on' : 'offline only') + '</span>' +
      '</div>' +
      extra
    );
  }

  function paintList() {
    var host = document.getElementById('libList');
    if (!host) return;
    var L = libState();
    if (L.tab === 'connectors') {
      var C = L.connectors;
      if (!C) {
        host.innerHTML = '<div class="empty">' + (L.busy ? 'Reading the verb list…' : 'No verb list found.') + '</div>';
        return;
      }
      host.innerHTML =
        (C.note ? '<p class="lead small">' + esc(C.note) + '</p>' : '') +
        (C.groups || [])
          .map(function (g) {
            return (
              '<div class="conn-group">' +
              '<h3 class="conn-head">' + esc(g.label) + '</h3>' +
              '<p class="small muted" style="margin:0 0 8px">' + esc(g.hint) + '</p>' +
              (g.items || []).map(libRowHtml).join('') +
              '</div>'
            );
          })
          .join('') +
        (C.source ? '<p class="small muted" style="margin-top:16px">' + esc(C.source) + '</p>' : '');
      Array.prototype.forEach.call(host.querySelectorAll('[data-meaning]'), function (b) {
        b.addEventListener('click', function () {
          toggleMeaning(b.getAttribute('data-meaning'));
        });
      });
      return;
    }
    if (!L.items.length) {
      host.innerHTML = '<div class="empty">' + (L.busy ? 'Reading the library…' : 'No words match that search.') + '</div>';
    } else {
      host.innerHTML =
        L.items.map(libRowHtml).join('') +
        (L.hasMore ? '<div class="row" style="margin:14px 0"><button class="btn" id="libMore">Load more</button></div>' : '');
    }
    Array.prototype.forEach.call(host.querySelectorAll('[data-meaning]'), function (b) {
      b.addEventListener('click', function () {
        toggleMeaning(b.getAttribute('data-meaning'));
      });
    });
    var more = document.getElementById('libMore');
    if (more)
      more.addEventListener('click', function () {
        loadLib(false);
      });
  }

  function loadLib(reset) {
    var L = libState();
    if (L.tab === 'connectors') {
      if (L.connectors) {
        paintList();
        return;
      }
      L.busy = true;
      window.api.connectors().then(function (res) {
        L.connectors = res || { groups: [] };
        L.busy = false;
        paintList();
      });
      return;
    }
    if (L.busy) return;
    L.busy = true;
    if (reset) {
      L.offset = 0;
      L.items = [];
      L.hasMore = false;
    }
    var req =
      L.tab === 'positive' || L.tab === 'negative'
        ? window.api.dictSentiment({ type: L.tab, offset: L.offset, limit: L.limit })
        : window.api.dictSearch({ query: L.query, offset: L.offset, limit: L.limit });

    req
      .then(function (res) {
        var incoming = (res && res.items) || [];
        L.items = reset ? incoming : L.items.concat(incoming);
        L.hasMore = !!(res && res.hasMore);
        L.offset = L.items.length;
        L.busy = false;
        paintList();
      })
      .catch(function () {
        L.busy = false;
        paintList();
        toast('Could not read the word library.');
      });
  }

  function toggleMeaning(word) {
    var L = libState();
    if (L.open[word]) {
      delete L.open[word];
      paintList();
      return;
    }
    L.open[word] = 'loading';
    paintList();

    window.api.dictGet(word).then(function (res) {
      if (res && res.ok && res.entry.senses && res.entry.senses.length) {
        L.open[word] = res.entry.senses;
        paintList();
        return;
      }
      if (L.online && L.online.enabled) {
        return window.api.onlineMeaning(word).then(function (o) {
          if (o && o.ok) {
            var senses = o.senses.map(function (s) {
              return { pos: s.pos, def: s.def };
            });
            senses.remote = true;
            L.open[word] = senses;
          } else {
            L.open[word] = 'none';
            toast(libFetchError(o));
          }
          paintList();
        });
      }
      L.open[word] = 'none';
      paintList();
    });
  }

  function wireLibrary() {
    var L = libState();

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-libt]'), function (b) {
      b.addEventListener('click', function () {
        L.tab = b.getAttribute('data-libt');
        L.open = {};
        L.started = true;
        renderLibrary();
        // Switching tabs has to actually load that tab's words - renderLibrary
        // only fetches on the first visit, so ask for the new list here.
        loadLib(true);
      });
    });

    var q = document.getElementById('libQ');
    if (q) {
      var timer = null;
      q.addEventListener('input', function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          L.query = q.value.trim();
          L.open = {};
          loadLib(true);
        }, 250);
      });
      q.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          if (timer) clearTimeout(timer);
          L.query = q.value.trim();
          L.open = {};
          loadLib(true);
        }
      });
    }

    var rnd = document.getElementById('libRandom');
    if (rnd)
      rnd.addEventListener('click', function () {
        window.api.dictRandom({ count: 10, filter: L.tab === 'all' ? 'all' : L.tab }).then(function (res) {
          L.items = (res && res.items) || [];
          L.hasMore = false;
          L.offset = L.items.length;
          paintList();
          toast('10 random words');
        });
      });

    var onlineBtn = document.getElementById('libOnline');
    if (onlineBtn)
      onlineBtn.addEventListener('click', function () {
        var next = !(L.online && L.online.enabled);
        window.api.setConfig({ onlineEnabled: next }).then(function () {
          L.online = { enabled: next };
          S.config.onlineEnabled = next;
          toast(next ? 'Online lookup is on' : 'Online lookup is off');
          renderLibrary();
        });
      });

    var fetchBtn = document.getElementById('libFetch');
    if (fetchBtn)
      fetchBtn.addEventListener('click', function () {
        var themeEl = document.getElementById('libTheme');
        L.theme = (themeEl && themeEl.value.trim()) || 'duty';
        L.fetching = true;
        L.fetched = null;
        renderLibrary();
        window.api.onlineWords({ theme: L.theme, count: 60 }).then(function (res) {
          L.fetching = false;
          L.fetched =
            res && res.ok
              ? { ok: true, theme: res.theme, words: res.words }
              : { ok: false, error: (res && res.error) || 'network', detail: res && res.detail };
          renderLibrary();
        });
      });

    var saveBtn = document.getElementById('libSaveSet');
    if (saveBtn)
      saveBtn.addEventListener('click', function () {
        if (!L.fetched || !L.fetched.ok || !L.fetched.words.length) return;
        S.config.custom = S.config.custom || { tat: [], wat: [], srt: [] };
        S.config.custom.wat = S.config.custom.wat || [];
        S.config.custom.wat.push({
          id: 'online-wat-' + Date.now(),
          name: 'Online: ' + L.fetched.theme,
          items: L.fetched.words.slice(0, 60)
        });
        window.api.setConfig({ custom: S.config.custom });
        toast('Saved as a WAT set — find it on the Home screen');
      });
  }

  function renderLibrary() {
    var L = libState();
    body(
      '<h1>Word library</h1>' +
        '<p class="lead">A dictionary built into the app for word practice. Search any word and open its meaning, ' +
        'or browse the positive and negative lists.</p>' +
        libStatHtml(L) +
        '<div class="tabs">' + libTabsHtml(L) + '</div>' +
        '<div class="libsearch">' +
        '<input id="libQ" type="text" value="' + esc(L.query) + '" placeholder="Search ' +
        (L.info ? L.info.words.toLocaleString() : '') +
        ' words…" />' +
        '<button class="btn sm" id="libRandom">Random 10</button>' +
        '</div>' +
        '<div id="libList" class="liblist"></div>' +
        onlinePanelHtml(L) +
        '<p class="muted small" style="margin-top:22px">Definitions from <b>WordNet 3.1</b> (Princeton University) · ' +
        'positive / negative ratings from <b>AFINN-165</b> · full notices ship in <b>NOTICE.txt</b>.</p>'
    );

    wireLibrary();
    paintList();

    if (!L.info) {
      window.api.dictInfo().then(function (info) {
        L.info = info;
        if (S.view === 'library') renderLibrary();
      });
    }
    if (!L.online) {
      window.api.onlineStatus().then(function (st) {
        L.online = { enabled: !!(st && st.enabled) };
        if (S.view === 'library') renderLibrary();
      });
    }
    if (!L.started) {
      L.started = true;
      loadLib(true);
    }
  }

  /* ------------------------------------------------------- history view */

  function renderHistory() {
    if (!S.attempts.length) {
      body(
        '<h1>History</h1>' +
          '<div class="empty">No attempts saved yet. Finish a TAT, WAT or SRT set and it will appear here.</div>' +
          '<div class="row" style="margin-top:18px"><button class="btn primary" id="startBtn">Start practising</button></div>'
      );
      document.getElementById('startBtn').addEventListener('click', function () { goto('home'); });
      return;
    }

    var html = S.attempts
      .map(function (a) {
        var open = S.openAttempt === a.id;
        var m = META[a.test] || { code: a.test.toUpperCase() };
        var bodyHtml = '';
        if (open) {
          var detail = a.test === 'wat'
            ? '<div class="model-list" style="margin-top:12px">' + a.items.map(function (it) { return modelSentencesHtml(it.prompt); }).join('') + '</div>'
            : a.test === 'tat'
              ? '<div class="tat-gallery" style="margin-top:12px">' + tatGalleryHtml(a.items) + '</div>'
              : '<div style="margin-top:12px">' +
              a.items
                .map(function (it, i) {
                  var ans = String(it.response || '').trim();
                  var blank = a.test === 'srt' ? 'written in your practice copy' : 'left blank';
                  return (
                    '<div class="qa"><div class="n">' + (i + 1) + '</div>' +
                    '<div class="q">' + esc(it.prompt) + '</div>' +
                    '<div class="a' + (ans ? '' : ' blank') + '">' + (ans ? esc(ans) : blank) + '</div></div>'
                  );
                })
                .join('') +
              '</div>';
          bodyHtml =
            detail +
            '<div class="row" style="margin-top:12px">' +
            '<button class="btn sm" data-export="' + esc(a.id) + '">Export .txt</button>' +
            '<button class="btn sm danger" data-del="' + esc(a.id) + '">Delete</button></div>';
        }
        return (
          '<div class="attempt">' +
          '<div class="head">' +
          '<h3>' + m.code + ' · ' + esc(a.setName) + '</h3>' +
          '<span class="chip">' + fmtDate(a.startedAt) + '</span>' +
          '<span class="chip">' + clock(a.durationMs) + '</span>' +
          '<span class="chip ok">' +
          (a.test === 'wat'
            ? practised(a) + ' words · model sentences'
            : a.test === 'tat'
              ? practised(a) + ' slides · written in copy'
              : a.answered + '/' + a.total + ' answered') +
          '</span>' +
          '<span class="spacer" style="margin-left:auto"></span>' +
          '<button class="btn sm ghost" data-open="' + esc(a.id) + '">' + (open ? 'Hide' : 'View answers') + '</button>' +
          '</div>' +
          bodyHtml +
          '</div>'
        );
      })
      .join('');

    body(
      '<h1>History</h1>' +
        '<p class="lead">Every finished attempt, stored on this ' + (onPhone() ? 'phone' : 'computer') + ' only. ' + S.attempts.length + ' attempt(s).</p>' +
        '<div class="row" style="margin-bottom:16px"><button class="btn danger sm" id="clearAll">Clear all history</button></div>' +
        html
    );

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-open]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-open');
        S.openAttempt = S.openAttempt === id ? null : id;
        renderHistory();
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () {
        window.api.deleteAttempt(b.getAttribute('data-del')).then(function (list) {
          S.attempts = list || [];
          renderHistory();
        });
      });
    });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-export]'), function (b) {
      b.addEventListener('click', function () {
        var a = S.attempts.filter(function (x) { return x.id === b.getAttribute('data-export'); })[0];
        if (!a) return;
        window.api
          .exportText({ defaultName: 'SSB-' + a.test.toUpperCase() + '-' + a.setName.replace(/\s+/g, '-') + '.txt', text: attemptToText(a) })
          .then(function (res) {
            if (res && res.saved) toast(res.path === 'clipboard' ? 'Copied — paste it into any app' : 'Saved to ' + res.path);
          });
      });
    });
    var clr = document.getElementById('clearAll');
    if (clr) {
      clr.addEventListener('click', function () {
        window.api.clearAttempts().then(function () {
          S.attempts = [];
          renderHistory();
        });
      });
    }
    wireMySentences();
  }

  /* ------------------------------------------------------ settings view */

  function numField(label, sub, key, min, max, suffix) {
    return (
      '<div class="field"><label>' + label + '<br><span class="small muted">' + sub + '</span></label>' +
      '<div class="ctl"><input type="number" data-num="' + key + '" min="' + min + '" max="' + max + '" value="' +
      S.config[key] + '" /><span class="muted small">' + suffix + '</span></div></div>'
    );
  }

  function toggleField(label, sub, key) {
    return (
      '<div class="field"><label>' + label + '<br><span class="small muted">' + sub + '</span></label>' +
      '<div class="ctl"><button class="toggle' + (S.config[key] ? ' on' : '') + '" data-toggle="' + key + '"></button></div></div>'
    );
  }

  function renderSettings() {
    var custom = S.config.custom || { tat: [], wat: [], srt: [] };
    var mine = ['tat', 'wat', 'srt']
      .map(function (t) {
        var list = (custom[t] || []);
        if (!list.length) return '';
        return (
          '<div class="field"><label>' + META[t].code + ' custom sets<br><span class="small muted">' +
          list.map(function (s) { return esc(s.name) + ' (' + s.items.length + ')'; }).join(', ') +
          '</span></label><div class="ctl"><button class="btn sm ghost" data-clearcustom="' + t + '">Remove all</button></div></div>'
        );
      })
      .join('');

    body(        '<h1>Settings</h1>' +
        '<p class="lead">Adjust the timings to match your board or coaching guidance, choose a theme and set up AI writing.</p>' +

        '<h2>Appearance</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Theme<br><span class="small muted">' +
        'Navy and gold match the logo. ' +
        'Same layout, same type, same motion — only the colours change.</span></label>' +
        '<div class="ctl">' +
        '<button class="btn sm' + (S.config.theme !== 'alpine' && (S.config.palette || 'navy') === 'navy' ? ' primary' : '') + '" id="themeMist">Navy and gold</button>' +
        '<button class="btn sm' + (S.config.theme !== 'alpine' && S.config.palette === 'crimson' ? ' primary' : '') + '" id="themeCrimson">Crimson</button>' +
        '<button class="btn sm' + (S.config.theme !== 'alpine' && S.config.palette === 'green' ? ' primary' : '') + '" id="themeGreen">Green</button>' +
        '<button class="btn sm' + (S.config.theme === 'alpine' ? ' primary' : '') + '" id="themeAlpine">Light</button>' +
        '</div></div>' +
        toggleField('Reduce motion', 'Skip the tile orbit, lecturette slides and paging transitions. ' +
          (onPhone() ? 'Your phone\'s own "remove animations" setting' : 'Windows\' own "Animation effects" setting') +
          ' is always respected as well.', 'reduceMotion') +
        '</div>' +

        '<h2>Sound and internet</h2>' +
        '<div class="card">' +
        toggleField('Sound cues', 'A short chime when a test starts, when each word, picture or lecturette phase changes, ' +
          'and at the end' + (onPhone() ? '; the phone also buzzes' : '') + '. Taps on buttons click softly.', 'soundOn') +
        toggleField('Online lookup', 'Live news and the lecture writer. ' +
          'Everything else works with no connection.', 'onlineEnabled') +
        '</div>' +

        '<h2>Updates</h2>' +
        '<div class="card"><div class="row"><button class="btn" id="updateNow">Check for updates</button><span class="small muted" id="updateOut"></span></div></div>' +

        '<h2>AI writing</h2>' +
        '<div class="card">' +
        '<p class="small muted" style="margin-top:0">Lectures work straight away with no login. PPDT stories read a picture, so they need a provider marked for pictures. To add one, press Log in / Sign up, create a key on its page and paste it here. The first that answers does the writing, so one running out never stops you. Keys stay on this device.</p>' +
        Object.keys(AI_PROVIDERS).filter(function (id) { return !AI_PROVIDERS[id].pc && !AI_PROVIDERS[id].noLogin; }).map(function (id) {
          var a = aiSettings(id);
          return '<div class="field" id="aiRow-' + id + '"><label>' + esc(a.label) + (AI_PROVIDERS[id].vision ? '' : ' <span class="small muted">(text only)</span>') +
            '<br><button class="btn sm ghost" data-external="' + esc(AI_PROVIDERS[id].url) + '">Log in / Sign up (free)</button></label>' +
            '<div class="ctl"><input data-aikey="' + id + '" type="password" class="textinput" autocomplete="off" placeholder="' + (AI_BUILT_IN[id] ? 'built in' : 'paste your key') + '" value="' + esc(((S.config.aiKeys || {})[id]) || (id === 'ollama' ? S.config.ollamaKey || '' : '')) + '" />' +
            '<input data-aimodel="' + id + '" class="textinput" autocomplete="off" aria-label="' + esc(a.label) + ' model" value="' + esc(a.model) + '" /></div></div>';
        }).join('') +
        '<div class="row"><button class="btn" id="aiTest">Test them all</button></div><div class="small muted" id="aiTestOut"></div>' +
        '</div>' +

        '<h2>WAT timings</h2>' +
        '<div class="card">' +
        numField('Seconds per word', 'Standard is 15 seconds for each of the 60 words.', 'watPerWordSec', 5, 60, 'sec') +
        toggleField('Shuffle word order', 'Otherwise the standard published order is used.', 'shuffleWAT') +
        '</div>' +

        '<h2>SRT timings</h2>' +
        '<div class="card">' +
        numField('Total minutes', 'Standard is 60 situations in 30 minutes.', 'srtTotalMin', 5, 120, 'min') +
        toggleField('Shuffle situation order', 'Keeps you from memorising the list.', 'shuffleSRT') +
        '</div>' +

        '<h2>TAT timings</h2>' +
        '<div class="card">' +
        numField('Seconds to view each slide', 'Standard is 30 seconds.', 'tatViewSec', 5, 120, 'sec') +
        numField('Seconds to form your idea', 'No picture on screen. Standard is 30 seconds.', 'tatThinkSec', 5, 120, 'sec') +
        numField('Seconds to write each story', 'Standard is 4 minutes (240 seconds).', 'tatWriteSec', 30, 900, 'sec') +
        '</div>' +

        '<h2>PPDT</h2>' +
        '<div class="card">' +
        numField('Seconds to look', 'The hazy picture is shown this long. Standard is 30 seconds.', 'ppdtViewSec', 5, 120, 'sec') +
        numField('Seconds to think', 'Note the characters before writing.', 'ppdtThinkSec', 0, 120, 'sec') +
        numField('Seconds to write', 'Standard is 4 minutes (240 seconds).', 'ppdtWriteSec', 30, 600, 'sec') +
        numField('Blur', 'How hazy the picture looks; 0 is a clear picture.', 'ppdtBlur', 0, 80, '%') +
        '</div>' +

        '<h2>Add your own practice set</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Test</label><div class="ctl">' +
        '<select id="cTest"><option value="wat">WAT</option><option value="srt">SRT</option><option value="tat">TAT</option></select>' +
        '</div></div>' +
        '<div class="field"><label>Set name</label><div class="ctl" style="flex:1 1 auto">' +
        '<input id="cName" type="text" placeholder="e.g. Coaching batch list 4" class="textinput" style="flex:1 1 auto;width:auto" />' +
        '</div></div>' +
        '<div class="field" style="display:block">' +
        '<label>Items — one per line<br><span class="small muted">WAT: single words. SRT: situations. TAT: scene descriptions.</span></label>' +
        '<textarea id="cItems" class="answer" style="height:180px;margin-top:10px" spellcheck="false" placeholder="One item per line"></textarea>' +
        '</div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary sm" id="addCustom">Add set</button></div>' +
        '</div>' +
        (mine ? '<h2>Your sets</h2><div class="card">' + mine + '</div>' : '') +

        '<h2>Material notes</h2>' +
        '<div class="note">' +
        '<b>Word lists and situations</b> are adapted from publicly published SSB preparation material and rewritten for this app; ' +
        'they are practice prompts, not official board papers.<br><br>' +
        '<b>TAT pictures</b>: the classic set (' + (S.tatClassic || []).length + ' plates) is user-supplied practice material imported from a third-party PDF and your own folder; it is not public domain and is not covered by the project licence. ' +
        (onPhone()
          ? 'Museum pictures fetched online are public domain (CC0). You can also add your own pictures from the phone.<br><br>'
          : 'The default museum library (' + (S.tatLibrary || []).length.toLocaleString() + ' pictures) is public domain (CC0). You can also load any picture folder you already have.<br><br>') +
        'Format and timings reflect what SSB preparation sources consistently report: TAT 12 slides at 30 s view + 4 min write, ' +
        'WAT 60 words at 15 s each, SRT 60 situations in 30 minutes.' +
        '</div>' +

        '<h2>Storage</h2>' +
        '<div class="card">' +
        '<p class="small muted" style="margin:0">' +
        (onPhone()
          ? 'History, settings and your pictures are kept on this phone, inside the app. '
          : 'History and settings live in a single JSON file in this app\'s user-data folder. ') +
        'Nothing is uploaded anywhere.</p>' +
        '</div>' +

        '<h2>Export</h2>' +
        '<div class="card">' +
        '<p class="small muted" style="margin:0">' +
        'Batch-export your last 300 attempts as CSV or JSON. ' +
        'Use this to share your practice history with mentors or for personal records.' +
        '</p>' +
        '<div class="row" style="margin-top:12px">' +
        '<button class="btn sm" id="exportCsv">Export as CSV</button>' +
        '<button class="btn sm ghost" id="exportJson">Export as JSON</button>' +
        '</div>' +
        '</div>' +

        '<h2>Diagnostics</h2>' +
        '<div class="card">' +
        '<p class="small muted">Environment, data counts, the working flow and the live log — for debugging or handing the project to someone else.</p>' +
        '<div class="row"><button class="btn" id="openDiag">Open diagnostics</button></div>' +
        '</div>' +

        '<div class="row" style="margin-top:22px"><button class="btn" id="back">← Back</button></div>'
    );

    var tMist = document.getElementById('themeMist');
    if (tMist) tMist.addEventListener('click', function () { setTheme('mist', 'navy'); });
    document.getElementById('themeCrimson').addEventListener('click', function () { setTheme('mist', 'crimson'); });
    document.getElementById('themeGreen').addEventListener('click', function () { setTheme('mist', 'green'); });
    var tAlpine = document.getElementById('themeAlpine');
    if (tAlpine) tAlpine.addEventListener('click', function () { setTheme('alpine'); });

    // Saved as typed: a key pasted on a phone was lost when the box never lost focus.
    var saveAi = function () {
      var keys = {};
      var models = {};
      Array.prototype.forEach.call(appEl.querySelectorAll('[data-aikey]'), function (el) { keys[el.getAttribute('data-aikey')] = el.value.trim(); });
      Array.prototype.forEach.call(appEl.querySelectorAll('[data-aimodel]'), function (el) { models[el.getAttribute('data-aimodel')] = el.value.trim(); });
      S.config.aiKeys = keys;
      S.config.aiModels = Object.assign({}, S.config.aiModels, models);
      return window.api.setConfig({ aiKeys: keys, aiModels: S.config.aiModels });
    };
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-aikey],[data-aimodel]'), function (el) { el.addEventListener('input', saveAi); });
    document.getElementById('updateNow').addEventListener('click', function () {
      var out = document.getElementById('updateOut');
      out.textContent = 'Checking…';
      checkUpdate().then(function (u) {
        if (!u) out.textContent = 'Could not check just now.';
        else if (!u.ok) out.textContent = 'You have ' + u.current + '. ' + (u.error === 'offline' ? 'Turn Online lookup on to check.' : 'Could not reach GitHub just now.');
        else if (versionIsNewer(u.latest, u.current)) {
          S.updateHidden = '';
          out.innerHTML = 'Version ' + esc(u.latest) + ' is ready. <button class="btn primary sm" data-external="' + esc(u.url) + '">Download</button>';
          wireExternal(out);
        } else out.textContent = 'You have ' + u.current + ', the latest.';
      });
    });
    document.getElementById('aiTest').addEventListener('click', function () {
      var out = document.getElementById('aiTestOut');
      out.textContent = 'Asking…';
      saveAi().then(function () {
        var chain = aiChain();
        return Promise.all(chain.map(function (ai) {
          return window.api.aiChat({ ai: ai, prompt: 'Reply with the single word OK.' }).then(function (r) {
            return ai.label + ': ' + (r && r.ok ? 'working' : aiErrorText(r));
          });
        })).then(function (lines) {
          out.textContent = lines.join('  |  ') || aiErrorText({ error: 'no-key' });
        });
      });
    });
    wireExternal(appEl);

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-num]'), function (inp) {
      inp.addEventListener('change', function () {
        var key = inp.getAttribute('data-num');
        var v = parseInt(inp.value, 10);
        if (isNaN(v)) return;
        var min = parseInt(inp.min, 10);
        var max = parseInt(inp.max, 10);
        v = Math.max(min, Math.min(max, v));
        inp.value = v;
        S.config[key] = v;
        var patch = {};
        patch[key] = v;
        window.api.setConfig(patch);
        toast('Timing updated');
      });
    });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-toggle]'), function (t) {
      t.addEventListener('click', function () {
        var key = t.getAttribute('data-toggle');
        S.config[key] = !S.config[key];
        t.classList.toggle('on', S.config[key]);
        var patch = {};
        patch[key] = S.config[key];
        var saved = window.api.setConfig(patch);
        if (key === 'reduceMotion') {
          applyMotion();
          toast(S.config.reduceMotion ? 'Motion reduced' : 'Motion restored');
        }
        if (key === 'onlineEnabled') {
          toast(S.config.onlineEnabled ? 'Online lookup is on' : 'Online lookup is off');
          saved.then(function () { refreshNet(false); });
        }
        if (key === 'soundOn' && S.config.soundOn) cue('start');
      });
    });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-clearcustom]'), function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-clearcustom');
        S.config.custom = S.config.custom || {};
        S.config.custom[t] = [];
        window.api.setConfig({ custom: S.config.custom });
        renderSettings();
      });
    });

    var exportCsv = document.getElementById('exportCsv');
    if (exportCsv) {
      exportCsv.addEventListener('click', function () {
        window.api.attemptsExport('csv').then(function (res) {
          if (res && res.saved) toast('Saved ' + res.count + ' attempt(s) to ' + res.path);
          else if (res && res.error) toast('Could not save the export: ' + res.error);
        });
      });
    }

    var exportJson = document.getElementById('exportJson');
    if (exportJson) {
      exportJson.addEventListener('click', function () {
        window.api.attemptsExport('json').then(function (res) {
          if (res && res.saved) toast('Saved ' + res.count + ' attempt(s) to ' + res.path);
          else if (res && res.error) toast('Could not save the export: ' + res.error);
        });
      });
    }

    var add = document.getElementById('addCustom');
    if (add) {
      add.addEventListener('click', function () {
        var t = document.getElementById('cTest').value;
        var name = (document.getElementById('cName').value || '').trim() || 'My ' + t.toUpperCase() + ' set';
        var items = document
          .getElementById('cItems')
          .value.split(/\r?\n/)
          .map(function (x) { return x.trim(); })
          .filter(Boolean);
        if (!items.length) {
          toast('Add at least one item, one per line');
          return;
        }
        S.config.custom = S.config.custom || { tat: [], wat: [], srt: [] };
        S.config.custom[t] = S.config.custom[t] || [];
        S.config.custom[t].push({ id: 'custom-' + t + '-' + Date.now(), name: name, items: items });
        window.api.setConfig({ custom: S.config.custom });
        toast('Added "' + name + '" with ' + items.length + ' items');
        renderSettings();
      });
    }

    var od = document.getElementById('openDiag');
    if (od) od.addEventListener('click', function () { goto('diagnostics'); });

    var back = document.getElementById('back');
    if (back) back.addEventListener('click', function () { goto('home'); });
  }

  /* ---------------------------------------------------------- diagnostics */
  var DIAG_TIMER = null;
  var DIAG_INFO = null;

  function diagRow(k, v) {
    return '<div class="diag-row"><span>' + esc(k) + '</span><b>' + esc(v == null ? '' : String(v)) + '</b></div>';
  }

  function renderDiagnostics() {
    function paint(info, log) {
      var a = (info && info.app) || {};
      var p = (info && info.paths) || {};
      var d = (info && info.data) || {};
      var st = (info && info.store) || {};
      var phone = onPhone();
      var env = phone
        ? diagRow('Version', a.version) +
          diagRow('Build', 'Android app (APK)') +
          diagRow('WebView (Chromium)', a.chrome) +
          diagRow('Platform', a.arch || 'Android')
        : diagRow('Version', a.version) +
          diagRow('Packaged', a.packaged ? 'yes' : 'no (running from source)') +
          diagRow('Electron', a.electron) +
          diagRow('Chromium', a.chrome) +
          diagRow('Node', a.node) +
          diagRow('Platform', (a.platform || '') + ' ' + (a.arch || ''));
      var dataRows =
        diagRow('WAT sets', d.watSets) +
        diagRow('SRT sets', d.srtSets) +
        diagRow('TAT scene sets', d.tatSets) +
        diagRow('Lecturette topics', d.lectures) +
        diagRow('Museum pictures', d.museumPictures) +
        diagRow('Classic TAT plates', d.classicPictures) +
        diagRow('WAT model-sentence entries', d.watHints) +
        diagRow('Dictionary words in memory', d.dictionaryWords || '0 (loads on first library use)');
      var storeRows =
        diagRow('Saved attempts', st.attempts) +
        diagRow('Store size', st.bytes + ' bytes') +
        diagRow('Custom sets (WAT/SRT/TAT)', (st.customWat || 0) + ' / ' + (st.customSrt || 0) + ' / ' + (st.customTat || 0)) +
        diagRow('TAT picture source', st.tatSource) +
        diagRow('Online lookup', st.onlineEnabled ? 'on' : 'off') +
        // The phone builds its digest itself; Python is the desktop engine only.
        (phone
          ? ''
          : diagRow('Python', info && info.python && info.python.ok ? info.python.version : 'not found') +
            diagRow('Digest libraries', info && info.digestDeps && info.digestDeps.ok ? 'ready' : 'missing'));

      body(
        '<div class="dig-head"><div><h1>Diagnostics</h1>' +
          '<p class="lead">Everything needed to debug this build or hand it to another developer: environment, data, paths, the working flow and the live log. All local.</p></div>' +
          '<div class="dig-chips"><span class="chip ok">' + (phone ? 'Android app' : a.packaged ? 'packaged build' : 'source build') + '</span>' +
          '<span class="chip">' + (phone ? 'no log file' : 'log on disk') + '</span></div></div>' +
          '<div class="row" style="margin-bottom:16px">' +
          '<button class="btn primary sm" id="diagSave">' + (phone ? 'Copy report' : 'Save report…') + '</button>' +
          '<button class="btn sm" id="diagRefresh">Refresh</button>' +
          (phone ? '' : '<button class="btn sm" id="diagFolder">Open log folder</button>') +
          '<button class="btn sm ghost" id="diagBack">Back to settings</button></div>' +
          '<div class="diag-grid">' +
          '<div class="card"><h2>Environment</h2>' + env + '</div>' +
          '<div class="card"><h2>Bundled data</h2>' + dataRows + '</div>' +
          '<div class="card"><h2>Your store</h2>' + storeRows + '</div>' +
          '<div class="card diag-paths"><h2>Paths</h2>' +
            (phone
              ? diagRow('Your data', p.userData)
              : diagRow('User data', p.userData) + diagRow('Store file', p.store) +
                diagRow('Log file', p.log) + diagRow('Data folder', p.data) +
                diagRow('Digest engine', p.digest)) +
            '</div>' +
          '</div>' +
          '<h2>How the app works</h2>' +
          '<div class="card diag-flow">' +
          (phone
            ? '<ol>' +
              '<li><b>Boot.</b> The app loads the WAT/SRT/TAT packs, the ' + (d.classicPictures || 0) + ' classic plates, the lecturette topics and the WAT model sentences from inside the APK.</li>' +
              '<li><b>A test run.</b> TAT: view → writing clock. WAT: words advance on their own. SRT: one total clock. Answers go in your practice copy; the attempt is saved on the phone.</li>' +
              '<li><b>Word library.</b> The dictionary ships in the APK and loads on first use.</li>' +
              '<li><b>Lecturette.</b> A 30 s / 2 min / 30 s clock; with online lookup on, scripts are written from Wikipedia and the latest headlines.</li>' +
              '<li><b>News Digest.</b> Built on the phone from Google News; the last edition is saved, and an edition bundled in the APK opens with no connection.</li>' +
              '</ol>'
            : '<ol>' +
              '<li><b>Boot.</b> main.js opens the window, reads the store, and loads the WAT/SRT/TAT packs, the ' + (d.classicPictures || 0) + ' classic plates, the museum manifest, the lecturette topics and the WAT model sentences.</li>' +
              '<li><b>A test run.</b> TAT: 30 s view → 4 min writing clock, no typing. WAT: 60 words, auto-advance, no typing. SRT: one 30-minute clock with typed answers. On finish the attempt is written to the store.</li>' +
              '<li><b>Word library.</b> The 149k dictionary loads in the main process on first use; the page never touches the network (CSP connect-src none).</li>' +
              '<li><b>Lecturette.</b> Bundled topics with a 30 s / 2 min / 30 s clock and a facts panel.</li>' +
              '<li><b>News Digest.</b> A separate Python engine is copied to the user-data folder and driven over IPC; it keeps its own config, drafts and output.</li>' +
              '<li><b>Verification.</b> npm run smoke drives the real window through every feature and fails on any check; tools/verify-package.js compares the packaged app with the source.</li>' +
              '</ol>') +
          '</div>' +
          (phone
            ? ''
            : '<h2>Live log</h2>' +
              '<p class="small muted">Also written to the file above (rotates at 2 MB). Copy this when reporting a problem.</p>' +
              '<pre class="dig-log" id="diagLog" style="height:280px">' + esc((log && log.text) || 'No log yet.') + '</pre>')
      );

      var sv = document.getElementById('diagSave');
      if (sv) sv.addEventListener('click', function () {
        window.api.diagSave().then(function (r) {
          if (r && r.saved) toast('Report saved to ' + r.path);
          else if (r && r.error) toast('Could not save: ' + r.error);
        });
      });
      var rf = document.getElementById('diagRefresh');
      if (rf) rf.addEventListener('click', function () { renderDiagnostics(); });
      var of = document.getElementById('diagFolder');
      if (of) of.addEventListener('click', function () { window.api.logOpenFolder(); });
      var bk = document.getElementById('diagBack');
      if (bk) bk.addEventListener('click', function () { goto('settings'); });

      // Android device tests: exercise native HTTP, gallery save, and back button
      if (window.api && window.api.android) {
        var tests = document.createElement('div');
        tests.innerHTML =
          '<h2>Device tests (Android)</h2>' +
          '<p class="small muted">Exercise native paths on this device.</p>' +
          '<div class="row">' +
          '<button class="btn sm" id="devTestHttp">Test native HTTP</button>' +
          '<button class="btn sm" id="devTestGallery">Test gallery pick</button>' +
          '<button class="btn sm" id="devTestBack">Test back-button handler</button>' +
          '</div>' +
          '<pre class="dig-log" id="devTestLog" style="height:160px; margin-top:10px">Ready.</pre>';
        var logEl = document.querySelector('.wrap');
        if (logEl) {
          var insertAfter = document.querySelector('#diagLog');
          if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(tests, insertAfter.nextSibling);
          } else {
            logEl.appendChild(tests);
          }
        }
        var httpBtn = document.getElementById('devTestHttp');
        var galBtn = document.getElementById('devTestGallery');
        var backBtn = document.getElementById('devTestBack');
        var tlog = document.getElementById('devTestLog');
        function tlogw(s){ if(tlog){ tlog.textContent = String(s); tlog.scrollTop = tlog.scrollHeight; } }
        if (httpBtn) httpBtn.addEventListener('click', function(){
          tlogw('Testing native HTTP...');
          try {
            var net = window.SSB && window.SSB.net;
            var isNat = net && net.nativeHttp ? net.nativeHttp() : false;
            var status = 0;
            fetch('https://httpbin.org/get').then(function(r){ status = r.status; return r.json(); }).then(function(j){
              tlogw('nativeHttp: ' + isNat + '\nGET https://httpbin.org/get: ' + status + '\n' + JSON.stringify(j).slice(0,200));
            }).catch(function(e){ tlogw('nativeHttp: ' + isNat + '\nERR: ' + e); });
          } catch(e){ tlogw('ERR: ' + e); }
        });
        if (galBtn) galBtn.addEventListener('click', function(){
          tlogw('Testing gallery pick...');
          if (window.api && window.api.pickTatImages) {
            window.api.pickTatImages().then(function(res){
              tlogw('pickTatImages returned: ' + (Array.isArray(res)?res.length:typeof res) + ' items');
            }).catch(function(e){ tlogw('ERR: ' + e); });
          } else {
            tlogw('pickTatImages not available');
          }
        });
        if (backBtn) backBtn.addEventListener('click', function(){
          tlogw('Testing back-button handler...');
          try {
            var h = window.__ssbBack ? window.__ssbBack() : false;
            tlogw('window.__ssbBack() returned: ' + h + ' (true if handled by app, false to let Android handle)');
          } catch(e){ tlogw('ERR: ' + e); }
        });
      }

      var lg = document.getElementById('diagLog');
      if (lg) lg.scrollTop = lg.scrollHeight;
    }

    if (DIAG_INFO) {
      paint(DIAG_INFO, null);
    } else {
      body('<div class="scroll"><div class="wrap"><h1>Diagnostics</h1><p class="lead">Reading the environment and the log…</p></div></div>');
    }

    Promise.all([window.api.diagInfo(), window.api.logTail(300)]).then(function (res) {
      DIAG_INFO = res[0];
      if (S.view === 'diagnostics') paint(res[0], res[1]);
    });

    if (DIAG_TIMER) clearInterval(DIAG_TIMER);
    DIAG_TIMER = setInterval(function () {
      if (S.view !== 'diagnostics') {
        clearInterval(DIAG_TIMER);
        DIAG_TIMER = null;
        return;
      }
      window.api.logTail(300).then(function (log) {
        var el = document.getElementById('diagLog');
        if (el && log) el.textContent = log.text || '';
      });
    }, 3000);
  }

  /* ---------------------------------------------------------- news digest */
  // A second, separate tool lives inside this app: the news-digest Python
  // engine. It keeps its own folder, config and output and never shares state
  // with the SSB trainer. The old terminal spinner, monitor and rocket are
  // redrawn here as real animation while the engine streams its log.

  var DIGEST_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal'];

  var DG = {
    loaded: false,
    status: null,
    running: false,
    logs: [],
    date: 'today',
    war: '',
    pdfs: [],
    llm: 'auto',
    noWeb: false,
    openAfter: true,
    alsoText: false,
    files: [],
    lastDone: null,
    wired: false
  };

  var DIGEST_STAGES = [
    'Reading publisher feeds…',
    'Searching Google News…',
    'Reading newspaper PDFs…',
    'Clustering the same story…',
    'Writing the pages…',
    'Checking facts and full forms…',
    'Drawing the PDF…'
  ];

  function digestStage() {
    var n = (DG.logs || []).length;
    return DIGEST_STAGES[Math.min(DIGEST_STAGES.length - 1, Math.floor(n / 5))];
  }

  function wireDigestEvents() {
    if (DG.wired) return;
    DG.wired = true;
    window.api.onDigestLog(function (p) {
      if (!p) return;
      var text = String(p.text || '');
      if (!text) return;
      DG.logs.push(text);
      if (DG.logs.length > 400) DG.logs = DG.logs.slice(-400);
      var el = document.getElementById('digLog');
      if (el) {
        el.textContent += text;
        el.scrollTop = el.scrollHeight;
      }
      var st = document.getElementById('digStage');
      if (st) st.textContent = digestStage();
    });
    window.api.onDigestStarted(function () {
      DG.running = true;
      DG.logs = [];
      DG.lastDone = null;
      if (S.view === 'digest') renderDigest();
    });
    window.api.onDigestDone(function (p) {
      DG.running = false;
      DG.lastDone = p || { code: 0 };
      DG.loaded = false;
      if (S.view === 'digest') {
        renderDigest();
        var ok = p && p.code === 0;
        toast(ok ? 'Digest finished' : 'Digest stopped with code ' + (p && p.code));
      }
    });
  }

  function digestArgs() {
    var args = ['run', DG.date || 'today'];
    if (DG.noWeb) args.push('--no-web');
    if (DG.stateAsked) args.push('--state', DG.state || '');
    if (DG.war) args.push('--war', DG.war);
    if (DG.pdfs.length) args.push('--pdf', DG.pdfs.slice());
    if (DG.llm && DG.llm !== 'auto') args.push('--llm', DG.llm);
    if (DG.alsoText) args.push('--text');
    if (DG.openAfter) args.push('--open');
    args.push('--plain');
    return args;
  }

  function digestBytes(n) {
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  function digestWhen(ms) {
    try {
      return new Date(ms).toLocaleString();
    } catch (_) {
      return '';
    }
  }

  // The phone has no Python, so this builds the same twelve sections from the
  // free Google News feeds through the native HTTP layer, and keeps the last
  // edition. A Generate button that can never succeed is not offered again.
  function renderPdfShelf() {
    if (DG.viewing) {
      body('<div class="row"><button class="btn sm" id="pdfBack">← My news PDFs</button><button class="btn sm ghost" id="pdfShare">Share</button>' +
        '<button class="btn sm ghost" id="pdfOpen">Open in PDF app</button><button class="btn sm ghost" id="pdfSave">Save to phone</button>' +
        '<button class="btn sm" id="pdfOut" aria-label="Zoom out">−</button><button class="btn sm" id="pdfIn" aria-label="Zoom in">+</button></div>' +
        '<h1>' + esc(DG.viewing.replace(/_/g, ' ').replace('.pdf', '')) + '</h1><div class="small muted" id="pdfWait">Opening…</div><div class="pdf-scroll" id="pdfScroll"><div class="pdf-holder" id="pdfHolder"></div></div>');
      var zoom = 1;
      var zoomBox = document.getElementById('pdfHolder');
      var setZoom = function (z) {
        zoom = Math.max(1, Math.min(4, z));
        zoomBox.style.zoom = zoom;
      };
      document.getElementById('pdfIn').addEventListener('click', function () { setZoom(zoom + 0.5); });
      document.getElementById('pdfOut').addEventListener('click', function () { setZoom(zoom - 0.5); });
      var pinch = 0;
      var spread = function (e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); };
      var scroller = document.getElementById('pdfScroll');
      scroller.addEventListener('touchstart', function (e) { if (e.touches.length === 2) pinch = spread(e) / zoom; }, { passive: true });
      scroller.addEventListener('touchmove', function (e) {
        if (e.touches.length !== 2 || !pinch) return;
        e.preventDefault();
        setZoom(spread(e) / pinch);
      }, { passive: false });
      scroller.addEventListener('touchend', function () { pinch = 0; }, { passive: true });
      document.getElementById('pdfBack').addEventListener('click', function () { DG.viewing = null; renderDigest(); });
      var said = function (r, good) { toast(r && r.ok ? good + (r.where ? r.where : '') : 'Could not do that (' + ((r && r.detail) || 'unknown') + ').'); };
      document.getElementById('pdfShare').addEventListener('click', function () {
        window.api.digestShareSaved(DG.viewing).then(function (r) { if (!r.ok) said(r); });
      });
      document.getElementById('pdfOpen').addEventListener('click', function () {
        window.api.digestOpenSaved(DG.viewing).then(function (r) { if (!r.ok) said(r); });
      });
      document.getElementById('pdfSave').addEventListener('click', function () {
        window.api.digestSaveToPhone(DG.viewing).then(function (r) { said(r, 'Saved to the phone, in '); });
      });
      window.api.digestShowPdf(DG.viewing, document.getElementById('pdfHolder')).then(function (r) {
        var w = document.getElementById('pdfWait');
        if (w) w.textContent = r.ok ? '' : 'Could not open it (' + (r.detail || 'unknown') + ').';
      });
      return;
    }
    window.api.digestLibrary().then(function (list) {
      if (S.view !== 'digest' || !DG.shelf) return;
      body('<div class="row"><button class="btn sm" id="pdfBack">← News Digest</button></div><h1>My news PDFs</h1>' +
        (list.length ? list.map(function (x, i) {
          return '<div class="card lectcard"><div class="lechead"><div><div class="lectitle">' + esc(x.name.replace(/^Daily_News_Digest_|\.pdf$/g, '')) + '</div>' +
            '<div class="small muted">' + esc(String(x.pages)) + ' pages</div></div><button class="btn primary sm" data-openpdf="' + i + '">Open</button></div></div>';
        }).join('') : '<div class="empty">No PDFs yet. Make one on the News Digest screen and it is kept here.</div>'));
      document.getElementById('pdfBack').addEventListener('click', function () { DG.shelf = false; renderDigest(); });
      Array.prototype.forEach.call(appEl.querySelectorAll('[data-openpdf]'), function (b) {
        b.addEventListener('click', function () { DG.viewing = list[+b.getAttribute('data-openpdf')].name; renderDigest(); });
      });
    });
  }

  function renderPhoneDigest() {
    if (DG.viewing || DG.shelf) return renderPdfShelf();
    if (!DG.phoneBusy && !DG.phone) {
      DG.phoneBusy = true;
      // Refresh must skip the 20-minute cache, or it hands back the same saved copy.
      var force = !!DG.phoneForce;
      DG.phoneForce = false;
      Promise.resolve(window.api.digestOnPhone && window.api.digestOnPhone({ force: force, state: DG.state || '' }))
        .then(function (res) {
          DG.phoneBusy = false;
          DG.phone = res || { ok: false, error: 'network' };
          if (S.view === 'digest') renderDigest();
        }, function (err) {
          DG.phoneBusy = false;
          DG.phone = { ok: false, error: 'network', detail: err && err.message };
          if (S.view === 'digest') renderDigest();
        });
    }

    var head =
      '<h1>News Digest</h1>' +
      '<p class="lead">Current affairs for the board, collected here on the phone from free feeds the desktop engine ' +
      'also reads. No Python, no account, no key — and an edition always opens, even with no connection.</p>';
    var d = DG.phone;

    if (!d) {
      body(head + '<div class="empty">Collecting today\'s headlines…</div>');
      return;
    }

    if (!d.ok) {
      var why =
        d.error === 'offline'
          ? 'Online lookup is off and no edition is saved on this phone yet. Turn online lookup on in Settings to collect today\'s headlines.'
          : d.error === 'empty'
            ? 'The feeds had nothing just now. Try again in a minute.'
            : 'Could not reach the news feeds just now' + (d.detail ? ' (' + esc(d.detail) + ')' : '') + '.';
      body(
        head +
          '<div class="note">' + why + '</div>' +
          '<div class="row" style="margin-top:16px">' +
          '<button class="btn primary" id="digBuild">Try again</button>' +
          '<button class="btn ghost" id="digHome">Back to the dashboard</button></div>'
      );
      document.getElementById('digBuild').addEventListener('click', function () {
        DG.phone = null;
        renderDigest();
      });
      document.getElementById('digHome').addEventListener('click', function () { goto('home'); });
      return;
    }

    var when = d.reference
      ? 'Reference edition'
      : d.checkedOn
        ? 'Edition of ' + esc(d.checkedOn)
        : 'Latest edition';
    var count = (d.sections || []).reduce(function (n, s) { return n + (s.items || []).length; }, 0);
    var sections = (d.sections || [])
      .map(function (sec) {
        var items = (sec.items || [])
          .map(function (it) {
            var meta = [it.source, it.date].filter(Boolean).join(' · ');
            return (
              '<li' + (it.link ? ' class="dig-link" data-external="' + esc(it.link) + '"' : '') + '>' + esc(it.title) +
              (meta ? ' <span class="small muted">' + esc(meta) + '</span>' : '') + '</li>'
            );
          })
          .join('');
        return (
          '<section class="dig-sec">' +
          '<h3>' + esc(sec.label) + '</h3>' +
          (items ? '<ul class="dig-list">' + items + '</ul>' : '<p class="small muted">No items in this section just now.</p>') +
          '</section>'
        );
      })
      .join('');

    body(
      head +
        '<div class="row" style="align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span class="chip ok">' + when + '</span>' +
        '<span class="chip">' + count + ' stories</span>' +
        '<span class="chip">' + (d.reference ? 'bundled offline' : d.cached ? 'saved copy' : 'fresh') + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn primary sm" id="digBuild">' + (DG.phoneBusy ? 'Building…' : 'Refresh') + '</button>' +
        '<button class="btn sm" id="digPdf"' + (DG.pdfBusy ? ' disabled' : '') + '>' + (DG.pdfBusy ? 'Making PDF…' : 'Make the PDF') + '</button>' +
        '<button class="btn sm" id="digShelf">My news PDFs</button>' +
        '<label class="btn sm ghost">Add newspaper PDF<input id="digPaper" type="file" multiple accept="application/pdf" hidden /></label>' +
        ((DG.papers || []).length ? '<span class="chip">' + DG.papers.length + ' newspaper' + (DG.papers.length > 1 ? 's' : '') + '</span>' : '') +
        '<button class="btn ghost sm" id="digHome">Dashboard</button>' +
        '</div>' +
        '<div class="small muted" id="digPdfStatus" style="margin-top:8px">' + esc(DG.pdfStatus || '') + '</div>' +
        (d.reference
          ? '<div class="note">' + esc(d.note || 'Standing context bundled with the app.') +
            ' Turn online lookup on in Settings for today\'s headlines.</div>'
          : '') +
        '<div class="dig-grid">' + sections + '</div>' +
        '<div class="note" style="margin-top:14px">' +
        (d.reference
          ? 'This is the reference edition that ships with the app, so the tab always has an edition with no connection. ' +
            'It is standing background, not today\'s news.'
          : 'Built from ' + esc(d.source || 'Google News') + ' on this phone. The desktop app adds your own ' +
            'newspaper PDFs and lays the same sections out as a 12-page PDF.') +
        '</div>'
    );
    document.getElementById('digBuild').addEventListener('click', function () {
      DG.phone = null;
      DG.phoneForce = true;
      renderDigest();
    });
    document.getElementById('digHome').addEventListener('click', function () { goto('home'); });
    document.getElementById('digShelf').addEventListener('click', function () { DG.shelf = true; renderDigest(); });
    document.getElementById('digPaper').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!files.length) return;
      DG.pdfStatus = 'Reading ' + files.length + ' newspaper PDF(s)…';
      renderDigest();
      window.api.digestReadPapers(files, DG.papers || []).then(function (r) {
        if (r.ok) DG.papers = (DG.papers || []).concat(r.papers);
        DG.pdfStatus = r.ok
          ? r.papers.length + ' newspaper(s) added. ' + r.duplicates.length + ' duplicate(s) skipped. They go into the next PDF.'
          : 'Could not read that PDF (' + (r.detail || 'unknown') + ').';
        renderDigest();
      });
    });
    // The colour PDF the desktop engine makes, built here from the same free feeds.
    document.getElementById('digPdf').addEventListener('click', function () {
      if (DG.pdfBusy || !window.api.digestPdf) return;
      DG.pdfBusy = true;
      DG.pdfStatus = 'Reading today\'s news…';
      renderDigest();
      window.api.digestPdf(function (text, done, total) {
        DG.pdfStatus = text + (total ? ' (' + done + '/' + total + ')' : '');
        var el = document.getElementById('digPdfStatus');
        if (el) el.textContent = DG.pdfStatus;
      }, { state: DG.state || '', pdfs: DG.papers || [],
        ask: aiReady() ? function (prompt) { return aiAsk(prompt).then(function (r) { return r && r.ok ? r.text : ''; }); } : null
      }).then(function (res) {
        DG.pdfBusy = false;
        DG.pdfStatus = res && res.ok
          ? res.name + ' — ' + res.pages + ' pages from ' + res.headlines + ' headlines, saved to ' + res.where + '.' + (res.papers && res.papers.length ? ' ' + res.papers.join(' ') : '')
          : res && res.error === 'offline'
            ? 'Turn online lookup on in Settings to make the PDF — it reads today\'s news.'
            : 'Could not make the PDF' + (res && res.detail ? ' (' + res.detail + ')' : '') + '. Try again in a minute.';
        if (res && res.ok) {
          toast('PDF ready and kept in My news PDFs');
          DG.viewing = res.name;
        }
        if (S.view === 'digest') renderDigest();
      });
    });
  }

  // Asked once each time the tab opens; the last answer is offered first.
  function renderStateQuestion() {
    var last = (S.config && S.config.digestState) || '';
    body(
      '<h1>News Digest</h1>' +
      '<p class="lead">Which state\'s news do you want? It gets its own page after the war page, and a second page when there is more than one page can hold.</p>' +
      '<div class="card"><div class="field"><label for="digState">Your state</label><div class="ctl"><select id="digState" class="textinput">' +
      '<option value="">No state page</option>' + DIGEST_STATES.map(function (s) {
        return '<option' + (s === last ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('') + '</select></div></div>' +
      '<div class="row"><button class="btn primary" id="digStateGo">Continue</button></div></div>'
    );
    document.getElementById('digStateGo').addEventListener('click', function () {
      DG.state = document.getElementById('digState').value;
      DG.stateAsked = true;
      S.config.digestState = DG.state;
      window.api.setConfig({ digestState: DG.state });
      renderDigest();
    });
  }

  function renderDigest() {
    if (!DG.stateAsked && !window.__noStateGate) return renderStateQuestion();
    wireDigestEvents();
    var st = DG.status;
    if (!DG.loaded) {
      DG.loaded = true;
      window.api.digestStatus().then(function (s) {
        DG.status = s;
        DG.files = (s && s.files) || [];
        if (S.view === 'digest') renderDigest();
      });
    }

    // The Python engine cannot run inside the Android WebView. Say so plainly
    // instead of showing a form whose Generate button could only fail.
    if (!st) {
      body('<h1>News Digest</h1><div class="empty">Checking the digest engine…</div>');
      return;
    }
    if (st.unsupported) {
      renderPhoneDigest();
      return;
    }

    var pyOk = !!(st && st.python);
    var depsOk = !!(st && st.deps && st.deps.ok);
    var chips =
      '<span class="chip ' + (pyOk ? 'ok' : 'bad') + '">' +
      (pyOk ? 'Python ' + esc((st.pythonVersion || '').replace(/^Python\s*/i, '')) : 'Python not found') +
      '</span>' +
      '<span class="chip ' + (depsOk ? 'ok' : 'bad') + '">' +
      (depsOk ? 'engine ready' : 'engine needs libraries') +
      '</span>' +
      '<span class="chip">separate folder</span>';

    var engineNote = '';
    if (!pyOk) {
      engineNote =
        '<div class="note warn"><b>Python is not on PATH.</b> The digest engine is a separate Python tool. ' +
        'Install Python 3.9+ from python.org, tick “Add python.exe to PATH”, then run ' +
        '<code>python -m pip install -r requirements.txt</code> inside the engine folder ' +
        '(<code>' + esc((st && st.engineDir) || '') + '</code>) and reopen this tab.</div>';
    } else if (!depsOk) {
      engineNote =
        '<div class="note warn"><b>One engine library is missing.</b> ' + esc((st.deps && st.deps.missing) || '') +
        '<br>Open a terminal in <code>' + esc(st.engineDir || '') + '</code> and run ' +
        '<code>python -m pip install -r requirements.txt</code>.</div>';
    }

    var files = (DG.files || [])
      .map(function (f) {
        var pdf = /\.pdf$/i.test(f.name);
        return (
          '<div class="dig-file">' +
          '<span class="dig-fileicon">' + (pdf ? 'PDF' : 'TXT') + '</span>' +
          '<span class="dig-filename">' + esc(f.name) + '</span>' +
          '<span class="small muted">' + digestBytes(f.bytes) + ' · ' + esc(digestWhen(f.mtime)) + '</span>' +
          '<button class="btn sm' + (pdf ? ' primary' : '') + '" data-digopen="' + esc(f.name) + '">' +
          (pdf ? 'Open PDF' : 'Open text') +
          '</button></div>'
        );
      })
      .join('');

    var pdfChips = DG.pdfs.length
      ? DG.pdfs.map(function (p, i) {
          return '<span class="chip">' + esc(p.split(/[\\/]/).pop()) +
            ' <button class="chipx" data-digrmpdf="' + i + '" title="Remove">×</button></span>';
        }).join('')
      : '<span class="small muted">None attached — inbox PDFs are read automatically.</span>';

    var running = DG.running;
    var logText = DG.logs.join('');
    var doneOk = DG.lastDone && DG.lastDone.code === 0;

    body(
      '<div class="dig-head"><div>' +
        '<h1>News Digest</h1>' +
        '<p class="lead">A 12-page current-affairs PDF — National, International, Regional, Defence, Politics, ' +
        'Financial, Economic, Neighbouring, Science, Geopolitical, Miscellaneous and War. Free feeds, no account, ' +
        'no key. This is the separate digest engine: it has its own folder and never touches your SSB data.</p>' +
        '</div><div class="dig-chips">' + chips + '</div></div>' +
        engineNote +
        '<div class="dig-grid">' +
          '<div class="card dig-form">' +
            '<h2>Build a digest</h2>' +
            '<div class="field"><label>Date</label>' +
            '<div class="ctl"><input id="digDate" value="' + esc(DG.date) + '" placeholder="today | yesterday | 2026-10-18" />' +
            '<button class="btn sm" data-digdate="today">Today</button>' +
            '<button class="btn sm" data-digdate="yesterday">Yesterday</button></div></div>' +
            '<div class="field"><label>War section topic<br><span class="small muted">Leave blank to rotate automatically</span></label>' +
            '<div class="ctl"><input id="digWar" value="' + esc(DG.war) + '" placeholder="e.g. Sudan" /></div></div>' +
            '<div class="field"><label>Newspaper PDFs<br><span class="small muted">Optional. The engine also reads every PDF in its inbox folder.</span></label>' +
            '<div class="ctl"><button class="btn sm" id="digPick">Add PDFs…</button></div>' +
            '<div class="dig-pdfs">' + pdfChips + '</div></div>' +
            '<div class="dig-toggles">' +
              '<button class="toggle' + (DG.noWeb ? '' : ' on') + '" id="digWeb" title="Internet"></button>' +
              '<span>Use the internet (free feeds)</span></div>' +
            '<div class="dig-toggles">' +
              '<button class="toggle' + (DG.openAfter ? ' on' : '') + '" id="digOpen"></button>' +
              '<span>Open the PDF when done</span></div>' +
            '<div class="dig-toggles">' +
              '<button class="toggle' + (DG.alsoText ? ' on' : '') + '" id="digText"></button>' +
              '<span>Also save a bullet-point .txt</span></div>' +
            '<div class="field"><label>Rewrite with a free local model<br><span class="small muted">Ollama at localhost:11434, if it is running</span></label>' +
            '<div class="ctl"><select id="digLlm">' +
              ['auto', 'on', 'off'].map(function (v) {
                return '<option value="' + v + '"' + (DG.llm === v ? ' selected' : '') + '>' + v + '</option>';
              }).join('') +
            '</select></div></div>' +
            '<div class="row" style="margin-top:16px">' +
              '<button class="btn primary" id="digRun"' + (running ? ' disabled' : '') + '>' +
              (running ? 'Building…' : 'Generate digest') + '</button>' +
              '<button class="btn danger" id="digStop"' + (running ? '' : ' hidden') + '>Stop</button>' +
            '</div>' +
          '</div>' +
          '<div class="card dig-monitor' + (running ? ' live' : '') + (doneOk && !running ? ' done' : '') + '">' +
            '<div class="dig-anim" id="digAnim">' +
              '<div class="dig-radar"><i></i><b></b></div>' +
              '<div class="dig-bars">' +
                '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>' +
              '</div>' +
              '<div class="dig-rocket" id="digRocket">🚀</div>' +
            '</div>' +
            '<div class="dig-stage" id="digStage">' +
              (running ? digestStage() : doneOk ? 'Finished' : 'Waiting for a run') +
            '</div>' +
            '<div class="dig-progress"><i></i></div>' +
            '<pre class="dig-log" id="digLog">' + esc(logText) + '</pre>' +
          '</div>' +
        '</div>' +
        '<h2>Saved digests</h2>' +
        '<div class="card dig-files">' +
          (files || '<div class="empty">No digests yet. Build one above — the PDF lands in the engine\u2019s output folder.</div>') +
        '</div>' +
        '<details class="card dig-adv"><summary>Advanced commands — every CLI option, in GUI form</summary>' +
          '<p class="small muted">The same commands as the terminal tool. Type arguments after the command; quoted text is kept together.</p>' +
          '<div class="field"><label>Command</label><div class="ctl">' +
          '<select id="digCmd">' +
          ['collect', 'build', 'text', 'show', 'check', 'files', 'history', 'glossary', 'words', 'facts', 'war', 'feeds', 'section', 'config', 'edit', 'correct'].map(function (c) {
            return '<option value="' + c + '">' + c + '</option>';
          }).join('') +
          '</select></div></div>' +
          '<div class="field"><label>Arguments</label><div class="ctl">' +
          '<input id="digArgs" placeholder=\"today --open   |   glossary list   |   show today 4\" /></div></div>' +
          '<button class="btn sm" id="digAdvRun">Run command</button>' +
        '</details>' +
        '<details class="card dig-settings"><summary>Engine settings</summary>' +
          '<div class="field"><label>Title on the PDF</label><div class="ctl"><input id="digTitle" value="' +
          esc((st && st.config && st.config.title) || 'Daily News Digest') + '" /></div></div>' +
          '<div class="field"><label>Days of news to include</label><div class="ctl"><input id="digDays" type="number" min="1" max="7" value="' +
          esc((st && st.config && st.config.days_back) || 1) + '" /></div></div>' +
          '<div class="field"><label>Articles per section</label><div class="ctl"><input id="digPer" type="number" min="1" max="8" value="' +
          esc((st && st.config && st.config.web && st.config.web.articles_per_section) || 3) + '" /></div></div>' +
          '<div class="field"><label>Local model name</label><div class="ctl"><input id="digModel" value="' +
          esc((st && st.config && st.config.llm && st.config.llm.model) || 'llama3.2') + '" /></div></div>' +
          '<button class="btn sm primary" id="digSaveCfg">Save engine settings</button>' +
          '<div class="small muted" style="margin-top:10px">Stored in the digest engine\u2019s own config.json, not in the SSB settings.</div>' +
        '</details>'
    );

    if (running) {
      var logEl = document.getElementById('digLog');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }

    var dateEl = document.getElementById('digDate');
    if (dateEl) dateEl.addEventListener('change', function () { DG.date = dateEl.value.trim() || 'today'; });
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-digdate]'), function (b) {
      b.addEventListener('click', function () {
        DG.date = b.getAttribute('data-digdate');
        if (dateEl) dateEl.value = DG.date;
      });
    });
    var warEl = document.getElementById('digWar');
    if (warEl) warEl.addEventListener('input', function () { DG.war = warEl.value.trim(); });
    var llmEl = document.getElementById('digLlm');
    if (llmEl) llmEl.addEventListener('change', function () { DG.llm = llmEl.value; });

    function flip(id, key) {
      var t = document.getElementById(id);
      if (!t) return;
      t.addEventListener('click', function () {
        DG[key] = !DG[key];
        t.classList.toggle('on', DG[key]);
      });
    }
    var webT = document.getElementById('digWeb');
    if (webT) {
      webT.addEventListener('click', function () {
        DG.noWeb = !DG.noWeb;
        webT.classList.toggle('on', !DG.noWeb);
      });
    }
    flip('digOpen', 'openAfter');
    flip('digText', 'alsoText');

    var pick = document.getElementById('digPick');
    if (pick) {
      pick.addEventListener('click', function () {
        window.api.digestPickPdfs().then(function (list) {
          DG.pdfs = (list || []).slice();
          renderDigest();
        });
      });
    }
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-digrmpdf]'), function (b) {
      b.addEventListener('click', function () {
        DG.pdfs.splice(parseInt(b.getAttribute('data-digrmpdf'), 10), 1);
        renderDigest();
      });
    });

    var run = document.getElementById('digRun');
    if (run) {
      run.addEventListener('click', function () {
        if (!depsOk) {
          toast('The digest engine is not ready — see the note above.');
          return;
        }
        DG.running = true;
        DG.logs = [];
        renderDigest();
        window.api.digestRun({ args: digestArgs() }).then(function (res) {
          if (!res || !res.ok) {
            DG.running = false;
            renderDigest();
            toast(
              res && res.error === 'busy'
                ? 'A digest is already running'
                : res && res.error === 'no-python'
                  ? 'Python is not installed'
                  : 'Could not start the digest engine'
            );
          }
        });
      });
    }
    var stop = document.getElementById('digStop');
    if (stop) {
      stop.addEventListener('click', function () {
        window.api.digestCancel();
        toast('Stopping the digest…');
      });
    }

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-digopen]'), function (b) {
      b.addEventListener('click', function () {
        window.api.digestOpen(b.getAttribute('data-digopen')).then(function (r) {
          if (!r || !r.ok) toast('Could not open that file');
        });
      });
    });

    var adv = document.getElementById('digAdvRun');
    if (adv) {
      adv.addEventListener('click', function () {
        var cmd = document.getElementById('digCmd').value;
        var raw = document.getElementById('digArgs').value || '';
        var parts = raw.match(/("[^"]*"|'[^']*'|\S+)/g) || [];
        var args = [cmd].concat(
          parts.map(function (p) {
            return p.replace(/^["']|["']$/g, '');
          })
        ).concat(['--plain']);
        DG.running = true;
        DG.logs = [];
        renderDigest();
        window.api.digestRun({ args: args }).then(function (res) {
          if (!res || !res.ok) {
            DG.running = false;
            renderDigest();
            toast('Could not run that command');
          }
        });
      });
    }

    var saveCfg = document.getElementById('digSaveCfg');
    if (saveCfg) {
      saveCfg.addEventListener('click', function () {
        var title = document.getElementById('digTitle').value.trim();
        var days = parseInt(document.getElementById('digDays').value, 10) || 1;
        var per = parseInt(document.getElementById('digPer').value, 10) || 3;
        var model = document.getElementById('digModel').value.trim() || 'llama3.2';
        var patch = {
          title: title,
          days_back: Math.max(1, Math.min(7, days)),
          web: { articles_per_section: Math.max(1, Math.min(8, per)) },
          llm: { model: model }
        };
        window.api.digestConfigSet(patch).then(function () {
          toast('Digest engine settings saved');
          DG.loaded = false;
          renderDigest();
        });
      });
    }
  }

  setTimeout(sweepTopicNews, 15000);
  setInterval(sweepTopicNews, 3600 * 1000);

  // 1.0.10 is newer than 1.0.9: numbers, compared part by part, not as text.
  function versionIsNewer(latest, current) {
    var a = String(latest).replace(/^v/i, '').split('.').map(Number);
    var b = String(current).replace(/^v/i, '').split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }

  function updateBanner() {
    var u = S.update;
    if (!u || !u.ok || !u.url || !versionIsNewer(u.latest, u.current) || S.updateHidden === u.latest) return '';
    return '<div class="note update-note"><b>Update available: ' + esc(u.latest) + '</b> You have ' + esc(u.current) + '. Your saved data stays. ' +
      '<button class="btn primary sm" data-external="' + esc(u.url) + '">Download</button> ' +
      '<button class="btn ghost sm" id="updateLater">Later</button></div>';
  }

  function checkUpdate() {
    if (!window.api.updateCheck) return Promise.resolve(null);
    return window.api.updateCheck().then(function (u) {
      S.update = u;
      if (S.view === 'home' && updateBanner() && !document.querySelector('.update-note')) render();
      return u;
    }, function () { return null; });
  }

  setTimeout(function () { if (!window.__noStateGate) checkUpdate(); }, 6000);

  /* ---------------------------------------------------------------- boot */

  window.__smoke = {
    summary: function () {
      return {
        view: S.view,
        wat: allSets('wat').length,
        srt: allSets('srt').length,
        tat: allSets('tat').length,
        homeTiles: document.querySelectorAll('[data-start]').length,
        attempts: S.attempts.length
      };
    },
    goto: function (v) {
      // Smoke-test navigation: never trip the "attempt still running" confirmation.
      S.session = null;
      S.refs = null;
      stopTick();
      window.api.keepAwake(false);
      S.view = v;
      render();
      return S.view;
    },
    startWAT: function (i) { start('wat', i || 0); return true; },
    startSRT: function (i) { start('srt', i || 0); return true; },
    startTAT: function (i) { start('tat', i || 0); return true; },
    session: function () {
      var s = S.session;
      if (!s) return null;
      var it = s.items[s.index] || {};
      return {
        test: s.test,
        index: s.index,
        phase: s.phase,
        total: s.items.length,
        prompt: it.prompt,
        remaining: Math.round(s.remaining),
        paused: s.paused
      };
    },
    type: function (text) {
      var el = document.querySelector('textarea.answer');
      if (!el) return false;
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    // The WAT screen has no answer box by design; these probes assert that.
    watScreen: function () {
      var s = S.session;
      var clockEl = document.getElementById('clock');
      var wordEl = document.getElementById('word');
      var meanEl = document.getElementById('meaning');
      return {
        test: s ? s.test : null,
        textareas: document.querySelectorAll('textarea.answer').length,
        clearBtn: !!document.getElementById('clearBtn'),
        word: wordEl ? wordEl.textContent : '',
        meaning: meanEl ? meanEl.textContent : '',
        clock: clockEl ? clockEl.textContent : '',
        clockFontPx: clockEl ? parseFloat(getComputedStyle(clockEl).fontSize) : 0,
        hasNext: !!document.getElementById('nextBtn')
      };
    },
    hintsInfo: function () {
      return { words: Object.keys(S.hints || {}).length };
    },
    digestStatusInfo: function () {
      return window.api.digestStatus();
    },
    diagUi: function () {
      var log = document.getElementById('diagLog');
      return {
        view: S.view,
        saveBtn: !!document.getElementById('diagSave'),
        backBtn: !!document.getElementById('diagBack'),
        rows: document.querySelectorAll('.diag-row').length,
        flowSteps: document.querySelectorAll('.diag-flow li').length,
        log: log ? log.textContent : ''
      };
    },
    diagInfo: function () {
      return window.api.diagInfo();
    },
    logAppend: function (scope, msg) {
      return window.api.logAppend(scope, msg);
    },
    logTail: function (n) {
      return window.api.logTail(n);
    },
    tatScreen: function () {
      var s = S.session;
      return {
        textareas: document.querySelectorAll('textarea.answer').length,
        classic: (S.tatClassic || []).length,
        source: S.config.tatSource || 'classic',
        copyNote: !!document.querySelector('.tat-copy'),
        img: (function () {
          var el = document.querySelector('.slide-img');
          if (!el) return null;
          var r = el.getBoundingClientRect();
          return {
            src: el.getAttribute('src'),
            complete: !!el.complete,
            w: el.naturalWidth,
            h: el.naturalHeight,
            shown: { w: Math.round(r.width), h: Math.round(r.height) }
          };
        })()
      };
    },
    themeProbe: function () {
      var root = getComputedStyle(document.documentElement);
      var card = document.querySelector('.card');
      var body = getComputedStyle(document.body);
      var bg = root.getPropertyValue('--bg').trim();
      var text = root.getPropertyValue('--text').trim();
      return {
        name: document.documentElement.getAttribute('data-theme') || 'alpine',
        accent: root.getPropertyValue('--accent').trim(),
        bg: bg,
        text: text,
        bodyColor: body.color,
        cardBg: card ? getComputedStyle(card).backgroundColor : null,
        contrast: Math.round(contrastRatio(text, bg) * 100) / 100
      };
    },
    digestUi: function () {
      return {
        runBtn: !!document.getElementById('digRun'),
        dateInput: !!document.getElementById('digDate'),
        monitor: !!document.querySelector('.dig-monitor'),
        radar: !!document.querySelector('.dig-radar'),
        // The section is reachable from the dashboard, not from a top menu.
        tile: TILES.some(function (t) { return t.id === 'digest'; })
      };
    },
    digestExec: function (args) {
      return new Promise(function (resolve) {
        var log = '';
        var settled = false;
        var offLog = window.api.onDigestLog(function (p) {
          log += (p && p.text) || '';
        });
        var offDone = window.api.onDigestDone(function (p) {
          if (settled) return;
          settled = true;
          offLog();
          offDone();
          resolve({ code: p && p.code, log: log });
        });
        window.api.digestRun({ args: args });
        setTimeout(function () {
          if (settled) return;
          settled = true;
          offLog();
          offDone();
          resolve({ code: null, timeout: true, log: log });
        }, 20000);
      });
    },
    modelSentenceInfo: function () {
      var tags = Array.prototype.map.call(document.querySelectorAll('.model-tag'), function (t) {
        return t.textContent;
      });
      return {
        words: document.querySelectorAll('.model-word').length,
        rows: document.querySelectorAll('.model-row').length,
        tags: tags,
        text: document.body.innerText
      };
    },
    next: function () {
      var b = document.getElementById('nextBtn');
      if (b) { b.click(); return true; }
      return false;
    },
    skipPhase: function () {
      var s = S.session;
      if (!s) return false;
      if (s.test === 'tat' && s.phase === 'view') { toWritePhase(); return true; }
      return false;
    },
    end: function () {
      var b = document.querySelector('[data-end]');
      if (b) { b.click(); return true; }
      return false;
    },
    domText: function () { return document.body.innerText.slice(0, 3000); },
    setConfig: function (patch) {
      Object.assign(S.config, patch || {});
      return window.api.setConfig(patch || {});
    },
    // Switch palette the way the Settings buttons do, so the smoke can prove
    // both themes and the round trip back to the shipped one.
    setTheme: function (name) {
      setTheme(name === 'alpine' ? 'alpine' : 'mist');
      return document.documentElement.getAttribute('data-theme');
    },
    // The two real buttons on Settings → Appearance, and which one is marked
    // as the active palette.
    settingsThemeUi: function () {
      var mist = document.getElementById('themeMist');
      var alpine = document.getElementById('themeAlpine');
      function marked(el) {
        return !!el && /\bprimary\b/.test(el.className);
      }
      return {
        mist: !!mist,
        alpine: !!alpine,
        selected: marked(mist) ? 'mist' : marked(alpine) ? 'alpine' : null
      };
    },
    clickTheme: function (name) {
      var b = document.getElementById(name === 'alpine' ? 'themeAlpine' : 'themeMist');
      if (!b) return false;
      b.click();
      return true;
    },
    layout: function () {
      function rect(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom)
        };
      }
      var a = document.getElementById('app');
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        appScrollH: a.scrollHeight,
        appClientH: a.clientHeight,
        overflowing: a.scrollHeight > a.clientHeight + 2,
        bar: rect('.runbar'),
        body: rect('.runbody'),
        stage: rect('.wordbox, .slidebox, .situation'),
        input: rect('textarea.answer'),
        foot: rect('.footbar')
      };
    },

    /* --- lecturette and the picture library --- */

    lectureInfo: function () {
      return {
        topics: lectTopics().length,
        boards: lectBoards().length,
        phases: LECT_PHASES.map(function (p) { return p.id + ':' + p.secs; })
      };
    },
    lectureStart: function (i) {
      var t = lectTopics()[i || 0];
      if (!t) return null;
      startLecture(t, null);
      return lectState().mode;
    },
    lecturePhase: function () {
      var R = lectState().run;
      return R
        ? { phase: LECT_PHASES[R.phase].id, remaining: R.remaining, paused: R.paused, topic: R.topic.topic }
        : null;
    },
    lectureClock: function () {
      var el = document.getElementById('lectClock');
      return el ? el.textContent : '';
    },
    lectureBodyText: function () {
      var el = document.getElementById('lectBody');
      return el ? el.innerText.slice(0, 2500) : '';
    },
    lectureFactsText: function () {
      var el = document.querySelector('.lect-side');
      return el ? el.innerText.slice(0, 2500) : '';
    },
    lectureHasInput: function () {
      return document.querySelectorAll('#lectBody textarea, #lectBody input').length;
    },
    lectureNext: function () {
      lectureNextPhase();
      var R = lectState().run;
      return R ? LECT_PHASES[R.phase].id : 'done';
    },
    lecturePause: function () { return lecturePause(); },
    lectureFinish: function () {
      finishLecture('manual');
      return lectState().mode;
    },
    lectureSummary: function () { return lectState().summary; },
    lectureListCount: function () { return document.querySelectorAll('[data-lectstart]').length; },
    lectureStats: function () {
      var topics = lectTopics();
      var counts = { curated: 0, draft: 0, outline: 0 };
      topics.forEach(function (t) {
        if (t.source === 'curated') counts.curated++;
        else if (t.source === 'draft') counts.draft++;
        else counts.outline++;
      });
      return {
        topics: topics.length,
        categories: lectCats().length,
        boards: lectBoards().length,
        counts: counts,
        searchField: !!document.getElementById('lectSearch'),
        categoryField: !!document.getElementById('lectCat')
      };
    },
    lectureSearch: function (text) {
      lectState().q = String(text || '');
      render();
      return lectFiltered().length;
    },
    lectureCategoryCount: function (name) {
      lectState().cat = name || 'all';
      render();
      return lectFiltered().length;
    },
    lectureFind: function (text) {
      var needle = String(text || '').toLowerCase();
      var topics = lectTopics();
      for (var i = 0; i < topics.length; i++) {
        if (String(topics[i].topic || '').toLowerCase().indexOf(needle) >= 0) return topics[i];
      }
      return null;
    },
    lectureStartByTopic: function (text) {
      var t = window.__smoke.lectureFind(text);
      if (!t) return null;
      startLecture(t, null);
      return { id: t.id, source: t.source };
    },
    lectureScriptText: function () {
      var el = document.querySelector('.lectessay');
      return el ? el.innerText.slice(0, 4000) : '';
    },
    lectureLive: function () {
      var L = lectState();
      var el = document.getElementById('lectLiveCard');
      return {
        busy: !!(L.live && L.live.busy),
        rendered: !!el,
        text: el ? el.innerText.slice(0, 2500) : '',
        points: el ? el.querySelectorAll('.newsgroup li, .livepoints li').length : 0,
        res: L.live && L.live.res ? { ok: !!L.live.res.ok, error: L.live.res.error || '', cached: !!L.live.res.cached, offline: !!L.live.res.offline, count: (L.live.res.points || []).length, checkedOn: L.live.res.checkedOn || '' } : null
      };
    },
    lectureLiveRefresh: function () { loadLive(true); return true; },
    lectLayout: function () {
      var a = document.getElementById('app');
      var grid = document.querySelector('.lect-grid');
      var dock = document.querySelector('.lectlivedock');
      return {
        scale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        overflow: a ? a.scrollHeight > a.clientHeight + 2 : false,
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
        dockH: dock ? Math.round(dock.getBoundingClientRect().height) : 0
      };
    },
    lectureToggleFacts: function (i) {
      var t = lectTopics()[i || 0];
      if (!t) return false;
      var L = lectState();
      L.open[t.id] = !L.open[t.id];
      render();
      return !!L.open[t.id];
    },
    lectureOpenFactsText: function () {
      var el = document.querySelector('.lectcard .lectfacts');
      return el ? el.innerText.slice(0, 2000) : '';
    },
    tatLibraryCount: function () { return (S.tatLibrary || []).length; },
    tatClassicCount: function () { return (S.tatClassic || []).length; },
    tatPickSets: function (times) {
      var out = [];
      for (var i = 0; i < (times || 3); i++) {
        out.push(
          pickTatPictures(11).map(function (p) {
            return p.id;
          })
        );
      }
      return out;
    },

    /* --- word library --- */

    libraryInfo: function () {
      return window.api.dictInfo();
    },
    // The Action-verbs tab loads its own list, not a word page, so it needs
    // its own probe rather than waiting for L.items to fill.
    libraryConnectors: function () {
      var b = document.querySelector('[data-libt="connectors"]');
      if (!b) return Promise.resolve(null);
      b.click();
      return new Promise(function (resolve) {
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          var L = libState();
          if (L.connectors || tries > 100) {
            clearInterval(iv);
            var C = L.connectors || { groups: [] };
            resolve({
              groups: C.groups.length,
              labels: C.groups.map(function (g) { return g.label; }),
              counts: C.groups.map(function (g) { return (g.items || []).length; }),
              rows: document.querySelectorAll('.conn-group [data-meaning]').length
            });
          }
        }, 100);
      });
    },
    librarySearch: function (q) {
      var L = libState();
      L.tab = 'all';
      L.query = String(q || '');
      L.open = {};
      L.started = true;
      return new Promise(function (resolve) {
        window.api.dictSearch({ query: L.query, offset: 0, limit: L.limit }).then(function (res) {
          L.items = (res && res.items) || [];
          L.hasMore = !!(res && res.hasMore);
          L.offset = L.items.length;
          paintList();
          resolve({ count: L.items.length, hasMore: L.hasMore, first: L.items.slice(0, 3).map(function (i) { return i.word; }) });
        });
      });
    },
    libraryTab: function (tab) {
      var L = libState();
      L.tab = tab;
      L.open = {};
      return new Promise(function (resolve) {
        var req =
          tab === 'positive' || tab === 'negative'
            ? window.api.dictSentiment({ type: tab, offset: 0, limit: 5 })
            : window.api.dictSearch({ query: '', offset: 0, limit: 5 });
        req.then(function (res) {
          L.items = (res && res.items) || [];
          L.offset = L.items.length;
          L.hasMore = false;
          paintList();
          resolve({
            tab: tab,
            total: res && res.total,
            sample: L.items.slice(0, 3).map(function (i) { return { word: i.word, s: i.sentiment }; })
          });
        });
      });
    },
    libraryMeaning: function (word) {
      var L = libState();
      L.open = {};
      return new Promise(function (resolve) {
        window.api.dictGet(word).then(function (res) {
          if (res && res.ok && res.entry.senses && res.entry.senses.length) {
            L.open[word] = res.entry.senses;
          } else {
            L.open[word] = 'none';
          }
          paintList();
          var el = document.querySelector('.wordrow.open .defs');
          resolve({ word: word, ok: !!(res && res.ok), text: el ? el.innerText.replace(/\s+/g, ' ').slice(0, 240) : '' });
        });
      });
    },
    libraryMeaningButtons: function () {
      return document.querySelectorAll('[data-meaning]').length;
    },
    libraryLayout: function () {
      function rect(el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      }
      var a = document.getElementById('app');
      var rows = document.querySelectorAll('.wordrow');
      var first = rows[0] || null;
      var btn = first ? first.querySelector('[data-meaning]') : null;
      var rects = [];
      Array.prototype.forEach.call(rows, function (r) {
        rects.push(rect(r));
      });
      var overlapping = 0;
      for (var i = 1; i < rects.length; i++) {
        if (rects[i].top < rects[i - 1].bottom - 1) overlapping++;
      }
      var rb = rect(btn);
      var rf = rect(first);
      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        appScrollH: a.scrollHeight,
        appClientH: a.clientHeight,
        overflowing: a.scrollHeight > a.clientHeight + 2,
        rowCount: rows.length,
        tabs: document.querySelectorAll('[data-libt]').length,
        searchBox: rect(document.getElementById('libQ')),
        firstRow: rf,
        meaningButton: rb,
        buttonInsideRow: !!(rf && rb) && rb.top >= rf.top - 1 && rb.bottom <= rf.bottom + 1,
        overlappingRows: overlapping,
        firstName: first ? first.querySelector('.w').textContent : ''
      };
    },
    libraryOpenRows: function () {
      return document.querySelectorAll('.wordrow.open').length;
    },
    librarySetOnline: function (on) {
      Object.assign(S.config, { onlineEnabled: !!on });
      var L = libState();
      L.online = { enabled: !!on };
      return window.api.setConfig({ onlineEnabled: !!on }).then(function (cfg) {
        if (S.view === 'library') renderLibrary();
        return cfg;
      });
    },
    libraryPanel: function () {
      return {
        onlineToggle: !!document.getElementById('libOnline'),
        themeInput: !!document.getElementById('libTheme'),
        fetchBtn: !!document.getElementById('libFetch'),
        saveBtn: !!document.getElementById('libSaveSet'),
        externalLinks: document.querySelectorAll('[data-external]').length
      };
    },
    libraryOnlineFetch: function (theme) {
      return window.api.onlineWords({ theme: theme || 'duty', count: 60 });
    },
    libraryOnlineMeaning: function (word) {
      return window.api.onlineMeaning(word);
    },

    /* --- coverage probes: the parts the run above never touches --- */

    importSheet: function (b64, name) {
      var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      var keep = JSON.stringify(S.config.custom || {});
      return importFile(new File([bytes], name)).then(function () {
        var got = (S.config.custom.srt || []).filter(function (s) { return String(s.id).indexOf('excel-') === 0; })[0];
        S.config.custom = JSON.parse(keep);
        return window.api.setConfig({ custom: S.config.custom }).then(function () { return { items: got ? got.items : [] }; });
      });
    },
    importLectureDupes: function () {
      var keep = S.config.lectOwn || [];
      var known = (S.lecturesBase || [])[0];
      var rows = [[known ? known.topic : 'x', ''], ['Fresh Zebra-Crossing Rules', 'Testing'], ['fresh zebra crossing rule (ZCR)', ''], ['E-Commerce Quokka Laws', ''], ['Ecommerce quokka law in India', ''], ['Quokka Defense Budget Debate', ''], ['Quokka Defence Budget Debate Today', '']];
      return importRows('lect', rows).then(function () {
        var added = (S.config.lectOwn || []).length - keep.length;
        S.config.lectOwn = keep;
        return window.api.setConfig({ lectOwn: keep }).then(function () {
          S.lectures = lectWithWritten(S.lecturesBase || []);
          return { added: added, skipped: rows.length - added };
        });
      });
    },
    updateLogic: function () {
      var was = S.update;
      S.update = { ok: true, current: '1.0.9', latest: 'v1.0.10', url: 'https://example.com/x' };
      var shown = /Update available: v1.0.10/.test(updateBanner());
      S.update = { ok: true, current: '1.0.17', latest: 'v1.0.17', url: 'https://example.com/x' };
      var same = updateBanner() === '';
      S.update = was;
      return { shown: shown, same: same, older: !versionIsNewer('1.0.9', '1.0.10'), newer: versionIsNewer('v1.1.0', '1.0.99') };
    },
    newScreens: function () {
      window.__noStateGate = false;
      DG.stateAsked = false;
      goto('digest');
      var stateBox = !!document.getElementById('digState');
      window.__noStateGate = true;
      S.timeline = [{ id: 'x', section: 'Economic', title: 'T', events: [{ date: '2026-10-29', headline: 'Container scheme <b>', sources: ['PIB'] }, { date: '2026-10-31', headline: 'Container follow-up' }] }];
      goto('timeline');
      var timeline = !!appEl.querySelector('.tl-thread') && appEl.textContent.indexOf('1 follow-up') >= 0 && !appEl.querySelector('.tl-thread b b');
      S.timeline = null;
      goto('settings');
      var providers = document.querySelectorAll('[data-aikey]').length;
      goto('home');
      return { stateBox: stateBox, timeline: timeline, providers: providers };
    },
    // How to use this app: first on the dashboard, with the tour and video
    // buttons (no video player on the page itself), the AI-key steps and one
    // guide row per section; the first-time invitation is on the dashboard.
    tutorialInfo: function () {
      goto('home');
      var firstRow = appEl.querySelector('.dash-row');
      var invite = !!document.getElementById('tourInvite') && !!document.getElementById('tourInviteStart') && !!document.getElementById('tourInviteLater');
      goto('tutorial');
      var thumb = appEl.querySelector('.tut-thumb');
      return {
        first: firstRow ? firstRow.textContent.indexOf('How to use this app') >= 0 : false,
        invite: invite,
        title: (appEl.querySelector('h1') || {}).textContent,
        tourButton: !!document.getElementById('tourStart'),
        videoButton: !!document.getElementById('tutPlay'),
        videoOnPage: !!appEl.querySelector('video'),
        thumb: thumb ? thumb.getAttribute('src') : '',
        tourLoaded: !!window.SSBTour,
        tourSteps: tourSteps().length,
        steps: appEl.querySelectorAll('.tut-steps li').length,
        guideRows: appEl.querySelectorAll('.tut-row').length,
        blurbsFilled: Array.prototype.every.call(appEl.querySelectorAll('.tut-row .small'), function (d) { return d.textContent.trim().length > 20; })
      };
    },
    // Every step of the guided tour, in order: the screen it opens, whether its
    // part of the screen was found and lit up, and that the card sits on
    // screen without covering it. Then Back, the voice switch and Skip/Finish.
    tourSteps: function () {
      return tourSteps().map(function (s) { return { id: s.id, audio: s.audio || '' }; });
    },
    tourFlow: function () {
      S.config.tourSeen = false;
      S.config.tourInviteClosed = false;
      goto('home');
      var hadInvite = !!document.getElementById('tourInvite');
      var startBtn = document.getElementById('tourInviteStart');
      if (!startBtn) return Promise.resolve({ hadInvite: false, error: 'the first-time invitation was not shown' });
      startBtn.click();
      var steps = tourSteps();
      var seen = [];
      var settle = function (i) {
        var t0 = performance.now();
        return new Promise(function (resolve) {
          (function poll() {
            var s = window.SSBTour.state();
            if (!s) return resolve(null);
            if (s.i === i && s.settled) return resolve(s);
            if (performance.now() - t0 > 6000) return resolve(s);
            setTimeout(poll, 60);
          })();
        });
      };
      var walk = function (i) {
        return settle(i).then(function (s) {
          if (!s) return { error: 'the tour closed at step ' + i };
          seen.push({ id: s.id, view: S.view, wanted: s.wanted, lit: s.lit, cardOnScreen: s.cardOnScreen, covers: s.covers, room: s.covers ? s.room : undefined });
          if (i + 1 < steps.length) {
            window.SSBTour.next();
            return walk(i + 1);
          }
          return null;
        });
      };
      var out = { hadInvite: hadInvite, count: steps.length };
      return walk(0).then(function (err) {
        if (err) out.error = err.error;
        out.seen = seen;
        out.missing = seen.filter(function (x) { return x.wanted && !x.lit; }).map(function (x) { return x.id; });
        out.offScreen = seen.filter(function (x) { return !x.cardOnScreen; }).map(function (x) { return x.id; });
        out.covering = seen.filter(function (x) { return x.covers; }).map(function (x) { return x.id; });
        // Back one step, then the voice switch, then Finish on the last step.
        window.SSBTour.back();
        return settle(steps.length - 2);
      }).then(function (s) {
        out.backWorks = !!s && s.i === steps.length - 2;
        var before = s && s.voice;
        document.getElementById('tourVoice').click();
        out.voiceToggles = !!window.SSBTour.state() && window.SSBTour.state().voice === !before && S.config.tourVoice === !before;
        document.getElementById('tourVoice').click();
        window.SSBTour.next();
        return settle(steps.length - 1);
      }).then(function () {
        document.getElementById('tourNext').click();
        out.closed = !window.SSBTour.active() && !document.getElementById('tour');
        out.seenSaved = S.config.tourSeen === true;
        goto('home');
        out.inviteGone = !document.getElementById('tourInvite');
        // Skip from the middle closes it too, from the How to use screen.
        goto('tutorial');
        document.getElementById('tourStart').click();
        return settle(0);
      }).then(function () {
        window.SSBTour.next();
        return settle(1);
      }).then(function () {
        document.getElementById('tourSkip').click();
        out.skipCloses = !window.SSBTour.active() && !document.getElementById('tour');
        out.backToTutorial = S.view === 'tutorial';
        return out;
      });
    },
    // Newspaper: the bundled test paper is analysed, saved, shown, its notes
    // and Line opened, then deleted again.
    paperFlow: function (b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var out = { engine: !!window.SSBPaper };
      return import('./lib/pdf.min.js').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
        return window.SSBPaper.analyze(lib, bytes.buffer, 'smoke-test-paper.pdf');
      }).then(function (res) {
        out.ok = !!res.ok;
        if (!res.ok) { out.error = res.error; return out; }
        var arts = res.paper.articles;
        out.stories = arts.length;
        out.sections = arts.map(function (a) { return a.sectionKey; }).sort().join(',');
        out.topIsFront = arts[0].frontPage;
        out.pointsEach = arts.every(function (a) { return a.points.length > 0 && a.prompts.length === 3; });
        out.plan = window.SSBPaper.plan(res.paper).length;
        out.cuts = res.cuts.length;
        out.marked = arts.filter(function (a) { return a.cut && a.marks && a.marks.length; }).length;
        return window.SSBPaper.db.save(res.paper, res.cuts).then(function () {
          var P = paperState();
          P.cur = res.paper;
          P.tab = 'plan';
          P.hist = null;
          goto('paper');
          out.cards = appEl.querySelectorAll('.paper-story').length;
          var first = appEl.querySelector('.paper-story');
          first.open = true;
          first.dispatchEvent(new Event('toggle'));
          return new Promise(function (r) { setTimeout(r, 800); });
        }).then(function () {
          var line = appEl.querySelector('[data-line]');
          out.lineFilled = !!line && !!line.getAttribute('data-done');
          var img = appEl.querySelector('.paper-story .cut-wrap img');
          out.cutShown = !!img && img.complete && img.naturalWidth > 40;
          out.cutMarks = appEl.querySelectorAll('.paper-story .cut-wrap .mk').length;
          out.aiButton = !!appEl.querySelector('[data-aibtn]');
          return window.SSBPaper.db.countCuts(res.paper.id);
        }).then(function (n) {
          out.cutsStored = n;
          return window.SSBPaper.db.remove(res.paper.id);
        }).then(function () {
          return Promise.all([window.SSBPaper.db.list(), window.SSBPaper.db.countCuts(res.paper.id)]);
        }).then(function (r2) {
          out.removed = !r2[0].some(function (p) { return p.id === res.paper.id; }) && r2[1] === 0;
          return out;
        });
      });
    },
    // Important Topics: real list from GitHub, the smallest PDF downloaded,
    // checksum-checked, opened (stubbed under --smoke) and removed again.
    topicsFlow: function () {
      var out = { tile: TILES.some(function (t) { return t.id === 'topics'; }), listed: 0, offline: false };
      S.topicsDb = null;
      return Promise.resolve(window.api.topicsIndex({ force: true })).then(function (r) {
        if (!r || !r.index) {
          out.offline = true;
          out.enabled = r && r.enabled;
          out.error = r && r.error;
          return out;
        }
        out.listed = r.index.topics.length;
        var small = r.index.topics.slice().sort(function (a, b) { return a.size - b.size; })[0];
        out.file = small.file;
        return Promise.resolve(window.api.topicsDownload(small.file))
          .then(function (d) {
            out.download = !!(d && d.ok);
            out.shaOk = !!d && d.sha === small.sha256;
            return window.api.topicsIndex({});
          })
          .then(function (r2) {
            out.local = !!(r2.local || {})[small.file];
            return loadTopics(false).then(function () { goto('topics'); });
          })
          .then(function () {
            out.rows = appEl.querySelectorAll('.lectcard').length;
            out.openBtn = !!appEl.querySelector('[data-tpopen="' + small.file + '"]');
            return window.api.topicsOpen(small.file);
          })
          .then(function (o) {
            out.open = !!(o && o.ok);
            return window.api.topicsRemove(small.file);
          })
          .then(function () { return window.api.topicsIndex({}); })
          .then(function (r3) {
            out.removed = !(r3.local || {})[small.file];
            S.topicsDb.data.local = r3.local || {};
            goto('topics');
            return out;
          });
      });
    },
    bootCheck: function () {
      var w = builtinSets('wat');
      var s = builtinSets('srt');
      var t = builtinSets('tat');
      return {
        view: S.view,
        watSets: w.length,
        srtSets: s.length,
        tatSets: t.length,
        watItems: w[0] ? w[0].items.length : 0,
        srtItems: s[0] ? s[0].items.length : 0,
        tatScenes: t[0] ? t[0].items.length : 0,
        homeTiles: document.querySelectorAll('[data-tile]').length,
        tileCount: TILES.length,
        navLinks: 1,
        configKeys: Object.keys(S.config).length
      };
    },
    clickHomeTile: function (t) {
      var b = document.querySelector('[data-tile="' + t + '"]');
      if (!b) return false;
      b.click();
      return true;
    },
    setupSetNames: function () {
      return Array.prototype.map.call(document.querySelectorAll('#setSel option'), function (o) {
        return o.textContent;
      });
    },
    clickSetupManagePics: function () {
      var b = document.getElementById('manageImgs');
      if (!b) return false;
      b.click();
      return S.view;
    },
    clickSetupTimings: function () {
      var b = document.getElementById('goSettings');
      if (!b) return false;
      b.click();
      return S.view;
    },
    clickSettingsBack: function () {
      var b = document.getElementById('back');
      if (!b) return false;
      b.click();
      return S.view;
    },
    // Sections live on the dashboard now, so navigation in the smoke test goes
    // through a tile when one is on screen and straight to the view otherwise.
    clickNav: function (v) {
      var tile = document.querySelector('[data-tile="' + v + '"]');
      if (tile) {
        tile.click();
        return S.view;
      }
      goto(v);
      return S.view;
    },
    dashInfo: function () {
      var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-tile]'));
      var sel = tiles.filter(function (t) { return t.classList.contains('sel'); })[0];
      var root = getComputedStyle(document.documentElement);
      return {
        tiles: tiles.length,
        selected: sel ? sel.getAttribute('data-tile') : null,
        settingsInTopBar: !!document.querySelector('.topnav [data-goto="settings"]'),
        topLinks: document.querySelectorAll('.topnav [data-goto]').length,
        bg: root.getPropertyValue('--bg').trim(),
        auto: !!S.dashAuto,
        rows: document.querySelectorAll('.dash-row').length,
        ring: !!document.querySelector('.dash-ring'),
        wheel: !!document.querySelector('.dash-wheel'),
        moved: tiles.some(function (t) { var tr = getComputedStyle(t).transform; return tr && tr !== 'none'; }),
        columns: dashColumns()
      };
    },
    dashKey: function (key) {
      var ev = new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-tile]'));
      var sel = tiles.filter(function (t) { return t.classList.contains('sel'); })[0];
      return {
        selected: sel ? sel.getAttribute('data-tile') : null,
        auto: !!S.dashAuto,
        columns: dashColumns()
      };
    },
    binInfo: function () {
      return {
        items: (S.tatBin || []).length,
        cards: document.querySelectorAll('[data-bin]').length,
        restoreButtons: document.querySelectorAll('[data-restore]').length,
        purgeButtons: document.querySelectorAll('[data-purge]').length
      };
    },
    binDrop: function (kind, index) {
      var list = kind === 'classic' ? S.tatClassic : S.tatImages;
      var item = (list || [])[index || 0];
      if (!item) return null;
      if (kind === 'classic') {
        dropPicture({ id: item.id, kind: 'classic', file: item.file, title: item.title, source: item.source });
        return { id: item.id, title: item.title };
      }
      var p = String(item);
      var parts = p.split(/[\\/]/);
      dropPicture({ id: p, kind: 'mine', file: p, title: parts[parts.length - 1] });
      return { id: p, title: parts[parts.length - 1] };
    },
    binRestore: function (id) {
      restorePicture(id);
      return true;
    },
    binPurge: function (id) {
      purgePicture(id);
      return true;
    },
    binResetGone: function () {
      var b = document.getElementById('resetGone');
      if (!b) return false;
      b.click();
      return true;
    },
    binResurrect: function (id) {
      var b = document.querySelector('[data-resurrect="' + String(id).replace(/"/g, '') + '"]');
      if (!b) return false;
      b.click();
      return true;
    },
    addWordsRemove: function (name) {
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-delwat]'));
      for (var i = 0; i < buttons.length; i++) {
        var row = buttons[i].parentNode;
        if (row && String(row.textContent).indexOf(name) >= 0) {
          buttons[i].click();
          return true;
        }
      }
      return false;
    },
    lectureNewsGroups: function () {
      return Array.prototype.map.call(document.querySelectorAll('.newsgroup h4'), function (h) {
        return h.textContent;
      });
    },
    addInfo: function () {
      return {
        addPics: !!document.getElementById('addTatPics'),
        wordName: !!document.getElementById('addWatName'),
        wordBox: !!document.getElementById('addWatWords'),
        addSet: !!document.getElementById('addWatSet'),
        picks: document.querySelectorAll('[data-drop]').length,
        watSets: customSets('wat').length
      };
    },
    addWords: function (text) {
      var box = document.getElementById('addWatWords');
      var name = document.getElementById('addWatName');
      var btn = document.getElementById('addWatSet');
      if (!box || !btn) return false;
      if (name) name.value = 'Smoke words';
      box.value = String(text || '');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      btn.click();
      return true;
    },
    validWordCount: function (text) {
      return validWords(text).length;
    },
    newsRefresh: function (force) {
      return new Promise(function (resolve) {
        S.newsLoading = false;
        window.api
          .newsIndex({ force: !!force })
          .then(function (res) {
            S.newsIndex = res && res.ok ? res : { ok: false, error: res && res.error };
            resolve({ ok: !!(res && res.ok), count: (res && res.items ? res.items.length : 0), cached: !!(res && res.cached) });
          })
          .catch(function (err) {
            resolve({ ok: false, error: err && err.message });
          });
      });
    },
    newsLine: function (word) {
      var item = newsExampleFor(word);
      return item ? { text: item.text, source: item.source || '', date: item.date || '' } : null;
    },
    newsRows: function () {
      return document.querySelectorAll('.model-tag.news').length;
    },

    /* attempts / history / export */
    attemptList: function () {
      return S.attempts.map(function (a) {
        return {
          id: a.id,
          test: a.test,
          setName: a.setName,
          answered: a.answered,
          total: a.total,
          reason: a.reason,
          items: (a.items || []).length
        };
      });
    },
    attemptCount: function () {
      return S.attempts.length;
    },
    historyDomCount: function () {
      return document.querySelectorAll('.attempt').length;
    },
    clickHistoryOpen: function (i) {
      var b = document.querySelectorAll('[data-open]')[i || 0];
      if (!b) return false;
      b.click();
      return {
        openAttempt: S.openAttempt,
        qaRows: document.querySelectorAll('.qa').length,
        galleryRows: document.querySelectorAll('.tat-gallery .tat-thumb').length
      };
    },
    clickHistoryExport: function (i) {
      var b = document.querySelectorAll('[data-export]')[i || 0];
      if (!b) return false;
      b.click();
      return true;
    },
    clickHistoryDelete: function (i) {
      var b = document.querySelectorAll('[data-del]')[i || 0];
      if (!b) return false;
      b.click();
      return true;
    },
    clickClearAll: function () {
      var b = document.getElementById('clearAll');
      if (!b) return false;
      b.click();
      return true;
    },
    resultScreen: function () {
      return { hasStat: !!document.querySelector('.stat'), text: document.body.innerText.slice(0, 600) };
    },
    clickExportResult: function () {
      var b = document.getElementById('export');
      if (!b) return false;
      b.click();
      return true;
    },
    clickAgain: function () {
      var b = document.getElementById('again');
      if (!b) return false;
      b.click();
      return true;
    },

    /* pause / resume / clear */
    clickPause: function () {
      var b = document.getElementById('pauseBtn');
      if (!b) return false;
      b.click();
      return { paused: !!(S.session && S.session.paused), label: b.textContent };
    },
    sessionRemaining: function () {
      return S.session ? Math.round(S.session.remaining) : null;
    },
    watClear: function () {
      var b = document.getElementById('clearBtn');
      if (!b) return null;
      b.click();
      return S.refs && S.refs.input ? S.refs.input.value : null;
    },

    /* SRT navigation */
    srtNav: function () {
      var s = S.session;
      if (!s) return null;
      return {
        index: s.index,
        navButtons: document.querySelectorAll('.qbtn').length,
        answeredLabel: S.refs && S.refs.answered ? S.refs.answered.textContent : '',
        textareas: document.querySelectorAll('textarea.answer').length,
        copyNote: !!document.querySelector('.srt-copy'),
        current: document.querySelectorAll('.qbtn.current').length
      };
    },
    srtClickNext: function () {
      var b = document.getElementById('nextBtn');
      if (!b) return false;
      b.click();
      return true;
    },
    srtClickPrev: function () {
      var b = document.getElementById('prevBtn');
      if (!b) return false;
      b.click();
      return true;
    },
    srtClickNav: function (i) {
      var b = document.querySelectorAll('.qbtn')[i];
      if (!b) return false;
      b.click();
      return true;
    },
    srtAnsweredCount: function () {
      var s = S.session;
      if (!s) return null;
      return s.items.filter(itemDone).length;
    },

    /* TAT slides and pictures */
    tatSlideKinds: function () {
      var s = S.session;
      if (!s) return null;
      return s.items.map(function (i) {
        return i.kind;
      });
    },
    tatImageSrc: function () {
      var el = document.querySelector('.slide-img');
      return el ? el.getAttribute('src') : null;
    },
    tatImageLoaded: function () {
      // naturalWidth is only non-zero once Chromium has actually decoded and
      // drawn the picture, which is the thing that matters.
      var el = document.querySelector('.slide-img');
      if (!el) return null;
      return { complete: !!el.complete, w: el.naturalWidth, h: el.naturalHeight };
    },
    clickExternal: function (i) {
      var b = document.querySelectorAll('[data-external]')[i || 0];
      if (!b) return null;
      b.click();
      return b.getAttribute('data-external');
    },
    tatAdvance: function () {
      var b = document.getElementById('nextBtn');
      if (!b) return false;
      b.click();
      return true;
    },
    tatPhase: function () {
      var s = S.session;
      return s ? { phase: s.phase, index: s.index } : null;
    },
    tatPromptHidden: function () {
      var el = document.getElementById('slideContent');
      return el ? el.hidden : null;
    },
    tatClickPeek: function () {
      var b = document.getElementById('peekBtn');
      if (!b) return false;
      b.click();
      return document.getElementById('slideContent').hidden === false;
    },
    pickImages: function () {
      return window.api.pickTatImages().then(function (l) {
        S.tatImages = l || [];
        // Same rule as the Add pictures button: eleven is enough, so use them.
        if (S.tatImages.length >= 11) {
          S.config.tatSource = 'mine';
          window.api.setConfig({ tatSource: 'mine' });
        }
        return S.tatImages.length;
      });
    },
    clearImages: function () {
      return window.api.clearTatImages().then(function () {
        S.tatImages = [];
        if (S.config.tatSource === 'mine') {
          S.config.tatSource = 'classic';
          window.api.setConfig({ tatSource: 'classic' });
        }
        return 0;
      });
    },
    imageCount: function () {
      return (S.tatImages || []).length;
    },

    /* dictionary, straight through */
    dictGet: function (w) {
      return window.api.dictGet(w);
    },
    dictSearch: function (q, offset, limit) {
      return window.api.dictSearch({ query: q, offset: offset || 0, limit: limit || 5 });
    },
    dictSentiment: function (type, offset, limit) {
      return window.api.dictSentiment({ type: type, offset: offset || 0, limit: limit || 5 });
    },
    dictRandom: function (filter, count) {
      return window.api.dictRandom({ filter: filter || 'all', count: count || 10 });
    },

    /* library interface */
    libraryRowCount: function () {
      return document.querySelectorAll('.wordrow').length;
    },
    libraryRows: function () {
      return Array.prototype.map.call(document.querySelectorAll('.wordrow .w'), function (w) {
        return w.textContent;
      });
    },
    libraryClickMore: function () {
      var b = document.getElementById('libMore');
      if (!b) return false;
      b.click();
      return true;
    },
    libraryClickMeaning: function (word) {
      var rows = document.querySelectorAll('.wordrow');
      for (var i = 0; i < rows.length; i++) {
        var w = rows[i].querySelector('.w');
        if (w && w.textContent === word) {
          var btn = rows[i].querySelector('[data-meaning]');
          if (!btn) return { found: true, clicked: false };
          btn.click();
          return { found: true, clicked: true };
        }
      }
      return { found: false, clicked: false };
    },
    libraryCloseMeaning: function (word) {
      return this.libraryClickMeaning(word);
    },
    libraryOpenText: function () {
      var el = document.querySelector('.wordrow.open .defs');
      return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 200) : '';
    },
    libraryTypeSearch: function (text) {
      var q = document.getElementById('libQ');
      if (!q) return false;
      q.value = text;
      q.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    libraryClickRandom: function () {
      var b = document.getElementById('libRandom');
      if (!b) return false;
      b.click();
      return true;
    },
    libraryClickTab: function (tab) {
      var b = document.querySelector('[data-libt="' + tab + '"]');
      if (!b) return null;
      b.click();
      return new Promise(function (resolve) {
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          var L = libState();
          if (!L.busy && L.items.length > 0) {
            clearInterval(iv);
            resolve({
              view: S.view,
              tab: L.tab,
              rows: document.querySelectorAll('.wordrow').length,
              loadedTab: L.tab,
              listMatchesTab: true,
              allPositive: L.items.every(function (i) { return i.sentiment > 0; }),
              allNegative: L.items.every(function (i) { return i.sentiment < 0; })
            });
          } else if (tries > 60) {
            clearInterval(iv);
            resolve({ view: S.view, tab: L.tab, rows: 0, allPositive: false, timedOut: true });
          }
        }, 100);
      });
    },
    libraryClickFetch: function (theme) {
      var el = document.getElementById('libTheme');
      if (el) el.value = theme || 'duty';
      var b = document.getElementById('libFetch');
      if (!b) return Promise.resolve({ clicked: false });
      b.click();
      return new Promise(function (resolve) {
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          var L = libState();
          if ((!L.fetching && L.fetched) || tries > 120) {
            clearInterval(iv);
            resolve({ clicked: true, fetched: L.fetched, saveBtn: !!document.getElementById('libSaveSet'), timedOut: tries > 120 });
          }
        }, 100);
      });
    },
    libraryClickSaveSet: function () {
      var b = document.getElementById('libSaveSet');
      if (!b) return false;
      b.click();
      return true;
    },

    /* settings and custom sets */
    settingsSetNum: function (key, val) {
      var inp = document.querySelector('[data-num="' + key + '"]');
      if (!inp) return null;
      inp.value = String(val);
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return S.config[key];
    },
    settingsNumValue: function (key) {
      var inp = document.querySelector('[data-num="' + key + '"]');
      return inp ? inp.value : null;
    },
    settingsToggle: function (key) {
      var b = document.querySelector('[data-toggle="' + key + '"]');
      if (!b) return null;
      b.click();
      return S.config[key];
    },
    settingsAddCustom: function (test, name, lines) {
      var t = document.getElementById('cTest');
      var n = document.getElementById('cName');
      var it = document.getElementById('cItems');
      var add = document.getElementById('addCustom');
      if (!t || !n || !it || !add) return false;
      t.value = test;
      n.value = name;
      it.value = (Array.isArray(lines) ? lines : [lines]).join('\n');
      add.click();
      return true;
    },
    settingsClearCustom: function (test) {
      var b = document.querySelector('[data-clearcustom="' + test + '"]');
      if (!b) return false;
      b.click();
      return true;
    },
    settingsText: function () {
      return document.body.innerText.slice(0, 12000);
    },
    customSetNames: function (test) {
      return customSets(test).map(function (s) {
        return s.name;
      });
    },
    allSetCount: function (test) {
      return allSets(test).length;
    },
    configFromDisk: function () {
      return window.api.getConfig();
    },
    startSetByName: function (test, name) {
      var idx = allSets(test)
        .map(function (s) { return s.name; })
        .indexOf(name);
      if (idx < 0) return false;
      start(test, idx);
      return !!S.session;
    },
    shuffleProbe: function (i) {
      var original = !!S.config.shuffleWAT;
      var prevView = S.view;
      function drop() {
        S.session = null;
        S.refs = null;
        stopTick();
        window.api.keepAwake(false);
      }
      function words() {
        return S.session.items.map(function (it) { return it.prompt; });
      }
      S.config.shuffleWAT = false;
      start('wat', i || 0);
      var ordered = words();
      drop();
      S.config.shuffleWAT = true;
      start('wat', i || 0);
      var mixed = words();
      drop();
      S.config.shuffleWAT = original;
      S.view = prevView;
      return {
        sameSize: ordered.length === mixed.length && ordered.length > 1,
        sameWords: ordered.slice().sort().join('|') === mixed.slice().sort().join('|'),
        differentOrder: ordered.join('|') !== mixed.join('|'),
        orderedFirst: ordered[0],
        shuffledFirst: mixed[0]
      };
    },
    xssProbe: function () {
      return { pwned: !!document.getElementById('pwned'), flag: !!window.__xssed };
    },
    keepAwake: function (on) {
      return window.api.keepAwake(!!on);
    },
    openExternal: function (u) {
      return window.api.openExternal(u);
    }
  };

  // The app scales itself to the window: base type and content width are
  // multiplied by one factor derived from the window size, so a 1280px screen
  // and a 3840px screen both look designed rather than clipped or stretched.
  // Layout below 900px already collapses in CSS; this only handles legibility.
  function fitScale() {
    var w = window.innerWidth || 1164;
    var h = window.innerHeight || 801;
    // Shrink on short/narrow windows, grow generously on large ones, and
    // never go so small that body copy stops being readable.
    var s = Math.min(w / 1100, h / 760);
    if (s > 1) s = 1 + (s - 1) * 0.45; // soft gain on big screens
    s = Math.max(0.8, Math.min(1.45, s));
    document.documentElement.style.setProperty('--scale', s.toFixed(3));
  }

  /* -------------------------------------------------------------- sound */

  // Cues are synthesised, not shipped as audio files: a phone has no asset to
  // lose, and the notes are the same on every platform. The audio context is
  // created inside the click that starts the test, because mobile browsers
  // only allow sound after a real touch.
  var AUDIO = null;

  function audioCtx() {
    if (AUDIO) return AUDIO;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      AUDIO = new Ctor();
    } catch (_) {
      AUDIO = null;
    }
    return AUDIO;
  }

  function cue(kind) {
    if (S.config && S.config.soundOn === false) return;
    var ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (_) {}
    }
    // 'next' marks a new word, picture or phase; 'tap' is the soft click on a button.
    var notes = kind === 'end' ? [784, 587, 392] : kind === 'write' ? [659, 880] : kind === 'next' ? [880] : kind === 'tap' ? [1320] : [523, 659, 784];
    var t0 = ctx.currentTime + 0.02;
    var peak = kind === 'tap' ? 0.05 : 0.22;
    for (var i = 0; i < notes.length; i++) {
      var at = t0 + i * 0.16;
      var dur = kind === 'end' ? 0.4 : kind === 'tap' ? 0.04 : kind === 'next' ? 0.15 : 0.22;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }
    // A phone also buzzes, so the cue lands even with the media volume down; a tap only ticks.
    try {
      if (navigator.vibrate) navigator.vibrate(kind === 'end' ? [120, 80, 120] : kind === 'tap' ? 8 : 60);
    } catch (_) {}
  }

  // Two palettes ship with the app: Mist (dark — the Windows 11 theme this
  // app now follows) and Alpine light (the sage paper one). The choice lives
  // in Settings, is saved like any other setting, and is applied before the
  // first paint so the ground never flashes the wrong colour.
  // Reduce motion is a preference on top of the operating system's own
  // "Animation effects" switch, never a replacement for it: the stylesheet
  // honours this attribute and the prefers-reduced-motion media query.
  function motionReduced() {
    if (S.config && S.config.reduceMotion) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function applyMotion() {
    var on = !!(S.config && S.config.reduceMotion);
    document.documentElement.setAttribute('data-reduce-motion', on ? 'true' : 'false');
    return on;
  }

  function applyTheme() {
    var name = S.config && S.config.theme === 'alpine' ? 'alpine' : 'mist';
    document.documentElement.setAttribute('data-theme', name);
    document.documentElement.setAttribute('data-palette', (S.config && S.config.palette) || 'navy');
    applyMotion();
    return name;
  }

  function setTheme(name, palette) {
    S.config.theme = name;
    S.config.palette = palette || 'navy';
    applyTheme();
    window.api.setConfig({ theme: name, palette: S.config.palette }).then(function () {
      render();
      toast(name === 'alpine' ? 'Light theme applied' : (palette === 'crimson' ? 'Crimson' : palette === 'green' ? 'Green' : 'Navy and gold') + ' theme applied');
    });
  }

  /* ------------------------------------------------------- opening sheet */

  // The sheet in index.html is what you see before anything else. It names
  // the piece of data being read, so a slow first launch on a phone is
  // visible progress rather than a blank window.
  function bootProgress(pct, note, foot) {
    var bar = document.getElementById('bootBar');
    var name = document.getElementById('bootNote');
    var tail = document.getElementById('bootFoot');
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
    if (name && note) name.textContent = note;
    if (tail && foot) tail.textContent = foot;
  }

  var BOOT_AT = Date.now();

  function bootDone() {
    var el = document.getElementById('bootScreen');
    bootProgress(100, 'Ready', 'Opening the dashboard');
    if (!el) return;
    // On the phone the opening sheet stays at least 3 seconds from launch, so its credit line can be read.
    var wait = onPhone() && !window.__noStateGate ? Math.max(0, 3000 - (Date.now() - BOOT_AT)) : 0;
    setTimeout(function () {
      el.classList.add('done');
      el.setAttribute('aria-hidden', 'true');
      setTimeout(function () { el.hidden = true; }, 420);
    }, wait);
  }

  function boot() {
    fitScale();
    applyTheme();
    window.addEventListener('resize', fitScale);

    // Read one piece at a time, so each line on the opening sheet is true.
    var steps = [
      ['Opening your store', function () { return window.api.loadData(); }, 'data'],
      ['Reading your settings', function () { return window.api.getConfig(); }, 'config'],
      ['Loading attempt history', function () { return window.api.listAttempts(); }, 'attempts'],
      ['Indexing your TAT pictures', function () { return window.api.listTatImages(); }, 'images'],
      ['Reading the TAT library', function () { return window.api.tatLibrary(); }, 'library'],
      ['Loading lecturettes', function () { return window.api.lecturesList(); }, 'lectures'],
      ['Opening WAT hints', function () { return window.api.watHints(); }, 'hints'],
      ['Reading the classic set', function () { return window.api.tatClassic(); }, 'classic'],
      ['Reading the PPDT pictures', function () { return window.api.ppdtList ? window.api.ppdtList() : []; }, 'ppdt'],
      ['Checking removed pictures', function () { return window.api.tatBin(); }, 'bin'],
      ['Checking deleted pictures', function () { return window.api.tatGoneList(); }, 'gone'],
      ['Checking for the master copy', function () { return window.api.contentIsMaster ? window.api.contentIsMaster() : false; }, 'master']
    ];
    var got = {};
    var at = 0;

    function nextStep() {
      if (at >= steps.length) return Promise.resolve(got);
      var step = steps[at];
      at++;
      bootProgress(4 + ((at - 1) / steps.length) * 88, step[0], 'Step ' + at + ' of ' + steps.length);
      return Promise.resolve()
        .then(step[1])
        .then(function (value) {
          got[step[2]] = value;
          return nextStep();
        });
    }

    nextStep()
      .then(function (res) {
        S.data = res.data || S.data;
        S.config = res.config || {};
        applyTheme();
        S.attempts = res.attempts || [];
        S.tatImages = res.images || [];
        S.tatLibrary = res.library || [];
        S.lecturesBase = res.lectures || [];
        S.lectures = lectWithWritten(S.lecturesBase);
        S.ppdt = res.ppdt || [];
        S.hints = res.hints || {};
        S.tatClassic = res.classic || [];
        S.tatBin = res.bin || [];
        S.tatGoneItems = res.gone || [];
        S.tatGone = S.tatGoneItems.length;
        S.isMaster = res.master === true;
        bootProgress(96, 'Drawing the dashboard');
        render();
        bootDone();
        // Headlines for the sixth WAT example. Off the clock and never fatal.
        loadNewsIndex(false);
        // Honest online/offline indicator. Non-blocking and cached; a failed
        // probe just shows "offline" and never stops anything working.
        refreshNet(true);
        refreshLiveStatus();
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err);
        bootProgress(100, 'Startup problem', msg);
        appEl.innerHTML =
          '<div class="scroll"><div class="wrap"><h1>Startup problem</h1>' +
          '<div class="note">' + esc(msg) + '</div></div></div>';
        appEl.hidden = false;
      });
  }

  // Renderer-side failures go to the same log file as everything else.
  window.addEventListener('error', function (e) {
    try {
      window.api.logAppend('renderer', 'error: ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    try {
      window.api.logAppend('renderer', 'unhandledRejection: ' + ((e.reason && (e.reason.message || e.reason)) || ''));
    } catch (_) {}
  });


  // The Android hardware back button asks this before Capacitor closes the
  // app. A screen returns to the dashboard; a running test asks before it is
  // thrown away; only the dashboard lets the press leave the app.
  window.__ssbBack = function () {
    // The phone's Back button closes the tutorial video, then the guided tour (like Skip).
    if (tutPlayerClose) {
      tutPlayerClose();
      return true;
    }
    if (window.SSBTour && window.SSBTour.active()) {
      window.SSBTour.skip();
      return true;
    }
    if (S.view === 'home') return false;
    var running = !!S.session;
    var lect = S.view === 'lecturette' && lectState().run;
    var ppdtRun = S.view === 'ppdt' && S.pp && S.pp.mode === 'run';
    if (ppdtRun) {
      if (!window.confirm('Leave this PPDT round?')) return true;
      stopPpdtTimer();
      S.pp.mode = 'setup';
      window.api.keepAwake(false);
    }
    if (running || lect) {
      var ok = window.confirm('Leave this practice session? The attempt will not be saved.');
      if (!ok) return true;
      stopTick();
      stopLectTimer();
      if (S.view === 'lecturette') {
        lectState().run = null;
        lectState().mode = 'list';
      }
      S.session = null;
      S.refs = null;
      window.api.keepAwake(false);
    }
    goto('home');
    return true;
  };

  // Every button and tile answers a tap with a soft click (and a tick of
  // vibration on a phone), so a press is felt even when the screen is glanced at.
  document.addEventListener('click', function (e) {
    var hit = e.target && e.target.closest && e.target.closest('button, [data-tile]');
    if (hit && !hit.disabled) cue('tap');
  }, true);

  boot();
})();
