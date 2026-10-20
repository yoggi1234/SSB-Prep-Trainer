/*
 * Builds the offline word library for SSB Prep Trainer.
 *
 * Sources (all free, no subscription):
 *   - WordNet 3.1 (Princeton)  : words + definitions
 *   - AFINN-165                : positive/negative sentiment scores
 *
 * Output: data/dictionary.json
 * Run:    node tools/build-dictionary.js
 *
 * This is a BUILD-TIME script. The generated JSON ships inside the app, so the
 * packaged application still has zero runtime dependencies.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DICT_DIR = path.join(__dirname, '..', 'node_modules', 'wordnet-db', 'dict');
const OUT_DIR = path.join(__dirname, '..', 'data');

const POS_BY_TYPE = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };

function parseDataFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    // Synset lines begin with an 8-digit byte offset; skip the licence header.
    if (!/^\d{8} /.test(line)) continue;
    const bar = line.indexOf('|');
    if (bar < 0) continue;

    const head = line.slice(0, bar).trim();
    let gloss = line.slice(bar + 1).trim();
    const fields = head.split(/\s+/);
    if (fields.length < 5) continue;

    const ssType = fields[2];
    const wCnt = parseInt(fields[3], 16);
    if (!Number.isFinite(wCnt) || wCnt <= 0) continue;

    // Word/lex_id pairs follow the count field.
    const words = [];
    for (let i = 0; i < wCnt; i++) {
      const w = fields[4 + i * 2];
      if (w) words.push(w.replace(/_/g, ' ').toLowerCase());
    }
    // Gloss = definition; drop trailing example sentences in quotes for cleanliness
    // but keep them if the definition itself is short.
    gloss = gloss.replace(/\s+/g, ' ').trim();
    const parts = gloss.split(/;\s*"/);
    const definition = (parts[0] || '').replace(/"$/, '').trim();
    if (!definition || !words.length) continue;

    const pos = POS_BY_TYPE[ssType] || 'noun';
    out.push({ words, pos, definition });
  }
  return out;
}

function main() {
  const files = ['data.noun', 'data.verb', 'data.adj', 'data.adv'];
  let synsets = [];
  for (const f of files) {
    const p = path.join(DICT_DIR, f);
    if (!fs.existsSync(p)) {
      console.error('Missing WordNet data file:', p);
      process.exit(1);
    }
    synsets = synsets.concat(parseDataFile(p));
  }
  console.log('Parsed synsets:', synsets.length);

  // word -> { p: [{pos, def}] , s: sentiment }
  const words = new Map();

  for (const syn of synsets) {
    for (const w of syn.words) {
      let e = words.get(w);
      if (!e) {
        e = { p: [], s: 0 };
        words.set(w, e);
      }
      // avoid duplicate identical definitions
      if (!e.p.some((x) => x.pos === syn.pos && x.def === syn.definition)) {
        e.p.push({ pos: syn.pos, def: syn.definition });
      }
    }
  }
  console.log('WordNet headwords:', words.size);

  // Sentiment: attach AFINN scores, and add AFINN words WordNet lacks.
  const afinnMod = require('afinn-165');
  const afinn = afinnMod.afinn165 || afinnMod;
  let added = 0;
  for (const [w, score] of Object.entries(afinn)) {
    const key = String(w).toLowerCase().trim();
    if (!key) continue;
    let e = words.get(key);
    if (!e) {
      e = { p: [], s: 0 };
      words.set(key, e);
      added++;
    }
    e.s = score;
  }
  console.log('Sentiment-only words added:', added);

  // Trim runaway sense lists (some words have 40+ senses) to keep the file sane.
  const MAX_SENSES = 6;
  const out = {};
  let withDefs = 0;
  let positive = 0;
  let negative = 0;

  const sortedKeys = Array.from(words.keys()).sort();
  for (const w of sortedKeys) {
    const e = words.get(w);
    const senses = e.p.slice(0, MAX_SENSES);
    if (senses.length) withDefs++;
    if (e.s > 0) positive++;
    else if (e.s < 0) negative++;
    // Compact shape to keep the JSON small: { d: [[pos,def],...], s: score }
    out[w] = {
      d: senses.map((x) => [x.pos, x.def]),
      s: e.s || 0,
    };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'dictionary.json');
  const meta = {
    source: 'WordNet 3.1 (Princeton University) + AFINN-165',
    license: 'WordNet licence (permissive, see NOTICE) / AFINN ODbL',
    generated: new Date().toISOString().slice(0, 10),
    words: sortedKeys.length,
    withDefinitions: withDefs,
    positive,
    negative,
    sensesPerWordCap: MAX_SENSES,
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  fs.writeFileSync(path.join(OUT_DIR, 'dictionary-meta.json'), JSON.stringify(meta, null, 2));

  const size = fs.statSync(outPath).size;
  console.log('--- BUILT ---');
  console.log(JSON.stringify(meta, null, 2));
  console.log('file:', outPath);
  console.log('size:', (size / 1048576).toFixed(1), 'MB');
}

main();
