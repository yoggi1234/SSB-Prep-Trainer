'use strict';

// The whole phone build, section by section: dashboard, add, bin, library,
// digest, diagnostics, then a TAT run with real plates, a WAT run, an SRT run,
// the export path and a lecturette. Run with tools/mobile-probe/drive.js.
module.exports = async function (page) {
  const out = { checks: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail: JSON.stringify(detail) });
  const home = async () => {
    await page.ev('(document.querySelector(\'[data-goto="home"]\')||{click(){}}).click()');
    await page.sleep(450);
  };
  const tile = async (id) => {
    await home();
    await page.ev('document.querySelector(\'[data-tile="' + id + '"]\').click()');
    await page.sleep(900);
  };
  const txt = () => page.ev('document.body.innerText');

  page.step('dashboard');
  await home();
  await page.sleep(800);

  /* ------------------------------------------------------------ dashboard */
  const dash = await txt();
  check('dashboard has ten tiles', (await page.ev('document.querySelectorAll("[data-tile]").length')) === 10);
  check('dashboard bin count is a number', !/undefined/.test(dash), (dash.match(/BIN[\s\S]{0,40}/) || [''])[0]);
  check('dashboard copy matches the online setting', /(This copy runs offline|Online extras are on)/.test(dash), (dash.match(/Everything for the board[\s\S]{0,120}/) || [''])[0]);

  /* ----------------------------------------------------------------- add */
  page.step('add');
  await tile('add');
  const add = await txt();
  check('add shows 43 classic plates', /43 classic/.test(add));
  check('add bin chip has a count', !/Open bin \(undefined\)/.test(add));
  check('add explains session pictures on the phone', /stay until the app is closed/.test(add));
  out.addImages = JSON.parse(
    await page.ev('JSON.stringify([...document.querySelectorAll(".pick-grid img")].slice(0,3).map(i=>({src:i.getAttribute("src").slice(0,40), w:i.naturalWidth})))')
  );
  check('classic thumbnails decode', out.addImages.length > 0 && out.addImages.every((i) => i.w > 0), out.addImages);

  /* ----------------------------------------------------------------- bin */
  page.step('bin');
  await tile('bin');
  const bin = await txt();
  check('bin screen renders without crashing', /The bin is empty|picture/.test(bin), bin.slice(0, 100));

  /* ------------------------------------------------------------- library */
  page.step('library');
  await tile('library');
  await page.sleep(4500);
  out.libraryStats = JSON.parse(
    await page.ev('JSON.stringify([...document.querySelectorAll(".stat .num")].map(e=>e.innerText))')
  );
  const words = parseInt(String(out.libraryStats[0] || '0').replace(/[^0-9]/g, ''), 10);
  check('library counts the whole dictionary', words > 100000, out.libraryStats[0]);
  check('library counts meanings', parseInt(String(out.libraryStats[1] || '0').replace(/[^0-9]/g, ''), 10) > 100000, out.libraryStats[1]);
  out.libraryTabs = JSON.parse(
    await page.ev('JSON.stringify([...document.querySelectorAll(".tabs button")].map(b=>b.innerText.trim()))')
  );
  check('the fourth tab is Action verbs', /Action verbs/.test(out.libraryTabs.join('|')), out.libraryTabs);

  page.step('library search');
  await page.ev('(function(){var q=document.getElementById("libQ"); q.value="duty"; q.dispatchEvent(new Event("input",{bubbles:true})); return 1;})()');
  await page.sleep(1600);
  out.searchRows = await page.ev('document.querySelectorAll("#libList .wordrow").length');
  check('searching duty finds words', out.searchRows > 0, out.searchRows);

  page.step('meaning');
  await page.ev('(document.querySelector("#libList [data-meaning]")||{click(){}}).click()');
  await page.sleep(900);
  check('a meaning opens', /obliged|Meaning/i.test(await txt()));

  page.step('action verbs');
  await page.ev('(function(){var b=[...document.querySelectorAll(".tabs button")].find(x=>/Action verbs/.test(x.innerText)); if(b) b.click(); return 1;})()');
  await page.sleep(1500);
  const verbs = await txt();
  check('action verbs load with their groups', /Negative/.test(verbs) && /Positive/.test(verbs) && /Neutral/.test(verbs), verbs.slice(0, 120));
  await page.shot('screenshots/mobile/library-verbs.png');

  /* -------------------------------------------------------------- digest */
  page.step('digest');
  await tile('digest');
  await page.sleep(1500);
  const dig = await txt();
  check('digest is explained as desktop-only', /desktop app/.test(dig), dig.slice(0, 140));
  check('digest shows no dead generate form', (await page.ev('!!document.getElementById("digRun")')) === false);

  /* ----------------------------------------------------- settings + diag */
  page.step('settings');
  await tile('settings');
  check('settings render', /Settings/i.test(await txt()));
  await page.ev('(function(){var b=[...document.querySelectorAll("button")].find(x=>/diagnostic/i.test(x.innerText)); if(b) b.click(); return 1;})()');
  await page.sleep(1500);
  const dt = await txt();
  check('diagnostics renders', /Diagnostics/.test(dt));
  out.diagText = dt.slice(0, 600);

  /* ----------------------------------------------------------------- TAT */
  page.step('tat');
  await page.ev('window.api.setConfig({tatViewSec:2}).then(()=>1)');
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  await page.sleep(4500);
  await page.ev('document.querySelector(\'[data-tile="tat"]\').click()');
  await page.sleep(900);
  await page.ev('document.getElementById("go").click()');
  await page.sleep(1200);
  out.tatView = JSON.parse(
    await page.ev(
      'JSON.stringify({img:(function(){var i=document.querySelector("#slideContent img"); if(!i) return null; var r=i.getBoundingClientRect(); return {src:i.getAttribute("src"), w:i.naturalWidth, h:i.naturalHeight, left:Math.round(r.left), right:Math.round(r.right)};})(), phase:document.getElementById("phase").innerText, vw:innerWidth})'
    )
  );
  check('TAT shows a decoded plate', out.tatView.img && out.tatView.img.w > 0, out.tatView.img);
  check('TAT plate is the bundled classic file', /tat-classic/.test(out.tatView.img ? out.tatView.img.src : ''));
  check('TAT plate fits the screen width', out.tatView.img && out.tatView.img.left >= 0 && out.tatView.img.right <= out.tatView.vw, out.tatView.img);
  await page.shot('screenshots/mobile/tat-view.png');

  await page.sleep(2200);
  out.tatWrite = JSON.parse(
    await page.ev('JSON.stringify({phase:document.getElementById("phase").innerText, hidden:document.getElementById("slideContent").hidden})')
  );
  check('TAT turns to writing by itself', /^writing$/i.test(out.tatWrite.phase), out.tatWrite.phase);
  check('TAT picture is taken away while writing', out.tatWrite.hidden === true);

  await page.ev('document.getElementById("nextBtn").click()');
  await page.sleep(700);
  check(
    'slide 2 loads another plate',
    (await page.ev('(function(){var i=document.querySelector("#slideContent img"); return !!(i && i.naturalWidth > 0);})()')) === true
  );
  await page.ev('document.querySelector("[data-end]").click()');
  await page.sleep(1500);
  check('TAT result renders', /Slides you practised/.test(await txt()));
  check('TAT result keeps plate thumbnails', (await page.ev('document.querySelectorAll(".tat-thumb img").length')) > 0);
  await page.shot('screenshots/mobile/tat-result.png');
  await page.ev('window.api.setConfig({tatViewSec:30}).then(()=>1)');

  /* ----------------------------------------------------------------- WAT */
  page.step('wat');
  await home();
  await page.ev('document.querySelector(\'[data-tile="wat"]\').click()');
  await page.sleep(800);
  await page.ev('document.getElementById("go").click()');
  await page.sleep(1200);
  const w1 = await page.ev('document.getElementById("word").innerText');
  check('WAT shows a word', !!w1 && w1.length > 1, w1);
  await page.shot('screenshots/mobile/wat.png');
  await page.ev('document.getElementById("nextBtn").click()');
  await page.sleep(600);
  const w2 = await page.ev('document.getElementById("word").innerText');
  check('WAT advances', w2 !== w1, [w1, w2]);
  await page.ev('document.querySelector("[data-end]").click()');
  await page.sleep(1500);
  check('WAT result saves', /WAT attempt saved/.test(await txt()));

  /* ----------------------------------------------------------------- SRT */
  page.step('srt');
  await home();
  await page.ev('document.querySelector(\'[data-tile="srt"]\').click()');
  await page.sleep(800);
  await page.ev('document.getElementById("go").click()');
  await page.sleep(1200);
  const s1 = await page.ev('document.getElementById("situation").innerText');
  check('SRT shows a situation', !!s1 && s1.length > 5, s1.slice(0, 60));
  check('SRT builds the 60-item navigator', (await page.ev('document.querySelectorAll("#navGrid .qbtn").length')) === 60);
  await page.shot('screenshots/mobile/srt.png');
  await page.ev('document.getElementById("nextBtn").click()');
  await page.sleep(500);
  check('SRT advances', (await page.ev('document.getElementById("situation").innerText')) !== s1);
  await page.ev('document.querySelector("[data-end]").click()');
  await page.sleep(1500);
  check('SRT result saves', /SRT attempt saved/.test(await txt()));

  /* -------------------------------------------------------------- export */
  page.step('export');
  await page.ev('document.getElementById("export").click()');
  await page.sleep(1200);
  out.exportToast = await page.ev('document.getElementById("toast").innerText');
  check('export reports where the text went', /clipboard/i.test(out.exportToast), out.exportToast);

  /* ---------------------------------------------------------- lecturette */
  page.step('lecturette');
  await home();
  await page.ev('document.querySelector(\'[data-tile="lecturette"]\').click()');
  await page.sleep(900);
  check('lecturette lists topics', (await page.ev('document.querySelectorAll("[data-lectstart]").length')) > 0);
  await page.ev('document.querySelector("[data-lectstart]").click()');
  await page.sleep(1300);
  const phase = await page.ev('(document.getElementById("lectPhaseChip")||{}).innerText||""');
  const clock = await page.ev('(document.getElementById("lectClock")||{}).innerText||""');
  check('lecturette run has a phase and a clock', !!phase && /\d\d:\d\d/.test(clock), [phase, clock]);
  await page.shot('screenshots/mobile/lecturette.png');
  await page.ev('(function(){var b=document.getElementById("lectNext"); if(b) b.click(); return 1;})()');
  await page.sleep(800);
  check('lecturette phase advances', (await page.ev('(document.getElementById("lectPhaseChip")||{}).innerText||""')) !== phase);
  await page.ev('(function(){var b=document.getElementById("lectFinish"); if(b) b.click(); return 1;})()');
  await page.sleep(1300);
  check('lecturette finishes to a summary', /Lecturette finished/.test(await txt()));

  await home();
  out.logs = page.logs.slice();
  return out;
};
