// แสดงตาราง (หน้าจอ/พิมพ์) และส่งออก Excel / CSV
import { DAYS, PERIODS, NP, ND, timeRange } from './core.js';
import { writeXlsx, toCsv, ST } from './xlsx.js';
import { flatRows } from './checker.js';
import { CONFIG } from './config.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const KINDS = {
  group: { label: 'กลุ่มเรียน', key: 'g', list: (m) => m.groups },
  teacher: { label: 'ครู', key: 't', list: (m) => m.teachers },
  room: { label: 'ห้องเรียน', key: 'r', list: (m) => m.rooms },
};

// สีพาสเทลประจำวิชา (คงที่ตามรหัสวิชา)
const PALETTE = ['#e3f0ef', '#e8eef8', '#f3ece0', '#eef3e2', '#f4e7ec', '#e9e6f4', '#e2f1f6', '#f6efdc', '#e6f2e8', '#f1e9e2', '#e5ebf0', '#efe8f2'];
const LINE = ['#2f6f73', '#3d5f99', '#9a6b25', '#5b7a2b', '#a0476a', '#5c4f99', '#2c7a92', '#8a6d12', '#3b7d4c', '#8a5a3c', '#4f6272', '#7a4f8a'];
export function subjectColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { bg: PALETTE[h % PALETTE.length], line: LINE[h % LINE.length] };
}

export function entityPlacements(placements, kind, idx) {
  const k = KINDS[kind].key;
  return placements.filter((p) => p[k] === idx && p.day >= 0);
}

export function entityTitle(model, kind, idx) {
  if (kind === 'group') {
    const g = model.groups[idx];
    const adv = g.advisor >= 0 ? model.teachers[g.advisor].name : '-';
    return { title: `ตารางเรียน กลุ่ม ${g.name}`, sub: [g.dept && `แผนก${g.dept}`, g.level, g.size ? `${g.size} คน` : '', `ครูที่ปรึกษา ${adv}`].filter(Boolean).join('  ·  ') };
  }
  if (kind === 'teacher') {
    const t = model.teachers[idx];
    return { title: `ตารางสอน ${t.name}`, sub: [t.position, t.dept && `แผนก${t.dept}`, `รหัส ${t.id}`].filter(Boolean).join('  ·  ') };
  }
  const r = model.rooms[idx];
  return { title: `ตารางการใช้ห้อง ${r.name}`, sub: [`ประเภท${r.type}`, r.cap ? `ความจุ ${r.cap} คน` : '', `รหัส ${r.id}`].filter(Boolean).join('  ·  ') };
}

function cellLines(model, p, kind) {
  const sj = model.subjects[p.s];
  const g = model.groups[p.g]?.name, t = model.teachers[p.t]?.name, r = model.rooms[p.r]?.name || '-';
  if (kind === 'group') return [sj.id, sj.name, t, r];
  if (kind === 'teacher') return [sj.id, sj.name, g, r];
  return [sj.id, sj.name, g, t];
}

/** HTML ตารางรายสัปดาห์ (วัน x คาบ) */
export function gridHtml(model, placements, kind, idx, opts = {}) {
  const list = entityPlacements(placements, kind, idx);
  const occ = Array.from({ length: ND * NP }, () => []);
  for (const p of list) for (let k = 0; k < p.len; k++) occ[p.day * NP + p.start + k].push(p);
  const q = (opts.search || '').trim().toLowerCase();
  const matches = (p) => !q || [model.subjects[p.s].id, model.subjects[p.s].name, model.teachers[p.t].name, model.groups[p.g].name, model.rooms[p.r]?.name].some((x) => String(x || '').toLowerCase().includes(q));
  const head = PERIODS.map((pr, i) => `${i === 4 ? '<th class="lunch-h" scope="col">พัก</th>' : ''}<th scope="col"><span class="pno">คาบ ${i + 1}</span><span class="ptime">${pr.label}</span></th>`).join('');
  let body = '';
  for (let d = 0; d < ND; d++) {
    let row = `<th scope="row" class="day d${d}">${DAYS[d]}</th>`;
    let p = 0;
    while (p < NP) {
      if (p === 4) row += d === 0 ? `<td class="lunch" rowspan="${ND}"><span>พักกลางวัน 12.00-13.00</span></td>` : '';
      let cell = occ[d * NP + p];
      if (!cell.length) { row += '<td class="empty"></td>'; p++; continue; }
      // ห้องที่ใช้ร่วมกันได้ (เช่น สนาม): รวมวิชาเดียวกันเป็นช่องเดียว
      if (kind === 'room' && model.rooms[idx]?.multi && cell.length > 1) {
        const bySubj = new Map();
        cell.forEach((pl) => { if (!bySubj.has(pl.s)) bySubj.set(pl.s, { ...pl, _n: 0 }); bySubj.get(pl.s)._n++; });
        cell = [...bySubj.values()];
        for (let k = 0; k < cell[0].len; k++) { const c = occ[d * NP + p + k]; if (c && c.length && c.every((x) => x.s === cell[0].s)) occ[d * NP + p + k] = cell; }
      }
      const first = cell[0];
      let span = 1;
      if (cell.length === 1 && first.start === p) {
        span = first.len;
        for (let k = 1; k < first.len; k++) { const c = occ[d * NP + p + k]; if (c.length !== 1 || c[0] !== first) { span = k; break; } }
      }
      const conflict = cell.length > 1;
      const inner = cell.map((pl) => {
        let [code, name, l3, l4] = cellLines(model, pl, kind);
        if (pl._n > 1) { l3 = `${pl._n} กลุ่มเรียน (ใช้ห้องร่วมกัน)`; l4 = ''; }
        const col = subjectColor(model.subjects[pl.s].id);
        const dim = q && !matches(pl) ? ' dim' : '';
        const hit = q && matches(pl) ? ' hit' : '';
        return `<div class="slot${dim}${hit}" style="--sbg:${col.bg};--sln:${col.line}" title="${esc(`${name} | ${l3} | ${l4} | ${DAYS[pl.day]} ${timeRange(pl.start, pl.len)}`)}"><span class="s-code">${esc(code)}</span><span class="s-name">${esc(name)}</span><span class="s-meta">${esc(l3)}</span><span class="s-meta">${esc(l4)}</span></div>`;
      }).join('');
      row += `<td class="busy${conflict ? ' conflict' : ''}" colspan="${span}">${inner}</td>`;
      p += span;
    }
    body += `<tr>${row}</tr>`;
  }
  return `<table class="tt-grid"><thead><tr><th class="corner" scope="col">วัน / เวลา</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** รายการวิชาสรุปใต้ตาราง */
export function entitySummary(model, placements, kind, idx) {
  const list = entityPlacements(placements, kind, idx);
  const byA = new Map();
  for (const p of list) {
    if (!byA.has(p.a)) byA.set(p.a, { p, periods: 0, rooms: new Set(), times: [] });
    const x = byA.get(p.a); x.periods += p.len; if (model.rooms[p.r]) x.rooms.add(model.rooms[p.r].name); x.times.push(`${DAYS[p.day].slice(0, 2)} ${timeRange(p.start, p.len)}`);
  }
  const rows = [...byA.values()].sort((a, b) => model.subjects[a.p.s].id.localeCompare(model.subjects[b.p.s].id) || model.groups[a.p.g].name.localeCompare(model.groups[b.p.g].name, 'th')).map((x) => {
    const sj = model.subjects[x.p.s];
    return { code: sj.id, name: sj.name, tpn: `${sj.t}-${sj.p}-${sj.n}`, periods: x.periods, teacher: model.teachers[x.p.t].name, group: model.groups[x.p.g].name, rooms: [...x.rooms].join(', '), times: x.times.join(', ') };
  });
  return { rows, total: rows.reduce((s, r) => s + r.periods, 0) };
}

export function summaryTableHtml(model, placements, kind, idx) {
  const { rows, total } = entitySummary(model, placements, kind, idx);
  const third = kind === 'teacher' ? 'กลุ่มเรียน' : 'ครูผู้สอน';
  const fourth = kind === 'room' ? 'กลุ่มเรียน' : 'ห้องเรียน';
  return `<table class="sum-table"><thead><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>ท-ป-น</th><th>คาบ/สัปดาห์</th><th>${third}</th><th>${fourth}</th><th>วัน-เวลา</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td class="c">${r.tpn}</td><td class="c">${r.periods}</td><td>${esc(kind === 'teacher' ? r.group : r.teacher)}</td><td>${esc(kind === 'room' ? r.group : r.rooms)}</td><td>${esc(r.times)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">รวม</td><td class="c">${total}</td><td colspan="3"></td></tr></tfoot></table>`;
}

// ===== ส่งออก Excel =====
const colOfP = (p) => (p < 4 ? p + 1 : p + 2);

function gridBlock(model, placements, kind, idx, startRow) {
  const rows = [], merges = [], heights = {};
  const { title, sub } = entityTitle(model, kind, idx);
  rows.push([{ v: `${title}   (${sub})`, s: ST.bold }]);
  const hdr = [{ v: 'วัน / เวลา', s: ST.head }];
  PERIODS.forEach((pr, i) => { if (i === 4) hdr.push({ v: 'พัก', s: ST.head }); hdr.push({ v: `คาบ ${i + 1}\n${pr.label}`, s: ST.head }); });
  rows.push(hdr);
  heights[startRow + 1] = 34;
  const list = entityPlacements(placements, kind, idx);
  for (let d = 0; d < ND; d++) {
    const r = new Array(10).fill(null).map(() => ({ v: '', s: ST.center }));
    r[0] = { v: DAYS[d], s: ST.head };
    r[5] = { v: d === 0 ? 'พักกลางวัน' : '', s: ST.lunch };
    for (const p of list.filter((x) => x.day === d)) {
      const c = colOfP(p.start);
      const text = cellLines(model, p, kind).join('\n');
      r[c] = { v: r[c].v ? r[c].v + '\n---\n' + text : text, s: ST.subject };
      for (let k = 1; k < p.len; k++) r[colOfP(p.start + k)] = { v: '', s: ST.subject };
      if (p.len > 1) merges.push(`${String.fromCharCode(65 + c)}${startRow + rows.length + 1}:${String.fromCharCode(65 + colOfP(p.start + p.len - 1))}${startRow + rows.length + 1}`);
    }
    heights[startRow + rows.length] = 62;
    rows.push(r);
  }
  merges.push(`F${startRow + 3}:F${startRow + 7}`);
  merges.push(`A${startRow + 1}:J${startRow + 1}`);
  const { rows: srows, total } = entitySummary(model, placements, kind, idx);
  rows.push([{ v: `รวม ${total} คาบ/สัปดาห์  ·  ${srows.length} รายวิชา`, s: ST.normal }]);
  rows.push([]);
  return { rows, merges, heights };
}

function stacked(model, placements, kind, name) {
  const all = [], merges = [], heights = {};
  KINDS[kind].list(model).forEach((_, idx) => {
    if (kind !== 'group' && !entityPlacements(placements, kind, idx).length) return;
    const b = gridBlock(model, placements, kind, idx, all.length);
    all.push(...b.rows); merges.push(...b.merges); Object.assign(heights, b.heights);
  });
  return { name, rows: all, merges, heights, cols: [12, 20, 20, 20, 20, 6, 20, 20, 20, 20], landscape: true };
}

export async function exportExcel(ctx) {
  const { model, placements, inspection: ins, meta } = ctx;
  const S = [];
  const sum = [
    [{ v: `ผลการจัดตารางสอน ${CONFIG.SCHOOL_NAME}`, s: ST.title }],
    [CONFIG.TERM_TEXT],
    [`ชุดข้อมูล: ${meta.datasetName || '-'}`],
    [`วันที่จัด: ${new Date(meta.createdAt || Date.now()).toLocaleString('th-TH')}`],
    [`Seed: ${meta.seed}   จำนวนรอบค้นหา: ${meta.iterations?.toLocaleString?.() || '-'}   เวลาประมวลผล: ${(meta.elapsedMs / 1000).toFixed(2)} วินาที`],
    [`ลงตารางครบ ${ins.completeness.placed}/${ins.completeness.required} คาบ   ข้อขัดแย้งบังคับ ${ins.hardTotal} จุด   การละเมิดเงื่อนไขยืดหยุ่น ${ins.softTotal} จุด`],
    [`ครูสอนชน ${ins.clashes.teacher} จุด   ห้องชน ${ins.clashes.room} จุด   กลุ่มเรียนชน ${ins.clashes.group} จุด   อัตราใช้ห้องเฉลี่ย ${(ins.metrics.avgRoomUtil * 100).toFixed(1)}%   เวลาว่างคั่นรวม ${ins.metrics.totalGaps} คาบ`],
    [],
    ['ข้อ', 'เงื่อนไข', 'ประเภท', 'ละเมิด', 'จำนวนครั้ง'].map((v) => ({ v, s: ST.head })),
    ...ins.conditions.map((c) => [{ v: c.no, s: ST.num }, { v: c.text, s: ST.cell }, { v: c.type === 'hard' ? 'บังคับ' : 'ยืดหยุ่น', s: ST.center }, { v: c.count ? 'ใช่' : 'ไม่', s: ST.center }, { v: c.count, s: ST.num }]),
  ];
  S.push({ name: 'สรุปผล', rows: sum, cols: [8, 90, 12, 10, 12], landscape: true });
  S.push(stacked(model, placements, 'group', 'ตารางกลุ่มเรียน'));
  S.push(stacked(model, placements, 'teacher', 'ตารางครู'));
  S.push(stacked(model, placements, 'room', 'ตารางห้องเรียน'));
  const fr = flatRows(model, placements);
  S.push({ name: 'รายการทั้งหมด', freeze: 1, landscape: true, cols: [10, 14, 12, 14, 36, 26, 14, 22, 14], rows: [
    ['วัน', 'เวลา', 'กลุ่มเรียน', 'รหัสวิชา', 'ชื่อวิชา', 'ครูผู้สอน', 'ตำแหน่ง', 'ห้องเรียน', 'ประเภทห้อง'].map((v) => ({ v, s: ST.head })),
    ...fr.map((r) => [r.dayName, r.time, r.group, r.subjectId, r.subject, r.teacher, r.position, r.room, r.roomType].map((v) => ({ v, s: ST.cell }))),
  ] });
  S.push({ name: 'ภาระสอนครู', freeze: 1, landscape: true, cols: [26, 14, 20, 10, 12, 12, 12, 10, 10, 14], rows: [
    ['ครู', 'ตำแหน่ง', 'แผนก', 'ชม./สัปดาห์', 'เกณฑ์', 'สถานะ', 'วันที่สอน', 'วิชา', 'กลุ่ม', 'เวลาว่างคั่น'].map((v) => ({ v, s: ST.head })),
    ...ins.metrics.teacherStats.map((t) => [{ v: t.name, s: ST.cell }, { v: t.position, s: ST.cell }, { v: t.dept, s: ST.cell }, { v: t.hours, s: ST.num }, { v: t.max ? `${t.min}-${t.max}` : `≥ ${t.min}`, s: ST.center }, { v: t.status === 'ok' ? 'ผ่าน' : t.status === 'under' ? 'ต่ำกว่าเกณฑ์' : 'เกินเกณฑ์', s: ST.center }, { v: `${t.days}/5`, s: ST.center }, { v: t.subjects, s: ST.num }, { v: t.groups, s: ST.num }, { v: t.gaps, s: ST.num }]),
  ] });
  S.push({ name: 'การใช้ห้อง', freeze: 1, cols: [12, 26, 14, 14, 14], rows: [
    ['รหัสห้อง', 'ชื่อห้อง', 'ประเภท', 'คาบที่ใช้', 'อัตราการใช้ (%)'].map((v) => ({ v, s: ST.head })),
    ...ins.metrics.roomUse.map((r) => [{ v: r.id, s: ST.cell }, { v: r.name, s: ST.cell }, { v: r.type, s: ST.cell }, { v: r.used, s: ST.num }, { v: Math.round(r.pct * 1000) / 10, s: ST.num }]),
  ] });
  S.push({ name: 'สรุปกลุ่มเรียน', freeze: 1, cols: [14, 14, 14, 14, 14, 14], rows: [
    ['กลุ่มเรียน', 'คาบเรียน', 'ต้องเรียน', 'คาบว่าง', 'เวลาว่างคั่น', 'วันที่เรียน'].map((v) => ({ v, s: ST.head })),
    ...ins.metrics.groupStats.map((g) => [{ v: g.name, s: ST.cell }, { v: g.hours, s: ST.num }, { v: g.required, s: ST.num }, { v: g.free, s: ST.num }, { v: g.gaps, s: ST.num }, { v: g.daysUsed, s: ST.num }]),
  ] });
  const data = await writeXlsx(S, 'blob');
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportCsv(ctx) {
  const fr = flatRows(ctx.model, ctx.placements);
  return new Blob([toCsv([['วัน', 'เวลา', 'กลุ่มเรียน', 'รหัสวิชา', 'ชื่อวิชา', 'ครูผู้สอน', 'ตำแหน่ง', 'ห้องเรียน', 'ประเภทห้อง'], ...fr.map((r) => [r.dayName, r.time, r.group, r.subjectId, r.subject, r.teacher, r.position, r.room, r.roomType])])], { type: 'text/csv;charset=utf-8' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
