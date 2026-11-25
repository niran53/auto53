// หน้าเว็บหลัก: นำเข้าข้อมูล -> จัดตาราง -> ตารางผลลัพธ์ -> ประวัติ
import { DAYS, PERIODS, NS } from './core.js';
import { SHEETS, SHEET_BY_KEY, detectSheet, rowsToRecords, buildModel, emptyRaw } from './model.js';
import { inspect, flatRows } from './checker.js';
import { readXlsx, parseCsv } from './xlsx.js';
import { generateSample, generateErrorSample, templateRows } from './samples.js';
import { gridHtml, summaryTableHtml, entityTitle, entityPlacements, exportExcel, exportCsv, download, esc, KINDS } from './export.js';
import * as store from './store.js';
import { CONFIG } from './config.js';

// ================= ไอคอน (SVG เส้น) =================
const P = {
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  retry: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

// ================= สถานะ =================
const LEVELS = { fast: { label: 'เร็ว', iter: 1500000 }, normal: { label: 'มาตรฐาน', iter: 4000000 }, deep: { label: 'ละเอียด', iter: 10000000 } };
const S = {
  raw: null, preIssues: [], sources: [], build: null,
  datasetId: null, datasetName: '', confirmed: false,
  run: { status: 'idle', pct: 0, stage: 0, logs: [], live: {}, history: [] },
  settings: { seed: 2568, level: 'normal', lockSeed: false },
  worker: null, result: null, runId: null, resultConfirmed: false,
  view: { tab: 'grid', kind: 'group', idx: 0, search: '', previewTab: 'teachers', previewSearch: '', previewLimit: 150, list: { q: '', day: '', g: '', t: '', r: '' } },
};
const SS_KEY = 'tt.current';
const saveCurrent = () => sessionStorage.setItem(SS_KEY, JSON.stringify({ datasetId: S.datasetId, runId: S.runId, settings: S.settings }));

// ================= เครื่องมือ =================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const main = () => $('#main');
const fmtN = (n) => Number(n || 0).toLocaleString('th-TH');
const fmtSec = (ms) => (ms / 1000).toFixed(2) + ' วินาที';
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast show ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), 3800);
}
function openModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
  setTimeout(() => $('#modal-body button, #modal-body input')?.focus(), 30);
}
const closeModal = () => { $('#modal').hidden = true; };
const sheetKeyByTitle = (title) => SHEETS.find((s) => s.title === title)?.key;

// ================= Router =================
const ROUTES = ['import', 'schedule', 'results', 'history'];
function route() {
  const r = (location.hash.replace(/^#\/?/, '') || 'import').split('?')[0];
  const name = ROUTES.includes(r) ? r : 'import';
  $$('.steps a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === name);
    a.classList.toggle('done', (a.dataset.route === 'import' && S.confirmed && name !== 'import') || (a.dataset.route === 'schedule' && !!S.result && name !== 'schedule') || (a.dataset.route === 'results' && S.resultConfirmed && name !== 'results'));
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (store.needLogin()) return renderLogin();
  ({ import: renderImport, schedule: renderSchedule, results: renderResults, history: renderHistory })[name]();
  main().focus({ preventScroll: true });
}
const go = (r) => { if (location.hash === '#/' + r) route(); else location.hash = '#/' + r; window.scrollTo({ top: 0 }); };

// ================= สถานะที่เก็บข้อมูล =================
function renderStoreStatus() {
  const el = $('#store-status');
  if (store.remoteEnabled()) { el.className = 'pill ok'; el.textContent = 'เชื่อมต่อฐานข้อมูล Supabase'; }
  else { el.className = 'pill info'; el.textContent = 'บันทึกในเครื่อง (ออฟไลน์)'; }
  const u = store.currentUser();
  const b = $('#btn-user');
  b.hidden = !u;
  if (u) { b.textContent = 'ออกจากระบบ'; b.title = u.email; }
}

// =====================================================================
// 1) นำเข้าข้อมูล
// =====================================================================
function renderImport() {
  const b = S.build;
  main().innerHTML = `
  <div class="page-head">
    <div><span class="step-tag">ขั้นตอนที่ 1</span><h1>นำเข้าข้อมูล</h1>
    <p>ดาวน์โหลดแม่แบบ กรอกข้อมูลครู ห้องเรียน กลุ่มเรียน รายวิชา และการลงทะเบียน แล้วนำเข้าไฟล์ ระบบจะตรวจข้อผิดพลาดและแสดงพรีวิวให้ตรวจก่อนกดยืนยัน</p></div>
  </div>
  <div class="grid-2">
    <section class="card" aria-labelledby="h-tpl">
      <div class="card-head"><h2 id="h-tpl">แม่แบบและชุดข้อมูลตัวอย่าง</h2></div>
      <div class="tpl-list">
        <div class="tpl-item"><span class="ftype xlsx">XLSX</span><div><b>แม่แบบ Excel</b><small>5 ชีต พร้อมคำอธิบายการกรอกทุกคอลัมน์ (แนะนำ)</small></div><a class="btn sm" href="samples/template.xlsx" download="แม่แบบนำเข้าข้อมูล.xlsx">${ic('download')}ดาวน์โหลด</a></div>
        <div class="tpl-item"><span class="ftype csv">CSV</span><div><b>แม่แบบ CSV</b><small>ไฟล์ ZIP รวม 5 ไฟล์ นำเข้าได้ทั้ง ZIP หรือเลือกหลายไฟล์</small></div><a class="btn sm" href="samples/template-csv.zip" download="แม่แบบนำเข้าข้อมูล-csv.zip">${ic('download')}ดาวน์โหลด</a></div>
        <div class="tpl-item"><span class="ftype json">JSON</span><div><b>แม่แบบ JSON</b><small>สำหรับส่งข้อมูลจากระบบอื่น</small></div><a class="btn sm" href="samples/template.json" download="แม่แบบนำเข้าข้อมูล.json">${ic('download')}ดาวน์โหลด</a></div>
        <div class="tpl-item"><span class="ftype pdf">PDF</span><div><b>แม่แบบ PDF</b><small>พิมพ์ตารางเปล่าไปกรอก หรือบันทึกเป็น PDF แล้วนำเข้า</small></div><button class="btn sm" data-act="tpl-pdf">${ic('print')}เปิดแม่แบบ</button></div>
      </div>
      <h3 style="margin-top:18px">ชุดข้อมูลตัวอย่างสำหรับทดสอบ</h3>
      <div class="sample-btns">
        <button class="btn sample-btn" data-sample="small">ขนาดเล็ก<small>4 กลุ่ม · ครู 6 คน · 128 คาบ</small></button>
        <button class="btn sample-btn" data-sample="medium">ขนาดกลาง<small>10 กลุ่ม · ครู 15 คน · 317 คาบ</small></button>
        <button class="btn sample-btn" data-sample="large">ขนาดใหญ่<small>24 กลุ่ม · ครู 36 คน · 758 คาบ</small></button>
        <button class="btn sample-btn danger" data-sample="errors">ข้อมูลมีข้อผิดพลาด<small>สาธิตการแจ้งเตือนและวิธีแก้</small></button>
      </div>
      <p class="muted" style="margin-top:10px;font-size:.88rem">ดาวน์โหลดไฟล์ตัวอย่าง: <a href="samples/sample-small.xlsx" download>เล็ก</a> · <a href="samples/sample-medium.xlsx" download>กลาง</a> · <a href="samples/sample-large.xlsx" download>ใหญ่</a> · <a href="samples/sample-errors.xlsx" download>มีข้อผิดพลาด</a> · <a href="samples/sample-small.pdf" download>PDF เล็ก</a></p>
    </section>
    <section class="card" aria-labelledby="h-up">
      <div class="card-head"><h2 id="h-up">นำเข้าไฟล์</h2>${S.raw ? `<button class="btn sm danger" data-act="clear">${ic('trash')}ล้างข้อมูล</button>` : ''}</div>
      <label class="dropzone" id="drop" tabindex="0">
        ${ic('upload')}
        <strong>ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์</strong>
        <span class="muted">เลือกได้หลายไฟล์พร้อมกัน ระบบจะแยกชีตให้อัตโนมัติ</span>
        <div class="formats"><span>Excel .xlsx</span><span>CSV</span><span>ZIP (CSV)</span><span>JSON</span><span>PDF ตามแม่แบบ</span></div>
        <input type="file" id="file" multiple accept=".xlsx,.csv,.tsv,.txt,.json,.pdf,.zip" hidden>
      </label>
      <div class="file-chips" id="chips">${S.sources.map((s) => `<span class="file-chip">${ic('file')}${esc(s)}</span>`).join('')}</div>
      <p class="muted" style="margin-top:12px;font-size:.9rem">ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะกด <b>ยืนยันข้อมูลนำเข้า</b> ด้านล่าง</p>
    </section>
  </div>
  <div id="import-result">${b ? importResultHtml() : ''}</div>`;

  const drop = $('#drop'), file = $('#file');
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  file.addEventListener('change', () => { if (file.files.length) handleFiles([...file.files]); file.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])]; if (f.length) handleFiles(f); });
  $$('[data-sample]').forEach((btn) => btn.addEventListener('click', () => loadSample(btn.dataset.sample)));
  main().querySelector('[data-act="tpl-pdf"]').addEventListener('click', printTemplate);
  main().querySelector('[data-act="clear"]')?.addEventListener('click', () => { Object.assign(S, { raw: null, build: null, sources: [], preIssues: [], confirmed: false }); renderImport(); });
  if (b) bindImportResult();
}

function importResultHtml() {
  const { issues, summary } = S.build;
  const errs = issues.filter((i) => i.level === 'error'), warns = issues.filter((i) => i.level === 'warn');
  const issueHtml = (i, n) => `<button class="issue ${i.level}" data-issue="${n}">
      <span class="badge ${i.level === 'error' ? 'err' : 'warn'}">${i.level === 'error' ? 'ผิดพลาด' : 'คำเตือน'}</span>
      <span><span class="where">${esc(i.sheet || '')}${i.row ? ` · แถวที่ ${i.row}` : ''}${i.col ? ` · คอลัมน์ "${esc(i.col)}"` : ''}${i.src && i.src !== i.sheet ? ` · ${esc(i.src)}` : ''}</span><br><span class="msg">${esc(i.msg)}</span></span>
      ${i.fix ? `<span class="fix"><b>วิธีแก้:</b> ${esc(i.fix)}</span>` : ''}
    </button>`;
  const errCount = (key) => issues.filter((i) => i.level === 'error' && sheetKeyByTitle(i.sheet) === key && i.row).length;
  const v = S.view;
  return `
  <section class="card" aria-labelledby="h-chk">
    <div class="card-head"><h2 id="h-chk">ผลการตรวจข้อมูล</h2>
      <span class="pill ${errs.length ? 'err' : warns.length ? 'warn' : 'ok'}">${errs.length ? `พบข้อผิดพลาด ${errs.length} รายการ` : warns.length ? `ผ่าน มีคำเตือน ${warns.length} รายการ` : 'ข้อมูลถูกต้องครบถ้วน'}</span></div>
    <div class="stats">
      <div class="stat"><div class="v">${fmtN(summary.teachers)}</div><div class="l">ครู (คน)</div></div>
      <div class="stat"><div class="v">${fmtN(summary.rooms)}</div><div class="l">ห้องเรียน (ห้อง)</div></div>
      <div class="stat"><div class="v">${fmtN(summary.groups)}</div><div class="l">กลุ่มเรียน (กลุ่ม)</div></div>
      <div class="stat"><div class="v">${fmtN(summary.subjects)}</div><div class="l">รายวิชา (วิชา)</div></div>
      <div class="stat"><div class="v">${fmtN(summary.assignments)}</div><div class="l">รายการลงทะเบียน</div></div>
      <div class="stat info"><div class="v">${fmtN(summary.periods)}</div><div class="l">คาบที่ต้องจัด/สัปดาห์</div></div>
      <div class="stat ${errs.length ? 'err' : 'ok'}"><div class="v">${errs.length}</div><div class="l">ข้อผิดพลาด</div></div>
      <div class="stat ${warns.length ? 'warn' : ''}"><div class="v">${warns.length}</div><div class="l">คำเตือน</div></div>
    </div>
    <div style="margin-top:14px">
      ${issues.length ? `<p class="muted" style="font-size:.9rem">กดที่รายการเพื่อไปยังแถวที่มีปัญหาในพรีวิว แก้ไขในไฟล์แล้วนำเข้าใหม่</p><div class="issues">${[...errs, ...warns].map((i) => issueHtml(i, issues.indexOf(i))).join('')}</div>`
      : `<div class="all-good">${ic('check')}ไม่พบข้อผิดพลาด: ไม่มีรหัสซ้ำ ไม่มีการอ้างถึงข้อมูลที่ไม่มีอยู่ ห้องเพียงพอ และเวลาไม่ซ้อนกัน</div>`}
    </div>
  </section>
  <section class="card" aria-labelledby="h-prev">
    <div class="card-head"><h2 id="h-prev">พรีวิวข้อมูลที่ระบบอ่านได้</h2><button class="btn sm" data-act="print-data">${ic('print')}พิมพ์ข้อมูลเป็น PDF</button></div>
    <div class="tabs" role="tablist">${SHEETS.map((s) => `<button role="tab" data-ptab="${s.key}" class="${v.previewTab === s.key ? 'active' : ''}" aria-selected="${v.previewTab === s.key}">${s.title}<span class="cnt ${errCount(s.key) ? 'err' : ''}">${(S.raw[s.key] || []).length}</span></button>`).join('')}</div>
    <div class="toolbar"><div class="search">${ic('search')}<input type="search" id="psearch" placeholder="ค้นหาในชีตนี้" value="${esc(v.previewSearch)}" aria-label="ค้นหาในพรีวิว"></div><span class="muted" id="pcount"></span></div>
    <div class="table-wrap" id="ptable"></div>
  </section>
  <div class="confirm-bar">
    <div>${errs.length ? `<b style="color:var(--err)">ยังยืนยันไม่ได้:</b> แก้ข้อผิดพลาด ${errs.length} รายการก่อน` : S.confirmed ? `<b style="color:var(--ok)">ยืนยันข้อมูลแล้ว</b> · ${esc(S.datasetName)}` : `<b>พร้อมบันทึก</b> · ${fmtN(summary.periods)} คาบ จาก ${fmtN(summary.groups)} กลุ่มเรียน${warns.length ? ` (มีคำเตือน ${warns.length})` : ''}`}</div>
    <div class="btn-row">${S.confirmed ? `<button class="btn primary lg" data-act="to-schedule">ไปหน้าจัดตาราง ${ic('right')}</button>` : `<button class="btn primary lg" data-act="confirm" ${errs.length ? 'disabled' : ''}>${ic('check')}ยืนยันข้อมูลนำเข้า</button>`}</div>
  </div>`;
}

function renderPreviewTable() {
  const v = S.view, key = v.previewTab, sh = SHEET_BY_KEY[key];
  const recs = S.raw[key] || [];
  const errRows = new Map();
  S.build.issues.forEach((i) => { if (i.level === 'error' && i.row && sheetKeyByTitle(i.sheet) === key) errRows.set(i.row, (errRows.get(i.row) || []).concat(i.msg)); });
  const q = v.previewSearch.trim().toLowerCase();
  const filtered = q ? recs.filter((r) => sh.cols.some((c) => String(r[c.key]).toLowerCase().includes(q))) : recs;
  const shown = filtered.slice(0, v.previewLimit);
  $('#pcount').textContent = `แสดง ${fmtN(shown.length)} จาก ${fmtN(filtered.length)} แถว${q ? ` (ทั้งหมด ${fmtN(recs.length)})` : ''}`;
  $('#ptable').innerHTML = `<table class="data"><thead><tr><th>แถว</th>${sh.cols.map((c) => `<th>${esc(c.label)}${c.req ? ' *' : ''}</th>`).join('')}</tr></thead><tbody>
    ${shown.map((r) => `<tr data-row="${r._row}" class="${errRows.has(r._row) ? 'row-err' : ''}" ${errRows.has(r._row) ? `title="${esc(errRows.get(r._row).join(' / '))}"` : ''}><td class="rownum">${r._row}</td>${sh.cols.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}
    ${!shown.length ? `<tr><td colspan="${sh.cols.length + 1}" class="more-row muted">ไม่มีข้อมูล</td></tr>` : ''}
  </tbody></table>${filtered.length > shown.length ? `<div class="more-row"><button class="btn sm" id="pmore">แสดงเพิ่ม</button></div>` : ''}`;
  $('#pmore')?.addEventListener('click', () => { v.previewLimit += 300; renderPreviewTable(); });
}

function bindImportResult() {
  renderPreviewTable();
  $$('[data-ptab]').forEach((b) => b.addEventListener('click', () => {
    S.view.previewTab = b.dataset.ptab; S.view.previewLimit = 150;
    $$('[data-ptab]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
    renderPreviewTable();
  }));
  $('#psearch').addEventListener('input', (e) => { S.view.previewSearch = e.target.value; S.view.previewLimit = 150; renderPreviewTable(); });
  $$('[data-issue]').forEach((b) => b.addEventListener('click', () => {
    const iss = S.build.issues[+b.dataset.issue];
    const key = sheetKeyByTitle(iss.sheet);
    if (!key) return;
    S.view.previewTab = key; S.view.previewSearch = ''; S.view.previewLimit = 100000;
    $('#psearch').value = '';
    $$('[data-ptab]').forEach((x) => { x.classList.toggle('active', x.dataset.ptab === key); x.setAttribute('aria-selected', x.dataset.ptab === key); });
    renderPreviewTable();
    const tr = iss.row && $(`#ptable tr[data-row="${iss.row}"]`);
    $('#h-prev').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (tr) { setTimeout(() => { tr.scrollIntoView({ block: 'center', behavior: 'smooth' }); tr.classList.add('row-flash'); }, 350); }
  }));
  main().querySelector('[data-act="confirm"]')?.addEventListener('click', confirmImport);
  main().querySelector('[data-act="to-schedule"]')?.addEventListener('click', () => go('schedule'));
  main().querySelector('[data-act="print-data"]').addEventListener('click', printDataPdf);
}

function rebuild() {
  S.build = buildModel(S.raw, S.preIssues);
  S.confirmed = false; S.datasetId = null;
}

async function handleFiles(files) {
  const raw = S.raw ? { ...S.raw } : emptyRaw();
  const pre = S.raw ? [...S.preIssues] : [];
  const names = [];
  const status = $('#chips');
  status.innerHTML = '<span class="file-chip">กำลังอ่านไฟล์...</span>';
  const addSheet = (name, rows, src) => {
    if (/^(คำอธิบาย|วิธีกรอก|readme|instructions?)$/i.test(name.trim())) return;
    const key = detectSheet(name, rows);
    if (!key) {
      if (rows.some((r) => r.some((c) => String(c).trim()))) pre.push({ level: 'warn', sheet: name, src, msg: `ไม่รู้จักชีต/ไฟล์ "${name}" จึงข้ามไป`, fix: 'ตั้งชื่อชีตและหัวคอลัมน์ตามแม่แบบ (ครู, ห้องเรียน, กลุ่มเรียน, รายวิชา, การลงทะเบียน)' });
      return;
    }
    const { records, issues } = rowsToRecords(key, rows, src);
    if (raw[key]?.length && S.raw !== null) pre.push({ level: 'warn', sheet: SHEET_BY_KEY[key].title, src, msg: `ข้อมูลชีต "${SHEET_BY_KEY[key].title}" ถูกแทนที่ด้วยไฟล์ ${src}`, fix: 'ถ้าไม่ต้องการ ให้กด "ล้างข้อมูล" แล้วนำเข้าใหม่' });
    for (let i = pre.length - 1; i >= 0; i--) if (pre[i].sheet === SHEET_BY_KEY[key].title && /ไม่พบ/.test(pre[i].msg)) pre.splice(i, 1);
    raw[key] = records; pre.push(...issues);
  };
  const readOne = async (name, data) => {
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'xlsx') (await readXlsx(data)).forEach((s) => addSheet(s.name, s.rows, `${name} › ${s.name}`));
    else if (['csv', 'tsv', 'txt'].includes(ext)) addSheet(name.replace(/\.[^.]+$/, ''), parseCsv(new TextDecoder('utf-8').decode(data)), name);
    else if (ext === 'json') {
      const j = JSON.parse(new TextDecoder('utf-8').decode(data));
      for (const [k, v] of Object.entries(j)) {
        if (!Array.isArray(v)) continue;
        const sh = SHEET_BY_KEY[k] || SHEETS.find((s) => s.title === k);
        let rows;
        if (v.length && !Array.isArray(v[0])) {
          const cols = [...new Set(v.flatMap((o) => Object.keys(o)))];
          rows = [cols, ...v.map((o) => cols.map((c) => o[c] ?? ''))];
        } else rows = v;
        addSheet(sh ? sh.title : k, rows, `${name} › ${k}`);
      }
    } else if (ext === 'pdf') {
      const { readPdf } = await import('./pdfimport.js');
      (await readPdf(data, (p, n) => (status.innerHTML = `<span class="file-chip">กำลังอ่าน PDF หน้า ${p}/${n}</span>`))).forEach((s) => addSheet(s.name, s.rows, `${name} › ${s.name}`));
    } else if (ext === 'zip') {
      const zip = await window.JSZip.loadAsync(data);
      for (const f of Object.values(zip.files)) if (!f.dir && /\.(csv|xlsx|json|tsv)$/i.test(f.name)) await readOne(f.name.split('/').pop(), await f.async('uint8array'));
    } else throw new Error('ไม่รองรับไฟล์ชนิดนี้ (รองรับ .xlsx .csv .json .pdf .zip)');
  };
  for (const f of files) {
    try {
      await readOne(f.name, new Uint8Array(await f.arrayBuffer()));
      names.push(f.name);
    } catch (err) {
      pre.push({ level: 'error', sheet: 'ไฟล์', src: f.name, msg: `อ่านไฟล์ "${f.name}" ไม่ได้: ${err.message}`, fix: 'ตรวจว่าไฟล์ไม่เสียหาย และเป็นชนิดที่รองรับ หรือดาวน์โหลดแม่แบบแล้วกรอกใหม่' });
    }
  }
  S.raw = raw; S.preIssues = pre; S.sources = [...new Set([...(S.sources || []), ...names])];
  S.datasetName = names.join(', ') || S.datasetName;
  S.view.previewSearch = ''; S.view.previewLimit = 150;
  rebuild();
  const firstErr = S.build.issues.find((i) => i.level === 'error' && sheetKeyByTitle(i.sheet));
  S.view.previewTab = firstErr ? sheetKeyByTitle(firstErr.sheet) : 'teachers';
  renderImport();
  const e = S.build.summary.errors;
  toast(e ? `อ่านไฟล์แล้ว พบข้อผิดพลาด ${e} รายการ` : 'อ่านไฟล์สำเร็จ ตรวจสอบพรีวิวแล้วกดยืนยัน', e ? 'err' : 'ok');
  setTimeout(() => $('#h-chk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function loadSample(kind) {
  const { label, rows } = kind === 'errors' ? generateErrorSample() : generateSample(kind);
  const raw = emptyRaw(), pre = [];
  for (const s of SHEETS) { const r = rowsToRecords(s.key, rows[s.key], s.title); raw[s.key] = r.records; pre.push(...r.issues); }
  Object.assign(S, { raw, preIssues: pre, sources: [`ชุดข้อมูลตัวอย่าง${label}`], datasetName: `ชุดข้อมูลตัวอย่าง${label}` });
  S.view.previewSearch = ''; S.view.previewLimit = 150;
  rebuild();
  const firstErr = S.build.issues.find((i) => i.level === 'error' && sheetKeyByTitle(i.sheet));
  S.view.previewTab = firstErr ? sheetKeyByTitle(firstErr.sheet) : 'teachers';
  renderImport();
  toast(`โหลดชุดข้อมูลตัวอย่าง${label}แล้ว`, S.build.summary.errors ? 'err' : 'ok');
  setTimeout(() => $('#h-chk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

async function confirmImport() {
  if (!S.build || S.build.summary.errors) return;
  const btn = main().querySelector('[data-act="confirm"]');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  try {
    S.datasetId = await store.saveDataset({ name: S.datasetName || 'ชุดข้อมูล', summary: S.build.summary, raw: S.raw });
    S.confirmed = true; S.result = null; S.runId = null; S.resultConfirmed = false;
    S.run = { status: 'idle', pct: 0, stage: 0, logs: [], live: {}, history: [] };
    saveCurrent();
    toast('ยืนยันข้อมูลนำเข้าแล้ว', 'ok');
    go('schedule');
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message, 'err');
    btn.disabled = false; btn.textContent = 'ยืนยันข้อมูลนำเข้า';
  }
}

// =====================================================================
// 2) จัดตาราง
// =====================================================================
const STAGES = [
  ['วิเคราะห์ข้อมูล', 'Planner'], ['แบ่งครูผู้สอน', 'Planner'], ['วางตารางเริ่มต้น', 'Builder'], ['ปรับปรุงแก้ข้อขัดแย้ง', 'Repairer'], ['ตรวจสอบผล', 'Inspector'],
];
const STATE_TXT = { idle: 'พร้อมจัดตาราง', running: 'กำลังคำนวณ...', done: 'จัดตารางเสร็จสิ้น', cancelled: 'ยกเลิกแล้ว', error: 'เกิดข้อผิดพลาด' };

function renderSchedule() {
  if (!S.confirmed || !S.build) {
    main().innerHTML = `<div class="page-head"><div><span class="step-tag">ขั้นตอนที่ 2</span><h1>จัดตาราง</h1></div></div>
      <section class="card empty-state">${ic('table')}<h2>ยังไม่มีข้อมูลที่ยืนยันแล้ว</h2><p class="muted">นำเข้าข้อมูลและกด "ยืนยันข้อมูลนำเข้า" ก่อน</p><button class="btn primary" data-go="import">${ic('upload')}ไปหน้านำเข้าข้อมูล</button></section>`;
    main().querySelector('[data-go]').addEventListener('click', () => go('import'));
    return;
  }
  const sm = S.build.summary, st = S.settings;
  main().innerHTML = `
  <div class="page-head">
    <div><span class="step-tag">ขั้นตอนที่ 2</span><h1>จัดตาราง</h1>
    <p>กด <b>จัดตาราง</b> เพื่อเริ่มคำนวณ ระหว่างคำนวณดูความคืบหน้าได้ กด <b>ยกเลิก</b> เพื่อหยุด หรือ <b>ลองใหม่</b> เพื่อคำนวณอีกรอบด้วยค่าสุ่ม (seed) ใหม่ เมื่อเสร็จกด <b>เปิดดูผล</b></p></div>
    <span class="pill info">${esc(S.datasetName)} · ครู ${sm.teachers} · ห้อง ${sm.rooms} · กลุ่ม ${sm.groups} · ${fmtN(sm.periods)} คาบ</span>
  </div>
  <div class="control">
    <section class="card" aria-labelledby="h-ctl">
      <div class="card-head"><h2 id="h-ctl">ควบคุมการจัดตาราง</h2></div>
      <div class="big-actions">
        <button class="btn primary" id="b-run">${ic('play')}จัดตาราง</button>
        <button class="btn danger" id="b-cancel">${ic('stop')}ยกเลิก</button>
        <button class="btn" id="b-retry">${ic('retry')}ลองใหม่</button>
        <button class="btn ok" id="b-view">${ic('eye')}เปิดดูผล</button>
      </div>
      <div class="settings">
        <div class="field"><label for="seed">ค่าสุ่ม (Seed)</label><div class="seed-row"><input type="number" id="seed" value="${st.seed}" min="1" max="999999999"><button class="btn sm" id="b-dice" title="สุ่ม seed ใหม่" aria-label="สุ่ม seed ใหม่">${ic('dice')}</button></div></div>
        <div class="field"><label for="level">ความละเอียดการค้นหา</label><select id="level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${st.level === k ? 'selected' : ''}>${v.label} (${fmtN(v.iter)} รอบ)</option>`).join('')}</select></div>
        <label class="check" style="min-height:44px"><input type="checkbox" id="lock" ${st.lockSeed ? 'checked' : ''}>"ลองใหม่" ใช้ seed เดิม (ทดสอบทำซ้ำ)</label>
      </div>
      <p class="muted" style="font-size:.86rem;margin-top:8px">seed และจำนวนรอบเดียวกัน จะได้ตารางเหมือนเดิมทุกครั้ง จึงตรวจสอบและทำซ้ำผลได้</p>
      <div class="status-box" id="status" aria-live="polite"></div>
    </section>
    <div>
      <section class="card" aria-labelledby="h-pri">
        <div class="card-head"><h2 id="h-pri">ระบบพิจารณาอะไร และลำดับความสำคัญ</h2></div>
        <ol class="priority">
          <li><span><b>เงื่อนไขบังคับ (Hard)</b> ครู กลุ่มเรียน และห้องต้องไม่ชนกัน ลูกเสือ พ 15.00-17.00 น. ที่สนามโดยครูที่ปรึกษา ห้องตรงประเภทและจุนักเรียนได้ เรียน 08.00-17.00 น. พักเที่ยงพร้อมกัน</span></li>
          <li><span><b>ภาระสอนครู</b> ทุกคนอย่างน้อย 18 ชม. หัวหน้าแผนก 18-24 ชม. ครูแผนกคอมพิวเตอร์มีสอนทุกวัน</span></li>
          <li><span><b>เวลาครูที่ขอว่าง</b> เช่น ครูเมธา จ 08.00-12.00 น. และ ศ 13.00-16.00 น. (ถ้าเป็นไปได้)</span></li>
          <li><span><b>ความต่อเนื่องของวิชา</b> คาบวิชาเดียวกันติดกัน และเรียนจบในวันเดียว</span></li>
          <li><span><b>ความสมดุลและความสะดวก</b> ครูประจำภาระใกล้เคียงกัน ลดเวลาว่างคั่นระหว่างวิชาของนักเรียน</span></li>
        </ol>
        <p class="muted" style="font-size:.86rem;margin:10px 0 0">น้ำหนักคะแนน: บังคับ 1,000 · เวลาไม่สะดวก 8/คาบ · แยกวัน 4/วัน · ภาระไม่สมดุล 3/ชม. · ว่างคั่น 2/คาบ</p>
      </section>
      <section class="card" aria-labelledby="h-ag">
        <div class="card-head"><h2 id="h-ag">การทำงานแบบเอเยนต์ (Plan - Act - Check)</h2></div>
        <div class="agents">
          <div class="agent"><b>Planner</b><small>วิเคราะห์ข้อมูล แบ่งครูผู้สอนตามภาระ จัดลำดับรายการที่จัดยากก่อน</small></div>
          <div class="agent"><b>Builder</b><small>วางตารางเริ่มต้นแบบ Greedy เลือกช่องเวลาและห้องที่ชนน้อยที่สุด</small></div>
          <div class="agent"><b>Repairer</b><small>Simulated Annealing + Min-Conflicts ย้าย สลับ เปลี่ยนห้อง/ครู จนไม่ชน</small></div>
          <div class="agent"><b>Inspector</b><small>ตรวจผลแบบอิสระตามเงื่อนไข 18 ข้อ และคำนวณตัวชี้วัด</small></div>
        </div>
      </section>
    </div>
  </div>`;
  $('#seed').addEventListener('change', (e) => { S.settings.seed = Math.max(1, parseInt(e.target.value, 10) || 1); saveCurrent(); });
  $('#level').addEventListener('change', (e) => { S.settings.level = e.target.value; saveCurrent(); });
  $('#lock').addEventListener('change', (e) => { S.settings.lockSeed = e.target.checked; saveCurrent(); });
  $('#b-dice').addEventListener('click', () => { S.settings.seed = randomSeed(); $('#seed').value = S.settings.seed; saveCurrent(); });
  $('#b-run').addEventListener('click', () => startRun());
  $('#b-cancel').addEventListener('click', cancelRun);
  $('#b-retry').addEventListener('click', () => { if (!S.settings.lockSeed) { S.settings.seed = randomSeed(); $('#seed').value = S.settings.seed; } startRun(); });
  $('#b-view').addEventListener('click', () => go('results'));
  updateStatus(true);
}
const randomSeed = () => 1 + Math.floor(Math.random() * 999999);

function updateStatus(full = false) {
  const box = $('#status');
  if (!box) return;
  const R = S.run, running = R.status === 'running';
  $('#b-run').disabled = running;
  $('#b-cancel').disabled = !running;
  $('#b-retry').disabled = running || R.status === 'idle';
  $('#b-view').disabled = running || !S.result;
  $('#seed').disabled = running; $('#level').disabled = running;
  const L = R.live || {};
  const ins = S.result?.inspection;
  const stageHtml = STAGES.map(([t, a], i) => {
    const n = i + 1;
    const cls = R.status === 'done' || n < R.stage ? 'fin' : n === R.stage && running ? 'cur' : '';
    return `<li class="${cls}"><b>${n}. ${t}</b>${a}</li>`;
  }).join('');
  const doneLine = R.status === 'done' && ins
    ? `<div class="${ins.hardTotal ? 'pill err' : 'pill ok'}" style="margin-top:12px">${ins.hardTotal ? `ข้อขัดแย้งบังคับ ${ins.hardTotal} จุด` : 'ไม่มีข้อขัดแย้งบังคับ'} · ลงครบ ${fmtN(ins.completeness.placed)}/${fmtN(ins.completeness.required)} คาบ · ใช้เวลา ${fmtSec(S.result.meta.elapsedMs)}</div>` : '';
  const html = `
    <div class="status-line"><span class="state ${R.status}">${STATE_TXT[R.status]}</span><span class="pct">${Math.round(R.pct)}%</span></div>
    <div class="progress ${R.status}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(R.pct)}" aria-label="ความคืบหน้า"><i style="width:${R.pct}%"></i></div>
    ${doneLine}
    <ol class="stages">${stageHtml}</ol>
    <div class="live">
      <div class="stat"><div class="v">${L.elapsed != null ? (L.elapsed / 1000).toFixed(1) + ' วิ' : '-'}</div><div class="l">เวลาที่ใช้</div></div>
      <div class="stat"><div class="v">${L.iter != null ? fmtN(L.iter) : '-'}</div><div class="l">รอบการค้นหา</div></div>
      <div class="stat ${L.bestHard > 0 ? 'err' : L.bestHard === 0 ? 'ok' : ''}"><div class="v">${L.bestHard ?? '-'}</div><div class="l">ข้อขัดแย้งบังคับ (ดีที่สุด)</div></div>
      <div class="stat"><div class="v">${L.best != null ? fmtN(Math.round(L.best % 1000)) : '-'}</div><div class="l">คะแนนโทษยืดหยุ่น</div></div>
    </div>
    ${R.history.length > 1 ? `<div style="margin-top:12px"><div class="muted" style="font-size:.85rem">กราฟการลดลงของต้นทุน (สเกลลอการิทึม)</div>${chartSvg(R.history)}</div>` : ''}
    <div class="log" id="log">${R.logs.length ? R.logs.map((l) => `<div><span>${(l.t / 1000).toFixed(2)}s</span>${esc(l.msg)}</div>`).join('') : '<div>ยังไม่เริ่มการคำนวณ</div>'}</div>`;
  box.innerHTML = html;
  const lg = $('#log'); lg.scrollTop = lg.scrollHeight;
}

function chartSvg(hist) {
  const W = 600, H = 140, pad = 26;
  const xs = hist.map((h) => h.t), ys = hist.map((h) => Math.log10(1 + Math.max(0, h.cost)));
  const xmax = Math.max(1, ...xs), ymax = Math.max(1, ...ys);
  const pts = hist.map((h, i) => `${pad + (xs[i] / xmax) * (W - pad - 8)},${H - pad + 6 - (ys[i] / ymax) * (H - pad - 10)}`).join(' ');
  const last = hist[hist.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="ต้นทุนลดลงจาก ${fmtN(Math.round(hist[0].cost))} เหลือ ${fmtN(Math.round(last.cost))}">
    <line x1="${pad}" y1="${H - pad + 6}" x2="${W - 8}" y2="${H - pad + 6}" stroke="#c9d5d1"/><line x1="${pad}" y1="6" x2="${pad}" y2="${H - pad + 6}" stroke="#c9d5d1"/>
    <polyline points="${pts}" fill="none" stroke="#2f6f73" stroke-width="2.5" stroke-linejoin="round"/>
    <text x="${pad + 4}" y="16" font-size="11" fill="#637275">ต้นทุน ${fmtN(Math.round(hist[0].cost))}</text>
    <text x="${W - 10}" y="${H - pad - 2}" font-size="11" fill="#2f6f73" text-anchor="end">${fmtN(Math.round(last.cost))} (ข้อขัดแย้งบังคับ ${last.hard})</text>
    <text x="${W - 10}" y="${H - 4}" font-size="11" fill="#637275" text-anchor="end">${(xmax / 1000).toFixed(1)} วินาที</text>
  </svg>`;
}

function startRun() {
  if (!S.build || S.run.status === 'running') return;
  S.settings.seed = Math.max(1, parseInt($('#seed')?.value, 10) || S.settings.seed);
  saveCurrent();
  const maxIter = LEVELS[S.settings.level].iter;
  S.run = { status: 'running', pct: 0, stage: 1, logs: [], live: {}, history: [], seed: S.settings.seed, maxIter, t0: performance.now() };
  S.result = null; S.runId = null; S.resultConfirmed = false;
  updateStatus();
  let w;
  try { w = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' }); }
  catch (err) { S.run.status = 'error'; S.run.logs.push({ t: 0, msg: 'เปิดตัวประมวลผลไม่ได้: ' + err.message }); updateStatus(); return; }
  S.worker = w;
  let lastPaint = 0;
  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'log') { S.run.logs.push({ t: m.t, msg: m.msg }); if (S.run.logs.length > 200) S.run.logs.shift(); }
    else if (m.type === 'progress') {
      S.run.stage = m.stage; S.run.pct = Math.min(95, m.pct);
      S.run.live = { ...S.run.live, elapsed: m.elapsed, iter: m.iter ?? S.run.live.iter, best: m.best ?? S.run.live.best, bestHard: m.bestHard ?? (m.hard ?? S.run.live.bestHard) };
      if (m.best != null) S.run.history.push({ t: m.elapsed, cost: m.best, hard: m.bestHard });
    } else if (m.type === 'done') { finishRun(m); return; }
    else if (m.type === 'error') {
      S.run.status = 'error'; S.run.logs.push({ t: Math.round(performance.now() - S.run.t0), msg: 'ผิดพลาด: ' + m.message });
      w.terminate(); S.worker = null; updateStatus(); toast('การคำนวณผิดพลาด: ' + m.message, 'err'); return;
    }
    const now = performance.now();
    if (now - lastPaint > 150) { lastPaint = now; updateStatus(); }
  };
  w.onerror = (e) => { S.run.status = 'error'; S.run.logs.push({ t: 0, msg: 'ผิดพลาด: ' + (e.message || 'ตัวประมวลผลหยุดทำงาน') }); S.worker = null; updateStatus(); };
  w.postMessage({ model: S.build.model, opts: { seed: S.settings.seed, maxIter } });
}

function cancelRun() {
  if (S.run.status !== 'running' || !S.worker) return;
  S.worker.terminate(); S.worker = null;
  S.run.status = 'cancelled';
  S.run.logs.push({ t: Math.round(performance.now() - S.run.t0), msg: 'ผู้ใช้กดยกเลิก หยุดการคำนวณทันที (ไม่บันทึกผล) กด "ลองใหม่" เพื่อเริ่มใหม่' });
  updateStatus();
  toast('ยกเลิกการคำนวณแล้ว');
}

async function finishRun(m) {
  S.worker?.terminate(); S.worker = null;
  S.run.stage = 5; S.run.pct = 97;
  S.run.logs.push({ t: m.result.elapsedMs, msg: 'Inspector: ตรวจผลตารางแบบอิสระตามเงื่อนไข 18 ข้อ' });
  updateStatus();
  const model = S.build.model;
  const t1 = performance.now();
  const inspection = inspect(model, m.result.placements);
  const baseInspection = inspect(model, m.baseline);
  const inspectMs = Math.round(performance.now() - t1);
  const { placements, history, ...meta } = m.result;
  S.result = {
    placements, baseline: m.baseline, inspection, baseInspection,
    meta: { ...meta, history, inspectMs, datasetName: S.datasetName, createdAt: new Date().toISOString(), totalMs: Math.round(performance.now() - S.run.t0) },
  };
  S.run.history = history;
  S.run.logs.push({ t: m.result.elapsedMs + inspectMs, msg: `Inspector: ${inspection.hardTotal ? `พบการละเมิดเงื่อนไขบังคับ ${inspection.hardTotal} จุด` : 'ผ่านเงื่อนไขบังคับทั้งหมด'} · เงื่อนไขยืดหยุ่น ${inspection.softTotal} จุด · ลงครบ ${inspection.completeness.placed}/${inspection.completeness.required} คาบ` });
  S.run.status = 'done'; S.run.pct = 100;
  S.run.live = { ...S.run.live, elapsed: S.result.meta.totalMs, iter: meta.iterations, bestHard: inspection.hardTotal, best: meta.cost };
  S.view.idx = 0;
  updateStatus();
  toast(inspection.hardTotal ? `จัดตารางเสร็จ แต่ยังมีข้อขัดแย้ง ${inspection.hardTotal} จุด ลองกด "ลองใหม่"` : 'จัดตารางเสร็จ ไม่มีข้อขัดแย้งบังคับ', inspection.hardTotal ? 'err' : 'ok');
  try {
    S.runId = await store.saveRun({
      dataset_id: S.datasetId, dataset_name: S.datasetName, seed: meta.seed, max_iter: meta.maxIter, elapsed_ms: S.result.meta.totalMs,
      hard: inspection.hardTotal, soft: inspection.softTotal, confirmed: false,
      result: { placements, baseline: m.baseline, meta: S.result.meta },
      metrics: { completeness: inspection.completeness, clashes: inspection.clashes, avgRoomUtil: inspection.metrics.avgRoomUtil, totalGaps: inspection.metrics.totalGaps },
    });
    saveCurrent();
  } catch (err) { toast('บันทึกผลไม่สำเร็จ: ' + err.message, 'err'); }
}

// =====================================================================
// 3) ตารางผลลัพธ์
// =====================================================================
function renderResults() {
  if (!S.result || !S.build) {
    main().innerHTML = `<div class="page-head"><div><span class="step-tag">ขั้นตอนที่ 3</span><h1>ตารางผลลัพธ์</h1></div></div>
      <section class="card empty-state">${ic('calendar')}<h2>ยังไม่มีผลการจัดตาราง</h2><p class="muted">ไปหน้าจัดตารางแล้วกด "จัดตาราง" หรือเปิดผลเดิมจากหน้าประวัติ</p>
      <div class="btn-row" style="justify-content:center"><button class="btn primary" data-go="schedule">${ic('play')}ไปหน้าจัดตาราง</button><button class="btn" data-go="history">ดูประวัติ</button></div></section>`;
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    return;
  }
  const { inspection: ins, meta } = S.result;
  const c = ins.completeness, M = ins.metrics;
  const ok = ins.hardTotal === 0 && c.placed === c.required;
  const v = S.view;
  main().innerHTML = `
  <div class="page-head">
    <div><span class="step-tag">ขั้นตอนที่ 3</span><h1>ตารางผลลัพธ์</h1>
    <p>${esc(meta.datasetName)} · seed ${meta.seed} · จัดเมื่อ ${new Date(meta.createdAt).toLocaleString('th-TH')}</p></div>
  </div>
  <div class="banner ${ok ? 'ok' : 'err'}">
    <div><h2>${ok ? 'ตารางผ่านเงื่อนไขบังคับทั้งหมด ลงครบทุกคาบ' : `พบปัญหา: ข้อขัดแย้งบังคับ ${ins.hardTotal} จุด${c.placed < c.required ? ` · ลงไม่ครบ ${c.required - c.placed} คาบ` : ''}`}</h2>
    <span class="muted">${ok ? 'ตรวจสอบรายละเอียดแล้วกด "ยืนยันผลตาราง" เพื่อเปิดหน้าพิมพ์ PDF' : 'ดูรายละเอียดในแท็บ "ตรวจสอบเงื่อนไข" แล้วกลับไปกด "ลองใหม่" หรือแก้ข้อมูลนำเข้า'}</span></div>
    <div class="btn-row">
      ${S.resultConfirmed ? `<span class="pill ok">ยืนยันผลแล้ว</span>` : `<button class="btn primary" id="r-confirm">${ic('check')}ยืนยันผลตาราง</button>`}
      <button class="btn" id="r-xlsx">${ic('download')}Excel</button>
      <button class="btn" id="r-csv">${ic('download')}CSV</button>
      <button class="btn ${S.resultConfirmed ? 'ok' : ''}" id="r-print" ${S.resultConfirmed ? '' : 'disabled title="ยืนยันผลตารางก่อน"'}>${ic('print')}พิมพ์ / PDF</button>
    </div>
  </div>
  <div class="stats" style="margin-bottom:18px">
    <div class="stat ${c.placed === c.required ? 'ok' : 'err'}"><div class="v">${fmtN(c.placed)}/${fmtN(c.required)}</div><div class="l">คาบที่ลงตาราง/ต้องลง</div></div>
    <div class="stat info"><div class="v">${c.tables.groups}·${c.tables.teachers}·${c.tables.rooms}</div><div class="l">จำนวนตาราง กลุ่ม·ครู·ห้อง</div></div>
    <div class="stat ${ins.hardTotal ? 'err' : 'ok'}"><div class="v">${ins.hardTotal}</div><div class="l">ข้อขัดแย้งบังคับ</div></div>
    <div class="stat ${ins.softTotal ? 'warn' : 'ok'}"><div class="v">${ins.softTotal}</div><div class="l">ละเมิดเงื่อนไขยืดหยุ่น</div></div>
    <div class="stat"><div class="v">${(M.avgRoomUtil * 100).toFixed(1)}%</div><div class="l">อัตราใช้ห้องเฉลี่ย</div></div>
    <div class="stat"><div class="v">${M.totalGaps}</div><div class="l">เวลาว่างคั่นรวม (คาบ)</div></div>
    <div class="stat"><div class="v">${(meta.totalMs / 1000).toFixed(2)}</div><div class="l">เวลาประมวลผล (วินาที)</div></div>
  </div>
  <section class="card">
    <div class="tabs" role="tablist">
      ${[['grid', 'ตารางสอน'], ['check', 'ตรวจสอบเงื่อนไข 18 ข้อ'], ['metrics', 'ตัวชี้วัด'], ['list', 'รายการทั้งหมด']].map(([k, t]) => `<button role="tab" data-rtab="${k}" class="${v.tab === k ? 'active' : ''}" aria-selected="${v.tab === k}">${t}</button>`).join('')}
    </div>
    <div id="rtab"></div>
  </section>`;
  $$('[data-rtab]').forEach((b) => b.addEventListener('click', () => { S.view.tab = b.dataset.rtab; $$('[data-rtab]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); }); renderRTab(); }));
  $('#r-confirm')?.addEventListener('click', confirmResult);
  $('#r-xlsx').addEventListener('click', async () => { download(await exportExcel(ctx()), `ตารางสอน-${dateTag()}.xlsx`); toast('ส่งออก Excel แล้ว', 'ok'); });
  $('#r-csv').addEventListener('click', () => { download(exportCsv(ctx()), `ตารางสอน-${dateTag()}.csv`); toast('ส่งออก CSV แล้ว', 'ok'); });
  $('#r-print').addEventListener('click', openPrintDialog);
  renderRTab();
}
const ctx = () => ({ model: S.build.model, placements: S.result.placements, inspection: S.result.inspection, meta: S.result.meta });
const dateTag = () => new Date().toISOString().slice(0, 10);

async function confirmResult() {
  if (S.result.inspection.hardTotal > 0) {
    openModal(`<h2>ยืนยันผลที่ยังมีข้อขัดแย้ง?</h2><p>ตารางนี้ยังมีการละเมิดเงื่อนไขบังคับ ${S.result.inspection.hardTotal} จุด แนะนำให้กลับไปกด "ลองใหม่" ก่อน</p>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>กลับไปแก้</button><button class="btn danger" id="m-force">ยืนยันต่อ</button></div>`);
    $('#m-force').addEventListener('click', () => { closeModal(); doConfirm(); });
    return;
  }
  doConfirm();
}
async function doConfirm() {
  S.resultConfirmed = true;
  try { if (S.runId) await store.updateRun(S.runId, { confirmed: true }); } catch (err) { toast('บันทึกสถานะไม่สำเร็จ: ' + err.message, 'err'); }
  toast('ยืนยันผลตารางแล้ว เปิดหน้าพิมพ์ PDF ได้', 'ok');
  renderResults();
}

function renderRTab() {
  const t = S.view.tab, el = $('#rtab');
  if (t === 'grid') return renderGridTab(el);
  if (t === 'check') return renderCheckTab(el);
  if (t === 'metrics') return renderMetricsTab(el);
  return renderListTab(el);
}

function renderGridTab(el) {
  const v = S.view, m = S.build.model, list = KINDS[v.kind].list(m);
  if (v.idx >= list.length) v.idx = 0;
  const opts = list.map((x, i) => `<option value="${i}" ${i === v.idx ? 'selected' : ''}>${esc(v.kind === 'teacher' ? `${x.name} (${x.position})` : x.name)}</option>`).join('');
  el.innerHTML = `
    <div class="viewbar">
      <div class="field"><span class="lbl">มุมมอง</span><div class="seg" role="group" aria-label="มุมมองตาราง">${Object.entries(KINDS).map(([k, x]) => `<button data-kind="${k}" class="${v.kind === k ? 'active' : ''}" aria-pressed="${v.kind === k}">${x.label}</button>`).join('')}</div></div>
      <div class="field" style="flex:1;min-width:240px"><label for="ent">เลือก${KINDS[v.kind].label}</label>
        <div class="entity-pick"><button class="btn sm" id="prev" aria-label="ก่อนหน้า">${ic('left')}</button><select id="ent">${opts}</select><button class="btn sm" id="next" aria-label="ถัดไป">${ic('right')}</button></div></div>
      <div class="field" style="flex:1;min-width:220px"><label for="subj-q">ค้นหาวิชา / ครู / ห้อง</label><div class="search" style="max-width:none">${ic('search')}<input type="search" id="subj-q" placeholder="เช่น โปรแกรม หรือ 20204" value="${esc(v.search)}"></div></div>
    </div>
    <div class="found" id="found"></div>
    <div id="gridwrap"></div>`;
  const paint = () => {
    const { title, sub } = entityTitle(m, v.kind, v.idx);
    const hrs = entityPlacements(S.result.placements, v.kind, v.idx).reduce((s, p) => s + p.len, 0);
    $('#gridwrap').innerHTML = `<div class="tt-head"><h3>${esc(title)}</h3><small class="muted">${esc(sub)} · รวม ${hrs} คาบ/สัปดาห์</small></div>
      <div class="grid-scroll">${gridHtml(m, S.result.placements, v.kind, v.idx, { search: v.search })}</div>
      ${summaryTableHtml(m, S.result.placements, v.kind, v.idx)}`;
    const q = v.search.trim().toLowerCase();
    const f = $('#found');
    if (!q) { f.innerHTML = ''; return; }
    const k = KINDS[v.kind].key;
    const hit = new Map();
    for (const p of S.result.placements) {
      const sj = m.subjects[p.s];
      if ([sj.id, sj.name, m.teachers[p.t].name, m.groups[p.g].name, m.rooms[p.r]?.name].some((x) => String(x || '').toLowerCase().includes(q))) hit.set(p[k], (hit.get(p[k]) || 0) + p.len);
    }
    f.innerHTML = hit.size ? `<span class="muted" style="font-size:.88rem">พบใน ${hit.size} ${KINDS[v.kind].label}:</span>` + [...hit.entries()].slice(0, 40).map(([i, n]) => `<button data-jump="${i}">${esc(list[i].name)} (${n})</button>`).join('') : '<span class="muted">ไม่พบรายการที่ค้นหา</span>';
    $$('[data-jump]', f).forEach((b) => b.addEventListener('click', () => { v.idx = +b.dataset.jump; $('#ent').value = v.idx; paint(); }));
  };
  $$('[data-kind]', el).forEach((b) => b.addEventListener('click', () => { v.kind = b.dataset.kind; v.idx = 0; renderGridTab(el); }));
  $('#ent').addEventListener('change', (e) => { v.idx = +e.target.value; paint(); });
  $('#prev').addEventListener('click', () => { v.idx = (v.idx - 1 + list.length) % list.length; $('#ent').value = v.idx; paint(); });
  $('#next').addEventListener('click', () => { v.idx = (v.idx + 1) % list.length; $('#ent').value = v.idx; paint(); });
  $('#subj-q').addEventListener('input', (e) => { v.search = e.target.value; paint(); });
  paint();
}

function renderCheckTab(el) {
  const { inspection: ins, baseInspection: base, meta } = S.result;
  const c = ins.completeness;
  el.innerHTML = `
    <div class="stats" style="margin-bottom:16px">
      <div class="stat ${ins.clashes.teacher ? 'err' : 'ok'}"><div class="v">${ins.clashes.teacher}</div><div class="l">ครูสอนชน (จุด)</div></div>
      <div class="stat ${ins.clashes.room ? 'err' : 'ok'}"><div class="v">${ins.clashes.room}</div><div class="l">ห้องเรียนชน (จุด)</div></div>
      <div class="stat ${ins.clashes.group ? 'err' : 'ok'}"><div class="v">${ins.clashes.group}</div><div class="l">กลุ่มเรียนชน (จุด)</div></div>
      <div class="stat ${c.placed === c.required ? 'ok' : 'err'}"><div class="v">${c.placed === c.required ? 'ครบ' : 'ไม่ครบ'}</div><div class="l">ลงตาราง ${fmtN(c.placed)}/${fmtN(c.required)} คาบ</div></div>
    </div>
    <div class="table-wrap" style="max-height:none"><table class="data cond-table"><thead><tr><th>ข้อ</th><th>เงื่อนไข</th><th>ประเภท</th><th>ละเมิด</th><th class="num">จำนวนครั้ง</th><th>รายละเอียด</th></tr></thead><tbody>
      ${ins.conditions.map((x) => `<tr class="${x.count ? 'v-yes' : ''}"><td class="c">${x.no}</td><td>${esc(x.text)}</td><td><span class="badge ${x.type}">${x.type === 'hard' ? 'บังคับ' : 'ยืดหยุ่น'}</span></td>
        <td><span class="badge ${x.count ? (x.type === 'hard' ? 'err' : 'warn') : 'ok'}">${x.count ? 'ใช่' : 'ไม่'}</span></td><td class="num">${x.count}</td>
        <td>${x.details.length ? `<details class="det"><summary>${x.count ? 'ดูจุดที่ละเมิด' : 'หลักฐาน'}</summary><ul>${x.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>` : '<span class="muted">-</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grid-2" style="margin-top:18px">
      <div><h3>เปรียบเทียบกับวิธีพื้นฐาน</h3>
        <table class="compare"><thead><tr><th>ตัวชี้วัด</th><th class="num">วิธีพื้นฐาน<br><small>First-Fit</small></th><th class="num">หลังวางเริ่มต้น<br><small>Builder</small></th><th class="num">ผลสุดท้าย<br><small>AI (SA)</small></th></tr></thead><tbody>
          <tr><td>ข้อขัดแย้งบังคับ</td><td class="num">${fmtN(base.hardTotal)}</td><td class="num">${fmtN(meta.buildHard)}</td><td class="num good">${fmtN(ins.hardTotal)}</td></tr>
          <tr><td>ละเมิดเงื่อนไขยืดหยุ่น</td><td class="num">${fmtN(base.softTotal)}</td><td class="num">-</td><td class="num good">${fmtN(ins.softTotal)}</td></tr>
          <tr><td>เวลาว่างคั่นรวม (คาบ)</td><td class="num">${fmtN(base.metrics.totalGaps)}</td><td class="num">-</td><td class="num good">${fmtN(ins.metrics.totalGaps)}</td></tr>
          <tr><td>ครูชน / ห้องชน / กลุ่มชน</td><td class="num">${base.clashes.teacher} / ${base.clashes.room} / ${base.clashes.group}</td><td class="num">-</td><td class="num good">${ins.clashes.teacher} / ${ins.clashes.room} / ${ins.clashes.group}</td></tr>
        </tbody></table>
        <p class="muted" style="font-size:.86rem;margin-top:8px">วิธีพื้นฐาน: เรียงตามลำดับข้อมูล ใช้ครูคนแรก วางช่องแรกที่กลุ่มว่าง ไม่ตรวจครูและห้อง ไม่มีการปรับปรุงภายหลัง</p>
      </div>
      <div><h3>การตั้งค่าและการทำซ้ำผล</h3>
        <table class="compare"><tbody>
          <tr><td>Seed</td><td class="num">${meta.seed}</td></tr>
          <tr><td>จำนวนรอบที่กำหนด / ที่ใช้</td><td class="num">${fmtN(meta.maxIter)} / ${fmtN(meta.iterations)}</td></tr>
          <tr><td>พบตารางไม่ชนครั้งแรก</td><td class="num">${meta.firstFeasibleMs >= 0 ? fmtSec(meta.firstFeasibleMs) : '-'}</td></tr>
          <tr><td>เวลาคำนวณ / ตรวจสอบ</td><td class="num">${fmtSec(meta.elapsedMs)} / ${fmtSec(meta.inspectMs)}</td></tr>
          <tr><td>เหตุผลที่หยุด</td><td class="num" style="font-weight:500">${esc(meta.stopReason || '-')}</td></tr>
        </tbody></table>
        <p class="muted" style="font-size:.86rem;margin-top:8px">ทดสอบซ้ำ: ไปหน้าจัดตาราง ใส่ seed ${meta.seed} ความละเอียดเดิม แล้วกด "จัดตาราง" จะได้ตารางเดิมทุกครั้ง</p>
        ${meta.history?.length > 1 ? chartSvg(meta.history) : ''}
      </div>
    </div>`;
}

function renderMetricsTab(el) {
  const M = S.result.inspection.metrics;
  const rooms = [...M.roomUse].sort((a, b) => b.pct - a.pct);
  const tmax = Math.max(26, ...M.teacherStats.map((t) => t.hours));
  el.innerHTML = `
    <div class="grid-2">
      <div><div class="card-head"><h3>อัตราการใช้ห้อง</h3><span class="pill info">เฉลี่ย ${(M.avgRoomUtil * 100).toFixed(1)}%</span></div>
        <div class="bars">${rooms.map((r) => `<div class="bar-row"><span>${esc(r.name)} <small class="muted">${esc(r.type)}</small></span><div class="bar ${r.pct < .35 ? 'low' : r.pct < .65 ? 'mid' : ''}"><i style="width:${(r.pct * 100).toFixed(1)}%"></i></div><span class="num">${(r.pct * 100).toFixed(0)}% <small class="muted">${r.used}/${NS}</small></span></div>`).join('')}</div>
        <p class="muted" style="font-size:.85rem;margin-top:8px">คิดจากจำนวนคาบที่ห้องถูกใช้ ต่อ ${NS} คาบ/สัปดาห์ (สนามที่ใช้ร่วมกันไม่นำมาเฉลี่ย)</p></div>
      <div><div class="card-head"><h3>นักเรียน: คาบว่างและเวลาว่างคั่น</h3><span class="pill ${M.totalGaps ? 'warn' : 'ok'}">ว่างคั่นรวม ${M.totalGaps} คาบ</span></div>
        <div class="table-wrap" style="max-height:420px"><table class="data"><thead><tr><th>กลุ่มเรียน</th><th class="num">คาบเรียน</th><th class="num">คาบว่าง</th><th class="num">ว่างคั่น</th><th class="num">วันที่เรียน</th><th class="num">มากสุด/วัน</th></tr></thead><tbody>
          ${M.groupStats.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${g.hours}/${g.required}</td><td class="num">${g.free}</td><td class="num">${g.gaps ? `<span class="badge warn">${g.gaps}</span>` : 0}</td><td class="num">${g.daysUsed}</td><td class="num">${g.maxDay}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted" style="font-size:.85rem;margin-top:8px">เวลาว่างคั่น = คาบว่างที่อยู่ระหว่างวิชาในวันเดียวกัน (ไม่นับพักเที่ยง)</p></div>
    </div>
    <div style="margin-top:18px"><div class="card-head"><h3>ภาระสอนรายครู</h3><span class="pill info">ค่าเฉลี่ยครูประจำ ${M.regMean.toFixed(1)} ชม.</span></div>
      <div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>ครู</th><th>ตำแหน่ง</th><th>แผนก</th><th class="num">ชม./สัปดาห์</th><th>เกณฑ์</th><th style="min-width:160px">ช่วงภาระ</th><th>สถานะ</th><th class="num">วันที่สอน</th><th class="num">วิชา</th><th class="num">กลุ่ม</th><th class="num">ว่างคั่น</th></tr></thead><tbody>
        ${M.teacherStats.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.position)}</td><td>${esc(t.dept)}</td><td class="num"><b>${t.hours}</b></td><td>${t.max ? `${t.min}-${t.max}` : `≥ ${t.min}`}</td>
          <td><div class="load"><span class="rng" style="left:${(t.min / tmax) * 100}%;width:${(((t.max || tmax) - t.min) / tmax) * 100}%"></span><i class="${t.status === 'ok' ? '' : 'bad'}" style="left:${Math.min(100, (t.hours / tmax) * 100)}%"></i></div></td>
          <td><span class="badge ${t.status === 'ok' ? 'ok' : 'err'}">${t.status === 'ok' ? 'ผ่าน' : t.status === 'under' ? 'ต่ำกว่าเกณฑ์' : 'เกินเกณฑ์'}</span></td><td class="num">${t.days}/5</td><td class="num">${t.subjects}</td><td class="num">${t.groups}</td><td class="num">${t.gaps}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

function renderListTab(el) {
  const m = S.build.model, f = S.view.list;
  const rows = flatRows(m, S.result.placements);
  const sel = (id, label, items, val) => `<div class="field"><label for="${id}">${label}</label><select id="${id}"><option value="">ทั้งหมด</option>${items.map((x, i) => `<option value="${i}" ${String(val) === String(i) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>`;
  el.innerHTML = `<div class="toolbar" style="align-items:flex-end">
      <div class="field" style="flex:1;min-width:220px"><label for="lq">ค้นหา</label><div class="search" style="max-width:none">${ic('search')}<input type="search" id="lq" placeholder="วิชา ครู ห้อง กลุ่ม" value="${esc(f.q)}"></div></div>
      ${sel('ld', 'วัน', DAYS, f.day)}${sel('lg', 'กลุ่มเรียน', m.groups.map((g) => g.name), f.g)}${sel('lt', 'ครู', m.teachers.map((t) => t.name), f.t)}${sel('lr', 'ห้อง', m.rooms.map((r) => r.name), f.r)}
    </div><p class="muted" id="lcount" style="font-size:.9rem"></p><div class="table-wrap" id="ltable"></div>`;
  const paint = () => {
    const q = f.q.trim().toLowerCase();
    const out = rows.filter((r) => (f.day === '' || r.day === +f.day) && (f.g === '' || r.g === +f.g) && (f.t === '' || r.t === +f.t) && (f.r === '' || r.r === +f.r)
      && (!q || [r.subject, r.subjectId, r.teacher, r.room, r.group].some((x) => String(x).toLowerCase().includes(q))));
    $('#lcount').textContent = `${fmtN(out.length)} รายการ · ${fmtN(out.reduce((s, r) => s + r.len, 0))} คาบ`;
    $('#ltable').innerHTML = `<table class="data"><thead><tr><th>วัน</th><th>เวลา</th><th class="num">คาบ</th><th>กลุ่มเรียน</th><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>ครูผู้สอน</th><th>ตำแหน่ง</th><th>ห้องเรียน</th></tr></thead><tbody>
      ${out.slice(0, 1500).map((r) => `<tr><td>${r.dayName}</td><td>${r.time}</td><td class="num">${r.len}</td><td>${esc(r.group)}</td><td>${esc(r.subjectId)}</td><td>${esc(r.subject)}</td><td>${esc(r.teacher)}</td><td>${esc(r.position)}</td><td>${esc(r.room)}</td></tr>`).join('')}</tbody></table>`;
  };
  $('#lq').addEventListener('input', (e) => { f.q = e.target.value; paint(); });
  [['ld', 'day'], ['lg', 'g'], ['lt', 't'], ['lr', 'r']].forEach(([id, k]) => $('#' + id).addEventListener('change', (e) => { f[k] = e.target.value; paint(); }));
  paint();
}

// ===== พิมพ์ / PDF =====
function openPrintDialog() {
  if (!S.resultConfirmed) { toast('กรุณายืนยันผลตารางก่อนพิมพ์', 'err'); return; }
  const v = S.view, m = S.build.model;
  const cur = entityTitle(m, v.kind, v.idx).title;
  openModal(`<h2>พิมพ์ / บันทึกเป็น PDF</h2><p class="muted">กระดาษ A4 แนวนอน 1 ตารางต่อหน้า พร้อมช่องลงชื่อรับรองความถูกต้อง ในหน้าต่างพิมพ์ให้เลือก "บันทึกเป็น PDF"</p>
    <div class="opt-list">
      <label><input type="checkbox" name="pp" value="summary" checked><span><b>หน้าสรุปผลการตรวจสอบ</b><br><small class="muted">ตัวชี้วัด เงื่อนไข 18 ข้อ และภาระสอนครู</small></span></label>
      <label><input type="checkbox" name="pp" value="group" checked><span><b>ตารางเรียนทุกกลุ่มเรียน</b><br><small class="muted">${m.groups.length} หน้า</small></span></label>
      <label><input type="checkbox" name="pp" value="teacher"><span><b>ตารางสอนครูทุกคน</b><br><small class="muted">${m.teachers.length} หน้า</small></span></label>
      <label><input type="checkbox" name="pp" value="room"><span><b>ตารางการใช้ห้องทุกห้อง</b><br><small class="muted">${m.rooms.length} หน้า</small></span></label>
      <label><input type="checkbox" name="pp" value="current"><span><b>เฉพาะตารางที่กำลังดู</b><br><small class="muted">${esc(cur)}</small></span></label>
    </div>
    <div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>ยกเลิก</button><button class="btn primary" id="do-print">${ic('print')}เปิดหน้าพิมพ์</button></div>`);
  $('#do-print').addEventListener('click', () => {
    const opts = $$('input[name=pp]:checked').map((x) => x.value);
    if (!opts.length) { toast('เลือกอย่างน้อย 1 รายการ', 'err'); return; }
    closeModal(); doPrint(opts);
  });
}

function pageWrap(title, sub, inner, ins, meta) {
  return `<section class="p-page"><div class="p-head"><div><h1>${esc(title)}</h1><div class="p-sub">${esc(sub)}</div></div><div class="p-school">${esc(CONFIG.SCHOOL_NAME)} · ${esc(CONFIG.TERM_TEXT)}<br><small>ตรวจสอบโดยระบบ: ข้อขัดแย้งบังคับ ${ins.hardTotal} จุด · ลงครบ ${ins.completeness.placed}/${ins.completeness.required} คาบ · seed ${meta.seed} · พิมพ์ ${new Date().toLocaleDateString('th-TH')}</small></div></div>
    ${inner}
    <div class="p-sign"><div>ลงชื่อ ............................................... ผู้จัดตาราง<br>(...............................................)</div><div>ลงชื่อ ............................................... ผู้รับรองความถูกต้อง<br>(...............................................) รองผู้อำนวยการฝ่ายวิชาการ</div></div>
</section>`;
}

function doPrint(opts) {
  const m = S.build.model, { placements, inspection: ins, meta } = S.result;
  const pages = [];
  if (opts.includes('summary')) {
    const c = ins.completeness, M = ins.metrics;
    pages.push(pageWrap('สรุปผลการจัดตารางสอน', `${meta.datasetName} · จัดเมื่อ ${new Date(meta.createdAt).toLocaleString('th-TH')}`, `<div class="p-summary">
      <div class="p-kpis"><div><b>${c.placed}/${c.required}</b>คาบที่ลงตาราง</div><div><b>${ins.hardTotal}</b>ข้อขัดแย้งบังคับ</div><div><b>${ins.softTotal}</b>ละเมิดเงื่อนไขยืดหยุ่น</div><div><b>${ins.clashes.teacher}/${ins.clashes.room}/${ins.clashes.group}</b>ครู/ห้อง/กลุ่ม ชน</div><div><b>${(M.avgRoomUtil * 100).toFixed(1)}%</b>อัตราใช้ห้อง</div><div><b>${M.totalGaps}</b>ว่างคั่น (คาบ)</div><div><b>${(meta.totalMs / 1000).toFixed(2)} วิ</b>เวลาประมวลผล</div></div>
      <table><thead><tr><th>ข้อ</th><th>เงื่อนไข</th><th>ประเภท</th><th>ละเมิด</th><th>จำนวนครั้ง</th></tr></thead><tbody>${ins.conditions.map((x) => `<tr><td>${x.no}</td><td>${esc(x.text)}</td><td>${x.type === 'hard' ? 'บังคับ' : 'ยืดหยุ่น'}</td><td>${x.count ? 'ใช่' : 'ไม่'}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div>`, ins, meta));
    pages.push(pageWrap('ภาระสอนรายครู', `ค่าเฉลี่ยครูประจำ ${M.regMean.toFixed(1)} ชม./สัปดาห์`, `<div class="p-summary"><table><thead><tr><th>ครู</th><th>ตำแหน่ง</th><th>แผนก</th><th>ชม./สัปดาห์</th><th>เกณฑ์</th><th>สถานะ</th><th>วันที่สอน</th><th>วิชา</th><th>กลุ่ม</th></tr></thead><tbody>
      ${M.teacherStats.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(t.position)}</td><td>${esc(t.dept)}</td><td>${t.hours}</td><td>${t.max ? `${t.min}-${t.max}` : `≥ ${t.min}`}</td><td>${t.status === 'ok' ? 'ผ่าน' : 'ไม่ผ่าน'}</td><td>${t.days}/5</td><td>${t.subjects}</td><td>${t.groups}</td></tr>`).join('')}</tbody></table></div>`, ins, meta));
  }
  const addKind = (kind, only) => {
    KINDS[kind].list(m).forEach((_, idx) => {
      if (only != null && idx !== only) return;
      if (kind !== 'group' && only == null && !entityPlacements(placements, kind, idx).length) return;
      const { title, sub } = entityTitle(m, kind, idx);
      pages.push(pageWrap(title, sub, `<div>${gridHtml(m, placements, kind, idx)}</div>${summaryTableHtml(m, placements, kind, idx)}`, ins, meta));
    });
  };
  ['group', 'teacher', 'room'].forEach((k) => opts.includes(k) && addKind(k));
  if (opts.includes('current')) addKind(S.view.kind, S.view.idx);
  $('#print-root').innerHTML = pages.join('');
  setTimeout(() => window.print(), 120);
}

function printTemplate() {
  const rows = templateRows();
  $('#print-root').innerHTML = `<section class="p-page p-tpl"><div class="p-head"><div><h1>แม่แบบนำเข้าข้อมูล ระบบจัดตารางสอนอัตโนมัติ</h1><div class="p-sub">กรอกตามหัวคอลัมน์ (คอลัมน์ที่มี * จำเป็น) แล้วสแกนหรือบันทึกเป็น PDF เพื่อนำเข้า</div></div><div class="p-school">${esc(CONFIG.SCHOOL_NAME)}</div></div>
    ${SHEETS.map((s) => `<h2>ชีต: ${s.title}</h2><table><thead><tr>${s.cols.map((c) => `<th>${esc(c.label)}${c.req ? ' *' : ''}</th>`).join('')}</tr></thead><tbody><tr>${rows[s.key][1].map((v) => `<td>${esc(v)}</td>`).join('')}</tr>${Array.from({ length: 4 }, () => '<tr>' + s.cols.map(() => '<td>&nbsp;</td>').join('') + '</tr>').join('')}</tbody></table>`).join('')}</section>`;
  setTimeout(() => window.print(), 120);
}

function printDataPdf() {
  $('#print-root').innerHTML = `<section class="p-tpl"><div class="p-head"><div><h1>ข้อมูลนำเข้า: ${esc(S.datasetName)}</h1><div class="p-sub">พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')}</div></div><div class="p-school">${esc(CONFIG.SCHOOL_NAME)}</div></div>
    ${SHEETS.map((s) => `<h2>ชีต: ${s.title}</h2><table><thead><tr>${s.cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${(S.raw[s.key] || []).map((r) => `<tr>${s.cols.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}</section>`;
  setTimeout(() => window.print(), 120);
}

// =====================================================================
// 4) ประวัติ
// =====================================================================
async function renderHistory() {
  main().innerHTML = `<div class="page-head"><div><span class="step-tag">ประวัติ</span><h1>ประวัติการจัดตาราง</h1><p>ผลการจัดตารางที่บันทึกไว้ ${store.remoteEnabled() ? 'ในฐานข้อมูล Supabase' : 'ในเบราว์เซอร์เครื่องนี้'} เปิดดูหรือพิมพ์ซ้ำได้</p></div></div>
    <section class="card"><div class="table-wrap" style="max-height:none" id="hist"><div class="more-row muted">กำลังโหลด...</div></div></section>`;
  try {
    const runs = await store.listRuns();
    $('#hist').innerHTML = runs.length ? `<table class="data"><thead><tr><th>วันที่</th><th>ชุดข้อมูล</th><th class="num">Seed</th><th class="num">เวลา (วิ)</th><th class="num">ขัดแย้งบังคับ</th><th class="num">ยืดหยุ่น</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${runs.map((r) => `<tr><td>${new Date(r.created_at).toLocaleString('th-TH')}</td><td>${esc(r.dataset_name || '-')}</td><td class="num">${r.seed}</td><td class="num">${((r.elapsed_ms || 0) / 1000).toFixed(2)}</td><td class="num">${r.hard ? `<span class="badge err">${r.hard}</span>` : '<span class="badge ok">0</span>'}</td><td class="num">${r.soft ?? '-'}</td><td>${r.confirmed ? '<span class="badge ok">ยืนยันแล้ว</span>' : '<span class="badge mute">ยังไม่ยืนยัน</span>'}</td>
        <td><div class="btn-row" style="justify-content:flex-end"><button class="btn sm" data-open="${r.id}">${ic('eye')}เปิดดู</button><button class="btn sm danger" data-del="${r.id}" aria-label="ลบ">${ic('trash')}</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty-state">' + ic('calendar') + '<h3>ยังไม่มีประวัติ</h3><p class="muted">ผลจะถูกบันทึกอัตโนมัติหลังจัดตารางเสร็จ</p></div>';
    $$('[data-open]').forEach((b) => b.addEventListener('click', () => openRun(b.dataset.open)));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
      openModal(`<h2>ลบผลการจัดตารางนี้?</h2><p>ลบแล้วกู้คืนไม่ได้</p><div class="btn-row" style="justify-content:flex-end"><button class="btn" data-close>ยกเลิก</button><button class="btn danger" id="m-del">ลบ</button></div>`);
      $('#m-del').addEventListener('click', async () => { closeModal(); await store.deleteRun(b.dataset.del); if (S.runId === b.dataset.del) S.runId = null; renderHistory(); toast('ลบแล้ว'); });
    }));
  } catch (err) { $('#hist').innerHTML = `<div class="more-row" style="color:var(--err)">โหลดประวัติไม่สำเร็จ: ${esc(err.message)}</div>`; }
}

async function openRun(id, silent = false) {
  try {
    const run = await store.getRun(id);
    if (!run) throw new Error('ไม่พบข้อมูล');
    const ds = await store.getDataset(run.dataset_id);
    if (!ds) throw new Error('ไม่พบชุดข้อมูลของผลนี้');
    S.raw = ds.raw; S.preIssues = []; S.sources = [ds.name]; S.datasetName = ds.name;
    S.build = buildModel(S.raw); S.datasetId = ds.id; S.confirmed = true;
    const model = S.build.model;
    const placements = run.result.placements, baseline = run.result.baseline || [];
    S.result = { placements, baseline, inspection: inspect(model, placements), baseInspection: inspect(model, baseline), meta: run.result.meta };
    S.runId = run.id; S.resultConfirmed = !!run.confirmed;
    S.settings.seed = run.seed;
    S.run = { status: 'done', pct: 100, stage: 5, logs: [{ t: 0, msg: `เปิดผลเดิมจากประวัติ (seed ${run.seed})` }], live: { iter: run.result.meta.iterations, bestHard: S.result.inspection.hardTotal, elapsed: run.elapsed_ms }, history: run.result.meta.history || [] };
    saveCurrent();
    if (!silent) go('results');
  } catch (err) { if (!silent) toast('เปิดไม่สำเร็จ: ' + err.message, 'err'); }
}

async function restore() {
  try {
    const cur = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
    if (!cur) return;
    if (cur.settings) Object.assign(S.settings, cur.settings);
    if (cur.runId) return openRun(cur.runId, true);
    if (cur.datasetId) {
      const ds = await store.getDataset(cur.datasetId);
      if (ds) { S.raw = ds.raw; S.preIssues = []; S.sources = [ds.name]; S.datasetName = ds.name; S.build = buildModel(S.raw); S.datasetId = ds.id; S.confirmed = true; }
    }
  } catch { /* เริ่มใหม่ */ }
}

// ===== เข้าสู่ระบบ (เมื่อเปิด REQUIRE_LOGIN) =====
function renderLogin() {
  main().innerHTML = `<section class="card login-card"><h1>เข้าสู่ระบบ</h1><p class="muted">ใช้บัญชีทดสอบที่ได้รับจากผู้พัฒนา</p>
    <form id="login"><div class="field"><label for="em">อีเมล</label><input type="email" id="em" required autocomplete="username"></div>
    <div class="field"><label for="pw">รหัสผ่าน</label><input type="password" id="pw" required autocomplete="current-password"></div>
    <button class="btn primary lg" type="submit">เข้าสู่ระบบ</button><p id="lerr" style="color:var(--err)"></p></form></section>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await store.login($('#em').value, $('#pw').value); renderStoreStatus(); toast('เข้าสู่ระบบแล้ว', 'ok'); route(); }
    catch (err) { $('#lerr').textContent = err.message; }
  });
}

// ===== คู่มือ =====
const HELP = `
<p>ระบบจัดตารางสอนอัตโนมัติ ใช้งาน 3 ขั้นตอนหลัก ตามแถบด้านบน: <b>นำเข้าข้อมูล → จัดตาราง → ตารางผลลัพธ์</b></p>
<h3>ขั้นที่ 1 นำเข้าข้อมูล</h3>
<ol><li>ดาวน์โหลด <b>แม่แบบ Excel</b> (หรือ CSV / JSON / PDF) แล้วกรอกข้อมูล 5 ชีต: ครู, ห้องเรียน, กลุ่มเรียน, รายวิชา, การลงทะเบียน</li>
<li>ลากไฟล์มาวางในกรอบ หรือกดเพื่อเลือกไฟล์ (เลือกหลายไฟล์ได้) หรือกดปุ่ม <b>ชุดข้อมูลตัวอย่าง</b> เพื่อทดลอง</li>
<li>ระบบตรวจข้อมูลทันที แสดง <b>ข้อผิดพลาด</b> (สีแดง ต้องแก้) และ <b>คำเตือน</b> (สีเหลือง) พร้อมวิธีแก้ กดที่รายการเพื่อไปยังแถวนั้น</li>
<li>ตรวจ <b>พรีวิว</b> ว่าระบบอ่านข้อมูลถูกต้อง แล้วกด <b>ยืนยันข้อมูลนำเข้า</b></li></ol>
<div class="tip">ระบบตรวจ: ช่องว่าง, รหัสซ้ำ, อ้างถึงครู/ห้อง/กลุ่ม/วิชาที่ไม่มี, รูปแบบเวลาผิด, เวลาบังคับซ้อนกัน, ห้องไม่พอ/จุไม่พอ, คาบเกิน 40 คาบ/สัปดาห์, ครูมีชั่วโมงไม่ถึง 18</div>
<h3>ขั้นที่ 2 จัดตาราง</h3>
<table><tr><th>ปุ่ม</th><th>หน้าที่</th></tr>
<tr><td><b>จัดตาราง</b></td><td>เริ่มคำนวณ แสดงความคืบหน้า ขั้นตอนที่กำลังทำ เวลา และจำนวนข้อขัดแย้งแบบสด</td></tr>
<tr><td><b>ยกเลิก</b></td><td>หยุดการคำนวณทันที (หน้าเว็บไม่ค้าง เพราะคำนวณแยกใน Web Worker)</td></tr>
<tr><td><b>ลองใหม่</b></td><td>คำนวณใหม่ด้วย seed ใหม่ (ติ๊ก "ใช้ seed เดิม" เพื่อทดสอบว่าได้ผลซ้ำเดิม)</td></tr>
<tr><td><b>เปิดดูผล</b></td><td>ไปหน้าตารางผลลัพธ์ เมื่อคำนวณเสร็จ</td></tr></table>
<h3>ขั้นที่ 3 ตารางผลลัพธ์</h3>
<ul><li><b>ตารางสอน</b>: เลือกมุมมอง กลุ่มเรียน / ครู / ห้องเรียน เลือกรายการ และค้นหาวิชา ช่องที่ตรงจะถูกเน้น</li>
<li><b>ตรวจสอบเงื่อนไข 18 ข้อ</b>: ละเมิดหรือไม่ กี่ครั้ง จุดใด พร้อมเปรียบเทียบกับวิธีพื้นฐาน</li>
<li><b>ตัวชี้วัด</b>: อัตราการใช้ห้อง เวลาว่างคั่นระหว่างวิชา และภาระสอนรายครู</li>
<li><b>รายการทั้งหมด</b>: กรองตามวัน กลุ่ม ครู ห้อง</li>
<li>กด <b>ยืนยันผลตาราง</b> แล้วกด <b>พิมพ์ / PDF</b> เลือก "บันทึกเป็น PDF" (A4 แนวนอน มีช่องลงชื่อรับรอง) หรือส่งออก <b>Excel / CSV</b></li></ul>
<h3>เงื่อนไขที่ระบบใช้</h3>
<ul><li>เรียน จันทร์-ศุกร์ 08.00-17.00 น. คาบละ 1 ชั่วโมง พักเที่ยง 12.00-13.00 น. (40 คาบ/สัปดาห์)</li>
<li><b>บังคับ</b>: ครู/กลุ่ม/ห้องไม่ชน, ครูทุกคน ≥ 18 ชม., หัวหน้า 18-24 ชม., ครูแผนกคอมพิวเตอร์สอนทุกวัน, วิชาคอมพิวเตอร์เรียนห้องคอมพิวเตอร์, ลูกเสือ พ 15.00-17.00 น. ที่สนาม โดยครูที่ปรึกษา</li>
<li><b>ยืดหยุ่น (ถ้าเป็นไปได้)</b>: คาบวิชาเดียวกันต่อเนื่องและจบในวันเดียว, เวลาที่ครูขอว่าง, ครูประจำภาระใกล้เคียงกัน, ผู้สอนคนเดียวต่อวิชา</li></ul>
<h3>รูปแบบข้อมูลที่ควรรู้</h3>
<ul><li>เวลา: <code>จ 08.00-12.00; ศ 13.00-16.00</code> (วัน จ อ พ พฤ ศ)</li>
<li>ครูผู้สอนหลายคน: <code>T01,T02</code> ระบบเลือกให้ 1 คนตามภาระ</li>
<li>คาบต่อสัปดาห์ว่าง = ท + ป ของรายวิชา</li></ul>
<h3>คำถามที่พบบ่อย</h3>
<ul><li><b>ปุ่มยืนยันกดไม่ได้</b>: ยังมีข้อผิดพลาดสีแดง ให้แก้ไฟล์แล้วนำเข้าใหม่</li>
<li><b>ยังมีข้อขัดแย้ง</b>: กด "ลองใหม่" หรือเลือกความละเอียด "ละเอียด" ถ้ายังไม่หาย ตรวจคำเตือนในหน้านำเข้า (เช่น ห้องไม่พอ)</li>
<li><b>ข้อมูลหาย</b>: ดูได้ที่เมนู "ประวัติ"</li></ul>`;

// ===== เริ่มต้น =====
async function init() {
  $('#help-body').innerHTML = HELP;
  $('#btn-help').addEventListener('click', () => { $('#help').hidden = false; $('#help .drawer-head button').focus(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#help [data-close]')) $('#help').hidden = true;
    if (e.target.closest('#modal [data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#help').hidden = true; closeModal(); } });
  $('#btn-user').addEventListener('click', () => { store.logout(); renderStoreStatus(); route(); });
  window.addEventListener('hashchange', route);
  window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });
  renderStoreStatus();
  if (!store.needLogin()) await restore();
  route();
}
init();
