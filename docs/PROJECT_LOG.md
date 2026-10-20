# Project log

Newest first. Each entry records what changed, why, and what was actually verified — not what was
merely attempted. Keep this file current when you ship a change.

---

## 2026-10-20 — Mist dark palette, a theme switch, and the SRT without a typing box

**Why.** The user supplied the Windows 11 "Mist" theme (preview PNG + ZIP by WinX Customization)
and asked for the app to use it — "use the code if possible, or make the same for the app". The
sage page was still too bright for long sessions, and the same message asked for the SRT to lose
its writing box: "I will write in my copy", the way WAT and TAT already worked.

**Changed**

- `src/renderer/styles.css`
  - Every literal colour in the file is now a custom property. `:root` declares 47 colour tokens
    (ground, panels, lines, ink, accent, heading, on-accent, fields, washes, tints, tracks,
    scrollbars, shadows, the danger/ok/warn families) plus `--radius` and `--scale`. A rule below
    the token block may not hard-code a colour, because the second palette has to be able to
    follow it. Two values stay unthemed on purpose: `--frame` (`#ffffff`) and `--mat` — a
    photograph always sits on a white mat.
  - New `:root[data-theme='mist']` block redefining 45 of those tokens: `#0e1a15` ground,
    `#16261f` frosted panels, `#e6efe9` ink, `#64bf71` explorer-green accent, `#e07a63`
    terracotta for destructive actions — read out of the Mist theme's own preview image, wallpaper
    and Windhawk styler files. Plus a mist body gradient, a brighter orbiting sweep on the tiles
    and a deeper shadow under floating sheets.
  - `prefers-reduced-motion` now stops **every** animation and transition in both palettes, not
    just the dashboard ring.
  - Fixed on the way: the current situation in the SRT navigator was white text on a pale    surface; it now paints on the accent, which reads correctly in both palettes.
- `src/renderer/app.js`
  - `applyTheme()` sets `data-theme` on `<html>` at startup and again once the config arrives, and
    `setTheme()` persists the choice. **Settings → Appearance** offers Mist dark and Alpine light.
  - SRT: the `textarea` is gone. The screen shows the situation, a note saying the reaction is    written in the practice copy, and the navigator grid. A situation counts as answered when you    move away from it (`itemDone()`), so the grid, the result screen, the history row and the
    exported `.txt` report how many you have been through. Attempts typed before this change    still show their text; an empty SRT answer now reads "written in your practice copy" instead of
    "left blank", and the result screen says "answered in copy" / "not reached".
  - The set-name input in Settings lost its inline white style for the same reason (a
    `.textinput` class now draws from the token list).
  - Smoke probes: `themeProbe()` also reports the palette name, new `setTheme()` probe,
    `srtNav()` reports the textarea count and the copy note instead of a typed value, and
    `srtAnsweredCount()` counts worked-through situations.
- `src/main.js` — `defaults().theme = 'mist'`; the BrowserWindow takes the palette's ground colour
  so the first frame is already dark instead of a white flash. The smoke asserts the Mist palette
  (ground `#0e1a15`, accent `#64bf71`, ink `#e6efe9`, **15.19:1** body-text contrast), round-trips
  to Alpine light (**13.95:1**) and back, checks the dashboard sits on the shipped ground, checks
  the primary button's dark ink on the bright green (8.7:1 on the near stop, 5.6:1 on the far one),
  and the SRT steps now prove there is no typing field and that moving on marks a situation
  answered.
- `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `release/download.html`,
  `screenshots/index.html` — the two palettes and the SRT without a box; the architecture theme
  section was rewritten (it still described a white page) and its stale "online switches are off"
  line corrected.

**Verified.** Source `--smoke`: **460/460 checks, 0 failures, 0 console errors**. Packaged
`SSB Prep Trainer.exe --smoke` run **twice**: both 460/460, 0 console errors, 35/35 distinct
frames. `node tools/verify-package.js`: every packaged file byte-identical to the working tree,
41/41 classic plates, 2,001/2,001 library pictures, and no source file older than `app.asar`.
The dark ground is in the frames themselves — the dashboard frame is dominated by the
`#12211b`-family pixels. The bin, add-material, news and lecturette checks from the previous entry
all still pass unchanged.

**Build.** Portable 209,447,519 B, SHA-256 `b96d3696…`; installer 209,702,346 B, SHA-256
`7efa5288…`. `release/download.html` and the 35-frame gallery refreshed.

**Not verified, plainly.** The Mist palette was derived from the theme's preview, wallpaper and
Windhawk styler files, not from the `.msstyles` binary, so individual tints can differ slightly
from what Windows itself draws. The light palette is asserted by computed styles in both runs but
was not compared against the previous build's frames. The live Google News fetch is still only
exercised through its saved-copy path.

---

## 2026-10-20 — Dashboard, sage page, TAT bin, Add material, grouped news, PDF topics

**Why.** A second round of requests on top of the same session: import the user's
`LECTURETTE TOPICS.pdf`, make the home screen an animated tile dashboard and remove the top menu,
stop the white page glaring, let wrong TAT pictures be removed into a bin, add a place to upload TAT
pictures and WAT words, and use current news both for a sixth WAT example and for a grouped news
section at the bottom of a lecturette.

**Changed**

- `tools/import-lecturette-pdf.py` — reads the two-column PDF with `pdftotext -layout`, keeps the
  Above/Average/Below band, joins wrapped titles, de-duplicates by title and assigns one of the ten
  themes by keyword. 204 rows → **198** topics in `data/lecturette-topics-extra.json`.
- `tools/build-lecturettes.py` — merges that list with the hand-filed catalogue, skipping titles that
  already exist, so the catalogue is now **334 topics** (12 hand-written, 40 drafted scripts, 282
  outlines). No duplicate titles.
- `src/main.js`
  - TAT bin: `tatBin` and `tatGone` in the store, `tat:remove` (copies a bundled picture into
    `userData/tat-bin/`), `tat:restore`, `tat:purge` (deletes the copy and remembers the id),
    `tat:emptyBin`, `tat:resetGone`, `tat:goneCount`. Binned ids are hidden from `tat:library`,
    `tat:classic` and `tat:images`; user files are never deleted from disk.
  - `newsPoints` now tags every headline `now` / `india` / `gain` / `world` by keyword, and
    `liveSummary` returns those four groups. Up to 12 points per topic.
  - `news:index` caches 60 current-affairs headlines for three months for the WAT news line.
- `src/preload.js` — `tatBin`, `tatRemove`, `tatRestore`, `tatPurge`, `tatEmptyBin`, `tatGoneCount`,
  `tatResetGone`, `newsIndex`.
- `src/renderer/app.js`
  - `NAV` is gone: `TILES` (ten sections) drives the dashboard, the top bar keeps the name and the
    connection light plus one Dashboard button. `wireDash()`, `onDashKey()`, `selectTile()`,
    `openTile()`: a 4.5 s highlight rotation that stops on hover/focus/key, arrow-key movement sized
    by the grid's column count, Enter to open.
  - New `renderBin()` and `renderAdd()` views, with `dropPicture`, `restorePicture`, `purgePicture`,
    `validWords()` (letters only, deduped, 60 cap) and a WAT set writer.
  - `modelSentencesHtml` adds a sixth **News** line when a cached headline really contains the word,
    attributed and dated; `newsExampleFor()` does the stem match.
  - The lecture points panel renders the four news groups with headings instead of one flat list.
- `src/renderer/styles.css` — page ground `#e8f1ec` (no white background anywhere), panels
  `rgba(250,253,251,.88)`, dashboard tiles with a masked rotating conic sweep, 3D tilt on hover and
  selection, staged entry animation, `prefers-reduced-motion` respected, plus bin/add/grid styles.
- `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` — the theme invariant now says sage, not white, and
  the dashboard is documented as the only navigation. `screenshots/index.html` now lists 35 frames.
- SRT: the writing instruction text has been removed; the screen now shows only the situation,
  the navigator grid, and the note that the reaction is written in the practice copy (the way
  WAT and TAT already work).

**Verified.** Source `--smoke`: **456/456 checks, 0 failures, 0 console errors**. New assertions:

- Dashboard: 10 tiles, no Settings in the top bar, only the Dashboard link, sage ground colour,
  `ring-spin` animation running, ArrowRight/ArrowDown move the highlight and stop the rotation.
- Bin: a classic plate drops out (41 → 40), waits in the bin with restore and delete buttons,
  restores (→ 41), then a second removal and **delete forever** leaves it at 40 with an empty bin;
  the permanently deleted list offers that one picture back, and undoing it returns the set to 41.
  The run leaves the set exactly as it found it, so a real user's own deletes are not undone.
- Add material: pictures and a word box are present, `"courage/duty/!bad/courage/teamwork"`
  validates to 3 words, and adding it creates one more WAT set, which is then removed.
- News: with the internet off, a seeded topic renders all four group headings; a seeded headline
  gives the word *courage* an attributed news line, and a WAT result shows **≥1** News row.
- Theme contrast measured at **13.95:1** for body text on the sage ground (the check fails below 7).

**Build.** Portable **209,445,128 B** (`7c17cae2…`), installer **209,700,067 B** (`ae9cf563…`).
`verify-package.js`: every packaged file matches source, 41/41 plates, 2001/2001 pictures. Packaged
`--smoke` ran **twice**, both **456/456, 0 failures, 0 console errors**, 35/35 distinct frames — no
file under `src/` or `data/` is newer than `app.asar`. `release/download.html` refreshed with the two
new hashes; `screenshots/index.html` lists all 35 frames.

**Fixed during verification.** A second packaged run failed once because the first had permanently
deleted a classic plate: the store remembered it. The bin now keeps a *deleted-for-good* list with a
per-picture **Undo**, and the smoke undoes only the picture it removed. A separate check that wanted
"at least 40 plates" was corrected to the real requirement — 11 plates for a 12-slide test — because
the bin can legitimately reduce the set.

**Not verified.** The 282 outline topics still have no full script. Importing the PDF was a one-off run
on the user's file, so the tool is only exercised against it. The keyword grouping is a heuristic on
headlines, not an analysis: a point can sit in the wrong group, and the UI says so. No real Google
News fetch was exercised in this run (the saved-copy paths were). The TAT picture the user believes
is wrong could not be identified from here — the bin removes any of them, but choosing the right one
is a human decision.

---

## 2026-10-20 — Online on with an offline fallback, blur, scaling, and a real lecturette library

**Why.** Four requests in one: turn the online features on but keep everything working with no
connection, add blur/transparency to the interface, make the window scale to any screen, and build a
lecturette library from the 137-topic SSB list with current data in point form, refreshed every three
months.

**Changed**

- `src/main.js`
  - `onlineEnabled` now defaults to **true** for a fresh install, and every online call still returns a
    local answer when the network is gone: `net:probe` (online/offline chip), `online:meaning` and
    `online:words` (Datamuse), `tat:online` (museum pictures), `lectures:hot` and `lectures:live`
    (Google News). All of them run in the main process, so the page's CSP stays `connect-src 'none'`.
  - `lectures:list` reads the merged catalogue `data/lecturettes.json` (falling back to
    `data/lectures.json`), and `lectures:live` / `lectures:liveStatus` serve the current points.
    Points are cached in `userData/live-data/<id>.json` + `index.json`, reused for 90 days, refreshed
    on demand or when stale, and returned flagged `offline` when the fetch cannot happen.
  - `clearLive()` exists only so the smoke run can remove the points it seeds.
- `tools/build-lecturettes.py` — merges the hand-written `lectures.json`, the drafted
  `lecturettes.part*.json` scripts and the 137-topic master list into one catalogue of 148 entries
  (12 hand-written, 40 drafted scripts, 96 outlines), de-duplicating the parallel drafting runs and
  keeping the copy closest to 350–420 words. Outlines are written from a per-theme scaffold of
  questions to answer, so no topic carries a fact that was not checked.
- `src/preload.js` — `lecturesLive`, `lecturesLiveStatus`; removed a duplicated `dictRandom` key.
- `src/renderer/app.js`
  - Lecturette list: search box (caret preserved across the re-render), theme select, board select,
    source badge per card, and a facts panel that hides empty rows instead of printing "—".
  - Run screen: drafts show the spoken script for the phase in larger type, with the phase checklist
    and the quick-revision cues beside it; the **Current points** panel sits at the bottom, with the
    check date, the next-check date and a Refresh now button.
  - `fitScale()` multiplies type and spacing by `--scale` from the window size; `lectLayout()` exposes
    the result to the smoke run.
- `src/renderer/styles.css` — **the lecturette styles were missing entirely** (no `.lectcard`,
  `.lectfacts`, `.lect-grid`, `.lect-block` rules existed), which left the whole tab unstyled. Restored
  as a full section in the alpine palette, plus the new script/points/one-column rules. Frosted
  surfaces use `backdrop-filter` on the cards, top bar, run bar and chips.
- `package.json` — build sources (`lecturettes.part*.json`, `lecturette-topics.json`) are excluded from
  the asar; `lecturettes.json` and `lectures.json` ship and are hash-checked by the verifier.
- `README.md`, `docs/ARCHITECTURE.md`, `screenshots/index.html` — updated to the real counts, the
  online-on-by-default behaviour, the cache location and the current 31 frames.

**Verified.** Source and packaged `--smoke`: **403/403 checks, 0 failures, 0 console errors**, 31
distinct screenshots. New assertions: the catalogue is ≥137 topics across ≥10 themes with the three
source kinds present; search narrows and clears correctly; a drafted topic renders its script; with
the internet switched off the points panel still lists the saved copy and reports it as saved; and
resizing the window 960×660 → 1164×801 → 1560×980 gives `--scale` 0.817 → 1.024 → 1.107, a one-column
lecture grid below 1040 px, two columns above, and no app-level overflow at any size.

**Build.** Portable **209,425,253 B** (`d13ab608…`), installer **209,680,190 B** (`1a0712c4…`).
`verify-package.js`: every packaged file matches source, including the 423 KB catalogue; 41/41 plates,
2001/2001 pictures. The packaged smoke ran **twice**, both 403/403 with the same measured scale ramp.
`release/download.html` refreshed with the two new hashes.

**Fixed during verification.** The first packaged run failed the resize check because a size request
was silently ignored while the window was settling. The smoke now retries the size up to three times
and asserts the viewport actually changed, so the check tests the behaviour rather than one call.

**Not verified.** Eight points per topic come from a real Google News fetch, which the smoke cannot
exercise (it tests the saved-copy path instead, deterministically). The 40 drafted scripts carry no
figures, and 96 topics have an outline rather than a script — generating the rest needs a model run
that this session could not complete. Points are headlines with publisher and date, not summarised
facts, and the candidate still has to check them before quoting.

---

## 2026-10-19 — Alpine green and white theme

**Why.** The user asked for the interface to take its palette from a green-and-white product shot
and an Alpine forest theme, combined, while keeping text and pictures clearly legible.

**Changed**

- `src/renderer/styles.css` — new tokens: white `#ffffff`, pale sage surfaces `#f5fbf7` / `#edf6f0`,
  forest accent `#2f7150`, deep forest `#1b4a35`, text `#12251b`, muted `#5d7266`, lines
  `#d6e5dc`. Every hardcoded red/pink surface was remapped; the body carries two very pale green
  radial lights and the top bar a 3 px forest-to-white ridgeline. Cards stay white.
- Legibility is part of the theme: TAT plates now render up to `min(56vh, 520px)` instead of 300 px,
  on white with a soft shadow and no tint or overlay. Body text remains near-black green on white.
- **Destructive actions keep terracotta** `#a13c2c` so delete never reads as the green primary
  action; urgent clocks use the same hue.
- Radar, progress bars, toggles, chips, log panel and the digest monitor were recoloured to the
  green family; no blue or red UI surfaces remain.
- `tools/make-icon.js` — app icon gradient changed from blue to forest green; `build/icon.png`
  regenerated (white star unchanged).
- `src/main.js` — the smoke theme probe now asserts the alpine palette (`#2f7150`, `#ffffff`,
  `#12251b`, computed body colour) instead of the old red one.
- `release/download.html`, `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/WORKFLOW.md` and
  the screenshot gallery captions updated to describe the new theme.

**Verified.** Packaged `--smoke`: **382/382 checks, 0 failures, 0 console errors**, 28 distinct
screenshots; the theme probe returns `#2f7150` / `#ffffff` / `#12251b` and body colour
`rgb(18, 37, 27)`. The classic plate renders at **354 × 449 px** (was capped at 300 px high) and
the check now fails if it is under 200 px either way. Measured contrast: body text **16.08:1**,
muted **5.17:1**, white on forest **5.84:1**, text on pale panel **14.58:1** — all at or above WCAG
AA. Eyeballed the regenerated home, TAT view and digest screenshots. `verify-package.js`: all files
match, 41/41 plates, 2001/2001 pictures. Rebuilt installers: portable 209,376,732 B
(`7034ee70…`), installer 209,631,665 B (`5a861cea…`); download page updated and serving HTTP 200.

**Limitations.** The palette is derived from references, not copied pixel-for-pixel; there is no
image asset from either reference in the app. Small plates are not upscaled, so a 244 px source
still tops out at 244 px even though the frame is larger. Contrast was measured on the token pairs,
not every combination on every screen.

---

## 2026-10-19 — Handover: persistent log, in-app Diagnostics, docs

**Why.** The app has to be debuggable after handover to another developer or AI, without guessing
from a screenshot.

**Changed**

- `src/main.js`
  - `initLogger()` — wraps `console.log`/`console.error`, captures `uncaughtException` and
    `unhandledRejection`, writes ISO-timestamped lines to `%APPDATA%\SSB Prep Trainer\logs\app.log`,
    rotates once at 2 MB to `app.old.log`. Failure to open the log is non-fatal.
  - Lifecycle and action logging: app start (version, packaged, Electron/Chromium/Node, platform,
    user data path), window closed, config changes, attempt saves, TAT picture changes, digest
    start/exit, errors.
  - `diag:info` / `diag:save` / `log:tail` / `log:append` / `log:openFolder`.
  - `--smoke` coverage for the log and the Diagnostics screen.
  - Console lines are capped at 8,000 characters in the log. The smoke report embeds the log
    tail, so without a cap each run's log fed back into the next and the file grew geometrically.
  - `npm run smoke` now also writes `screenshots/report.json` alongside the screenshots.
- `src/preload.js` — exposed `logTail`, `logAppend`, `logOpenFolder`, `diagInfo`, `diagSave`.
- `src/renderer/app.js` — **Settings → Open diagnostics**: environment, bundled data counts, store
  state, all relevant paths, the six-step working flow, live log (3 s refresh), Save report,
  Refresh, Open log folder. Styles in `styles.css`.
- `docs/` — this log, architecture, workflow and debugging guide; `AGENTS.md` at the root.
- `README.md` — links the docs and documents the log and Diagnostics screen.

**Visual pass.** The first Diagnostics screenshot showed two defects: primary buttons inherited
dark text on the red gradient (low contrast), and long paths wrapped mid-folder in a narrow card.
`.btn.primary` now uses white ink, and the Paths card spans the full grid width with no mid-word
breaking. A new check asserts the computed button colour is white on the blood-red gradient.

**Verified.** Source and packaged `--smoke`: **382/382 checks, 0 failures, 0 console errors**, 28
distinct screenshots. The suite writes a marker through the IPC log path, reads it back from the
file, asserts Diagnostics renders 26 rows plus all six flow steps with counts matching the live
data, and saves a report through the real handler — the ~27 KB file contains environment, paths,
data, store, digest status and the log marker. Log growth measured at ~10 KB per smoke run after
the cap (previously hundreds of KB and compounding).

**Rotation verified.** Inflated `app.log` to 2,590,748 B, launched the packaged app: it moved the
file intact to `app.old.log` and started a fresh `app.log` at 16 KB beginning with `[app] start`.

`verify-package.js`: all packaged files match, 41/41 plates, 2001/2001 pictures. Both installers
rebuilt (portable 209,359,774 B, installer 209,608,297 B) and `release/download.html` refreshed with
their SHA-256 prefixes (`043d7622…`, `3db5312b…`).

---

## 2026-10-19 — Classic TAT plates; TAT writing box removed

**Why.** The user supplied a TAT PDF and a folder of pictures, and asked for TAT to stop offering a
typing box (the real test is written on paper).

**Changed**

- `tools/build-tat-classic.py` — extracts embedded images from a PDF, normalises every picture to
  JPEG, trims white borders, de-duplicates by perceptual hash, writes `data/tat-classic/` and
  `data/tat-classic.json` with per-plate source and hash.
- Result: **41 plates** — 10 from the CarePatron PDF, 31 from `C:\Users\hp\Downloads\tat`
  (33 images, 2 near-duplicates dropped). Smallest short side 244 px.
- TAT setup gained **Picture source**: Classic TAT set (41, default) / Museum library (2,001) /
  My own pictures. The recent-set holdback adapts to the pool size so all 41 cycle before a repeat.
- TAT has **no textarea and no Clear button**. The 30 s view, removal of the picture and the
  4-minute clock remain. Result screen and History show a gallery of practised slides; exports say
  “written in your practice copy”.
- `NOTICE.txt` records that the classic set is user-supplied practice material, not public domain,
  and outside the project licence.

**Verified.** Packaged `.exe`: 369/369 checks, 0 failures, 0 console errors — including classic set
selected (41), no TAT typing field, a plate decoded and drawn. `verify-package.js`: 41/41 plates,
2001/2001 museum pictures, all source files byte-identical. New builds published to
`release/download.html`.

**Limitations.** The PDF is a 6-page sample with only 10 embedded pictures. A few plates are soft
when enlarged. The set must not be redistributed.

---

## 2026-10-19 — News Digest merged as a second compartment

**Why.** The user wanted the standalone `D:\news-digest` CLI inside the app, with the CLI's options
and animations as a GUI, while keeping the original project untouched.

**Changed**

- `digest-tool/` — byte-identical copy of the engine. Shipped via `extraResources` (outside the
  asar) because Python cannot import from an asar archive.
- On launch `ensureDigestEngine()` copies the code to `%APPDATA%\SSB Prep Trainer\news-digest` and
  refreshes it on every update, while never overwriting `config.json`, drafts, inbox, state or
  output.
- Main process: Python detection (`python`, `py -3`, `python3`), dependency probe for `reportlab`,
  `pypdf`, `feedparser`, `trafilatura`, spawn with an argument array, streamed stdout/stderr,
  cancel, output listing and open.
- **News Digest** tab: date, internet on/off, war topic, newspaper PDFs, `.txt` output,
  open-when-done, Ollama mode, plus **Advanced commands** for the CLI subcommands. The terminal
  spinner, monitor and rocket were redrawn as a radar sweep, level meter, progress bar and launch
  animation.
- The SSB store and the digest folder are disjoint by design.

**Verified.** Digest status found Python and all four libraries; a real engine command executed;
packaged suite 365/365 at the time. A full digest was generated end to end from the copied engine:
**12 A4 pages**, 147 KB PDF + 40 KB text, all 12 sections. `D:\news-digest` git status clean.

**Limitations.** Python 3.9+ and the four libraries are not bundled. Ollama rewriting was never
exercised (no local model). Newspaper-PDF input was not exercised with a real PDF.

---

## Earlier — the base app

Electron shell with TAT/WAT/SRT at real SSB timings, the 149,003-word WordNet/AFINN library
(147,982 with meanings), 2,001 public-domain museum pictures, lecturette with the 30 s / 2 min / 30 s
pattern, history and export, custom sets, optional Datamuse/Google News features gated behind a
switch, strict CSP with `connect-src 'none'`, smoke suite with screenshots, NSIS + portable builds,
white/blood-red theme.

Zero runtime dependencies; `electron` and `electron-builder` only.

---

## Known limitations carried forward

- Builds are unsigned: SmartScreen warns on first run.
- Python and the digest libraries are a prerequisite for the News Digest tab.
- Ollama rewriting and real newspaper-PDF ingestion remain unexercised.
- Handwriting recognition does not exist: TAT and WAT answers are written in the user's practice
  copy, and SRT answers are typed in the app. The app records which slides/words were practised,
  not what was written on paper.
- The classic TAT set is user-supplied and must not be redistributed.
- Layout and colour are verified numerically plus screenshots; no human visual sign-off.
