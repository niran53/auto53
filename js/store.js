// ที่เก็บข้อมูล: Supabase (REST/PostgREST) หรือ localStorage เมื่อไม่ได้ตั้งค่า
import { CONFIG } from './config.js';

const LS = { ds: 'tt.datasets', runs: 'tt.runs', session: 'tt.session' };
const url = () => (CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
export const remoteEnabled = () => !!(url() && CONFIG.SUPABASE_ANON_KEY);

let session = null;
try { session = JSON.parse(localStorage.getItem(LS.session) || 'null'); } catch { session = null; }

function headers(extra = {}) {
  return {
    apikey: CONFIG.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, opts = {}) {
  const res = await fetch(`${url()}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) });
  if (res.status === 401 && session?.refresh_token) {
    await refresh();
    return rest(path, opts);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
    throw new Error(`Supabase: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ===== Auth =====
export const currentUser = () => session?.user || null;
export async function login(email, password) {
  const res = await fetch(`${url()}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description || j.msg || 'เข้าสู่ระบบไม่สำเร็จ');
  session = j; localStorage.setItem(LS.session, JSON.stringify(j));
  return j.user;
}
async function refresh() {
  const res = await fetch(`${url()}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) { logout(); throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); }
  session = await res.json(); localStorage.setItem(LS.session, JSON.stringify(session));
}
export function logout() { session = null; localStorage.removeItem(LS.session); }
export const needLogin = () => remoteEnabled() && CONFIG.REQUIRE_LOGIN && !session;

// ===== Local =====
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsSet = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch { // เต็ม: ลบรายการเก่า
    if (v.length > 1) lsSet(k, v.slice(0, Math.ceil(v.length / 2)));
  }
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));

// ===== API =====
export async function saveDataset({ name, summary, raw }) {
  if (remoteEnabled()) {
    const [row] = await rest('datasets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, summary, raw }) });
    return row.id;
  }
  const list = lsGet(LS.ds);
  const id = uid();
  list.unshift({ id, name, summary, raw, created_at: new Date().toISOString() });
  lsSet(LS.ds, list.slice(0, 10));
  return id;
}
export async function getDataset(id) {
  if (remoteEnabled()) { const r = await rest(`datasets?id=eq.${id}&select=*`); return r[0] || null; }
  return lsGet(LS.ds).find((d) => d.id === id) || null;
}
export async function saveRun(run) {
  if (remoteEnabled()) {
    const [row] = await rest('runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(run) });
    return row.id;
  }
  const list = lsGet(LS.runs);
  const id = uid();
  list.unshift({ id, ...run, created_at: new Date().toISOString() });
  lsSet(LS.runs, list.slice(0, 20));
  return id;
}
export async function updateRun(id, patch) {
  if (remoteEnabled()) return rest(`runs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const list = lsGet(LS.runs);
  const r = list.find((x) => x.id === id);
  if (r) Object.assign(r, patch);
  lsSet(LS.runs, list);
}
export async function listRuns() {
  if (remoteEnabled()) return rest('runs?select=id,dataset_id,dataset_name,seed,max_iter,elapsed_ms,hard,soft,confirmed,created_at&order=created_at.desc&limit=50');
  return lsGet(LS.runs).map(({ result, metrics, ...r }) => r);
}
export async function getRun(id) {
  if (remoteEnabled()) { const r = await rest(`runs?id=eq.${id}&select=*`); return r[0] || null; }
  return lsGet(LS.runs).find((r) => r.id === id) || null;
}
export async function deleteRun(id) {
  if (remoteEnabled()) return rest(`runs?id=eq.${id}`, { method: 'DELETE' });
  lsSet(LS.runs, lsGet(LS.runs).filter((r) => r.id !== id));
}
