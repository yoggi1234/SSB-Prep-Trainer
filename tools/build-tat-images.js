'use strict';

/*
 * Builds the bundled TAT picture library.
 *
 * Source: the Art Institute of Chicago's public API. The museum publishes the
 * image identifier inside the search result itself, so one request yields one
 * usable picture - which matters, because both this museum and The Met ask
 * callers to keep to roughly one image a second and block faster clients.
 * Their published guidance is treated here as a hard ceiling: one request may
 * start per MIN_GAP_MS no matter how many workers run.
 *
 * Only works flagged public domain are used, every picture keeps its source,
 * creator, licence and provenance, and duplicates are removed by content hash
 * so the same picture can never appear twice in the library.
 *
 *   npx electron tools/build-tat-images.js [target] [--width=560] [--quality=70]
 *                                          [--gap=1100] [--concurrency=2]
 *
 * The manifest is rewritten every few pictures, so an interrupted run keeps
 * everything it fetched and can simply be started again.
 */

const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'tat-images');
const OUT_JSON = path.join(ROOT, 'data', 'tat-images.json');
const STATE_JSON = path.join(ROOT, '.tat-build-state.json');

const UA = 'SSB-Prep-Trainer/1.0 (offline SSB practice tool)';
const AIC_UA = 'SSB Prep Trainer (offline SSB practice tool; public-domain images)';
const AIC_API = 'https://api.artic.edu/api/v1';
const AIC_IIIF = 'https://www.artic.edu/iiif/2';

function argNum(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? Number(hit.split('=')[1]) : dflt;
}

const TARGET = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 2000);
const WIDTH = argNum('width', 560);
const QUALITY = argNum('quality', 70);
const CONCURRENCY = argNum('concurrency', 2);
const MIN_GAP_MS = argNum('gap', 1100);

const FIELDS = 'id,title,image_id,artist_display,date_display,medium_display,is_public_domain,department_title';

// Subjects chosen to bring back pictures of people in a situation - the sort of
// ambiguous human scene a TAT story hangs on - rather than ornament or study.
const TERMS = [
  'market scene', 'peasants', 'village life', 'street scene', 'family',
  'children', 'workers', 'harvest', 'fishermen', 'harbour',
  'farm', 'soldiers', 'battle', 'procession', 'festival',
  'interior figures', 'mother and child', 'school', 'travellers', 'caravan',
  'ship', 'storm sea', 'mountain landscape', 'river', 'hunting',
  'camp', 'tent', 'horseman', 'musicians', 'dance',
  'courtyard', 'garden figures', 'tavern', 'kitchen', 'workshop',
  'blacksmith', 'beggar', 'merchant', 'women', 'portrait man',
  'group portrait', 'ceremony', 'funeral', 'wedding', 'shepherd',
  'village', 'city gate', 'bridge', 'road', 'desert',
  'forest', 'winter', 'fire', 'flood', 'pilgrims',
  'monk', 'nobleman', 'servant', 'cottage', 'ruins',
  'temple', 'palace', 'fort', 'watchtower', 'letter',
  'reading', 'seated figure', 'standing figure', 'crowd', 'boy',
  'girl', 'old man', 'old woman', 'two figures', 'three figures',
  'battle scene', 'sailors', 'fisherman boat', 'wagon', 'horse',
  'dog', 'child playing', 'woman sewing', 'man working', 'couple'
];

function log(msg) {
  console.log('[tat] ' + msg);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let gateAt = 0;
async function gate() {
  const now = Date.now();
  const wait = Math.max(0, gateAt - now);
  gateAt = Math.max(now, gateAt) + MIN_GAP_MS;
  if (wait) await sleep(wait);
}

const failures = { search: 0, image: 0, blocked: 0, lastStatus: 0 };
let blockLogs = 0;

async function aicJson(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await gate();
      const res = await fetch(url, {
        headers: { 'AIC-User-Agent': AIC_UA, 'User-Agent': UA, Accept: 'application/json' }
      });
      failures.lastStatus = res.status;
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        failures.blocked++;
        if (blockLogs++ < 3) log('HTTP ' + res.status + ' - slowing down and retrying');
        await sleep(2500 * attempt);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        log('HTTP ' + res.status + ' :: ' + body.slice(0, 140));
        return null;
      }
      return await res.json();
    } catch (err) {
      log('request error: ' + err.message);
      await sleep(1500 * attempt);
    }
  }
  return null;
}

async function aicImage(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await gate();
      const res = await fetch(url, { headers: { 'AIC-User-Agent': AIC_UA, 'User-Agent': UA } });
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        failures.blocked++;
        await sleep(2500 * attempt);
        continue;
      }
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 2048 ? buf : null;
    } catch (err) {
      await sleep(1500 * attempt);
    }
  }
  return null;
}

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_JSON, 'utf8'));
    return {
      manifest: Array.isArray(s.manifest) ? s.manifest : [],
      hashes: new Set(Array.isArray(s.hashes) ? s.hashes : []),
      seen: new Set(Array.isArray(s.seen) ? s.seen : [])
    };
  } catch (_) {
    return { manifest: [], hashes: new Set(), seen: new Set() };
  }
}

function saveState(state) {
  fs.writeFileSync(
    STATE_JSON,
    JSON.stringify(
      { manifest: state.manifest, hashes: Array.from(state.hashes), seen: Array.from(state.seen) },
      null,
      1
    )
  );
  fs.writeFileSync(OUT_JSON, JSON.stringify(state.manifest, null, 1));
}

// Search results carry the image id, so the candidate list is built up front in
// a few dozen requests instead of one request per picture.
async function collectCandidates(wanted, state) {
  const out = [];
  const seenImage = new Set();
  for (let t = 0; t < TERMS.length; t++) {
    if (out.length >= wanted * 2) break;
    const term = TERMS[t];
    for (let page = 1; page <= 3; page++) {
      if (out.length >= wanted * 2) break;
      const url =
        AIC_API +
        '/artworks/search?q=' +
        encodeURIComponent(term) +
        '&query%5Bterm%5D%5Bis_public_domain%5D=true' +
        '&fields=' +
        FIELDS +
        '&limit=100&page=' +
        page;
      const data = await aicJson(url);
      if (!data) {
        failures.search++;
        break;
      }
      const rows = (data.data || []).filter((r) => r && r.is_public_domain === true && r.image_id);
      let added = 0;
      for (const r of rows) {
        const key = 'aic-' + r.id;
        if (seenImage.has(key) || state.seen.has(key)) continue;
        seenImage.add(key);
        out.push(r);
        added++;
      }
      log('search "' + term + '" page ' + page + ' -> ' + rows.length + ' usable, ' + added + ' new (pool ' + out.length + ')');
      if (rows.length < 100) break;
    }
  }
  return out;
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const state = loadState();

  // An interrupted run can leave picture files the manifest never recorded.
  const known = new Set(state.manifest.map((m) => m.file));
  let orphans = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!known.has(f)) {
      try {
        fs.unlinkSync(path.join(OUT_DIR, f));
        orphans++;
      } catch (_) {}
    }
  }
  if (orphans) log('removed ' + orphans + ' unrecorded file(s) from an earlier run');

  log('starting with ' + state.manifest.length + ' pictures, target ' + TARGET);
  if (state.manifest.length >= TARGET) {
    log('already at target - nothing to do.');
    return;
  }

  log('collecting candidates from the Art Institute of Chicago...');
  const candidates = await collectCandidates(TARGET - state.manifest.length, state);
  log('candidate pool: ' + candidates.length);
  if (!candidates.length) {
    log('ABORT: no candidates came back (last HTTP ' + failures.lastStatus + ').');
    return;
  }

  let index = 0;
  let added = 0;
  let rejected = 0;
  let dupes = 0;

  async function worker() {
    while (state.manifest.length < TARGET) {
      const myIndex = index++;
      if (myIndex >= candidates.length) return;
      const rec = candidates[myIndex];

      const url = AIC_IIIF + '/' + rec.image_id + '/full/' + WIDTH + ',/0/default.jpg';
      const buf = await aicImage(url);
      if (!buf) {
        failures.image++;
        continue;
      }

      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (state.hashes.has(sha)) {
        dupes++;
        state.seen.add('aic-' + rec.id);
        continue;
      }

      let out = null;
      let w = 0;
      let h = 0;
      try {
        const img = nativeImage.createFromBuffer(buf);
        if (!img.isEmpty()) {
          const resized = img.resize({ width: WIDTH, quality: 'good' });
          out = resized.toJPEG(QUALITY);
          const size = resized.getSize();
          w = size.width;
          h = size.height;
        }
      } catch (_) {
        out = null;
      }
      if (!out || !out.length) {
        rejected++;
        state.seen.add('aic-' + rec.id);
        continue;
      }

      const file = 'aic-' + rec.id + '.jpg';
      fs.writeFileSync(path.join(OUT_DIR, file), out);

      state.hashes.add(sha);
      state.seen.add('aic-' + rec.id);
      state.manifest.push({
        id: 'aic-' + rec.id,
        file: file,
        source: 'Art Institute of Chicago',
        title: String(rec.title || 'Untitled').slice(0, 180),
        creator: String(rec.artist_display || 'Unknown').split('\n')[0].slice(0, 120),
        date: String(rec.date_display || '').slice(0, 60),
        medium: String(rec.medium_display || '').slice(0, 120),
        department: String(rec.department_title || '').slice(0, 80),
        license: 'Public Domain (CC0 1.0)',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourcePage: 'https://www.artic.edu/artworks/' + rec.id,
        imageApi: url,
        sha256: sha,
        width: w,
        height: h,
        bytes: out.length
      });
      added++;

      if (added % 10 === 0) {
        saveState(state);
        log(
          'saved ' + state.manifest.length + '/' + TARGET +
          '  (rejected ' + rejected + ', duplicates ' + dupes + ', blocked ' + failures.blocked + ')'
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);

  const bytes = state.manifest.reduce((n, m) => n + (m.bytes || 0), 0);
  log('done. pictures: ' + state.manifest.length);
  log('rejected: ' + rejected + '  duplicates skipped: ' + dupes + '  blocked retries: ' + failures.blocked);
  log('request failures - search: ' + failures.search + '  image: ' + failures.image);
  log('library size: ' + (bytes / 1048576).toFixed(1) + ' MB in ' + OUT_DIR);
  if (state.manifest.length < TARGET) log('WARNING: only reached ' + state.manifest.length + ' of ' + TARGET);
}

app
  .whenReady()
  .then(run)
  .catch((err) => log('FAILED: ' + (err && err.stack ? err.stack : err)))
  .then(() => app.exit(0));
