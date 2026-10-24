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
  check('add says your pictures are kept on the phone', /kept on this phone/.test(add));
  out.addImages = JSON.parse(
    await page.ev('JSON.stringify([...document.querySelectorAll(".pick-grid img")].slice(0,3).map(i=>({src:i.getAttribute("src").slice(0,40), w:i.naturalWidth})))')
  );
  check('classic thumbnails decode', out.addImages.length > 0 && out.addImages.every((i) => i.w > 0), out.addImages);

  /* ----------------------------------------------------------------- bin */
  page.step('bin');
  await tile('bin');
  const bin = await txt();
  check('bin screen renders without crashing', /The bin is empty|picture/.test(bin), bin.slice(0, 100));

  // Your pictures survive a restart: one generated picture goes through the real
  // <input type=file> path (the native chooser cannot be clicked), then the app reloads.
  page.step('your pictures persist');
  await page.ev('window.api.clearTatImages().then(()=>1)');
  await page.ev('(function(){var c=document.createElement("canvas"); c.width=64; c.height=48; c.getContext("2d").fillRect(0,0,64,48); return new Promise(function(r){c.toBlob(function(b){var f=new File([b],"probe.png",{type:"image/png"}); var orig=HTMLInputElement.prototype.click; HTMLInputElement.prototype.click=function(){HTMLInputElement.prototype.click=orig; var dt=new DataTransfer(); dt.items.add(f); this.files=dt.files; this.dispatchEvent(new Event("change"));}; window.api.pickTatImages().then(function(l){r(l.length);});},"image/png");});})()');
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  await page.sleep(4000);
  const mine = JSON.parse(await page.ev('window.api.listTatImages().then(function(l){return new Promise(function(r){if(!l.length) return r(JSON.stringify({n:0})); var i=new Image(); i.onload=function(){r(JSON.stringify({n:l.length,w:i.naturalWidth}));}; i.onerror=function(){r(JSON.stringify({n:l.length,w:0}));}; i.src=l[0];});})'));
  check('your picture is still there after a restart and decodes', mine.n === 1 && mine.w === 64, mine);

  // The bin works on the phone the way it does on the desktop.
  page.step('bin round trip');
  const plate = JSON.parse(await page.ev('window.api.tatClassic().then(l=>JSON.stringify({n:l.length,id:l[0].id,file:l[0].file}))'));
  const mineUrl = await page.ev('window.api.listTatImages().then(l=>l[0])');
  await page.ev('window.api.tatRemove({id:' + JSON.stringify(plate.id) + ',kind:"classic",file:' + JSON.stringify(plate.file) + ',title:"probe plate"}).then(()=>1)');
  await page.ev('window.api.tatRemove({id:' + JSON.stringify(mineUrl) + ',kind:"mine",file:' + JSON.stringify(mineUrl) + ',title:"probe.png"}).then(()=>1)');
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  await page.sleep(4000);
  const binned = JSON.parse(await page.ev('Promise.all([window.api.tatClassic(),window.api.listTatImages(),window.api.tatBin()]).then(r=>JSON.stringify({classic:r[0].length,mine:r[1].length,bin:r[2].length,binMineShown:/^blob:/.test((r[2].find(b=>b.kind==="mine")||{}).file||"")}))'));
  check('binned pictures leave every source, even after a restart', binned.classic === plate.n - 1 && binned.mine === 0 && binned.bin === 2, binned);
  check('a binned picture of yours still shows in the bin', binned.binMineShown === true, binned);
  await tile('bin');
  check('bin screen lists the removed pictures', (await page.ev('document.querySelectorAll("[data-restore]").length')) === 2);
  await page.ev('window.api.tatRestore(' + JSON.stringify(plate.id) + ').then(()=>1)');
  const mineKey = await page.ev('window.api.tatBin().then(b=>b[0].id)');
  await page.ev('window.api.tatPurge(' + JSON.stringify(mineKey) + ').then(()=>1)');
  const after = JSON.parse(await page.ev('Promise.all([window.api.tatClassic(),window.api.listTatImages(),window.api.tatBin(),window.api.tatGoneCount()]).then(r=>JSON.stringify({classic:r[0].length,mine:r[1].length,bin:r[2].length,gone:r[3]}))'));
  check('restore brings the plate back; delete forever keeps it out', after.classic === plate.n && after.mine === 0 && after.bin === 0 && after.gone === 1, after);
  await page.ev('window.api.tatResurrect(' + JSON.stringify(mineKey) + ').then(()=>1)');
  check('a permanent delete can be undone', (await page.ev('window.api.listTatImages().then(l=>l.length)')) === 1);
  await page.ev('window.api.clearTatImages().then(()=>1)');

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
  // Online off with no saved edition must still open the reference edition bundled in the APK.
  page.step('digest');
  await page.ev('window.api.setConfig({onlineEnabled:false}).then(()=>{localStorage.removeItem("ssb-digest-phone"); return 1;})');
  await tile('digest');
  await page.sleep(1500);
  const dig = JSON.parse(
    await page.ev('JSON.stringify({sections:document.querySelectorAll(".dig-sec").length, chips:[...document.querySelectorAll(".chip")].map(c=>c.innerText)})')
  );
  check('digest opens an edition', dig.sections > 0, dig);
  check('digest offline with no saved copy is the bundled edition', dig.chips.indexOf('bundled offline') !== -1, dig.chips);
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
