import { generateSample, generateErrorSample } from '../js/samples.js';
import { rowsToRecords, buildModel, SHEETS } from '../js/model.js';
import { solve, baselineFirstFit } from '../js/solver-core.js';
import { inspect } from '../js/checker.js';
const toRaw = (rows) => { const raw = {}; const iss=[]; for (const s of SHEETS) { const r = rowsToRecords(s.key, rows[s.key], s.title); raw[s.key]=r.records; iss.push(...r.issues);} return {raw, iss}; };
for (const size of (process.argv[2]||'small,medium,large').split(',')) {
  const { rows } = size==='error'? generateErrorSample() : generateSample(size);
  const { raw, iss } = toRaw(rows);
  const { issues, model, summary } = buildModel(raw, iss);
  console.log('==', size, JSON.stringify(summary));
  issues.slice(0,15).forEach(i=>console.log('  ', i.level, i.sheet, i.row??'', i.msg));
  if (size==='error') continue;
  const res = solve(model, { seed: 42, maxIter: +process.argv[3]||4000000 }, (m)=>{ if(m.type==='log') console.log('   log', m.msg); });
  const chk = inspect(model, res.placements);
  console.log('  time', res.elapsedMs, 'iter', res.iterations, 'hard', chk.hardTotal, 'soft', chk.softTotal, 'placed', chk.completeness.placed, '/', chk.completeness.required, 'gaps', chk.metrics.totalGaps, 'util', chk.metrics.avgRoomUtil.toFixed(2));
  chk.conditions.filter(c=>c.count).forEach(c=>console.log('   #'+c.no, c.type, c.count, c.details.slice(0,3).join(' | ')));
  const base = inspect(model, baselineFirstFit(model).placements);
  console.log('  baseline hard', base.hardTotal, 'soft', base.softTotal);
  console.log('  loads', chk.metrics.teacherStats.map(t=>t.hours).join(','));
}
