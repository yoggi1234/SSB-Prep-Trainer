/*
 * Re-applies the app's own Android settings to the generated android/ folder.
 *
 * android/ is not tracked in git (`npx cap add android` regenerates it), so
 * anything set only there is lost with the folder. Everything the release APK
 * needs beyond Capacitor's template lives in the repo instead:
 *   - mobile/android-res/  launcher icons, round icons, adaptive-icon foreground,
 *                          splash screens and the icon background colour
 *   - mobile/android.json  versionCode and extra permissions
 *   - package.json         versionName (the app version)
 *
 * Run after `npx cap add android` or `npx cap sync android`:
 *   node tools/prepare-android.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'android', 'app');
const RES_SRC = path.join(ROOT, 'mobile', 'android-res');
const RES_DST = path.join(APP, 'src', 'main', 'res');

function copyDir(from, to) {
  let n = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name);
    const d = path.join(to, ent.name);
    if (ent.isDirectory()) n += copyDir(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

function main() {
  if (!fs.existsSync(APP)) {
    console.error('android/ not found: run `npx cap add android` first.');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // A byte-order mark (Windows editors add one) is not JSON; drop it.
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'mobile', 'android.json'), 'utf8').replace(/^﻿/, ''));

  // 1. version, and the app id. From 1.0.24 the app is published under
  // mobile/android.json's applicationId: the key that signed 1.0.23 (id
  // in.ssbprep.trainer) was lost, and Android only installs an update signed
  // with the same key, so the new app installs beside the old one instead.
  const gradlePath = path.join(APP, 'build.gradle');
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${cfg.versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
  if (cfg.applicationId) gradle = gradle.replace(/applicationId\s+"[^"]*"/, `applicationId "${cfg.applicationId}"`);
  fs.writeFileSync(gradlePath, gradle);

  // 2. extra permissions
  const manifestPath = path.join(APP, 'src', 'main', 'AndroidManifest.xml');
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  for (const perm of cfg.permissions || []) {
    if (!manifest.includes(`android:name="${perm}"`)) {
      manifest = manifest.replace(
        /(\s*)<uses-permission android:name="android.permission.INTERNET" \/>/,
        `$1<uses-permission android:name="android.permission.INTERNET" />$1<uses-permission android:name="${perm}" />`
      );
    }
  }
  fs.writeFileSync(manifestPath, manifest);

  // 3. icons, splash screens, icon background colour
  const files = copyDir(RES_SRC, RES_DST);

  // 4. --dev: a side-by-side test install ("SSB Prep (test)", id ...trainer.dev),
  // so a build signed with a different key never forces the real app (and the
  // attempts and sets saved in it) to be uninstalled. Without --dev the real
  // name is put back, in case the last build here was a test one.
  const stringsPath = path.join(RES_DST, 'values', 'strings.xml');
  if (!process.argv.includes('--dev')) {
    const strings = fs.readFileSync(stringsPath, 'utf8')
      .replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1SSB Prep Trainer$2')
      .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1SSB Prep Trainer$2');
    fs.writeFileSync(stringsPath, strings);
  }
  if (process.argv.includes('--dev')) {
    gradle = fs.readFileSync(gradlePath, 'utf8');
    if (!/applicationIdSuffix/.test(gradle)) {
      gradle = gradle.replace(/buildTypes\s*\{/, 'buildTypes {\n        debug {\n            applicationIdSuffix ".dev"\n        }');
      fs.writeFileSync(gradlePath, gradle);
    }
    const strings = fs.readFileSync(stringsPath, 'utf8')
      .replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1SSB Prep (test)$2')
      .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1SSB Prep (test)$2');
    fs.writeFileSync(stringsPath, strings);
    console.log('dev build: installs beside the real app as "SSB Prep (test)"');
  }

  console.log(`android prepared: ${cfg.applicationId || 'id unchanged'}, version ${pkg.version} (code ${cfg.versionCode}), ` +
    `permissions ${(cfg.permissions || []).join(', ') || 'none'}, ${files} resource files`);
}

main();
