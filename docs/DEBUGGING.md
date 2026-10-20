# Debugging

Start here when something is wrong, or when you inherit this project and need to know what it is
doing. Everything is local; nothing needs a network or an account.

## 1. In-app Diagnostics

**Settings → Open diagnostics** (or `goto('diagnostics')` in the smoke harness) shows:

- **Environment** — version, packaged or source, Electron/Chromium/Node, platform and arch.
- **Bundled data** — WAT/SRT/TAT set counts, lecturette topics, museum pictures, classic plates,
  WAT model-sentence entries, dictionary size.
- **Your store** — saved attempts, store size, custom sets, TAT picture source, online switch,
  Python version, digest library status.
- **Paths** — user data, store file, log file, data folder, digest engine folder.
- **How the app works** — the six-step flow in plain language.
- **Live log** — the last 300 lines, refreshed every 3 seconds.
- **Save report…** — writes a timestamped `.txt` containing environment, data, paths and log to
  Documents. This is the file to attach to a bug report.
- **Open log folder** — opens the log directory in Explorer.

## 2. The log file

```
%APPDATA%\SSB Prep Trainer\logs\app.log
```

Plain text, one line per event, ISO timestamp, scope in brackets:

```
2026-10-19T09:12:03.441Z [app] start {"version":"1.0.0","packaged":true,…}
2026-10-19T09:12:05.002Z [config] set {"tatSource":"classic"}
2026-10-19T09:12:41.887Z [digest] run started {"args":["run","today"]}
2026-10-19T09:13:02.114Z [digest] run finished {"code":1,"files":12}
```

Scopes: `app`, `config`, `attempt`, `tat`, `digest`, `window`, `console` (anything logged with
`console.log`), `error` (`console.error`), `crash` (`uncaughtException` / `unhandledRejection`).

Rotates once at 2 MB to `app.old.log`; recent lines are also kept in memory for the Diagnostics
screen. A missing or unwritable log is non-fatal by design — the app keeps working.

Useful greps:

```bash
grep -n "\[crash\]\|\[error\]" "$APPDATA/SSB Prep Trainer/logs/app.log"
grep -n "\[digest\]" "$APPDATA/SSB Prep Trainer/logs/app.log" | tail -40
```

## 3. The smoke suite as a debugger

```bash
npm run smoke
```

It is not a unit-test suite; it is a scripted session against the real renderer. Read the JSON
report: each entry has `step`, `result`, and often the observed value. A failing step plus its
screenshot (`screenshots/NN-name.png`) usually identifies the screen and the state.

Useful when only part of the app is suspect: comment out unrelated sections in `runSmoke()`
temporarily, or add a targeted check, but restore before finishing. Never leave the suite weakened.

The suite also proves the environment: Python found, digest libraries present, classic plates
decoded, SSB data untouched by the digest.

## 4. Known failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| “Python was not found” in News Digest | No `python`/`py`/`python3` on PATH | Install Python 3.9+, tick “Add to PATH” |
| “Python libraries missing” | `reportlab`, `pypdf`, `feedparser` or `trafilatura` absent | `python -m pip install -r requirements.txt` |
| Digest exits non-zero immediately | Engine copied but config/draft malformed, or no internet with web on | Check the digest log pane; try **internet off**; read `[digest]` lines in `app.log` |
| Digest PDF missing | Output folder is `%APPDATA%\SSB Prep Trainer\news-digest\output` | Open from the tab, or inspect that folder |
| White screen on launch | Renderer exception before first paint | Run `npm start` and open DevTools (`Ctrl+Shift+I`); check `[error]` lines |
| Timers freeze when window loses focus | `backgroundThrottling` re-enabled | It must stay `false` in `createWindow()` |
| Theme wrong in packaged app only | Built before the CSS edit | Rebuild; run `verify-package.js` |
| `verify-package.js` mismatch | Build raced the last edit | Rebuild, do not edit the verifier |
| SmartScreen warning | Unsigned executable | Expected; More info → Run anyway |
| Pictures look soft | Smallest classic plate is 244 px on its short side | Replace that plate via `build-tat-classic.py` |
| TAT repeats a picture | Pool smaller than the holdback | Holdback adapts to pool size; check `data/tat-classic.json` count |

## 5. Digest engine debugging

The engine is ordinary Python and can be run outside the app:

```bash
cd "$APPDATA/SSB Prep Trainer/news-digest"
python -m newsdigest.cli --help
python -m newsdigest.cli run --no-web
```

It streams stage lines (`[1/7] Reading publisher feeds…`) and writes a run log. The GUI shows the
same stream. If the GUI shows nothing, the process likely never started — check `digest:status`
and the `[digest]` log lines, not the animation.

Config is `config.json` in that folder; drafts, inbox, state and output are siblings. Deleting the
whole `news-digest` folder is safe: it is recreated from the package on next launch, with a fresh
config. That is the recovery step for a corrupted engine state.

## 6. Data and store debugging

- Store: `%APPDATA%\SSB Prep Trainer\ssb-prep-store.json`. It is human-readable. Back it up before
  editing. The app merges missing keys from `defaults()`, so a partial file is survivable.
- Bundled data is read-only and validated only by shape. A malformed `data/*.json` shows as 0 sets
  rather than a crash; `data:load` logs the read error.
- Attempts older than the last 300 are dropped by design.
- TAT pictures added by the user are **paths only**; moving the files breaks those entries.

## 7. Security-relevant behaviour to preserve

- `contextIsolation: true`, `nodeIntegration: false`.
- CSP `connect-src 'none'` in `index.html`; never add a remote script or style.
- External links go through the `setWindowOpenHandler` guard, which only allows `http(s)` and opens
  the system browser.
- `shell.openPath` / `openExternal` receive only paths and URLs constructed by the main process.
- The digest is spawned with an argument array, never a shell string.
