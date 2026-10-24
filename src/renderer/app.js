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

  function allSets(test) {
    return builtinSets(test).concat(customSets(test));
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
    { id: 'tat', label: 'TAT', code: 'TAT', test: true },
    { id: 'wat', label: 'WAT', code: 'WAT', test: true },
    { id: 'srt', label: 'SRT', code: 'SRT', test: true },
    { id: 'lecturette', label: 'Lecturette', code: 'LECT' },
    { id: 'library', label: 'Word library', code: 'WORD' },
    { id: 'digest', label: 'News Digest', code: 'NEWS' },
    { id: 'history', label: 'History', code: 'HIST' },
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
      '<div class="brand"><span class="brand-badge">SSB</span> Prep Trainer' +
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
    Array.prototype.forEach.call(appEl.querySelectorAll('[data-external]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.api.openExternal(a.getAttribute('data-external'));
      });
    });
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
    if (S.view === 'digest') return renderDigest();
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
          '<li><span>View / write</span><b>' + S.config.tatViewSec + 's / ' + S.config.tatWriteSec / 60 + ' min</b></li>' +
          '<li><span>Total</span><b>' +
          Math.round((12 * (S.config.tatViewSec + S.config.tatWriteSec)) / 60) +
          ' min</b></li>';
      }
      return {
        code: m.code,
        chip: m.name,
        blurb: m.blurb,
        rows: rows + '<li><span>Practice sets</span><b>' + sets.length + '</b></li>'
      };
    }
    if (t.id === 'lecturette') {
      var topics = lectTopics().length;
      var scripts = lectScriptCount();
      return {
        code: t.code,
        chip: topics + ' topics',
        blurb: 'The three-minute SSB pattern with a spoken script where one exists, plus current points from the news.',
        rows:
          '<li><span>Pattern</span><b>30s · 2m · 30s</b></li>' +
          '<li><span>With a script</span><b>' + scripts + '</b></li>' +
          '<li><span>Outlines</span><b>' + (topics - scripts) + '</b></li>'
      };
    }
    if (t.id === 'library') {
      return {
        code: t.code,
        chip: '147,417 words',
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
        blurb: 'Upload TAT pictures and WAT word lists, and see everything the tests will use.',
        rows:
          '<li><span>TAT pictures</span><b>' + (S.tatImages || []).length + ' yours</b></li>' +
          '<li><span>WAT sets</span><b>' + customSets('wat').length + ' yours</b></li>' +
          '<li><span>Wrong picture?</span><b>move to bin</b></li>'
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

  function dashTile(t, i) {
    var meta = dashMeta(t);
    return (
      '<button class="card dash-tile" data-tile="' + t.id + '" data-index="' + i + '" style="--i:' + i + '">' +
      '<span class="dash-ring" aria-hidden="true"></span>' +
      '<span class="dash-in">' +
      '<span class="tile-head"><span class="tile-code">' + esc(meta.code) + '</span>' +
      '<span class="chip">' + esc(meta.chip) + '</span></span>' +
      '<span class="dash-blurb">' + esc(meta.blurb) + '</span>' +
      '<ul class="tile-meta">' + meta.rows + '</ul>' +
      '</span>' +
      '<span class="dash-open">Open →</span>' +
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

  // The highlight walks the tiles until the person takes over: hovering,
  // focusing or pressing a key stops it. Movement is the point, not a lottery.
  function wireDash() {
    var tiles = dashTiles();
    if (!tiles.length) return;
    stopDashTimer();
    S.dashSel = Math.min(S.dashSel || 0, tiles.length - 1);
    selectTile(S.dashSel);
    // The highlight only walks on its own when movement is welcome; a person
    // who asked for less motion keeps the first tile until they move it.
    S.dashAuto = !motionReduced();
    tiles.forEach(function (b, i) {
      b.addEventListener('mouseenter', function () {
        S.dashAuto = false;
        selectTile(i);
      });
      b.addEventListener('focus', function () {
        S.dashAuto = false;
        selectTile(i);
      });
      b.addEventListener('click', function () {
        openTile(b.getAttribute('data-tile'));
      });
    });
    if (!S.dashKeysBound) {
      document.addEventListener('keydown', onDashKey);
      S.dashKeysBound = true;
    }
    if (!motionReduced()) {
      S.dashTimer = setInterval(function () {
        if (!S.dashAuto || S.view !== 'home') return;
        selectTile(S.dashSel + 1);
      }, 4500);
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
      '<h1>SSB psychology test trainer</h1>' +
      '<p class="lead">Everything for the board on one dashboard. ' +
      (S.config.onlineEnabled
        ? 'Online extras are on and fall back to what is already saved on this ' + (onPhone() ? 'phone' : 'computer') +
          ', so a lost connection never stops a session. '
        : 'This copy runs offline: every test uses the material already saved here, so nothing waits on a connection. ') +
      (onPhone()
        ? 'Tap a tile to open it.</p>'
        : 'Move with <b>← ↑ ↓ →</b> and open with <b>Enter</b>: the highlight walks the tiles until you take over.</p>') +
      '</div>' +
      '<div class="dashbadge"><b>' + TILES.length + '</b><span>sections</span></div>' +
      '</div>' +
      '<div class="dash" id="dash">' + TILES.map(dashTile).join('') + '</div>' +
      '<h2>At a glance</h2>' + stats +
      '<div class="note">Timings follow the format commonly reported for the SSB psychology battery: ' +
      '<b>TAT</b> 12 slides, ' + S.config.tatViewSec + ' seconds to view and 4 minutes to write each story; ' +
      '<b>WAT</b> 60 words, one every ' + S.config.watPerWordSec + ' seconds; ' +
      '<b>SRT</b> 60 situations in ' + S.config.srtTotalMin + ' minutes. Change any of these in <b>Settings</b>.</div>' +
      '<p class="small muted" style="margin-top:14px">Practice material is compiled from publicly published SSB preparation material and rewritten for this app. ' +
      'See the material notes at the bottom of <b>Settings</b>.</p>'
    );

    wireDash();
  }

  /* ----------------------------------------------------------- setup view */

  function renderSetup() {
    var test = S.pending.test;
    var m = META[test];
    var sets = allSets(test);
    var images = S.tatImages;

    var opts = sets
      .map(function (s, i) {
        return '<option value="' + i + '"' + (i === S.pending.setIndex ? ' selected' : '') + '>' + esc(s.name) + ' — ' + s.items.length + ' items</option>';
      })
      .join('');

    var extra = '';
    if (test === 'tat') {
      var libCount = (S.tatLibrary || []).length;
      var classicCount = (S.tatClassic || []).length;
      var mineCount = (S.tatImages || []).length;
      var source = S.config.tatSource || (classicCount >= 11 ? 'classic' : 'museum');
      if (source === 'classic' && classicCount < 11) source = 'museum';
      if (source === 'mine' && mineCount < 11) source = classicCount >= 11 ? 'classic' : 'museum';

      extra =
        '<h2>Picture source</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Pictures for every set<br><span class="small muted">Eleven pictures plus the blank twelfth slide</span></label>' +
        '<div class="ctl"><select id="tatSource">' +
        '<option value="classic"' + (source === 'classic' ? ' selected' : '') + (classicCount < 11 ? ' disabled' : '') + '>Classic TAT set — ' + classicCount + ' plates</option>' +
        '<option value="museum"' + (source === 'museum' ? ' selected' : '') + '>Museum library — ' + libCount.toLocaleString() + ' pictures</option>' +
        '<option value="mine"' + (source === 'mine' ? ' selected' : '') + (mineCount < 11 ? ' disabled' : '') + '>My own pictures — ' + mineCount + ' added</option>' +
        '</select></div></div>' +
        '<div class="field"><label><b>Add my own pictures</b><br><span class="small muted">' +
        (mineCount ? mineCount + ' picture(s) added — usable once there are 11 or more' : 'None added') +
        '</span></label><div class="ctl">' +
        '<button class="btn sm" id="pickImgs">Add pictures…</button>' +
        '<button class="btn sm ghost" id="manageImgs">Review / remove…</button>' +
        '<button class="btn sm ghost" id="clearImgs">Clear</button></div></div>' +
        '<div class="field"><label><b>More museum pictures</b><br><span class="small muted">Optional online top-up, needs online lookup on in Settings</span></label><div class="ctl">' +
        '<button class="btn sm" id="fetchOnlineImgs">Fetch 20 more online</button>' +
        '</div></div>' +
        '</div>' +
        '<div class="note" style="margin-top:12px">A picture that looks wrong can be taken out of the test from ' +
        '<b>Review / remove…</b>; it waits in the bin and can be brought back. ' +
        'A set never repeats a picture, and recent sets are held back so a scene does not come round again. ' +
        (source === 'classic'
          ? 'The classic set comes from the CarePatron TAT PDF and your own TAT folder, de-duplicated when it was built.'
          : source === 'mine'
            ? 'Your own pictures are used only on this ' + (onPhone() ? 'phone' : 'computer') + '; nothing is uploaded.'
            : 'Museum pictures are public domain (CC0), from the Art Institute of Chicago and The Met.') +
        '</div>';
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
        '</div>'
    );

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
            if (res && res.error === 'offline') toast('Turn on online lookup in Word library first.');
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
    return S.config.tatViewSec + 's view + ' + (S.config.tatWriteSec / 60) + ' min write × 12 slides';
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
  function tatPool() {
    var mine = (S.tatImages || []).filter(Boolean);
    var source = S.config.tatSource || 'classic';
    if (source === 'mine' && mine.length >= 11) {
      return mine.map(function (p, i) {
        return { id: 'mine-' + i, file: p, title: 'My picture ' + (i + 1) };
      });
    }
    if (source === 'classic' && (S.tatClassic || []).length >= 11) return S.tatClassic.slice();
    if (source !== 'museum' && (S.tatClassic || []).length >= 11) return S.tatClassic.slice();
    return (S.tatLibrary || []).slice();
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

  function durationFor(session) {
    if (session.test === 'wat') return S.config.watPerWordSec * 1000;
    if (session.test === 'srt') return S.config.srtTotalMin * 60 * 1000;
    return session.phase === 'view' ? S.config.tatViewSec * 1000 : S.config.tatWriteSec * 1000;
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
        if (s.phase === 'view') toWritePhase();
        else advanceTat();
        return;
      }
      updateBar(S.refs.bar, s.remaining / dur);
      S.refs.clock.textContent = clock(s.remaining);
      // The warning is a share of the phase, not a fixed minute: a 30-second
      // practice write would otherwise be "one minute left" from the start.
      var warn =
        s.phase === 'view'
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
        '<div class="srt-copy"><b>Write your reaction in your practice copy</b>' +
        '<span>One line per situation, in the same order as the numbers. This screen keeps the situation and the clock only.</span></div>' +
        '<div class="situation" id="situation"></div>' +
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
        '<div class="tat-copy"><b>Write the story in your practice copy.</b><span>Look at the picture for ' +
        S.config.tatViewSec + ' seconds. It is taken away when the viewing time ends, then you get ' +
        (S.config.tatWriteSec / 60) + ' minutes to write — in your copy, exactly as at the board.</span></div>' +
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
      if (S.session.phase === 'view') toWritePhase();
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
    var viewing = s.phase === 'view';
    var peeking = !viewing && !!s.peeking;
    S.refs.phase.textContent = viewing ? 'Viewing' : 'Writing';
    S.refs.clock.textContent = viewing ? S.config.tatViewSec : clock(S.config.tatWriteSec * 1000);
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
    S.refs.hint.innerHTML = viewing
      ? 'You have <b>' + S.config.tatViewSec + ' seconds</b> to look. Then the slide is taken away and you get <b>' +
        S.config.tatWriteSec / 60 + ' minutes</b> to write.'
      : 'Writing time. Aim for a clear beginning, a practical action and a settled ending.';
    document.getElementById('peekBtn').style.display = 'none';
    if (!s.paused) updateBar(S.refs.bar, 1);
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
        '<button class="btn" id="toHistory">Open history</button>' +
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
    document.getElementById('toHistory').addEventListener('click', function () { goto('history'); });
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
    if (r.error === 'offline') return 'Online lookup is off — turn it on in Word library first.';
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
    var own = (cfg.lectOwn || []).map(function (o) {
      return { id: o.id, topic: o.topic, query: o.topic, theme: 'Your topic', category: 'Your topics', boards: [], source: 'own' };
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
        if (!r[0] || !r[0].ok) {
          L.writing = null;
          toast(lectWriteError(r[0]));
          render();
          return;
        }
        var cfg = S.config || {};
        var written = Object.assign({}, cfg.lectWritten || {});
        written[id] = lectCompose(Object.assign({}, topic, { topic: text }), r[0], r[1]);
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
          if (done) startLecture(done, null);
          else render();
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
    el.innerHTML = lectLiveHtml();
    var again = document.getElementById('lectLiveAgain');
    if (again) again.addEventListener('click', function () { loadLive(true); });
    var settings = document.getElementById('lectLiveSettings');
    if (settings) settings.addEventListener('click', function () { goto('settings'); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-external]'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        window.api.openExternal(b.getAttribute('data-external'));
      });
    });
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

  function renderLectList() {
    var L = lectState();
    var topics = lectTopics();
    var boards = lectBoards();

    var boardOpts = ['<option value="all">All centres and boards</option>']
      .concat(
        boards.map(function (b) {
          return '<option value="' + esc(b) + '"' + (L.board === b ? ' selected' : '') + '>' + esc(b) + '</option>';
        })
      )
      .join('');

    var cats = lectCats();
    var catOpts = ['<option value="all">All themes</option>']
      .concat(
        cats.map(function (c) {
          return '<option value="' + esc(c) + '"' + (L.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        })
      )
      .join('');

    var shown = lectFiltered();
    var withScript = topics.filter(function (t) {
      return t.source === 'curated' || t.source === 'draft' || t.written;
    }).length;

    var cards = shown
      .map(function (t) {
        var idx = topics.indexOf(t);
        var open = !!L.open[t.id];
        var live = (L.liveStatus || {})[t.id];
        return (
          '<div class="card lectcard">' +
          '<div class="lechead">' +
          '<div>' +
          '<div class="lectitle">' + esc(t.topic) + '</div>' +
          '<div class="small muted">' +
          '<span class="chip' + (t.source === 'curated' ? ' ok' : '') + '">' + esc(lectSourceLabel(t)) + '</span> ' +
          esc(t.category || t.theme || '') +
          (asList(t.boards).length ? ' · asked at: ' + esc(asList(t.boards).join(', ')) : '') +
          (live ? ' · points checked ' + esc(live.checkedOn) : '') +
          '</div>' +
          '</div>' +
          '<div class="row" style="margin:0">' +
          '<button class="btn sm ghost" data-lectfacts="' + idx + '">' + (open ? 'Hide facts' : 'Facts') + '</button>' +
          // A hand-written or drafted script is never replaced by a generated one.
          (t.source === 'curated' || (t.speech && !t.written)
            ? ''
            : '<button class="btn sm" data-lectwrite="' + idx + '"' + (L.writing ? ' disabled' : '') + '>' +
              (L.writing === t.id ? 'Writing…' : t.written ? 'Rewrite with latest facts' : 'Write it for me') + '</button>') +
          '<button class="btn primary sm" data-lectstart="' + idx + '">Practise</button>' +
          '</div>' +
          '</div>' +
          (open ? '<div style="margin-top:12px">' + lectFactsHtml(t) + '</div>' : '') +
          '</div>'
        );
      })
      .join('');

    body(
      '<h1>Lecturette — the three-minute SSB pattern</h1>' +
      '<p class="lead">A lecturette is a three-minute talk on a topic handed to you on the spot. ' +
      'The pattern that scores is <b>30 seconds intro, 2 minutes body, 30 seconds conclusion</b>. ' +
      'The clock here changes phase by itself, exactly like the real thing. Nothing is typed — speak it aloud and write in your notebook.</p>' +
      '<div class="card lectform">' +
      '<div class="field"><label>Selection centre / board<br><span class="small muted">' +
      topics.length + ' topics · <b>' + withScript + '</b> with a full script · <b>' + (topics.length - withScript) + '</b> as outlines</span></label>' +
      '<div class="ctl"><select id="lectBoard">' + boardOpts + '</select>' +
      '<select id="lectCat">' + catOpts + '</select>' +
      '<button class="btn primary" id="lectRandom">Practise a random topic</button></div></div>' +
      '<div class="field" style="margin-top:14px"><label for="lectSearch">Find a topic<br><span class="small muted">' +
      'Type a topic, a theme or a cue word — the list narrows as you type</span></label>' +
      '<div class="ctl"><input id="lectSearch" class="textinput" type="search" placeholder="e.g. inflation, navy, youth" value="' + esc(L.q || '') + '"></div></div>' +
      '<div class="field" style="margin-top:14px"><label for="lectOwn">Your own topic<br><span class="small muted">' +
      'Type any topic and the app writes a three-minute lecturette in simple words, from the latest facts, with every source dated</span></label>' +
      '<div class="ctl"><input id="lectOwn" class="textinput" type="text" maxlength="120" placeholder="e.g. Operation Sindoor, Make in India, cyber security">' +
      '<button class="btn primary" id="lectOwnWrite"' + (L.writing ? ' disabled' : '') + '>' +
      (L.writing && L.writing.indexOf('own-') === 0 ? 'Writing…' : 'Write my lecture') + '</button></div></div>' +
      '<div class="small muted">Pattern: <b>' + esc(LECT_PHASES[0].label) + ' ' + LECT_PHASES[0].secs + 's</b> → ' +
      '<b>' + esc(LECT_PHASES[1].label) + ' ' + LECT_PHASES[1].secs / 60 + ' min</b> → ' +
      '<b>' + esc(LECT_PHASES[2].label) + ' ' + LECT_PHASES[2].secs + 's</b>. ' +
      'Every topic carries the sub-points the examiners expect, plus a facts panel to quote.</div>' +
      '</div>' +
      lectHotHtml() +
      '<h2>Topics</h2>' +
      (shown.length
        ? cards
        : '<div class="empty">No topic matches those filters. Clear the search or choose “All themes” and “All centres and boards”.</div>') +
      '<p class="small muted" style="margin-top:16px">Topic material is compiled from publicly reported SSB guidance and rewritten for this app. ' +
      'Figures are the ones most commonly quoted and are marked as reported.</p>'
    );

    var board = document.getElementById('lectBoard');
    if (board) {
      board.addEventListener('change', function () {
        L.board = board.value;
        render();
      });
    }

    var cat = document.getElementById('lectCat');
    if (cat) {
      cat.addEventListener('change', function () {
        L.cat = cat.value;
        render();
      });
    }

    // Searching re-renders the list, so the caret is put back where it was;
    // otherwise the field would lose focus on the first keystroke.
    var search = document.getElementById('lectSearch');
    if (search) {
      search.addEventListener('input', function () {
        L.q = search.value;
        var pos = search.selectionStart || 0;
        render();
        var again = document.getElementById('lectSearch');
        if (!again) return;
        again.focus();
        try {
          again.setSelectionRange(pos, pos);
        } catch (_) {}
      });
    }

    var rnd = document.getElementById('lectRandom');
    if (rnd) {
      rnd.addEventListener('click', function () {
        var pick = randomLecture(shown);
        if (pick) startLecture(pick, null);
      });
    }

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectstart]'), function (b) {
      b.addEventListener('click', function () {
        var t = topics[parseInt(b.getAttribute('data-lectstart'), 10)];
        if (t) startLecture(t, null);
      });
    });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectwrite]'), function (b) {
      b.addEventListener('click', function () {
        var t = topics[parseInt(b.getAttribute('data-lectwrite'), 10)];
        if (t) writeLecture(t);
      });
    });

    var ownBtn = document.getElementById('lectOwnWrite');
    var ownIn = document.getElementById('lectOwn');
    if (ownBtn && ownIn) {
      var writeOwn = function () {
        var text = ownIn.value.trim();
        if (text.length < 3) return toast('Type a topic first');
        writeLecture({ topic: text });
      };
      ownBtn.addEventListener('click', writeOwn);
      ownIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') writeOwn(); });
    }

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-lectfacts]'), function (b) {
      b.addEventListener('click', function () {
        var t = topics[parseInt(b.getAttribute('data-lectfacts'), 10)];
        if (!t) return;
        L.open[t.id] = !L.open[t.id];
        render();
      });
    });

    var hotBtn = document.getElementById('lectHot');
    if (hotBtn) hotBtn.addEventListener('click', function () { fetchHotTopics(); });
    var hotAgain = document.getElementById('lectHotAgain');
    if (hotAgain) hotAgain.addEventListener('click', function () { fetchHotTopics(); });
    var toLib = document.getElementById('lectToLibrary');
    if (toLib) toLib.addEventListener('click', function () { goto('library'); });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-hot]'), function (b) {
      b.addEventListener('click', function () {
        var h = L.hot && L.hot.items[parseInt(b.getAttribute('data-hot'), 10)];
        if (!h) return;
        startLecture({ topic: h.title }, { hot: true, link: h.link });
      });
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
          '<span class="right"><button class="btn ghost sm" id="lectList">All topics</button></span>' +
          '</div>' +
          '</div>' +
          '</div>'
      );

      document.getElementById('lectPause').addEventListener('click', function () { lecturePause(); });
      document.getElementById('lectNext').addEventListener('click', function () { lectureNextPhase(); });
      document.getElementById('lectFinish').addEventListener('click', function () { finishLecture('manual'); });
      document.getElementById('lectList').addEventListener('click', function () { leaveLecture(); });
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
        '<p class="lead">Pictures you took out of the TAT test. Nothing here is used by a test, and nothing is ' +
        'destroyed until you press <b>Delete forever</b>. Restore puts a picture straight back into its source.</p>' +
        (bin.length
          ? '<div class="row" style="margin-bottom:14px">' +
            '<span class="chip">' + bin.length + ' picture' + (bin.length === 1 ? '' : 's') + '</span>' +
            '<button class="btn sm danger" id="emptyBin">Empty the bin</button>' +
            '<button class="btn sm ghost" id="binAdd">Add or review pictures</button>' +
            '</div>' +
            '<div class="bin-grid">' + items + '</div>'
          : '<div class="empty">The bin is empty. Remove a wrong picture from <b>Add material</b> and it will wait here.</div>' +
            '<div class="row" style="margin-top:14px"><button class="btn primary" id="binAdd">Open Add material</button></div>') +
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
    if (add) add.addEventListener('click', function () { goto('add'); });
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
      window.api.tatGoneList()
    ]).then(function (res) {
      S.tatLibrary = res[0] || [];
      S.tatClassic = res[1] || [];
      S.tatImages = res[2] || [];
      S.tatBin = res[3] || [];
      S.tatGoneItems = res[4] || [];
      S.tatGone = S.tatGoneItems.length;
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

  function renderAdd() {
    var classic = S.tatClassic || [];
    var mine = S.tatImages || [];
    var lib = S.tatLibrary || [];
    var shownLib = lib.slice(0, 24);
    var watSets = customSets('wat');

    var classicCards = classic
      .map(function (c) {
        return pickCard(c.file, c.title || 'Classic plate', {
          id: c.id,
          kind: 'classic',
          file: c.file,
          title: c.title,
          source: c.source
        }, 'classic set');
      })
      .join('');

    var mineCards = mine
      .map(function (p, i) {
        var parts = String(p).split(/[\\/]/);
        return pickCard(p, parts[parts.length - 1] || 'Picture ' + (i + 1), {
          id: String(p),
          kind: 'mine',
          file: String(p),
          title: parts[parts.length - 1] || 'Your picture'
        }, 'your picture');
      })
      .join('');

    var libCards = shownLib
      .map(function (c) {
        return pickCard(c.file, c.title || 'Untitled', {
          id: c.id,
          kind: 'library',
          file: c.file,
          title: c.title,
          source: c.source
        }, c.creator || 'museum library');
      })
      .join('');

    var setList = watSets.length
      ? watSets
          .map(function (s) {
            return (
              '<li class="diag-row"><span>' + esc(s.name.replace(' (mine)', '')) + ' · ' + s.items.length + ' words</span>' +
              '<button class="btn sm danger" data-delwat="' + esc(s.id) + '">Remove</button></li>'
            );
          })
          .join('')
      : '<div class="small muted">No word lists of your own yet.</div>';

    body(
      '<h1>Add material</h1>' +
        '<p class="lead">Bring your own TAT pictures and WAT words. A picture that looks wrong for the test can be ' +
        'moved to the <b>Bin</b> here and restored later — it is never destroyed by accident.</p>' +

        '<h2>TAT pictures</h2>' +
        '<div class="card">' +
        '<div class="row">' +
        '<button class="btn primary" id="addTatPics">Add pictures…</button>' +
        '<span class="chip">' + classic.length + ' classic</span>' +
        '<span class="chip">' + mine.length + ' yours</span>' +
        '<span class="chip">' + lib.length + ' in the museum library</span>' +
        '<button class="btn sm ghost" id="goBin">Open bin (' + (S.tatBin || []).length + ')</button>' +
        '</div>' +
        '<p class="small muted" style="margin:12px 0 0">' + (onPhone() ? 'Tap the <b>×</b> on a picture' : 'Hover a picture and press <b>×</b>') +
        ' to take it out of the test. ' +
        'The test never sees it again until you restore it.</p>' +
        '</div>' +

        (classic.length
          ? '<h3>Classic set — ' + classic.length + ' plates</h3><div class="pick-grid">' + classicCards + '</div>'
          : '') +

        '<h3>Your pictures' + (mine.length ? ' — ' + mine.length : '') + '</h3>' +
        (mine.length
          ? '<div class="pick-grid">' + mineCards + '</div>'
          : '<div class="empty">No pictures of your own yet. <b>Add pictures…</b> takes a folder of scenes.</div>') +

        (lib.length
          ? '<h3>Museum library — first 24 of ' + lib.length + '</h3><div class="pick-grid">' + libCards + '</div>'
          : '') +

        '<h2>WAT words</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Set name<br><span class="small muted">Shown in the set picker as “name (mine)”</span></label>' +
        '<div class="ctl"><input id="addWatName" type="text" placeholder="e.g. My defence words" maxlength="60"></div></div>' +
        '<div class="field" style="display:block;margin-top:12px"><label>Words — one per line<br>' +
        '<span class="small muted">Letters only, single words. Up to 60 per set; duplicates are dropped.</span></label>' +
        '<textarea id="addWatWords" class="answer" style="height:140px;margin-top:8px" spellcheck="false" placeholder="courage&#10;duty&#10;teamwork"></textarea></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn primary" id="addWatSet">Add this list</button>' +
        '<span class="small muted" id="addWatCount"></span></div>' +
        '</div>' +
        '<h3>Your WAT sets</h3><div class="card">' +
        '<ul style="list-style:none;margin:0;padding:0">' + setList + '</ul>' +
        '</div>' +

        '<p class="small muted" style="margin-top:16px">' +
        (window.api && window.api.android
          ? 'Pictures you add are kept on this phone, even after the app is closed. '
          : 'Pictures you add are used only on this computer. ') +
        'The classic set is user-supplied practice material and is not redistributed with the app.</p>'
    );

    var addPics = document.getElementById('addTatPics');
    if (addPics) {
      addPics.addEventListener('click', function () {
        window.api.pickTatImages().then(function (list) {
          S.tatImages = list || [];
          toast(S.tatImages.length + ' pictures ready');
          render();
        });
      });
    }
    var goBin = document.getElementById('goBin');
    if (goBin) goBin.addEventListener('click', function () { goto('bin'); });

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-drop]'), function (b) {
      b.addEventListener('click', function () {
        var payload = null;
        try {
          payload = JSON.parse(b.getAttribute('data-drop'));
        } catch (_) {
          return;
        }
        dropPicture(payload);
      });
    });

    var words = document.getElementById('addWatWords');
    var count = document.getElementById('addWatCount');
    var tally = function () {
      if (!words || !count) return;
      var n = validWords(words.value).length;
      count.textContent = n ? n + ' words ready' : 'nothing to add yet';
    };
    if (words) {
      words.addEventListener('input', tally);
      tally();
    }

    var addSet = document.getElementById('addWatSet');
    if (addSet) {
      addSet.addEventListener('click', function () {
        var nameEl = document.getElementById('addWatName');
        var name = (nameEl && nameEl.value ? nameEl.value : '').trim() || 'My WAT set';
        var list = validWords(words ? words.value : '');
        if (!list.length) {
          toast('Add at least one word, one per line');
          return;
        }
        S.config.custom = S.config.custom || { tat: [], wat: [], srt: [] };
        S.config.custom.wat = S.config.custom.wat || [];
        S.config.custom.wat.push({
          id: 'custom-wat-' + Date.now(),
          name: name,
          items: list.slice(0, 60)
        });
        window.api.setConfig({ custom: S.config.custom });
        toast('Added “' + name + '” with ' + Math.min(list.length, 60) + ' words');
        render();
      });
    }

    Array.prototype.forEach.call(appEl.querySelectorAll('[data-delwat]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delwat');
        S.config.custom = S.config.custom || { tat: [], wat: [], srt: [] };
        S.config.custom.wat = (S.config.custom.wat || []).filter(function (s) {
          return s.id !== id;
        });
        window.api.setConfig({ custom: S.config.custom });
        toast('Word list removed');
        render();
      });
    });
  }

  // A word list is only accepted if every line looks like a single word.
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
        '<p class="lead">Adjust the timings to match your board or coaching guidance, and add your own practice lists.</p>' +

        '<h2>Appearance</h2>' +
        '<div class="card">' +
        '<div class="field"><label>Theme<br><span class="small muted">' +
        'Mist is the dark palette this app ships with; Alpine light is the sage paper one. ' +
        'Same layout, same type, same motion — only the colours change.</span></label>' +
        '<div class="ctl">' +
        '<button class="btn sm' + (S.config.theme === 'alpine' ? '' : ' primary') + '" id="themeMist">Mist dark</button>' +
        '<button class="btn sm' + (S.config.theme === 'alpine' ? ' primary' : '') + '" id="themeAlpine">Alpine light</button>' +
        '</div></div>' +
        toggleField('Reduce motion', 'Skip the tile orbit, lecturette slides and paging transitions. ' +
          (onPhone() ? 'Your phone\'s own "remove animations" setting' : 'Windows\' own "Animation effects" setting') +
          ' is always respected as well.', 'reduceMotion') +
        '</div>' +

        '<h2>Sound and internet</h2>' +
        '<div class="card">' +
        toggleField('Sound cues', 'A short chime when a test starts, when each word, picture or lecturette phase changes, ' +
          'and at the end' + (onPhone() ? '; the phone also buzzes' : '') + '. Taps on buttons click softly.', 'soundOn') +
        toggleField('Online lookup', 'Live news, the lecturette writer, word meanings and extra museum pictures. ' +
          'Everything else works with no connection.', 'onlineEnabled') +
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
        numField('Seconds to write each story', 'Standard is 4 minutes (240 seconds).', 'tatWriteSec', 30, 900, 'sec') +
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
    if (tMist) tMist.addEventListener('click', function () { setTheme('mist'); });
    var tAlpine = document.getElementById('themeAlpine');
    if (tAlpine) tAlpine.addEventListener('click', function () { setTheme('alpine'); });

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
  function renderPhoneDigest() {
    if (!DG.phoneBusy && !DG.phone) {
      DG.phoneBusy = true;
      // Refresh must skip the 20-minute cache, or it hands back the same saved copy.
      var force = !!DG.phoneForce;
      DG.phoneForce = false;
      Promise.resolve(window.api.digestOnPhone && window.api.digestOnPhone({ force: force }))
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
        '<button class="btn ghost sm" id="digHome">Dashboard</button>' +
        '</div>' +
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
  }

  function renderDigest() {
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
        ringAnimation: tiles[0] ? getComputedStyle(tiles[0].querySelector('.dash-ring')).animationName : ''
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
    applyMotion();
    return name;
  }

  function setTheme(name) {
    S.config.theme = name;
    applyTheme();
    window.api.setConfig({ theme: name }).then(function () {
      render();
      toast(name === 'mist' ? 'Mist dark applied' : 'Alpine light applied');
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

  function bootDone() {
    var el = document.getElementById('bootScreen');
    bootProgress(100, 'Ready', 'Opening the dashboard');
    if (!el) return;
    el.classList.add('done');
    el.setAttribute('aria-hidden', 'true');
    setTimeout(function () { el.hidden = true; }, 420);
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
      ['Checking removed pictures', function () { return window.api.tatBin(); }, 'bin'],
      ['Checking deleted pictures', function () { return window.api.tatGoneList(); }, 'gone']
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
        S.hints = res.hints || {};
        S.tatClassic = res.classic || [];
        S.tatBin = res.bin || [];
        S.tatGoneItems = res.gone || [];
        S.tatGone = S.tatGoneItems.length;
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
    if (S.view === 'home') return false;
    var running = !!S.session;
    var lect = S.view === 'lecturette' && lectState().run;
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
