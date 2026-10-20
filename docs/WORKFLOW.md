# Working flow

How this project is developed, tested and released. Follow it in order; every step is cheap
compared with shipping a broken installer.

## 1. Ground rules

- Windows, Git Bash. `npm install` once; the only dev dependencies are Electron and electron-builder.
- There is no compile step and no runtime dependency. Edit `src/**` or `data/**`, then restart.
- Never edit inside `release/` or inside an installed copy — those are generated.
- `D:\news-digest` is the original standalone digest project. **Do not edit it.** `digest-tool/`
  is this app's copy; changes made there are intentional and stay here.
- Preserve the alpine green/white theme and the zero-dependency rule unless the task explicitly
  changes them.

## 2. Run from source

```bash
npm install        # first time only
npm start
```

If a previous instance is still running, close it first. The app is a single window with no
hot reload: after editing main/preload, stop and `npm start` again. Renderer-only edits also need
a restart because the page is not served by a dev server.

## 3. Change loop

1. Read the relevant part of `src/main.js` (main/IPC) or `src/renderer/app.js` (screens).
2. Make the smallest change that satisfies the request.
3. `node --check src/main.js && node --check src/preload.js && node --check src/renderer/app.js`
4. `npm run smoke` — the executable specification. It must pass in full.
5. If packaging changed, `npm run dist`, then `node tools/verify-package.js`.
6. Update `docs/PROJECT_LOG.md` with what changed and why.

## 4. The smoke suite

```bash
npm run smoke
```

It launches the real window with `--smoke`, drives every feature, captures numbered screenshots
into `screenshots/`, writes `screenshots/report.json` and prints a report between
`=== SMOKE RESULTS ===` and `=== SMOKE END ===`. Exit code 0 means every check passed.

Under `--smoke` only: native open/save dialogs are stubbed and `shell.openExternal` is recorded
instead of launching a browser. No other behaviour changes.

When you add a feature, add a check. A feature without a check is not finished.

Inspect screenshots with `screenshots/index.html`. Numeric checks (computed colours, element
sizes) do not catch visual ugliness; look at the images for layout work.

## 5. Building installers

```bash
npm run dist
```

Output in `release/`:

- `SSB Prep Trainer Setup 1.0.0.exe` — installer
- `SSB-Prep-Trainer-1.0.0-portable.exe` — single file

The build takes several minutes and is unsigned. Do not claim a build succeeded from a log line;
wait for both executables to exist and then run verification.

### Verify the package

```bash
node tools/verify-package.js
```

It unpacks `release/win-unpacked/resources/app.asar` in memory and compares every tracked file
with the working tree, then counts classic plates (41), museum pictures (2001) and digest engine
files. It exits non-zero on any mismatch. Common cause of a mismatch: the build started before the
last edit. Rebuild, do not adjust the check.

### Test the packaged binary

```bash
SSB_SMOKE_OUT="$PWD/screenshots" "release/win-unpacked/SSB Prep Trainer.exe" --smoke
```

This is the real test of the real artifact: same checks, same screenshots, from inside the asar.

### Refresh the download page

`release/download.html` is a static page pointing at the two executables with their exact sizes and
SHA-256 prefixes. Update both after a rebuild:

```bash
ls -l release/*.exe
sha256sum release/*.exe
```

Then open it with `register_preview` (path inside the workspace) so the user can download.

## 6. Rebuilding bundled data

**Classic TAT plates** (from a PDF + a folder):

```bash
python tools/build-tat-classic.py --pdf path/to/tat.pdf --folder path/to/pictures
```

It normalises to JPEG, trims borders, de-duplicates by perceptual hash, writes
`data/tat-classic/` and `data/tat-classic.json`. Re-run `npm run smoke` afterwards: a check asserts
the count and that a plate decodes.

**Museum picture library** (network, resumable):

```bash
npx electron tools/build-tat-images.js 2000
```

It de-duplicates by SHA-256 of file content and rewrites the manifest periodically. Do not
regenerate this casually — it is 92 MB and takes a long time.

**WAT model sentences** live in `data/wat-hints/`. Every built-in word must keep five styles;
the smoke suite checks 238 entries and the result screen.

## 7. Release checklist

1. `node --check` on all three JS files.
2. `npm run smoke` — all checks pass, 0 console errors.
3. `npm run dist` — both executables exist.
4. `node tools/verify-package.js` — all files match.
5. Packaged `--smoke` run — all checks pass.
6. Update `release/download.html` sizes and hashes.
7. Update `README.md` and `docs/PROJECT_LOG.md`.
8. Report limitations honestly (unsigned build, Python requirement, unexercised paths).

## 8. Things that are easy to get wrong

- **Asar.** Anything read by Python must be in `extraResources`, not `files`.
- **CSP.** The renderer cannot fetch. New online behaviour belongs in `main.js`.
- **Timer drift.** Do not decrement a counter per tick; compute from a deadline.
- **Store shape.** Adding a config key requires a default in `defaults()`; otherwise old stores
  behave differently from new ones.
- **Package cache.** `release/win-unpacked` is only replaced by a completed build. Never test it
  while `npm run dist` is still running.
- **Digest engine refresh.** `ensureDigestEngine()` copies code on every launch but never
  overwrites `config.json`, drafts or output. Keep that distinction.
