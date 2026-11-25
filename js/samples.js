// สร้างชุดข้อมูลตัวอย่าง เล็ก / กลาง / ใหญ่ / มีข้อผิดพลาด (อ้างอิงลักษณะโจทย์ระดับภาค ปี 2568)
import { SHEETS } from './model.js';
import { rng } from './core.js';

const GEN = [
  ['20000-1101', 'ภาษาไทยพื้นฐาน', 1, 2, 2, 'ทฤษฎี'],
  ['20000-1201', 'ภาษาอังกฤษในชีวิตจริง', 0, 2, 1, 'ทฤษฎี'],
  ['20000-1301', 'วิทยาศาสตร์เพื่อพัฒนาทักษะชีวิต', 2, 1, 3, 'ทฤษฎี'],
  ['20000-1401', 'คณิตศาสตร์พื้นฐานอาชีพ', 2, 0, 2, 'ทฤษฎี'],
  ['20000-1501', 'หน้าที่พลเมืองและศีลธรรม', 2, 0, 2, 'ทฤษฎี'],
  ['20000-1601', 'พลศึกษาเพื่อพัฒนาสุขภาพ', 0, 2, 1, 'โรงยิม'],
  ['20001-1002', 'กฎหมายแรงงานเบื้องต้น', 2, 0, 2, 'ทฤษฎี'],
];
const SCOUT = ['20000-2001', 'กิจกรรมลูกเสือวิสามัญ', 0, 2, 0, 'สนาม'];
const COMP1 = [
  ['20204-2001', 'คอมพิวเตอร์และสารสนเทศเพื่องานอาชีพ', 2, 1, 3, 'คอมพิวเตอร์'],
  ['20204-2003', 'การเขียนโปรแกรมเบื้องต้น', 1, 3, 2, 'คอมพิวเตอร์'],
  ['20204-2005', 'โปรแกรมกราฟิก', 1, 3, 2, 'คอมพิวเตอร์'],
  ['20204-2007', 'การใช้โปรแกรมสำนักงาน', 1, 2, 2, 'คอมพิวเตอร์'],
];
const COMP2 = [
  ['20204-2102', 'การเขียนโปรแกรมเว็บ', 1, 3, 2, 'คอมพิวเตอร์'],
  ['20204-2104', 'ระบบฐานข้อมูลเบื้องต้น', 1, 3, 2, 'คอมพิวเตอร์'],
  ['20204-2106', 'เครือข่ายคอมพิวเตอร์เบื้องต้น', 1, 2, 2, 'คอมพิวเตอร์'],
  ['20204-2108', 'การออกแบบสื่อดิจิทัล', 1, 2, 2, 'คอมพิวเตอร์'],
];
const ACC = [
  ['20201-2001', 'การบัญชีเบื้องต้น 1', 2, 2, 3, 'ทฤษฎี'],
  ['20201-2003', 'การบัญชีห้างหุ้นส่วน', 2, 1, 3, 'ทฤษฎี'],
  ['20201-2005', 'การบัญชีด้วยคอมพิวเตอร์', 1, 2, 2, 'คอมพิวเตอร์'],
  ['20200-1003', 'การขายเบื้องต้น', 2, 1, 3, 'ทฤษฎี'],
];

const FIRST = ['สมชาย', 'สุดารัตน์', 'ปรีดาภรณ์', 'ประภาพร', 'ธนา', 'วีระพงษ์', 'กมลชนก', 'ณัฐพล', 'พรทิพย์', 'อนุชา', 'ศิริพร', 'วิชัย', 'จันทร์เพ็ญ', 'ธีรวัฒน์', 'นภัสสร', 'สุรเชษฐ์', 'อรอุมา', 'ชยพล', 'มาลัย', 'กิตติพงษ์', 'ปิยะนุช', 'เอกชัย', 'ดวงใจ', 'ภานุวัฒน์', 'รัชนี', 'สิทธิชัย', 'วาสนา', 'พงศกร', 'ลำดวน', 'อภิชาติ', 'จิราพร', 'ศักดิ์ชัย', 'บุษบา', 'ทวีศักดิ์', 'นันทนา', 'ชาตรี', 'อัญชลี', 'สุเมธ', 'กาญจนา', 'ปกรณ์', 'วนิดา', 'ยุทธนา', 'สายสุนีย์', 'วรวุฒิ', 'อำไพ', 'ธนกร', 'พิมพ์ชนก', 'สมศักดิ์', 'รุ่งนภา', 'ไพโรจน์', 'ศศิธร', 'ประเสริฐ', 'ละเอียด', 'นิพนธ์', 'อุไรวรรณ', 'บุญเลิศ'];
const LAST = ['ใจดี', 'ศรีสุข', 'มั่นคง', 'วงศ์ไทย', 'สุวรรณ', 'ทองดี', 'แก้วมณี', 'พรหมมา', 'บุญมี', 'สายทอง', 'ชัยวัฒน์', 'รักษ์ดี', 'กิจเจริญ', 'นาคสุข', 'ศรีวงศ์', 'อินทร์แก้ว'];

const SIZES = {
  small: { label: 'ขนาดเล็ก', comp1: 2, comp2: 2, acc: 0 },
  medium: { label: 'ขนาดกลาง', comp1: 4, comp2: 3, acc: 3 },
  large: { label: 'ขนาดใหญ่', comp1: 7, comp2: 7, acc: 10 },
};

export function generateSample(size = 'small', seed = 2568) {
  const cfg = SIZES[size];
  const rand = rng(seed + size.length * 101);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // กลุ่มเรียน
  const groups = [];
  let no = 1;
  const addG = (level, dept, kind, count) => {
    for (let i = 0; i < count; i++) {
      groups.push({ id: `G${String(groups.length + 1).padStart(2, '0')}`, name: `${level}/${no++}`, level, dept, kind, size: 28 + Math.floor(rand() * 15) });
    }
  };
  addG('ปวช.1', 'คอมพิวเตอร์ธุรกิจ', 'comp1', cfg.comp1);
  no = 1; addG('ปวช.2', 'คอมพิวเตอร์ธุรกิจ', 'comp2', cfg.comp2);
  const accStartNo = cfg.comp1 + 1; no = accStartNo; addG('ปวช.1', 'การบัญชี', 'acc', cfg.acc);

  // รายการสอน (กลุ่ม x วิชา) แยกตามแผนกผู้สอน
  const subjectsUsed = new Map();
  const items = []; // { g, sid, periods, dept }
  const per = (s) => s[2] + s[3];
  for (const g of groups) {
    const dSubj = g.kind === 'comp1' ? COMP1 : g.kind === 'comp2' ? COMP2 : ACC;
    for (const s of dSubj) {
      subjectsUsed.set(s[0], s);
      const dept = s[5] === 'คอมพิวเตอร์' && g.kind !== 'acc' ? 'คอมพิวเตอร์ธุรกิจ' : (g.kind === 'acc' && s[0].startsWith('20201') || s[0].startsWith('20200') ? 'การบัญชี' : 'คอมพิวเตอร์ธุรกิจ');
      items.push({ g, sid: s[0], periods: per(s), dept });
    }
    for (const s of GEN) { subjectsUsed.set(s[0], s); items.push({ g, sid: s[0], periods: per(s), dept: 'สามัญสัมพันธ์' }); }
    subjectsUsed.set(SCOUT[0], SCOUT);
  }
  // ครูแต่ละแผนก: เพิ่มจำนวนครูจนไม่มีใครเกิน 24 ชม. (หัวหน้าไม่เกิน 22) และไม่มีใครต่ำกว่า 18 ชม.
  const deptHours = {};
  items.forEach((it) => (deptHours[it.dept] = (deptHours[it.dept] || 0) + it.periods));
  const depts = ['คอมพิวเตอร์ธุรกิจ', 'การบัญชี', 'สามัญสัมพันธ์'];
  const scoutTotal = groups.length * 2;
  const totalH = Object.values(deptHours).reduce((a, b) => a + b, 0) + scoutTotal;
  const deptN = {};
  for (const d of depts) if (deptHours[d]) deptN[d] = Math.max(1, Math.ceil((deptHours[d] + scoutTotal * (deptHours[d] / (totalH - scoutTotal))) / 22.5));
  let teachers, advisorOf;
  items.sort((a, b) => b.periods - a.periods || a.g.id.localeCompare(b.g.id) || a.sid.localeCompare(b.sid));
  for (let attempt = 0; attempt < 12; attempt++) {
    teachers = [];
    let nameIdx = 0;
    for (const d of depts) {
      if (!deptN[d]) continue;
      const n = deptN[d];
      for (let i = 0; i < n; i++) {
        const isMetha = d === 'คอมพิวเตอร์ธุรกิจ' && i === 1;
        const first = isMetha ? 'เมธา' : FIRST[nameIdx++ % FIRST.length];
        teachers.push({
          id: `T${String(teachers.length + 1).padStart(2, '0')}`,
          name: `ครู${first} ${LAST[(nameIdx * 7 + i) % LAST.length]}`,
          dept: d, position: i === 0 ? 'หัวหน้าแผนก' : (i === n - 1 && n > 3 ? 'ครูพิเศษ' : 'ครูประจำ'),
          load: 0, unav: isMetha ? 'จ 08.00-12.00; ศ 13.00-16.00' : '',
        });
      }
    }
    // ครูที่ปรึกษา: กลุ่มละ 1 คน ไม่ซ้ำกัน เลือกจากแผนกเดียวกันก่อน
    advisorOf = new Map();
    const used = new Set();
    for (const g of groups) {
      const pool = teachers.filter((t) => !used.has(t.id) && t.position !== 'หัวหน้าแผนก');
      const same = pool.filter((t) => t.dept === g.dept);
      const gen = pool.filter((x) => x.dept === 'สามัญสัมพันธ์');
      const t = (same.length ? same : gen.length ? gen : pool)[0] || teachers.find((x) => !used.has(x.id));
      used.add(t.id); advisorOf.set(g.id, t); t.load += 2;
    }
    // แบ่งรายการสอนให้คนที่ภาระน้อยที่สุดในแผนก
    for (const it of items) {
      const list = teachers.filter((t) => t.dept === it.dept);
      const cap = (t) => (t.position === 'หัวหน้าแผนก' ? 22 : 24);
      list.sort((a, b) => ((a.load + it.periods > cap(a)) - (b.load + it.periods > cap(b))) || a.load - b.load || a.id.localeCompare(b.id));
      it.teacher = list[0]; list[0].load += it.periods;
      it.alt = it.dept === 'สามัญสัมพันธ์' && rand() < 0.35 && list.length > 1 ? list[1] : null;
    }
    const over = depts.filter((d) => teachers.some((t) => t.dept === d && t.load > (t.position === 'หัวหน้าแผนก' ? 22 : 24)));
    const under = depts.filter((d) => teachers.some((t) => t.dept === d && t.load < 18));
    if (!over.length && !under.length) break;
    over.forEach((d) => deptN[d]++);
    under.filter((d) => !over.includes(d)).forEach((d) => (deptN[d] = Math.max(1, deptN[d] - 1)));
  }

  const rows = {};
  const header = (key) => SHEETS.find((s) => s.key === key).cols.map((c) => c.label);
  rows.teachers = [header('teachers'), ...teachers.map((t) => [t.id, t.name, t.dept, t.position, '18', t.position === 'หัวหน้าแผนก' ? '24' : '', '', t.unav, t.unav ? 'ถ้าเป็นไปได้' : ''])];

  // ห้อง
  const theoryH = items.filter((i) => subjectsUsed.get(i.sid)[5] === 'ทฤษฎี').reduce((s, i) => s + i.periods, 0);
  const compH = items.filter((i) => subjectsUsed.get(i.sid)[5] === 'คอมพิวเตอร์').reduce((s, i) => s + i.periods, 0);
  const gymH = groups.length * 2;
  const roomsRows = [];
  const nTheory = Math.ceil(theoryH / 30) + 1, nComp = Math.ceil(compH / 29) + 1, nGym = Math.ceil(gymH / 34);
  for (let i = 1; i <= nTheory; i++) roomsRows.push([`R${100 + i}`, `ห้องทฤษฎี ${100 + i}`, 'ทฤษฎี', i % 2 ? '45' : '40', 'ไม่']);
  for (let i = 1; i <= nComp; i++) roomsRows.push([`COM${i}`, `ห้องคอมพิวเตอร์ ${i}`, 'คอมพิวเตอร์', '45', 'ไม่']);
  for (let i = 1; i <= nGym; i++) roomsRows.push([`GYM${i}`, `โรงยิม ${i}`, 'โรงยิม', '60', 'ไม่']);
  roomsRows.push(['FIELD', 'สนามกีฬา', 'สนาม', '', 'ใช่']);
  rows.rooms = [header('rooms'), ...roomsRows];

  rows.groups = [header('groups'), ...groups.map((g) => [g.id, g.name, g.level, g.dept, String(g.size), advisorOf.get(g.id).id])];
  const subjRows = [...subjectsUsed.values()].map((s) => [s[0], s[1], String(s[2]), String(s[3]), String(s[4]), '', s[5], '', s === SCOUT ? 'พ 15.00-17.00' : '', s === SCOUT ? 'ใช่' : 'ไม่']);
  rows.subjects = [header('subjects'), ...subjRows];
  const asgRows = [];
  for (const g of groups) {
    for (const it of items.filter((x) => x.g === g)) asgRows.push([g.id, it.sid, it.alt ? `${it.teacher.id},${it.alt.id}` : it.teacher.id, '']);
    asgRows.push([g.id, SCOUT[0], advisorOf.get(g.id).id, '']);
  }
  rows.assignments = [header('assignments'), ...asgRows];
  return { label: cfg.label, rows };
}

// ชุดข้อมูลที่ตั้งใจใส่ข้อผิดพลาด เพื่อสาธิตการแจ้งเตือน
export function generateErrorSample() {
  const { rows } = generateSample('small', 77);
  const r = JSON.parse(JSON.stringify(rows));
  r.teachers.push([r.teachers[2][0], 'ครูรหัสซ้ำ ทดสอบ', 'สามัญสัมพันธ์', 'ครูประจำ', '18', '', '', '', '']); // รหัสซ้ำ
  r.teachers[3][7] = 'พุธ 15.00-18.30'; // เวลาเกิน 17.00
  r.groups[1][4] = 'สามสิบ'; // ไม่ใช่ตัวเลข
  r.subjects[2][1] = ''; // ชื่อวิชาว่าง
  r.subjects[3][7] = 'LAB99'; // ห้องที่ไม่มี
  r.assignments[5][2] = 'T99'; // อ้างถึงครูที่ไม่มี
  r.assignments.push([r.assignments[2][0], r.assignments[2][1], r.assignments[2][2], '']); // ลงทะเบียนซ้ำ
  r.assignments.push(['G99', r.subjects[1][0], 'T01', '']); // กลุ่มไม่มี
  return { label: 'มีข้อผิดพลาด', rows: r };
}

export function templateRows() {
  const out = {};
  for (const s of SHEETS) out[s.key] = [s.cols.map((c) => c.label), s.cols.map((c) => c.ex || '')];
  return out;
}
