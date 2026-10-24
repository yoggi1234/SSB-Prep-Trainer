/*
 * window.api for the Android build.
 *
 * The desktop app talks to Electron through src/preload.js + IPC. On Android
 * there is no main process, so the same surface is built in the page from the
 * modules beside this file:
 *
 *   store.js     settings, saved attempts, the localStorage mechanism
 *   net.js       fetch/JSON/XML with timeouts, Google News RSS, date labels
 *   material.js  the bundled practice data and the dictionary
 *   online.js    word lookups and live news, gated by the online switch
 *   digest.js    the phone's twelve-section edition and its fallback chain
 *   museum.js    public-domain plates kept in IndexedDB
 *   platform.js  gallery pictures, clipboard, wake lock, back button, diagnostics
 *
 * This file owns nothing but that assembly: one key, one module. A duplicate is
 * a bug (it is how the old single-file bridge ended up with two owners for the
 * online status), so it fails loudly on the console at boot instead of letting
 * whichever file loaded last silently win.
 */
(function () {
  'use strict';

  var SSB = window.SSB || {};

  // net.js is listed although it adds no api keys: a module that failed to load
  // must fail here, not later as a screen that silently cannot fetch.
  var modules = [
    ['store', SSB.store],
    ['net', SSB.net],
    ['material', SSB.material],
    ['online', SSB.online],
    ['digest', SSB.digest],
    ['museum', SSB.museum],
    ['platform', SSB.platform]
  ];

  var api = { android: true };
  var owners = Object.create(null);

  modules.forEach(function (entry) {
    var name = entry[0];
    var mod = entry[1];
    if (!mod) throw new Error('SSB module missing: ' + name);
    Object.keys(mod.api || {}).forEach(function (key) {
      if (owners[key]) throw new Error('api key owned twice: ' + key + ' (' + owners[key] + ', ' + name + ')');
      owners[key] = name;
      api[key] = mod.api[key];
    });
  });

  window.api = api;
  SSB.api = api;
  window.SSB = SSB;
})();
