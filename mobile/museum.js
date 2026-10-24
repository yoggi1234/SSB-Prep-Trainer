/*
 * Public-domain museum art for the Android build.
 *
 * The desktop app keeps a 92 MB picture library on disk. The phone fetches a
 * few extra TAT plates instead, from Wikimedia Commons (which sends CORS
 * headers and is not behind a bot challenge, unlike the museum APIs tried
 * first), and keeps them in IndexedDB: a data URL is far too big for
 * localStorage, and IndexedDB survives a restart the way the desktop cache does.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var net = window.SSB.net;

  function museumDb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open('ssb-museum', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('pictures')) {
          req.result.createObjectStore('pictures', { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function museumAll() {
    return museumDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('pictures', 'readonly').objectStore('pictures').getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function museumPut(rows) {
    return museumDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pictures', 'readwrite');
        rows.forEach(function (r) { tx.objectStore('pictures').put(r); });
        tx.oncomplete = function () { resolve(rows.length); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  // Every result carries its licence, and only public-domain / CC0 files are kept.
  function commonsSearch(term) {
    var url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
      '&generator=search&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + term) +
      '&gsrnamespace=6&gsrlimit=24&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640';
    return net.getJson(url, 12000).then(function (body) {
      var pages = (body && body.query && body.query.pages) || {};
      return Object.keys(pages).map(function (k) { return pages[k]; });
    });
  }

  function licenseOk(meta) {
    var v = String((meta && meta.LicenseShortName && meta.LicenseShortName.value) || '').toLowerCase();
    return v.indexOf('public domain') >= 0 || v.indexOf('cc0') >= 0;
  }

  function cleanTitle(title) {
    return String(title || '')
      .replace(/^File:/i, '')
      .replace(/.[a-z0-9]+$/i, '')
      .replace(/_/g, ' ')
      .trim();
  }

  function cleanArtist(meta) {
    var v = String((meta && meta.Artist && meta.Artist.value) || '');
    return v.replace(/<[^>]*>/g, '').replace(/s+/g, ' ').trim().slice(0, 120);
  }

  function fetchMuseum(want) {
    var terms = ['painting village life', 'painting harvest', 'painting market scene', 'painting peasants', 'painting street scene', 'painting family'];
    var added = [];
    var existing = {};
    return museumAll()
      .then(function (rows) {
        rows.forEach(function (r) { existing[r.id] = 1; });
        var chain = Promise.resolve();
        terms.forEach(function (term) {
          chain = chain.then(function () {
            if (added.length >= want) return null;
            return commonsSearch(term).then(function (pages) {
              var step = Promise.resolve();
              pages.forEach(function (page) {
                step = step.then(function () {
                  if (added.length >= want) return null;
                  var info = (page.imageinfo || [])[0];
                  if (!info || !info.thumburl || !licenseOk(info.extmetadata)) return null;
                  var id = 'commons-' + page.pageid;
                  if (existing[id]) return null;
                  return fetch(info.thumburl)
                    .then(function (r) {
                      if (!r.ok) throw new Error('HTTP ' + r.status);
                      return r.blob();
                    })
                    .then(blobToDataUrl)
                    .then(function (dataUrl) {
                      if (!dataUrl || dataUrl.length < 2048) return null;
                      existing[id] = 1;
                      added.push({
                        id: id,
                        title: cleanTitle(page.title) || 'Museum picture',
                        creator: cleanArtist(info.extmetadata),
                        date: '',
                        medium: '',
                        source: 'Wikimedia Commons (public domain)',
                        sourcePage: info.descriptionurl || '',
                        dataUrl: dataUrl
                      });
                    })
                    .catch(function () { return null; });
                });
              });
              return step;
            }).catch(function () { return null; });
          });
        });
        return chain;
      })
      .then(function () { return museumPut(added); })
      .then(function () {
        return museumAll().then(function (rows) {
          return { ok: true, added: added.length, total: rows.length };
        });
      });
  }

  SSB.museum = {
    all: museumAll,

    api: {
      tatLibrary: function () {
        return museumAll()
          .then(function (rows) {
            var hidden = window.SSB.store.tatHidden();
            return rows.filter(function (r) { return !hidden[r.id]; }).map(function (r) {
              return {
                id: r.id,
                file: r.dataUrl,
                title: r.title || 'Museum picture',
                creator: r.creator || '',
                date: r.date || '',
                medium: r.medium || '',
                source: r.source || 'Wikimedia Commons (public domain)',
                license: 'Public domain',
                sourcePage: r.sourcePage || ''
              };
            });
          })
          .catch(function () { return []; });
      },

      tatOnline: function (opts) {
        if (!window.SSB.online.enabled()) {
          return Promise.resolve({ ok: false, error: 'offline' });
        }
        var want = Math.max(1, Math.min(24, (opts && opts.count) || 10));
        return fetchMuseum(want).catch(function (err) {
          return { ok: false, error: 'network', detail: err.message };
        });
      }
    }
  };
})();
