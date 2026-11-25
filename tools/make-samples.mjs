// สร้างไฟล์แม่แบบและชุดข้อมูลตัวอย่าง: node tools/make-samples.mjs
import fs from 'node:fs';
const JSZip = (await import('jszip').catch(() => import('/opt/npm-tools/node_modules/jszip/lib/index.js'))).default;
globalThis.JSZip = JSZip;
const { writeXlsx, toCsv, ST } = await import('../js/xlsx.js');
const { SHEETS } = await import('../js/model.js');
const { generateSample, generateErrorSample, templateRows } = await import('../js/samples.js');

const width = (label) => Math.max(12, Math.min(40, label.length * 1.6 + 4));
function workbook(rows, withGuide) {
  const sheets = [];
  if (withGuide) {
    const g = [[{ v: 'วิธีกรอกแม่แบบนำเข้าข้อมูล ระบบจัดตารางสอนอัตโนมัติ', s: ST.title }], [],
      [{ v: 'ชีต', s: ST.head }, { v: 'คอลัมน์', s: ST.head }, { v: 'จำเป็น', s: ST.head }, { v: 'คำอธิบาย / ตัวอย่าง', s: ST.head }]];
    for (const s of SHEETS) for (const c of s.cols) g.push([{ v: s.title, s: ST.cell }, { v: c.label, s: ST.cell }, { v: c.req ? 'จำเป็น' : '', s: ST.center }, { v: [c.help, c.ex ? 'ตัวอย่าง: ' + c.ex : ''].filter(Boolean).join(' | '), s: ST.cell }]);
    g.push([], [{ v: 'หมายเหตุ', s: ST.bold }], ['- เวลาเรียน จันทร์-ศุกร์ 08.00-17.00 น. พักเที่ยง 12.00-13.00 น. (8 คาบ/วัน รวม 40 คาบ/สัปดาห์)'],
      ['- รูปแบบเวลา: จ 08.00-12.00; ศ 13.00-16.00 (วัน: จ อ พ พฤ ศ)'], ['- ครูทุกคนสอนอย่างน้อย 18 ชม. หัวหน้าแผนก 18-24 ชม.'],
      ['- ไม่ต้องแก้ชื่อชีตหรือหัวคอลัมน์ ลบแถวตัวอย่างแล้วกรอกข้อมูลจริงได้ทันที']);
    sheets.push({ name: 'คำอธิบาย', rows: g, cols: [16, 24, 10, 70] });
  }
  for (const s of SHEETS) {
    const r = rows[s.key];
    sheets.push({ name: s.title, rows: [r[0].map((v) => ({ v, s: ST.head })), ...r.slice(1).map((row) => row.map((v) => ({ v, s: ST.cell })))], cols: s.cols.map((c) => width(c.label + (c.ex || ''))), freeze: 1 });
  }
  return sheets;
}
const out = 'samples';
fs.writeFileSync(`${out}/template.xlsx`, await writeXlsx(workbook(templateRows(), true)));
const sets = { small: generateSample('small'), medium: generateSample('medium'), large: generateSample('large'), errors: generateErrorSample() };
for (const [k, v] of Object.entries(sets)) {
  fs.writeFileSync(`${out}/sample-${k}.xlsx`, await writeXlsx(workbook(v.rows, false)));
  const json = {}; for (const s of SHEETS) json[s.key] = v.rows[s.key].slice(1).map((r) => Object.fromEntries(s.cols.map((c, i) => [c.label, r[i] ?? ''])));
  fs.writeFileSync(`${out}/sample-${k}.json`, JSON.stringify(json, null, 1));
}
// CSV แม่แบบ (zip รวม 5 ไฟล์) และ CSV ตัวอย่างขนาดเล็ก
const zipCsv = async (rows, name) => { const z = new JSZip(); for (const s of SHEETS) z.file(`${s.title}.csv`, toCsv(rows[s.key])); fs.writeFileSync(`${out}/${name}`, await z.generateAsync({ type: 'uint8array' })); };
await zipCsv(templateRows(), 'template-csv.zip');
await zipCsv(sets.small.rows, 'sample-small-csv.zip');
const tj = {}; for (const s of SHEETS) tj[s.key] = [Object.fromEntries(s.cols.map((c) => [c.label, c.ex || '']))];
fs.writeFileSync(`${out}/template.json`, JSON.stringify(tj, null, 1));
console.log(fs.readdirSync(out).map((f) => f + ' ' + fs.statSync(`${out}/${f}`).size).join('\n'));
