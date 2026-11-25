import { generateSample } from '../js/samples.js';
import { rowsToRecords, buildModel, SHEETS } from '../js/model.js';
import { solve } from '../js/solver-core.js';
const { rows } = generateSample('medium'); const raw={}; for (const s of SHEETS) raw[s.key]=rowsToRecords(s.key, rows[s.key]).records;
const { model } = buildModel(raw);
const a = solve(model,{seed:7,maxIter:1500000}), b = solve(model,{seed:7,maxIter:1500000}), c = solve(model,{seed:8,maxIter:1500000});
const key = r => JSON.stringify(r.placements);
console.log('same seed identical:', key(a)===key(b), '| diff seed identical:', key(a)===key(c), '| build hard', a.buildHard, 'iters', a.iterations, b.iterations);
