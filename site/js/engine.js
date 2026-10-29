// Castle Blotto engine: 5 castles worth 1..5 points, 100 soldiers.
// Shared by the web pages (site/), the CLI tools (cli/), the data script (scripts/) and the tests.

export const VALUES = [1, 2, 3, 4, 5];
export const PAYOUT = [9, 4, 2, 0]; // Game 2: points for 1st..4th place
export const SOLDIERS = 100;
export const EPS = 1e-9;

// ---------- random helpers ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rng, n) => Math.floor(rng() * n);

// Round non-negative weights to integers that sum to `total` (largest remainder method).
export function toIntTotal(weights, total = SOLDIERS) {
  const k = weights.length;
  const s = weights.reduce((a, b) => a + b, 0);
  const w = s > 0 ? weights : Array(k).fill(1);
  const sum = s > 0 ? s : k;
  const raw = w.map((x) => (x * total) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw
    .map((x, i) => [x - out[i], i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => {
      if (left > 0) { out[i]++; left--; }
    });
  return out;
}

export function isValidAlloc(a, castles = VALUES.length, total = SOLDIERS) {
  return (
    Array.isArray(a) &&
    a.length === castles &&
    a.every((x) => Number.isInteger(x) && x >= 0) &&
    a.reduce((s, x) => s + x, 0) === total
  );
}

// "3,12,22,28,35" per line (commas, spaces, slashes or Chinese commas). Returns valid rows and bad line numbers.
export function parseAllocLines(text) {
  const ok = [], bad = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const nums = t.split(/[,，\s\/]+/).filter(Boolean).map(Number);
    if (isValidAlloc(nums)) ok.push(nums); else bad.push(i + 1);
  });
  return { ok, bad };
}

// Move up to k single soldiers between random castles.
export function jitter(a, k, rng) {
  const b = a.slice();
  for (let t = 0; t < k; t++) {
    const i = randInt(rng, b.length), j = randInt(rng, b.length);
    if (i !== j && b[i] > 0) { b[i]--; b[j]++; }
  }
  return b;
}
export function randomAlloc(rng) {
  return toIntTotal(VALUES.map(() => -Math.log(1 - rng())));
}
// Random, but biased toward high-value castles (Gamma(value) weights).
export function weightedRandomAlloc(rng) {
  return toIntTotal(VALUES.map((v) => { let g = 0; for (let k = 0; k < v; k++) g -= Math.log(1 - rng()); return g; }));
}

// ---------- opponent model ----------
// Each opponent is drawn independently ("mixture by player", not by averaging allocations):
//   with probability humanShare -> a human-like allocation, otherwise a uniformly random one.
// Human-like allocations come from real Riddler submissions (mapped to 5 castles) and/or
// synthetic archetypes, then move up to `variation` single soldiers.
// Averaging a human allocation with a random one would erase real features such as empty castles,
// so we never blend allocations.
export const ARCHETYPES = [
  { key: 'prop', label: 'Proportional to value (~7/13/20/27/33)', weight: 3, bases: [[7, 13, 20, 27, 33]] },
  { key: 'even', label: 'Even split (20 each)', weight: 2, bases: [[20, 20, 20, 20, 20]] },
  { key: 'round', label: 'Round numbers (10/15/20/25/30)', weight: 3, bases: [[10, 15, 20, 25, 30]] },
  { key: 'top3', label: 'Concentrate on the top three castles', weight: 2, bases: [[0, 0, 30, 30, 40], [0, 0, 33, 33, 34], [0, 0, 25, 35, 40]] },
  { key: 'top2', label: 'All-in on two castles', weight: 1, bases: [[0, 0, 0, 50, 50], [0, 0, 0, 45, 55], [0, 0, 40, 0, 60]] },
  { key: 'lvl1', label: 'Just beat the common splits', weight: 2, bases: [[3, 12, 22, 28, 35], [2, 11, 21, 30, 36], [0, 14, 22, 28, 36]] },
  { key: 'custom', label: 'Your custom guesses', weight: 0, bases: [] },
];

// source: 'auto' (Riddler if available, else synthetic), 'riddler', 'synthetic', 'both' (half and half)
export function makeOpponentModel({ humanShare = 1, variation = 6, source = 'auto', weights, pools = {} } = {}) {
  const riddler = pools.riddler || [];
  const list = ARCHETYPES.map((a) => ({ ...a, bases: a.key === 'custom' ? pools.custom || [] : a.bases }));
  const ws = list.map((a) => (a.bases.length ? Math.max(0, weights?.[a.key] ?? a.weight) : 0));
  let tot = ws.reduce((x, y) => x + y, 0);
  if (tot === 0) { ws[0] = 1; tot = 1; }
  const hasR = riddler.length > 0;
  const useR = hasR && source !== 'synthetic';
  const useS = source === 'synthetic' || source === 'both' || !useR;
  return { humanShare: Math.min(1, Math.max(0, humanShare)), variation, riddler, list, ws, tot, useR, useS,
    humanLabel: useR && useS ? 'real Riddler data + synthetic archetypes' : useR ? 'real Riddler data' : 'synthetic archetypes' };
}
export function agentFrom(m, rng) {
  if (rng() >= m.humanShare) return randomAlloc(rng);
  let base;
  if (m.useR && (!m.useS || rng() < 0.5)) base = m.riddler[randInt(rng, m.riddler.length)];
  else {
    let r = rng() * m.tot, k = 0;
    while (r >= m.ws[k]) { r -= m.ws[k]; k++; }
    const b = m.list[k].bases; base = b[randInt(rng, b.length)];
  }
  return jitter(base, randInt(rng, m.variation + 1), rng);
}
// Backward compatible: `noise` is an alias for `variation`.
export function makeField({ n, rng, noise, ...opts }) {
  const model = makeOpponentModel({ variation: noise ?? 6, ...opts });
  const F = new Uint8Array(n * 5);
  for (let i = 0; i < n; i++) {
    const a = agentFrom(model, rng);
    for (let c = 0; c < 5; c++) F[i * 5 + c] = a[c];
  }
  return { F, info: model };
}

// ---------- Game 1: head to head ----------
export function duel(a, b) {
  let m = 0, o = 0;
  for (let c = 0; c < 5; c++) {
    if (a[c] > b[c]) m += VALUES[c];
    else if (a[c] < b[c]) o += VALUES[c];
    else { m += VALUES[c] / 2; o += VALUES[c] / 2; }
  }
  return [m, o];
}

// Per-castle histograms of a field: h[c*101+x] = how many opponents send x soldiers to castle c.
export function histogram(F, n) {
  const h = new Float64Array(5 * 101), less = new Float64Array(5 * 102);
  for (let i = 0; i < n; i++) for (let c = 0; c < 5; c++) h[c * 101 + F[i * 5 + c]]++;
  for (let c = 0; c < 5; c++) {
    let s = 0;
    for (let x = 0; x <= 100; x++) { less[c * 102 + x] = s; s += h[c * 101 + x]; }
    less[c * 102 + 101] = s;
  }
  return { h, less, n };
}
// Expected points from castle c when sending x soldiers against the whole field.
export function castleValue(H, c, x) {
  return (VALUES[c] * (H.less[c * 102 + x] + 0.5 * H.h[c * 101 + x])) / H.n;
}
// Game 1 score is separable by castle, so the field average is exact.
export function g1Expected(a, H) {
  let s = 0;
  for (let c = 0; c < 5; c++) s += castleValue(H, c, a[c]);
  return s;
}
export function g1WinRate(a, F, n) {
  let w = 0;
  const b = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 5; c++) b[c] = F[i * 5 + c];
    const [m, o] = duel(a, b);
    if (m > o + EPS) w++; else if (Math.abs(m - o) < EPS) w += 0.5;
  }
  return w / n;
}
// Exact best response to a field via dynamic programming over (castle, soldiers used).
export function g1BestResponse(H) {
  const NEG = -1e18, best = new Float64Array(6 * 101).fill(NEG), pick = new Int16Array(6 * 101);
  best[0] = 0;
  for (let c = 0; c < 5; c++) {
    for (let s = 0; s <= 100; s++) {
      const b = best[c * 101 + s];
      if (b === NEG) continue;
      for (let x = 0; x + s <= 100; x++) {
        const v = b + castleValue(H, c, x), idx = (c + 1) * 101 + s + x;
        if (v > best[idx] + 1e-12) { best[idx] = v; pick[idx] = x; }
      }
    }
  }
  const a = [0, 0, 0, 0, 0];
  let s = 100;
  for (let c = 5; c >= 1; c--) { const x = pick[c * 101 + s]; a[c - 1] = x; s -= x; }
  return a;
}

// ---------- Game 2: four-way battle ----------
// players: array of allocations. Returns castle points, castle winners and each player's placing.
export function groupResult(players) {
  const pts = players.map(() => 0), winners = [];
  for (let c = 0; c < 5; c++) {
    const m = Math.max(...players.map((p) => p[c]));
    const w = [];
    players.forEach((p, i) => { if (p[c] === m) w.push(i); });
    winners.push(w);
    w.forEach((i) => { pts[i] += VALUES[c] / w.length; });
  }
  const places = pts.map((p) => {
    let better = 0, eq = 0;
    pts.forEach((q) => { if (q > p + EPS) better++; else if (q > p - EPS) eq++; });
    let sum = 0;
    for (let r = better; r < better + eq; r++) sum += PAYOUT[r] ?? 0;
    return { rank: better + 1, tie: eq > 1, pay: sum / eq, first: better === 0 ? 1 / eq : 0 };
  });
  return { pts, winners, places };
}

// Fast path: player X (at offset xo in array X) vs three opponents stored at offsets in F.
// Returns the placement payoff; out[0] receives the share of first place.
export const out = new Float64Array(1);
export function groupPayFlat(X, xo, F, oj, ok, ol) {
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
  for (let c = 0; c < 5; c++) {
    const a = X[xo + c], b = F[oj + c], d = F[ok + c], e = F[ol + c];
    let m = a; if (b > m) m = b; if (d > m) m = d; if (e > m) m = e;
    const cnt = (a === m) + (b === m) + (d === m) + (e === m), s = VALUES[c] / cnt;
    if (a === m) p0 += s; if (b === m) p1 += s; if (d === m) p2 += s; if (e === m) p3 += s;
  }
  let better = 0, eq = 1;
  if (p1 > p0 + EPS) better++; else if (p1 > p0 - EPS) eq++;
  if (p2 > p0 + EPS) better++; else if (p2 > p0 - EPS) eq++;
  if (p3 > p0 + EPS) better++; else if (p3 > p0 - EPS) eq++;
  let sum = 0;
  for (let r = better; r < better + eq; r++) sum += PAYOUT[r];
  out[0] = better === 0 ? 1 / eq : 0;
  return sum / eq;
}
export function sampleTriples(count, n, rng) {
  const t = new Int32Array(count * 3);
  for (let i = 0; i < t.length; i++) t[i] = randInt(rng, n) * 5;
  return t;
}
export function g2Evaluate(a, F, T) {
  let s = 0, f = 0;
  const k = T.length / 3;
  for (let i = 0; i < k; i++) { s += groupPayFlat(a, 0, F, T[i * 3], T[i * 3 + 1], T[i * 3 + 2]); f += out[0]; }
  return { pay: s / k, first: f / k };
}

// ---------- evolution: opponents imitate the best and mutate ----------
export function evolveGeneration(F, n, mode, info, rng) {
  const fit = new Float64Array(n);
  if (mode === 1) {
    const H = histogram(F, n);
    for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < 5; c++) s += castleValue(H, c, F[i * 5 + c]); fit[i] = s; }
  } else {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < 16; k++) s += groupPayFlat(F, i * 5, F, randInt(rng, n) * 5, randInt(rng, n) * 5, randInt(rng, n) * 5);
      fit[i] = s / 16;
    }
  }
  const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => fit[b] - fit[a]);
  const top = Math.max(1, Math.floor(n * 0.3)), bot = Math.floor(n * 0.2);
  for (let r = 0; r < bot; r++) {
    const dst = ord[n - 1 - r];
    let a;
    if (rng() < 0.1) a = agentFrom(info, rng);
    else {
      const src = ord[randInt(rng, top)];
      a = Array.from(F.subarray(src * 5, src * 5 + 5));
      a = jitter(a, 1 + randInt(rng, 4), rng);
    }
    for (let c = 0; c < 5; c++) F[dst * 5 + c] = a[c];
  }
}

// ---------- Game 2 search: simulated annealing + local polish ----------
// Generator: yields progress in [0,1], returns the best allocation found on the training sample.
export function* g2Anneal(F, n, starts, rng, { train = 2500, iters = 2400 } = {}) {
  const T = sampleTriples(train, n, rng);
  let cur = null, curV = -1;
  for (const s of starts) { const v = g2Evaluate(s, F, T).pay; if (v > curV) { curV = v; cur = s.slice(); } }
  let best = cur.slice(), bestV = curV;
  const T0 = 0.35, T1 = 0.002;
  for (let it = 0; it < iters; it++) {
    const temp = T0 * Math.pow(T1 / T0, it / iters), step = Math.max(1, Math.round(10 * (1 - it / iters)));
    const i = randInt(rng, 5), j = randInt(rng, 5);
    if (i === j) continue;
    const d = Math.min(cur[i], 1 + randInt(rng, step));
    if (d === 0) continue;
    const nx = cur.slice(); nx[i] -= d; nx[j] += d;
    const v = g2Evaluate(nx, F, T).pay;
    if (v >= curV || rng() < Math.exp((v - curV) / temp)) {
      cur = nx; curV = v;
      if (v > bestV) { best = nx.slice(); bestV = v; }
    }
    if (it % 60 === 0) yield (0.85 * it) / iters;
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < 5 && !improved; i++) for (let j = 0; j < 5 && !improved; j++) {
      if (i === j) continue;
      for (const d of [1, 2, 3]) {
        if (best[i] < d) continue;
        const nx = best.slice(); nx[i] -= d; nx[j] += d;
        const v = g2Evaluate(nx, F, T).pay;
        if (v > bestV + 1e-9) { best = nx; bestV = v; improved = true; break; }
      }
    }
    yield 0.95;
  }
  return best;
}

// ---------- FiveThirtyEight Riddler castles data ----------
// Minimal RFC 4180 CSV parser (handles quoted fields with commas, quotes and newlines).
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Reads the castle columns ("Castle 1".."Castle k") of a Riddler submissions file.
// Keeps only rows with non-negative integers summing to 100.
export function parseRiddler(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { castles: 0, allocs: [], invalid: 0 };
  const header = rows[0].map((h) => h.trim());
  const cols = header
    .map((h, i) => { const m = /^castle[\s_]*(\d+)$/i.exec(h); return m ? { i, k: +m[1] } : null; })
    .filter(Boolean)
    .sort((a, b) => a.k - b.k);
  const allocs = [];
  let invalid = 0;
  for (const r of rows.slice(1)) {
    const a = cols.map(({ i }) => Number(String(r[i] ?? '').trim()));
    if (isValidAlloc(a, cols.length)) allocs.push(a); else invalid++;
  }
  return { castles: cols.length, allocs, invalid };
}

// Map a k-castle allocation (castles worth 1..k) onto 5 castles by value rank:
// castle i covers the slice [(i-1)/k, i/k] of the value order, split across 5 equal bins.
// For k = 10 this is exactly pairing 1+2, 3+4, ..., 9+10.
export function mapToFive(a) {
  const k = a.length, bins = [0, 0, 0, 0, 0];
  for (let i = 0; i < k; i++) {
    const lo = i / k, hi = (i + 1) / k;
    for (let b = 0; b < 5; b++) {
      const overlap = Math.max(0, Math.min(hi, (b + 1) / 5) - Math.max(lo, b / 5));
      if (overlap > 0) bins[b] += (a[i] * overlap * k);
    }
  }
  const total = a.reduce((x, y) => x + y, 0);
  return toIntTotal(bins, total);
}

export function datasetStats(allocs) {
  const n = allocs.length || 1, k = allocs[0]?.length ?? 5;
  const avg = Array(k).fill(0), zero = Array(k).fill(0);
  let round = 0, cells = 0;
  for (const a of allocs) a.forEach((x, c) => {
    avg[c] += x / n;
    if (x === 0) zero[c] += 1 / n;
    if (x % 5 === 0) round++;
    cells++;
  });
  return { n: allocs.length, avg, zero, roundShare: cells ? round / cells : 0 };
}

// ---------- robustness check ----------
// Runs every combination of human share x adaptation x seed. In each scenario it finds the Game 1 and
// Game 2 optima, then scores every candidate (yours + every scenario's optima) in every scenario.
// "Regret" = best score among candidates in that scenario minus this candidate's score (0 = best there).
// Generator: yields progress in [0,1]; returns { scenarios, rows }.
export function* robustnessSweep({
  humans = [50, 70, 100], gensList = [0, 3, 10], seeds = [1, 2, 3], n = 1000, variation = 4,
  source = 'auto', weights, pools = {}, candidates = [], includeOptima = true,
  testGroups = 10000, annealIters = 1200,
} = {}) {
  const scen = [];
  for (const h of humans) for (const g of gensList) for (const s of seeds) scen.push({ human: h, gens: g, seed: s });
  const cand = new Map();
  const add = (a, tag) => {
    const k = a.join(',');
    if (!cand.has(k)) cand.set(k, { a: a.slice(), yours: false, g1opt: 0, g2opt: 0 });
    const c = cand.get(k);
    if (tag === 'yours') c.yours = true; else c[tag]++;
  };
  candidates.forEach((a) => add(a, 'yours'));
  const runs = [];
  for (let i = 0; i < scen.length; i++) {
    const sc = scen[i], rng = mulberry32(sc.seed * 1000003 + sc.human * 101 + sc.gens);
    const { F, info } = makeField({ n, rng, humanShare: sc.human / 100, variation, source, weights, pools });
    const F1 = F.slice(), F2 = F.slice();
    for (let g = 0; g < sc.gens; g++) { evolveGeneration(F1, n, 1, info, rng); evolveGeneration(F2, n, 2, info, rng); }
    const H1 = histogram(F1, n), b1 = g1BestResponse(H1);
    const it = g2Anneal(F2, n, [b1, ...candidates], rng, { iters: annealIters });
    let st = it.next();
    while (!st.done) { yield (0.85 * (i + st.value)) / scen.length; st = it.next(); }
    const b2 = st.value;
    if (includeOptima) { add(b1, 'g1opt'); add(b2, 'g2opt'); }
    runs.push({ sc, H1, F2, T: sampleTriples(testGroups, n, rng) });
    yield (0.85 * (i + 1)) / scen.length;
  }
  const list = [...cand.values()];
  list.forEach((c) => { c.s1 = []; c.s2 = []; c.f2 = []; });
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];
    list.forEach((c) => { c.s1.push(g1Expected(c.a, run.H1)); const e = g2Evaluate(c.a, run.F2, run.T); c.s2.push(e.pay); c.f2.push(e.first); });
    yield 0.85 + (0.15 * (r + 1)) / runs.length;
  }
  const summarize = (key) => {
    const S = runs.length, best = [], ranks = list.map(() => []);
    for (let r = 0; r < S; r++) {
      const col = list.map((c) => c[key][r]);
      best.push(Math.max(...col));
      col.forEach((v, j) => { ranks[j].push(1 + col.filter((w) => w > v + 1e-9).length); });
    }
    return list.map((c, j) => {
      const s = c[key], reg = s.map((v, r) => best[r] - v);
      return {
        mean: s.reduce((x, y) => x + y, 0) / S, worst: Math.min(...s),
        meanRegret: reg.reduce((x, y) => x + y, 0) / S, maxRegret: Math.max(...reg),
        meanRank: ranks[j].reduce((x, y) => x + y, 0) / S, top3: ranks[j].filter((x) => x <= 3).length / S,
      };
    });
  };
  const g1 = summarize('s1'), g2 = summarize('s2');
  return {
    scenarios: scen,
    rows: list.map((c, j) => ({
      a: c.a, yours: c.yours, g1opt: c.g1opt, g2opt: c.g2opt,
      g1: g1[j], g2: { ...g2[j], meanFirst: c.f2.reduce((x, y) => x + y, 0) / runs.length },
    })),
  };
}
