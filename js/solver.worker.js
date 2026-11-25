// Web Worker: คำนวณตารางแยกจากหน้าเว็บ หน้าจอจึงไม่ค้างระหว่างประมวลผล และยกเลิกได้ทันที
import { solve, baselineFirstFit } from './solver-core.js';

self.onmessage = (e) => {
  const { model, opts } = e.data;
  try {
    const result = solve(model, opts, (m) => self.postMessage(m));
    const baseline = baselineFirstFit(model).placements;
    self.postMessage({ type: 'done', result, baseline });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
