/*
 * The News Digest on the Android build.
 *
 * The desktop compiles the digest with a Python engine in a separate process.
 * A WebView cannot run that, so this module is the phone's whole digest: it
 * collects today's stories from free feeds, groups them into the twelve
 * sections, caches the edition, and guarantees that opening the tab always
 * shows a real edition instead of a dead form:
 *
 *   live feeds -> last edition saved on this phone -> bundled reference edition
 *
 * Transport (RSS, JSON, timeouts) is in net.js; the record format and the
 * fallback order are here, because only the digest cares about them.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  var net = window.SSB.net;
  var store = window.SSB.store;

  // One page per section, in the same order as the desktop digest. The device
  // reads these from Google News through the native HTTP layer; the browser's
  // Wikipedia edition keeps its own editorial sections instead of forcing global
  // stories into these India-centric buckets - a word-matching classifier put
  // "West Bank" under Financial and a prize win under War.
  var DIGEST_SECTIONS = [
    { key: 'national', label: 'National', query: 'India government Parliament policy' },
    { key: 'international', label: 'International', query: 'world news United Nations summit' },
    { key: 'regional', label: 'Regional (States)', query: 'India state government news' },
    { key: 'defence', label: 'Defence', query: 'Indian Armed Forces defence ministry' },
    { key: 'politics', label: 'Politics', query: 'India politics election' },
    { key: 'financial', label: 'Financial', query: 'Sensex rupee RBI markets' },
    { key: 'economic', label: 'Economic', query: 'India economy growth exports' },
    { key: 'neighbour', label: 'Neighbouring Countries', query: 'Pakistan China Nepal Bangladesh Sri Lanka' },
    { key: 'science', label: 'Science', query: 'science research ISRO space' },
    { key: 'geopolitical', label: 'Geopolitical', query: 'geopolitics Indo-Pacific strategy' },
    { key: 'misc', label: 'Miscellaneous', query: 'India appointments awards exercise' },
    { key: 'war', label: 'War Section', query: 'war conflict military operation' }
  ];

  function digestPhonePack(rec, cached, detail) {
    var out = {
      ok: true,
      sections: (rec.sections || []).map(function (s) {
        return {
          key: s.key,
          label: s.label,
          items: (s.items || []).map(function (it) {
            return { title: it.title || it.text || '', link: it.link || '', source: it.source || '', date: it.date || '' };
          })
        };
      }),
      at: rec.at || 0,
      checkedOn: net.isoDay(rec.at),
      source: rec.source || 'Google News (on the phone)',
      cached: !!cached
    };
    if (detail === 'offline') out.offline = true;
    else if (detail) out.detail = detail;
    return out;
  }

  // The reference edition ships inside the APK: twelve sections of standing
  // context written into data/digest-offline.json. It is deliberately not
  // today's news, and the screen says so, but it means the digest tab always
  // has a real edition to show when there is no connection and no saved one.
  var refEdition = null;
  function digestReference() {
    if (refEdition) return Promise.resolve(refEdition);
    return fetch('data/digest-offline.json')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var pack = digestPhonePack({ at: 0, sections: data.sections || [] }, true);
        pack.reference = true;
        pack.edition = data.edition || 'reference';
        pack.note = data.note || '';
        pack.source = 'Bundled reference edition';
        pack.checkedOn = '';
        refEdition = pack;
        return pack;
      })
      .catch(function () { return null; });
  }

  // Whatever happens, answer with an edition: today's if the feeds arrived,
  // yesterday's if a copy was saved, the bundled reference if neither exists.
  // This is what stops the tab dead-ending on "turn online lookup on".
  function digestFallback(cached, detail) {
    if (cached && cached.sections && cached.sections.length) {
      return Promise.resolve(digestPhonePack(cached, true, detail));
    }
    return digestReference().then(function (ref) {
      if (ref) {
        if (detail && detail !== 'offline') ref.detail = detail;
        return ref;
      }
      return { ok: false, error: detail || 'network' };
    });
  }

  /* ---------------------------------------- browser edition (no native HTTP) */

  // Live edition for browsers: Wikipedia's Current Events portal. It is the one
  // genuinely current news source that sends Access-Control-Allow-Origin, needs
  // no key and no proxy, and its day pages are small structured wikitext.
  var CE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  // Wiki markup -> one readable line: links keep their label, citations keep the
  // source name in brackets, templates and refs are dropped.
  function ceText(s) {
    return String(s)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')
      .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\s*\(([^)]*)\)\]/g, ' ($1)')
      .replace(/\[https?:\/\/[^\s\]]+\]/g, ' ')
      .replace(/\{\{[^{}]*\}\}/g, ' ')
      .replace(/'''?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // A day page looks like "*[[Topic]]" for a subject, then "**"/"***" lines with
  // the sentences themselves.
  function ceItems(wikitext) {
    var items = [];
    var topic = '';
    String(wikitext).split('\n').forEach(function (line) {
      var m = /^(\*+)\s*(.+)$/.exec(line);
      if (!m) return;
      var raw = m[2].trim();
      var text = ceText(raw);
      if (!text) return;
      // Every real story ends with a citation like "[https://… (Reuters)]"; the
      // subject and sub-subject lines are bare links. That is what tells them apart
      // (a comma-separated link list such as "Yemeni civil war, al-Qaeda insurgency"
      // is a heading, not a sentence).
      if (!/\[https?:\/\//.test(raw)) {
        if (m[1].length === 1) topic = text;
        return;
      }
      if (text.length < 40) return;
      items.push({ title: text, topic: topic });
    });
    return items;
  }

  function ceDay(offsetDays) {
    var d = new Date(Date.now() - offsetDays * 86400000);
    var page =
      'Portal:Current_events/' + d.getUTCFullYear() + '_' + CE_MONTHS[d.getUTCMonth()] + '_' + d.getUTCDate();
    return net
      .getJson(
        'https://en.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent(page) +
          '&prop=wikitext&format=json&origin=*',
        9000
      )
      .then(
        function (body) {
          var text = body && body.parse && body.parse.wikitext && body.parse.wikitext['*'];
          return text ? ceItems(text) : [];
        },
        function () { return []; }
      );
  }

  // Groups the day's stories under the portal's own subject headings, in the
  // order they appear. No keyword guessing, so a story is never filed under a
  // section it has nothing to do with.
  function topicSections(items) {
    var out = [];
    items.forEach(function (it) {
      var label = it.topic || 'Current events';
      var sec = null;
      for (var i = 0; i < out.length; i++) {
        if (out[i].label === label) { sec = out[i]; break; }
      }
      if (!sec) {
        if (out.length >= 12) return;
        sec = { key: 'topic-' + out.length, label: label, items: [] };
        out.push(sec);
      }
      if (sec.items.length < 4) sec.items.push({ title: it.title, link: '' });
    });
    return out.filter(function (s) { return s.items.length; });
  }

  function currentEventsLive() {
    // Today's page fills up during the day, so yesterday is merged in behind it.
    return Promise.all([ceDay(0), ceDay(1)]).then(function (days) {
      var seen = {};
      var items = [];
      days.forEach(function (list) {
        list.forEach(function (it) {
          var key = it.title.slice(0, 60).toLowerCase();
          if (seen[key]) return;
          seen[key] = 1;
          items.push(it);
        });
      });
      if (!items.length) throw new Error('empty');
      return topicSections(items);
    });
  }

  /* ------------------------------------------------------- reading a paper */

  // Lines rebuilt from pdf.js text runs by height on the page; a wide gap is a blank line,
  // which is what separates stories, and \f separates pages, as pdftotext gives the desktop.
  function pdfToText(lib, buf) {
    return lib.getDocument({ data: buf, isEvalSupported: false }).promise.then(function (doc) {
      var pages = [];
      var next = function (n) {
        if (n > doc.numPages) return pages.join('\f');
        return doc.getPage(n).then(function (p) { return p.getTextContent(); }).then(function (tc) {
          var lines = [];
          var lastY = null;
          var cur = '';
          tc.items.forEach(function (it) {
            var y = it.transform[5];
            var h = it.height || 10;
            if (lastY !== null && Math.abs(y - lastY) > h * 0.5) {
              lines.push(cur);
              cur = '';
              if (Math.abs(y - lastY) > h * 1.8) lines.push('');
            }
            cur += it.str;
            lastY = y;
          });
          lines.push(cur);
          pages.push(lines.join('\n'));
          return next(n + 1);
        });
      };
      return next(1);
    });
  }

  /* ------------------------------------------------------------ PDF saving */

  function base64(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  // A WebView cannot download a file, so the PDF goes through the Capacitor
  // Filesystem plugin (a copy kept in Documents), then Android's "Open with"
  // list of PDF apps (FileOpener). With no PDF app installed, the share sheet
  // is offered instead.
  var LIBRARY = 'ssb-pdf-library';

  function shareable(name) {
    var fsys = ((window.Capacitor && window.Capacitor.Plugins) || {}).Filesystem;
    return fsys.readFile({ path: 'news-pdfs/' + name, directory: 'DATA' }).then(function (r) {
      return fsys.writeFile({ path: name, data: r.data, directory: 'CACHE' });
    }).then(function (res) { return res.uri; });
  }

  // The app's own storage needs no permission on any Android version, and the copy
  // stays readable after a reinstall of the same app's data, unlike a shared folder.
  function keepInApp(name, data, pages) {
    var fsys = (window.Capacitor && window.Capacitor.Plugins || {}).Filesystem;
    if (!fsys) return Promise.resolve();
    return fsys.writeFile({ path: 'news-pdfs/' + name, data: data, directory: 'DATA', recursive: true }).then(function () {
      var list = store.readJson(LIBRARY, []).filter(function (x) { return x.name !== name; });
      list.unshift({ name: name, pages: pages, at: Date.now() });
      store.writeJson(LIBRARY, list);
    });
  }

  function savePdf(name, bytes, pages) {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var fsys = plugins.Filesystem;
    var share = plugins.Share;
    var opener = plugins.FileOpener;
    if (!fsys) {
      // Desktop browser (tests): a normal download.
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return Promise.resolve({ where: 'Downloads' });
    }
    var data = base64(bytes);
    var kept = fsys.writeFile({ path: name, data: data, directory: 'DOCUMENTS' })
      .then(function () { return 'Documents and inside the app'; }, function () { return 'inside the app'; });
    return kept.then(function (where) {
      return keepInApp(name, data, pages).then(function () { return { where: where }; });
    });
  }

  /* ------------------------------------------------------------------- api */

  // Nothing here can succeed: the engine is a Python process the desktop owns.
  // They still answer "unsupported" instead of throwing so a screen shared with
  // the desktop keeps rendering and can say why.
  var desktopOnly = { ok: false, error: 'unsupported' };

  SSB.digest = {
    api: {
      // The Python engine cannot run in a WebView, but the thing the person
      // actually wants - today's current affairs, twelve sections - can be built
      // here from the same free feeds. It is cached, so a lost connection still
      // opens yesterday's edition instead of a dead form.
      digestOnPhone: function (opts) {
        var force = !!(opts && opts.force);
        var state = (opts && opts.state) || '';
        var cached = store.readJson('ssb-digest-phone', null);
        if (!force && cached && cached.sections && (cached.state || '') === state && Date.now() - (cached.at || 0) < 20 * 60 * 1000) {
          return Promise.resolve(digestPhonePack(cached, true));
        }
        if (!window.SSB.online.enabled()) {
          return digestFallback(cached, 'offline');
        }
        // Device: Google News through the native HTTP layer. Browser: the Wikipedia
        // Current Events portal, which is the transport that survives CSP and CORS.
        var live = net.nativeHttp()
          ? Promise.all(
              DIGEST_SECTIONS.concat(state ? [{ key: 'state', label: state + ' News', query: '"' + state + '" government OR "chief minister" OR cabinet OR development' }] : []).map(function (sec) {
                // when:2d keeps evergreen explainer pages out of a daily edition.
                return net.googleNews(sec.query + ' when:2d', 4).then(
                  function (rows) { return { key: sec.key, label: sec.label, items: rows.slice(0, 4) }; },
                  function () { return { key: sec.key, label: sec.label, items: [] }; }
                );
              })
            )
          : currentEventsLive();
        return live
          .then(function (sections) {
            var total = sections.reduce(function (n, s) { return n + s.items.length; }, 0);
            if (!total) throw new Error('empty');
            var rec = {
              state: state,
              at: Date.now(),
              source: net.nativeHttp() ? 'Google News (on the phone)' : 'Wikipedia Current Events',
              sections: sections
            };
            store.writeJson('ssb-digest-phone', rec);
            return digestPhonePack(rec, false);
          })
          .catch(function (err) {
            return digestFallback(cached, err.message);
          });
      },

      // The 12-page colour PDF, made the way the desktop's news-digest engine
      // makes it (edition.js + pdf.js), saved to the phone's Documents folder and
      // offered to the share sheet. progress(text, done, total) reports each step.
      // The follow-up threads this phone has built, on top of the set copied from
      // the PC when the APK was made.
      timelineLoad: function () {
        var own = store.readJson('ssb-timeline', []);
        return fetch('data/timeline-seed.json')
          .then(function (r) { return r.ok ? r.json() : { threads: [] }; })
          .catch(function () { return { threads: [] }; })
          .then(function (seed) {
            var have = {};
            own.forEach(function (t) { have[t.events[0].date + t.events[0].headline] = 1; });
            return own.concat((seed.threads || []).filter(function (t) { return !have[t.events[0].date + t.events[0].headline]; }));
          });
      },

      digestLibrary: function () {
        return Promise.resolve(store.readJson(LIBRARY, []));
      },

      // Draws a saved edition inside the app. The index links work: a tap scrolls to the page.
      digestShowPdf: function (name, holder) {
        var fsys = (window.Capacitor && window.Capacitor.Plugins || {}).Filesystem;
        return Promise.all([import('./lib/pdf.min.js'), fsys.readFile({ path: 'news-pdfs/' + name, directory: 'DATA' })]).then(function (r) {
          var lib = r[0];
          lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
          var raw = atob(r[1].data);
          var bytes = new Uint8Array(raw.length);
          for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          return lib.getDocument({ data: bytes, isEvalSupported: false }).promise.then(function (doc) {
            var boxes = [];
            var draw = function (n) {
              if (n > doc.numPages) return null;
              return doc.getPage(n).then(function (page) {
                var cssW = holder.clientWidth || window.innerWidth;
                var scale = cssW / page.getViewport({ scale: 1 }).width;
                var ratio = Math.min(window.devicePixelRatio || 1, 2);
                var view = page.getViewport({ scale: scale * ratio });
                var box = document.createElement('div');
                box.className = 'pdf-page';
                var canvas = document.createElement('canvas');
                canvas.width = view.width;
                canvas.height = view.height;
                holder.appendChild(box);
                boxes[n - 1] = box;
                return page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise.then(function () {
                  return new Promise(function (done) { canvas.toBlob(done, 'image/jpeg', 0.9); });
                }).then(function (blob) {
                  var img = document.createElement('img');
                  img.alt = 'Page ' + n;
                  img.src = URL.createObjectURL(blob);
                  img.style.width = cssW + 'px';
                  box.appendChild(img);
                  canvas.width = 0;
                  page.cleanup();
                  return page.getAnnotations();
                }).then(function (notes) {
                  notes.filter(function (a) { return a.subtype === 'Link' && (a.dest || /^https?:\/\//.test(a.url || '')); }).forEach(function (a) {
                    var rect = view.convertToViewportRectangle(a.rect);
                    var link = document.createElement('button');
                    link.className = 'pdf-link';
                    link.setAttribute('aria-label', 'Go to page');
                    link.style.cssText = 'left:' + Math.min(rect[0], rect[2]) / ratio + 'px;top:' + Math.min(rect[1], rect[3]) / ratio + 'px;width:' +
                      Math.abs(rect[2] - rect[0]) / ratio + 'px;height:' + Math.abs(rect[3] - rect[1]) / ratio + 'px';
                    link.addEventListener('click', function () {
                      if (!a.dest) {
                        window.api.openExternal(a.url);
                        return;
                      }
                      Promise.resolve(typeof a.dest === 'string' ? doc.getDestination(a.dest) : a.dest).then(function (dest) {
                        return doc.getPageIndex(dest[0]);
                      }).then(function (at) { if (boxes[at]) boxes[at].scrollIntoView(); });
                    });
                    box.appendChild(link);
                  });
                  return draw(n + 1);
                });
              });
            };
            return draw(1);
          });
        }).then(function () { return { ok: true }; }, function (err) { return { ok: false, detail: err && err.message }; });
      },

      // The other PDF apps, for sharing or printing.
      // Other apps cannot read the app's own folder, so a copy goes to the cache, which they can.
      digestShareSaved: function (name) {
        var p = (window.Capacitor && window.Capacitor.Plugins) || {};
        return shareable(name).then(function (uri) {
          return p.Share.share({ title: name, files: [uri], dialogTitle: 'Share the digest' });
        }).then(function () { return { ok: true }; }, function (err) { return { ok: false, detail: err && err.message }; });
      },

      digestOpenSaved: function (name) {
        var p = (window.Capacitor && window.Capacitor.Plugins) || {};
        return shareable(name).then(function (uri) {
          return p.FileOpener.open({ filePath: uri, contentType: 'application/pdf', openWithDefault: false });
        }).then(function () { return { ok: true }; }, function (err) { return { ok: false, detail: err && err.message }; });
      },

      // A copy in the phone's Documents folder, where the Files app finds it.
      digestSaveToPhone: function (name) {
        var fsys = ((window.Capacitor && window.Capacitor.Plugins) || {}).Filesystem;
        return fsys.readFile({ path: 'news-pdfs/' + name, directory: 'DATA' }).then(function (r) {
          return fsys.writeFile({ path: name, data: r.data, directory: 'DOCUMENTS' });
        }).then(function () { return { ok: true, where: 'Documents' }; }, function (err) { return { ok: false, detail: err && err.message }; });
      },

      // Reads newspapers the person picked. A file already picked, by content, is not read twice.
      digestReadPapers: function (files, already) {
        var have = {};
        (already || []).forEach(function (p) { have[p.sha] = p.name; });
        var out = [];
        var dup = [];
        return Promise.all([import('./lib/pdf.min.js')]).then(function (m) {
          var lib = m[0];
          lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
          return files.reduce(function (chain, f) {
            return chain.then(function () { return f.arrayBuffer(); }).then(function (buf) {
              return crypto.subtle.digest('SHA-256', buf).then(function (d) {
                var sha = Array.prototype.map.call(new Uint8Array(d), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
                if (have[sha]) {
                  dup.push(f.name);
                  return null;
                }
                have[sha] = f.name;
                return pdfToText(lib, buf).then(function (text) { out.push({ name: f.name, sha: sha, text: text }); });
              });
            });
          }, Promise.resolve());
        }).then(function () { return { ok: true, papers: out, duplicates: dup }; }, function (err) {
          return { ok: false, detail: err && err.message };
        });
      },

      digestPdf: function (progress, opts) {
        var offline = !window.SSB.online.enabled();
        if (offline && !(opts && opts.pdfs && opts.pdfs.length)) return Promise.resolve({ ok: false, error: 'offline' });
        var io = {
          fetchText: net.getText,
          read: store.readJson,
          write: store.writeJson
        };
        var data = {};
        return Promise.all(['glossary', 'hardwords', 'facts', 'wars'].map(function (k) {
          return fetch('data/digest/' + k + '.json').then(function (r) { return r.json(); }).then(function (j) { data[k] = j; });
        }))
          .then(function () { return SSB.edition.collect(io, data, { progress: progress, state: opts && opts.state, pdfs: opts && opts.pdfs, ask: opts && opts.ask, noWeb: offline }); })
          .then(function (draft) {
            if (progress) progress('Drawing the PDF', 12, 12);
            var bytes = SSB.pdf.render(draft);
            var name = 'Daily_News_Digest_' + draft.date + '.pdf';
            return savePdf(name, bytes, draft.pages.length).then(function (saved) {
              SSB.edition.record(io, draft);
              return { ok: true, name: name, where: saved.where, pages: draft.pages.length, headlines: draft.headlines,
                articles: draft.articles, war: draft.war.name, papers: draft.papers };
            });
          })
          .catch(function (err) {
            return { ok: false, error: err && err.message === 'no-news' ? 'network' : 'failed', detail: err && err.message };
          });
      },

      digestStatus: function () {
        return Promise.resolve({ ok: false, error: 'unsupported', unsupported: true, python: null });
      },
      digestRun: function () {
        return Promise.resolve(desktopOnly);
      },
      digestCancel: function () {
        return Promise.resolve({ ok: false });
      },
      digestFiles: function () {
        return Promise.resolve([]);
      },
      digestOpen: function () {
        return Promise.resolve({ ok: false });
      },
      digestPickPdfs: function () {
        return Promise.resolve([]);
      },
      digestConfigGet: function () {
        return Promise.resolve({});
      },
      digestConfigSet: function () {
        return Promise.resolve({ ok: true });
      },
      onDigestLog: function () {
        return function () {};
      },
      onDigestDone: function () {
        return function () {};
      },
      onDigestStarted: function () {
        return function () {};
      }
    }
  };
})();
