// Builds public/dp-demo.json (the demo-mode sample of Distribution Planning) from a full dp_data.json:
//   node scripts/make-dp-demo.mjs <path to dp_data.json> [materials=140]
// Keeps every site, lane, fold and split rule (the engine's rules reference them by code) and the busiest N materials.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const DPE = require('../src/lib/dpEngine.js');
const [, , src, nArg] = process.argv;
if (!src) { console.error('usage: node scripts/make-dp-demo.mjs dp_data.json [materials]'); process.exit(1); }
const N = +nArg || 140;
const D = JSON.parse(fs.readFileSync(src, 'utf8'));
const score = new Array(D.mats.length).fill(0);
for (const t of ['stk', 'git', 'ship', 'sto', 'fc', 'afc', 'sale', 'trend', 'oo', 'prod']) for (const r of D[t]) score[r[0]] += 1;
for (const r of D.oo) score[r[0]] += 6;
const by = (div) => D.mats.map((m, i) => [i, score[i]]).filter(([i]) => D.mats[i].div === div).sort((a, b) => b[1] - a[1]);
const pick = new Set([...by('CCD').slice(0, Math.round(N * 0.6)), ...by('HCD').slice(0, Math.round(N * 0.4))].map(([i]) => i));
const keep = [...pick].sort((a, b) => a - b), map = new Map(keep.map((o, n) => [o, n]));
const out = { ...D, mats: keep.map((i) => D.mats[i]) };
for (const t of ['stk', 'lots', 'git', 'ship', 'sto', 'fc', 'afc', 'sale', 'rpp', 'prod', 'trend', 'oo']) out[t] = D[t].filter((r) => map.has(r[0])).map((r) => [map.get(r[0]), ...r.slice(1)]);
const keys = new Set(out.mats.map((m) => m.key));
out.split = D.split.filter((r) => keys.has(r[2]));
out.meta = { ...D.meta, source: 'demo sample', note: 'Demo sample trimmed from the 27 Nov 2026 console data: ' + out.mats.length + ' busiest materials, all depots.' };
const P = DPE.plan(out, {}, { uploads: [], arrived: [] });
fs.writeFileSync(new URL('../public/dp-demo.json', import.meta.url), JSON.stringify(out));
console.log('materials', out.mats.length, 'lines', P.lines.length, 'trucks', P.trucks.length, 'bytes', fs.statSync(new URL('../public/dp-demo.json', import.meta.url)).size);
