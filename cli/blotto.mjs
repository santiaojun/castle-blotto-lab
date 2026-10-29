#!/usr/bin/env node
// Round-robin tournament for the 5-castle game, in the spirit of jes/blotto.
// Input (stdin): one army per line, "name a b c d e" (5 castles, 100 soldiers).
// Output: Game 1 table (every pair plays once) and, with --four N, a Game 2 estimate
// from N random four-player groups drawn from the entrants.
//   node cli/genteam.mjs 8 | node cli/blotto.mjs --four 20000
import { readFileSync } from 'node:fs';
import { isValidAlloc, duel, groupResult, mulberry32, randInt, EPS } from '../site/js/engine.js';

const args = process.argv.slice(2);
const fourIdx = args.indexOf('--four');
const groups = fourIdx > -1 ? Number(args[fourIdx + 1]) || 20000 : 0;

const armies = [];
readFileSync(0, 'utf8').split(/\r?\n/).forEach((line, i) => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const [name, ...rest] = t.split(/\s+/);
  const a = rest.map(Number);
  if (!isValidAlloc(a)) { console.error(`line ${i + 1}: "${t}" ignored (need 5 non-negative integers summing to 100)`); return; }
  armies.push({ name, a, w: 0, d: 0, l: 0, pts: 0, games: 0, pay: 0, first: 0, g2: 0 });
});
if (armies.length < 2) { console.error('Need at least 2 valid armies.'); process.exit(1); }

for (let i = 0; i < armies.length; i++) for (let j = i + 1; j < armies.length; j++) {
  const A = armies[i], B = armies[j], [m, o] = duel(A.a, B.a);
  A.pts += m; B.pts += o; A.games++; B.games++;
  if (m > o + EPS) { A.w++; B.l++; } else if (o > m + EPS) { B.w++; A.l++; } else { A.d++; B.d++; }
}

if (groups && armies.length >= 4) {
  const rng = mulberry32(2026);
  for (let g = 0; g < groups; g++) {
    const idx = [];
    while (idx.length < 4) { const k = randInt(rng, armies.length); if (!idx.includes(k)) idx.push(k); }
    const r = groupResult(idx.map((k) => armies[k].a));
    idx.forEach((k, p) => { armies[k].pay += r.places[p].pay; armies[k].first += r.places[p].first; armies[k].g2++; });
  }
}

const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 2) => x.toFixed(d).padStart(7);
const width = Math.max(6, ...armies.map((a) => a.name.length)) + 2;
console.log('Game 1: round robin (avg castle points out of 15)');
console.log(pad('army', width) + pad('allocation', 20) + '   W   D   L  avg pts');
[...armies].sort((x, y) => y.pts / y.games - x.pts / x.games).forEach((a) =>
  console.log(pad(a.name, width) + pad(a.a.join('/'), 20) + String(a.w).padStart(4) + String(a.d).padStart(4) + String(a.l).padStart(4) + num(a.pts / a.games)));
if (groups && armies.length >= 4) {
  console.log(`\nGame 2: ${groups} random groups of 4 (placement points 9/4/2/0)`);
  console.log(pad('army', width) + pad('allocation', 20) + ' avg pay  P(1st)');
  [...armies].sort((x, y) => y.pay / y.g2 - x.pay / x.g2).forEach((a) =>
    console.log(pad(a.name, width) + pad(a.a.join('/'), 20) + num(a.g2 ? a.pay / a.g2 : 0) + num(a.g2 ? (100 * a.first) / a.g2 : 0, 1) + '%'));
} else if (groups) console.log('\nGame 2 needs at least 4 armies.');
