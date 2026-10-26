/*
 * Assembles the Android build's web assets into mobile/www.
 *
 * The renderer is the same app.js/styles.css the desktop app uses; only the
 * bridge changes (the modules in mobile/ implement window.api in the page). Practice
 * data is copied in full except the museum picture library, which is 92 MB and
 * not useful on a phone: the 43 bundled plates are the TAT pool there.
 *
 * Run: node tools/build-mobile.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const OUT = path.join(ROOT, 'mobile', 'www');

// The phone bridge, in load order: each module puts its own window.api keys on
// SSB, and api.js last assembles them. A module may rely on anything above it.
const BRIDGE = ['store.js', 'net.js', 'material.js', 'online.js', 'edition.js', 'pdf.js', 'digest.js', 'museum.js', 'platform.js', 'api.js'];

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, ent.name);
    const dest = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // The page: same markup, a CSP that allows the local bundle to fetch its own
  // data files, and the bridge loaded before app.js.
  const html = fs
    .readFileSync(path.join(SRC, 'index.html'), 'utf8')
    .replace(
      /content="default-src[^"]*"/,
      // Only the few hosts the online extras use are allowed. Everything else
      // stays locked out, exactly like the desktop CSP's connect-src 'none'.
      // img-src needs blob: because the pictures you add are shown as object URLs.
      'content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob: https://upload.wikimedia.org https://www.artic.edu; font-src \'self\' data:; connect-src \'self\' https://api.datamuse.com https://commons.wikimedia.org https://upload.wikimedia.org https://en.wikipedia.org; object-src \'none\'; base-uri \'none\'; form-action \'none\'"'
    )
    .replace(
      '<script src="app.js"></script>',
      BRIDGE.map((f) => `<script src="${f}"></script>`).join('\n    ') + '\n    <script src="app.js"></script>'
    );
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  copy(path.join(SRC, 'styles.css'), path.join(OUT, 'styles.css'));
  copy(path.join(SRC, 'app.js'), path.join(OUT, 'app.js'));
  for (const f of BRIDGE) copy(path.join(ROOT, 'mobile', f), path.join(OUT, f));

  // Practice data. The 19 MB dictionary is included so the Word library is
  // whole on the phone; it is fetched on first use, not at boot.
  const dataFiles = [
    'wat.json',
    'srt.json',
    'tat.json',
    'connectors.json',
    'tat-classic.json',
    'dictionary.json',
    'lectures.json',
    'lecturettes.json',
    // Bundled reference edition for the phone's News Digest tab: twelve
    // sections of standing context, so the tab still shows a real edition with
    // no connection and no saved copy.
    'digest-offline.json',
    'wat-hints/set-1.json',
    'wat-hints/set-2.json',
    'wat-hints/set-3.json',
    'wat-hints/set-4.json'
  ];
  for (const f of dataFiles) {
    const from = path.join(ROOT, 'data', f);
    if (fs.existsSync(from)) copy(from, path.join(OUT, 'data', f));
  }

  // The news-digest engine's own word lists (glossary, hard words, exam facts,
  // war timelines): the phone edition (mobile/edition.js) writes its pages from them.
  for (const f of ['glossary.json', 'hardwords.json', 'facts.json', 'wars.json']) {
    copy(path.join(ROOT, 'digest-tool', 'newsdigest', 'data', f), path.join(OUT, 'data', 'digest', f));
  }

  // The browser cannot list a folder, so the hint files are named in a manifest.
  const hintFiles = fs
    .readdirSync(path.join(ROOT, 'data', 'wat-hints'))
    .filter((f) => /\.json$/i.test(f) && f !== 'index.json')
    .sort();
  fs.writeFileSync(path.join(OUT, 'data', 'wat-hints', 'index.json'), JSON.stringify(hintFiles, null, 2));

  // TAT plates: only the files named in the manifest, so the build never ships
  // a picture the manifest does not describe.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tat-classic.json'), 'utf8'));
  fs.mkdirSync(path.join(OUT, 'data', 'tat-classic'), { recursive: true });
  let plates = 0;
  for (const rec of manifest) {
    const from = path.join(ROOT, 'data', 'tat-classic', rec.file);
    if (fs.existsSync(from)) {
      copy(from, path.join(OUT, 'data', 'tat-classic', rec.file));
      plates++;
    }
  }

  // PPDT pictures, the same way: only what data/ppdt.json names, plus the
  // model stories written ahead and the prompt the "write 5 stories" button uses.
  const ppdt = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ppdt.json'), 'utf8'));
  let ppdtPics = 0;
  for (const rec of ppdt) {
    const from = path.join(ROOT, 'data', 'ppdt', rec.file);
    if (fs.existsSync(from)) {
      copy(from, path.join(OUT, 'data', 'ppdt', rec.file));
      ppdtPics++;
    }
  }
  for (const f of ['ppdt.json', 'ppdt-stories.json', 'ppdt-prompt.txt']) {
    if (fs.existsSync(path.join(ROOT, 'data', f))) copy(path.join(ROOT, 'data', f), path.join(OUT, 'data', f));
  }

  const size = (() => {
    let total = 0;
    (function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else total += fs.statSync(p).size;
      }
    })(OUT);
    return total;
  })();

  console.log('mobile bundle:', OUT);
  console.log('plates:', plates, 'of', manifest.length, 'in the manifest');
  console.log('PPDT pictures:', ppdtPics, 'of', ppdt.length);
  console.log('hint files:', hintFiles.length);
  console.log('size:', (size / 1048576).toFixed(1), 'MB');
}

main();
