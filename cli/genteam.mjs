#!/usr/bin/env node
// Random armies for cli/blotto.mjs, in the spirit of jes/blotto's genteam.
//   node cli/genteam.mjs [count=1] [seed]
import { randomAlloc, mulberry32 } from '../site/js/engine.js';
const count = Number(process.argv[2]) || 1;
const rng = process.argv[3] ? mulberry32(Number(process.argv[3])) : Math.random;
for (let i = 1; i <= count; i++) console.log(`team${i} ${randomAlloc(rng).join(' ')}`);
