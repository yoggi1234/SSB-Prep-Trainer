'use strict';

/*
 * Serves the built installers over loopback so they can be downloaded with a
 * normal click. Bound to 127.0.0.1 only - nothing is exposed to the network.
 * No dependencies. Range requests are supported so a big download can resume.
 *
 *   node tools/serve-release.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'release');
const HOST = '127.0.0.1';
const PORT = Number(process.argv[2] || process.env.PORT || 8971);

const TYPES = {
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.yml': 'text/yaml; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

function send(res, code, headers, body) {
  res.writeHead(code, headers);
  res.end(body || undefined);
}

function indexPage() {
  let names = [];
  try {
    names = fs.readdirSync(ROOT).filter((n) => /\.exe$/i.test(n));
  } catch (_) {
    names = [];
  }
  const rows = names
    .map((n) => {
      let mb = '?';
      let when = '';
      try {
        const st = fs.statSync(path.join(ROOT, n));
        mb = (st.size / 1048576).toFixed(1);
        when = st.mtime.toISOString().slice(0, 16).replace('T', ' ');
      } catch (_) {}
      const portable = /portable/i.test(n);
      return (
        '<li><a href="/' +
        encodeURIComponent(n) +
        '">' +
        n +
        '</a><span>' +
        mb +
        ' MB · ' +
        (portable ? 'no install needed' : 'installer') +
        (when ? ' · built ' + when : '') +
        '</span></li>'
      );
    })
    .join('');

  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>SSB Prep Trainer - download</title><style>' +
    'body{font:16px/1.6 system-ui,Segoe UI,sans-serif;background:#0d1120;color:#e7ebf5;margin:0;padding:40px}' +
    'h1{margin:0 0 6px}p{color:#9aa4bd;margin:0 0 26px}' +
    'ul{list-style:none;padding:0;margin:0;max-width:820px}' +
    'li{background:#141a2e;border:1px solid #26304d;border-radius:10px;padding:16px 18px;margin-bottom:12px;' +
    'display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}' +
    'a{color:#7fb2ff;font-weight:600;text-decoration:none;word-break:break-all}a:hover{text-decoration:underline}' +
    'span{color:#8b96b0;font-size:14px}</style></head><body>' +
    '<h1>SSB Prep Trainer</h1>' +
    '<p>Click a file to download it. These links work on this computer only - nothing is uploaded anywhere.</p>' +
    '<ul>' +
    (rows || '<li>No installers found in release/. Build them with: npm run dist</li>') +
    '</ul></body></html>'
  );
}

const server = http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://' + HOST).pathname);
  } catch (_) {
    return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad request\n');
  }

  if (rel === '/' || rel === '/index.html') {
    const body = Buffer.from(indexPage(), 'utf8');
    return send(
      res,
      200,
      { 'Content-Type': TYPES['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store' },
      body
    );
  }

  // Resolve inside release/ and refuse anything that escapes it.
  const target = path.resolve(ROOT, '.' + path.posix.normalize(rel));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return send(res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden\n');
  }

  let st;
  try {
    st = fs.statSync(target);
  } catch (_) {
    return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found\n');
  }
  if (!st.isFile()) return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found\n');

  const name = path.basename(target);
  const base = {
    'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': 'attachment; filename="' + name.replace(/["\r\n]/g, '') + '"',
    'Cache-Control': 'no-store'
  };

  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
  if (m && (m[1] || m[2])) {
    let start = m[1] ? parseInt(m[1], 10) : null;
    let end = m[2] ? parseInt(m[2], 10) : null;
    if (start === null) {
      start = Math.max(0, st.size - (end || 0));
      end = st.size - 1;
    } else if (end === null || end >= st.size) {
      end = st.size - 1;
    }
    if (start > end || start >= st.size) {
      res.writeHead(416, Object.assign({}, base, { 'Content-Range': 'bytes */' + st.size }));
      return res.end();
    }
    res.writeHead(
      206,
      Object.assign({}, base, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Content-Length': end - start + 1
      })
    );
    return fs.createReadStream(target, { start, end }).pipe(res);
  }

  res.writeHead(200, Object.assign({}, base, { 'Content-Length': st.size }));
  fs.createReadStream(target).pipe(res);
});

server.on('error', (err) => {
  console.error('[serve] cannot start: ' + err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('[serve] listening on http://' + HOST + ':' + PORT + '/');
  console.log('[serve] serving ' + ROOT);
});
