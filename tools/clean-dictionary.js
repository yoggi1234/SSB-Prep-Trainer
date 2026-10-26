/*
 * Removes entries from data/dictionary.json that are no use for word practice:
 * fragments ("'hood", single letters), "a/an/the ..." phrases, names of three or
 * more words, people, places and plant/animal families (WordNet's proper and
 * taxonomic nouns), and words with no meaning at all. Every word the WAT sets,
 * hints and action verbs use is kept regardless.
 *
 * Run: node tools/clean-dictionary.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA, 'dictionary.json');
const dry = process.argv.includes('--dry');

const dict = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// Words the app's own practice material uses never go.
const keep = new Set();
const addWords = (s) => String(s || '').toLowerCase().split(/[^a-z'-]+/).forEach((w) => { if (w) keep.add(w); });
const wat = JSON.parse(fs.readFileSync(path.join(DATA, 'wat.json'), 'utf8'));
(wat.sets || []).forEach((s) => (s.items || []).forEach(addWords));
fs.readdirSync(path.join(DATA, 'wat-hints')).filter((f) => /\.json$/.test(f) && f !== 'index.json').forEach((f) => {
  Object.keys(JSON.parse(fs.readFileSync(path.join(DATA, 'wat-hints', f), 'utf8'))).forEach(addWords);
});
const conn = JSON.parse(fs.readFileSync(path.join(DATA, 'connectors.json'), 'utf8'));
(conn.groups || []).forEach((g) => (g.words || []).forEach(addWords));

// A meaning that only names something: a plant or animal group, a person with
// life years, or a foreign town, river or region. Countries stay, and so does
// anything in India or its neighbourhood (useful for SSB current affairs).
const TAXON = /^((a |the )?(type )?genus\b|family of|(a |an )?(family|order|class|subclass|suborder|phylum|subfamily|tribe|superfamily) of)/i;
const PLACE = /^(a |an |the )?(city|town|port|river|region|province|county|village|mountain|lake|island|desert|capital|resort|seaport) (in|of|on|at|near|that)\b|^(a |the )?state (in|on)\b/i;
const NEAR_INDIA = /india|pakistan|china|chinese|nepal|bangladesh|sri lanka|bhutan|myanmar|burma|tibet|himalaya|afghanistan|maldives/i;
const PERSON = /\(\d{3,4}\s*-\s*\d{2,4}\)|\(born \d{3,4}\)|\((circa|c\.) ?\d{3,4}/i;

function nameOnly(def) {
  if (PERSON.test(def)) return 'a person';
  if (TAXON.test(def)) return 'a plant/animal group';
  if (PLACE.test(def) && !NEAR_INDIA.test(def)) return 'a foreign place';
  return '';
}

const reasons = {};
const drop = (w, why) => { reasons[why] = (reasons[why] || 0) + 1; return true; };

function junk(w, e) {
  if (keep.has(w)) return false;
  if (!/^[a-z][a-z' -]*$/.test(w)) return drop(w, 'not a plain word');
  if (w.length < 2) return drop(w, 'single letter');
  if (/^(a|an|the) /.test(w)) return drop(w, 'a/an/the phrase');
  if (/^(genus|family|order|class|subfamily|suborder|phylum) /.test(w)) return drop(w, 'a plant/animal group');
  if (w.split(/[ -]/).length >= 3) return drop(w, 'three or more words');
  const defs = (e && e.d) || [];
  // A bare inflection ("accepts") with no meaning still feeds the positive and negative lists.
  if (!defs.length) return e && e.s ? false : drop(w, 'no meaning and no sentiment');
  // Only when every meaning just names something: "nice" is also an adjective.
  const kinds = defs.map((d) => nameOnly(String(d[1] || '')));
  if (kinds.every(Boolean)) return drop(w, kinds[0]);
  return false;
}

const out = {};
let kept = 0;
for (const w of Object.keys(dict)) {
  if (junk(w, dict[w])) continue;
  out[w] = dict[w];
  kept++;
}
const removed = Object.keys(dict).length - kept;
console.log(JSON.stringify({ before: Object.keys(dict).length, after: kept, removed, reasons }, null, 1));
if (!dry) fs.writeFileSync(FILE, JSON.stringify(out));
