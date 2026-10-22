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
  await page.sleep(4500);
  await page.ev('document.querySelector(\'[data-tile="tat"]\').click()');
  await page.sleep(900);
  await page.ev('document.getElementById("go").click()');
  await page.sleep(3200);

  out.clock = JSON.parse(
    await page.ev(
      'JSON.stringify({phase:document.getElementById("phase").innerText, clockHidden:document.getElementById("writeClock").hidden, num:document.getElementById("writeClockNum").innerText, cls:document.getElementById("slidebox").className, pictureHidden:document.getElementById("slideContent").hidden, font:getComputedStyle(document.getElementById("writeClockNum")).fontSize})'
    )
  );
  check('writing clock is visible while writing', out.clock.clockHidden === false, out.clock);
  check('writing clock counts down', /^\d?\d:\d\d$/.test(out.clock.num), out.clock.num);
  check('the stage is in writing mode', /writing/.test(out.clock.cls), out.clock.cls);
  check('the picture stays hidden while writing', out.clock.pictureHidden === true);
  check('the clock is rendered large', parseFloat(out.clock.font) >= 40, out.clock.font);
  await page.shot('screenshots/mobile/tat-writing-full.png');

  await page.ev('document.querySelector("[data-end]").click()');
  await page.sleep(1200);
  await page.ev('window.api.setConfig({tatViewSec:30}).then(()=>1)');
  await home();

  out.logs = page.logs.slice();
  return out;
};
