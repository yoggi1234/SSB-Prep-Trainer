/*
 * Guided tour: shows the real app one step at a time. The rest of the screen
 * is dimmed, the part being explained is lit up, and a card explains it in
 * Hindi-English, with an optional voice clip. Back, Next and Skip are on
 * every step. The same file runs in the PC app and the phone app, and it
 * needs no internet.
 *
 * window.SSBTour.start(steps, opts)
 *   steps: [{ id, view, target, title, text, audio }]
 *     view    the screen to open first (opts.go(view)); '' keeps the current one
 *     target  CSS selector of the part to light up; '' (or not found in time)
 *             shows the card in the middle with the whole screen dimmed
 *     audio   file name under opts.audioBase, played when the voice is on
 *   opts: { go(view), view(), onEnd({ done, at }), voice, onVoice(on), audioBase }
 */
(function () {
  'use strict';

  var WAIT_MS = 3000; // how long a step waits for its part of the screen to appear
  var PAD = 6; // space between the lit-up part and its gold ring

  var st = null;

  var SPEAKER_ON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';

  function $(id) { return document.getElementById(id); }

  function build() {
    var root = document.createElement('div');
    root.className = 'tour';
    root.id = 'tour';
    root.innerHTML =
      '<div class="tour-shade" id="tourShade"></div>' +
      '<div class="tour-hole" id="tourHole" hidden></div>' +
      '<div class="tour-card" id="tourCard" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">' +
      '<div class="tour-top">' +
      '<span class="tour-count" id="tourCount"></span>' +
      '<button class="tour-icon" id="tourVoice" type="button"></button>' +
      '<button class="tour-icon" id="tourX" type="button" aria-label="Skip the tour" title="Skip the tour">&times;</button>' +
      '</div>' +
      '<div class="tour-bar"><i id="tourBar"></i></div>' +
      '<h3 id="tourTitle"></h3>' +
      '<p id="tourText"></p>' +
      '<div class="tour-btns">' +
      '<button class="btn ghost sm" id="tourSkip" type="button">Skip tour</button>' +
      '<span class="tour-grow"></span>' +
      '<button class="btn sm" id="tourBack" type="button">Back</button>' +
      '<button class="btn primary sm" id="tourNext" type="button">Next</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(root);
    $('tourNext').addEventListener('click', next);
    $('tourBack').addEventListener('click', back);
    $('tourSkip').addEventListener('click', function () { finish(false); });
    $('tourX').addEventListener('click', function () { finish(false); });
    $('tourVoice').addEventListener('click', toggleVoice);
    paintVoice();
  }

  function paintVoice() {
    var b = $('tourVoice');
    if (!b) return;
    b.innerHTML = st.voice ? SPEAKER_ON : SPEAKER_OFF;
    b.setAttribute('aria-pressed', st.voice ? 'true' : 'false');
    b.setAttribute('aria-label', st.voice ? 'Turn the voice off' : 'Turn the voice on');
    b.title = st.voice ? 'Voice on' : 'Voice off';
  }

  function start(steps, opts) {
    if (st) finish(false, true);
    if (!steps || !steps.length) return;
    st = { steps: steps, opts: opts || {}, i: -1, token: 0, voice: !opts || opts.voice !== false, audio: null, target: null, lastFocus: document.activeElement };
    build();
    document.documentElement.classList.add('tour-on');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('resize', placeSoon, true);
    window.addEventListener('scroll', placeSoon, true);
    if (window.MutationObserver) {
      st.watch = new MutationObserver(placeSoon);
      st.watch.observe(document.getElementById('app') || document.body, { childList: true });
    }
    show(0);
  }

  function show(i) {
    if (!st) return;
    if (i >= st.steps.length) return finish(true);
    if (i < 0) i = 0;
    st.i = i;
    var step = st.steps[i];
    var token = ++st.token;
    stopAudio();
    st.target = null;
    st.settled = false;
    st.rescrolled = false;
    $('tourCount').textContent = 'Step ' + (i + 1) + ' of ' + st.steps.length;
    $('tourBar').style.width = Math.round(((i + 1) / st.steps.length) * 100) + '%';
    $('tourTitle').textContent = step.title || '';
    $('tourText').textContent = step.text || '';
    $('tourBack').hidden = i === 0;
    $('tourNext').textContent = i === st.steps.length - 1 ? 'Finish' : 'Next';
    $('tourHole').hidden = true;
    $('tourShade').hidden = false;
    var opened = Promise.resolve();
    if (step.view && st.opts.go && (!st.opts.view || st.opts.view() !== step.view)) {
      try {
        opened = Promise.resolve(st.opts.go(step.view));
      } catch (_) {
        opened = Promise.resolve();
      }
    }
    // The app may have re-drawn the page: keep the tour above it.
    var root = $('tour');
    if (root && root.parentNode === document.body && document.body.lastChild !== root) document.body.appendChild(root);
    opened.then(function () { return waitFor(step, token); }).then(function (target) {
      if (!st || token !== st.token) return;
      st.target = target;
      if (target) target.scrollIntoView({ block: 'center', inline: 'nearest' });
      requestAnimationFrame(function () {
        if (!st || token !== st.token) return;
        place();
        playAudio(step);
        $('tourNext').focus();
        st.settled = true;
      });
    });
    place();
  }

  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function find(selector) {
    if (!selector) return null;
    try {
      var el = document.querySelector(selector);
      return visible(el) ? el : null;
    } catch (_) {
      return null; // a selector this browser cannot read: the card shows in the middle
    }
  }

  // Waits for the step's part of the screen; a step may allow longer (wait, ms).
  function waitFor(step, token) {
    if (!step.target) return Promise.resolve(null);
    var limit = step.wait || WAIT_MS;
    var t0 = performance.now();
    return new Promise(function (resolve) {
      (function poll() {
        if (!st || token !== st.token) return resolve(null);
        var el = find(step.target);
        if (el) return resolve(el);
        if (performance.now() - t0 > limit) return resolve(null);
        setTimeout(poll, 80);
      })();
    });
  }

  // The app redraws whole screens (a late update notice, a list that finished
  // loading); the lit-up part is found again and the ring and card follow it.
  var placeQueued = false;
  function placeSoon() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(function () {
      placeQueued = false;
      place();
    });
  }

  // Lights up the target and puts the card below it, above it, or (when
  // neither side has room) at the bottom of the screen.
  function place() {
    if (!st) return;
    var card = $('tourCard');
    var hole = $('tourHole');
    var shade = $('tourShade');
    if (!card) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = Math.min(440, vw - 24);
    card.style.width = w + 'px';
    var t = st.target;
    if (st.settled && (!t || !document.body.contains(t) || !visible(t))) {
      // Redrawn under the tour (the page went back to the top): find the same
      // part again and bring it back into view.
      t = find(st.steps[st.i].target);
      st.target = t;
      if (t) t.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    if (!t || !document.body.contains(t) || !visible(t)) {
      hole.hidden = true;
      shade.hidden = false;
      card.style.left = Math.round((vw - w) / 2) + 'px';
      card.style.top = Math.max(12, Math.round((vh - card.offsetHeight) / 2)) + 'px';
      return;
    }
    var r = t.getBoundingClientRect();
    var need = card.offsetHeight + 16 + PAD;
    if (vh - r.bottom < need && r.top < need && !st.rescrolled) {
      // No room above or below (a short phone screen): put the part near the
      // top once, so the card fits under it instead of covering it.
      st.rescrolled = true;
      t.scrollIntoView({ block: 'start', inline: 'nearest' });
      r = t.getBoundingClientRect();
    }
    var top = Math.max(4, r.top - PAD);
    var left = Math.max(4, r.left - PAD);
    var bottom = Math.min(vh - 4, r.bottom + PAD);
    var right = Math.min(vw - 4, r.right + PAD);
    hole.hidden = false;
    shade.hidden = true;
    hole.style.top = top + 'px';
    hole.style.left = left + 'px';
    hole.style.width = Math.max(0, right - left) + 'px';
    hole.style.height = Math.max(0, bottom - top) + 'px';
    var ch = card.offsetHeight;
    var y;
    if (vh - bottom >= ch + 16) y = bottom + 12;
    else if (top >= ch + 16) y = top - 12 - ch;
    else y = vh - ch - 12;
    var x = Math.round(r.left + r.width / 2 - w / 2);
    card.style.left = Math.max(12, Math.min(vw - w - 12, x)) + 'px';
    card.style.top = Math.max(12, Math.round(y)) + 'px';
  }

  function playAudio(step) {
    if (!st || !st.voice || !step.audio) return;
    stopAudio(); // never two clips at once
    try {
      var a = new Audio((st.opts.audioBase || 'tour/') + step.audio);
      st.audio = a;
      // A missing clip or a blocked play only means no voice: the card still reads.
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (_) {}
  }

  function stopAudio() {
    if (st && st.audio) {
      try {
        st.audio.pause();
        st.audio.removeAttribute('src');
        st.audio.load();
      } catch (_) {}
      st.audio = null;
    }
  }

  function toggleVoice() {
    if (!st) return;
    st.voice = !st.voice;
    paintVoice();
    if (st.opts.onVoice) st.opts.onVoice(st.voice);
    // A step still settling plays its clip when it settles.
    if (st.voice && st.settled) playAudio(st.steps[st.i]);
    else if (!st.voice) stopAudio();
  }

  // Next and Back wait until the step on screen has settled, so a double tap
  // cannot jump two steps (or Finish the tour by accident).
  function next() { if (st && st.settled) show(st.i + 1); }
  function back() { if (st && st.settled && st.i > 0) show(st.i - 1); }

  // Leaving the app (Home button, another app) stops the voice.
  function onHidden() { if (document.hidden) stopAudio(); }

  // Keys while the tour is open: Esc skips, arrows and Enter move. They are
  // kept from the app below, whose own arrow keys move the dashboard.
  function onKey(e) {
    if (!st) return;
    var k = e.key;
    if (e.repeat && k !== 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      return; // a held key does not race through the steps
    }
    if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') {
      e.preventDefault();
      e.stopPropagation();
      next();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') {
      e.preventDefault();
      e.stopPropagation();
      back();
    } else if (k === 'Tab') {
      // Keep focus inside the card.
      var f = Array.prototype.filter.call($('tourCard').querySelectorAll('button'), function (b) { return !b.hidden; });
      if (!f.length) return;
      var at = f.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      f[(at + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    } else if (k === 'Enter' || k === ' ') {
      // Buttons handle their own Enter and Space; anything else is kept from the app.
      if (!document.activeElement || document.activeElement.tagName !== 'BUTTON') {
        e.preventDefault();
        e.stopPropagation();
        if (k === 'Enter') next();
      }
    } else {
      e.stopPropagation();
    }
  }

  function finish(done, quiet) {
    if (!st) return;
    var s = st;
    stopAudio();
    if (s.watch) s.watch.disconnect();
    st = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('resize', placeSoon, true);
    window.removeEventListener('scroll', placeSoon, true);
    document.documentElement.classList.remove('tour-on');
    var root = $('tour');
    if (root) root.parentNode.removeChild(root);
    if (!quiet && s.opts.onEnd) s.opts.onEnd({ done: !!done, at: s.i });
    try {
      if (s.lastFocus && document.body.contains(s.lastFocus)) s.lastFocus.focus();
    } catch (_) {}
  }

  window.SSBTour = {
    start: start,
    next: next,
    back: back,
    skip: function () { finish(false); },
    active: function () { return !!st; },
    // For the smoke test: where the tour is and what it is showing.
    state: function () {
      if (!st) return null;
      var hole = $('tourHole');
      // Where the card and the ring end up (their styles), not where they are
      // part-way through sliding there.
      var c = $('tourCard');
      var card = { top: parseFloat(c.style.top) || 0, left: parseFloat(c.style.left) || 0 };
      card.bottom = card.top + c.offsetHeight;
      card.right = card.left + c.offsetWidth;
      return {
        i: st.i,
        count: st.steps.length,
        id: st.steps[st.i] && st.steps[st.i].id,
        settled: !!st.settled,
        wanted: !!(st.steps[st.i] && st.steps[st.i].target),
        lit: !!st.target && !hole.hidden,
        // The card must sit fully on screen and not cover the lit-up part.
        cardOnScreen: card.top >= 0 && card.left >= 0 && card.bottom <= window.innerHeight + 1 && card.right <= window.innerWidth + 1,
        covers: !!st.target && !hole.hidden && (function () {
          var top = parseFloat(hole.style.top) || 0;
          var left = parseFloat(hole.style.left) || 0;
          var h = { top: top, left: left, bottom: top + (parseFloat(hole.style.height) || 0), right: left + (parseFloat(hole.style.width) || 0) };
          return !(card.bottom <= h.top || card.top >= h.bottom || card.right <= h.left || card.left >= h.right);
        })(),
        // Room on the screen for the card next to the part, for a failure report.
        room: (function () {
          var top = parseFloat(hole.style.top) || 0;
          var bottom = top + (parseFloat(hole.style.height) || 0);
          return { above: Math.round(top), below: Math.round(window.innerHeight - bottom), card: c.offsetHeight, screen: window.innerHeight };
        })(),
        title: $('tourTitle').textContent,
        voice: st.voice,
        audio: st.audio ? st.audio.src : ''
      };
    }
  };
})();
