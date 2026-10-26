/*
 * Local persistence for the Android build.
 *
 * One owner of everything the app writes to localStorage: settings, saved
 * attempts, and the small caches the feed and digest modules keep (news index,
 * live topic points, last edition). Screens never touch localStorage directly;
 * they go through window.api, which the facade builds from these modules.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var DEFAULTS = {
    watPerWordSec: 15,
    srtTotalMin: 30,
    tatViewSec: 30,
    tatWriteSec: 240,
    shuffleWAT: false,
    shuffleSRT: true,
    tatSource: 'both',
    ppdtViewSec: 30,
    ppdtThinkSec: 30,
    ppdtWriteSec: 240,
    ppdtBlur: 40,
    ppdtTatMix: true,
    ollamaKey: '',
    theme: 'mist',
    reduceMotion: false,
    hideTatPromptWhileWriting: true,
    soundOn: true,
    onlineEnabled: true,
    watSentences: {}
  };

  function readJson(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function config() {
    return Object.assign({}, DEFAULTS, readJson('ssb-config', {}) || {});
  }

  function attempts() {
    var list = readJson('ssb-attempts', []);
    return Array.isArray(list) ? list : [];
  }

  // Pictures in the TAT bin or deleted for good, by id and by file, hidden from
  // every TAT source exactly as binnedKeys() does in src/main.js.
  function tatHidden() {
    var set = Object.create(null);
    readJson('ssb-tat-bin', []).concat(readJson('ssb-tat-gone', [])).forEach(function (r) {
      if (r && r.id) set[String(r.id)] = 1;
      if (r && r.file) set[String(r.file)] = 1;
    });
    return set;
  }

  SSB.store = {
    readJson: readJson,
    writeJson: writeJson,
    config: config,
    attempts: attempts,
    tatHidden: tatHidden,

    api: {
      getConfig: function () {
        return Promise.resolve(config());
      },

      setConfig: function (patch) {
        var next = Object.assign(config(), patch || {});
        writeJson('ssb-config', next);
        return Promise.resolve(next);
      },

      listAttempts: function () {
        return Promise.resolve(attempts());
      },

      addAttempt: function (attempt) {
        var list = attempts();
        var record = Object.assign(
          { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7), savedAt: new Date().toISOString() },
          attempt || {}
        );
        list.unshift(record);
        if (list.length > 300) list.length = 300;
        writeJson('ssb-attempts', list);
        return Promise.resolve(record);
      },

      deleteAttempt: function (id) {
        var list = attempts().filter(function (a) {
          return a.id !== id;
        });
        writeJson('ssb-attempts', list);
        return Promise.resolve(list);
      },

      clearAttempts: function () {
        writeJson('ssb-attempts', []);
        return Promise.resolve([]);
      }
    }
  };
})();
