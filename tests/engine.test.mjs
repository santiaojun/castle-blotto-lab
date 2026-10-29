import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../site/js/engine.js';

test('toIntTotal always sums to the total', () => {
  for (const w of [[1, 1, 1], [0.2, 0.3, 0.5, 0.7, 0.1], [0, 0, 0, 0, 0], [3, 7, 11, 15, 19]]) {
    assert.equal(E.toIntTotal(w).reduce((a, b) => a + b, 0), 100);
  }
});

test('isValidAlloc and parseAllocLines', () => {
  assert.ok(E.isValidAlloc([3, 12, 22, 28, 35]));
  assert.ok(!E.isValidAlloc([3, 12, 22, 28, 36]));
  assert.ok(!E.isValidAlloc([-1, 13, 22, 28, 38]));
  const r = E.parseAllocLines('3,12,22,28,35\n1 1 35 0 63\n20/20/20/20/20\n1,2,3');
  assert.equal(r.ok.length, 3);
  assert.deepEqual(r.bad, [4]);
});

test('duel scores castles and splits ties', () => {
  assert.deepEqual(E.duel([3, 12, 22, 28, 35], [10, 15, 20, 25, 30]), [12, 3]);
  assert.deepEqual(E.duel([20, 20, 20, 20, 20], [20, 20, 20, 20, 20]), [7.5, 7.5]);
});

test('groupResult ranks players and splits tied places', () => {
  const r = E.groupResult([[0, 0, 0, 50, 50], [20, 20, 20, 20, 20], [20, 20, 20, 20, 20], [0, 0, 100, 0, 0]]);
  assert.equal(r.pts[0], 9);
  assert.equal(r.places[0].rank, 1);
  assert.equal(r.places[0].pay, 9);
  // players 1 and 2 tie on castles 1 and 2 (3 points shared -> 1.5 each)
  assert.equal(r.places[1].pay, r.places[2].pay);
});

test('groupPayFlat matches groupResult', () => {
  const rng = E.mulberry32(1);
  for (let k = 0; k < 200; k++) {
    const ps = [0, 1, 2, 3].map(() => E.randomAlloc(rng));
    const F = Uint8Array.from(ps.slice(1).flat());
    const pay = E.groupPayFlat(ps[0], 0, F, 0, 5, 10);
    assert.ok(Math.abs(pay - E.groupResult(ps).places[0].pay) < 1e-9);
  }
});

test('g1BestResponse is at least as good as any candidate on the field', () => {
  const rng = E.mulberry32(42);
  const { F } = E.makeField({ n: 500, noise: 6, rng, humanShare: 0.8 });
  const H = E.histogram(F, 500);
  const best = E.g1BestResponse(H);
  assert.ok(E.isValidAlloc(best));
  for (const c of [[3, 12, 22, 28, 35], [20, 20, 20, 20, 20], [7, 13, 20, 27, 33], [0, 0, 30, 30, 40]]) {
    assert.ok(E.g1Expected(best, H) >= E.g1Expected(c, H) - 1e-9);
  }
});

test('g1Expected equals the brute-force average of duels', () => {
  const rng = E.mulberry32(7);
  const { F } = E.makeField({ n: 300, noise: 6, rng });
  const H = E.histogram(F, 300), a = [5, 10, 25, 25, 35];
  let s = 0;
  for (let i = 0; i < 300; i++) s += E.duel(a, Array.from(F.subarray(i * 5, i * 5 + 5)))[0];
  assert.ok(Math.abs(s / 300 - E.g1Expected(a, H)) < 1e-9);
});

test('parseCSV handles quotes, commas and newlines', () => {
  const rows = E.parseCSV('a,b\n"x, y","he said ""hi"""\n"multi\nline",2\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', '2']]);
});

test('parseRiddler keeps valid rows only (synthetic fixture)', () => {
  const r = E.parseRiddler(readFileSync(new URL('./fixtures/sample-riddler.csv', import.meta.url), 'utf8'));
  assert.equal(r.castles, 10);
  assert.equal(r.allocs.length, 3);
  assert.equal(r.invalid, 1);
});

test('mapToFive pairs 10 castles and keeps 100 soldiers', () => {
  assert.deepEqual(E.mapToFive([1, 2, 3, 4, 5, 6, 7, 8, 9, 55]), [3, 7, 11, 15, 64]);
  const m13 = E.mapToFive([7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 10, 10]);
  assert.equal(m13.reduce((a, b) => a + b, 0), 100);
});

test('opponent model: humanShare 0 is all random, 1 is all human-like', () => {
  const rng = E.mulberry32(3);
  const pool = [[0, 0, 0, 50, 50]];
  const human = E.makeOpponentModel({ humanShare: 1, variation: 0, pools: { riddler: pool } });
  for (let i = 0; i < 50; i++) assert.deepEqual(E.agentFrom(human, rng), [0, 0, 0, 50, 50]);
  const rand = E.makeOpponentModel({ humanShare: 0, variation: 0, pools: { riddler: pool } });
  let same = 0;
  for (let i = 0; i < 200; i++) if (E.agentFrom(rand, rng).join() === '0,0,0,50,50') same++;
  assert.ok(same < 5);
  const synth = E.makeOpponentModel({ humanShare: 1, variation: 0, pools: {} });
  assert.equal(synth.humanLabel, 'synthetic archetypes');
});

test('robustnessSweep scores every candidate in every scenario', () => {
  const it = E.robustnessSweep({ humans: [100], gensList: [0, 1], seeds: [1], n: 200, candidates: [[20, 20, 20, 20, 20]], testGroups: 500, annealIters: 100 });
  let st = it.next();
  while (!st.done) st = it.next();
  const { scenarios, rows } = st.value;
  assert.equal(scenarios.length, 2);
  assert.ok(rows.some((r) => r.yours));
  for (const r of rows) {
    assert.ok(r.g1.meanRegret >= 0 && r.g2.meanRegret >= -1e-9);
    assert.ok(r.g1.meanRank >= 1);
  }
  // the scenario-optimal Game 1 allocation has zero regret in its own scenario, so some row has small mean regret
  assert.ok(Math.min(...rows.map((r) => r.g1.meanRegret)) < 1);
});
