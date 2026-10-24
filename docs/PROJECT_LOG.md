# Project log

Newest first. Each entry records what changed, why, and what was actually verified — not what was
merely attempted. Keep this file current when you ship a change.

---

## 2026-10-24 — Release 1.0.3: new logo, signed APK, signed installer, repo audit

**Changed.** Version 1.0.3 on both builds (`package.json`; Android `versionCode 4`). The Prep SSB shield is
the app icon: `build/icon.png` for Windows, every `mipmap-*` launcher size for Android (the Android tree is
generated and untracked, so a fresh `npx cap add android` needs the icons copied again); the full logo is
`docs/logo.png` at the top of the README. README screenshots pointed at files that never existed and the
release link at v1.0.0 — both corrected. Lecture essay view, smoke checks updated (see the entry below).

**Signing.** The APK is a release build signed with a project key (`apksigner`, v2 + v3; the key and its
password live outside the repo and must be backed up — losing them means updates cannot install over this
APK). The installer and portable `.exe` carry a timestamped signature from a self-made certificate; Windows
trusts it only on a machine where the owner imports that certificate, so other PCs still see SmartScreen.

**Repo audit (public).** No keys, passwords, tokens or personal data in tracked files. The only finding was
`screenshots/report.json` holding local Windows paths; it is no longer tracked (old copies remain in git
history). The six phone bridge modules and `data/digest-offline.json` had never been committed, so the
published `mobile/api.js` could not build — they are committed now. The release carries the classic TAT
plates inside both apps; publishing them publicly was the owner's explicit decision.

**Verified.** `npm run dist` (exit 0), `tools/verify-package.js` — all packaged files match source, 43/43
plates; packaged `--smoke`: 0 failures, 0 console errors; old 1.0.0 uninstalled from Program Files and
1.0.3 installed per user (Start menu + desktop shortcuts). `apksigner verify`: v2/v3 true, one signer;
`aapt2 dump badging`: `in.ssbprep.trainer` 1.0.3 (4). **Not verified:** install on the phone (not
connected at build time).

---

## 2026-10-24 — Digest proven on Android, phone parity (bin, pictures, diagnostics), lecturette writer, smoke isolation

**Why.** The digest fallback had never been driven end to end; the phone answered `unsupported` for the TAT
bin and diagnostics and lost your pictures on close; `--smoke` ran against the person's real profile; the
desktop news points read "[object Object]"; and the user asked for "type a topic, get a 3-minute lecturette".

**Changed.**

- **Digest Refresh** (`renderPhoneDigest`): Refresh now passes `{force: true}`; before, inside 20 minutes it
  made no request and only relabelled the chip "saved copy". The dead-end copy no longer promises a saved
  edition that does not exist. Stale probe assertion in `scenarios/phone.js` replaced with the new contract.
- **Phone TAT bin** (`mobile/platform.js`, `store.js`, `material.js`, `museum.js`): remove / restore / delete
  forever / undo / empty, same rules as `src/main.js`, kept in localStorage; every source hides binned ids.
- **Your pictures persist on the phone**: kept as Blobs in IndexedDB (`ssb-mine`), recorded in the bin by a
  stable key. Found while testing: the bundle CSP had no `blob:` in `img-src`, so picked pictures never
  displayed at all — `tools/build-mobile.js` adds it.
- **Phone diagnostics**: Save copies the report to the clipboard instead of `unsupported`.
- **Lecturette writer** (both builds): `lectureFacts` (`lectures:facts` in main, `online.js` on the phone)
  reads the closest Wikipedia article — an India-titled one when its title holds every main word of the
  topic — with its last-edited date; `lectCompose` in the renderer lays it out as intro 30 s / body 2 min
  (present situation, causes, advantages, challenges, India, government steps) / conclusion 30 s, 350–420
  words, plus memory cues, a closing line and dated sources. "Your own topic" field; "Write it for me" on the
  282 outlines; saved in config (`lectWritten`, `lectOwn`). Full scripts now read as one page, not boxes.
- **Lecture screen** scrolls as one page (`.lectpage`); the run bar with the clock stays pinned.
- **Desktop**: `--smoke` now uses a throwaway profile in `%TEMP%` (it was clearing the real attempts and
  pictures and adding the rainbow test BMPs to "My pictures"); `sandbox: true`; `will-navigate` guard;
  `cleanHeadline()` read `String(row)` → every news point was "[object Object]" (lecture points and WAT
  news examples). Two smoke checks that encoded that bug / a .jpg-only plate were corrected.

**Verified.** Served `mobile/www` (Chrome) and the **Android emulator** (`ssb33`, booted this time):
digest offline → reference edition 12 sections/48 stories `bundled offline`; offline + saved copy → saved
copy; online on the emulator → **Google News native route**, 12 requests, 48 stories, `fresh`, cache
written; Refresh → 12 new requests; feeds blocked → saved copy, else reference; bundled file blocked →
corrected dead-end copy. Phone scenario on the served build 44/45 (clipboard is denied to headless Chrome;
the same check passed on the emulator): picture survives reload and decodes (64 px), bin round trip,
restore, delete forever, undo. Writer driven on the served build and inside the desktop app (temp profile;
real store mtime unchanged): 398–419-word scripts with dated sources. `npm run smoke`: 0 failures, 0 console
errors. APK rebuilt (`gradle_exit=0`) and contains every change.

**Not verified.** On the user's Motorola Edge 50 Fusion the APK installed and launched, but every scenario
stalled when the USB/adb link dropped — no phone result is claimed. Writer quality depends on Wikipedia
having an article matching the topic name; it quotes, it does not paraphrase into polished prose. Export is
still clipboard-only on the phone. The installed desktop `.exe` was not rebuilt.

---

## 2026-10-23 — The phone bridge split by concern, with one owner per surface

**Why.** `mobile/online.js` had grown to ~700 lines owning word lookups, museum art, news feeds and
the digest at once, while `mobile/api.js` still defined ten functions (`onlineStatus`, `onlineProbe`,
`onlineMeaning`, `onlineWords`, `newsIndex`, `lecturesHot`, `lecturesLive`, `lecturesLiveStatus`,
`tatLibrary`, `tatOnline`) that `online.js` then silently overwrote through an
`Object.assign(window.api, online)` retry loop. Nothing in the file that defined a function told a
reader whether it was the one that won, and the online switch was read from `ssb-config` in three
places.

**Changed.** The bridge is now one module per concern, assembled by a thin facade. `store.js`
(localStorage, settings, attempts), `net.js` (fetch/JSON/RSS, timeouts, `checkedOn` labels),
`material.js` (bundled data and dictionary), `online.js` (Datamuse, live news, per-topic points and
the online switch), `digest.js` (the phone edition, its cache, fallback chain and the desktop-only
answers), `museum.js` (Commons art in IndexedDB), `platform.js` (gallery pictures, clipboard, wake
lock, back button, diagnostics) and `api.js` (the facade). Each module exposes `SSB.<name>.api`;
the facade merges those fragments into `window.api` and throws at boot on a missing module or a key
owned twice, so a duplicate cannot silently win again. The ten shadowed stubs were deleted, and the
digest surface moved wholesale into `digest.js`. Policy that was duplicated is now in one place:
`SSB.online.enabled()` is the only reader of the online switch, used by the digest and museum too.
`tools/build-mobile.js` copies the eight files in load order and injects the same order into the
bundle's `index.html`. One correction to the brief: `digestStatus` was never shadowed — it was the
lone owner — so it was moved into the digest module rather than deleted; the ten `online*`/`tat*`
functions really were defined twice and their `api.js` copies are gone.

**Verified.** The `window.api` contract is byte-identical in shape: 60 keys at boot, the same sorted
set as before the split, every one a function except `android: true`, and `SSB` now also holds the
seven modules. Driving the bundle served from `mobile/www`: Lecturette reports 334 topics /
12 curated / 40 draft / 282 outline, opens "Agnipath Scheme…" (`agnipath`) with its 841-character
body at 00:30 intro, and "370 Article" with its 265-character outline; the digest opens the bundled
reference edition offline (12 sections, 48 stories, "bundled offline"), then after turning online on
`Refresh` builds the live Wikipedia edition ("Edition of 2026-10-23", 19 stories, 12 sections under
the portal's own headings), and the second call inside 20 minutes returns `cached: true`; TAT walks
view → write with the plates loading (`data/tat-classic/classic-040.jpg`), the prompt hidden while
writing, and both clock elements (#clock, #writeClockNum) counting down 03:37 → 03:36. Datamuse
still answers (8 senses for "duty", 10 related words for "courage"); `newsIndex` and `lecturesLive`
still return `error: 'network'` in a browser, which is the native-HTTP transport behaving as before.
Dictionary (147,417 words), connectors (3 groups), 43 plates, 238 hint words, attempts add/list/
delete and `exportText` → clipboard all unchanged. The facade guard was exercised directly in Node:
clean merge assembles 7 keys, a missing module throws `SSB module missing: museum`, a duplicate
throws `api key owned twice: onlineStatus (online, museum)`. Bundle and APK rebuilt (BUILD
SUCCESSFUL, `gradle_exit=0`); the APK contains all eight bridge files, the same script order in
`assets/public/index.html`, `data/lecturettes.json` (720,355 bytes) and `data/digest-offline.json`.
Desktop `npm run smoke`: 472 checks, `failureCount: 0`, 0 console errors.

**Not verified.** No device or emulator here, so the Capacitor WebView and the native-HTTP news
routes are still exercised only as bundled assets in a browser. `mobile/www` and `android/` are
build output and were regenerated; the debug APK is unchanged in kind and was not renamed into
`release/`.

---

## 2026-10-23 — The phone shows all 334 lecturettes, not twelve

**Why.** The APK bundles `assets/public/data/lecturettes.json` (334 topics: 12 curated, 40 drafted, 282
outlines), but the phone's Lecturette screen reported "12 topics · 0 with a full script · 12 as
outlines": `lecturesList()` in `mobile/api.js` read `lectures.json`, the old twelve-topic file, and
never looked at the catalogue it ships. The desktop has always tried `lecturettes.json` first
(`readLecturettes()` in `src/main.js`), so the two surfaces disagreed about the same data folder.

**Changed.** `mobile/api.js` `lecturesList()` now reads `lecturettes.json` and keeps `lectures.json`
as a fallback, mirroring the desktop order. That is the whole fix — the entries already carry the
fields the shared renderer reads (`source`, `intro`, `body`, `conclusion`), so no shapes, screens or
other files changed.

**Verified.** On the bundle served from `mobile/www` in a cache-free browser: the list reports
"334 topics · 52 with a full script · 282 as outlines", `lectureStats` agrees (curated 12, draft 40,
outline 282), 25 boards, 10 categories, and 334 Practise rows. Opened a curated topic ("Agnipath
Scheme…", id `agnipath`): 841 characters of scripted body and the clock running from 00:30 at the
intro phase. Opened an outline topic ("370 Article", id `370-article-average30`): it opens with its
265-character speaking scaffold and is labelled `outline` in the list, because that is what the
bundled data actually holds — 282 of the 334 have no full script, and the row chips say
Outline / Draft script / Hand-written per topic. Network log shows only local `data/lecturettes.json`
(no external request), so every entry opens with no network. Boundary check: removing
`lecturettes.json` from the served bundle drops the screen back to the twelve-row `lectures.json`
fallback instead of an empty list, then restoring it returns 334. Rebuilt the APK
(`npx cap sync android`, `./gradlew assembleDebug`, BUILD SUCCESSFUL) and confirmed it contains
`assets/public/data/lecturettes.json` (720,355 bytes), the new `api.js`, and that the News Digest fix
from the previous entry is still inside. Desktop smoke: 472 checks, 0 failures, 0 console errors.

**Not verified.** Still no device or emulator here, so the Capacitor WebView path is exercised only
as its bundled assets in a browser. The rebuilt APK is the unsigned debug build; it was not renamed
into `release/` or published.

---

## 2026-10-23 — Android News Digest always opens an edition, and its live path works

**Why.** On the APK's own assets the digest tab still dead-ended: with online off it said "turn online
on", and with online on every one of the twelve feed requests failed — `news.google.com` was not in
the bundle's `connect-src`, and `api.rss2json.com` answers cross-origin calls without
`Access-Control-Allow-Origin`. A reference edition written earlier at `data/digest-offline.json` was
referenced by nothing and never copied into the bundle.

**Changed.**

- **Bundled edition.** `tools/build-mobile.js` now copies `data/digest-offline.json` into
  `mobile/www/data/`. It is the fallback of last resort, so the tab can never fail to open.
- **Fallback order.** `digestOnPhone()` (mobile/online.js) answers with: fresh feeds → saved copy →
  bundled reference edition → only then an error. `digestFallback()` owns that order; the old code
  returned `{ok:false}` whenever no cache existed.
- **A live path that survives CSP/CORS.** Browsers use Wikipedia's Current Events portal day pages
  (`action=parse`, `origin=*`; wikitext, ~1 KB, no key, no proxy). Stories are grouped under the
  portal's own subject headings — the first attempt classified them into the app's twelve
  India-centric sections by keyword and misfiled "West Bank" under Financial and a Mercury Prize
  under War, so that classifier was deleted rather than tuned. Devices keep Google News through
  CapacitorHttp, which is the only transport that feed allows.
- **CSP.** `connect-src` swaps the dead `api.rss2json.com` for `https://en.wikipedia.org`; no other
  host was loosened.
- **Screen.** `renderPhoneDigest()` labels the bundled edition "Reference edition / bundled offline"
  and prints its note, and names the live source, instead of always claiming Google News.
- **Removed.** `data/lectures-batch-01.json` — invalid JSON (`government\'s`), read by nothing, and
  picked up by `data/**/*` in the next package.

**Verified.** Served `mobile/www` from a cache-free browser at 390x844 (the APK's own assets, since no
device or emulator exists here): online off → 12 sections, 48 stories, chips "Reference edition",
"48 stories", "bundled offline", with the standing-context note; online on → "Edition of 2026-10-23",
19 stories under 12 portal headings ("2026 drone incidents in Romania", "Middle Eastern crisis",
"Sudanese civil war", "2026 Tibet earthquake", …), source "Wikipedia Current Events"; with live
feeds forced to fail and the cache cleared → the reference edition again, no error page; after
switching offline with a saved edition → "saved copy", same 19 stories. APK rebuilt
(`npx cap sync android`, `./gradlew assembleDebug`, BUILD SUCCESSFUL in 22 s) and checked to contain
`assets/public/data/digest-offline.json`, `online.js` with the new transport, and the new CSP.
Desktop smoke: 472 checks, 0 failures, 0 console errors. `node --check` on every changed file.

**Not verified.** No device or emulator is installed (`adb devices` empty, no AVD), so the
device-only Google News transport remains unexercised — the browser path is what was driven. The new
APK is an unsigned debug build (`versionCode 1`, `versionName "1.0"`); it was not renamed into
`release/`, not published, and `release/download.html` is untouched. The header's "online off" badge
can still disagree with the setting for a moment — pre-existing, observed again while testing, left
alone as it is outside this feature.

---

## 2026-10-23 — Clean Expo workspace for the phone app (`mobile-app/`)

**Why.** The Capacitor build under `mobile/` is one large vanilla-JS renderer shared with the
Electron app, which makes phone-only changes slow and risky. The ask was a separate folder built in
the language native Android development actually uses, with the app part rewritten there, tidy,
commented, and web-previewable on the PC. This entry covers only the scaffold; the digest port and
the feature rewrites come after it.

**Changed.** New `mobile-app/`: Expo SDK 58 + React Native 0.88 + TypeScript (strict), `expo/AppEntry`
replaced by a hand-written `index.ts`. No navigation router, no icon font, no native-only plugins, so
there is nothing that can be missing in a browser. Files: `App.tsx` (shell + screen switch + phone
frame + status-bar inset), `components/` (Tile, PrimaryButton, ScreenHeader), `screens/` (Home
paragraph tiles, working WAT timer, TAT plate browser, ComingSoon placeholder), `constants/` (theme
tokens, layout rules, navigation vocabulary), `lib/platform.ts` (web/localStorage + Web Audio cue,
native/in-memory fallbacks). Scripts: `start`, `web`, `android`, `ios`, `typecheck`. `mobile-app/README.md`
has the layout and the Windows commands.

**Bugs fixed while building it** (all caught in the browser, not by reading code):

- The previous attempt's `metro.config.js` passed `'./app.json'` to `getDefaultConfig()`, which
expects the project root; `expo start --web` could not bundle. Now `getDefaultConfig(__dirname)`.
- Three screens would not parse at all: CSS-in-JS keys such as `tile:hover`, unquoted style keys,
`objectFit`, and one line of literal nonsense in the WAT effect. Rewritten from scratch.
- RN 0.88 removed the `StatusBar backgroundColor` prop (edge-to-edge); typecheck caught it.
- Tiles wrapped to one column: fixed pixel widths from window width could not see the frame's 1px
borders, so 2 x 173px + 12px gap overflowed a 356px box. Measuring with `onLayout` fixed that but
kept a stale width after a rotate, collapsing the grid again. The grid is now percentage cells
(`100/columns%`), which cannot overflow and follow any resize.

**Verified.** `npx tsc --noEmit` clean on TypeScript 6.0.3; `npx expo install --check` reports
"Dependencies are up to date"; Metro bundles `index.ts` (232 modules) and serves it at
`http://localhost:8081`. In the browser at 390x844: six tiles in 2 columns, no horizontal overflow,
ground `rgb(14,26,21)` with 15.19:1 body-text contrast, zero white backgrounds, no console errors.
Resizing to 844x390 re-flows to 3 columns in a 760px frame, and back — live, without a reload. Clicking
WAT counts 15s down to 5s over 10s of wall clock, then advances to word 2 after the deadline; TAT
shows 12 plates, selection works, and the header Back returns to the dashboard.

**Not verified.** Nothing has been run on a real Android device or emulator yet, so the native branch
of `lib/platform.ts` (in-memory storage, silent cue) is untested. `npm audit` reports 15 high-severity
advisories in the Expo/Metro toolchain's dev dependencies; they are build-time only and no production
bundle was produced. The APK is still the Capacitor build in `mobile/` — `mobile-app/` is not wired
into `npm run dist` or `release/download.html`. The six dashboard tiles beyond WAT and TAT open a
placeholder, and no TAT plates, WAT word list, lecturettes or digest engine are bundled here yet.

---

## 2026-10-22 — Full-screen writing clock, sound cues, opening sheet, glass tiles, phone digest

**Why.** From the phone again: during TAT writing the picture still filled the frame, so the test did
not feel like the board; there was no sound at the start or the end; the phone's News Digest page was
an explanation rather than a digest; and the dashboard asked for a green glass look. The app also
opened straight onto a blank window while it read its data.

**Changed.**

- **Writing is a sheet of its own.** `mountTat()` now renders `#writeStage`, a fixed overlay covering
  the whole window: slide number, phase, `04:00` at up to 300 px, and two buttons. The picture is
  hidden for the whole writing phase (`#slideContent[hidden]`, never a small clock beside it).
  "Show prompt" is the single deliberate peek; it steps the sheet aside and "Back to the clock"
  returns. The old `hideTatPromptWhileWriting` toggle is gone from Settings because the overlay
  always wins; the stored key is still accepted.
- **Clock fits the screen.** `font-size: clamp(72px, min(30vh, 26vw), 300px)` plus `white-space:
  nowrap` — at 30vh the digits were clipped to `04:0` on a 508 px-wide phone, caught by screenshot.
- **Next button.** `.btn-next` is full-width and 70 px tall in portrait, a 190 px medium button in
  landscape, on both the writing sheet and the TAT footbar.
- **Sound cues.** `cue()` synthesises three short chimes with Web Audio (start, writing begins, end)
  and a vibration; no audio files ship. Settings has a **Sound cues** switch (`soundOn`, default on).
- **Opening sheet.** `index.html` carries `#bootScreen`; `boot()` reads the store, settings, attempts,
  TAT library, lecturettes and hints one step at a time and reports each line and a progress bar,
  then fades it out. Dark before the saved theme is applied, so no white flash.
- **Glass.** New tokens (`--glass-1`, `--glass-2`, `--glass-edge`, `--glass-sheen`, `--glass-glow`) in
  both palettes; `.card` and every dashboard tile are frosted green panes with an inset highlight.
- **Phone News Digest.** The dead "Python is desktop-only" page is replaced by `digestOnPhone()` in
  `mobile/online.js`: twelve sections built from the same free Google News feeds through the native
  HTTP layer, cached in `ssb-digest-phone`, with a Refresh button and the last edition offline.
- **Warning above the clock.** The last-minute warning sits a little above the digits, and the
  threshold is a share of the phase, not a fixed minute — a 30-second practice write no longer
  says "one minute left" from the start.
- **Shipped.** GitHub release `v1.0.2` (public), asset `SSB-Prep-Trainer-1.0.2-android.apk`,
  14,157,329 B, SHA-256 `7ecd67ed95b0637ded09a47a8fe4ee1305fe776c1837fe3cd8bfd5e4bb52f62d`. The
  same file is on the phone at `/sdcard/Download/`.
- **Windows build rebuilt** so the PC app carries the same changes: `npm run dist`, then
  `node tools/verify-package.js` (all files match, 43/43 classic plates, 2001/2001 museum pictures)
  and the packaged smoke from inside the asar: 472 checks, 0 failures, 0 console errors.
- **Verifier fixed, not weakened.** It counted classic plates with a `.jpg` filter, but two of the
  43 plates are PNG, so it reported a false 41/43 mismatch. It now checks the manifest names against
  the files actually packed, which is the stronger check.

**Verified on the phone** (Pixel-class device, `in.ssbprep.trainer`, USB + CDP):

- UI scenario 8/8 — back from Settings lands on the dashboard with 10 tiles, back on the dashboard is
  left to Android, overlay rect 508×1037 equals the viewport, clock 300 px and counting, picture
  hidden, Next 464×70 full width.
- Landscape (rotation forced, 1037×480): overlay fills the window, clock 144 px, Next 190×46 medium,
  picture hidden.
- News Digest: 12 sections, 48 stories, edition `2026-10-22`, no console errors.
- The warning line: hidden at 00:29 of a 30-second write, "TEN SECONDS LEFT" at 00:05 with the
  digits in the urgent colour.
- Desktop `npm run smoke`: 472 checks, 0 failures, 0 console errors.

**Not verified.** The chimes were scheduled without an exception (console clean) but automation cannot
hear them; volume and the phone's silent mode are untested. The TAT plate itself was not re-photographed
this round. Landscape was forced through `adb`, not by turning the device.

**Still open.** 52 of 334 lecturette topics carry a full script; the other 282 are skeletons and are
labelled "Outline" in the list — content, not delivery, is what is missing. The "warning slightly
above" request was not specific enough to act on.

---

## 2026-10-22 — Back button, full-screen writing clock, and the phone's online features switched on

**Why.** Straight from the phone: the hardware back button closed the app instead of returning to the
dashboard, the writing phase kept a small clock in the corner, and every online extra still answered
"offline" on Android. The TAT pictures had already been fixed and were re-checked here.

**Changed**

- `mobile/online.js` (new) — a real network layer for the phone: Datamuse meanings and related
  words, Google News headlines parsed straight from its RSS, lecture points built from those
  headlines, and public-domain TAT pictures from **Wikimedia Commons**, kept in IndexedDB so they
  survive a restart. Online is the default on the phone.
- `capacitor.config.json` — `CapacitorHttp` enabled, so the page's `fetch()` runs through the native
  HTTP stack. That is what makes Google News and the picture APIs reachable: a WebView's own
  `fetch` is subject to CORS, which is why every attempt before this ended in "Failed to fetch".
- `tools/build-mobile.js` — copies `online.js` and adds only the hosts the extras use to the CSP.
- `src/renderer/app.js` — `window.__ssbBack`: a section returns to the dashboard, a running test
  asks before it is discarded, and only the dashboard lets the press leave the app. The TAT writing
  phase now fills the stage with a large countdown.
- `src/renderer/styles.css` — `.write-clock`, `.slidebox.writing`, and `#slideContent[hidden]`
  (the flex display added for the phone was beating the `hidden` attribute, so the picture stayed
  on screen beside the clock — caught on a screenshot, not by the DOM check).
- `mobile/api.js` — @capacitor/app `backButton` listener wired to `__ssbBack`, `minimizeApp` only
  when the dashboard is showing; `onlineEnabled` defaults to true.
- `package.json` — `@capacitor/app` 8.1.2 as a devDependency (the APK side of the back button).

**Tried and rejected.** The Art Institute API and the rss2json bridge both answer this network with
a Cloudflare challenge (403, no CORS headers). Wikimedia Commons and native HTTP replaced them.

**Verified on the device** — Motorola edge 50 fusion, Android 16:

- `online.js` scenario: **11/11 checks** — switch reports enabled, Datamuse probe online, meaning for
  *serendipity*, 12 related words, **18 headlines**, **12 lecture points**, **2 Commons pictures**
  stored and one decoded at 960×753, header reads "online".
- `ui.js` scenario: **8/8 checks** — back from Settings handled and lands on the dashboard, back on
  the dashboard is left to Android, writing clock visible with a live `03:59`, stage in writing
  mode, picture hidden, clock rendered at 81 px.
- `phone.js` scenario re-run on this build: **38/38 checks, 0 console errors**.
- Real hardware key: `adb shell input keyevent 4` on Settings kept the same PID and showed the
dashboard; the app did not close.
- Screenshot `screenshots/mobile/tat-writing-full.png` shows the picture gone and the large clock.

**Verified on the desktop** — `node --check` on every file and `npm run smoke`: **472 checks,
0 failures, 0 console errors**.

**Artifact.** APK 14,153,978 B, SHA-256 `760aa8cc…`; copied to `release/SSB-Prep-Trainer-1.0.0-debug.apk`
and pushed to `/sdcard/Download/` on the phone so it can be shared from the file manager.

**Published.** Pushed to `github.com/yoggi1234/SSB-Prep-Trainer` (commit `286c8a7`) and attached to
release **v1.0.1** as `SSB-Prep-Trainer-1.0.1-android.apk` (14,153,978 B, downloaded back over HTTPS
byte-for-byte: HTTP 200, same size). The repository owner chose a public release with the full APK,
including the user-supplied plates, after the NOTICE warning was put to them.

**Not verified.** Headlines depend on Google News being reachable from the user's network. Commons
pictures are general public-domain art, not curated SSB scenes, so some are weak TAT prompts. The
APK is still an unsigned debug build and Play Protect will warn on install.

---

## 2026-10-22 — The Android build tried on a real phone, and the broken screens fixed

**Why.** A phone was connected over USB debugging, so the APK that had only been built before was
finally run. Most sections worked, but four were broken on the device and the TAT test — the
headline feature — silently ran without pictures.

**What was actually broken, and why**

- **TAT showed text scenes, never a plate.** `mobile/api.js` built its classic-set records without
the `file` field. `tatPool()` de-duplicates by `p.id || p.file`, so every record collapsed to the
single key `undefined`, `pickTatPictures(11)` returned nothing, and `buildTatSlides()` fell back to
`data/tat.json` captions. The shim now gives each record `file: 'data/tat-classic/…'`.
- **Plates that did load had a `file:///data/…` URL.** `fileUrl()` prefixed every relative path with
  `file:///`, which is right for a Windows path and wrong for a page-relative one. It now leaves
  `data:`, `blob:`, `http(s):`, `file:`, `content:` and page-relative paths alone, and only turns an
  absolute Windows path into `file://`. This also fixed the 43 plate thumbnails on the Add screen.
- **A landscape plate covered the VIEWING label and the clock.** `#slideContent` was a flex item
  with the default `min-width:auto`, so `max-width:100%` on the image resolved against the image's
  own intrinsic width. It got `min-width:0; max-width:100%` and the two labels got `z-index:2`.
- **The Bin crashed with `bin.map is not a function`.** The shim answered `tatBin()` with
  `{items, gone}` while `main.js` returns an array; the Bin screen threw and dropped back to the
dashboard, the dashboard tile read "undefined waiting", and Add read "Open bin (undefined)".
- **The word library read 0 words, 0 meanings, 0 positive, 0 negative.** `dictInfo()` returned the
  module's zeroed counters without loading the file; it now loads the dictionary first. On the phone
  it reports 147,417 / 146,410 / 1,175 / 2,203.
- **"Add pictures…" crashed the Add screen.** The shim answered `pickTatImages()` with an error
  object, and the renderer assigned it to `S.tatImages` and then called `.map()`. The shim now opens
  the phone's own file picker and keeps object URLs for the session; Add says so out loud.
- **Export claimed to save a file that never existed.** An Android WebView has no download handler,
  so the `<a download>` click did nothing while the toast said "Saved to …txt". It now copies the
  text to the clipboard and says "Saved to clipboard".
- **News Digest looked like a working form** whose Generate button could only fail. `digestStatus()`
  now marks the screen `unsupported` and the renderer shows a desktop-only explanation instead.
- **Two smaller lies.** The dashboard said online extras were on while the build is offline (the
  copy now follows `onlineEnabled`), and Diagnostics reported 0 classic plates (now the real 43).

**New tooling**

- `tools/mobile-probe/drive.js` + `scenarios/phone.js` — drives the running WebView over the Chrome
  DevTools Protocol through `adb forward`, so the phone build is tested, not eyeballed. 38 checks
  covering every section and all three tests, screenshots written to `screenshots/mobile/`.
- The runner retries an evaluation after a reload destroys the execution context, and takes
  screenshots with `adb exec-out screencap -p` because `Page.captureScreenshot` hung whenever a
  screen was animating.

**Verified on the device** — Motorola edge 50 fusion, Android 16, WebView Chrome 155: scenario
**38/38 checks, 0 console errors**, including a plate decoding at natural width inside the stage,
the writing phase removing the picture, slide 2 loading another plate, the result gallery keeping
thumbnails, WAT/SRT runs saving, the lecturette advancing its phases, 43 classic plates on Add, the
Bin screen, the 147k word library with search and Action verbs, and the clipboard export.

**Verified on the desktop** — `node --check` on all files and `npm run smoke`: **472 checks,
0 failures, 0 console errors**, 35 distinct screenshots. The renderer is shared, so the `fileUrl`
and CSS changes were re-checked there; the digest screen still renders its form on Windows.

**Artifact.** `android/app/build/outputs/apk/debug/app-debug.apk` (14,153,201 B, SHA-256
`b17f5fc3…`), copied to `release/SSB-Prep-Trainer-1.0.0-debug.apk` for sideloading. It carries the
43/43 plates and the 22.6 MB web bundle.

**Not verified.** The phone's file picker was opened but no image was actually chosen through the
system dialog (automation cannot drive it); the session-only picture flow is therefore exercised up
to the picker, not through it. The APK is still an unsigned debug build. Alerts (notifications),
rotation, and background/resume behaviour were not tested. Screenshots are checked by eye here, not
numerically.

---

## 2026-10-21 — Action-verb list, two user drawings, a sheet WAT set, and an Android APK

**Why.** Two requests together: add the handwritten **Negative / Positive / Neutral** verb list
(the tone a WAT or SRT sentence opens with) and two TAT-style drawings the user supplied, then get
the whole trainer onto an Android phone.

**Changed**

- `data/connectors.json` — the verb list, transcribed from the user's photo into three groups
  (19 negative, 27 positive, 21 neutral) with a one-line hint each. Loaded like every other data
  file through the IPC bridge, so no new channel shape was invented (`connectors()` in preload).
- `src/renderer/app.js` — the Word library gained a fourth tab, **Action verbs**, which lists the
  three groups with their hints; `libraryConnectors()` loads it on first use, like the word pages.
  The tab assertion in the smoke suite was updated from three tabs to four.
- `data/tat-classic.json` + `data/tat-classic/user-extra-01.png`, `user-extra-02.png` — the two
  drawings as plates 41 and 42 (`classic-041`, `classic-042`), titled and marked
  "user-supplied, check rights before redistributing" like the rest of the set.
- `data/wat.json` — a fifth set, **Your sheet — words 21 to 40**, transcribed from the user's
  typed word sheet (20 words).
- `mobile/api.js` — a `window.api` implementation for a plain browser/WebView, backed by
  `localStorage` and `fetch()` of the bundled data files. Every renderer call the app actually
  makes is covered; unsupported main-process features degrade to no-ops instead of throwing.
- `tools/build-mobile.js` — copies the renderer, the data the phone needs (including all 43
  plates and the hint files) into `mobile/www/`.
- `capacitor.config.json` — `in.ssbprep.trainer`, webDir `mobile/www`, Mist ground colour so the
  splash never flashes white.
- `android/` — generated by `npx cap add android` (Capacitor 8.5.3, AGP 8.13, Gradle 8.14.3,
  compileSdk 36, minSdk 24). Git-ignored along with `mobile/www/`; both are rebuilt on demand.

**Toolchain installed on this PC.** OpenJDK 21 (Microsoft build) and Android Studio were already
present via winget; the **Android SDK itself was not**. Provisioned at
`%LOCALAPPDATA%\Android\Sdk`: command-line tools 13114758, `platforms;android-36`,
`build-tools;36.0.0`, `platform-tools`, all licences accepted. One Gradle wrapper download died
mid-transfer (connection reset) and was re-fetched with `curl -C -` into the wrapper cache.

**Verified.** `npm run smoke` (source): **0 failures, 0 console errors**. `node --check` on all
three renderer/main files passes. `gradlew assembleDebug`: **BUILD SUCCESSFUL**, producing
`app-debug.apk` (14,089,324 B, SHA-256 `34aa265e…`). Checked with `aapt dump badging`: package
`in.ssbprep.trainer`, minSdk 24, targetSdk 36. Listed the APK contents: renderer, `connectors.json`,
all five WAT sets (sheet included), and **43 of 43** TAT plates including both drawings. Copied to
`release/SSB-Prep-Trainer-1.0.0-debug.apk` for sideloading.

**Not verified, plainly.** The APK has **not been run on a real Android device** — no phone was
connected over adb during this session. The `mobile/api.js` shim was exercised only to the extent
the build needed it; it has no smoke suite of its own. The two ssbace.com / SBWINGS screenshots the
user also sent were **not** added: they carry visible watermarks and belong to those sites, so they
went the same way as the classic set's own rights note — kept out unless the user confirms the
rights. The News Digest compartment is desktop-only (it needs Python and the filesystem).

---

## 2026-10-21 — Word list cleaned of numbers, ordinals and dotted forms

**Why.** The **All words** tab still listed entries that are not practice words: bare numbers
(`14`), ordinals (`14th`), catalogue codes (`u308`, `wordnet3.1`, `y2k`), dated names (`war of
1812`, `vitamin b12`, `1 kings`), calibres (`.22 caliber`) and dotted initials or abbreviations
(`a. a. milne`, `a.m.`, `anon.`). They came straight out of WordNet, which is a lexical database,
not a word-practice list.

**Changed**

- `data/dictionary.json` + `data/dictionary-meta.json` — rebuilt from the committed original with
  one rule: strip WordNet's adjective/participle annotation (`afraid(p)` → `afraid`), then drop any
  key containing a digit or a period, and any key that is not a Latin-letter headword with the
  space, hyphen or apostrophe a real headword carries. **149,003 → 147,417 words** (146,410 with
  meanings, 1,175 positive, 2,203 negative). 1,070 keys dropped and 516 annotated forms folded into
  a headword that already existed.
  - Accents are kept (`naïve`), as is a leading apostrophe (`'hood`, `'tween`).
  - Null-prototype maps were needed for the merge: `constructor` and `toString` are themselves
    headwords, and a plain `{}` hands back `Object.prototype` for them (this crashed the first
    pass).
- `tools/build-dictionary.js` — the same cleaner (`cleanWord()`) now runs while reading the synsets
  and the AFINN list, so a future rebuild cannot bring the junk back. Meta counts are computed from
  what was actually kept.
- Counts corrected wherever they are quoted: the Word library tile chip (`app.js`), `README.md`,
  `docs/ARCHITECTURE.md` and the screenshot gallery caption.
- `src/main.js` — a new smoke step asserts that **no** dictionary key contains a digit or a period,
  and reports up to ten offenders when one does.

**Verified.** `npm run smoke`: **469 checks, 0 failures, 0 console errors**, exit 0, with the new
step reporting an empty junk list. Data checked directly: key count equals `meta.words` (147,417),
recomputed definitions/positive/negative match the meta (146,410 / 1,175 / 2,203), and the surviving
keys contain **0** digits, periods, parentheses and slashes. Spot-checked that real words survived
the filter, including the ones that only existed in annotated form: `afraid`, `afloat`, `abed`,
`adrift`, `naïve`, `'hood`, plus the WAT staples (`duty`, `courage`, `discipline`, `guts`,
`blunder`, `calibre`).

**Not verified.** The builder was not re-run end to end: `node_modules/wordnet-db` and
`afinn-165` are not installed here, so the shipped JSON was filtered from the committed original
rather than regenerated from WordNet; the builder's cleaner is type-checked (`node --check`) and
mirrors the rule that produced the data, but a full rebuild is untested. No package was rebuilt, so
`release/download.html` still quotes the previous build's 149,003-word dictionary and must be
refreshed with the next `npm run dist`.

---

## 2026-10-21 — Reduce-motion switch, your own WAT sentences, batch history export

**Why.** Four suggestions were taken up together: a real in-app reduce-motion switch, a place to
write your own five sentences for each WAT word and keep them beside the built-in models, a batch
export of the whole practice history, and lazy dictionary loading. The fourth turned out to be
already true — the 149,003-word library has always loaded on the first Word-library use, not at
startup — so nothing there needed changing.

**Changed**

- `src/main.js`
  - `defaults()` gains `reduceMotion: false` (a toggle on top of the OS setting, off so the shipped
    motion stays) and `watSentences: {}`, keyed by word: `{natural, positive, leadership, factual,
    general}`.
  - `attempts:export` writes the saved attempts — the store already caps them at 300 — as CSV or
    JSON through the same `showSaveDialog` flow a single export uses, so the file lands where the
    person chooses. CSV cells are quoted when they contain a comma, quote or newline; the duration
    is written `m:ss` by a small local helper, because the renderer's `clock()` does not exist here.
  - `datamuse()` retries once, 400 ms apart, when the connection itself fails. A tested failure was
    `fetch failed` on the themed word list while the same URL answered from Node in 50–500 ms; the
    online extras are best-effort and a dropped connection should not read as "offline". An HTTP
    status error is still reported immediately instead of being retried.
  - The dictionary handlers were left exactly as they were. A rewrite that made `dict:info` return
    zeros until a separate `dict:load` ran, and registered `dict:load` a second time inside
    `createWindow()` (which throws "Attempted to register a second handler" and takes the window
    down), was reverted in full.
- `src/preload.js` — added `attemptsExport(format)`; no `dictLoad` (there is no such channel).
- `src/renderer/app.js`
  - **Settings → Appearance → Reduce motion**: the existing `toggleField()` renders it and the shared
    `[data-toggle]` handler persists it; the handler now also calls `applyMotion()` so the change is
    immediate. `applyMotion()` sets `data-reduce-motion` on `<html>` from `applyTheme()`, so it is
    applied before the first paint and after the config arrives.
  - `motionReduced()` also reads `prefers-reduced-motion`. `wireDash()` uses it twice: the highlight
    starts stationary and the 4.5 s walk is not scheduled at all when movement is unwelcome.
  - `modelSentencesHtml()` appends `mySentencesHtml(word)`: your saved lines as `My natural` …
    `My general`, then a collapsed "Write my own five sentences" editor with one input per style and
    a Save button. `wireMySentences()` saves through `setConfig({ watSentences })` and re-renders.
    These lines use `.mine-row` / `.mine-tag`, deliberately **not** `.model-row` / `.model-tag`, so
    the built-in five-per-word set stays exactly countable.
  - **Settings → Export** now calls `attemptsExport('csv' | 'json')` and reports the path or the
    error. The previous version built a `Blob` download link and called a preload function that was
    never exposed; it could not have worked.
  - The SRT run screen gained the `.srt-copy` note the stylesheet already described ("Write your
    reaction in your practice copy"). The markup had been lost while the box was removed, so the
    screen said nothing about where the answer goes and the smoke check for that note was failing.
- `src/renderer/styles.css` — `html[data-reduce-motion='true']` stops every animation and transition,
  the same rule the OS media query uses; `.mine*` styles for the saved/edited sentences, all from
  tokens (no literal colours).
- `.gitignore` — `graphify-out/` (generated knowledge-graph artifacts, not source).

**Verified.** Source `npm run smoke`: **468 checks, 0 failures, 0 console errors**, exit 0. The
suite's existing reductions still hold: the five built-in sentences per word are counted exactly
(`rows === words * 5`, tags exactly the five styles), the WAT run screen still has no typing field,
and the theme/contrast checks are unchanged. Reduced motion is verified by the CSS rules and by
`motionReduced()` gating the dashboard walk; the suite does not toggle the new switch.

**Not verified, plainly.** No packaged build was made for this change, so `npm run dist`,
`verify-package.js` and the packaged `--smoke` are untested here; `release/download.html` was not
refreshed. The batch export writes through the real handler but the smoke run does not press its
buttons, so the CSV/JSON text is unexercised by the suite. The retry only covers a dropped
connection, not a persistent block (for example a proxy that refuses Electron's requests while
Node's succeed — the reason the retry was added at all). No Android build exists; see the note at
the end of this entry.

**Android.** An APK cannot be produced from this codebase as it stands. Electron targets Windows;
Android needs a different runtime (Capacitor/Cordova or a native shell), and this renderer is built
entirely on `window.api` IPC calls that do not exist there. A port is a project, not a packaging
step: every preload call needs an Android-side implementation, the Node-dependent features (file
pickers, the Python digest engine, the on-disk log, `powerSaveBlocker`) need replacements or
removal, and the build needs the Android SDK/JDK toolchain. Nothing was built or promised here.

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
