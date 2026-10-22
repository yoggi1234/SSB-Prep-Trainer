'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SMOKE = process.argv.includes('--smoke');
const SMOKE_OUT = process.env.SSB_SMOKE_OUT || path.join(ROOT, 'screenshots');
const SMOKE_EXPORT = path.join(os.tmpdir(), 'ssb-smoke-export.txt');
const SMOKE_IMG_DIR = path.join(os.tmpdir(), 'ssb-smoke-images');

/* ------------------------------------------------- smoke instrumentation */
// Only under --smoke. The suite has to prove the real file-writing paths and
// the external-link guard work, but a machine cannot click a native dialog, and
// opening a real browser mid-test would be wrong. Both are recorded instead.
const smokeSheet = []; // urls handed to shell.openExternal
let smokePickFiles = []; // what the folder dialog "chooses"

if (SMOKE) {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: smokePickFiles.slice() });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: SMOKE_EXPORT });
  shell.openExternal = async (url) => {
    smokeSheet.push(String(url));
  };
}

// A real, decodable 24-bit BMP - no image library needed.
function makeBmp(w, h, seed) {
  const rowSize = (w * 3 + 3) & ~3;
  const size = 54 + rowSize * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0, 'ascii');
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(rowSize * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = 54 + y * rowSize + x * 3;
      b[o] = (30 + seed * 20 + x) & 255;
      b[o + 1] = (90 + seed * 10 + y) & 255;
      b[o + 2] = (170 - seed * 7) & 255;
    }
  }
  return b;
}

function makeSmokeImages() {
  try {
    fs.mkdirSync(SMOKE_IMG_DIR, { recursive: true });
  } catch (_) {}
  const out = [];
  for (let i = 1; i <= 11; i++) {
    const p = path.join(SMOKE_IMG_DIR, 'smoke-scene-' + String(i).padStart(2, '0') + '.bmp');
    try {
      fs.writeFileSync(p, makeBmp(320, 220, i));
      out.push(p);
    } catch (err) {
      console.error('[smoke] could not write test image:', err.message);
    }
  }
  return out;
}

let mainWindow = null;
let store = null;
let storePath = null;
let blockerId = null;

/* ------------------------------------------------------------------ store */

function defaults() {
  return {
    version: 1,
    config: {
      watPerWordSec: 15,
      srtTotalMin: 30,
      tatViewSec: 30,
      tatWriteSec: 240,
      shuffleWAT: false,
      shuffleSRT: true,
      tatSource: 'classic',
      // Mist (dark) is the shipped palette, read out of the Windows 11 Mist
      // theme; "alpine" keeps the sage paper one. Applied in the renderer by
      // applyTheme(), and used here so the window itself never flashes white.
      theme: 'mist',
      // A user preference layered on top of the OS "reduce motion" setting:
      // true skips the tile orbit, the lecturette slides and the paging hops.
      reduceMotion: false,
      // Chimes at the start, the writing phase and the end are synthesised in
      // the renderer; this only decides whether they play.
      soundOn: true,
      hideTatPromptWhileWriting: true,
      // On by default for fresh installs, but every feature falls back to
      // bundled or cached material when the connection drops.
      onlineEnabled: true,
      // Your own WAT sentences, keyed by word: {natural, positive, leadership,
      // factual, general}. Written on the result screen, kept on this machine.
      watSentences: {}
    },
    attempts: [],
    tatImages: [],
    // Pictures removed from the TAT sources. Kept (with a copy of the file) so
    // a wrong picture can be put back instead of being lost.
    tatBin: [],
    // Pictures deleted for good. The id stays here so a bundled picture cannot
    // reappear in the test on the next launch.
    tatGone: []
  };
}

function getStore() {
  if (store) return store;
  storePath = path.join(app.getPath('userData'), 'ssb-prep-store.json');
  let loaded = null;
  try {
    loaded = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (_) {
    loaded = null;
  }
  const base = defaults();
  store = Object.assign(base, loaded || {});
  store.config = Object.assign(base.config, (loaded && loaded.config) || {});
  store.attempts = Array.isArray(store.attempts) ? store.attempts : [];
  store.tatImages = Array.isArray(store.tatImages) ? store.tatImages : [];
  store.tatBin = Array.isArray(store.tatBin) ? store.tatBin : [];
  store.tatGone = Array.isArray(store.tatGone) ? store.tatGone : [];
  return store;
}

function persist() {
  const data = getStore();
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[store] write failed:', err.message);
    return false;
  }
}

function readData() {
  const out = {};
  for (const key of ['wat', 'srt', 'tat']) {
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, key + '.json'), 'utf8'));
    } catch (err) {
      console.error('[data] could not read data/' + key + '.json:', err.message);
      out[key] = { sets: [] };
    }
  }
  return out;
}

/* ----------------------------------------------------------------- window */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 940,
    minHeight: 640,
    show: false,
    // The window behind the page takes the chosen palette's ground, so the
    // first frame is already the right colour instead of a white flash.
    backgroundColor: getStore().config.theme === 'alpine' ? '#e8f1ec' : '#0e1a15',
    title: 'SSB Prep Trainer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // A timed test must keep ticking even when the window is not focused.
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (SMOKE) setTimeout(runSmoke, 700);
  });

  mainWindow.on('closed', () => {
    appLog('window', 'closed');
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* -------------------------------------------------------------------- ipc */

ipcMain.handle('data:load', () => readData());

ipcMain.handle('config:get', () => getStore().config);

ipcMain.handle('config:set', (_e, patch) => {
  Object.assign(getStore().config, patch || {});
  persist();
  appLog('config', 'set', patch);
  return getStore().config;
});

ipcMain.handle('attempts:list', () => getStore().attempts);

ipcMain.handle('attempt:add', (_e, attempt) => {
  const data = getStore();
  const record = Object.assign(
    {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7),
      savedAt: new Date().toISOString()
    },
    attempt || {}
  );
  data.attempts.unshift(record);
  if (data.attempts.length > 300) data.attempts.length = 300;
  persist();
  appLog('attempt', 'saved', {
    test: record.test,
    set: record.setName,
    total: record.total,
    answered: record.answered,
    reason: record.reason
  });
  return record;
});

ipcMain.handle('attempt:delete', (_e, id) => {
  const data = getStore();
  data.attempts = data.attempts.filter((a) => a.id !== id);
  persist();
  return data.attempts;
});

ipcMain.handle('attempts:clear', () => {
  getStore().attempts = [];
  persist();
  return [];
});

ipcMain.handle('tat:images', () =>
  getStore().tatImages.filter((p) => !binnedKeys().has(String(p)))
);

ipcMain.handle('tat:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select your TAT practice pictures',
    buttonLabel: 'Add pictures',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
  });
  if (res.canceled) return getStore().tatImages;
  const merged = getStore().tatImages.slice();
  for (const p of res.filePaths) if (!merged.includes(p)) merged.push(p);
  getStore().tatImages = merged;
  persist();
  appLog('tat', 'pictures added', { total: merged.length });
  return merged;
});

ipcMain.handle('tat:clearImages', () => {
  getStore().tatImages = [];
  persist();
  return [];
});

/* -------------------------------------------------------------- TAT bin */
// A picture that comes out wrong should be removable without losing it. The
// record goes into the store, and for a bundled picture a copy of the file is
// put in the user folder - so the bin can show it, a restore still works after
// a rebuild, and "delete forever" removes the only copy the app made.
function tatBin() {
  const s = getStore();
  s.tatBin = Array.isArray(s.tatBin) ? s.tatBin : [];
  return s.tatBin;
}

function tatBinDir() {
  return path.join(app.getPath('userData'), 'tat-bin');
}

// Binned pictures are hidden from every TAT source by id (bundled) or by path
// (the user's own folder).
function binnedKeys() {
  const set = new Set();
  for (const b of tatBin()) {
    if (b.id) set.add(String(b.id));
    if (b.file) set.add(String(b.file));
  }
  const gone = Array.isArray(getStore().tatGone) ? getStore().tatGone : [];
  for (const g of gone) {
    if (g.id) set.add(String(g.id));
    if (g.file) set.add(String(g.file));
  }
  return set;
}

// A permanent delete keeps the id (not the picture) so the bundled copy that
// ships inside the app cannot walk back into the test after a restart.
function rememberGone(rec) {
  const s = getStore();
  s.tatGone = Array.isArray(s.tatGone) ? s.tatGone : [];
  if (!s.tatGone.some((g) => g.id === rec.id)) {
    s.tatGone.push({ id: rec.id, file: rec.file || '', title: rec.title || '', at: new Date().toISOString() });
  }
}

// "Brought back" from the bin screen: forget the permanent deletes too.
ipcMain.handle('tat:resetGone', () => {
  getStore().tatGone = [];
  persist();
  return [];
});

ipcMain.handle('tat:goneCount', () => (Array.isArray(getStore().tatGone) ? getStore().tatGone.length : 0));

ipcMain.handle('tat:goneList', () => (Array.isArray(getStore().tatGone) ? getStore().tatGone : []));

// One permanent delete undone on its own. "Delete forever" is a decision, not a
// trap: the bin lists what was removed and this puts a single picture back.
ipcMain.handle('tat:resurrect', (_e, id) => {
  const key = String(id || '');
  const s = getStore();
  s.tatGone = (Array.isArray(s.tatGone) ? s.tatGone : []).filter((g) => g.id !== key);
  persist();
  appLog('tat', 'permanent delete undone', { id: key });
  return s.tatGone;
});

ipcMain.handle('tat:bin', () => tatBin());

ipcMain.handle('tat:remove', (_e, payload) => {
  const p = payload || {};
  const id = String(p.id || '');
  if (!id) return { ok: false, error: 'no-id' };
  const bin = tatBin();
  if (bin.some((b) => b.id === id)) return { ok: true, bin: bin, added: false };

  const kind = String(p.kind || 'library');
  const file = String(p.file || '');
  let saved = '';
  if (file && kind !== 'mine') {
    try {
      fs.mkdirSync(tatBinDir(), { recursive: true });
      const ext = path.extname(file) || '.jpg';
      saved = path.join(tatBinDir(), id.replace(/[^A-Za-z0-9._-]/g, '_') + ext);
      fs.copyFileSync(file, saved);
    } catch (err) {
      console.error('[tat] could not copy picture into the bin:', err.message);
      saved = '';
    }
  }

  bin.push({
    id: id,
    kind: kind,
    title: String(p.title || 'TAT picture').slice(0, 200),
    file: file,
    saved: saved,
    source: String(p.source || '').slice(0, 120),
    removedAt: new Date().toISOString()
  });
  persist();
  appLog('tat', 'picture moved to the bin', { id: id, kind: kind });
  return { ok: true, bin: bin, added: true };
});

ipcMain.handle('tat:restore', (_e, id) => {
  const key = String(id || '');
  const bin = tatBin();
  const at = bin.findIndex((b) => b.id === key);
  if (at < 0) return { ok: false, error: 'not-in-bin', bin: bin };
  const rec = bin.splice(at, 1)[0];
  // The copy in the bin folder is no longer needed once the picture is back.
  if (rec.saved) {
    try {
      fs.unlinkSync(rec.saved);
    } catch (_) {}
  }
  persist();
  appLog('tat', 'picture restored', { id: key });
  return { ok: true, bin: bin };
});

ipcMain.handle('tat:purge', (_e, id) => {
  const key = String(id || '');
  const bin = tatBin();
  const at = bin.findIndex((b) => b.id === key);
  if (at < 0) return { ok: false, error: 'not-in-bin', bin: bin };
  const rec = bin.splice(at, 1)[0];
  if (rec.saved) {
    try {
      fs.unlinkSync(rec.saved);
    } catch (_) {}
  }
  rememberGone(rec);
  persist();
  appLog('tat', 'picture deleted for good', { id: key });
  return { ok: true, bin: bin };
});

ipcMain.handle('tat:emptyBin', () => {
  for (const rec of tatBin()) {
    if (rec.saved) {
      try {
        fs.unlinkSync(rec.saved);
      } catch (_) {}
    }
    rememberGone(rec);
  }
  getStore().tatBin = [];
  persist();
  appLog('tat', 'bin emptied');
  return [];
});

/* --------------------------------------------------------- TAT pictures */
// The bundled library is built by tools/build-tat-images.js. Every record
// keeps its museum source and licence, and the build removes duplicates by
// content hash, so the same picture can never appear twice in the library.
const TAT_DIR = path.join(DATA_DIR, 'tat-images');
const TAT_MANIFEST = path.join(DATA_DIR, 'tat-images.json');

function readTatManifest() {
  try {
    const list = JSON.parse(fs.readFileSync(TAT_MANIFEST, 'utf8'));
    if (!Array.isArray(list)) return [];
    return list.filter((r) => r && r.file && fs.existsSync(path.join(TAT_DIR, r.file)));
  } catch (err) {
    console.error('[tat] manifest unavailable:', err.message);
    return [];
  }
}

function writeTatManifest(list) {
  try {
    fs.writeFileSync(TAT_MANIFEST, JSON.stringify(list, null, 1), 'utf8');
  } catch (err) {
    console.error('[tat] manifest write failed:', err.message);
  }
}

function tatItem(rec) {
  return {
    id: rec.id,
    file: path.join(TAT_DIR, rec.file),
    title: rec.title || 'Untitled',
    creator: rec.creator || 'Unknown',
    date: rec.date || '',
    medium: rec.medium || '',
    source: rec.source || 'Art Institute of Chicago',
    license: rec.license || 'Public Domain (CC0 1.0)',
    sourcePage: rec.sourcePage || '',
    sha256: rec.sha256 || ''
  };
}

ipcMain.handle('tat:library', () => {
  const hidden = binnedKeys();
  return readTatManifest()
    .filter((r) => !hidden.has(String(r.id)))
    .map(tatItem);
});

/* ------------------------------------------------ classic TAT pictures */
// A curated set made from the CarePatron TAT PDF plus the user's own TAT
// folder, de-duplicated by perceptual hash at build time. It sits beside the
// museum library and is the default source when it is present.
const TAT_CLASSIC_DIR = path.join(DATA_DIR, 'tat-classic');
const TAT_CLASSIC_JSON = path.join(DATA_DIR, 'tat-classic.json');
let tatClassicCache = null;

function readTatClassic() {
  if (tatClassicCache) return tatClassicCache;
  try {
    const list = JSON.parse(fs.readFileSync(TAT_CLASSIC_JSON, 'utf8'));
    tatClassicCache = (Array.isArray(list) ? list : [])
      .filter((r) => r && r.file && fs.existsSync(path.join(TAT_CLASSIC_DIR, r.file)))
      .map((r) => ({
        id: r.id,
        file: path.join(TAT_CLASSIC_DIR, r.file),
        title: r.title || 'Classic TAT picture',
        creator: 'Thematic Apperception Test plate',
        date: '',
        medium: '',
        source: r.source || 'Classic TAT set',
        license: r.license || 'User-supplied practice picture',
        sourcePage: '',
        sha256: r.sha256 || '',
        classic: true
      }));
  } catch (err) {
    console.error('[tat] classic set unavailable:', err.message);
    tatClassicCache = [];
  }
  return tatClassicCache;
}

ipcMain.handle('tat:classic', () => {
  const hidden = binnedKeys();
  return readTatClassic().filter((r) => !hidden.has(String(r.id)));
});

const AIC_API = 'https://api.artic.edu/api/v1';
const AIC_IIIF = 'https://www.artic.edu/iiif/2';
const AIC_FIELDS =
  'id,title,image_id,artist_display,date_display,medium_display,is_public_domain,department_title';
const AIC_UA = 'SSB Prep Trainer/1.0 (public-domain picture practice)';
const AIC_TERMS = [
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
  'temple', 'palace', 'fort', 'watchtower', 'reading',
  'seated figure', 'standing figure', 'crowd', 'boy',
  'girl', 'old man', 'old woman', 'two figures', 'three figures',
  'battle scene', 'sailors', 'fisherman boat', 'wagon', 'horse',
  'child playing', 'woman sewing', 'man working', 'couple'
];

function shuffleCopy(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// Fetches a small batch of new public-domain pictures from the Art Institute
// of Chicago. One request starts per 1.1 seconds: the museum asks callers to
// stay near one image a second and blocks faster clients. Every picture is
// checked against the stored content hashes before it is added, so online
// pictures can never duplicate anything already in the library.
ipcMain.handle('tat:online', async (_e, opts) => {
  if (!onlineAllowed()) return { ok: false, error: 'offline' };
  const want = clampInt(opts && opts.count, 1, 24, 10);
  const manifest = readTatManifest();
  const ids = new Set(manifest.map((r) => r.id));
  const hashes = new Set(manifest.map((r) => r.sha256).filter(Boolean));
  const added = [];
  let blocked = 0;
  let lastStatus = 0;
  let gateAt = 0;
  const gap = 1100;

  async function gate() {
    const now = Date.now();
    const wait = Math.max(0, gateAt - now);
    gateAt = Math.max(now, gateAt) + gap;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }

  async function request(url, asJson) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await gate();
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12000),
          headers: {
            'AIC-User-Agent': AIC_UA,
            'User-Agent': AIC_UA,
            Accept: asJson ? 'application/json' : 'image/jpeg'
          }
        });
        lastStatus = res.status;
        if (res.status === 429 || res.status === 403 || res.status >= 500) {
          blocked++;
          await new Promise((r) => setTimeout(r, 2500 * attempt));
          continue;
        }
        if (!res.ok) return null;
        return asJson ? await res.json() : Buffer.from(await res.arrayBuffer());
      } catch (err) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    return null;
  }

  for (const term of shuffleCopy(AIC_TERMS).slice(0, 8)) {
    if (added.length >= want) break;
    const page = 1 + Math.floor(Math.random() * 8);
    const url =
      AIC_API +
      '/artworks/search?q=' +
      encodeURIComponent(term) +
      '&query%5Bterm%5D%5Bis_public_domain%5D=true' +
      '&fields=' +
      AIC_FIELDS +
      '&limit=100&page=' +
      page;
    const data = await request(url, true);
    if (!data) continue;
    const rows = shuffleCopy(
      (data.data || []).filter(
        (r) => r && r.is_public_domain === true && r.image_id && !ids.has('aic-' + r.id)
      )
    );

    for (const rec of rows) {
      if (added.length >= want) break;
      const imgUrl = AIC_IIIF + '/' + rec.image_id + '/full/640,/0/default.jpg';
      const buf = await request(imgUrl, false);
      if (!buf || buf.length < 2048) continue;
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (hashes.has(sha)) {
        ids.add('aic-' + rec.id);
        continue;
      }
      let out = null;
      let size = null;
      try {
        const img = nativeImage.createFromBuffer(buf);
        if (!img.isEmpty()) {
          const resized = img.resize({ width: 560, quality: 'good' });
          out = resized.toJPEG(72);
          size = resized.getSize();
        }
      } catch (_) {
        out = null;
      }
      if (!out || !out.length) continue;
      const file = 'aic-' + rec.id + '.jpg';
      try {
        fs.mkdirSync(TAT_DIR, { recursive: true });
        fs.writeFileSync(path.join(TAT_DIR, file), out);
      } catch (err) {
        console.error('[tat] could not save picture:', err.message);
        continue;
      }
      const record = {
        id: 'aic-' + rec.id,
        file,
        source: 'Art Institute of Chicago',
        title: String(rec.title || 'Untitled').slice(0, 180),
        creator: String(rec.artist_display || 'Unknown').split('\n')[0].slice(0, 120),
        date: String(rec.date_display || '').slice(0, 60),
        medium: String(rec.medium_display || '').slice(0, 120),
        department: String(rec.department_title || '').slice(0, 80),
        license: 'Public Domain (CC0 1.0)',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        sourcePage: 'https://www.artic.edu/artworks/' + rec.id,
        imageApi: imgUrl,
        sha256: sha,
        width: size ? size.width : 0,
        height: size ? size.height : 0,
        bytes: out.length
      };
      manifest.push(record);
      ids.add(record.id);
      hashes.add(sha);
      added.push(tatItem(record));
    }
    if (!added.length && (lastStatus === 403 || lastStatus === 429)) break;
  }

  if (added.length) writeTatManifest(manifest);
  return {
    ok: added.length > 0,
    added: added.length,
    blocked,
    total: manifest.length,
    images: added,
    error: added.length
      ? undefined
      : lastStatus === 403 || lastStatus === 429
        ? 'blocked'
        : 'no-new-images'
  };
});

/* ------------------------------------------------------------ lecturette */
// The catalogue in data/lecturettes.json is built by tools/build-lecturettes.py.
// Every entry follows the three-minute SSB pattern - intro (30s), body (2 min),
// conclusion (30s) - and says where its material came from:
//   curated  hand-written, with figures and a quote
//   draft    a full spoken script, no figures (the panel marks it as a draft)
//   outline  a speaking scaffold for a topic with no script yet
// The live-data panel fills in the current points for any of the three.
const LECTURETTES_JSON = path.join(DATA_DIR, 'lecturettes.json');
const LECTURES_JSON = path.join(DATA_DIR, 'lectures.json');

function readLecturettes() {
  for (const file of [LECTURETTES_JSON, LECTURES_JSON]) {
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(list) && list.length) return list;
    } catch (err) {
      console.error('[lectures] could not read ' + path.basename(file) + ':', err.message);
    }
  }
  return [];
}

ipcMain.handle('lectures:list', () => readLecturettes());

/* One small index of current-affairs headlines, used to give a WAT word a real
   example from the news. Same rules as the topic points: fetched here, cached on
   disk for three months, and returned labelled as saved when the net is down. */
function newsIndexFile() {
  return path.join(liveDir(), '_news-index.json');
}

async function buildNewsIndex() {
  const queries = ['India', 'India economy', 'India defence'];
  const items = [];
  const seen = new Set();
  for (const q of queries) {
    const rows = await googleNews(q);
    for (const r of rows) {
      const c = cleanHeadline(r);
      const key = c.text.toLowerCase();
      if (!c.text || seen.has(key)) continue;
      seen.add(key);
      items.push({ text: c.text, source: c.source, date: c.date, link: r.link || '' });
    }
    if (items.length >= 60) break;
  }
  return items.slice(0, 60);
}

ipcMain.handle('news:index', async (_e, opts) => {
  const force = !!(opts && opts.force);
  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(newsIndexFile(), 'utf8'));
  } catch (_) {
    cache = null;
  }
  const fresh = cache && Date.now() - (cache.checkedAt || 0) <= LIVE_MAX_AGE_MS;
  const pack = (rec, extra) =>
    Object.assign(
      {
        ok: true,
        items: rec.items || [],
        checkedAt: rec.checkedAt || 0,
        checkedOn: rec.checkedAt ? new Date(rec.checkedAt).toISOString().slice(0, 10) : ''
      },
      extra || {}
    );

  if (cache && fresh && !force) return pack(cache, { cached: true });
  if (!onlineAllowed()) {
    return cache ? pack(cache, { cached: true, offline: true }) : { ok: false, error: 'offline' };
  }
  try {
    const items = await buildNewsIndex();
    if (!items.length) throw new Error('empty');
    const rec = { items: items, checkedAt: Date.now() };
    try {
      fs.mkdirSync(liveDir(), { recursive: true });
      fs.writeFileSync(newsIndexFile(), JSON.stringify(rec, null, 1), 'utf8');
    } catch (err) {
      console.error('[news] could not cache the index:', err.message);
    }
    return pack(rec, { cached: false });
  } catch (err) {
    if (cache) return pack(cache, { cached: true, offline: true });
    return { ok: false, error: err.message === 'empty' ? 'empty' : 'network' };
  }
});

/* Current points per topic, refreshed every three months.
   The feed is fetched here, never in the page, so the renderer keeps
   connect-src 'none'. A cache on disk means the panel still has points when the
   machine is offline; those points are returned flagged as saved, not fresh. */
const LIVE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Resolved lazily: app.getPath is only reliable once Electron is up.
function liveDir() {
  return path.join(app.getPath('userData'), 'live-data');
}

function liveIndexFile() {
  return path.join(liveDir(), 'index.json');
}

function liveFile(id) {
  return path.join(liveDir(), String(id).replace(/[^A-Za-z0-9-]/g, '') + '.json');
}

function readLive(id) {
  if (!id) return null;
  try {
    return JSON.parse(fs.readFileSync(liveFile(id), 'utf8'));
  } catch (_) {
    return null;
  }
}

function readLiveIndex() {
  try {
    const idx = JSON.parse(fs.readFileSync(liveIndexFile(), 'utf8'));
    return idx && typeof idx === 'object' ? idx : {};
  } catch (_) {
    return {};
  }
}

function liveSummary(rec) {
  const checkedAt = (rec && rec.checkedAt) || 0;
  const age = checkedAt ? Date.now() - checkedAt : Infinity;
  const points = rec.points || [];
  // Grouped for the panel at the bottom of a lecture: what is happening, how
  // India is affected, what India gains, and the view from outside.
  const groups = { now: [], india: [], gain: [], world: [] };
  for (const p of points) {
    const g = NEWS_GROUPS.indexOf(p.group) >= 0 ? p.group : 'now';
    groups[g].push(p);
  }
  const out = {
    id: rec.id,
    query: rec.query || '',
    points: points,
    groups: groups,
    count: (rec.points || []).length,
    source: rec.source || 'Google News',
    checkedAt: checkedAt || 0,
    checkedOn: checkedAt ? new Date(checkedAt).toISOString().slice(0, 10) : '',
    ageDays: checkedAt ? Math.floor(age / 86400000) : null,
    dueOn: checkedAt ? new Date(checkedAt + LIVE_MAX_AGE_MS).toISOString().slice(0, 10) : '',
    fresh: checkedAt ? age <= LIVE_MAX_AGE_MS : false,
    stale: checkedAt ? age > LIVE_MAX_AGE_MS : true
  };
  return out;
}

function writeLive(rec) {
  try {
    fs.mkdirSync(liveDir(), { recursive: true });
    fs.writeFileSync(liveFile(rec.id), JSON.stringify(rec, null, 1), 'utf8');
    const idx = readLiveIndex();
    idx[rec.id] = { checkedAt: rec.checkedAt, count: (rec.points || []).length };
    fs.writeFileSync(liveIndexFile(), JSON.stringify(idx, null, 1), 'utf8');
    appLog('lectures', 'live points saved', { id: rec.id, points: (rec.points || []).length });
    return true;
  } catch (err) {
    console.error('[lectures] could not cache live points:', err.message);
    return false;
  }
}

// Used by the smoke run to prove the news matching without the internet.
function seedNewsIndex(items) {
  try {
    fs.mkdirSync(liveDir(), { recursive: true });
    fs.writeFileSync(
      newsIndexFile(),
      JSON.stringify({ items: items, checkedAt: Date.now() - 200 * 86400000 }, null, 1),
      'utf8'
    );
    return true;
  } catch (err) {
    console.error('[news] could not seed the index:', err.message);
    return false;
  }
}

function clearNewsIndex() {
  try {
    fs.unlinkSync(newsIndexFile());
  } catch (_) {}
}

// Used by the smoke run to leave no test points behind on a real machine.
function clearLive(id) {
  try {
    fs.unlinkSync(liveFile(id));
  } catch (_) {}
  try {
    const idx = readLiveIndex();
    if (idx[id]) {
      delete idx[id];
      fs.writeFileSync(liveIndexFile(), JSON.stringify(idx, null, 1), 'utf8');
    }
  } catch (_) {}
}

// Headlines are "Story headline - Publisher" on Google News; split them so the
// bullet reads as a point and the paper is credited separately.
function cleanHeadline(raw) {
  let text = String(raw || '').trim();
  let publisher = '';
  const dash = text.lastIndexOf(' - ');
  if (dash > 20) {
    publisher = text.slice(dash + 3).trim();
    text = text.slice(0, dash).trim();
  }
  let date = '';
  try {
    date = raw && raw.date ? new Date(raw.date).toISOString().slice(0, 10) : '';
  } catch (_) {
    date = '';
  }
  return { text: text, source: publisher, date: date };
}

// Sort a headline into one of four plain-language groups. This is keyword
// matching on the published headline only: it decides where a point is shown,
// and never adds a claim of its own.
const NEWS_GROUPS = ['gain', 'india', 'world', 'now'];

function newsGroupOf(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const india = /\b(india|indian|delhi|modi|bharat|rupee|isro|drdo)\b/.test(t);
  const gains = /\b(gain|gains|benefit|boosts?|opportunity|opportunities|growth|exports?|jobs?|invest\w*|record|profit\w*|deal|wins?|rises?|surges?|expansion|demand)\b/.test(t);
  if (india && gains) return 'gain';
  if (india) return 'india';
  if (/\b(world|global|international|united nations|un|foreign|abroad|china|pakistan|russia|europe|africa|asia|america|us|britain|japan|gulf)\b/.test(t)) {
    return 'world';
  }
  return 'now';
}

async function newsPoints(query) {
  const rows = await googleNews(query);
  const points = [];
  const seen = new Set();
  for (const r of rows) {
    const c = cleanHeadline(r);
    const key = c.text.toLowerCase();
    if (!c.text || seen.has(key)) continue;
    seen.add(key);
    points.push({
      text: c.text,
      source: c.source,
      date: c.date,
      link: r.link || '',
      group: newsGroupOf(c.text)
    });
    if (points.length >= 12) break;
  }
  return points;
}

ipcMain.handle('lectures:liveStatus', () => {
  const idx = readLiveIndex();
  const out = {};
  for (const id of Object.keys(idx)) {
    const checkedAt = idx[id].checkedAt || 0;
    const age = Date.now() - checkedAt;
    out[id] = {
      checkedOn: checkedAt ? new Date(checkedAt).toISOString().slice(0, 10) : '',
      count: idx[id].count || 0,
      fresh: age <= LIVE_MAX_AGE_MS
    };
  }
  return out;
});

ipcMain.handle('lectures:live', async (_e, opts) => {
  const id = String((opts && opts.id) || '').slice(0, 80);
  const query = String((opts && opts.query) || '').slice(0, 120).trim();
  const force = !!(opts && opts.force);
  const cached = readLive(id);

  if (cached && !force && liveSummary(cached).fresh) {
    return Object.assign({ ok: true, cached: true }, liveSummary(cached));
  }
  if (!onlineAllowed()) {
    return cached
      ? Object.assign({ ok: true, cached: true, offline: true }, liveSummary(cached))
      : { ok: false, error: 'offline' };
  }
  if (!query) {
    return cached
      ? Object.assign({ ok: true, cached: true }, liveSummary(cached))
      : { ok: false, error: 'no-query' };
  }
  try {
    const points = await newsPoints(query);
    if (!points.length) throw new Error('empty');
    const rec = { id: id, query: query, points: points, checkedAt: Date.now(), source: 'Google News' };
    writeLive(rec);
    return Object.assign({ ok: true, cached: false }, liveSummary(rec));
  } catch (err) {
    // A failed refresh never removes what is already on disk.
    if (cached) {
      return Object.assign({ ok: true, cached: true, offline: true, detail: err.message }, liveSummary(cached));
    }
    return { ok: false, error: err.message === 'empty' ? 'empty' : 'network', detail: err.message };
  }
});

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function googleNews(query) {
  const url =
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(query) +
    '&hl=en-IN&gl=IN&ceid=IN:en';
  const res = await fetch(url, {
    signal: AbortSignal.timeout(9000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SSB-Prep-Trainer/1.0)',
      Accept: 'application/rss+xml, application/xml'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const xml = await res.text();
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && out.length < 12) {
    const body = m[1];
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const date = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const clean = decodeEntities(title).trim();
    if (clean) {
      out.push({ title: clean, link: decodeEntities(link).trim(), date: date.trim(), query });
    }
  }
  return out;
}

// Recent SSB and defence headlines, offered as "hot topics" to prepare a
// lecturette on. Google News RSS needs no account or key, and the request
// runs here in the main process so the page itself stays locked offline.
ipcMain.handle('lectures:hot', async () => {
  if (!onlineAllowed()) return { ok: false, error: 'offline' };
  const queries = ['"SSB interview"', '"Services Selection Board"', 'Indian Armed Forces'];
  const seen = new Set();
  const items = [];
  try {
    for (const q of queries) {
      const rows = await googleNews(q);
      for (const r of rows) {
        const key = r.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(r);
      }
      if (items.length >= 18) break;
    }
    return {
      ok: items.length > 0,
      items: items.slice(0, 18),
      source: 'Google News',
      error: items.length ? undefined : 'empty'
    };
  } catch (err) {
    return { ok: false, error: 'network', detail: err.message };
  }
});

ipcMain.handle('export:text', async (_e, payload) => {
  const safe = String((payload && payload.defaultName) || 'export.txt').replace(/[\\/:*?"<>|]/g, '-');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save export',
    defaultPath: path.join(app.getPath('documents'), safe),
    filters: [{ name: 'Text file', extensions: ['txt'] }]
  });
  if (res.canceled || !res.filePath) return { saved: false };
  try {
    fs.writeFileSync(res.filePath, String((payload && payload.text) || ''), 'utf8');
    appLog('export', 'text saved', { path: res.filePath });
    return { saved: true, path: res.filePath };
  } catch (err) {
    return { saved: false, error: err.message };
  }
});

// One row per saved attempt, for a mentor or a spreadsheet. Written through
// the same save dialog as a single export, so the file lands where the person
// chooses instead of a download folder the renderer cannot see.
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function durationText(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

ipcMain.handle('attempts:export', async (_e, format) => {
  const fmt = format === 'json' ? 'json' : 'csv';
  const attempts = getStore().attempts || [];
  const rows = attempts.map((a) => ({
    test: String(a.test || '').toUpperCase(),
    set: a.setName || '',
    startedAt: a.startedAt || '',
    endedAt: a.endedAt || '',
    duration: durationText(a.durationMs),
    endedBecause: a.reason || '',
    answered: Number(a.answered) || 0,
    total: Number(a.total) || 0
  }));

  let bodyText;
  if (fmt === 'json') {
    bodyText = JSON.stringify(rows, null, 2);
  } else {
    const head = ['Test', 'Set', 'Started', 'Ended', 'Duration', 'Ended because', 'Answered', 'Total'];
    bodyText = [head]
      .concat(
        rows.map((r) => [r.test, r.set, r.startedAt, r.endedAt, r.duration, r.endedBecause, r.answered, r.total])
      )
      .map((cells) => cells.map(csvCell).join(','))
      .join('\r\n');
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save practice history',
    defaultPath: path.join(app.getPath('documents'), 'SSB-attempts-' + stamp + '.' + fmt),
    filters: [
      fmt === 'json'
        ? { name: 'JSON file', extensions: ['json'] }
        : { name: 'CSV file', extensions: ['csv'] }
    ]
  });
  if (res.canceled || !res.filePath) return { saved: false, cancelled: true };
  try {
    fs.writeFileSync(res.filePath, bodyText, 'utf8');
    appLog('export', 'attempts saved', { path: res.filePath, count: rows.length, format: fmt });
    return { saved: true, path: res.filePath, count: rows.length, format: fmt };
  } catch (err) {
    return { saved: false, error: err.message };
  }
});

ipcMain.handle('power:block', (_e, on) => {
  try {
    if (on) {
      if (blockerId === null || !powerSaveBlocker.isStarted(blockerId)) {
        blockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
    } else if (blockerId !== null) {
      if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
    return blockerId !== null;
  } catch (_) {
    return false;
  }
});

ipcMain.handle('shell:open', (_e, url) => {
  if (/^https?:/i.test(String(url))) shell.openExternal(String(url));
  return true;
});

/* ------------------------------------------------------------ dictionary */

let dict = null;
let dictKeys = null;
let dictMeta = null;
let dictMs = 0;
let dictPos = null;
let dictNeg = null;

function loadDictionary() {
  if (dict) return true;
  const t0 = Date.now();
  try {
    const obj = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dictionary.json'), 'utf8'));
    dict = new Map(Object.entries(obj));
    dictKeys = Array.from(dict.keys()).sort();
    try {
      dictMeta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dictionary-meta.json'), 'utf8'));
    } catch (_) {
      dictMeta = { words: dict.size };
    }
    dictMs = Date.now() - t0;
    console.log('[dict] loaded ' + dict.size + ' words in ' + dictMs + 'ms');
    return true;
  } catch (err) {
    console.error('[dict] load failed:', err.message);
    dict = new Map();
    dictKeys = [];
    dictMeta = { words: 0, withDefinitions: 0, error: err.message };
    return false;
  }
}

function buildSentimentLists() {
  if (dictPos && dictNeg) return;
  dictPos = [];
  dictNeg = [];
  for (let i = 0; i < dictKeys.length; i++) {
    const w = dictKeys[i];
    const s = dict.get(w).s || 0;
    if (s > 0) dictPos.push(w);
    else if (s < 0) dictNeg.push(w);
  }
}

function clampInt(v, min, max, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

function entryFor(w) {
  const e = dict.get(w);
  if (!e) return null;
  return {
    word: w,
    sentiment: e.s || 0,
    senses: (e.d || []).map(function (p) {
      return { pos: p[0], def: p[1] };
    })
  };
}

function briefEntry(w) {
  const e = dict.get(w) || { d: [], s: 0 };
  const first = (e.d && e.d[0]) || null;
  return {
    word: w,
    sentiment: e.s || 0,
    senseCount: (e.d || []).length,
    pos: first ? first[0] : '',
    preview: first ? first[1] : ''
  };
}

// Binary search lower bound on the sorted key array.
function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

ipcMain.handle('dict:info', () => {
  loadDictionary();
  buildSentimentLists();
  return {
    words: dict.size,
    withDefinitions: dictMeta.withDefinitions || 0,
    positive: dictPos.length,
    negative: dictNeg.length,
    source: dictMeta.source || '',
    loadMs: dictMs
  };
});

ipcMain.handle('dict:get', (_e, word) => {
  loadDictionary();
  const w = String(word || '').toLowerCase().trim();
  const entry = entryFor(w);
  if (entry) return { ok: true, entry: entry };
  return { ok: false, word: w, error: 'not-found' };
});

ipcMain.handle('dict:search', (_e, opts) => {
  loadDictionary();
  const q = String((opts && opts.query) || '').toLowerCase().trim();
  const limit = clampInt(opts && opts.limit, 1, 200, 60);
  const offset = clampInt(opts && opts.offset, 0, 1000000, 0);
  const need = offset + limit + 1; // +1 so we know whether more remain
  const hits = [];
  const seen = Object.create(null);

  if (!q) {
    for (let i = 0; i < dictKeys.length && hits.length < need; i++) hits.push(dictKeys[i]);
  } else {
    // 1) Prefix matches first - what people expect from a dictionary search.
    let i = lowerBound(dictKeys, q);
    while (i < dictKeys.length && hits.length < need) {
      const w = dictKeys[i];
      if (w.indexOf(q) !== 0) break;
      if (!seen[w]) { seen[w] = 1; hits.push(w); }
      i++;
    }
    // 2) Then substring matches, so "brav" still finds "bravery".
    if (hits.length < need) {
      for (let j = 0; j < dictKeys.length && hits.length < need; j++) {
        const w = dictKeys[j];
        if (!seen[w] && w.indexOf(q) >= 0) { seen[w] = 1; hits.push(w); }
      }
    }
  }

  return {
    query: q,
    offset: offset,
    hasMore: hits.length > offset + limit,
    items: hits.slice(offset, offset + limit).map(briefEntry)
  };
});

ipcMain.handle('dict:sentiment', (_e, opts) => {
  loadDictionary();
  buildSentimentLists();
  const type = (opts && opts.type) === 'negative' ? 'negative' : 'positive';
  const list = type === 'negative' ? dictNeg : dictPos;
  const offset = clampInt(opts && opts.offset, 0, Math.max(0, list.length), 0);
  const limit = clampInt(opts && opts.limit, 1, 200, 60);
  return {
    type: type,
    total: list.length,
    offset: offset,
    items: list.slice(offset, offset + limit).map(briefEntry)
  };
});

ipcMain.handle('dict:random', (_e, opts) => {
  loadDictionary();
  buildSentimentLists();
  const count = clampInt(opts && opts.count, 1, 200, 10);
  const filter = String((opts && opts.filter) || 'all');
  let pool = dictKeys;
  if (filter === 'positive') pool = dictPos;
  else if (filter === 'negative') pool = dictNeg;
  const out = [];
  if (!pool.length) return { total: 0, items: [] };
  for (let i = 0; i < count; i++) {
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return { total: out.length, items: out.map(briefEntry) };
});

/* -------------------------------------------------------------- online */
// Free dictionary/word API (Datamuse). No account, no key, no subscription.
// Runs in the MAIN process, so the renderer stays locked with connect-src 'none'.

function onlineAllowed() {
  const cfg = getStore().config || {};
  return cfg.onlineEnabled === true;
}

async function datamuse(pathAndQuery) {
  // One retry on a dropped connection: this is a best-effort extra and the
  // network this ships onto is often shared or flaky. An HTTP status error is
  // deterministic, so it is reported straight away instead of being retried.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://api.datamuse.com' + pathAndQuery, {
        signal: AbortSignal.timeout(7000),
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch (err) {
      if (attempt >= 1 || /^HTTP \d/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

ipcMain.handle('online:status', () => ({ enabled: onlineAllowed() }));

// Connectivity check, so the UI can show "online" vs "offline" honestly and
// pick sensible fallbacks. The page can't ask the network directly (CSP blocks
// it), so it asks the main process. A cached result keeps the app instant and
// means a failed probe never blocks anything.
let netProbeCache = { at: 0, online: false };
ipcMain.handle('net:probe', async () => {
  if (!onlineAllowed()) {
    return { enabled: false, online: false, at: Date.now() };
  }
  const res = { enabled: true, online: false, at: Date.now() };
  try {
    const ctrl = AbortSignal.timeout(2500);
    const r = await fetch('https://api.datamuse.com/words?max=1', {
      signal: ctrl,
      headers: { Accept: 'application/json' }
    });
    res.online = r.ok;
  } catch (_) {
    res.online = false;
  }
  netProbeCache = { at: Date.now(), online: res.online };
  appLog('net', 'probe', { online: res.online });
  return res;
});

ipcMain.handle('online:meaning', async (_e, word) => {
  if (!onlineAllowed()) return { ok: false, error: 'offline' };
  const w = String(word || '').trim();
  if (!w || !/^[a-zA-Z][a-zA-Z' -]{0,40}$/.test(w)) {
    return { ok: false, error: 'bad-word' };
  }
  try {
    const rows = await datamuse('/words?sp=' + encodeURIComponent(w) + '&md=dp&max=1');
    const row = rows[0];
    if (!row || !Array.isArray(row.defs) || !row.defs.length) {
      return { ok: false, error: 'no-definition', word: w };
    }
    const senses = row.defs.map(function (d) {
      const tab = d.indexOf('\t');
      return tab > 0
        ? { pos: d.slice(0, tab), def: d.slice(tab + 1).trim() }
        : { pos: '', def: String(d).trim() };
    });
    return { ok: true, word: row.word || w, senses: senses, source: 'datamuse' };
  } catch (err) {
    return { ok: false, error: 'network', detail: err.message };
  }
});

ipcMain.handle('online:words', async (_e, opts) => {
  if (!onlineAllowed()) return { ok: false, error: 'offline' };
  const theme = String((opts && opts.theme) || 'duty').toLowerCase().replace(/[^a-z ]/g, '').slice(0, 40) || 'duty';
  const count = clampInt(opts && opts.count, 10, 120, 60);
  try {
    const rows = await datamuse('/words?ml=' + encodeURIComponent(theme) + '&max=' + count);
    const words = [];
    for (const r of rows) {
      const w = String(r.word || '').trim();
      if (w && /^[a-zA-Z][a-zA-Z' -]*$/.test(w)) words.push(w);
      if (words.length >= count) break;
    }
    return { ok: true, theme: theme, words: words, source: 'datamuse' };
  } catch (err) {
    return { ok: false, error: 'network', detail: err.message };
  }
});

/* ------------------------------------------------------------------ log */
// A plain-text log on disk, so any later maintenance can see what happened
// without guessing. One file, rotated once at 2 MB. Everything is local.
const LOG_MAX = 2 * 1024 * 1024;
let logDirPath = '';
let logFilePath = '';
let logStream = null;
const logRing = [];
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);

function fmtLog(v) {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
}

function writeLog(scope, msg) {
  // One huge console line (the smoke report embeds the log itself) must not
  // grow the log geometrically from run to run. 8 KB still keeps full stacks.
  const LOG_LINE_MAX = 8000;
  let text = String(msg);
  if (text.length > LOG_LINE_MAX) {
    text = text.slice(0, LOG_LINE_MAX) + ' …[' + (text.length - LOG_LINE_MAX) + ' chars omitted]';
  }
  const line = new Date().toISOString() + ' [' + scope + '] ' + text;
  logRing.push(line);
  if (logRing.length > 800) logRing.shift();
  if (logStream) {
    try {
      logStream.write(line + '\n');
    } catch (_) {
      /* a full disk must not break the app */
    }
  }
}

function appLog(scope, msg, extra) {
  writeLog(scope, msg + (extra === undefined ? '' : ' ' + fmtLog(extra)));
}

function initLogger() {
  try {
    logDirPath = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDirPath, { recursive: true });
    logFilePath = path.join(logDirPath, 'app.log');
    try {
      if (fs.statSync(logFilePath).size > LOG_MAX) {
        fs.renameSync(logFilePath, path.join(logDirPath, 'app.old.log'));
      }
    } catch (_) {
      /* first run */
    }
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  } catch (err) {
    origErr('[log] cannot open the log file:', err.message);
  }
  console.log = function () {
    origLog.apply(console, arguments);
    writeLog('console', Array.prototype.map.call(arguments, fmtLog).join(' '));
  };
  console.error = function () {
    origErr.apply(console, arguments);
    writeLog('error', Array.prototype.map.call(arguments, fmtLog).join(' '));
  };
  process.on('uncaughtException', (err) => {
    origErr('[uncaught]', err);
    writeLog('crash', 'uncaughtException: ' + (err && (err.stack || err.message)));
  });
  process.on('unhandledRejection', (reason) => {
    origErr('[unhandled]', reason);
    writeLog('crash', 'unhandledRejection: ' + fmtLog(reason));
  });
  appLog('app', 'start', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData')
  });
}

function tailLog(n) {
  try {
    const text = fs.readFileSync(logFilePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return { path: logFilePath, total: lines.length, text: lines.slice(-Math.max(1, n || 300)).join('\n') };
  } catch (_) {
    return { path: logFilePath, total: logRing.length, text: logRing.slice(-(n || 300)).join('\n') };
  }
}

ipcMain.handle('log:tail', (_e, n) => tailLog(n));
ipcMain.handle('log:append', (_e, scope, msg) => {
  writeLog(String(scope || 'renderer'), String(msg || ''));
  return true;
});
ipcMain.handle('log:openFolder', async () => {
  if (!logDirPath) return { ok: false };
  const err = await shell.openPath(logDirPath);
  return err ? { ok: false, error: err } : { ok: true };
});

/* ---------------------------------------------------------------- diag */
function countJson(pathname, key) {
  try {
    const v = JSON.parse(fs.readFileSync(pathname, 'utf8'));
    if (Array.isArray(v)) return v.length;
    return key && Array.isArray(v[key]) ? v[key].length : 0;
  } catch (_) {
    return -1;
  }
}

function diagInfo() {
  const data = readData();
  const store = getStore();
  let storeBytes = 0;
  try {
    storeBytes = fs.statSync(path.join(app.getPath('userData'), 'ssb-prep-store.json')).size;
  } catch (_) {}
  return {
    app: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    },
    paths: {
      userData: app.getPath('userData'),
      store: path.join(app.getPath('userData'), 'ssb-prep-store.json'),
      log: logFilePath,
      data: DATA_DIR,
      digest: DIGEST_DIR
    },
    data: {
      watSets: (data.wat && data.wat.sets ? data.wat.sets.length : 0),
      srtSets: (data.srt && data.srt.sets ? data.srt.sets.length : 0),
      tatSets: (data.tat && data.tat.sets ? data.tat.sets.length : 0),
      lectures: countJson(path.join(DATA_DIR, 'lectures.json')),
      museumPictures: countJson(path.join(DATA_DIR, 'tat-images.json')),
      classicPictures: countJson(path.join(DATA_DIR, 'tat-classic.json')),
      watHints: readWatHints ? Object.keys(readWatHints()).length : 0,
      dictionaryWords: dict ? dict.size : 0
    },
    store: {
      bytes: storeBytes,
      attempts: store.attempts.length,
      customWat: ((store.config.custom || {}).wat || []).length,
      customSrt: ((store.config.custom || {}).srt || []).length,
      customTat: ((store.config.custom || {}).tat || []).length,
      onlineEnabled: !!store.config.onlineEnabled,
      tatSource: store.config.tatSource || 'classic'
    },
    python: findPython(),
    digestDeps: digestDeps()
  };
}

ipcMain.handle('diag:info', () => diagInfo());

ipcMain.handle('diag:save', async () => {
  const info = diagInfo();
  const log = tailLog(400);
  const lines = [];
  lines.push('SSB Prep Trainer — diagnostics report');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('');
  lines.push('== Environment ==');
  Object.keys(info.app).forEach((k) => lines.push(k + ': ' + info.app[k]));
  lines.push('');
  lines.push('== Paths ==');
  Object.keys(info.paths).forEach((k) => lines.push(k + ': ' + info.paths[k]));
  lines.push('');
  lines.push('== Data ==');
  Object.keys(info.data).forEach((k) => lines.push(k + ': ' + info.data[k]));
  lines.push('');
  lines.push('== Store ==');
  Object.keys(info.store).forEach((k) => lines.push(k + ': ' + info.store[k]));
  lines.push('');
  lines.push('== Digest engine ==');
  lines.push('python: ' + JSON.stringify(info.python));
  lines.push('libraries: ' + JSON.stringify(info.digestDeps));
  lines.push('');
  lines.push('== Recent log (' + log.total + ' lines on disk, last 400 below) ==');
  lines.push(log.text);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save diagnostics report',
    defaultPath: path.join(app.getPath('documents'), 'SSB-Prep-Trainer-diagnostics-' + stamp + '.txt'),
    filters: [{ name: 'Text file', extensions: ['txt'] }]
  });
  if (res.canceled || !res.filePath) return { saved: false };
  try {
    fs.writeFileSync(res.filePath, lines.join('\r\n'), 'utf8');
    appLog('diag', 'report saved', { path: res.filePath, bytes: lines.join('\r\n').length });
    return { saved: true, path: res.filePath };
  } catch (err) {
    appLog('diag', 'report save failed', { error: err.message });
    return { saved: false, error: err.message };
  }
});

/* --------------------------------------------------------- news digest */
// The digest is a separate Python engine copied into this app, exactly as it
// is in its own folder. It runs in its own writable directory and never shares
// state with the SSB trainer: two compartments, one window.
const DIGEST_SRC = app.isPackaged
  ? path.join(process.resourcesPath, 'digest-tool')
  : path.join(ROOT, 'digest-tool');
let DIGEST_DIR = '';
let DIGEST_OUT = '';
function initDigestPaths() {
  DIGEST_DIR = path.join(app.getPath('userData'), 'news-digest');
  DIGEST_OUT = path.join(DIGEST_DIR, 'output');
}
const DIGEST_COMMANDS = new Set([
  'run', 'collect', 'build', 'text', 'show', 'open', 'check', 'files',
  'history', 'glossary', 'words', 'facts', 'war', 'feeds', 'section',
  'config', 'edit', 'correct', 'init', 'help'
]);

let digestProc = null;
let pythonInfo = null;

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === '__pycache__' || ent.name.endsWith('.pyc')) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function ensureDigestEngine() {
  try {
    // Code is refreshed on every launch so an app update brings the engine too.
    // User data (config.json, drafts, output, state) is never overwritten.
    copyTree(path.join(DIGEST_SRC, 'newsdigest'), path.join(DIGEST_DIR, 'newsdigest'));
    fs.mkdirSync(DIGEST_OUT, { recursive: true });
    for (const d of ['inbox', 'drafts', 'state', 'user_data']) {
      fs.mkdirSync(path.join(DIGEST_DIR, d), { recursive: true });
    }
    const cfg = path.join(DIGEST_DIR, 'config.json');
    if (!fs.existsSync(cfg)) fs.copyFileSync(path.join(DIGEST_SRC, 'config.json'), cfg);
    return true;
  } catch (err) {
    console.error('[digest] engine copy failed:', err.message);
    return false;
  }
}

function findPython() {
  if (pythonInfo) return pythonInfo;
  const tries = [
    { cmd: 'python', prefix: [] },
    { cmd: 'py', prefix: ['-3'] },
    { cmd: 'python3', prefix: [] }
  ];
  for (const t of tries) {
    try {
      const r = spawnSync(t.cmd, t.prefix.concat(['--version']), { encoding: 'utf8', windowsHide: true });
      if (r.status === 0) {
        const v = String((r.stdout || r.stderr) || '').trim();
        pythonInfo = { ok: true, cmd: t.cmd, prefix: t.prefix, version: v };
        return pythonInfo;
      }
    } catch (_) {
      /* try the next interpreter */
    }
  }
  pythonInfo = { ok: false, version: '' };
  return pythonInfo;
}

function digestDeps() {
  const py = findPython();
  if (!py.ok) return { ok: false, missing: 'python' };
  const code =
    'import reportlab,pypdf,feedparser,trafilatura;' +
    'print(reportlab.Version, pypdf.__version__, feedparser.__version__)';
  const r = spawnSync(py.cmd, py.prefix.concat(['-c', code]), {
    cwd: DIGEST_DIR,
    encoding: 'utf8',
    windowsHide: true
  });
  if (r.status !== 0) {
    const msg = String(r.stderr || '').split('\n').filter(Boolean)[0] || 'missing library';
    return { ok: false, missing: msg };
  }
  return { ok: true, versions: String(r.stdout || '').trim() };
}

function digestFiles() {
  try {
    return fs
      .readdirSync(DIGEST_OUT)
      .filter((f) => /\.(pdf|txt)$/i.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(DIGEST_OUT, f));
        return { name: f, bytes: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) {
    return [];
  }
}

function digestConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIGEST_DIR, 'config.json'), 'utf8'));
  } catch (_) {
    try {
      return JSON.parse(fs.readFileSync(path.join(DIGEST_SRC, 'config.json'), 'utf8'));
    } catch (_) {
      return {};
    }
  }
}

function sendDigest(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

ipcMain.handle('digest:status', () => {
  ensureDigestEngine();
  const py = findPython();
  return {
    python: py.ok,
    pythonVersion: py.version,
    engineDir: DIGEST_DIR,
    deps: py.ok ? digestDeps() : { ok: false, missing: 'python' },
    config: digestConfig(),
    files: digestFiles()
  };
});

ipcMain.handle('digest:run', (_e, payload) => {
  if (digestProc) return { ok: false, error: 'busy' };
  const args = Array.isArray(payload && payload.args) ? payload.args.map(String) : [];
  if (!args.length || !DIGEST_COMMANDS.has(args[0])) return { ok: false, error: 'bad-command' };
  const py = findPython();
  if (!py.ok) return { ok: false, error: 'no-python' };
  ensureDigestEngine();

  const full = py.prefix.concat(['-m', 'newsdigest.cli']).concat(args);
  appLog('digest', 'run started', { args: args });
  const proc = spawn(py.cmd, full, {
    cwd: DIGEST_DIR,
    env: Object.assign({}, process.env, { PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }),
    windowsHide: true
  });
  digestProc = proc;
  sendDigest('digest:started', { pid: proc.pid, args: args });

  proc.stdout.on('data', (d) => sendDigest('digest:log', { stream: 'out', text: d.toString() }));
  proc.stderr.on('data', (d) => sendDigest('digest:log', { stream: 'err', text: d.toString() }));
  proc.on('error', (err) => {
    digestProc = null;
    sendDigest('digest:done', { code: 1, error: err.message });
  });
  proc.on('close', (code) => {
    digestProc = null;
    appLog('digest', 'run finished', { code: code, files: digestFiles().length });
    sendDigest('digest:done', { code: code, files: digestFiles() });
  });
  return { ok: true, pid: proc.pid };
});

ipcMain.handle('digest:cancel', () => {
  if (!digestProc) return { ok: false };
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(digestProc.pid), '/T', '/F'], { windowsHide: true });
    } else {
      digestProc.kill('SIGTERM');
    }
    appLog('digest', 'run cancelled', { pid: digestProc.pid });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('digest:files', () => digestFiles());

ipcMain.handle('digest:open', async (_e, name) => {
  const full = path.resolve(DIGEST_OUT, path.basename(String(name || '')));
  if (!full.startsWith(DIGEST_OUT) || !fs.existsSync(full)) return { ok: false };
  const err = await shell.openPath(full);
  return err ? { ok: false, error: err } : { ok: true };
});

ipcMain.handle('digest:pickPdfs', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose newspaper PDFs for today\u2019s digest',
    buttonLabel: 'Add these PDFs',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF newspapers', extensions: ['pdf'] }]
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('digest:config:get', () => digestConfig());

ipcMain.handle('digest:config:set', (_e, patch) => {
  const cfg = digestConfig();
  const p = patch && typeof patch === 'object' ? patch : {};
  for (const k of Object.keys(p)) {
    // web and llm are objects: merge them so saving the model never drops the feed settings.
    if ((k === 'web' || k === 'llm' || k === 'layout' || k === 'ui') && p[k] && typeof p[k] === 'object') {
      cfg[k] = Object.assign({}, cfg[k] || {}, p[k]);
    } else {
      cfg[k] = p[k];
    }
  }
  fs.writeFileSync(path.join(DIGEST_DIR, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
});

/* ------------------------------------------------------------- WAT hints */
// data/wat-hints/*.json -> { word: { simple, natural, positive, leadership,
// factual, general } }. Split per set so one file stays readable; merged here
// so the renderer only ever asks for one object.
const WAT_HINTS_DIR = path.join(DATA_DIR, 'wat-hints');

function readWatHints() {
  const out = Object.create(null);
  let files = [];
  try {
    files = fs.readdirSync(WAT_HINTS_DIR).filter((f) => /\.json$/i.test(f));
  } catch (_) {
    return out;
  }
  for (const f of files) {
    try {
      const part = JSON.parse(fs.readFileSync(path.join(WAT_HINTS_DIR, f), 'utf8'));
      for (const key of Object.keys(part)) {
        const k = String(key).toLowerCase().trim();
        if (k && part[key] && typeof part[key] === 'object') out[k] = part[key];
      }
    } catch (err) {
      console.error('[wat-hints] could not read ' + f + ':', err.message);
    }
  }
  return out;
}

ipcMain.handle('wat:hints', () => readWatHints());

// The user's own Negative / Positive / Neutral action-verb list (handwritten
// photo, 2026-10-21). Kept as data so the wording stays theirs, with the
// offline meaning attached wherever the dictionary has one.
let connectorsCache = null;

function readConnectors() {
  if (connectorsCache) return connectorsCache;
  try {
    connectorsCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'connectors.json'), 'utf8'));
  } catch (err) {
    appLog('data', 'connectors.json unreadable', { error: err.message });
    connectorsCache = { source: '', note: '', groups: [] };
  }
  return connectorsCache;
}

ipcMain.handle('connectors:list', () => {
  loadDictionary();
  const data = readConnectors();
  return {
    source: data.source || '',
    note: data.note || '',
    groups: (data.groups || []).map((g) => ({
      key: String(g.key || ''),
      label: String(g.label || ''),
      hint: String(g.hint || ''),
      items: (g.words || []).map((w) => briefEntry(String(w || '').toLowerCase().trim()))
    }))
  };
});

/* ------------------------------------------------------------------ smoke */

async function ipcClear() {
  getStore().attempts = [];
  persist();
  return true;
}

async function runSmoke() {
  const outDir = SMOKE_OUT;
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (err) {
    console.error('[smoke] screenshots disabled:', err.message);
  }
  const results = [];
  const consoleErrors = [];

  mainWindow.webContents.on('console-message', (...args) => {
    const ev = args[0];
    const level = args[1] !== undefined ? args[1] : ev && ev.level;
    const message = args[2] !== undefined ? args[2] : ev && ev.message;
    if (level === 3 || level === 'error') consoleErrors.push(String(message));
  });

  const shot = async (name) => {
    try {
      // capturePage can hand back the previously composited frame; force a
      // redraw and give the compositor a moment so each shot is current.
      mainWindow.webContents.invalidate();
      await new Promise((r) => setTimeout(r, 350));
      const img = await mainWindow.webContents.capturePage();
      const buf = img.toPNG();
      fs.writeFileSync(path.join(outDir, name + '.png'), buf);
      return require('crypto').createHash('md5').update(buf).digest('hex');
    } catch (err) {
      results.push({ step: 'screenshot:' + name, error: err.message });
      return null;
    }
  };

  const shotHashes = {};
  const takeShot = async (name) => {
    shotHashes[name] = await shot(name);
  };

  // A probe's own return value is recorded as "value", never as an assertion:
  // many probes legitimately return false (a toggle flipped back off, a session
  // being over). Only the explicit checks below decide pass or fail.
  const js = (code, label) =>
    mainWindow.webContents
      .executeJavaScript(code, true)
      .then((r) => {
        results.push({ step: label, value: r === undefined ? null : r });
        return r;
      })
      .catch((err) => {
        results.push({ step: label, error: err.message });
        return null;
      });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    await wait(500);
    await js('window.__smoke.summary()', 'summary');
    await takeShot('01-home');

    // WAT: start a set, confirm a word renders and the clock moves.
    await js('window.__smoke.startWAT(0)', 'start WAT');
    await wait(400);
    const before = await js('window.__smoke.session()', 'WAT session start');
    await takeShot('02-wat-running');
    await wait(1600);
    const after = await js('window.__smoke.session()', 'WAT session after 1.6s');
    results.push({
      step: 'WAT timer moving',
      result: before && after ? before.remaining > after.remaining : false
    });
    const watUi = await js('window.__smoke.watScreen()', 'the WAT screen');
    results.push({
      step: 'WAT has no answer box — you write in your practice copy',
      result: !!watUi && watUi.textareas === 0 && watUi.clearBtn === false,
      got: watUi && watUi.textareas
    });
    results.push({
      step: 'WAT shows one large countdown',
      result: !!watUi && watUi.clockFontPx >= 72,
      fontPx: watUi && watUi.clockFontPx
    });
    results.push({
      step: 'WAT shows a plain meaning for the word',
      result: !!watUi && watUi.meaning.length > 8,
      meaning: watUi && watUi.meaning
    });
    await js('window.__smoke.next()', 'WAT next word');
    await wait(250);
    const idx = await js('window.__smoke.session()', 'WAT session after next');
    results.push({ step: 'WAT advanced', result: idx ? idx.index === 1 : false });
    await js('window.__smoke.end()', 'end WAT');
    await wait(400);
    await js('window.__smoke.domText()', 'WAT result text');
    await takeShot('03-wat-result');

    // WAT auto-advance: shrink the per-word clock to 2s and prove the word changes on its own.
    await js('window.__smoke.setConfig({ watPerWordSec: 2 })', 'shrink WAT clock');
    await js('window.__smoke.goto("home")', 'home before auto-advance test');
    await js('window.__smoke.startWAT(1)', 'start WAT auto-advance');
    await wait(300);
    const a0 = await js('window.__smoke.session()', 'auto-advance t0');
    await wait(2600);
    const a1 = await js('window.__smoke.session()', 'auto-advance t+2.6s');
    results.push({
      step: 'WAT auto-advances on its own',
      result: !!(a0 && a1 && a1.index === a0.index + 1)
    });
    results.push({
      step: 'WAT clock stayed accurate after auto-advance',
      result: !!a1 && a1.remaining > 0 && a1.remaining <= 2000
    });
    await js('window.__smoke.setConfig({ watPerWordSec: 15 })', 'restore WAT clock');
    await js('window.__smoke.layout()', 'WAT layout');
    await takeShot('03b-wat-auto');
    await js('window.__smoke.end()', 'end WAT auto-advance run');
    await wait(300);

    // SRT
    await js('window.__smoke.goto("home")', 'go home');
    await wait(200);
    await js('window.__smoke.startSRT(0)', 'start SRT');
    await wait(400);
    await js('window.__smoke.session()', 'SRT session');
    await js('window.__smoke.layout()', 'SRT layout');
    await takeShot('04-srt-running');
    await js('window.__smoke.end()', 'end SRT');
    await wait(400);
    await takeShot('05-srt-result');

    // TAT
    await js('window.__smoke.goto("home")', 'go home again');
    await wait(200);
    await js('window.__smoke.startTAT(0)', 'start TAT');
    await wait(400);
    await js('window.__smoke.session()', 'TAT view phase');
    await takeShot('06-tat-view');
    await wait(900);
    const bundledSrc = await js('window.__smoke.tatImageSrc()', 'the bundled picture on the slide');
    const bundledDrawn = await js('window.__smoke.tatImageLoaded()', 'whether the bundled picture really rendered');
    results.push({
      step: 'the TAT slide points at a bundled picture',
      result: typeof bundledSrc === 'string' && /tat-(images|classic)/.test(bundledSrc) && /\.jpg$/.test(bundledSrc),
      src: bundledSrc ? bundledSrc.replace(/^.*(tat-(?:images|classic))/, '$1') : null
    });
    const tatUi = await js('window.__smoke.tatScreen()', 'the TAT screen');
    results.push({
      // At least the 11 plates a test needs; the bin can legitimately take plates
      // out, so the count is no longer a fixed 41.
      step: 'the classic TAT set is bundled and selected',
      result: !!tatUi && tatUi.classic >= 11 && tatUi.source === 'classic',
      classic: tatUi && tatUi.classic,
      source: tatUi && tatUi.source
    });
    results.push({
      step: 'TAT has no writing box — the story goes in your practice copy',
      result: !!tatUi && tatUi.textareas === 0 && tatUi.copyNote === true,
      got: tatUi && tatUi.textareas
    });
    results.push({
      step: 'a classic TAT plate is decoded and drawn large enough to read',
      result:
        !!tatUi &&
        !!tatUi.img &&
        tatUi.img.complete === true &&
        tatUi.img.w > 0 &&
        /tat-classic/.test(tatUi.img.src || '') &&
        !!tatUi.img.shown &&
        tatUi.img.shown.w >= 200 &&
        tatUi.img.shown.h >= 200,
      shown: tatUi && tatUi.img && tatUi.img.shown
    });
    results.push({
      step: 'the bundled picture is decoded and drawn on the slide',
      result: !!bundledDrawn && bundledDrawn.complete === true && bundledDrawn.w > 0 && bundledDrawn.h > 0,
      drawn: bundledDrawn
    });
    await js('window.__smoke.skipPhase()', 'TAT skip to writing');
    await wait(300);
    await js('window.__smoke.session()', 'TAT write phase');
    await js('window.__smoke.layout()', 'TAT layout');
    // The TAT has no typing box either - the story goes in the practice copy -
    // so there is nothing to type here; the shot below shows the note.
    await takeShot('07-tat-writing');
    await js('window.__smoke.end()', 'end TAT');
    await wait(400);
    await takeShot('08-tat-result');

    // ---- word library ----
    await js('window.__smoke.goto("library")', 'go to library');
    await wait(1200); // dictionary loads lazily on first use
    const libInfo = await js('window.__smoke.libraryInfo()', 'library info');
    results.push({ step: 'library holds a large word list', result: !!libInfo && libInfo.words > 100000 });
    results.push({ step: 'library has offline meanings', result: !!libInfo && libInfo.withDefinitions > 100000 });
    results.push({ step: 'library has a positive section', result: !!libInfo && libInfo.positive > 500 });
    results.push({ step: 'library has a negative section', result: !!libInfo && libInfo.negative > 500 });
    results.push({ step: 'dictionary loads fast enough to feel instant', result: !!libInfo && libInfo.loadMs < 5000 });
    // WordNet also carries bare numbers ("14"), ordinals ("14th"), catalogue
    // codes ("u308") and dotted forms ("a.m.", ".22 caliber"). They are not
    // practice words and used to clutter the All-words list.
    const junkWords = (dictKeys || []).filter((w) => /[0-9.]/.test(w));
    results.push({
      step: 'the word list carries no numbers, ordinals or dotted abbreviations',
      result: junkWords.length === 0,
      junk: junkWords.slice(0, 10)
    });
    // The user's handwritten Negative / Positive / Neutral verb list lives as
    // a fourth tab, with the dictionary meaning attached to every word.
    const conn = await js('window.__smoke.libraryConnectors()', 'the action-verb list');
    results.push({
      step: 'the Action-verbs tab keeps all three tone groups, each with meanings',
      result:
        !!conn &&
        conn.groups === 3 &&
        conn.labels.join(',') === 'Negative,Positive,Neutral' &&
        conn.counts.every((c) => c >= 15) &&
        conn.rows >= 60,
      got: conn
    });
    await js('window.__smoke.libraryTab("all")', 'back to All words');
    await takeShot('09-library');

    const searchRes = await js('window.__smoke.librarySearch("brav")', 'search "brav"');
    results.push({ step: 'search finds matching words', result: !!searchRes && searchRes.count > 0 });
    const buttons = await js('window.__smoke.libraryMeaningButtons()', 'meaning buttons rendered');
    results.push({ step: 'each result row has a Meaning button', result: !!buttons && buttons > 0 });

    const meaning = await js('window.__smoke.libraryMeaning("brave")', 'open meaning for brave');
    results.push({ step: 'meaning opens with real text', result: !!meaning && meaning.ok === true && meaning.text.length > 30 });
    results.push({ step: 'meaning is the correct definition', result: !!meaning && /courage|fear|brave/i.test(meaning.text) });
    await takeShot('10-library-meaning');

    const libLayout = await js('window.__smoke.libraryLayout()', 'library layout');
    results.push({ step: 'library renders word rows', result: !!libLayout && libLayout.rowCount > 0 });
    results.push({ step: 'library rows do not overlap', result: !!libLayout && libLayout.overlappingRows === 0 });
    results.push({ step: 'Meaning button sits inside its row', result: !!libLayout && libLayout.buttonInsideRow === true });
    // All words, Positive, Negative and the Action-verbs tab.
    results.push({ step: 'library shows its four tabs', result: !!libLayout && libLayout.tabs === 4 });
    results.push({ step: 'library search box renders', result: !!libLayout && !!libLayout.searchBox && libLayout.searchBox.h > 20 });

    const pos = await js('window.__smoke.libraryTab("positive")', 'positive tab');
    results.push({
      step: 'positive tab returns only positive words',
      result: !!pos && pos.sample.length > 0 && pos.sample.every(function (x) { return x.s > 0; })
    });
    const neg = await js('window.__smoke.libraryTab("negative")', 'negative tab');
    results.push({
      step: 'negative tab returns only negative words',
      result: !!neg && neg.sample.length > 0 && neg.sample.every(function (x) { return x.s < 0; })
    });
    await takeShot('11-library-negative');

    // Online lookup must be refused while the toggle is off, and work when on.
    await js('window.__smoke.librarySetOnline(false)', 'ensure online is off');
    const offRes = await js('window.__smoke.libraryOnlineFetch("courage")', 'fetch while online is off');
    results.push({
      step: 'online lookup is refused while switched off',
      result: !!offRes && offRes.ok === false && offRes.error === 'offline'
    });
    await js('window.__smoke.librarySetOnline(true)', 'turn online lookup on');
    const onRes = await js('window.__smoke.libraryOnlineFetch("courage")', 'fetch while online is on');
    results.push({
      step: 'online lookup returns words when enabled',
      result: !!onRes && onRes.ok === true && Array.isArray(onRes.words) && onRes.words.length > 10
    });
    const onMeaning = await js('window.__smoke.libraryOnlineMeaning("quixotic")', 'online meaning');
    results.push({ step: 'online meaning returns a definition', result: !!onMeaning && onMeaning.ok === true && onMeaning.senses.length > 0 });
    await js('window.__smoke.librarySetOnline(false)', 'turn online lookup back off');

    /* ===================== function coverage phase ======================
     * The run above proves the three tests work end to end. Everything below
     * exercises what it never touches: saving, reading, exporting and deleting
     * attempts, pause/resume, SRT navigation, TAT slide advance and picture
     * source, custom sets, settings persistence, the power blocker, the
     * external-link guard, and the rest of the word library. */

    await js('window.__smoke.goto("home")', 'back to the home screen');
    await wait(400);
    const baseWatSets = await js('window.__smoke.allSetCount("wat")', 'WAT sets before adding one');
    const tiles = await js('window.__smoke.clickHomeTile("wat")', 'open WAT setup from its tile');
    await wait(300);
    const setOptions = await js('window.__smoke.setupSetNames()', 'practice sets offered');
    results.push({
      step: 'a home tile opens the setup screen with its sets',
      result: tiles === true && !!setOptions && setOptions.length >= baseWatSets
    });
    const toSettings = await js('window.__smoke.clickSetupTimings()', 'Edit timings button');
    results.push({ step: 'Edit timings opens Settings', result: toSettings === 'settings' });

    /* ---- attempts, history, export ---- */
    await js('window.__smoke.goto("history")', 'history view');
    await wait(400);
    const hist = await js('window.__smoke.attemptList()', 'attempts saved by the runs above');
    results.push({ step: 'finished runs are saved to history', result: !!hist && hist.length >= 3, got: hist ? hist.length : 0 });
    const shape = hist && hist[0];
    results.push({
      step: 'a saved attempt holds a complete record',
      result:
        !!shape &&
        typeof shape.setName === 'string' &&
        shape.setName.length > 0 &&
        shape.items > 0 &&
        shape.total > 0 &&
        typeof shape.answered === 'number' &&
        !!shape.reason
    });
    const histDom = await js('window.__smoke.historyDomCount()', 'history cards rendered');
    results.push({ step: 'history renders one card per saved attempt', result: histDom === (hist ? hist.length : -1), cards: histDom });
    await takeShot('12-history');

    const opened = await js('window.__smoke.clickHistoryOpen(0)', 'View answers');
    await wait(300);
    results.push({ step: 'View answers reveals the prompts and responses', result: !!opened && (opened.qaRows > 0 || opened.galleryRows > 0) });
    const openedText = await js('window.__smoke.domText()', 'opened attempt text');
    results.push({ step: 'the opened attempt shows its real questions', result: !!openedText && openedText.length > 300 });
    await takeShot('12b-history-open');

    try { fs.unlinkSync(SMOKE_EXPORT); } catch (_) {}
    await js('window.__smoke.clickHistoryExport(0)', 'Export .txt from history');
    await wait(700);
    let exported = '';
    try { exported = fs.readFileSync(SMOKE_EXPORT, 'utf8'); } catch (_) {}
    results.push({ step: 'Export writes a real file to disk', result: exported.length > 50 });
    results.push({
      step: 'the exported file contains the attempt itself',
      result: /Set:/.test(exported) && /Answered: \d+ of \d+/.test(exported) && /(WAT|SRT|TAT)/.test(exported)
    });

    const beforeDel = await js('window.__smoke.attemptCount()', 'attempts before Delete');
    await js('window.__smoke.clickHistoryDelete(0)', 'Delete one attempt');
    await wait(600);
    const afterDel = await js('window.__smoke.attemptCount()', 'attempts after Delete');
    results.push({ step: 'Delete removes exactly one attempt', result: afterDel === beforeDel - 1, before: beforeDel, after: afterDel });

    await js('window.__smoke.clickClearAll()', 'Clear all history');
    await wait(700);
    const afterClear = await js('window.__smoke.attemptCount()', 'attempts after clearing');
    const clearedText = await js('window.__smoke.domText()', 'history text when empty');
    results.push({ step: 'Clear all history empties the list', result: afterClear === 0 });
    results.push({ step: 'empty history explains itself', result: !!clearedText && /No attempts saved yet/.test(clearedText) });

    /* ---- the result screen ---- */
    await js('window.__smoke.startWAT(0)', 'start a WAT run for the result screen');
    await wait(400);
    await js('window.__smoke.end()', 'end it early');
    await wait(600);
    const resDom = await js('window.__smoke.resultScreen()', 'result screen');
    results.push({ step: 'the result screen renders its summary', result: !!resDom && resDom.hasStat === true });
    results.push({ step: 'ending early is labelled as such', result: !!resDom && /ended early/.test(resDom.text) });
    const models = await js('window.__smoke.modelSentenceInfo()', 'model sentences on the WAT result');
    results.push({
      step: 'the WAT result lists model sentences for its words',
      result: !!models && models.words > 0 && models.rows === models.words * 5,
      words: models && models.words,
      rows: models && models.rows
    });
    const styleSet = models && models.tags ? Array.from(new Set(models.tags)).sort().join(',') : '';
    results.push({
      step: 'each word carries all five sentence styles',
      result: styleSet === 'Factual,General,Leadership,Natural,Positive',
      styles: styleSet
    });
    await takeShot('12c-result');

    try { fs.unlinkSync(SMOKE_EXPORT); } catch (_) {}
    await js('window.__smoke.clickExportResult()', 'Export from the result screen');
    await wait(700);
    let exported2 = '';
    try { exported2 = fs.readFileSync(SMOKE_EXPORT, 'utf8'); } catch (_) {}
    results.push({
      step: 'the result screen exports the model sentences too',
      result: /Meaning:/.test(exported2) && /Leadership:/.test(exported2) && /Factual:/.test(exported2)
    });

    const beforeAgain = await js('window.__smoke.attemptCount()', 'attempts before practise-again');
    await js('window.__smoke.clickAgain()', 'Practise this set again');
    await wait(500);
    const again = await js('window.__smoke.session()', 'session after practise-again');
    results.push({ step: 'Practise this set again restarts the same test', result: !!again && again.test === 'wat' && again.index === 0 });
    const afterAgain = await js('window.__smoke.attemptCount()', 'attempts after practise-again');
    results.push({ step: 'restarting does not save a second attempt', result: afterAgain === beforeAgain });

    /* ---- pause, resume, clear ---- */
    const paused = await js('window.__smoke.clickPause()', 'Pause');
    results.push({ step: 'Pause puts the run on hold', result: !!paused && paused.paused === true && paused.label === 'Resume' });
    const frozen1 = await js('window.__smoke.sessionRemaining()', 'remaining right after pausing');
    await wait(1300);
    const frozen2 = await js('window.__smoke.sessionRemaining()', 'remaining 1.3s later');
    results.push({ step: 'Pause freezes the countdown', result: frozen1 !== null && frozen1 === frozen2, held: frozen1 });
    await takeShot('12d-wat-paused');
    const resumed = await js('window.__smoke.clickPause()', 'Resume');
    results.push({ step: 'Resume clears the hold', result: !!resumed && resumed.paused === false && resumed.label === 'Pause' });
    await wait(1400);
    const runningAgain = await js('window.__smoke.sessionRemaining()', 'remaining after resuming');
    results.push({ step: 'Resume restarts the countdown from where it stopped', result: runningAgain !== null && runningAgain < frozen2 });
    const stillNoInput = await js('window.__smoke.watScreen()', 'the WAT screen after resuming');
    results.push({
      step: 'the WAT screen never gains a typing field',
      result: !!stillNoInput && stillNoInput.textareas === 0
    });

    /* ---- SRT navigation ---- */
    await js('window.__smoke.goto("home")', 'home before SRT navigation');
    await js('window.__smoke.startSRT(0)', 'start SRT for navigation');
    await wait(400);
    const srtInfo = await js('window.__smoke.session()', 'SRT session');
    const nav0 = await js('window.__smoke.srtNav()', 'SRT nav grid');
    results.push({
      step: 'SRT builds a button for every situation',
      result: !!nav0 && !!srtInfo && nav0.navButtons === srtInfo.total,
      buttons: nav0 && nav0.navButtons
    });
    await js('window.__smoke.srtClickNext()', 'Next situation');
    await wait(250);
    const nav1 = await js('window.__smoke.srtNav()', 'SRT after Next');
    results.push({ step: 'Next moves to the following situation', result: !!nav1 && nav1.index === 1 });
    results.push({
      step: 'moving on marks the situation you left as answered',
      result: !!nav1 && /^1 of \d+ answered/.test(nav1.answeredLabel),
      label: nav1 && nav1.answeredLabel
    });
    await js('window.__smoke.srtClickPrev()', 'Previous situation');
    await wait(250);
    const navPrev = await js('window.__smoke.srtNav()', 'SRT after Previous');
    results.push({ step: 'Previous moves back', result: !!navPrev && navPrev.index === 0 });
    results.push({
      step: 'the SRT screen never gains a typing field',
      result: !!navPrev && navPrev.textareas === 0 && navPrev.copyNote === true,
      got: navPrev && navPrev.textareas
    });
    const srtAnswered = await js('window.__smoke.srtAnsweredCount()', 'SRT situations worked through');
    results.push({ step: 'the run counts both situations you have been through', result: srtAnswered === 2, got: srtAnswered });
    await js('window.__smoke.srtClickNav(4)', 'jump with the nav grid');
    await wait(250);
    const navJump = await js('window.__smoke.srtNav()', 'SRT after a nav jump');
    results.push({ step: 'the nav grid jumps straight to a situation', result: !!navJump && navJump.index === 4 });
    results.push({ step: 'the nav grid marks what is answered', result: !!navJump && /2 of \d+ answered/.test(navJump.answeredLabel), label: navJump && navJump.answeredLabel });
    await takeShot('12e-srt-nav');
    await js('window.__smoke.end()', 'end the SRT run');
    await wait(500);

    /* ---- TAT slide advance and the writing phase ---- */
    await js('window.__smoke.goto("home")', 'home before TAT coverage');
    await js('window.__smoke.startTAT(0)', 'start TAT for slide coverage');
    await wait(400);
    const kinds0 = await js('window.__smoke.tatSlideKinds()', 'TAT slide kinds without pictures');
    results.push({
      step: 'TAT builds 11 picture slides plus the blank 12th slide',
      result:
        !!kinds0 &&
        kinds0.length === 12 &&
        kinds0.slice(0, 11).every(function (k) { return k === 'image' || k === 'scene'; }) &&
        kinds0[11] === 'blank',
      got: kinds0
    });
    const hiddenView = await js('window.__smoke.tatPromptHidden()', 'prompt visibility while viewing');
    results.push({ step: 'the scene is visible while you are viewing a slide', result: hiddenView === false });
    await js('window.__smoke.skipPhase()', 'skip ahead to the writing phase');
    await wait(300);
    const writeP = await js('window.__smoke.tatPhase()', 'TAT phase after skipping to writing');
    results.push({ step: 'the viewing time can be cut short to start writing', result: !!writeP && writeP.phase === 'write' });
    const hiddenWrite = await js('window.__smoke.tatPromptHidden()', 'prompt visibility while writing');
    results.push({ step: 'the scene is taken away from sight while you write', result: hiddenWrite === true });
    const peeked = await js('window.__smoke.tatClickPeek()', 'Re-show prompt');
    results.push({ step: 'Re-show prompt brings it back', result: peeked === true });
    await js('window.__smoke.tatAdvance()', 'Next slide');
    await wait(400);
    const tatP = await js('window.__smoke.tatPhase()', 'TAT after advancing');
    results.push({ step: 'TAT moves on to the next slide', result: !!tatP && tatP.index === 1 });
    results.push({ step: 'each new slide starts in the viewing phase', result: !!tatP && tatP.phase === 'view' });
    await js('window.__smoke.end()', 'end the TAT run');
    await wait(500);

    /* ---- TAT picture source ---- */
    const testImages = makeSmokeImages();
    smokePickFiles = testImages;
    const builtOk =
      testImages.length === 11 &&
      testImages.every((p) => {
        try {
          const b = fs.readFileSync(p);
          return b.length > 54 && b.toString('ascii', 0, 2) === 'BM' && b.readUInt32LE(2) === b.length && b.readUInt16LE(28) === 24;
        } catch (_) {
          return false;
        }
      });
    results.push({ step: '11 valid 24-bit picture files are ready to be chosen', result: builtOk, made: testImages.length });
    const picked = await js('window.__smoke.pickImages()', 'Add pictures');
    await wait(400);
    results.push({ step: 'Add pictures stores the files you chose', result: picked === 11, got: picked });
    const imgCount = await js('window.__smoke.imageCount()', 'pictures held in the app');
    results.push({ step: 'the app reports how many pictures it has', result: imgCount === 11 });
    await js('window.__smoke.goto("home")', 'home before picture TAT');
    await js('window.__smoke.startTAT(0)', 'start TAT with my pictures');
    await wait(500);
    const kinds1 = await js('window.__smoke.tatSlideKinds()', 'TAT slide kinds with my pictures');
    results.push({
      step: 'TAT uses my pictures once 11 or more are added',
      result: !!kinds1 && kinds1.filter(function (k) { return k === 'image'; }).length === 11
    });
    const slideSrc = await js('window.__smoke.tatImageSrc()', 'the picture shown on the slide');
    results.push({ step: 'the slide actually points at one of the chosen picture files', result: !!slideSrc && /smoke-scene-\d+/.test(slideSrc) });
    await wait(900);
    const drawn = await js('window.__smoke.tatImageLoaded()', 'whether the picture really rendered');
    results.push({
      step: 'the picture is decoded and drawn on the slide',
      result: !!drawn && drawn.complete === true && drawn.w > 0 && drawn.h > 0,
      drawn: drawn
    });
    await takeShot('12f-tat-my-pictures');
    await js('window.__smoke.end()', 'end the picture TAT');
    await wait(500);
    await js('window.__smoke.clearImages()', 'Clear pictures');
    await wait(400);
    const imgAfter = await js('window.__smoke.imageCount()', 'pictures after clearing');
    results.push({ step: 'Clear removes the added pictures', result: imgAfter === 0 });

    /* ---- the dictionary behind the library ---- */
    await js('window.__smoke.goto("library")', 'library');
    await wait(800);
    const missing = await js('window.__smoke.dictGet("zzzzqqqnotaword")', 'look up a word that is not there');
    results.push({ step: 'a missing word is reported, not crashed on', result: !!missing && missing.ok === false && missing.error === 'not-found' });
    const page1 = await js('window.__smoke.dictSearch("ab", 0, 5)', 'search page 1');
    const page2 = await js('window.__smoke.dictSearch("ab", 5, 5)', 'search page 2');
    const pageDupes = page1 && page2 ? page1.items.filter(function (i) { return page2.items.some(function (j) { return j.word === i.word; }); }).length : -1;
    results.push({ step: 'search paging returns a fresh page, not a repeat', result: pageDupes === 0 && !!page1 && page1.items.length === 5, repeats: pageDupes });
    results.push({ step: 'search tells you when more results remain', result: !!page1 && page1.hasMore === true });
    const sub = await js('window.__smoke.dictSearch("brav", 0, 40)', 'substring search');
    const subWords = sub ? sub.items.map(function (i) { return i.word; }) : [];
    results.push({ step: 'search finds words containing the text, not just prefixes', result: subWords.some(function (w) { return w.indexOf('brav') !== 0; }) });
    results.push({ step: 'search puts prefix matches first', result: subWords.length > 0 && subWords[0].indexOf('brav') === 0 });

    const randAll = await js('window.__smoke.dictRandom("all", 10)', 'random words');
    results.push({ step: 'random words come back in the number asked for', result: !!randAll && randAll.items.length === 10 });
    const randP = await js('window.__smoke.dictRandom("positive", 10)', 'random positive');
    results.push({
      step: 'random words can be limited to positive ones',
      result: !!randP && randP.items.length === 10 && randP.items.every(function (i) { return i.sentiment > 0; })
    });
    const randN = await js('window.__smoke.dictRandom("negative", 10)', 'random negative');
    results.push({
      step: 'random words can be limited to negative ones',
      result: !!randN && randN.items.length === 10 && randN.items.every(function (i) { return i.sentiment < 0; })
    });

    const pos1 = await js('window.__smoke.dictSentiment("positive", 0, 5)', 'positive page 1');
    const pos2 = await js('window.__smoke.dictSentiment("positive", 5, 5)', 'positive page 2');
    const posDup = pos1 && pos2 ? pos1.items.filter(function (i) { return pos2.items.some(function (j) { return j.word === i.word; }); }).length : -1;
    results.push({ step: 'the positive list pages without repeating', result: posDup === 0 });
    results.push({ step: 'the positive list reports its real total', result: !!pos1 && pos1.total > 1000 });
    const neg1 = await js('window.__smoke.dictSentiment("negative", 0, 5)', 'negative page 1');
    results.push({ step: 'the negative list reports its real total', result: !!neg1 && neg1.total > 1000 });
    results.push({ step: 'the negative list holds only negative words', result: !!neg1 && neg1.items.every(function (i) { return i.sentiment < 0; }) });

    /* ---- the library interface ---- */
    await js('window.__smoke.librarySearch("ab")', 'load a long result list');
    await wait(800);
    const rowsBefore = await js('window.__smoke.libraryRowCount()', 'rows before Load more');
    await js('window.__smoke.libraryClickMore()', 'Load more');
    await wait(1000);
    const rowsAfter = await js('window.__smoke.libraryRowCount()', 'rows after Load more');
    results.push({ step: 'Load more appends the next page', result: rowsAfter > rowsBefore, before: rowsBefore, after: rowsAfter });

    await js('window.__smoke.librarySearch("abandon")', 'search a single word');
    await wait(800);
    const clicked = await js('window.__smoke.libraryClickMeaning("abandon")', 'click the Meaning button in that row');
    await wait(600);
    const openText = await js('window.__smoke.libraryOpenText()', 'the definition that opened');
    results.push({
      step: 'clicking Meaning in a row opens that word definition',
      result: !!clicked && clicked.clicked === true && openText.length > 20,
      text: openText.slice(0, 60)
    });
    await takeShot('12g-library-meaning');
    await js('window.__smoke.libraryCloseMeaning("abandon")', 'click Meaning again to close it');
    await wait(500);
    const openRows = await js('window.__smoke.libraryOpenRows()', 'open definition rows');
    results.push({ step: 'clicking Meaning again closes the definition', result: openRows === 0 });

    await js('window.__smoke.libraryTypeSearch("brav")', 'type in the search box');
    await wait(1100);
    const filtered = await js('window.__smoke.libraryRows()', 'the filtered rows');
    results.push({
      step: 'typing in the search box filters the list',
      result: !!filtered && filtered.length > 0 && filtered.every(function (w) { return w.indexOf('brav') >= 0; }),
      got: filtered && filtered.length
    });
    await js('window.__smoke.libraryClickRandom()', 'Random 10 button');
    await wait(800);
    const randomRows = await js('window.__smoke.libraryRowCount()', 'rows after Random 10');
    results.push({ step: 'the Random 10 button repaints the list', result: randomRows === 10, got: randomRows });

    const posTab = await js('window.__smoke.libraryClickTab("positive")', 'click the Positive tab');
    results.push({
      step: 'the Positive tab shows only positive words',
      result: !!posTab && posTab.rows > 0 && posTab.allPositive === true,
      rows: posTab && posTab.rows
    });
    await takeShot('12h-library-positive');
    const negTab = await js('window.__smoke.libraryClickTab("negative")', 'click the Negative tab');
    results.push({
      step: 'the Negative tab shows only negative words',
      result: !!negTab && negTab.rows > 0 && negTab.allNegative === true,
      rows: negTab && negTab.rows
    });
    const allTab = await js('window.__smoke.libraryClickTab("all")', 'click back to All words');
    results.push({ step: 'the tabs switch back to all words', result: !!allTab && allTab.rows > 0 && allTab.allPositive === false });

    /* ---- the online panel, driven through the interface ---- */
    await js('window.__smoke.librarySetOnline(false)', 'make sure online lookup is off');
    await wait(600);
    const offPanel = await js('window.__smoke.libraryPanel()', 'what the panel offers while offline');
    results.push({
      step: 'while online lookup is off no fetch control is offered at all',
      result:
        !!offPanel &&
        offPanel.onlineToggle === true &&
        offPanel.fetchBtn === false &&
        offPanel.themeInput === false &&
        offPanel.saveBtn === false
    });
    await js('window.__smoke.librarySetOnline(true)', 'turn online lookup on');
    await wait(700);
    const onPanel = await js('window.__smoke.libraryPanel()', 'what the panel offers while online');
    results.push({
      step: 'turning it on reveals the theme box, the fetch button and the source links',
      result: !!onPanel && onPanel.fetchBtn === true && onPanel.themeInput === true && onPanel.externalLinks >= 2
    });
    smokeSheet.length = 0;
    const extUrl = await js('window.__smoke.clickExternal(0)', 'press a find-sources link');
    results.push({
      step: 'the find-sources buttons open an https search',
      result: typeof extUrl === 'string' && /^https:\/\//.test(extUrl) && smokeSheet.length === 1 && smokeSheet[0] === extUrl
    });
    const onFetch = await js('window.__smoke.libraryClickFetch("duty")', 'press fetch while it is on');
    results.push({
      step: 'the online panel fetches a themed word list through the interface',
      result: !!onFetch && !!onFetch.fetched && onFetch.fetched.ok === true && onFetch.fetched.words.length > 10,
      got: onFetch && onFetch.fetched && onFetch.fetched.words ? onFetch.fetched.words.length : 0
    });
    const watBeforeSave = await js('window.__smoke.allSetCount("wat")', 'WAT sets before saving the fetched list');
    await js('window.__smoke.libraryClickSaveSet()', 'Save as a WAT set');
    await wait(700);
    const watAfterSave = await js('window.__smoke.allSetCount("wat")', 'WAT sets after saving the fetched list');
    results.push({ step: 'a fetched word list can be saved as a WAT set', result: watAfterSave === watBeforeSave + 1 });
    const savedNames = await js('window.__smoke.customSetNames("wat")', 'the name of the saved set');
    results.push({
      step: 'the saved set is named after the theme you fetched',
      result: !!savedNames && savedNames.some(function (n) { return /Online: /.test(n); }),
      names: savedNames
    });
    const lastName = savedNames && savedNames.length ? savedNames[savedNames.length - 1] : null;
    const savedIsStartable = lastName
      ? await js('window.__smoke.startSetByName("wat", ' + JSON.stringify(lastName) + ')', 'start the saved online set')
      : false;
    await wait(500);
    const savedSession = await js('window.__smoke.session()', 'the saved online set running');
    results.push({
      step: 'the fetched set is genuinely startable',
      result: savedIsStartable === true && !!savedSession && savedSession.test === 'wat' && savedSession.total >= 10 && savedSession.index === 0
    });
    await js('window.__smoke.goto("library")', 'back to the library');
    await js('window.__smoke.librarySetOnline(false)', 'turn online lookup back off');
    await wait(400);

    /* ---- shuffle ---- */
    const shuffled = await js('window.__smoke.shuffleProbe(0)', 'compare an ordered and a shuffled WAT run');
    results.push({
      step: 'shuffling keeps every word and only reorders them',
      result: !!shuffled && shuffled.sameSize === true && shuffled.sameWords === true
    });
    results.push({ step: 'turning shuffle on really changes the order', result: !!shuffled && shuffled.differentOrder === true });

    /* ---- lecturette and the bundled picture library ---- */
    const lectInfo = await js('window.__smoke.lectureInfo()', 'lecturette topics');
    results.push({
      step: 'the lecturette database loads in the three-minute pattern',
      result:
        !!lectInfo &&
        lectInfo.topics >= 8 &&
        lectInfo.phases.join(',') === 'intro:30,body:120,conclusion:30',
      got: lectInfo
    });
    await js('window.__smoke.goto("lecturette")', 'open the lecturette view');
    await wait(500);
    const lectList = await js('window.__smoke.lectureListCount()', 'topic cards on the lecturette screen');
    results.push({ step: 'every bundled topic is offered', result: lectList === (lectInfo ? lectInfo.topics : -1), got: lectList });
    await takeShot('14-lecturette-list');
    const factsToggled = await js('window.__smoke.lectureToggleFacts(0)', 'open the facts tab of the first topic');
    await wait(400);
    const factsText = await js('window.__smoke.lectureOpenFactsText()', 'the facts shown');
    results.push({
      step: 'the facts tab shows the facts of a topic',
      result: factsToggled === true && !!factsText && factsText.length > 120 && /fact/i.test(factsText)
    });
    await takeShot('14b-lecturette-facts');

    /* ---- the catalogue, the search, and the current-points panel ---- */
    const lectStats = await js('window.__smoke.lectureStats()', 'the lecturette catalogue');
    results.push({
      step: 'the catalogue carries the full SSB topic list, filed by theme',
      result:
        !!lectStats &&
        lectStats.topics >= 137 &&
        lectStats.categories >= 10 &&
        lectStats.counts.curated >= 12 &&
        lectStats.counts.draft >= 40 &&
        lectStats.counts.outline >= 90 &&
        lectStats.searchField === true &&
        lectStats.categoryField === true,
      got: lectStats && lectStats.counts
    });

    const searchHits = await js('window.__smoke.lectureSearch("inflation")', 'search the catalogue');
    results.push({
      step: 'searching the catalogue narrows it to matching topics',
      result: searchHits > 0 && searchHits < (lectStats ? lectStats.topics : 0),
      got: searchHits
    });
    const clearedHits = await js('window.__smoke.lectureSearch("")', 'clear the search');
    results.push({
      step: 'clearing the search brings the whole catalogue back',
      result: clearedHits === (lectStats ? lectStats.topics : -1),
      got: clearedHits
    });

    const scriptTopic = await js('window.__smoke.lectureStartByTopic("Indigenisation")', 'open a drafted lecturette');
    await wait(500);
    const scriptText = await js('window.__smoke.lectureScriptText()', 'the drafted script');
    const scriptBody = await js('window.__smoke.lectureBodyText()', 'the phase panel beside the script');
    results.push({
      step: 'a drafted topic shows the spoken script for the phase',
      result:
        !!scriptTopic &&
        scriptTopic.source === 'draft' &&
        scriptText.length > 250 &&
        /also touch/i.test(scriptBody),
      got: { script: scriptText.length, body: scriptBody.length }
    });
    await takeShot('14f-lecturette-script');

    // Current points: seed a saved copy on disk, switch the internet off, and
    // check the panel still fills in from that copy instead of going blank.
    await js('window.__smoke.librarySetOnline(false)', 'turn online lookup off for the points panel');
    const liveTopic = await js('window.__smoke.lectureFind("Indigenisation")', 'the topic for the points test');
    if (liveTopic && liveTopic.id) {
      writeLive({
        id: liveTopic.id,
        query: 'smoke test',
        source: 'Smoke test',
        checkedAt: Date.now() - 200 * 86400000,
        points: [
          { text: 'Smoke point one — saved copy.', source: 'Smoke', date: '2026-01-01', link: '', group: 'now' },
          { text: 'Smoke point two — saved copy.', source: 'Smoke', date: '2026-01-02', link: '', group: 'india' },
          { text: 'Smoke point three — saved copy.', source: 'Smoke', date: '2026-01-03', link: '', group: 'gain' },
          { text: 'Smoke point four — saved copy.', source: 'Smoke', date: '2026-01-04', link: '', group: 'world' }
        ]
      });
    }
    await js('window.__smoke.lectureStartByTopic("Indigenisation")', 'reopen the topic with points on disk');
    await wait(900);
    const livePanel = await js('window.__smoke.lectureLive()', 'the current-points panel');
    results.push({
      step: 'current points come from the saved copy when the connection is off',
      result:
        !!livePanel &&
        livePanel.rendered === true &&
        livePanel.points >= 2 &&
        !!livePanel.res &&
        livePanel.res.ok === true &&
        livePanel.res.offline === true,
      got: livePanel && livePanel.res
    });
    await takeShot('14g-lecturette-points');
    if (liveTopic && liveTopic.id) clearLive(liveTopic.id);

    // The screen must scale with the window instead of clipping: type follows
    // --scale, the grid drops to one column when narrow, nothing overflows.
    // Windows occasionally ignores a size change while the window is still
    // settling, so a size that does not take is asked for once more.
    async function resizeWindow(w, h) {
      mainWindow.restore();
      mainWindow.setResizable(true);
      for (let attempt = 0; attempt < 3; attempt++) {
        mainWindow.setSize(w, h, false);
        await wait(400);
        const got = mainWindow.getSize();
        if (Math.abs(got[0] - w) <= 4 && Math.abs(got[1] - h) <= 4) break;
      }
      await wait(300);
    }

    const lectWide = await js('window.__smoke.lectLayout()', 'the lecturette layout at the normal size');
    await resizeWindow(960, 660);
    const smallWin = mainWindow.getSize();
    const lectSmall = await js('window.__smoke.lectLayout()', 'the lecturette layout in a small window');
    await takeShot('14h-lecturette-small');
    await resizeWindow(1560, 980);
    const largeWin = mainWindow.getSize();
    const lectLarge = await js('window.__smoke.lectLayout()', 'the lecturette layout in a large window');
    await resizeWindow(1180, 840);
    results.push({
      step: 'the lecturette fits the window and re-flows as the window is resized',
      result:
        !!lectWide &&
        lectWide.overflow === false &&
        lectWide.gridColumns === 2 &&
        lectWide.dockH > 0 &&
        !!lectSmall &&
        lectSmall.viewport.w < lectWide.viewport.w &&
        lectSmall.gridColumns === 1 &&
        lectSmall.overflow === false &&
        lectSmall.scale < lectWide.scale &&
        !!lectLarge &&
        lectLarge.viewport.w > lectWide.viewport.w &&
        lectLarge.gridColumns === 2 &&
        lectLarge.overflow === false &&
        lectLarge.scale > lectWide.scale,
      got: { wide: lectWide, small: lectSmall, large: lectLarge, win: { smallWin: smallWin, largeWin: largeWin } }
    });
    await js('window.__smoke.librarySetOnline(true)', 'turn online lookup back on');
    await js('window.__smoke.lectureStartByTopic("Indigenisation")', 'reopen after clearing the seeded points');
    await wait(400);

    const startedLect = await js('window.__smoke.lectureStart(0)', 'start a lecturette');
    await wait(500);
    const ph0 = await js('window.__smoke.lecturePhase()', 'the first phase');
    const clock0 = await js('window.__smoke.lectureClock()', 'the clock in the intro');
    results.push({
      step: 'a lecturette starts on the 30-second intro',
      result: startedLect === 'run' && !!ph0 && ph0.phase === 'intro' && ph0.remaining <= 30 && !!clock0
    });
    const lectInputs = await js('window.__smoke.lectureHasInput()', 'typing fields in the lecturette');
    results.push({
      step: 'the lecturette has no typing field — it is spoken, with notes on paper',
      result: lectInputs === 0
    });
    const introText = await js('window.__smoke.lectureBodyText()', 'the intro content');
    results.push({
      step: 'the intro shows meaning, history and origin',
      result: !!introText && /means|meaning/i.test(introText) && /history/i.test(introText)
    });
    const lectFacts = await js('window.__smoke.lectureFactsText()', 'the facts panel');
    results.push({
      step: 'the facts panel stays at hand while speaking',
      result: !!lectFacts && lectFacts.length > 100 && /fact/i.test(lectFacts)
    });
    await takeShot('14c-lecturette-run');

    const lectPaused = await js('window.__smoke.lecturePause()', 'pause the lecturette');
    const holdA = await js('window.__smoke.lecturePhase()', 'phase while paused');
    await wait(1300);
    const holdB = await js('window.__smoke.lecturePhase()', 'phase 1.3s later');
    results.push({
      step: 'pausing freezes the lecturette clock',
      result: lectPaused === true && !!holdA && !!holdB && holdA.remaining === holdB.remaining
    });
    await js('window.__smoke.lecturePause()', 'resume the lecturette');

    const bodyPhase = await js('window.__smoke.lectureNext()', 'move to the body');
    await wait(400);
    const bodyText2 = await js('window.__smoke.lectureBodyText()', 'the body content');
    results.push({
      step: 'the body phase runs two minutes and lays out pros and cons',
      result: bodyPhase === 'body' && /advantages/i.test(bodyText2) && /disadvantages/i.test(bodyText2)
    });
    await takeShot('14d-lecturette-body');
    const conclPhase = await js('window.__smoke.lectureNext()', 'move to the conclusion');
    await wait(400);
    const conclText = await js('window.__smoke.lectureBodyText()', 'the conclusion content');
    results.push({
      step: 'the conclusion asks for challenges, precautions and an opinion',
      result: conclPhase === 'conclusion' && /challenges/i.test(conclText) && /precautions/i.test(conclText) && /opinion/i.test(conclText)
    });
    const lectDone = await js('window.__smoke.lectureFinish()', 'finish the lecturette');
    await wait(400);
    const lectSummary = await js('window.__smoke.lectureSummary()', 'the lecturette summary');
    results.push({
      step: 'finishing shows a summary of the topic practised',
      result: lectDone === 'done' && !!lectSummary && typeof lectSummary.topic === 'string' && lectSummary.topic.length > 5
    });
    await takeShot('14e-lecturette-done');

    const libCount = await js('window.__smoke.tatLibraryCount()', 'pictures in the bundled library');
    results.push({ step: 'the bundled picture library is present and large', result: libCount >= 1000, got: libCount });
    const sets = await js('window.__smoke.tatPickSets(3)', 'three independently picked picture sets');
    const setsOk = Array.isArray(sets) && sets.length === 3 && sets.every(function (s) { return Array.isArray(s) && s.length === 11; });
    let dupesInSet = 0;
    let overlap = 0;
    if (setsOk) {
      sets.forEach(function (set) { if (new Set(set).size !== set.length) dupesInSet++; });
      for (let i = 1; i < sets.length; i++) {
        const prev = new Set(sets[i - 1]);
        overlap += sets[i].filter(function (id) { return prev.has(id); }).length;
      }
    }
    results.push({ step: 'a TAT set never repeats a picture inside itself', result: setsOk && dupesInSet === 0, sets: sets });
    results.push({ step: 'consecutive TAT sets hold back the pictures just seen', result: setsOk && overlap === 0, overlap: overlap });
    await js('window.__smoke.goto("home")', 'back to the home screen');
    await wait(300);

    /* ---- settings, custom sets, persistence ---- */
    await js('window.__smoke.goto("settings")', 'settings view');
    await wait(500);
    await takeShot('13-settings');

    const numSet = await js('window.__smoke.settingsSetNum("watPerWordSec", 12)', 'change the WAT timing');
    results.push({ step: 'editing a timing field updates the app', result: numSet === 12 });
    const clampedVal = await js('window.__smoke.settingsSetNum("watPerWordSec", 9999)', 'type an impossible timing');
    const clampedShown = await js('window.__smoke.settingsNumValue("watPerWordSec")', 'the field after clamping');
    results.push({ step: 'an impossible timing is clamped instead of stored', result: clampedVal === 60 && clampedShown === '60' });
    await js('window.__smoke.settingsSetNum("watPerWordSec", 15)', 'put the standard timing back');
    await wait(300);
    // Start from a known state: this machine's store may already have shuffle on.
    await js('window.__smoke.setConfig({ shuffleWAT: false })', 'make sure shuffle starts off');
    await wait(300);
    const flipped = await js('window.__smoke.settingsToggle("shuffleWAT")', 'flip a toggle');
    results.push({ step: 'a settings toggle flips', result: flipped === true });
    await js('window.__smoke.settingsToggle("shuffleWAT")', 'flip it back');
    await wait(400);
    const savedCfg = await js('window.__smoke.configFromDisk()', 'read the saved settings back');
    results.push({
      step: 'settings are really written to the store',
      result:
        !!savedCfg &&
        savedCfg.watPerWordSec === 15 &&
        savedCfg.shuffleWAT === false &&
        savedCfg.srtTotalMin === 30 &&
        savedCfg.tatViewSec === 30 &&
        savedCfg.tatWriteSec === 240
    });

    const added = await js(
      'window.__smoke.settingsAddCustom("wat", "Smoke practice set", ["alpha", "bravo", "charlie"])',
      'add a practice set of your own'
    );
    await wait(600);
    const names = await js('window.__smoke.customSetNames("wat")', 'your saved sets');
    results.push({
      step: 'a set you add yourself is stored',
      result: added === true && !!names && names.indexOf('Smoke practice set (mine)') >= 0,
      names: names
    });
    const setCount = await js('window.__smoke.allSetCount("wat")', 'total WAT sets after adding');
    results.push({ step: 'your set is added to the usable sets', result: setCount === baseWatSets + 2, got: setCount, base: baseWatSets });
    const startedCustom = await js('window.__smoke.startSetByName("wat", "Smoke practice set (mine)")', 'start your own set');
    await wait(500);
    const customSession = await js('window.__smoke.session()', 'your set running');
    results.push({
      step: 'a set you added yourself can be practised',
      result: startedCustom === true && !!customSession && customSession.total === 3 && customSession.prompt === 'alpha'
    });

    // A name you type is shown as text, never as markup.
    await js('window.__smoke.goto("settings")', 'settings for the escaping check');
    await wait(500);
    const htmlName = '"><img src=x id=pwned onerror="window.__xssed=1">';
    await js(
      'window.__smoke.settingsAddCustom("srt", ' + JSON.stringify(htmlName) + ', ["one situation"])',
      'add a set whose name contains HTML'
    );
    await wait(600);
    const xss = await js('window.__smoke.xssProbe()', 'check for injected markup');
    const settingsText = await js('window.__smoke.settingsText()', 'settings text with that odd name');
    results.push({ step: 'a set name containing HTML is not run as HTML', result: !!xss && xss.pwned === false && xss.flag === false });
    results.push({ step: 'the same name is still shown to you as plain text', result: !!settingsText && settingsText.indexOf('<img src=x') >= 0 });

    await js('window.__smoke.settingsClearCustom("wat")', 'Remove all WAT custom sets');
    await wait(600);
    const watCustom = await js('window.__smoke.customSetNames("wat")', 'your WAT sets after removing');
    results.push({ step: 'Remove all clears your custom sets', result: !!watCustom && watCustom.length === 0 });
    await js('window.__smoke.settingsClearCustom("srt")', 'Remove all SRT custom sets');
    await wait(500);
    const srtCustom = await js('window.__smoke.customSetNames("srt")', 'your SRT sets after removing');
    results.push({ step: 'Remove all works per test', result: !!srtCustom && srtCustom.length === 0 });
    /* ---- appearance: the two palettes, through the real buttons ---- */
    const themeUi = await js('window.__smoke.settingsThemeUi()', 'the Appearance section');
    results.push({
      step: 'Settings offers both palettes and marks the shipped one',
      result: !!themeUi && themeUi.mist === true && themeUi.alpine === true && themeUi.selected === 'mist',
      got: themeUi
    });
    const pressedLight = await js('window.__smoke.clickTheme("alpine")', 'press Alpine light');
    await wait(500);
    const afterLight = await js('window.__smoke.themeProbe()', 'the palette after pressing it');
    results.push({
      step: 'pressing Alpine light really switches the palette',
      result: !!pressedLight && !!afterLight && afterLight.name === 'alpine' && afterLight.bg === '#e8f1ec',
      got: afterLight && afterLight.name
    });
    const themeUi2 = await js('window.__smoke.settingsThemeUi()', 'the buttons after switching');
    results.push({
      step: 'the palette you chose is the one marked in Settings',
      result: !!themeUi2 && themeUi2.selected === 'alpine',
      got: themeUi2 && themeUi2.selected
    });
    await js('window.__smoke.clickTheme("mist")', 'press Mist dark');
    await wait(500);

    const backHome = await js('window.__smoke.clickSettingsBack()', 'the Back button');
    results.push({ step: 'the Back button returns home', result: backHome === 'home' });

    /* ---- the dashboard, the bin, add material and the news ---- */
    await js('window.__smoke.goto("home")', 'back to the dashboard');
    await wait(600);
    const dash = await js('window.__smoke.dashInfo()', 'the dashboard tiles');
    results.push({
      step: 'the dashboard carries every section as a tile, with no settings menu in the top bar',
      result:
        !!dash &&
        dash.tiles === 10 &&
        dash.settingsInTopBar === false &&
        dash.topLinks === 1 &&
        dash.selected !== null &&
        // The dashboard sits on whatever palette is selected; the shipped
        // default is the Mist ground.
        dash.bg === '#0e1a15',
      got: dash
    });
    results.push({
      step: 'the highlighted tile carries a running light animation',
      result: !!dash && dash.ringAnimation === 'ring-spin',
      got: dash && dash.ringAnimation
    });
    const keyRight = await js('window.__smoke.dashKey("ArrowRight")', 'right arrow on the dashboard');
    const keyDown = await js('window.__smoke.dashKey("ArrowDown")', 'down arrow on the dashboard');
    results.push({
      step: 'arrow keys move the highlight between tiles and stop the auto-rotation',
      result:
        !!keyRight &&
        keyRight.selected !== (dash && dash.selected) &&
        !!keyDown &&
        keyDown.selected !== keyRight.selected &&
        keyRight.auto === false,
      got: { from: dash && dash.selected, right: keyRight, down: keyDown }
    });
    await takeShot('01b-dashboard');

    // The TAT setup screen leads straight to the place where a wrong picture is
    // removed, so the fix is one click from the test that showed it.
    await js('window.__smoke.clickHomeTile("tat")', 'open TAT setup from its tile');
    await wait(400);
    const toManage = await js('window.__smoke.clickSetupManagePics()', 'Review / remove on the TAT setup');
    results.push({
      step: 'the TAT setup screen leads straight to removing a wrong picture',
      result: toManage === 'add',
      got: toManage
    });

    // Bin: take a classic plate out, put it back, then take it out for good.
    await js('window.__smoke.goto("home")', 'home before the bin test');
    await wait(400);
    const classicBefore = await js('window.__smoke.tatClassicCount()', 'classic plates before the bin test');
    const dropped = await js('window.__smoke.binDrop("classic", 0)', 'move a classic plate to the bin');
    await wait(900);
    const classicAfter = await js('window.__smoke.tatClassicCount()', 'classic plates after moving one out');
    await js('window.__smoke.goto("bin")', 'open the bin');
    await wait(600);
    const binOne = await js('window.__smoke.binInfo()', 'the bin after one removal');
    await takeShot('17-bin');
    await js('window.__smoke.binRestore(' + JSON.stringify(dropped && dropped.id) + ')', 'restore the picture');
    await wait(900);
    const classicRestored = await js('window.__smoke.tatClassicCount()', 'classic plates after restoring');
    const binEmpty = await js('window.__smoke.binInfo()', 'the bin after restoring');
    results.push({
      step: 'a wrong picture leaves the test, waits in the bin, and comes back on restore',
      result:
        !!dropped &&
        classicAfter === classicBefore - 1 &&
        binOne.items === 1 &&
        binOne.restoreButtons === 1 &&
        binOne.purgeButtons === 1 &&
        classicRestored === classicBefore &&
        binEmpty.items === 0,
      got: { classicBefore, classicAfter, binOne, classicRestored }
    });
    await js('window.__smoke.goto("home")', 'home before the permanent-delete test');
    await wait(400);
    const dropped2 = await js('window.__smoke.binDrop("classic", 0)', 'move a plate out again');
    await wait(900);
    await js('window.__smoke.binPurge(' + JSON.stringify(dropped2 && dropped2.id) + ')', 'delete it for good');
    await wait(900);
    const afterPurge = await js('window.__smoke.binInfo()', 'the bin after deleting for good');
    const classicPurged = await js('window.__smoke.tatClassicCount()', 'classic plates after the permanent delete');
    results.push({
      step: 'delete forever removes the picture and its copy, and it stays out of the test',
      result: !!dropped2 && afterPurge.items === 0 && classicPurged === classicBefore - 1,
      got: { dropped2, afterPurge, classicPurged }
    });

    // Leave the plates exactly as they were found: undo only the picture this run
    // deleted, so a real user's earlier decisions are untouched.
    await js('window.__smoke.goto("bin")', 'bin before undoing the permanent delete');
    await wait(500);
    const undone = await js(
      'window.__smoke.binResurrect(' + JSON.stringify(dropped2 && dropped2.id) + ')',
      'undo that one permanent delete'
    );
    await wait(900);
    const classicReset = await js('window.__smoke.tatClassicCount()', 'classic plates after undoing the delete');
    results.push({
      step: 'a permanent delete can be undone for that picture alone',
      result: undone === true && classicReset === classicBefore,
      got: { undone, classicReset, classicBefore }
    });

    // Add material: pictures, plus a pasted word list with validation.
    await js('window.__smoke.goto("add")', 'open Add material');
    await wait(400);
    const addUi = await js('window.__smoke.addInfo()', 'the add-material screen');
    const validN = await js(
      'window.__smoke.validWordCount("courage\\nduty\\n!bad\\ncourage\\nteamwork")',
      'word-list validation'
    );
    results.push({
      step: 'Add material offers TAT pictures and a WAT word list, and rejects lines that are not words',
      result:
        !!addUi &&
        addUi.addPics === true &&
        addUi.wordBox === true &&
        addUi.addSet === true &&
        addUi.picks > 0 &&
        validN === 3,
      got: { addUi, validN }
    });
    await js('window.__smoke.addWords("courage\\nduty\\nteamwork")', 'add a word list');
    await wait(500);
    const addAfter = await js('window.__smoke.addInfo()', 'word lists after adding');
    results.push({
      step: 'a pasted word list becomes a WAT set of your own',
      result: !!addAfter && addAfter.watSets === (addUi ? addUi.watSets + 1 : -1),
      got: addAfter
    });
    await js('window.__smoke.addWordsRemove("Smoke words")', 'remove the test word list');
    await wait(400);
    await takeShot('18-add-material');

    // News: grouped points on a lecturette, and a real headline on a WAT word.
    await js('window.__smoke.librarySetOnline(false)', 'internet off for the news checks');
    const newsTopic = await js('window.__smoke.lectureFind("Indigenisation")', 'the topic for the grouped points');
    if (newsTopic && newsTopic.id) {
      writeLive({
        id: newsTopic.id,
        query: 'smoke test',
        source: 'Smoke test',
        checkedAt: Date.now() - 200 * 86400000,
        points: [
          { text: 'The sector reports a rise in output this quarter.', source: 'Smoke', date: '2026-01-01', link: '', group: 'now' },
          { text: 'India approves a new round of contracts.', source: 'Smoke', date: '2026-01-02', link: '', group: 'india' },
          { text: 'Indian firms gain export orders and jobs.', source: 'Smoke', date: '2026-01-03', link: '', group: 'gain' },
          { text: 'Global suppliers watch the same market.', source: 'Smoke', date: '2026-01-04', link: '', group: 'world' }
        ]
      });
    }
    await js('window.__smoke.goto("lecturette")', 'open the lecturette list');
    await js('window.__smoke.lectureStartByTopic("Indigenisation")', 'start the topic with grouped points');
    await wait(1000);
    const groupHeads = await js('window.__smoke.lectureNewsGroups()', 'the grouped points headings');
    results.push({
      step: 'the news panel groups points: what is happening, India, what India gains, and the world',
      result:
        Array.isArray(groupHeads) &&
        groupHeads.length === 4 &&
        /India is affected/i.test(groupHeads.join(' ')) &&
        /gains/i.test(groupHeads.join(' ')) &&
        /world/i.test(groupHeads.join(' ')),
      got: groupHeads
    });
    await takeShot('14i-lecture-news');
    if (newsTopic && newsTopic.id) clearLive(newsTopic.id);

    const seeded = seedNewsIndex([
      { text: 'A young officer showed courage when the bridge collapsed.', source: 'Smoke Paper', date: '2026-01-05', link: '' },
      { text: 'Duty hours are under review for emergency staff.', source: 'Smoke Paper', date: '2026-01-06', link: '' }
    ]);
    const newsRead = await js('window.__smoke.newsRefresh(true)', 'read the saved headline index');
    const newsLine = await js('window.__smoke.newsLine("courage")', 'a news line for a WAT word');
    results.push({
      step: 'a WAT word gets a real, attributed news example when a headline contains it',
      result:
        seeded === true &&
        !!newsRead &&
        newsRead.ok === true &&
        !!newsLine &&
        /courage/i.test(newsLine.text) &&
        newsLine.source === 'Smoke Paper',
      got: { seeded, newsRead, newsLine }
    });
    await js('window.__smoke.startWAT(0)', 'run a WAT set to see the news line in the result');
    await wait(400);
    await js('window.__smoke.end()', 'end the WAT run');
    await wait(500);
    const newsRows = await js('window.__smoke.newsRows()', 'news lines on the WAT result');
    results.push({
      step: 'the WAT result shows the news line beside the five model sentences',
      result: typeof newsRows === 'number' && newsRows >= 1,
      got: newsRows
    });
    clearNewsIndex();
    await js('window.__smoke.librarySetOnline(true)', 'turn online lookup back on after the news checks');
    await js('window.__smoke.goto("home")', 'home after the news checks');
    await wait(300);

    /* ---- navigation and the guards ---- */
    const navHist = await js('window.__smoke.clickNav("history")', 'the History nav link');
    results.push({ step: 'the top navigation switches views', result: navHist === 'history' });
    const navLib = await js('window.__smoke.clickNav("library")', 'the Word library nav link');
    results.push({ step: 'every nav link works', result: navLib === 'library' });
    await js('window.__smoke.clickNav("home")', 'back home');

    const wakeOn = await js('window.__smoke.keepAwake(true)', 'keep the display awake');
    const wakeOff = await js('window.__smoke.keepAwake(false)', 'release the display');
    results.push({ step: 'the display-sleep blocker switches on and off', result: wakeOn === true && wakeOff === false });

    smokeSheet.length = 0;
    await js('window.__smoke.openExternal("https://example.com/ssb")', 'open an https link');
    results.push({ step: 'https links are handed to the system browser', result: smokeSheet.length === 1 });
    await js('window.__smoke.openExternal("javascript:alert(1)")', 'try a javascript: link');
    await js('window.__smoke.openExternal("file:///C:/Windows/System32/calc.exe")', 'try a file: link');
    await js('window.__smoke.openExternal("data:text/html,<h1>x")', 'try a data: link');
    results.push({ step: 'javascript:, file: and data: links are refused', result: smokeSheet.length === 1, opened: smokeSheet.slice() });

    const finalCfg = await js('window.__smoke.configFromDisk()', 'settings after all of this');
    results.push({
      step: 'the app is left on standard timings with online lookup on',
      result:
        !!finalCfg &&
        finalCfg.watPerWordSec === 15 &&
        finalCfg.srtTotalMin === 30 &&
        finalCfg.tatViewSec === 30 &&
        finalCfg.tatWriteSec === 240 &&
        finalCfg.onlineEnabled === true
    });
    const finalImgs = await js('window.__smoke.imageCount()', 'pictures at the end');
    results.push({ step: 'no test pictures are left behind', result: finalImgs === 0 });

    /* ---- boot data ---- */
    const boot = await js('window.__smoke.bootCheck()', 'the data packs the app loaded');
    /* ---- the log and the in-app diagnostics screen ---- */
    await js('window.__smoke.logAppend("smoke", "marker-8f3a2")', 'write a line to the log');
    await wait(300);
    const logTail = await js('window.__smoke.logTail(80)', 'read the log back');
    results.push({
      step: 'the app writes a persistent log file on disk',
      result: !!logTail && /marker-8f3a2/.test(logTail.text || '') && (logTail.total || 0) > 0,
      lines: logTail && logTail.total
    });
    await js('window.__smoke.goto("diagnostics")', 'open Diagnostics');
    await wait(700);
    const diagUi = await js('window.__smoke.diagUi()', 'the diagnostics screen');
    results.push({
      step: 'Diagnostics shows environment, data, flow and the live log',
      result: !!diagUi && diagUi.rows >= 20 && diagUi.flowSteps === 6 && diagUi.saveBtn === true && /marker-8f3a2/.test(diagUi.log || ''),
      rows: diagUi && diagUi.rows
    });
    const diagBtn = await js(
      "(function(){var b=document.getElementById('diagSave');if(!b)return null;var s=getComputedStyle(b);" +
        "return {color:s.color,bg:s.backgroundColor,img:s.backgroundImage};})()",
      'the primary button style'
    );
    results.push({
      // Mist paints primary buttons in its bright explorer green, so the ink
      // goes dark: #07130c on #64bf71 is 8.7:1 and on the gradient's far stop
      // #3f9e60 is 5.6:1 - both comfortably readable.
      step: 'primary buttons carry dark ink on the bright Mist green',
      result:
        !!diagBtn &&
        diagBtn.color === 'rgb(7, 19, 12)' &&
        /100, 191, 113/.test(diagBtn.img) &&
        /63, 158, 96/.test(diagBtn.img),
      got: diagBtn
    });
    const diagInfo = await js('window.__smoke.diagInfo()', 'diagnostics data counts');
    results.push({
      step: 'diagnostics reports the same data the app is using',
      // 43 = the 41 bundled plates plus the two drawings the user supplied on
      // 2026-10-21. This is a literal on purpose: the check is that diagnostics
      // reports real numbers, not numbers read back from the same function.
      result: !!diagInfo && diagInfo.data.classicPictures === 43 && diagInfo.data.watHints === 238 && diagInfo.data.museumPictures === 2001,
      got: diagInfo && diagInfo.data
    });
    await takeShot('16-diagnostics');
    // The save dialog is stubbed to SMOKE_EXPORT under --smoke, so the report
    // path is exercised for real: the file must exist and contain the log.
    const savedReport = await js('window.api.diagSave()', 'save a diagnostics report');
    let reportText = '';
    try {
      reportText = fs.readFileSync(SMOKE_EXPORT, 'utf8');
    } catch (_) {}
    results.push({
      step: 'Save report writes a complete diagnostics file',
      result:
        !!(savedReport && savedReport.saved) &&
        /SSB Prep Trainer — diagnostics report/.test(reportText) &&
        /== Environment ==/.test(reportText) &&
        /== Recent log/.test(reportText) &&
        /marker-8f3a2/.test(reportText),
      bytes: reportText.length
    });
    await js('window.__smoke.goto("settings")', 'back to settings');
    await wait(300);

    /* ---- the separate news-digest engine ---- */
    const dgStatus = await js('window.__smoke.digestStatusInfo()', 'digest engine status');
    results.push({
      step: 'the separate digest engine is found with Python and its libraries',
      result: !!dgStatus && dgStatus.python === true && !!(dgStatus.deps && dgStatus.deps.ok),
      got: dgStatus && dgStatus.pythonVersion
    });
    await js('window.__smoke.goto("digest")', 'open the News Digest tab');
    await wait(700);
    const dgUi = await js('window.__smoke.digestUi()', 'the digest screen');
    results.push({
      step: 'the News Digest tab offers the build controls and live animation',
      result: !!dgUi && dgUi.runBtn === true && dgUi.dateInput === true && dgUi.monitor === true && dgUi.radar === true && dgUi.tile === true
    });
    await takeShot('15-digest');
    const dgExec = await js('window.__smoke.digestExec(["files","--plain"])', 'run a real digest command');
    results.push({
      step: 'the Python engine executes from inside the app',
      result: !!dgExec && dgExec.code === 0,
      code: dgExec && dgExec.code,
      log: dgExec && String(dgExec.log || '').slice(-200)
    });
    const watAfterDigest = await js('window.__smoke.allSetCount("wat")', 'SSB sets after using the digest');
    results.push({ step: 'the digest engine does not touch the SSB data', result: watAfterDigest >= 4, got: watAfterDigest });
    await js('window.__smoke.goto("home")', 'back home after the digest');
    await wait(300);

    const theme = await js('window.__smoke.themeProbe()', 'the app theme');
    results.push({
      // The Mist palette (dark, from the Windows 11 theme this app follows)
      // replaced the white page; the check proves the ground, the ink and a
      // contrast that body copy can actually be read at.
      step: 'the app runs on the Mist dark palette, not a white page',
      result:
        !!theme &&
        theme.name === 'mist' &&
        theme.accent === '#64bf71' &&
        theme.bg === '#0e1a15' &&
        theme.text === '#e6efe9' &&
        theme.bodyColor === 'rgb(230, 239, 233)' &&
        theme.contrast >= 7,
      got: theme
    });

    await js('window.__smoke.setTheme("alpine")', 'switch to Alpine light');
    await wait(350);
    const alpineTheme = await js('window.__smoke.themeProbe()', 'the light theme');
    results.push({
      step: 'the sage light palette is one switch away and still high contrast',
      result:
        !!alpineTheme &&
        alpineTheme.name === 'alpine' &&
        alpineTheme.accent === '#2f7150' &&
        alpineTheme.bg === '#e8f1ec' &&
        alpineTheme.text === '#12251b' &&
        alpineTheme.contrast >= 7,
      got: alpineTheme
    });
    await js('window.__smoke.setTheme("mist")', 'switch back to Mist');
    await wait(350);
    const mistBack = await js('window.__smoke.themeProbe()', 'the palette after switching back');
    results.push({
      step: 'switching the theme back leaves Mist as it was',
      result: !!mistBack && mistBack.name === 'mist' && mistBack.bg === '#0e1a15',
      got: mistBack && mistBack.name
    });

    const hints = await js('window.__smoke.hintsInfo()', 'the WAT model-sentence data');
    results.push({
      step: 'every built-in WAT word has a plain meaning and five model sentences',
      result: !!hints && hints.words >= 238,
      got: hints
    });

    results.push({
      step: 'all three test data packs load with their full content',
      result:
        !!boot &&
        boot.watSets > 0 &&
        boot.srtSets > 0 &&
        boot.tatSets > 0 &&
        boot.watItems >= 60 &&
        boot.srtItems >= 60 &&
        boot.tatScenes >= 11 &&
        boot.tileCount === 10 &&
        boot.navLinks === 1
    });

    // Every view must have produced a distinct frame - identical hashes would
    // mean a stale capture, which would make the shots worthless as evidence.
    const hashes = Object.keys(shotHashes).map((k) => shotHashes[k]);
    const dupes = hashes.filter((h, i) => h && hashes.indexOf(h) !== i);
    results.push({ step: 'screenshots are all distinct frames', result: dupes.length === 0, distinct: hashes.length - dupes.length, total: hashes.length });

    // Leave the user a clean history - these were synthetic attempts.
    await ipcClear();
  } catch (err) {
    results.push({ step: 'smoke crash', error: err.message });
  }

  const failures = results.filter((r) => r.error || r.result === false);
  const report = { results, consoleErrors, failureCount: failures.length };
  try {
    fs.mkdirSync(SMOKE_OUT, { recursive: true });
    fs.writeFileSync(path.join(SMOKE_OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    console.error('[smoke] could not write report.json:', err.message);
  }
  console.log('=== SMOKE RESULTS ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('=== SMOKE END ===');
  app.exit(consoleErrors.length || failures.length ? 2 : 0);
}

/* ------------------------------------------------------------------- boot */

app.whenReady().then(() => {
  initLogger();
  initDigestPaths();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || SMOKE) app.quit();
});
