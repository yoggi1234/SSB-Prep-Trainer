# AGENTS.md — working on SSB Prep Trainer

Read this before changing anything. It is the short version; details are in `docs/`.

**Stack:** Electron 44 + vanilla JS renderer. Windows. **No runtime npm dependencies and no build
step.** Python 3.9+ is used only by the optional News Digest compartment. The same renderer also
ships as an Android APK through Capacitor (`@capacitor/*` are devDependencies), with
`mobile/api.js` standing in for the Electron bridge.

## Read in this order

1. `docs/ARCHITECTURE.md` — processes, IPC, storage, packaging.
2. `docs/WORKFLOW.md` — change loop, smoke suite, build and release.
3. `docs/DEBUGGING.md` — log file, in-app Diagnostics, known failures.
4. `docs/PROJECT_LOG.md` — what changed and what was verified.
5. `NOTICE.txt` — licensing, including the user-supplied TAT set.

## Verify every change

```bash
node --check src/main.js && node --check src/preload.js && node --check src/renderer/app.js
npm run smoke                 # must be all checks, 0 failures, 0 console errors
```

If packaging is affected:

```bash
npm run dist
node tools/verify-package.js
SSB_SMOKE_OUT="$PWD/screenshots" "release/win-unpacked/SSB Prep Trainer.exe" --smoke
```

Never report a build as good from a log line alone: wait for both `.exe` files, run the verifier,
and run the packaged smoke. Never weaken a check to make it pass — a failing check is the bug.

## Invariants

- **Mist dark by default — no white page.** Two palettes share one token list at the top of
  `styles.css`: Mist (dark, shipped — `#0e1a15` ground, `#16261f` panels, `#e6efe9` ink, `#64bf71`
  accent) and Alpine light (`#e8f1ec` ground, `#f8fcfa` panels, `#12251b` ink, `#2f7150` accent),
  switched in Settings. Pure `#ffffff` is not used as a background anywhere; only TAT picture
  frames keep a white mat. Never hard-code a colour in a rule — use a token, or the second palette
  cannot follow. Green is emphasis and accent, never body copy. Terracotta/red is reserved for
  destructive actions and urgency. Verify from computed styles in the running app (the smoke
  asserts the ground colour and a 7:1 contrast for body text in both palettes, and that
  `prefers-reduced-motion` stops the animations).
- **The dashboard is the only navigation.** Sections are tiles, not a top menu: ten tiles, one
  highlighted at a time, arrow keys and Enter, and the highlight walks on its own until the person
  touches it. Add a section by adding a tile and a `render()` branch. Removing a menu item is a
  design decision, not a missing feature.
- **Offline by default.** Online switches default off; CSP is `connect-src 'none'`. New network
  code belongs in the main process behind `onlineAllowed()`.
- **Renderer is sandboxed.** `contextIsolation: true`, `nodeIntegration: false`; it talks only
  through `window.api` (preload) and IPC. Add the preload function and the main handler together.
- **Two disjoint compartments.** The SSB store and `%APPDATA%\SSB Prep Trainer\news-digest` must
  never read each other.
- **Digest engine refresh.** Code is copied on every launch; `config.json`, drafts, inbox, state
  and output are never overwritten.
- **Asar.** Anything Python touches ships via `extraResources` (`digest-tool/`), not `files`.
- **`D:\news-digest` is the original project.** Never edit it from here.
- **The classic TAT set is user-supplied** and must not be redistributed.

## Where things live

| Task | File |
| --- | --- |
| Window, store, data, dialogs, network, digest, log, smoke | `src/main.js` |
| IPC bridge (one function per channel) | `src/preload.js` |
| All screens, timers, animations | `src/renderer/app.js` |
| Theme and layout | `src/renderer/styles.css` |
| TAT/WAT/SRT/lecturette data | `data/*.json`, `data/wat-hints/` |
| Classic plates + manifest | `data/tat-classic/`, `data/tat-classic.json` |
| Digest engine (copied) | `digest-tool/` |
| Verifier | `tools/verify-package.js` |
| Android bridge (localStorage + bundled data) | `mobile/api.js`, `tools/build-mobile.js` |
| On-device scenario over adb/CDP | `tools/mobile-probe/` |
| Import tools | `tools/build-tat-classic.py`, `tools/build-tat-images.js` |
| Runtime log | `%APPDATA%\SSB Prep Trainer\logs\app.log` |

## Style

- Match the existing renderer style: `var`, string-concatenated HTML, `esc()` on every interpolated
  value, `body(...)` per screen, immediate `getElementById` wiring.
- Main process: CommonJS, `'use strict'`, small functions, comments that explain *why*.
- Timers use deadlines, not accumulated decrements.
- Keep dependencies at zero unless the task genuinely requires one; explain why in the log.

## Finish a task

1. Run the checks above.
2. Update `docs/PROJECT_LOG.md` — what changed, why, what was verified, what remains unverified.
3. Update `README.md` if user-facing behaviour changed.
4. If you rebuilt, refresh `release/download.html` sizes and SHA-256.
5. State limitations plainly. “Not exercised” is an acceptable result; “probably works” is not.
