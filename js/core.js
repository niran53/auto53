// ค่าคงที่และฟังก์ชันพื้นฐานที่ใช้ร่วมกันทั้งหน้าเว็บ ตัวจัดตาราง และตัวตรวจสอบ
export const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];
export const DAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ'];
// คาบเรียน 08.00-17.00 น. พักเที่ยง 12.00-13.00 น. (ไม่มีคาบเกิน 17.00 น.)
export const PERIODS = [
  { label: '08.00-09.00', start: 8, end: 9, half: 0 },
  { label: '09.00-10.00', start: 9, end: 10, half: 0 },
  { label: '10.00-11.00', start: 10, end: 11, half: 0 },
  { label: '11.00-12.00', start: 11, end: 12, half: 0 },
  { label: '13.00-14.00', start: 13, end: 14, half: 1 },
  { label: '14.00-15.00', start: 14, end: 15, half: 1 },
  { label: '15.00-16.00', start: 15, end: 16, half: 1 },
  { label: '16.00-17.00', start: 16, end: 17, half: 1 },
];
export const ND = DAYS.length;
export const NP = PERIODS.length;
export const NS = ND * NP; // 40 คาบต่อสัปดาห์
export const HALF_LEN = 4; // ช่วงเช้า/บ่าย ยาวสุด 4 คาบ

export const slotOf = (d, p) => d * NP + p;
export const dayOf = (s) => Math.floor(s / NP);
export const perOf = (s) => s % NP;
export const fmtHour = (h) => String(h).padStart(2, '0') + '.00';
export const timeRange = (p, len) => fmtHour(PERIODS[p].start) + '-' + fmtHour(PERIODS[p + len - 1].end);

// ตำแหน่งเริ่มที่วางได้สำหรับบล็อกยาว len คาบ (ไม่คร่อมพักเที่ยง)
export function startsFor(len) {
  const out = [];
  if (len > HALF_LEN) return out;
  for (let p = 0; p + len <= 4; p++) out.push(p);
  for (let p = 4; p + len <= 8; p++) out.push(p);
  return out;
}

const DAY_TOKENS = [
  ['พฤหัสบดี', 3], ['พฤหัส', 3], ['พฤ.', 3], ['พฤ', 3],
  ['จันทร์', 0], ['อังคาร', 1], ['พุธ', 2], ['ศุกร์', 4],
  ['จ.', 0], ['อ.', 1], ['พ.', 2], ['ศ.', 4],
  ['จ', 0], ['อ', 1], ['พ', 2], ['ศ', 4],
  ['mon', 0], ['tue', 1], ['wed', 2], ['thu', 3], ['fri', 4],
];

function hourToBoundary(h) {
  // แปลงชั่วโมง (เช่น 8, 12, 13, 17) เป็นดัชนีขอบคาบ
  if (h >= 8 && h <= 12) return h - 8; // 8->0 ... 12->4
  if (h >= 13 && h <= 17) return h - 9; // 13->4 ... 17->8
  return null;
}

/**
 * แปลงข้อความเวลา เช่น "จ 08.00-12.00; ศ 13.00-16.00" เป็นรายการคาบ
 * คืนค่า { slots:[...], errors:[...] }
 */
export function parseTimeSpec(text) {
  const res = { slots: [], ranges: [], errors: [] };
  if (text == null) return res;
  const src = String(text).trim();
  if (!src || src === '-') return res;
  const parts = src.split(/[;,\n]|และ/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    let day = null, rest = '';
    for (const [tok, d] of DAY_TOKENS) {
      if (lower.startsWith(tok)) { day = d; rest = part.slice(tok.length); break; }
    }
    if (day === null) { res.errors.push(`ไม่รู้จักวันใน "${part}" (ใช้ จ อ พ พฤ ศ)`); continue; }
    const m = rest.replace(/น\.?/g, '').match(/(\d{1,2})[.:](\d{2})\s*[-–ถึง]+\s*(\d{1,2})[.:](\d{2})/);
    if (!m) {
      if (!rest.trim()) { // ทั้งวัน
        for (let p = 0; p < NP; p++) res.slots.push(slotOf(day, p));
        res.ranges.push({ day, p0: 0, p1: NP });
        continue;
      }
      res.errors.push(`รูปแบบเวลาไม่ถูกต้องใน "${part}" (ตัวอย่าง: พ 15.00-17.00)`); continue;
    }
    const h1 = +m[1] + (+m[2]) / 60, h2 = +m[3] + (+m[4]) / 60;
    if (h1 < 8 || h2 > 17) { res.errors.push(`"${part}" อยู่นอกช่วงเวลาเรียน 08.00-17.00 น.`); continue; }
    if (h1 % 1 || h2 % 1) { res.errors.push(`"${part}" ต้องเป็นเวลาเต็มชั่วโมง`); continue; }
    const b1 = hourToBoundary(h1), b2 = hourToBoundary(h2);
    if (b1 === null || b2 === null || b2 <= b1) { res.errors.push(`"${part}" อยู่นอกช่วง 08.00-17.00 น. หรือเวลาสิ้นสุดก่อนเวลาเริ่ม`); continue; }
    if (h1 < 13 && h2 > 12 && h1 >= 12) { res.errors.push(`"${part}" ทับเวลาพักเที่ยง`); continue; }
    for (let p = b1; p < b2; p++) res.slots.push(slotOf(day, p));
    res.ranges.push({ day, p0: b1, p1: b2 });
  }
  res.slots = [...new Set(res.slots)].sort((a, b) => a - b);
  return res;
}

export function slotsToText(slots) {
  const byDay = {};
  for (const s of slots) (byDay[dayOf(s)] ||= []).push(perOf(s));
  const out = [];
  for (const d of Object.keys(byDay).map(Number).sort()) {
    const ps = byDay[d].sort((a, b) => a - b);
    let i = 0;
    while (i < ps.length) {
      let j = i;
      while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1 && PERIODS[ps[j + 1]].half === PERIODS[ps[j]].half) j++;
      out.push(`${DAYS_SHORT[d]} ${timeRange(ps[i], j - i + 1)}`);
      i = j + 1;
    }
  }
  return out.join('; ');
}

// แบ่งจำนวนคาบเป็นบล็อกต่อเนื่อง (ไม่เกิน 4 คาบ/บล็อก) ให้ขนาดใกล้เคียงกัน
export function splitBlocks(h) {
  if (h <= 0) return [];
  const k = Math.ceil(h / HALF_LEN);
  const base = Math.floor(h / k), extra = h % k;
  const out = [];
  for (let i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
  return out;
}

// ตัวสุ่มที่กำหนด seed ได้ (ทำซ้ำผลลัพธ์ได้)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const yes = (v) => /^(ใช่|y|yes|true|1|จริง|ได้|x|✓)$/i.test(String(v ?? '').trim());
export const isHeadPos = (pos) => /หัวหน้า|head/i.test(pos || '');
export const isRegularPos = (pos) => /ครูประจำ|ประจำ|regular/i.test(pos || '') && !isHeadPos(pos);
export const isComputerDept = (dept) => /คอมพิวเตอร์|computer/i.test(dept || '');
