// นำเข้า PDF ที่มีตารางตามแม่แบบ (หัวคอลัมน์ตรงกับแม่แบบ) ด้วย pdf.js
import { SHEETS, SHEET_BY_KEY } from './model.js';

let pdfjs = null;
async function lib() {
  if (pdfjs) return pdfjs;
  if (globalThis.__PDFJS) return (pdfjs = globalThis.__PDFJS);
  const base = new URL('../lib/', import.meta.url);
  pdfjs = await import(new URL('pdf.min.mjs', base).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
  return pdfjs;
}

// เทียบหัวคอลัมน์แบบไม่สนใจวรรณยุกต์/สระบน-ล่าง (PDF บางไฟล์ถอดวรรณยุกต์หาย)
const norm = (s) => String(s ?? '').normalize('NFC').replace(/\u0E4D\u0E32/g, '\u0E33').replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').replace(/\s+/g, '').replace(/[()（）*]/g, '').toLowerCase();

// ===== อ่าน ActualText จากเนื้อหาหน้า (Chrome/Word ใช้เก็บข้อความไทยที่มีวรรณยุกต์) =====
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
function decodePdfString(tok) {
  if (tok.startsWith('<')) {
    const hex = tok.slice(1, -1).replace(/\s+/g, '');
    const bytes = hex.match(/.{1,2}/g)?.map((h) => parseInt(h.padEnd(2, '0'), 16)) || [];
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) { let r = ''; for (let i = 2; i + 1 < bytes.length; i += 2) r += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]); return r; }
    return String.fromCharCode(...bytes);
  }
  const body = tok.slice(1, -1).replace(/\\([nrtbf()\\]|\d{1,3})/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? (/\d/.test(c) ? String.fromCharCode(parseInt(c, 8)) : c)));
  if (body.charCodeAt(0) === 0xFE && body.charCodeAt(1) === 0xFF) { let r = ''; for (let i = 2; i + 1 < body.length; i += 2) r += String.fromCharCode((body.charCodeAt(i) << 8) | body.charCodeAt(i + 1)); return r; }
  return body;
}
async function actualTextByPage(data) {
  try {
    const d = latin1(data);
    const objs = new Map();
    for (const m of d.matchAll(/(\d+)\s+0\s+obj\b/g)) objs.set(+m[1], m.index);
    const obj = (n) => { const st = objs.get(n); if (st == null) return ''; const e = d.indexOf('endobj', st); return d.slice(st, e < 0 ? undefined : e); };
    const catRef = d.match(/\/Type\s*\/Catalog[\s\S]*?\/Pages\s+(\d+)\s+0\s+R/) || d.match(/\/Pages\s+(\d+)\s+0\s+R[\s\S]*?\/Type\s*\/Catalog/);
    if (!catRef) return null;
    const pages = [];
    const walk = (n, depth = 0) => {
      const o = obj(n);
      if (depth > 20) return;
      if (/\/Type\s*\/Pages\b/.test(o)) { const k = o.match(/\/Kids\s*\[([\s\S]*?)\]/); if (k) for (const r of k[1].matchAll(/(\d+)\s+0\s+R/g)) walk(+r[1], depth + 1); }
      else pages.push(o);
    };
    walk(+catRef[1]);
    const out = [];
    for (const po of pages) {
      const cm = po.match(/\/Contents\s*(\[[\s\S]*?\]|\d+\s+0\s+R)/);
      const refs = cm ? [...cm[1].matchAll(/(\d+)\s+0\s+R/g)].map((r) => +r[1]) : [];
      let text = '';
      for (const r of refs) {
        const o = obj(r), si = o.indexOf('stream');
        if (si < 0) continue;
        let st = objs.get(r) + si + 6;
        if (data[st] === 13) st++; if (data[st] === 10) st++;
        let en = d.lastIndexOf('endstream', objs.get(r) + o.length);
        const len = o.slice(0, si).match(/\/Length\s+(\d+)(?!\s+0\s+R)/);
        if (len && st + +len[1] <= en) en = st + +len[1];
        else while (en > st && (data[en - 1] === 10 || data[en - 1] === 13)) en--;
        let bytes = data.subarray(st, en);
        if (/\/FlateDecode/.test(o.slice(0, si))) bytes = await inflate(bytes);
        text += latin1(bytes) + '\n';
      }
      // รายการ BDC ตามลำดับ: ActualText หรือ null
      out.push([...text.matchAll(/(<<[\s\S]*?>>|\/[^\s/<>\[\]()]+)\s*BDC/g)].map((m) => {
        const a = m[1].match(/\/ActualText\s*(<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\))/);
        return a ? decodePdfString(a[1]) : null;
      }));
    }
    return out;
  } catch { return null; }
}

function matchHeader(items) {
  // หาตำแหน่งหัวคอลัมน์ในบรรทัด: ต่อข้อความทั้งบรรทัดแล้วค้นหาชื่อคอลัมน์ (ยาวก่อน ไม่ทับกัน)
  let str = '';
  const starts = items.map((it) => { const o = str.length; str += norm(it.text); return o; });
  const itemAt = (off) => { let k = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= off) k = i; return k; };
  let best = null;
  for (const sh of SHEETS) {
    const used = [];
    const cols = [];
    const cand = sh.cols.flatMap((c) => [c.label, ...c.alias].map((a) => ({ c, a: norm(a) }))).filter((x) => x.a.length >= 1).sort((x, y) => y.a.length - x.a.length);
    for (const { c, a } of cand) {
      if (cols.some((x) => x.key === c.key)) continue;
      let from = 0, pos = -1;
      while ((pos = str.indexOf(a, from)) >= 0) {
        if (!used.some(([u0, u1]) => pos < u1 && pos + a.length > u0)) break;
        from = pos + 1;
      }
      if (pos < 0) continue;
      // ต้องเริ่มตรงต้นชิ้นข้อความ
      const k = itemAt(pos);
      if (starts[k] !== pos) continue;
      used.push([pos, pos + a.length]);
      cols.push({ key: c.key, label: c.label, x: items[k].x });
    }
    const covered = used.reduce((t, [a, b]) => t + (b - a), 0);
    const req = sh.cols.filter((c) => c.req).every((c) => cols.some((x) => x.key === c.key));
    if (req && cols.length >= 2 && covered >= str.length * 0.85 && (!best || cols.length > best.cols.length)) best = { key: sh.key, cols };
  }
  return best;
}

/** อ่านไฟล์ PDF คืนค่า [{ name, rows }] เหมือนชีต Excel */
export async function readPdf(data, onProgress = () => {}) {
  const bytes = new Uint8Array(data);
  const actual = await actualTextByPage(bytes);
  const pdf = await (await lib()).getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const lines = [];
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    onProgress(pn, pdf.numPages);
    const page = await pdf.getPage(pn);
    const tc = await page.getTextContent({ includeMarkedContent: true });
    // แทนข้อความด้วย ActualText (ถ้ามี) เพื่อให้วรรณยุกต์ไทยครบ
    const acts = actual && actual[pn - 1];
    const nB = tc.items.filter((i) => i.type === 'beginMarkedContentProps').length;
    const useActs = acts && acts.length === nB;
    const raw = [];
    let bi = 0, span = null;
    for (const it of tc.items) {
      if (it.type === 'beginMarkedContentProps') { const t = useActs ? acts[bi] : null; bi++; span = t != null ? { text: t, first: null } : null; continue; }
      if (it.type === 'beginMarkedContent') { span = null; continue; }
      if (it.type === 'endMarkedContent') { span = null; continue; }
      if (it.str == null || it.str === '') continue;
      const o = { text: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 10 };
      if (span) {
        if (!o.text.trim()) { raw.push(o); continue; }
        if (!span.first) { span.first = o; o.text = span.text.trim(); raw.push(o); }
        else span.first.w = Math.max(span.first.w, o.x + o.w - span.first.x);
        continue;
      }
      raw.push(o);
    }
    const items = raw.filter((it) => it.text && it.text.trim() !== '');
    // จัดกลุ่มเป็นบรรทัดตามแกน y
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines = [];
    for (const it of items) {
      const ln = pageLines.find((l) => Math.abs(l.y - it.y) <= Math.max(2.5, it.h * 0.35));
      if (ln) ln.items.push(it); else pageLines.push({ y: it.y, items: [it] });
    }
    pageLines.sort((a, b) => b.y - a.y);
    for (const l of pageLines) { l.items.sort((a, b) => a.x - b.x); lines.push({ page: pn, items: l.items }); }
  }
  // หาหัวตารางแล้วแบ่งข้อมูลตามตำแหน่งคอลัมน์
  const sheets = {};
  let cur = null;
  for (const ln of lines) {
    if (!ln.items.length) continue;
    const hdr = matchHeader(ln.items);
    if (hdr) {
      const sh = SHEET_BY_KEY[hdr.key];
      cur = { key: hdr.key, cols: hdr.cols.sort((a, b) => a.x - b.x) };
      if (!sheets[hdr.key]) sheets[hdr.key] = { name: sh.title, rows: [cur.cols.map((c) => c.label)] };
      continue;
    }
    if (!cur) continue;
    const whole = ln.items.map((i) => i.text).join('');
    if (/^(ชีต|ตาราง|ข้อมูล)\s*[:：]/.test(whole.trim())) { cur = null; continue; }
    const row = new Array(cur.cols.length).fill('');
    const last = new Array(cur.cols.length).fill(null);
    for (const it of ln.items) {
      let idx = -1;
      for (let i = 0; i < cur.cols.length; i++) if (it.x >= cur.cols[i].x - 3) idx = i;
      if (idx < 0) idx = 0;
      const prev = last[idx];
      const sep = prev && it.x - (prev.x + prev.w) > it.h * 0.2 ? ' ' : '';
      row[idx] += sep + it.text;
      last[idx] = it;
    }
    if (row.some((v) => v.trim())) sheets[cur.key].rows.push(row.map((v) => v.trim()));
  }
  const out = Object.values(sheets);
  if (!out.length) throw new Error('ไม่พบตารางที่มีหัวคอลัมน์ตามแม่แบบในไฟล์ PDF');
  return out;
}
