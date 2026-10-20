/*
 * Verifies that what is inside the packaged app.asar is byte-identical to the
 * files in the working tree. Run after a build:
 *
 *   node tools/verify-package.js
 */

'use strict';

const asar = require('@electron/asar');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASAR = path.join(__dirname, '..', 'release', 'win-unpacked', 'resources', 'app.asar');

const PAIRS = [
  ['src/main.js', 'src/main.js'],
  ['src/preload.js', 'src/preload.js'],
  ['src/renderer/app.js', 'src/renderer/app.js'],
  ['src/renderer/index.html', 'src/renderer/index.html'],
  ['src/renderer/styles.css', 'src/renderer/styles.css'],
  ['data/dictionary.json', 'data/dictionary.json'],
  ['data/dictionary-meta.json', 'data/dictionary-meta.json'],
  ['data/wat.json', 'data/wat.json'],
  ['data/srt.json', 'data/srt.json'],
  ['data/tat.json', 'data/tat.json'],
  ['data/lecturettes.json', 'data/lecturettes.json'],
  ['data/lectures.json', 'data/lectures.json'],
  ['data/wat-hints/set-1.json', 'data/wat-hints/set-1.json'],
  ['data/wat-hints/set-2.json', 'data/wat-hints/set-2.json'],
  ['data/wat-hints/set-3.json', 'data/wat-hints/set-3.json'],
  ['data/wat-hints/set-4.json', 'data/wat-hints/set-4.json'],
  ['NOTICE.txt', 'NOTICE.txt']
  // package.json is deliberately excluded from the byte comparison below:
  // electron-builder rewrites it (dropping scripts/build/devDependencies), so a
  // hash difference there is expected. Its key fields are asserted separately.
];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// The asar stores entries with platform separators; try both forms.
function readFromAsar(archive, entry) {
  const candidates = [entry, entry.split('/').join('\\'), '\\' + entry.split('/').join('\\')];
  for (const c of candidates) {
    try {
      return asar.extractFile(archive, c);
    } catch (_) {
      /* try the next form */
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(ASAR)) {
    console.error('No packaged asar at ' + ASAR + ' — build first.');
    process.exit(1);
  }

  let failures = 0;

  // The packaged package.json must still point at the real entry point.
  const pkRaw = readFromAsar(ASAR, 'package.json');
  const srcPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (!pkRaw) {
    console.log('MISSING  package.json');
    failures++;
  } else {
    const pk = JSON.parse(pkRaw.toString('utf8'));
    const entryOk = pk.main === srcPkg.main;
    const versionOk = pk.version === srcPkg.version;
    const nameOk = pk.name === srcPkg.name;
    if (!entryOk || !versionOk || !nameOk) failures++;
    console.log(
      (entryOk && versionOk && nameOk ? 'OK       ' : 'MISMATCH ') +
        'package.json  main=' + pk.main + ' version=' + pk.version + ' name=' + pk.name
    );
  }

  for (const [entry, diskPath] of PAIRS) {
    const packed = readFromAsar(ASAR, entry);
    const disk = fs.readFileSync(path.join(__dirname, '..', diskPath));
    if (!packed) {
      console.log('MISSING  ' + entry + ' (not inside the package)');
      failures++;
      continue;
    }
    const ok = sha(packed) === sha(disk);
    if (!ok) failures++;
    console.log((ok ? 'MATCH    ' : 'MISMATCH ') + entry + '  ' + sha(disk).slice(0, 16));
  }

  // The bundled picture library must be inside the package in full, not a
  // sample: compare the number of images in the asar with the manifest.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tat-images.json'), 'utf8'));
  const packedImages = asar
    .listPackage(ASAR)
    .filter((f) => /tat-images.*\.(jpg|jpeg|png)$/i.test(f)).length;
  const imagesOk = packedImages === manifest.length;
  if (!imagesOk) failures++;
  console.log(
    (imagesOk ? 'OK       ' : 'MISMATCH ') +
      'bundled picture library  ' + packedImages + ' / ' + manifest.length + ' pictures'
  );

  // The classic TAT set travels inside the asar as well.
  const classicManifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'tat-classic.json'), 'utf8')
  );
  const packedClassic = asar
    .listPackage(ASAR)
    .filter((f) => /tat-classic.*\.jpg$/i.test(f)).length;
  const classicOk = packedClassic === classicManifest.length;
  if (!classicOk) failures++;
  console.log(
    (classicOk ? 'OK       ' : 'MISMATCH ') +
      'classic TAT set  ' + packedClassic + ' / ' + classicManifest.length + ' plates'
  );

  console.log('');
  console.log(failures === 0 ? 'ALL PACKAGED FILES MATCH SOURCE' : failures + ' FILE(S) DIFFER');
  process.exit(failures === 0 ? 0 : 1);
}

main();
