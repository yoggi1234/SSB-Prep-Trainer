<p align="center"><img src="docs/logo.png" alt="Prep SSB logo" width="320"></p>

# SSB Prep Trainer

**Offline SSB interview practice: TAT, WAT, SRT, lecturette, word library and a News Digest compartment.**

Electron app, zero runtime npm dependencies. Python is only needed for the optional News Digest tab.

![The dashboard](screenshots/01-home.png)
![A lecturette in progress](screenshots/14c-lecturette-run.png)

## Quick links

- [Download the latest release (Windows and Android)](https://github.com/yoggi1234/SSB-Prep-Trainer/releases/latest)
- [GitHub repo](https://github.com/yoggi1234/SSB-Prep-Trainer)
- [Screenshots from the smoke test](screenshots/)

## What's in this build

| Test | Format | Sets included |
|------|--------|---------------|
| **TAT** — Thematic Apperception Test | 12 slides, 30 s view + 4 min write, written in your practice copy | 41 classic TAT plates, 2,001 museum pictures, your own pictures |
| **WAT** — Word Association Test | 60 words, 15 s each, no typing, one large clock + plain meaning | 4 word sets, 5 model sentences per word, news lines when online |
| **SRT** — Situation Reaction Test | 60 situations in 30 min, one running total clock, written in your copy | 3 situation sets |
| **Lecturette** — three-minute talk | 30 s intro + 2 min body + 30 s conclusion, clock phases auto-advance | 334 topics offline, search/filter, Facts tab, current points |
| **Word library** | Dictionary with search, meanings, sentiment tabs, random words | 123,913 words, 122,911 with offline meanings (names, places, plant families and fragments removed); optional Datamuse lookup |
| **News Digest** | 12-page colour current-affairs PDF from free feeds, on both desktop and phone | Desktop needs Python 3.9+ + `reportlab`, `pypdf`, `feedparser`, `trafilatura`; the phone runs a JavaScript port of the same engine and saves the PDF to Documents / the share sheet (**Make 12-page PDF**) |

TAT writing takes over the whole screen: the picture goes away and a large clock fills the window,
with a full-width **Next slide** button in portrait and a medium one in landscape. A short chime marks
the start, the move to writing, and the end (switch it off in Settings). A brief opening sheet shows
what is being read on launch. The dashboard tiles are frosted green glass.

## Download the app

| Format | Size | What it does |
|--------|------|--------------|
| **Portable .exe** | 200 MB | Single file. Put it anywhere and double-click. Nothing is installed. |
| **Installer .exe** | 200 MB | Choose the folder; creates Desktop and Start Menu shortcuts, plus an uninstaller in Windows Settings. |
| **Android APK** | 14 MB | [Download from Releases](https://github.com/yoggi1234/SSB-Prep-Trainer/releases/latest) and sideload it. Unsigned debug build; see *Build the Android app* below. |

**Important:** The build is unsigned. Windows may show "Windows protected your PC" on first run. Click **More info → Run anyway** — this is expected and not a virus warning.

## Run it from source

```bash
npm install
npm start
```

## Build the Windows `.exe`

```bash
npm run dist
```

Output lands in `release/`:
- `SSB Prep Trainer Setup 1.0.0.exe` — installer
- `SSB-Prep-Trainer-1.0.0-portable.exe` — portable .exe

The build is unsigned, so Windows SmartScreen may show "Windows protected your PC" the first time. Choose **More info → Run anyway**.

## Build the Android app

The same renderer runs on a phone through Capacitor; the modules in `mobile/` replace the Electron
bridge (data, online lookups, digest, museum art, device glue) and `mobile/api.js` assembles them
into `window.api`, serving the bundled data and keeping settings and history in `localStorage`.

```bash
node tools/build-mobile.js      # copy the renderer and the data into mobile/www
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is unsigned and meant for sideloading. The phone build carries the trainer itself:
TAT with all 43 classic plates, WAT, SRT, lecturette, the whole word library, action verbs and
history. The hardware back button returns to the dashboard (it only leaves the app from the
dashboard), and the TAT writing phase fills the stage with a large countdown.

Online extras work on the phone too: word meanings and related words from Datamuse, current
headlines for the WAT and lecturette screens, and public-domain pictures fetched from Wikimedia
Commons. The page's requests run through Capacitor's native HTTP, so no browser CORS rule blocks
them. The News Digest's Python engine is desktop-only, so the phone runs a JavaScript port of it and
draws the same 12-page colour PDF. Exports of attempts copy to the clipboard, and pictures you add
are kept on the phone.

## Using each test

**TAT.** You get 30 seconds to look at the picture, then it is taken away and the four-minute clock starts. The clock advances you automatically. There is **no typing box**: you write the story in your practice copy. "Re-show prompt" puts the picture back on screen if you need it. Structure your story around: what led to this → what is happening → what the main character thinks and does → how it ends. Slide 12 is blank, exactly as at the board. The result screen and history keep a gallery of the slides you practised.

**WAT.** A word appears beside one **large countdown**, and its plain meaning sits underneath it. There is **no answer box**: you write in your own practice copy, exactly as you would at the board. The word changes on its own after 15 seconds. Never leave one blank; a short, positive sentence is enough. When the set ends, the result screen shows **five ready sentences for every word** — one natural, one positive, one leadership, one factual and one general. Compare them against what you wrote and note the shapes you missed. Under each word, **Write my own five sentences** keeps your own version beside the models, and your lines are saved on this computer for next time.

**SRT.** The whole set has one countdown (30 minutes), as in the real test — there is no per-situation clock. Like WAT and TAT, there is **no typing box**: read the situation, write your reaction in your own practice copy, then move on. The right-hand grid counts the situations you have been through and lets you jump around, and the whole run is saved with its timing.

## Word library

- Type in the search box (or press Enter) to find any word — prefix matches come first.
- Every row has a **Meaning** button that opens the definitions, with the part of speech.
- **Positive** and **Negative** tabs list the sentiment-tagged words on their own.
- **Random 10** gives you a random set of words to practise on.
- **Load more** pages through long result lists.

Definitions come from **WordNet 3.1** (Princeton University); the positive/negative ratings come from **AFINN-165**. Both are free to redistribute and their notices ship in `NOTICE.txt`.

## Lecturette — the three-minute SSB pattern

The **Lecturette** tab is built for the spoken three-minute talk: **30 s intro + 2 min body + 30 s conclusion**, with a clock that moves through the phases on its own and the sub-points to cover shown for each one.

| Phase | What to cover |
|-------|---------------|
| Intro (30 s) | meaning of the topic, brief history, original background, why it came about |
| Body (2 min) | present state, parallel analysis, advantages and disadvantages, quote, figure, impact |
| Conclusion (30 s) | future possibilities, challenges, precautions, your own clear opinion |

**334 topics ship offline**, every one filed under one of ten themes. Each card has a **Facts** tab with quick-revision cues.

### Write a lecturette for any topic

Type a topic under **Your own topic**, or press **Write it for me** on any outline topic. With online lookup on, the app
reads the matching Wikipedia article (the India one when it exists) and the latest headlines, and writes a 350–420-word
talk in the three-minute pattern: introduction, a body under short headings (present situation, causes, advantages,
challenges, India, government steps) and a conclusion with a closing line. Facts are quoted, never invented, and every
source is listed with its date and a **Check** button. Scripts are saved on the device and open as one readable page.

### Current points, refreshed every three months

When a lecturette opens, news for that topic is fetched in the background and shown at the bottom of the run screen, grouped into four categories: how it is going, how India is affected, what India gains, and from the world. Each point is the headline exactly as published, with the paper and the date, and an **Open** button.

## Add material, the bin, and your own lists

- **TAT pictures** — Add pictures… takes a folder of scenes. The classic 41-plate set, your own pictures and the first 24 of the museum library are shown as thumbnails. Hover any picture and press **×** to take it out of the test; it goes to the **Bin**.
- **WAT words** — name a list, paste one word per line, and it appears in the WAT set picker as `name (mine)`.
- **Bin** shows every picture taken out of the TAT test. Restore puts it straight back; Delete forever removes it and the app-made copy; Undo reverses one permanent delete; Bring them all back undoes every permanent delete at once.

Deleted pictures are hidden from every TAT source — classic set, museum library and your own — so a wrong plate never appears in the middle of a test again.

## Settings

- **Appearance** — Mist dark or Alpine light, and a **Reduce motion** switch that stops the
tile orbit, the lecturette slides and the paging transitions. Windows' own "Animation effects"
setting is always respected as well.
- **Timings** — seconds per WAT word, SRT total minutes, TAT view/write seconds, shuffling.
- **Export** — write your whole practice history (up to the last 300 attempts) as **CSV** or
**JSON** through a normal save dialog. A single attempt can still be exported as `.txt` from its
result screen or from History.
- **Diagnostics** — environment, data counts and the live log, for debugging or handover.

## Where your data lives

- `%APPDATA%\SSB Prep Trainer\ssb-prep-store.json` — settings (including Reduce motion), custom sets, added picture paths, your own WAT sentences, the TAT bin and the last 300 attempts
- `%APPDATA%\SSB Prep Trainer\live-data\` — saved lecturette points (one small file per topic, plus `index.json` and `_news-index.json`), kept for three months
- `%APPDATA%\SSB Prep Trainer\tat-bin\` — a copy of each bundled picture moved to the bin, so it can be restored. **Delete forever** removes the copy and remembers the picture's id so it cannot come back.

A plain-text runtime log is written to `%APPDATA%\SSB Prep Trainer\logs\app.log` (rotated once at 2 MB).

## Project layout

```
data/             practice sets (WAT words, SRT situations, TAT scenes)
src/main.js       Electron main process: window, storage, dialogs, export, smoke test
src/preload.js    the only bridge between the app and the window
data/tat-images/  the bundled public-domain picture library (2,001 files)
data/tat-classic/ the classic TAT set (43 plates, user-supplied; see NOTICE.txt)
data/wat-hints/   plain meanings + five model sentences for every built-in WAT word
digest-tool/      the separate Python news-digest engine (shipped outside the asar)
src/renderer/     the interface: index.html, styles.css, app.js
tools/            build and verification scripts
screenshots/      images captured from the running app by the smoke test
docs/             architecture, workflow, debugging and the project log
AGENTS.md         handover instructions for the next developer or AI
```

## Verifying a change

```bash
node --check src/main.js && node --check src/preload.js && node --check src/renderer/app.js
npm run smoke                     # all checks, 0 failures, 0 console errors
node tools/build-mobile.js && npx cap sync android
cd android && ./gradlew assembleDebug
```

On a phone connected over USB debugging, the build can be exercised for real:

```bash
adb forward tcp:9223 localabstract:webview_devtools_remote_$(adb shell pidof in.ssbprep.trainer)
node tools/mobile-probe/drive.js tools/mobile-probe/scenarios/phone.js
```

The scenario walks every section and prints a PASS/FAIL line per check, with screenshots under
`screenshots/mobile/`.
