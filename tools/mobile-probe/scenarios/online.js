'use strict';

// Online extras on the phone: status, Datamuse meanings and related words,
// Google News headlines (through rss2json), lecture points, and the Art
// Institute museum fetch kept in IndexedDB.
module.exports = async function (page) {
  const out = { checks: [] };
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail: JSON.stringify(detail) });

  await page.ev('window.api.setConfig({onlineEnabled:true}).then(()=>1)');
  await page.ev('setTimeout(function(){location.reload()},50), 1');
  await page.sleep(4500);

  page.step('status');
  out.status = JSON.parse(await page.ev('window.api.onlineStatus().then(r=>JSON.stringify(r))'));
  check('online switch reports enabled', out.status.enabled === true, out.status);

  out.probe = JSON.parse(await page.ev('window.api.onlineProbe().then(r=>JSON.stringify(r))'));
  check('the probe reaches Datamuse', out.probe.online === true, out.probe);

  page.step('meaning');
  out.meaning = JSON.parse(
    await page.ev('window.api.onlineMeaning("serendipity").then(r=>JSON.stringify(r))')
  );
  check('online meaning comes back', out.meaning.ok === true, out.meaning.error || out.meaning.word);
  check('meaning has senses', !!(out.meaning.senses && out.meaning.senses.length), out.meaning.senses && out.meaning.senses.length);

  page.step('related words');
  out.words = JSON.parse(
    await page.ev('window.api.onlineWords({theme:"duty",count:12}).then(r=>JSON.stringify({ok:r.ok,count:(r.words||[]).length,first:(r.words||[])[0],error:r.error}))')
  );
  check('online related words come back', out.words.ok === true && out.words.count > 0, out.words);

  page.step('headlines');
  out.news = JSON.parse(
    await page.ev('window.api.newsIndex({force:true}).then(r=>JSON.stringify({ok:r.ok,count:(r.items||[]).length,first:((r.items||[])[0]||{}).text,error:r.error}))')
  );
  check('headline index loads', out.news.ok === true && out.news.count > 0, out.news);

  page.step('lecture points');
  out.live = JSON.parse(
    await page.ev('window.api.lecturesLive({id:"probe",query:"Indian Army"}).then(r=>JSON.stringify({ok:r.ok,count:(r.points||[]).length,first:((r.points||[])[0]||{}).text,error:r.error}))')
  );
  check('lecture points load for a topic', out.live.ok === true && out.live.count > 0, out.live);

  page.step('museum fetch');
  out.museum = JSON.parse(
    await page.ev('window.api.tatOnline({count:2}).then(r=>JSON.stringify(r))', { timeout: 120000 })
  );
  check('museum fetch adds pictures', out.museum.ok === true && out.museum.added > 0, out.museum);

  page.step('museum stored');
  out.library = JSON.parse(
    await page.ev('window.api.tatLibrary().then(r=>JSON.stringify({count:r.length, first:(r[0]||{}).title, isData:String((r[0]||{}).file||"").slice(0,30)}))')
  );
  check('fetched pictures are stored for the library', out.library.count >= 1, out.library);

  out.pixel = await page.ev(
    'window.api.tatLibrary().then(function(r){ return new Promise(function(res){ var i=new Image(); i.onload=function(){res(JSON.stringify({w:i.naturalWidth,h:i.naturalHeight}));}; i.onerror=function(){res(JSON.stringify({error:"decode"}));}; i.src=(r[0]||{}).file||""; }); })'
  );
  out.pixel = JSON.parse(out.pixel);
  check('a fetched picture decodes', out.pixel.w > 0, out.pixel);

  page.step('header');
  await page.sleep(2500);
  out.chip = await page.ev('(document.querySelector(".net-chip")||{}).innerText || ""');
  check('the header shows the connection state', /online|offline/i.test(out.chip), out.chip);

  out.logs = page.logs.slice();
  return out;
};
