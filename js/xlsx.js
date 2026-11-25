// อ่าน/เขียนไฟล์ Excel (.xlsx) ด้วย JSZip (ไม่พึ่งไลบรารีภายนอกอื่น)
const getZip = () => (typeof window !== 'undefined' ? window.JSZip : globalThis.JSZip);

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // ตัดอักขระควบคุมที่ XML ไม่รองรับ
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colToIdx = (ref) => {
  const m = ref.match(/^([A-Z]+)/);
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
export const idxToCol = (i) => {
  let s = ''; i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

function textOf(xml) {
  // รวมข้อความทุก <t> (รองรับ rich text)
  const out = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1] ? decode(m[1]) : '');
  return out.join('');
}

/** อ่านไฟล์ xlsx คืนค่า [{ name, rows: [[...]] }] */
export async function readXlsx(data) {
  const JSZip = getZip();
  const zip = await JSZip.loadAsync(data);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx) ที่ถูกต้อง');
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1], target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relMap[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const ssXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(m[0].match(/name="([^"]*)"/)?.[1] || '');
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const path = 'xl/' + (relMap[rid] || '');
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const rows = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const attrs = rm[1] || rm[3] || '';
      const rIdx = (+(attrs.match(/\br="(\d+)"/)?.[1] || rows.length + 1)) - 1;
      const row = [];
      const body = rm[2] || '';
      let auto = 0;
      for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ca = cm[1];
        const ref = ca.match(/\br="([A-Z]+\d+)"/)?.[1];
        const ci = ref ? colToIdx(ref) : auto;
        auto = ci + 1;
        const t = ca.match(/\bt="([^"]+)"/)?.[1];
        const inner = cm[2] || '';
        let v = '';
        if (t === 's') v = shared[+(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1)] ?? '';
        else if (t === 'inlineStr') v = textOf(inner);
        else {
          const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          v = raw == null ? '' : decode(raw);
          if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
          else if (!t || t === 'n') { const n = Number(v); if (v !== '' && Number.isFinite(n)) v = String(Math.round(n * 1e6) / 1e6); }
        }
        row[ci] = v;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = '';
      rows[rIdx] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}

// ===== เขียนไฟล์ =====
// สไตล์: 0 ปกติ, 1 หัวตาราง, 2 เส้นขอบ+ตัดบรรทัด, 3 หัวเรื่อง, 4 พักเที่ยง, 5 กลางมีเส้นขอบ, 6 ช่องวิชา, 7 ตัวหนา, 8 ตัวเลขมีเส้นขอบ
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="12"/><name val="TH Sarabun New"/><family val="2"/></font><font><b/><sz val="12"/><name val="TH Sarabun New"/><family val="2"/></font><font><b/><sz val="16"/><name val="TH Sarabun New"/><family val="2"/></font><font><sz val="11"/><color rgb="FF555555"/><name val="TH Sarabun New"/><family val="2"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3F0EF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7FAF9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9AA8A6"/></left><right style="thin"><color rgb="FF9AA8A6"/></right><top style="thin"><color rgb="FF9AA8A6"/></top><bottom style="thin"><color rgb="FF9AA8A6"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" textRotation="255"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export const ST = { normal: 0, head: 1, cell: 2, title: 3, lunch: 4, center: 5, subject: 6, bold: 7, num: 8 };

function sheetXml(sh) {
  const rowsXml = [];
  (sh.rows || []).forEach((row, ri) => {
    if (!row) return;
    const cells = [];
    const ht = sh.heights?.[ri];
    row.forEach((cell, ci) => {
      if (cell === undefined || cell === null) return;
      const o = typeof cell === 'object' ? cell : { v: cell };
      const ref = idxToCol(ci) + (ri + 1);
      const s = o.s ? ` s="${o.s}"` : '';
      if (o.v === '' || o.v === undefined || o.v === null) { if (o.s) cells.push(`<c r="${ref}"${s}/>`); return; }
      if (typeof o.v === 'number' && Number.isFinite(o.v)) cells.push(`<c r="${ref}"${s}><v>${o.v}</v></c>`);
      else cells.push(`<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`);
    });
    rowsXml.push(`<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells.join('')}</row>`);
  });
  const cols = sh.cols?.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const freeze = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  const land = sh.landscape ? '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' : '';
  const fit = sh.landscape ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${fit}${freeze}${cols}<sheetData>${rowsXml.join('')}</sheetData>${merges}${land}</worksheet>`;
}

export function safeSheetName(name, used) {
  let n = String(name).replace(/[\\/?*\[\]:]/g, '-').slice(0, 31) || 'Sheet';
  let k = 2, base = n;
  while (used.has(n)) { const suf = ` (${k++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n);
  return n;
}

/** sheets: [{ name, rows, cols?, merges?, freeze?, heights?, landscape? }] -> Uint8Array */
export async function writeXlsx(sheets, type = 'uint8array') {
  const JSZip = getZip();
  const zip = new JSZip();
  const used = new Set();
  const names = sheets.map((s) => safeSheetName(s.name, used));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>ตารางสอน</dc:title><dc:creator>ระบบจัดตารางสอนอัตโนมัติ</dc:creator></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Timetable</Application></Properties>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type, compression: 'DEFLATE' });
}

// ===== CSV =====
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
export function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}
