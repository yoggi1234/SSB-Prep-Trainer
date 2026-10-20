# SSB Prep Trainer

A **Windows desktop app** for SSB preparation — **TAT, WAT and SRT** with real timings and practice
sets, a **149,003-word library**, a three-minute **Lecturette** trainer — and, in its own separate
compartment, the **Daily News Digest** engine that turns free news feeds into a 12-page current-affairs
PDF. The SSB side involves no AI at any point.

The interface ships in **Mist**, a dark palette taken from the Windows 11 theme of the same name:
a deep misty-forest ground, frosted slate-green panels and the bright explorer green for actions.
**Settings → Appearance** switches to **Alpine light**, the sage-paper palette. Neither theme uses a
white page; body text keeps at least a 13:1 contrast on either ground, with high-contrast text,
large pictures and a thin ridgeline accent across the top of the window.

Everything runs locally. Your answers are saved to a single JSON file on your own computer.

There is no internet connection needed to use the app. The online extras (extra word lookups, more
TAT pictures, hot lecturette topics, current points for a lecturette) are **on after a fresh
install**, need no account, key or subscription, and can be switched off in Settings. Every one of
them keeps working from local material when the connection drops: word meanings come from the
bundled 149,003-word dictionary, TAT uses the bundled pictures, and lecturette points come from a
copy saved on disk.

The offline guarantee is enforced, not just promised: the page runs under a
Content-Security-Policy with `connect-src 'none'`, so the interface itself cannot make a network
request even if asked to. When you do enable online lookup, the request is made by the background
process, not the page. The app has zero runtime dependencies beyond Electron — the dictionary is
plain data shipped inside the app.

## The dashboard

The home screen **is** the navigation: ten tiles — TAT, WAT, SRT, Lecturette, Word library, News
Digest, History, Add material, Bin and Settings. There is no top menu; the bar keeps only the name
and the connection light. One tile is lit at a time, its light slowly orbiting; the highlight walks
from tile to tile on its own until you hover, focus or press a key. **← ↑ ↓ →** move it, **Enter**
opens it, and a click does the same. The page ships in the dark Mist palette; **Settings →
Appearance** switches to the light sage one, and the system's reduced-motion setting stops every
animation in both.

## What it does

| Test | Format used | Sets included |
| --- | --- | --- |
| **TAT** — Thematic Apperception Test | 12 slides (11 pictures + the standard blank slide), 30 s to view + 4 min to write each, written in your own copy | 41 classic TAT plates, a 2,001-picture public-domain library, plus your own pictures |
| **WAT** — Word Association Test | 60 words, one shown every 15 s, word changes on its own; no typing, a large clock and a plain meaning on screen | 4 word sets, 5 model sentences per word, plus a news line when a headline contains the word |
| **SRT** — Situation Reaction Test | 60 situations in 30 min against one running total clock; the reaction is written in your own copy | 3 situation sets |

## The word library

The **Word library** tab is a dictionary built into the app.

| | |
| --- | --- |
| Words | **149,003** |
| With an offline meaning | **147,982** |
| Positive words | **1,176** |
| Negative words | **2,204** |

- Type in the search box (or press Enter) to find any word — prefix matches come first.
- Every row has a **Meaning** button that opens the definitions, with the part of speech.
- **Positive** and **Negative** tabs list the sentiment-tagged words on their own.
- **Random 10** gives you a random set of words to practise on.
- **Load more** pages through long result lists.

Definitions come from **WordNet 3.1** (Princeton University); the positive/negative ratings come
from **AFINN-165**. Both are free to redistribute and their notices ship in `NOTICE.txt`.

### About "2 million words"

This was an explicit request, so here is the honest answer: **a list of two million English words
with meanings does not exist**, offline or otherwise. The complete English lexicon including
technical, obsolete and dialect terms is usually put at around one million entries, and that figure
counts proper nouns and non-English borrowings. Larger numbers that appear online include inflected
forms counted separately and are not distinct words.

What is achievable is what you have: the largest **definition-bearing** English lexicon that can be
bundled and redistributed for free — 149,003 words, 147,982 of them with real definitions. Adding
another word list would only add words *without* meanings, which defeats the point of a Meaning
button. If you want to go wider anyway, turn on online lookup and the app will fetch a meaning for
words the offline library does not know.

### Optional online lookup

At the bottom of the **Word library** tab there is an **online lookup** switch, **on** after a fresh
install and one click to turn off. When on, it uses the free **Datamuse** API — no account, no key,
no subscription — to:

- fetch a meaning for a word that has none stored offline (the Meaning button will use it
automatically), and
- **fetch a themed list of new practice words** (for example `duty`, `courage`, `teamwork`) which you
  can save as a new WAT practice set with one button.

**On SRT and TAT material:** there is no free public service that publishes SSB situation lists or
picture sets through an API, so the app will not auto-download them, and it will not scrape other
people's practice material. Use **TAT → Add pictures…** for pictures you own, or paste your own
lists in **Settings**. The online panel links out to a web search so you can find sources yourself.

Both WAT and SRT can be shuffled so you cannot memorise the order. Every timing is adjustable in
**Settings** if your coaching guidance differs. Finished attempts are saved, listed in **History**,
expandable to every answer, and exportable to a `.txt` file for a mentor to review.

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

- `SSB Prep Trainer Setup 1.0.0.exe` — installer; lets you choose the install folder and creates
  Desktop and Start Menu shortcuts.
- `SSB-Prep-Trainer-1.0.0-portable.exe` — single file, no installation; just run it.

The build is unsigned, so Windows SmartScreen may show "Windows protected your PC" the first time.
Choose **More info → Run anyway**. If you would rather avoid that prompt, buy a code-signing
certificate and add it to the `win` section of `package.json`.

## Using each test

**WAT.** A word appears beside one **large countdown**, and its plain meaning sits underneath it. There is
no answer box: you write in your own practice copy, exactly as you would at the board. The word changes
on its own after 15 seconds. Never leave one blank; a short, positive sentence is enough.

When the set ends, the result screen shows **five ready sentences for every word** — one natural, one
positive, one leadership, one factual and one general. Compare them against what you wrote and note the
shapes you missed. The same five styles are saved in the exported `.txt`. Every one of the 238 built-in
words has a hand-written plain meaning and five model sentences; words from your own or online sets fall
back to the shortest definition in the offline dictionary.

**SRT.** The whole set has one countdown (30 minutes), as in the real test — there is no per-situation
clock. Like WAT and TAT, there is **no typing box**: read the situation, write your reaction in your
own practice copy, then move on. The right-hand grid counts the situations you have been through and
lets you jump around, and the whole run is saved with its timing so nothing is lost if time runs out.

**TAT.** You get 30 seconds to look at the picture, then it is taken away and the four-minute clock starts.
The clock advances you automatically. There is **no typing box** in TAT either: you write the story in your
practice copy. "Re-show prompt" puts the picture back on screen if you need it. Structure your story around:
what led to this → what is happening → what the main character thinks and does → how it ends. Slide 12 is
blank, exactly as at the board. The result screen and history keep a gallery of the slides you practised.

## Practising TAT with pictures

Three picture sources are available in **TAT → Picture source**:

1. **Classic TAT set (41 plates)** — built from the CarePatron TAT PDF (10 plates) and your own
   `Downloads\tat` folder (31 pictures), normalised to JPEG and de-duplicated by perceptual hash. This is
   the default. It is **user-supplied practice material**: the official TAT cards are not public domain,
   this set is not covered by the project licence, and it should not be redistributed. Rebuild it with:

   ```bash
   python tools/build-tat-classic.py --pdf <file.pdf> --folder <folder>
   ```

2. **Museum library (2,001 pictures)** — public-domain paintings and prints from the Art Institute of
   Chicago and The Met Museum, all CC0, with creator, date and source stored.

3. **Your own pictures** — eleven or more images from your folder; selecting them switches the source
   automatically.

Eleven are drawn for every TAT set, plus the standard blank 12th slide.

A set **never repeats a picture inside itself**, and the last **twenty sets** are held back, so the same
scene does not come round again. Duplicates are removed when the library is built, by SHA-256 of the
file content — not by file name — so the same picture cannot enter twice from two different sources.

**Fetching more pictures online.** **TAT → Fetch 20 more online** pulls new public-domain pictures from
the Art Institute of Chicago and appends them to the library, checking every download against the stored
hashes first. It needs the online switch in **Word library** turned on, asks the museum politely (about
one request a second) and keeps everything it fetched if you stop halfway. Clicking it always decides
when pictures are fetched; a dropped connection just means the bundled set is used instead.

**Building or extending the library yourself:**

```bash
npx electron tools/build-tat-images.js 2000
```

The number is the target size. The script is resumable, rewrites the manifest every few pictures, and
never downloads a duplicate. It is how the shipped 2,001-picture library was made.

**Your own pictures.** If you already have a folder of TAT practice pictures, open **TAT → Add pictures…**,
select 11 or more images, and the app will use them instead of the library, keeping the standard blank
12th slide. The app only reads the file paths you choose; the pictures are never copied or uploaded.

## Lecturette — the three-minute SSB pattern

The **Lecturette** tab is built for the spoken three-minute talk: **30 s intro + 2 min body + 30 s
conclusion**, with a clock that moves through the phases on its own and the sub-points to cover shown
for each one.

| Phase | What to cover |
| --- | --- |
| Intro (30 s) | meaning of the topic, brief history, original background, why it came about |
| Body (2 min) | present state, parallel analysis, advantages and disadvantages, quote, figure, impact |
| Conclusion (30 s) | future possibilities, challenges, precautions, your own clear opinion |

**334 topics ship offline**, every one filed under one of ten themes: the SSB lists, plus the 198
topics imported from the user's `LECTURETTE TOPICS.pdf` (Above average / Average / Below average),
de-duplicated by title. Each card is labelled with what it actually contains:

| Badge | What it means | How many |
| --- | --- | --- |
| Hand-written | Full material plus a figure and a quote | 12 |
| Draft script | A complete three-minute spoken script; no figures, so quote only what you have checked | 40 |
| Outline | The questions to answer aloud for each phase, with no invented content | 282 |

The list has a search box, a theme filter and a board filter. Every card has a **Facts** tab you can
open without starting the clock, with the quick-revision cues for that topic.

### Current points, refreshed every three months

The moment a lecturette opens, the news for that topic is fetched in the background and shown at the
bottom of the run screen, **in point form and grouped the way a lecturette is asked for**:

| Group | What it answers |
| --- | --- |
| How it is going | the latest developments on the topic |
| How India is affected | headlines that name India |
| What India gains | India plus a gain word — exports, jobs, investment, growth |
| From the world | the same story seen from outside India |

Each point is the headline exactly as published, with the paper and the date, and an **Open** button.
Sorting is by keyword on the headline; nothing is summarised or invented, and the panel says so —
read the story before you quote it. Up to twelve points are kept per topic in
`%APPDATA%\SSB Prep Trainer\live-data\`, reused for **three months** and refreshed when stale or on
**Refresh now**. With no connection the panel shows the saved points and the date they were checked.

The main process fetches and caches; the page still cannot reach the network. The separate News
Digest engine is **not** used for this — the two compartments stay apart — so the same news is
available even when Python or the digest has never been run.

With online lookup on, **hot topics** also pulls recent SSB and Armed Forces headlines and gives you
the same phase-by-phase pattern to speak from.

## News Digest — the second compartment

The **News Digest** tab runs the separate `news-digest` Python engine that lives in `digest-tool/`.
It is a copy of the standalone tool: same code, same 12 pages, same feeds, same settings. The original
installation is not touched, and the engine keeps its own config, drafts and output — it never reads or
writes the SSB trainer's store.

What it does, unchanged from the CLI:

| | |
| --- | --- |
| Pages | 12 A4 pages: National, International, Regional, Defence, Politics, Financial, Economic, Neighbouring Countries, Science, Geopolitical, Miscellaneous and War |
| Sources | Free publisher RSS (The Hindu, Times of India, Indian Express, PIB, Mint, BBC, Al Jazeera, ScienceDaily), free Google News search, and your own newspaper PDFs |
| Extras | abbreviation full forms, hard-word meanings, the facts bank, war log, corrections, editable drafts, bullet-point `.txt` |
| AI | optional, free, local — Ollama at `localhost:11434`. Off/auto/on. Nothing is sent anywhere by default |

**Python is required**, because the engine is Python: Python 3.9+ and four free libraries
(`reportlab`, `pypdf`, `feedparser`, `trafilatura`). The tab detects both and tells you exactly what is
missing. Install them once:

```bash
python -m pip install -r requirements.txt
```

Inside the app, the engine is copied to a writable folder on first use
(`%APPDATA%\SSB Prep Trainer\news-digest`) so an installed app never writes into its own program folder.
The GUI exposes the CLI's options: date, internet on/off, war topic, newspaper PDFs, `.txt` output, opening
the PDF, the Ollama mode, plus **Advanced commands** for the remaining subcommands (`collect`, `build`,
`show`, `edit`, `check`, `history`, `glossary`, `words`, `facts`, `war`, `feeds`, `section`, `config`).

The terminal spinner, live monitor and rocket are redrawn as real animation in the tab while the engine
streams its log.

## Add material, the bin, and your own lists

**Add material** (dashboard tile) is the one place for your own content:

- **TAT pictures** — **Add pictures…** takes a folder of scenes. The classic 41-plate set, your own
  pictures and the first 24 of the museum library are shown as thumbnails. Hover any picture and
  press **×** to take it out of the test; it goes to the **Bin**, not into the void.
- **WAT words** — name a list, paste one word per line, and it appears in the WAT set picker as
  `name (mine)`. Lines that are not single words are ignored, duplicates are dropped, and a set is
  capped at 60 words.

**Bin** shows every picture taken out of the TAT test with the date and its source:

| Action | What happens |
| --- | --- |
| Restore | the picture goes straight back into its set |
| Delete forever | the picture and the copy the app made are removed, and it stays out of the test after a restart |
| Undo | the deleted list keeps the name and date, so one permanent delete can be reversed on its own |
| Bring them all back | undo every permanent delete at once — the bundled plates still ship inside the app |

Deleted pictures are hidden from every TAT source — classic set, museum library and your own — so a
wrong plate never appears in the middle of a test again.

**Settings → Add your own practice set** still works for SRT situations and TAT descriptions.

## Where your data lives

`%APPDATA%\SSB Prep Trainer\ssb-prep-store.json` — settings, custom sets, added picture paths, the
TAT bin and the last 300 attempts. Delete the file (or use **Clear all history**) to wipe it. Nothing
is ever sent anywhere.

`%APPDATA%\SSB Prep Trainer\live-data\` — the saved lecturette points (one small file per topic, plus
`index.json` and `_news-index.json` for the WAT news line), kept for three months.

`%APPDATA%\SSB Prep Trainer\tat-bin\` — a copy of each bundled picture moved to the bin, so it can be
restored. **Delete forever** removes the copy and remembers the picture's id so it cannot come back.

A plain-text runtime log is written to `%APPDATA%\SSB Prep Trainer\logs\app.log` (rotated once at 2 MB),
and the same information is available inside the app under **Settings → Open diagnostics**. See
[docs/DEBUGGING.md](docs/DEBUGGING.md).

## Practice material and accuracy

The word lists and situations are practice prompts adapted from widely published SSB preparation material
and rewritten for this app. They are **not** official board papers, and this app is not affiliated with the
Services Selection Board or any defence organisation.

The timings follow what SSB preparation sources consistently report: TAT 12 slides at 30 s view + 4 min
write; WAT 60 words at 15 s each; SRT 60 situations in 30 minutes. Verify against your own coaching
guidance, and change any of them in **Settings**.

## Project layout

```
data/             practice sets (WAT words, SRT situations, TAT scenes)
src/main.js       Electron main process: window, storage, dialogs, export, smoke test
src/preload.js    the only bridge between the app and the window
data/tat-images/  the bundled public-domain picture library (2,001 files)
data/tat-classic/ the classic TAT set (41 plates, user-supplied; see NOTICE.txt)
data/wat-hints/   plain meanings + five model sentences for every built-in WAT word
digest-tool/      the separate Python news-digest engine (shipped outside the asar)
src/renderer/     the interface: index.html, styles.css, app.js
tools/make-icon.js  generates build/icon.png with no dependencies
tools/build-tat-images.js  downloads/extend the museum picture library (resumable, de-duplicated)
tools/build-tat-classic.py  builds the classic TAT set from a PDF + folder (perceptual de-duplication)
tools/verify-package.js  checks the built .exe really contains the source you edited
screenshots/      images captured from the running app by the smoke test
docs/             architecture, workflow, debugging and the project log
AGENTS.md         handover instructions for the next developer or AI
```

## Debugging and handover

**Settings → Open diagnostics** shows the environment, bundled data counts, your store, every
relevant path, the working flow and a live tail of the log, with **Save report…** for a bug report
and **Open log folder**. The same information is on disk in
`%APPDATA%\SSB Prep Trainer\logs\app.log`, tagged by scope (`app`, `config`, `digest`, `error`,
`crash`, …).

For anyone taking this project over:

| Document | What it covers |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | processes, IPC surface, storage layout, packaging, constraints |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | change loop, smoke suite, build, verification, release checklist |
| [docs/DEBUGGING.md](docs/DEBUGGING.md) | log format, Diagnostics, known failure modes, data recovery |
| [docs/PROJECT_LOG.md](docs/PROJECT_LOG.md) | chronological decisions, changes and what was verified |
| [AGENTS.md](AGENTS.md) | operating rules for an AI working on the repository |

## Verifying a change

`npm run smoke` drives the real window through every feature and exits non-zero if anything fails.
It runs a full TAT/WAT/SRT cycle, then checks the timers advance on their own, pause and resume,
that WAT has no typing field and shows one large clock with a plain meaning, that its result screen
lists five model sentences for every word, SRT situation navigation, TAT slide advance, a bundled
picture actually decoding on the slide, your own pictures, saving / reopening / exporting / deleting
attempts, your own custom sets, settings persistence, the lecturette phases and facts panel,
the 334-topic catalogue with its search box and theme filter, a drafted script, the current-points
panel serving a saved copy with the internet switched off and grouping it into the four news
sections, a WAT word getting a real headline as its news line, the lecturette re-flowing to one
column and scaling its type when the window is resized, the ten-tile dashboard with its arrow-key
highlight and zero settings menu in the top bar, taking a picture to the bin and restoring it,
deleting it for good, the Add material screen validating a pasted word list, the display-sleep blocker, the external-link guard,
the full word library (search, paging, meanings, sentiment tabs, random words), the optional online
lookup, both palettes (Mist dark shipped, Alpine light one switch away, each with high-contrast body
text), the persistent log and the Diagnostics screen, and the separate
news-digest engine (found, its GUI present, and a real command executed), the classic TAT set and the
absence of a typing box in TAT and SRT. It writes screenshots to `screenshots/` and prints a JSON report
between `=== SMOKE RESULTS ===` and `=== SMOKE END ===`:

```bash
npm run smoke
```

Under `--smoke` only, native file dialogs are stubbed and `shell.openExternal` is recorded instead
of launching a browser, so those code paths are tested without a human clicking a dialog. Nothing
changes in normal use.

Open `screenshots/index.html` to review the captured screens.
