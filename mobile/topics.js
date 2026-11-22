/*
 * Important Topics Database on the phone.
 *
 * The same four calls as the desktop's topics:* IPC (src/main.js): the list
 * (index.json) and each study PDF come from the repo's `topics-db` branch, only
 * when asked and only with the online switch on. A PDF is checked against the
 * SHA-256 in the list before it is kept in the app's own storage (no permission
 * needed), and opened in the phone's PDF app the way the News Digest opens its
 * PDFs: through a copy in the cache, which other apps are allowed to read.
 */
(function () {
  'use strict';

  var SSB = window.SSB || (window.SSB = {});
  var store = SSB.store;
  var net = SSB.net;

  var TOPICS_URL = 'https://raw.githubusercontent.com/yoggi1234/SSB-Prep-Trainer/topics-db/';
  var INDEX_KEY = 'ssb-topics-index';
  var LOCAL_KEY = 'ssb-topics-local';
  var FOLDER = 'topics-db/';

  function plugins() {
    return (window.Capacitor && window.Capacitor.Plugins) || {};
  }

  function validIndex(ix) {
    return !!(ix && Array.isArray(ix.topics) && ix.topics.every(function (t) {
      return t && t.id && /^[\w.\-]+\.pdf$/.test(t.file || '') && /^[0-9a-f]{64}$/.test(t.sha256 || '');
    }));
  }

  function local() {
    var m = store.readJson(LOCAL_KEY, {});
    return m && typeof m === 'object' ? m : {};
  }

  function b64ToBytes(b64) {
    var bin = atob(String(b64 || '').replace(/^data:[^,]*,/, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  function sha256Hex(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // Binary download: the native HTTP layer on a device (no CORS, returns base64),
  // a plain fetch in a desktop browser during tests.
  function fetchPdf(url) {
    var http = plugins().CapacitorHttp;
    if (http && net.nativeHttp()) {
      return http.request({ url: url, method: 'GET', responseType: 'blob', connectTimeout: 20000, readTimeout: 90000 }).then(function (r) {
        if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
        return b64ToBytes(r.data);
      });
    }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) { return new Uint8Array(buf); });
  }

  function cachedIndex() {
    var ix = store.readJson(INDEX_KEY, null);
    return validIndex(ix) ? ix : null;
  }

  SSB.topics = {
    api: {
      topicsIndex: function (opts) {
        var index = cachedIndex();
        var source = index ? 'cached' : 'none';
        var enabled = SSB.online.enabled();
        var stale = !index || !index.fetchedAt || Date.now() - index.fetchedAt > 6 * 3600 * 1000;
        if (!enabled || !(stale || (opts && opts.force))) {
          return Promise.resolve({ ok: !!index, index: index, local: local(), source: source, enabled: enabled, error: '' });
        }
        return net.getJson(TOPICS_URL + 'index.json?t=' + Date.now(), 12000).then(function (fresh) {
          if (!validIndex(fresh)) throw new Error('the topic list looks damaged');
          fresh.fetchedAt = Date.now();
          store.writeJson(INDEX_KEY, fresh);
          return { ok: true, index: fresh, local: local(), source: 'live', enabled: true, error: '' };
        }).catch(function (err) {
          return { ok: !!index, index: index, local: local(), source: source, enabled: true, error: (err && err.message) || 'offline' };
        });
      },

      topicsDownload: function (file) {
        var index = cachedIndex();
        var entry = index && index.topics.filter(function (t) { return t.file === file; })[0];
        if (!entry) return Promise.resolve({ ok: false, error: 'not-in-list' });
        if (!SSB.online.enabled()) return Promise.resolve({ ok: false, error: 'online-off' });
        var fsys = plugins().Filesystem;
        var bytes;
        return fetchPdf(TOPICS_URL + (index.base || 'topics/') + encodeURIComponent(file)).then(function (b) {
          bytes = b;
          return sha256Hex(bytes);
        }).then(function (sha) {
          if (sha !== entry.sha256) throw new Error('the download was incomplete, please try again');
          var save = fsys
            ? fsys.writeFile({ path: FOLDER + file, data: bytesToB64(bytes), directory: 'DATA', recursive: true })
            : Promise.resolve();
          return save.then(function () {
            var m = local();
            m[file] = sha;
            store.writeJson(LOCAL_KEY, m);
            return { ok: true, sha: sha };
          });
        }).catch(function (err) {
          return { ok: false, error: (err && err.message) || 'download failed' };
        });
      },

      topicsOpen: function (file) {
        var p = plugins();
        if (!p.Filesystem || !local()[file]) return Promise.resolve({ ok: false, error: 'not-downloaded' });
        return p.Filesystem.readFile({ path: FOLDER + file, directory: 'DATA' }).then(function (r) {
          return p.Filesystem.writeFile({ path: file, data: r.data, directory: 'CACHE' });
        }).then(function (res) {
          return p.FileOpener.open({ filePath: res.uri, contentType: 'application/pdf', openWithDefault: false });
        }).then(function () { return { ok: true }; }, function (err) {
          return { ok: false, error: (err && err.message) || 'could not open' };
        });
      },

      topicsRemove: function (file) {
        var fsys = plugins().Filesystem;
        var m = local();
        delete m[file];
        store.writeJson(LOCAL_KEY, m);
        if (!fsys) return Promise.resolve({ ok: true });
        return fsys.deleteFile({ path: FOLDER + file, directory: 'DATA' }).then(
          function () { return { ok: true }; },
          function () { return { ok: true }; }
        );
      },

      // A phone has no folder window to show; the screen hides this button there.
      topicsFolder: function () {
        return Promise.resolve({ ok: false, error: 'unsupported' });
      }
    }
  };
})();
