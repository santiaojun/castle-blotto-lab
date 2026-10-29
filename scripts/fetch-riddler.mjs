#!/usr/bin/env node
// Downloads FiveThirtyEight's Riddler castles submissions and writes site/data/riddler.json.
// Usage:
//   node scripts/fetch-riddler.mjs              # download from GitHub
//   node scripts/fetch-riddler.mjs --from DIR   # use CSV files you already downloaded into DIR
// Never fails the build: if nothing can be loaded, it writes nothing and the site falls back to CSV upload.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRiddler, mapToFive, datasetStats } from '../site/js/engine.js';

const BASE = 'https://raw.githubusercontent.com/fivethirtyeight/data/master/riddler-castles/';
const ROUNDS = [
  { file: 'castle-solutions.csv', title: 'Can You Rule Riddler Nation? (2017)' },
  { file: 'castle-solutions-2.csv', title: 'The Battle For Riddler Nation, Round 2 (2017)' },
  { file: 'castle-solutions-3.csv', title: 'Are You The Best Warlord? (2019)' },
  { file: 'castle-solutions-4.csv', title: 'A Peaceful (But Not Peaceful) Transition Of Power (2020)' },
  { file: 'castle-solutions-5.csv', title: 'The Fifth Battle For Riddler Nation (13 castles)' },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fromIdx = process.argv.indexOf('--from');
const fromDir = fromIdx > -1 ? process.argv[fromIdx + 1] : null;

async function load(file) {
  if (fromDir) return readFile(join(fromDir, file), 'utf8');
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const rounds = [];
for (const r of ROUNDS) {
  try {
    const text = await load(r.file);
    const { castles, allocs, invalid } = parseRiddler(text);
    if (!castles || !allocs.length) { console.warn(`skip ${r.file}: no castle columns or no valid rows`); continue; }
    const allocs5 = allocs.map(mapToFive);
    rounds.push({
      file: r.file, title: r.title, castles, valid: allocs.length, invalid,
      statsOriginal: datasetStats(allocs), stats5: datasetStats(allocs5), allocs5,
    });
    console.log(`${r.file}: ${allocs.length} valid, ${invalid} invalid, ${castles} castles`);
  } catch (e) {
    console.warn(`skip ${r.file}: ${e.message}`);
  }
}

if (!rounds.length) {
  console.warn('No Riddler data loaded. The site will ask users to upload CSV files instead.');
  process.exit(0);
}
await mkdir(join(root, 'site/data'), { recursive: true });
const outFile = join(root, 'site/data/riddler.json');
await writeFile(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'https://github.com/fivethirtyeight/data/tree/master/riddler-castles',
  note: 'Mapped from k castles (worth 1..k) to 5 castles by value rank. For 10 castles: 1+2, 3+4, ..., 9+10.',
  rounds,
}));
console.log(`wrote ${outFile}`);
