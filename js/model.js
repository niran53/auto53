// โครงสร้างข้อมูลนำเข้า การจับคู่หัวคอลัมน์ และการตรวจความถูกต้องก่อนคำนวณ
import {
  NS, NP, ND, DAYS_SHORT, parseTimeSpec, splitBlocks, startsFor, yes,
  isHeadPos, isRegularPos, isComputerDept, slotsToText,
} from './core.js';

// ===== นิยามชีตและคอลัมน์ (แม่แบบ) =====
export const SHEETS = [
  {
    key: 'teachers', title: 'ครู', keywords: ['ครู', 'teacher'],
    cols: [
      { key: 'id', label: 'รหัสครู', req: true, alias: ['teacher_id', 'รหัส'], ex: 'T01', help: 'รหัสไม่ซ้ำกัน' },
      { key: 'name', label: 'ชื่อ-สกุล', req: true, alias: ['ชื่อครู', 'ชื่อ', 'name', 'teacher_name'], ex: 'ครูเมธา ใจดี' },
      { key: 'dept', label: 'แผนก', alias: ['แผนกวิชา', 'department'], ex: 'คอมพิวเตอร์ธุรกิจ' },
      { key: 'position', label: 'ตำแหน่ง', alias: ['position'], ex: 'ครูประจำ', help: 'หัวหน้าแผนก / ครูประจำ / ครูพิเศษ' },
      { key: 'min', label: 'ชม.ขั้นต่ำ', alias: ['ชั่วโมงขั้นต่ำ', 'min_hours'], ex: '18', help: 'ว่าง = 18' },
      { key: 'max', label: 'ชม.สูงสุด', alias: ['ชั่วโมงสูงสุด', 'max_hours'], ex: '', help: 'ว่าง = หัวหน้า 24 / อื่น ๆ ไม่จำกัด' },
      { key: 'daily', label: 'สอนทุกวัน', alias: ['must_teach_daily'], ex: '', help: 'ใช่/ไม่ ว่าง = ใช่ถ้าเป็นแผนกคอมพิวเตอร์' },
      { key: 'unav', label: 'เวลาไม่สะดวก', alias: ['unavailable'], ex: 'จ 08.00-12.00; ศ 13.00-16.00' },
      { key: 'unavType', label: 'ประเภทเวลาไม่สะดวก', alias: ['unavailable_type'], ex: 'ถ้าเป็นไปได้', help: 'ถ้าเป็นไปได้ / บังคับ' },
    ],
  },
  {
    key: 'rooms', title: 'ห้องเรียน', keywords: ['ห้อง', 'room'],
    cols: [
      { key: 'id', label: 'รหัสห้อง', req: true, alias: ['room_id'], ex: 'COM1' },
      { key: 'name', label: 'ชื่อห้อง', req: true, alias: ['room_name'], ex: 'ห้องคอมพิวเตอร์ 1' },
      { key: 'type', label: 'ประเภทห้อง', req: true, alias: ['room_type'], ex: 'คอมพิวเตอร์', help: 'ทฤษฎี / คอมพิวเตอร์ / สนาม / ฯลฯ' },
      { key: 'cap', label: 'ความจุ', alias: ['capacity'], ex: '40' },
      { key: 'multi', label: 'ใช้พร้อมกันหลายกลุ่ม', alias: ['shared'], ex: 'ไม่', help: 'ใช่ = เช่น สนาม ใช้เรียนลูกเสือพร้อมกันได้' },
    ],
  },
  {
    key: 'groups', title: 'กลุ่มเรียน', keywords: ['กลุ่ม', 'group', 'class'],
    cols: [
      { key: 'id', label: 'รหัสกลุ่ม', req: true, alias: ['group_id'], ex: 'G11' },
      { key: 'name', label: 'ชื่อกลุ่ม', req: true, alias: ['กลุ่มเรียน', 'group_name'], ex: 'ปวช.1/1' },
      { key: 'level', label: 'ระดับชั้น', alias: ['level'], ex: 'ปวช.1' },
      { key: 'dept', label: 'แผนก', alias: ['department'], ex: 'คอมพิวเตอร์ธุรกิจ' },
      { key: 'size', label: 'จำนวนนักเรียน', alias: ['students'], ex: '35' },
      { key: 'advisor', label: 'รหัสครูที่ปรึกษา', alias: ['ครูที่ปรึกษา', 'advisor_id'], ex: 'T01' },
    ],
  },
  {
    key: 'subjects', title: 'รายวิชา', keywords: ['วิชา', 'subject', 'course'],
    cols: [
      { key: 'id', label: 'รหัสวิชา', req: true, alias: ['subject_id'], ex: '20204-2103' },
      { key: 'name', label: 'ชื่อวิชา', req: true, alias: ['subject_name'], ex: 'การเขียนโปรแกรมเบื้องต้น' },
      { key: 't', label: 'ท', alias: ['ทฤษฎี', 'theory'], ex: '1' },
      { key: 'p', label: 'ป', alias: ['ปฏิบัติ', 'practice'], ex: '3' },
      { key: 'n', label: 'น', alias: ['หน่วยกิต', 'credit'], ex: '2' },
      { key: 'periods', label: 'คาบต่อสัปดาห์', alias: ['periods'], ex: '4', help: 'ว่าง = ท + ป' },
      { key: 'roomType', label: 'ประเภทห้อง', alias: ['room_type'], ex: 'คอมพิวเตอร์', help: 'ว่าง = ทฤษฎี' },
      { key: 'room', label: 'ห้องเฉพาะ', alias: ['fixed_room'], ex: '', help: 'รหัสห้องที่ต้องใช้ (ถ้ามี)' },
      { key: 'fixed', label: 'เวลาบังคับ', alias: ['fixed_time'], ex: '', help: 'เช่น พ 15.00-17.00' },
      { key: 'advisorOnly', label: 'ครูที่ปรึกษาเท่านั้น', alias: ['advisor_only'], ex: 'ไม่', help: 'ใช่ = ผู้สอนต้องเป็นครูที่ปรึกษาของกลุ่ม' },
    ],
  },
  {
    key: 'assignments', title: 'การลงทะเบียน', keywords: ['ลงทะเบียน', 'ภาระสอน', 'แผนการเรียน', 'assignment', 'enroll'],
    cols: [
      { key: 'group', label: 'รหัสกลุ่ม', req: true, alias: ['group_id'], ex: 'G11' },
      { key: 'subject', label: 'รหัสวิชา', req: true, alias: ['subject_id'], ex: '20204-2103' },
      { key: 'teachers', label: 'รหัสครูผู้สอน', alias: ['ครูผู้สอน', 'teacher_ids', 'teacher_id'], ex: 'T01', help: 'หลายคนคั่นด้วย , ระบบเลือกให้ 1 คน' },
      { key: 'periods', label: 'คาบต่อสัปดาห์', alias: ['periods'], ex: '', help: 'ว่าง = ตามรายวิชา' },
    ],
  },
];
export const SHEET_BY_KEY = Object.fromEntries(SHEETS.map((s) => [s.key, s]));

const norm = (s) => String(s ?? '').replace(/\s+/g, '').replace(/[()（）]/g, '').toLowerCase();

function colIndexMap(sheet, header) {
  const map = {};
  header.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const c of sheet.cols) {
      if (map[c.key] !== undefined) continue;
      if ([c.label, ...c.alias].some((a) => norm(a) === n)) { map[c.key] = i; break; }
    }
  });
  return map;
}

function headerScore(sheet, row) {
  const m = colIndexMap(sheet, row);
  return Object.keys(m).length + sheet.cols.filter((c) => c.req && m[c.key] !== undefined).length;
}

// เดาชนิดชีตจากชื่อ (ถ้ามี) หรือจากหัวคอลัมน์
export function detectSheet(name, rows) {
  const n = norm(name);
  const order = ['assignments', 'subjects', 'teachers', 'rooms', 'groups'];
  let best = null, bestScore = 0;
  for (const key of order) {
    const sh = SHEET_BY_KEY[key];
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
      const sc = headerScore(sh, rows[r]);
      if (sc > bestScore) { bestScore = sc; best = key; }
    }
  }
  const allReq = (key) => {
    const sh = SHEET_BY_KEY[key];
    return rows.slice(0, 6).some((r) => { const m = colIndexMap(sh, r); return sh.cols.every((c) => !c.req || m[c.key] !== undefined); });
  };
  if (n) {
    for (const key of order) {
      if (SHEET_BY_KEY[key].keywords.some((k) => n.includes(norm(k))) && allReq(key)) return key;
    }
  }
  if (best && allReq(best)) return best;
  for (const key of order) if (allReq(key)) return key;
  return null;
}

/** แปลงตาราง (array ของแถว) ให้เป็น records พร้อมเลขแถวต้นฉบับ */
export function rowsToRecords(sheetKey, rows, sourceName) {
  const sh = SHEET_BY_KEY[sheetKey];
  let hRow = -1, best = 0;
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const sc = headerScore(sh, rows[r]);
    if (sc > best) { best = sc; hRow = r; }
  }
  const issues = [];
  if (hRow < 0) return { records: [], issues: [{ level: 'error', sheet: sh.title, msg: `ไม่พบแถวหัวคอลัมน์ของชีต "${sh.title}"`, fix: 'ใช้หัวคอลัมน์ตามแม่แบบ' }] };
  const map = colIndexMap(sh, rows[hRow]);
  for (const c of sh.cols) {
    if (c.req && map[c.key] === undefined) {
      issues.push({ level: 'error', sheet: sh.title, col: c.label, msg: `ไม่พบคอลัมน์ "${c.label}" (${sourceName || ''})`, fix: 'เพิ่มคอลัมน์ให้ตรงกับแม่แบบ' });
    }
  }
  const records = [];
  for (let r = hRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (row.every((v) => String(v ?? '').trim() === '')) continue;
    const rec = { _row: r + 1, _src: sourceName || sh.title };
    for (const c of sh.cols) {
      const v = map[c.key] !== undefined ? row[map[c.key]] : '';
      rec[c.key] = v == null ? '' : String(v).trim();
    }
    records.push(rec);
  }
  return { records, issues };
}

export function emptyRaw() {
  return { teachers: [], rooms: [], groups: [], subjects: [], assignments: [] };
}

const toInt = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * ตรวจความถูกต้องและสร้างโมเดลข้อมูลสำหรับตัวจัดตาราง
 * คืนค่า { issues, model, summary }
 */
export function buildModel(raw, preIssues = []) {
  const issues = [...preIssues];
  const add = (level, sheet, rec, col, msg, fix) => issues.push({ level, sheet, row: rec?._row, src: rec?._src, col, msg, fix });

  for (const s of SHEETS) {
    if (!raw[s.key] || raw[s.key].length === 0) {
      issues.push({ level: 'error', sheet: s.title, msg: `ไม่มีข้อมูลชีต "${s.title}"`, fix: `ใส่ข้อมูลในชีต "${s.title}" ตามแม่แบบ หรือนำเข้าไฟล์ที่มีชีตนี้` });
    }
  }

  // ตรวจค่าว่างและรหัสซ้ำ
  const indexOf = {};
  for (const s of SHEETS) {
    const list = raw[s.key] || [];
    if (s.key !== 'assignments') indexOf[s.key] = new Map();
    for (const rec of list) {
      for (const c of s.cols) {
        if (c.req && !rec[c.key]) add('error', s.title, rec, c.label, `ช่อง "${c.label}" ว่าง`, `กรอก${c.label}ในแถวที่ ${rec._row}`);
      }
      if (s.key !== 'assignments' && rec.id) {
        const m = indexOf[s.key];
        if (m.has(rec.id)) add('error', s.title, rec, s.cols[0].label, `รหัส "${rec.id}" ซ้ำกับแถวที่ ${m.get(rec.id)._row}`, 'เปลี่ยนรหัสให้ไม่ซ้ำ หรือลบแถวที่ซ้ำออก');
        else m.set(rec.id, rec);
      }
    }
  }

  // ===== ครู =====
  const teachers = [];
  const tIdx = new Map();
  for (const rec of raw.teachers || []) {
    if (!rec.id || tIdx.has(rec.id)) continue;
    const head = isHeadPos(rec.position);
    let min = toInt(rec.min), max = toInt(rec.max);
    if (Number.isNaN(min)) { add('error', 'ครู', rec, 'ชม.ขั้นต่ำ', `"${rec.min}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลข เช่น 18'); min = null; }
    if (Number.isNaN(max)) { add('error', 'ครู', rec, 'ชม.สูงสุด', `"${rec.max}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลข เช่น 24'); max = null; }
    if (min == null) min = 18;
    if (max == null) max = head ? 24 : null;
    if (min < 18) add('warn', 'ครู', rec, 'ชม.ขั้นต่ำ', `ชม.ขั้นต่ำ ${min} ต่ำกว่าเกณฑ์ 18 ชม. ระบบจะใช้ 18 ชม.`, 'ครูทุกคนต้องสอนอย่างน้อย 18 ชม.');
    min = Math.max(18, min);
    if (head && max > 24) { add('warn', 'ครู', rec, 'ชม.สูงสุด', `หัวหน้าแผนกกำหนดสูงสุด ${max} ชม. เกินเกณฑ์ 24 ชม. ระบบจะใช้ 24`, 'หัวหน้าต้องสอน 18-24 ชม.'); max = 24; }
    if (max != null && max < min) add('error', 'ครู', rec, 'ชม.สูงสุด', `ชม.สูงสุด (${max}) น้อยกว่าชม.ขั้นต่ำ (${min})`, 'แก้ให้ชม.สูงสุด ≥ ชม.ขั้นต่ำ');
    const ts = parseTimeSpec(rec.unav);
    ts.errors.forEach((e) => add('error', 'ครู', rec, 'เวลาไม่สะดวก', e, 'รูปแบบ: จ 08.00-12.00; ศ 13.00-16.00'));
    const hardUnav = /บังคับ|hard/i.test(rec.unavType || '');
    const daily = rec.daily ? yes(rec.daily) : isComputerDept(rec.dept);
    tIdx.set(rec.id, teachers.length);
    teachers.push({
      id: rec.id, name: rec.name, dept: rec.dept || '', position: rec.position || 'ครูประจำ',
      isHead: head, isRegular: isRegularPos(rec.position || 'ครูประจำ'), min, max: max ?? NS,
      maxSet: max != null, daily, unav: ts.slots, unavHard: hardUnav, unavText: slotsToText(ts.slots),
    });
  }

  // ===== ห้อง =====
  const rooms = [];
  const rIdx = new Map();
  for (const rec of raw.rooms || []) {
    if (!rec.id || rIdx.has(rec.id)) continue;
    let cap = toInt(rec.cap);
    if (Number.isNaN(cap)) { add('error', 'ห้องเรียน', rec, 'ความจุ', `"${rec.cap}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลขจำนวนที่นั่ง'); cap = null; }
    rIdx.set(rec.id, rooms.length);
    rooms.push({ id: rec.id, name: rec.name || rec.id, type: rec.type || 'ทฤษฎี', cap: cap ?? 0, multi: yes(rec.multi) });
  }

  // ===== กลุ่มเรียน =====
  const groups = [];
  const gIdx = new Map();
  for (const rec of raw.groups || []) {
    if (!rec.id || gIdx.has(rec.id)) continue;
    let size = toInt(rec.size);
    if (Number.isNaN(size)) { add('error', 'กลุ่มเรียน', rec, 'จำนวนนักเรียน', `"${rec.size}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลขจำนวนนักเรียน'); size = null; }
    let advisor = -1;
    if (rec.advisor) {
      if (tIdx.has(rec.advisor)) advisor = tIdx.get(rec.advisor);
      else add('error', 'กลุ่มเรียน', rec, 'รหัสครูที่ปรึกษา', `อ้างถึงครู "${rec.advisor}" ที่ไม่มีในชีตครู`, 'เพิ่มครูรหัสนี้ในชีตครู หรือแก้รหัสให้ถูกต้อง');
    }
    gIdx.set(rec.id, groups.length);
    groups.push({ id: rec.id, name: rec.name || rec.id, level: rec.level || '', dept: rec.dept || '', size: size ?? 0, advisor });
  }
  // ครูที่ปรึกษาซ้ำหลายกลุ่ม
  const advCount = {};
  groups.forEach((g) => { if (g.advisor >= 0) (advCount[g.advisor] ||= []).push(g.name); });

  // ===== รายวิชา =====
  const subjects = [];
  const sIdx = new Map();
  for (const rec of raw.subjects || []) {
    if (!rec.id || sIdx.has(rec.id)) continue;
    const t = toInt(rec.t), p = toInt(rec.p), n = toInt(rec.n);
    let periods = toInt(rec.periods);
    for (const [k, v, lab] of [['t', t, 'ท'], ['p', p, 'ป'], ['n', n, 'น'], ['periods', periods, 'คาบต่อสัปดาห์']]) {
      if (Number.isNaN(v)) add('error', 'รายวิชา', rec, lab, `"${rec[k]}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลขจำนวนเต็ม');
    }
    if (periods == null || Number.isNaN(periods)) periods = (Number.isFinite(t) ? t : 0) + (Number.isFinite(p) ? p : 0);
    if (!periods || periods <= 0) add('error', 'รายวิชา', rec, 'คาบต่อสัปดาห์', 'ไม่ได้ระบุจำนวนคาบ (คาบต่อสัปดาห์ หรือ ท+ป)', 'กรอกคาบต่อสัปดาห์ หรือ ท และ ป');
    const fx = parseTimeSpec(rec.fixed);
    fx.errors.forEach((e) => add('error', 'รายวิชา', rec, 'เวลาบังคับ', e, 'รูปแบบ: พ 15.00-17.00'));
    let fixed = null;
    if (fx.ranges.length > 1) add('error', 'รายวิชา', rec, 'เวลาบังคับ', 'เวลาบังคับต้องเป็นช่วงเดียวต่อเนื่อง', 'ระบุช่วงเดียว เช่น พ 15.00-17.00');
    else if (fx.ranges.length === 1) {
      const r = fx.ranges[0];
      fixed = { day: r.day, start: r.p0, len: r.p1 - r.p0 };
      if (r.p0 < 4 && r.p1 > 4) add('error', 'รายวิชา', rec, 'เวลาบังคับ', 'เวลาบังคับคร่อมพักเที่ยง', 'แยกเป็นช่วงเช้าหรือบ่าย');
    }
    let room = -1;
    if (rec.room) {
      if (rIdx.has(rec.room)) room = rIdx.get(rec.room);
      else add('error', 'รายวิชา', rec, 'ห้องเฉพาะ', `อ้างถึงห้อง "${rec.room}" ที่ไม่มีในข้อมูลห้อง`, 'เพิ่มห้องนี้ในชีตห้องเรียน หรือแก้รหัสห้อง');
    }
    sIdx.set(rec.id, subjects.length);
    subjects.push({
      id: rec.id, name: rec.name, t: t || 0, p: p || 0, n: n || 0, periods: periods || 0,
      roomType: rec.roomType || 'ทฤษฎี', room, fixed, fixedText: rec.fixed || '', advisorOnly: yes(rec.advisorOnly),
    });
  }

  // ===== การลงทะเบียน =====
  const assignments = [];
  const pairSeen = new Map();
  for (const rec of raw.assignments || []) {
    if (!rec.group || !rec.subject) continue;
    let bad = false;
    if (!gIdx.has(rec.group)) { add('error', 'การลงทะเบียน', rec, 'รหัสกลุ่ม', `อ้างถึงกลุ่ม "${rec.group}" ที่ไม่มีในชีตกลุ่มเรียน`, 'เพิ่มกลุ่มนี้ หรือแก้รหัสกลุ่ม'); bad = true; }
    if (!sIdx.has(rec.subject)) { add('error', 'การลงทะเบียน', rec, 'รหัสวิชา', `อ้างถึงวิชา "${rec.subject}" ที่ไม่มีในชีตรายวิชา`, 'เพิ่มวิชานี้ หรือแก้รหัสวิชา'); bad = true; }
    const key = rec.group + '|' + rec.subject;
    if (pairSeen.has(key)) { add('error', 'การลงทะเบียน', rec, 'รหัสวิชา', `กลุ่ม ${rec.group} ลงวิชา ${rec.subject} ซ้ำกับแถวที่ ${pairSeen.get(key)}`, 'ลบแถวที่ซ้ำ (1 วิชาต่อกลุ่มลงได้ครั้งเดียว)'); bad = true; }
    else pairSeen.set(key, rec._row);
    if (bad) continue;
    const g = gIdx.get(rec.group), s = sIdx.get(rec.subject);
    const subj = subjects[s];
    let cands = [];
    const ids = String(rec.teachers || '').split(/[,/;|\s]+/).map((x) => x.trim()).filter(Boolean);
    for (const id of ids) {
      if (tIdx.has(id)) cands.push(tIdx.get(id));
      else add('error', 'การลงทะเบียน', rec, 'รหัสครูผู้สอน', `อ้างถึงครู "${id}" ที่ไม่มีในชีตครู`, 'เพิ่มครูรหัสนี้ หรือแก้รหัสครู');
    }
    if (subj.advisorOnly) {
      const adv = groups[g].advisor;
      if (adv < 0) { add('error', 'การลงทะเบียน', rec, 'รหัสครูผู้สอน', `วิชา ${subj.name} ต้องสอนโดยครูที่ปรึกษา แต่กลุ่ม ${groups[g].name} ไม่มีครูที่ปรึกษา`, 'ระบุรหัสครูที่ปรึกษาในชีตกลุ่มเรียน'); continue; }
      if (cands.length && !cands.includes(adv)) add('warn', 'การลงทะเบียน', rec, 'รหัสครูผู้สอน', `วิชา ${subj.name} ต้องสอนโดยครูที่ปรึกษา (${teachers[adv].name}) ระบบจะใช้ครูที่ปรึกษาแทน`, 'แก้รหัสครูผู้สอนให้เป็นครูที่ปรึกษา');
      cands = [adv];
    }
    cands = [...new Set(cands)];
    if (!cands.length) { if (!ids.length) add('error', 'การลงทะเบียน', rec, 'รหัสครูผู้สอน', 'ไม่ได้ระบุครูผู้สอน', 'กรอกรหัสครูอย่างน้อย 1 คน'); continue; }
    let periods = toInt(rec.periods);
    if (Number.isNaN(periods)) { add('error', 'การลงทะเบียน', rec, 'คาบต่อสัปดาห์', `"${rec.periods}" ไม่ใช่ตัวเลข`, 'ใส่ตัวเลข หรือเว้นว่างเพื่อใช้ตามรายวิชา'); continue; }
    if (periods == null) periods = subj.periods;
    if (!periods) continue;
    let blocks;
    if (subj.fixed) {
      if (periods !== subj.fixed.len) { add('error', 'การลงทะเบียน', rec, 'คาบต่อสัปดาห์', `วิชา ${subj.name} มี ${periods} คาบ แต่เวลาบังคับมี ${subj.fixed.len} คาบ`, 'ปรับคาบต่อสัปดาห์ให้เท่ากับช่วงเวลาบังคับ'); continue; }
      blocks = [periods];
    } else blocks = splitBlocks(periods);
    assignments.push({ g, s, cands, periods, blocks, row: rec._row });
  }

  // ===== ตรวจความเป็นไปได้ภาพรวม =====
  // ภาระต่อกลุ่ม
  const gHours = new Array(groups.length).fill(0);
  assignments.forEach((a) => (gHours[a.g] += a.periods));
  groups.forEach((g, i) => {
    if (gHours[i] > NS) add('error', 'การลงทะเบียน', null, 'คาบต่อสัปดาห์', `กลุ่ม ${g.name} มี ${gHours[i]} คาบ เกิน ${NS} คาบต่อสัปดาห์ (จ-ศ 08.00-17.00)`, 'ลดจำนวนวิชา/คาบของกลุ่มนี้');
    if (gHours[i] === 0) add('warn', 'กลุ่มเรียน', null, null, `กลุ่ม ${g.name} ยังไม่มีรายวิชาลงทะเบียน`, 'เพิ่มแถวในชีตการลงทะเบียน');
  });

  // ห้องที่เข้ากันได้ (ประเภท + ความจุ)
  for (const a of assignments) {
    const subj = subjects[a.s], grp = groups[a.g];
    let cand;
    if (subj.room >= 0) cand = [subj.room];
    else cand = rooms.map((r, i) => i).filter((i) => norm(rooms[i].type) === norm(subj.roomType));
    const typeOk = cand.length > 0;
    cand = cand.filter((i) => !rooms[i].cap || !grp.size || rooms[i].cap >= grp.size || rooms[i].multi);
    a.rooms = cand;
    if (!typeOk) add('error', 'รายวิชา', { _row: null }, 'ประเภทห้อง', `ไม่มีห้องประเภท "${subj.roomType}" สำหรับวิชา ${subj.name}`, `เพิ่มห้องประเภท "${subj.roomType}" ในชีตห้องเรียน หรือแก้ประเภทห้องของวิชา`);
    else if (!cand.length) add('error', 'การลงทะเบียน', { _row: a.row }, 'ประเภทห้อง', `ห้องไม่พอ: กลุ่ม ${grp.name} (${grp.size} คน) ไม่มีห้อง "${subj.roomType}" ที่จุได้ สำหรับวิชา ${subj.name}`, 'เพิ่มห้องที่ความจุพอ หรือแก้จำนวนนักเรียน/ความจุ');
  }
  // ความต้องการห้องแต่ละประเภทเทียบกับจำนวนคาบที่มี
  const typeDemand = {}, typeSupply = {};
  rooms.forEach((r) => { const k = norm(r.type); typeSupply[k] = (typeSupply[k] || 0) + (r.multi ? Infinity : NS); });
  assignments.forEach((a) => { if (rooms[a.rooms?.[0]]?.multi) return; const k = norm(subjects[a.s].roomType); typeDemand[k] = (typeDemand[k] || 0) + a.periods; });
  for (const k of Object.keys(typeDemand)) {
    if (typeSupply[k] && typeDemand[k] > typeSupply[k]) {
      const label = subjects.find((s) => norm(s.roomType) === k)?.roomType || k;
      add('error', 'ห้องเรียน', null, 'ประเภทห้อง', `ห้องไม่พอ: ต้องใช้ห้อง "${label}" รวม ${typeDemand[k]} คาบ แต่มีเพียง ${typeSupply[k]} คาบ/สัปดาห์`, `เพิ่มห้อง "${label}" อย่างน้อย ${Math.ceil((typeDemand[k] - typeSupply[k]) / NS)} ห้อง`);
    } else if (typeSupply[k] && typeDemand[k] > typeSupply[k] * 0.9) {
      const label = subjects.find((s) => norm(s.roomType) === k)?.roomType || k;
      add('warn', 'ห้องเรียน', null, 'ประเภทห้อง', `ห้อง "${label}" ถูกใช้ ${Math.round(typeDemand[k] / typeSupply[k] * 100)}% ของเวลาทั้งหมด อาจจัดได้ยาก`, 'พิจารณาเพิ่มห้องประเภทนี้');
    }
  }

  // ภาระครู: ขั้นต่ำ/สูงสุดที่เป็นไปได้
  const forced = new Array(teachers.length).fill(0), possible = new Array(teachers.length).fill(0), blocksPossible = new Array(teachers.length).fill(0);
  for (const a of assignments) {
    if (a.cands.length === 1) forced[a.cands[0]] += a.periods;
    for (const t of a.cands) { possible[t] += a.periods; blocksPossible[t] += a.blocks.length; }
  }
  teachers.forEach((t, i) => {
    if (possible[i] < t.min) add('warn', 'ครู', null, 'ชม.ขั้นต่ำ', `${t.name} มีวิชาที่สอนได้รวมเพียง ${possible[i]} ชม. ต่ำกว่า ${t.min} ชม. (ละเมิดเงื่อนไขบังคับแน่นอน)`, `เพิ่มรายวิชาให้ ${t.name} ในชีตการลงทะเบียน`);
    if (forced[i] > t.max) add('warn', 'ครู', null, 'ชม.สูงสุด', `${t.name} ถูกกำหนดสอน ${forced[i]} ชม. เกินสูงสุด ${t.max} ชม.`, 'ย้ายบางวิชาไปให้ครูคนอื่น หรือเพิ่มครูผู้สอนสำรอง');
    if (forced[i] > NS) add('error', 'ครู', null, 'ชม.สูงสุด', `${t.name} ถูกกำหนดสอน ${forced[i]} ชม. เกิน ${NS} คาบที่มีในสัปดาห์`, 'ย้ายบางวิชาไปให้ครูคนอื่น');
    if (t.daily && blocksPossible[i] < ND && possible[i] > 0) add('warn', 'ครู', null, 'สอนทุกวัน', `${t.name} ต้องสอนทุกวัน แต่มีคาบเรียนแบ่งได้เพียง ${blocksPossible[i]} ช่วง`, 'เพิ่มรายวิชาหรือแยกคาบให้มากขึ้น');
    if (advCount[i]?.length > 1) {
      const fx = assignments.filter((a) => subjects[a.s].fixed && subjects[a.s].advisorOnly && advCount[i].includes(groups[a.g].name));
      if (fx.length > 1) add('error', 'กลุ่มเรียน', null, 'รหัสครูที่ปรึกษา', `${t.name} เป็นครูที่ปรึกษาของ ${advCount[i].join(', ')} ซึ่งเรียนวิชาเวลาบังคับพร้อมกัน ทำให้ครูสอนซ้อน`, 'กำหนดครูที่ปรึกษาคนละคนในแต่ละกลุ่ม');
    }
  });
  // วิชาเวลาบังคับ: ครูคนเดียวกันสอนหลายกลุ่มเวลาเดียวกัน
  const fixedByTeacher = {};
  assignments.forEach((a) => {
    const sj = subjects[a.s];
    if (sj.fixed && a.cands.length === 1) {
      const k = a.cands[0] + '|' + sj.fixed.day;
      (fixedByTeacher[k] ||= []).push(a);
    }
  });
  Object.values(fixedByTeacher).forEach((list) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = subjects[list[i].s].fixed, B = subjects[list[j].s].fixed;
      if (A.start < B.start + B.len && B.start < A.start + A.len) {
        add('error', 'การลงทะเบียน', { _row: list[j].row }, 'รหัสครูผู้สอน', `${teachers[list[i].cands[0]].name} ต้องสอน ${groups[list[i].g].name} และ ${groups[list[j].g].name} ในเวลาบังคับเดียวกัน (เวลาซ้อน)`, 'เปลี่ยนครูผู้สอนของกลุ่มใดกลุ่มหนึ่ง');
      }
    }
  });
  // เวลาบังคับชนกับเวลาไม่สะดวกแบบบังคับของครู
  assignments.forEach((a) => {
    const sj = subjects[a.s];
    if (!sj.fixed || a.cands.length !== 1) return;
    const t = teachers[a.cands[0]];
    if (!t.unavHard) return;
    for (let k = 0; k < sj.fixed.len; k++) {
      if (t.unav.includes(sj.fixed.day * NP + sj.fixed.start + k)) { add('error', 'การลงทะเบียน', { _row: a.row }, 'รหัสครูผู้สอน', `เวลาบังคับของวิชา ${sj.name} ซ้อนกับเวลาไม่สะดวกของ ${t.name}`, 'เปลี่ยนครูผู้สอน หรือแก้เวลาไม่สะดวก'); break; }
    }
  });
  // กลุ่มเดียวกันมีวิชาเวลาบังคับซ้อนกัน
  const gFixed = {};
  assignments.forEach((a) => { const f = subjects[a.s].fixed; if (f) (gFixed[a.g] ||= []).push(a); });
  Object.values(gFixed).forEach((list) => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = subjects[list[i].s].fixed, B = subjects[list[j].s].fixed;
      if (A.day === B.day && A.start < B.start + B.len && B.start < A.start + A.len) add('error', 'การลงทะเบียน', { _row: list[j].row }, 'รหัสวิชา', `กลุ่ม ${groups[list[i].g].name} มีวิชาเวลาบังคับซ้อนกัน (${subjects[list[i].s].name} / ${subjects[list[j].s].name})`, 'แก้เวลาบังคับให้ไม่ทับกัน');
    }
  });

  const totalPeriods = assignments.reduce((s, a) => s + a.periods, 0);
  const summary = {
    teachers: teachers.length, rooms: rooms.length, groups: groups.length, subjects: subjects.length,
    assignments: assignments.length, periods: totalPeriods,
    blocks: assignments.reduce((s, a) => s + a.blocks.length, 0),
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
  };
  return { issues, model: { teachers, rooms, groups, subjects, assignments }, summary };
}

export function describeSlots(fixed) {
  if (!fixed) return '';
  return `${DAYS_SHORT[fixed.day]} ${fixed.start}`;
}
export { startsFor };
