'use strict';

// The two phone behaviours added on request: the hardware back button returns
// to the dashboard instead of closing the app, and the TAT writing phase fills
// the stage with a large clock.
module.exports = async function (page) {
  const out = { checks: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail: JSON.stringify(detail) });
  const home = async () => {
    await page.ev('(document.querySelector(\'[data-goto="home"]\')||{click(){}}).click()');
    await page.sleep(400);
  };

  // Start from a known screen: a previous run may have left a session open.
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  await page.sleep(600);
  for (let i = 0; i < 40; i++) {
    if (await page.ev('!!document.querySelector(\'[data-tile="settings"]\')')) break;
    await page.sleep(300);
  }

  // Back from a section: handled, and the dashboard is showing.
  page.step('back from settings');
  await page.ev('document.querySelector(\'[data-tile="settings"]\').click()');
  await page.sleep(800);
  out.fromSettings = JSON.parse(
    await page.ev('JSON.stringify({handled: window.__ssbBack(), tiles: document.querySelectorAll("[data-tile]").length})')
  );
  check('back from a section is handled by the app', out.fromSettings.handled === true, out.fromSettings);
  check('back lands on the dashboard', out.fromSettings.tiles === 10, out.fromSettings);

  // Back on the dashboard itself: not handled, so the app may leave.
  out.fromHome = await page.ev('window.__ssbBack()');
  check('back on the dashboard is left to Android', out.fromHome === false, out.fromHome);

  // Writing clock: a 2 s viewing phase gets to writing quickly.
  page.step('writing clock');
  await page.ev('window.api.setConfig({tatViewSec:2}).then(()=>1)');
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  // The opening sheet now reads each piece of data in turn, so wait for the
  // dashboard instead of guessing at a fixed delay.
  for (let i = 0; i < 40; i++) {
    if (await page.ev('!!document.querySelector(\'[data-tile="tat"]\')')) break;
    await page.sleep(300);
  }
  // The dashboard can re-render while the online probe settles, so keep asking
  // for the TAT sheet until its Start button is really there.
  for (let i = 0; i < 20; i++) {
    if (await page.ev('!!document.getElementById("go")')) break;
    await page.ev('(document.querySelector(\'[data-tile="tat"]\')||{click(){}}).click()');
    await page.sleep(400);
  }
  await page.ev('document.getElementById("go").click()');
  await page.sleep(3200);

  out.clock = JSON.parse(
    await page.ev(
      'JSON.stringify({phase:document.getElementById("phase").innerText,' +
        'overlayHidden:document.getElementById("writeStage").hidden,' +
        'num:document.getElementById("writeClockNum").innerText,' +
        'pictureHidden:document.getElementById("slideContent").hidden,' +
        'font:getComputedStyle(document.getElementById("writeClockNum")).fontSize,' +
        'rect:(function(){var r=document.getElementById("writeStage").getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};})(),' +
        'view:{w:innerWidth,h:innerHeight},' +
        'next:(function(){var r=document.getElementById("nextBtn2").getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};})()})'
    )
  );
  check('the writing clock fills the screen', out.clock.overlayHidden === false, out.clock);
  check(
    'the clock sheet covers the whole window',
    out.clock.rect.w >= out.clock.view.w - 1 && out.clock.rect.h >= out.clock.view.h - 1,
    out.clock
  );
  check('writing clock counts down', /^\d?\d:\d\d$/.test(out.clock.num), out.clock.num);
  check('the picture is gone while writing', out.clock.pictureHidden === true);
  check('the clock is rendered large', parseFloat(out.clock.font) >= 80, out.clock.font);
  check(
    'Next is a full-width thumb button in portrait',
    out.clock.next.w >= out.clock.view.w * 0.85 && out.clock.next.h >= 56,
    out.clock.next
  );
  await page.shot('screenshots/mobile/tat-writing-full.png');

  await page.ev('document.querySelector("[data-end]").click()');
  await page.sleep(1200);
  await page.ev('window.api.setConfig({tatViewSec:30}).then(()=>1)');
  await home();

  out.logs = page.logs.slice();
  return out;
};
