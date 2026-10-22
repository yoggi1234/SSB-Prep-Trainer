/*
 * Runs a scenario against the running Android WebView over the Chrome DevTools
 * Protocol, so the phone build can be exercised on a real device instead of by
 * eye alone.
 *
 *   adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>
 *   node tools/mobile-probe/drive.js tools/mobile-probe/scenarios/phone.js
 *
 * A scenario is a module exporting `async function (page)`, where page has
 *   ev(expression)  evaluate in the page, awaited, value returned
 *   sleep(ms)
 *   shot(path)      PNG of the viewport
 *   logs            console errors and uncaught exceptions seen so far
 * Port 9223 can be changed with CDP_PORT.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CDP_PORT || 9223);

async function findPage() {
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const p = list.find((x) => x.type === 'page');
  if (!p) throw new Error('no page on port ' + PORT + ' — is the app running and forwarded?');
  return p.webSocketDebuggerUrl;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('could not open the devtools socket'));
  });
}

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error('pass a scenario file');
  const scenario = require(path.resolve(file));

  const ws = await connect(await findPage());
  let id = 0;
  const pending = new Map();
  const logs = [];

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(JSON.stringify(m.error)));
      else p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('EXC ' + ((d.exception && d.exception.description) || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      logs.push(
        'CONSOLE ' + m.params.type + ' ' +
          m.params.args.map((a) => a.value || a.description || '').join(' ')
      );
    }
  });

  function send(method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const mid = ++id;
      const timer = setTimeout(() => {
        pending.delete(mid);
        reject(new Error(method + ' timed out'));
      }, timeoutMs || 20000);
      pending.set(mid, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const page = {
    logs,
    sleep,
    step(name) {
      process.stderr.write('· ' + name + '\n');
    },
    async ev(expression, opts) {
      // A reload destroys the execution context mid-evaluation; retry briefly
      // instead of hanging or failing the whole scenario.
      let lastError = null;
      for (let attempt = 0; attempt < 24; attempt++) {
        try {
          const r = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
          }, (opts && opts.timeout) || 30000);
          if (r.exceptionDetails) {
            const d = r.exceptionDetails;
            const msg = (d.exception && d.exception.description) || d.text;
            if (/Execution context was destroyed|Cannot find context/i.test(msg)) throw new Error(msg);
            throw new Error('page exception: ' + msg);
          }
          return r.result.value;
        } catch (err) {
          lastError = err;
          await sleep(250);
        }
      }
      throw lastError;
    },
    // adb screencap is used instead of Page.captureScreenshot: the CDP call
    // waits for a stable frame and can hang while a screen animates, which
    // stalls the whole scenario.
    async shot(out) {
      const { spawnSync } = require('child_process');
      const adb = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
      const r = spawnSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0 || !r.stdout || !r.stdout.length) {
        throw new Error('screencap failed: ' + (r.stderr || '').toString().slice(0, 200));
      }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, r.stdout);
      return out;
    }
  };

  try {
    const result = await scenario(page);
    if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  } finally {
    ws.close();
  }
})().catch((e) => {
  console.error('DRIVE FAILED:', e.message);
  process.exit(1);
});
