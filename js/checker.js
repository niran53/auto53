// Inspector: ตรวจผลตารางแบบอิสระจากตัวจัดตาราง ตามเงื่อนไข 18 ข้อ และคำนวณตัวชี้วัด
import { NS, NP, ND, DAYS, PERIODS, timeRange } from './core.js';
import { BAL_TOL } from './solver-core.js';

export const CONDITIONS = [
  { no: 1, text: 'ครูตำแหน่งหัวหน้า ต้องมีชั่วโมงสอน 18 – 24 ชั่วโมงต่อสัปดาห์', type: 'hard' },
  { no: 2, text: 'ครูทุกคนต้องสอนอย่างน้อย 18 ชั่วโมง', type: 'hard' },
  { no: 3, text: 'นักเรียนแต่ละกลุ่มห้ามเรียนมากกว่า 1 วิชาในช่วงเวลาเดียวกัน', type: 'hard' },
  { no: 4, text: 'ครูแต่ละคนห้ามสอนมากกว่า 1 วิชาในช่วงเวลาเดียวกัน', type: 'hard' },
  { no: 5, text: 'ครูแต่ละคนห้ามสอนมากกว่า 1 กลุ่มเรียนในช่วงเวลาเดียวกัน', type: 'hard' },
  { no: 6, text: 'ห้องเรียนแต่ละห้อง ห้ามมีการใช้งานมากกว่า 1 วิชาในช่วงเวลาเดียวกัน', type: 'hard' },
  { no: 7, text: 'วิชาที่มีเวลาบังคับ (เช่น ลูกเสือ วันพุธ 15.00 – 17.00 น. ที่สนาม) ต้องเรียนตามเวลาและสถานที่ที่กำหนด', type: 'hard' },
  { no: 8, text: 'คาบเรียนเริ่มเวลา 08.00 น. ของทุกวัน', type: 'hard' },
  { no: 9, text: 'นักเรียนไม่เรียนเกิน 17.00 น.', type: 'hard' },
  { no: 10, text: 'ต้องพักเที่ยงพร้อมกันเวลา 12.00 - 13.00 น. ของทุกวัน', type: 'hard' },
  { no: 11, text: 'ถ้าเป็นไปได้ ในรายวิชาเรียนแต่ละวิชา ไม่ควรฉีกคาบเรียนออกจากกัน (คาบในวันเดียวกันต้องต่อเนื่อง)', type: 'soft' },
  { no: 12, text: 'ถ้าเป็นไปได้ ในรายวิชาเรียนแต่ละวิชา ไม่ควรฉีกคาบเรียนออกจากกัน (เรียนจบในวันเดียว ไม่แยกหลายวัน)', type: 'soft' },
  { no: 13, text: 'ครูแผนกคอมพิวเตอร์ทุกคนต้องมีชั่วโมงสอนทุกวัน', type: 'hard' },
  { no: 14, text: 'ถ้าเป็นไปได้ ครูที่ระบุเวลาไม่สะดวก (เช่น ครูเมธา วันจันทร์ 08.00-12.00 น. และวันศุกร์ 13.00-16.00 น.) ควรได้เวลาว่างตามที่ขอ', type: 'soft' },
  { no: 15, text: 'ถ้าเป็นไปได้ ครูประจำ ควรเฉลี่ยจำนวนชั่วโมงสอนให้ใกล้เคียงกัน (ต่างจากค่าเฉลี่ยไม่เกิน ±2 ชม.)', type: 'soft' },
  { no: 16, text: 'ถ้าเป็นไปได้ ในการเรียนแต่ละวิชา ควรเป็นผู้สอนคนเดียวกัน', type: 'soft' },
  { no: 17, text: 'วิชาที่เป็นคอมพิวเตอร์ (หรือกำหนดประเภทห้อง) ต้องเรียนในห้องเรียนประเภทนั้นเท่านั้น และห้องต้องจุนักเรียนได้', type: 'hard' },
  { no: 18, text: 'วิชาลูกเสือ (วิชาที่กำหนด "ครูที่ปรึกษาเท่านั้น") ครูผู้สอนต้องเป็นครูที่ปรึกษาของห้องนั้นเท่านั้น', type: 'hard' },
];

const nrm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();

export function inspect(model, placements) {
  const { teachers, rooms, groups, subjects, assignments } = model;
  const T = teachers.length, G = groups.length, R = rooms.length;
  const res = Object.fromEntries(CONDITIONS.map((c) => [c.no, { ...c, count: 0, details: [] }]));
  const push = (no, n, msg) => { res[no].count += n; if (res[no].details.length < 200) res[no].details.push(msg); };
  const who = (p) => `${groups[p.g]?.name} ${subjects[p.s]?.name}`;
  const when = (d, pi) => `${DAYS[d]} ${PERIODS[pi].label}`;

  // ตารางรายช่อง
  const tCell = Array.from({ length: T * NS }, () => []);
  const gCell = Array.from({ length: G * NS }, () => []);
  const rCell = Array.from({ length: R * NS }, () => []);
  let unplaced = 0, placedPeriods = 0;
  for (const p of placements) {
    if (p.day < 0 || p.start < 0) { unplaced += p.len; continue; }
    for (let k = 0; k < p.len; k++) {
      const pi = p.start + k;
      if (pi >= NP) { push(9, 1, `${who(p)} เลยเวลา 17.00 น.`); continue; }
      const s = p.day * NP + pi;
      tCell[p.t * NS + s].push(p); gCell[p.g * NS + s].push(p);
      if (p.r >= 0) rCell[p.r * NS + s].push(p);
      placedPeriods++;
    }
    if (p.start < 4 && p.start + p.len > 4) push(10, 1, `${who(p)} คาบเรียนคร่อมพักเที่ยง (${DAYS[p.day]})`);
  }
  const required = assignments.reduce((s, a) => s + a.periods, 0);

  // 3,4,5 และ 6
  for (let g = 0; g < G; g++) for (let s = 0; s < NS; s++) {
    const c = gCell[g * NS + s];
    if (c.length > 1) push(3, c.length - 1, `${groups[g].name} ${when(Math.floor(s / NP), s % NP)}: ${c.map((p) => subjects[p.s].name).join(' / ')}`);
  }
  for (let t = 0; t < T; t++) for (let s = 0; s < NS; s++) {
    const c = tCell[t * NS + s];
    if (c.length < 2) continue;
    const subj = new Set(c.map((p) => p.s)), grp = new Set(c.map((p) => p.g));
    if (subj.size > 1) push(4, subj.size - 1, `${teachers[t].name} ${when(Math.floor(s / NP), s % NP)}: ${[...subj].map((x) => subjects[x].name).join(' / ')}`);
    if (grp.size > 1) push(5, grp.size - 1, `${teachers[t].name} ${when(Math.floor(s / NP), s % NP)}: ${[...grp].map((x) => groups[x].name).join(' / ')}`);
  }
  for (let r = 0; r < R; r++) for (let s = 0; s < NS; s++) {
    const c = rCell[r * NS + s];
    if (c.length < 2) continue;
    const n = rooms[r].multi ? new Set(c.map((p) => p.s)).size - 1 : c.length - 1;
    if (n > 0) push(6, n, `${rooms[r].name} ${when(Math.floor(s / NP), s % NP)}: ${c.map((p) => `${groups[p.g].name}-${subjects[p.s].name}`).join(' / ')}`);
  }

  // ภาระครู
  const hours = new Array(T).fill(0), days = Array.from({ length: T }, () => new Set());
  const tSubj = Array.from({ length: T }, () => new Set()), tGrp = Array.from({ length: T }, () => new Set());
  for (const p of placements) {
    if (p.day < 0) continue;
    hours[p.t] += p.len; days[p.t].add(p.day); tSubj[p.t].add(p.s); tGrp[p.t].add(p.g);
  }
  teachers.forEach((t, i) => {
    if (t.isHead && (hours[i] < 18 || hours[i] > 24)) push(1, 1, `${t.name} (หัวหน้า) สอน ${hours[i]} ชม.`);
    if (hours[i] < Math.max(18, t.min)) push(2, 1, `${t.name} สอน ${hours[i]} ชม. (ต้องไม่น้อยกว่า ${Math.max(18, t.min)})`);
    else if (!t.isHead && t.maxSet && hours[i] > t.max) push(2, 1, `${t.name} สอน ${hours[i]} ชม. เกินสูงสุด ${t.max}`);
    if (t.daily) for (let d = 0; d < ND; d++) if (!days[i].has(d)) push(13, 1, `${t.name} ไม่มีคาบสอนวัน${DAYS[d]}`);
  });

  // 7, 17, 18
  for (const p of placements) {
    const sj = subjects[p.s], room = rooms[p.r];
    if (sj.fixed && (p.day !== sj.fixed.day || p.start !== sj.fixed.start || p.len !== sj.fixed.len)) push(7, 1, `${who(p)} ไม่อยู่ในเวลาบังคับ ${sj.fixedText}`);
    if (sj.fixed && room && nrm(room.type) !== nrm(sj.roomType)) push(7, 1, `${who(p)} ไม่ได้เรียนที่${sj.roomType}`);
    if (!room) push(17, 1, `${who(p)} ไม่มีห้องเรียน`);
    else {
      if (sj.room >= 0 && p.r !== sj.room) push(17, 1, `${who(p)} ต้องเรียนห้อง ${rooms[sj.room].name} แต่ได้ ${room.name}`);
      else if (!sj.fixed && nrm(room.type) !== nrm(sj.roomType)) push(17, 1, `${who(p)} ต้องใช้ห้อง${sj.roomType} แต่ได้ ${room.name} (${room.type})`);
      const size = groups[p.g].size;
      if (!room.multi && room.cap && size && size > room.cap) push(17, 1, `${who(p)} ${size} คน เกินความจุ ${room.name} (${room.cap})`);
    }
    if (sj.advisorOnly && groups[p.g].advisor !== p.t) push(18, 1, `${who(p)} สอนโดย ${teachers[p.t].name} ไม่ใช่ครูที่ปรึกษา`);
  }

  // 11, 12, 16
  const byAsg = new Map();
  placements.forEach((p) => { if (!byAsg.has(p.a)) byAsg.set(p.a, []); byAsg.get(p.a).push(p); });
  for (const [ai, list] of byAsg) {
    const a = assignments[ai];
    const ts = new Set(list.map((p) => p.t));
    if (ts.size > 1) push(16, ts.size - 1, `${groups[a.g].name} ${subjects[a.s].name} มีผู้สอน ${ts.size} คน`);
    const perDay = {};
    list.forEach((p) => { if (p.day >= 0) for (let k = 0; k < p.len; k++) (perDay[p.day] ||= []).push(p.start + k); });
    const dayKeys = Object.keys(perDay);
    if (dayKeys.length > 1) push(12, dayKeys.length - 1, `${groups[a.g].name} ${subjects[a.s].name} เรียน ${dayKeys.length} วัน (${dayKeys.map((d) => DAYS[d]).join(', ')})`);
    for (const d of dayKeys) {
      const ps = [...new Set(perDay[d])].sort((x, y) => x - y);
      for (let i = 1; i < ps.length; i++) if (ps[i] !== ps[i - 1] + 1) { push(11, 1, `${groups[a.g].name} ${subjects[a.s].name} วัน${DAYS[d]} คาบไม่ต่อเนื่อง`); break; }
    }
  }

  // 14 เวลาไม่สะดวก
  let unavHard = 0;
  teachers.forEach((t, i) => {
    for (const s of t.unav) {
      const c = tCell[i * NS + s];
      if (c.length) {
        if (t.unavHard) { unavHard++; push(14, 1, `[บังคับ] ${t.name} มีคาบสอน ${when(Math.floor(s / NP), s % NP)} ซึ่งระบุว่าไม่สะดวก`); }
        else push(14, 1, `${t.name} มีคาบสอน ${when(Math.floor(s / NP), s % NP)} ซึ่งขอเวลาว่าง`);
      }
    }
  });

  // 15 ความใกล้เคียงของครูประจำ
  const regs = teachers.map((t, i) => (t.isRegular ? i : -1)).filter((i) => i >= 0);
  let regMean = 0;
  if (regs.length) {
    regMean = regs.reduce((s, i) => s + hours[i], 0) / regs.length;
    for (const i of regs) if (Math.abs(hours[i] - regMean) > BAL_TOL) push(15, 1, `${teachers[i].name} สอน ${hours[i]} ชม. (ค่าเฉลี่ยครูประจำ ${regMean.toFixed(1)})`);
  }

  // 8 9 10 ตรวจโครงสร้างคาบ
  res[8].details.push('โครงสร้างคาบเริ่ม 08.00 น. ทุกวัน (คาบแรก ' + PERIODS[0].label + ')');
  if (!res[9].count) res[9].details.push('คาบสุดท้ายสิ้นสุด 17.00 น.');
  if (!res[10].count) res[10].details.push('ไม่มีคาบเรียนช่วง 12.00-13.00 น.');

  const conditions = CONDITIONS.map((c) => res[c.no]);
  const hardTotal = conditions.filter((c) => c.type === 'hard').reduce((s, c) => s + c.count, 0) + unavHard;
  const softTotal = conditions.filter((c) => c.type === 'soft').reduce((s, c) => s + c.count, 0) - unavHard;

  // ===== ตัวชี้วัด =====
  const roomUse = rooms.map((r, i) => {
    let used = 0;
    for (let s = 0; s < NS; s++) if (rCell[i * NS + s].length) used++;
    return { i, id: r.id, name: r.name, type: r.type, used, pct: used / NS };
  });
  const realRooms = roomUse.filter((r) => !rooms[r.i].multi);
  const avgRoomUtil = realRooms.length ? realRooms.reduce((s, r) => s + r.pct, 0) / realRooms.length : 0;

  const groupStats = groups.map((g, gi) => {
    let hrs = 0, gaps = 0, daysUsed = 0, maxDay = 0;
    for (let d = 0; d < ND; d++) {
      let first = -1, last = -1, n = 0;
      for (let p = 0; p < NP; p++) if (gCell[gi * NS + d * NP + p].length) { if (first < 0) first = p; last = p; n++; }
      hrs += n; if (n) daysUsed++; maxDay = Math.max(maxDay, n);
      if (first >= 0) gaps += (last - first + 1) - n;
    }
    const req = assignments.filter((a) => a.g === gi).reduce((s, a) => s + a.periods, 0);
    return { i: gi, name: g.name, hours: hrs, required: req, free: NS - hrs, gaps, daysUsed, maxDay };
  });
  const totalGaps = groupStats.reduce((s, g) => s + g.gaps, 0);

  const teacherStats = teachers.map((t, i) => {
    let gaps = 0;
    for (let d = 0; d < ND; d++) {
      let first = -1, last = -1, n = 0;
      for (let p = 0; p < NP; p++) if (tCell[i * NS + d * NP + p].length) { if (first < 0) first = p; last = p; n++; }
      if (first >= 0) gaps += (last - first + 1) - n;
    }
    const min = Math.max(18, t.min), max = t.isHead ? 24 : (t.maxSet ? t.max : null);
    const status = hours[i] < min ? 'under' : max != null && hours[i] > max ? 'over' : 'ok';
    return { i, name: t.name, position: t.position, dept: t.dept, hours: hours[i], min, max, status, days: days[i].size, subjects: tSubj[i].size, groups: tGrp[i].size, gaps };
  });

  return {
    conditions, hardTotal, softTotal, unavHard,
    clashes: { teacher: res[4].count + res[5].count, room: res[6].count, group: res[3].count },
    completeness: { required, placed: placedPeriods, unplaced, tables: { groups: G, teachers: teachers.filter((_, i) => hours[i] > 0).length, rooms: roomUse.filter((r) => r.used).length } },
    metrics: { roomUse, avgRoomUtil, groupStats, totalGaps, teacherStats, regMean },
  };
}

// รายการคาบทั้งหมด (สำหรับตารางรายการ/ส่งออก)
export function flatRows(model, placements) {
  const { teachers, rooms, groups, subjects } = model;
  const rows = placements.map((p) => ({
    day: p.day, start: p.start, len: p.len,
    dayName: DAYS[p.day], time: timeRange(p.start, p.len),
    group: groups[p.g].name, groupId: groups[p.g].id,
    subjectId: subjects[p.s].id, subject: subjects[p.s].name,
    teacher: teachers[p.t].name, teacherId: teachers[p.t].id, position: teachers[p.t].position,
    room: rooms[p.r]?.name || '-', roomId: rooms[p.r]?.id || '', roomType: rooms[p.r]?.type || '',
    g: p.g, t: p.t, r: p.r, s: p.s,
  }));
  rows.sort((a, b) => a.day - b.day || a.start - b.start || a.group.localeCompare(b.group, 'th'));
  return rows;
}
