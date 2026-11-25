// เครื่องจัดตาราง: Planner -> Builder (Greedy Heuristic) -> Repairer (Simulated Annealing / Min-Conflicts)
// ทำงานได้ทั้งใน Web Worker และ Node.js (ใช้ทดสอบ)
import { NS, NP, ND, startsFor, rng } from './core.js';

export const W = {
  HARD: 1000,     // เงื่อนไขบังคับ (ต่อ 1 จุด/คาบ)
  UNAV_SOFT: 8,   // ครูไม่สะดวก (ถ้าเป็นไปได้) ต่อคาบ
  SPLIT: 4,       // วิชาเดียวกันกระจายหลายวัน ต่อวันที่เกิน
  GAP: 2,         // เวลาว่างคั่นของกลุ่มเรียน ต่อคาบ
  BAL: 3,         // ครูประจำภาระไม่ใกล้เคียง ต่อชั่วโมงที่เกินช่วง ±2
};
export const BAL_TOL = 2;

export function solve(model, opts = {}, report = () => {}) {
  const seed = opts.seed ?? 12345;
  // หยุดตามจำนวนรอบ (ไม่ใช่เวลา) เพื่อให้ seed เดิมได้ผลเหมือนเดิมทุกครั้ง; เวลาสูงสุดใช้กันค้างเท่านั้น
  const maxIter = Math.max(100000, opts.maxIter ?? 4000000);
  const safetyMs = Math.max(5, opts.safetySec ?? 90) * 1000;
  const rand = rng(seed);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const { teachers, rooms, groups, subjects, assignments } = model;
  const T = teachers.length, G = groups.length, R = rooms.length, A = assignments.length;

  const log = (msg) => report({ type: 'log', msg, t: Math.round(now() - t0) });
  const prog = (stage, pct, extra = {}) => report({ type: 'progress', stage, pct, elapsed: Math.round(now() - t0), ...extra });

  // ---------- 1) Planner: วิเคราะห์ข้อมูล ----------
  prog(1, 2);
  log(`Planner: วิเคราะห์ข้อมูล ครู ${T} คน ห้อง ${R} ห้อง กลุ่ม ${G} กลุ่ม รายวิชาที่ลงทะเบียน ${A} รายการ (seed=${seed})`);
  const unav = new Uint8Array(T * NS); // 0=ว่าง 1=ไม่สะดวก(ยืดหยุ่น) 2=ไม่สะดวก(บังคับ)
  teachers.forEach((t, i) => t.unav.forEach((s) => (unav[i * NS + s] = t.unavHard ? 2 : 1)));
  const roomMulti = rooms.map((r) => r.multi);
  const daily = teachers.map((t) => t.daily);
  const regular = teachers.map((t, i) => (t.isRegular ? i : -1)).filter((i) => i >= 0);

  // บล็อก (ช่วงคาบต่อเนื่อง) ของแต่ละรายวิชา
  const blocks = [];
  assignments.forEach((a, ai) => {
    const sj = subjects[a.s];
    a.blocks.forEach((len) => {
      const fixed = sj.fixed ? { day: sj.fixed.day, start: sj.fixed.start } : null;
      const starts = fixed ? [fixed.start] : startsFor(len);
      const days = fixed ? [fixed.day] : [0, 1, 2, 3, 4];
      const roomsDom = a.rooms && a.rooms.length ? a.rooms : rooms.map((_, i) => i);
      blocks.push({ a: ai, len, fixed, starts, days, rooms: roomsDom, day: -1, start: -1, room: -1 });
    });
  });
  const B = blocks.length;
  const asgBlocks = assignments.map(() => []);
  blocks.forEach((b, i) => asgBlocks[b.a].push(i));

  // ---------- สถานะ ----------
  const tOcc = new Int16Array(T * NS), gOcc = new Int16Array(G * NS), rOcc = new Int16Array(R * NS);
  const tDay = new Int16Array(T * ND), aDay = new Int16Array(A * ND), aDist = new Int16Array(A);
  const tHours = new Int32Array(T);
  const asgT = new Int32Array(A).fill(-1);

  function gap(g, d) {
    const base = g * NS + d * NP;
    let first = -1, last = -1;
    for (let p = 0; p < NP; p++) if (gOcc[base + p] > 0) { if (first < 0) first = p; last = p; }
    if (first < 0) return 0;
    let n = 0;
    for (let p = first; p <= last; p++) if (gOcc[base + p] === 0) n++;
    return n;
  }

  // ใส่ (+1) หรือถอด (-1) บล็อก คืนค่าการเปลี่ยนแปลงของต้นทุน
  function apply(bi, sign) {
    const b = blocks[bi];
    const a = assignments[b.a];
    const t = asgT[b.a], g = a.g, d = b.day, r = b.room;
    let delta = 0;
    const gb = gap(g, d);
    for (let k = 0; k < b.len; k++) {
      const s = d * NP + b.start + k;
      let i = t * NS + s, c = tOcc[i];
      if (sign > 0) { if (c >= 1) delta += W.HARD; tOcc[i] = c + 1; } else { if (c >= 2) delta -= W.HARD; tOcc[i] = c - 1; }
      i = g * NS + s; c = gOcc[i];
      if (sign > 0) { if (c >= 1) delta += W.HARD; gOcc[i] = c + 1; } else { if (c >= 2) delta -= W.HARD; gOcc[i] = c - 1; }
      if (r >= 0) {
        i = r * NS + s; c = rOcc[i];
        if (!roomMulti[r]) { if (sign > 0) { if (c >= 1) delta += W.HARD; } else if (c >= 2) delta -= W.HARD; }
        rOcc[i] = c + sign;
      }
      const u = unav[t * NS + s];
      if (u) delta += sign * (u === 2 ? W.HARD : W.UNAV_SOFT);
    }
    const ti = t * ND + d, before = tDay[ti], after = before + sign * b.len;
    tDay[ti] = after;
    if (daily[t]) { if (before === 0 && after > 0) delta -= W.HARD; else if (before > 0 && after === 0) delta += W.HARD; }
    const ai = b.a * ND + d, c0 = aDay[ai], c1 = c0 + sign, dist0 = aDist[b.a];
    aDay[ai] = c1;
    if (c0 === 0 && c1 > 0) aDist[b.a]++; else if (c0 > 0 && c1 === 0) aDist[b.a]--;
    delta += W.SPLIT * (Math.max(0, aDist[b.a] - 1) - Math.max(0, dist0 - 1));
    delta += W.GAP * (gap(g, d) - gb);
    return delta;
  }

  const loadPen = (t) => {
    const h = tHours[t], tt = teachers[t];
    return W.HARD * (Math.max(0, tt.min - h) + Math.max(0, h - tt.max));
  };
  function balPen() {
    if (regular.length < 2) return 0;
    let sum = 0;
    for (const t of regular) sum += tHours[t];
    const mean = sum / regular.length;
    let p = 0;
    for (const t of regular) p += Math.max(0, Math.abs(tHours[t] - mean) - BAL_TOL);
    return W.BAL * p;
  }
  let staticCost = 0; // ต้นทุนส่วนภาระครู (ขึ้นกับการแบ่งครู)
  const recomputeStatic = () => { let c = 0; for (let t = 0; t < T; t++) c += loadPen(t); return c + balPen(); };

  // ---------- 2) Planner: แบ่งครูผู้สอน ----------
  prog(2, 5);
  // ครูที่ต้องสอนทุกวันแต่ยังไม่มีชั่วโมง: นับเป็นวันขาดทั้งหมด
  let cost = 0;
  for (let t = 0; t < T; t++) if (daily[t]) cost += W.HARD * ND;
  const fixedAsg = [], flexAsg = [];
  assignments.forEach((a, ai) => (a.cands.length === 1 ? fixedAsg : flexAsg).push(ai));
  fixedAsg.forEach((ai) => { asgT[ai] = assignments[ai].cands[0]; tHours[asgT[ai]] += assignments[ai].periods; });
  flexAsg.sort((x, y) => assignments[y].periods - assignments[x].periods || rand() - 0.5);
  for (const ai of flexAsg) {
    const a = assignments[ai];
    let best = -1, bestScore = -Infinity;
    for (const t of a.cands) {
      const tt = teachers[t], h = tHours[t];
      let sc = (tt.min - h) * 10;
      if (h + a.periods > tt.max) sc -= 1000;
      sc += rand();
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    asgT[ai] = best; tHours[best] += a.periods;
  }
  staticCost = recomputeStatic();
  log(`Planner: แบ่งครูผู้สอนแล้ว (${flexAsg.length} รายการมีครูให้เลือกมากกว่า 1 คน)`);

  // ---------- 3) Builder: วางตารางเริ่มต้นแบบ Greedy (ข้อจำกัดมากก่อน) ----------
  const tLoad = new Int32Array(T);
  assignments.forEach((a, ai) => (tLoad[asgT[ai]] += a.periods));
  const order = blocks.map((_, i) => i);
  const domSize = (b) => b.days.length * b.starts.length * Math.max(1, b.rooms.length);
  order.sort((x, y) => {
    const bx = blocks[x], by = blocks[y];
    if (!!bx.fixed !== !!by.fixed) return bx.fixed ? -1 : 1;
    return domSize(bx) - domSize(by) || by.len - bx.len || tLoad[asgT[by.a]] - tLoad[asgT[bx.a]] || rand() - 0.5;
  });

  function roomConf(b, d, st) {
    // เลือกห้องที่ชนน้อยที่สุด (สุ่มลำดับเพื่อกระจายการใช้ห้อง)
    let best = -1, bc = Infinity;
    const off = Math.floor(rand() * b.rooms.length);
    for (let j = 0; j < b.rooms.length; j++) {
      const r = b.rooms[(j + off) % b.rooms.length];
      let c = 0;
      if (!roomMulti[r]) for (let k = 0; k < b.len; k++) if (rOcc[r * NS + d * NP + st + k] > 0) c++;
      if (c < bc) { bc = c; best = r; if (c === 0) break; }
    }
    return [best, bc];
  }

  function bestPlace(bi, noise) {
    const b = blocks[bi];
    let bestD = -1, bestS = -1, bestR = -1, bestV = Infinity;
    for (const d of b.days) for (const st of b.starts) {
      b.day = d; b.start = st; b.room = -1;
      const dv = apply(bi, 1);
      apply(bi, -1);
      const [r, rc] = roomConf(b, d, st);
      const v = dv + rc * W.HARD + noise * rand();
      if (v < bestV) { bestV = v; bestD = d; bestS = st; bestR = r; }
    }
    b.day = bestD; b.start = bestS; b.room = bestR;
    return apply(bi, 1);
  }

  prog(3, 10);
  log('Builder: วางคาบเรียนเริ่มต้น เรียงจากรายการที่มีทางเลือกน้อยที่สุดก่อน');
  let lastPost = now();
  for (let k = 0; k < order.length; k++) {
    cost += bestPlace(order[k], 1.5);
    if (now() - lastPost > 100) { lastPost = now(); prog(3, 10 + Math.round((k / order.length) * 20)); }
  }
  cost += staticCost;
  const buildCost = cost;
  const hardOf = (c) => Math.floor(c / W.HARD);
  log(`Builder: วางครบ ${B} ช่วงคาบ ต้นทุนเริ่มต้น = ${cost} (ข้อขัดแย้งบังคับประมาณ ${hardOf(cost)} จุด)`);

  // ---------- 4) Repairer: Simulated Annealing + Min-Conflicts ----------
  const bestSnap = { cost: Infinity };
  function snapshot() {
    bestSnap.cost = cost;
    bestSnap.day = blocks.map((b) => b.day);
    bestSnap.start = blocks.map((b) => b.start);
    bestSnap.room = blocks.map((b) => b.room);
    bestSnap.teacher = Array.from(asgT);
  }
  snapshot();
  const history = [{ t: Math.round(now() - t0), cost, hard: hardOf(cost) }];

  function inConflict(bi) {
    const b = blocks[bi], t = asgT[b.a], g = assignments[b.a].g;
    for (let k = 0; k < b.len; k++) {
      const s = b.day * NP + b.start + k;
      if (tOcc[t * NS + s] > 1 || gOcc[g * NS + s] > 1 || unav[t * NS + s] === 2) return true;
      if (b.room >= 0 && !roomMulti[b.room] && rOcc[b.room * NS + s] > 1) return true;
    }
    return false;
  }
  const flexBlocks = blocks.map((b, i) => i).filter((i) => !blocks[i].fixed);
  const multiCand = assignments.map((a, i) => i).filter((i) => assignments[i].cands.length > 1);
  const byGroupLen = new Map();
  flexBlocks.forEach((bi) => { const k = assignments[blocks[bi].a].g + ':' + blocks[bi].len; if (!byGroupLen.has(k)) byGroupLen.set(k, []); byGroupLen.get(k).push(bi); });

  prog(4, 30, { cost, hard: hardOf(cost), best: cost, iter: 0 });
  log('Repairer: ค้นหาเฉพาะจุดแบบ Simulated Annealing เน้นแก้คาบที่ชนก่อน');
  let temp = 40, iter = 0, lastImprove = 0;
  const tEnd = 0.05;
  let cancelled = false, reheats = 0, lastReheatLog = 0, reheatBase = 0, firstFeasible = -1, stopReason = '';

  const pickBlock = () => {
    if (hardOf(cost) > 0 && rand() < 0.7) {
      for (let tries = 0; tries < 12; tries++) {
        const bi = Math.floor(rand() * B);
        if (inConflict(bi)) return bi;
      }
    }
    return Math.floor(rand() * B);
  };
  const accept = (delta) => delta <= 0 || rand() < Math.exp(-delta / temp);

  while (true) {
    iter++;
    const mt = rand();
    if (mt < 0.08 && multiCand.length) {
      // เปลี่ยนครูผู้สอน (เลือกจากครูที่กำหนดในข้อมูล)
      const ai = multiCand[Math.floor(rand() * multiCand.length)];
      const a = assignments[ai];
      const old = asgT[ai];
      const nt = a.cands[Math.floor(rand() * a.cands.length)];
      if (nt !== old) {
        let delta = 0;
        for (const bi of asgBlocks[ai]) delta += apply(bi, -1);
        const s0 = staticCost;
        tHours[old] -= a.periods; tHours[nt] += a.periods; asgT[ai] = nt;
        staticCost = recomputeStatic();
        delta += staticCost - s0;
        for (const bi of asgBlocks[ai]) delta += apply(bi, 1);
        if (accept(delta)) cost += delta;
        else {
          for (const bi of asgBlocks[ai]) apply(bi, -1);
          tHours[nt] -= a.periods; tHours[old] += a.periods; asgT[ai] = old;
          staticCost = s0;
          for (const bi of asgBlocks[ai]) apply(bi, 1);
        }
      }
    } else if (mt < 0.2) {
      // สลับเวลาของสองช่วงคาบในกลุ่มเดียวกันที่ยาวเท่ากัน
      const bi = flexBlocks[Math.floor(rand() * flexBlocks.length)];
      if (bi !== undefined) {
        const b = blocks[bi];
        const list = byGroupLen.get(assignments[b.a].g + ':' + b.len);
        const bj = list[Math.floor(rand() * list.length)];
        if (bj !== bi) {
          const c = blocks[bj];
          let delta = apply(bi, -1) + apply(bj, -1);
          const bd = b.day, bs = b.start, br = b.room;
          b.day = c.day; b.start = c.start; c.day = bd; c.start = bs;
          if (!b.rooms.includes(c.room) || !c.rooms.includes(br)) { /* คงห้องเดิม */ } else { b.room = c.room; c.room = br; }
          delta += apply(bi, 1) + apply(bj, 1);
          if (accept(delta)) cost += delta;
          else {
            apply(bi, -1); apply(bj, -1);
            c.day = b.day; c.start = b.start; b.day = bd; b.start = bs;
            if (b.room !== br) { c.room = b.room; b.room = br; }
            apply(bi, 1); apply(bj, 1);
          }
        }
      }
    } else if (mt < 0.27) {
      // ย้ายไปตำแหน่งที่ดีที่สุด (min-conflicts)
      const bi = pickBlock();
      const b = blocks[bi];
      const od = b.day, os = b.start, orr = b.room;
      let delta = apply(bi, -1);
      delta += bestPlace(bi, 0.5);
      if (accept(delta)) cost += delta;
      else { apply(bi, -1); b.day = od; b.start = os; b.room = orr; apply(bi, 1); }
    } else {
      // ย้ายแบบสุ่ม (เวลาและ/หรือห้อง)
      const bi = pickBlock();
      const b = blocks[bi];
      const od = b.day, os = b.start, orr = b.room;
      let delta = apply(bi, -1);
      if (!b.fixed && rand() < 0.85) {
        b.day = b.days[Math.floor(rand() * b.days.length)];
        b.start = b.starts[Math.floor(rand() * b.starts.length)];
      }
      if (rand() < 0.5 || b.room < 0) b.room = b.rooms[Math.floor(rand() * b.rooms.length)];
      delta += apply(bi, 1);
      if (accept(delta)) cost += delta;
      else { apply(bi, -1); b.day = od; b.start = os; b.room = orr; apply(bi, 1); }
    }

    if (cost < bestSnap.cost - 1e-9) { snapshot(); lastImprove = iter; }

    if ((iter & 511) === 0) {
      const frac = iter / maxIter;
      // ลดอุณหภูมิตามจำนวนรอบ และอุ่นใหม่เมื่อติด
      if (iter - lastImprove > 60000 && hardOf(bestSnap.cost) > 0) {
        temp = 25; lastImprove = iter; reheats++; reheatBase = iter;
        if (now() - lastReheatLog > 3000) { lastReheatLog = now(); log(`Repairer: ติดค่าต่ำสุดเฉพาะที่ เพิ่มอุณหภูมิเพื่อค้นหาใหม่ (ครั้งที่ ${reheats})`); }
      } else {
        const f = Math.min(1, frac * 1.1 + Math.max(0, (iter - reheatBase) / maxIter) * 0.0);
        temp = 40 * Math.pow(tEnd / 40, f);
        if (reheats && iter - reheatBase < 50000) temp = Math.max(temp, 25 * Math.pow(0.02, (iter - reheatBase) / 50000));
      }
      if (hardOf(bestSnap.cost) === 0 && firstFeasible < 0) { firstFeasible = Math.round(now() - t0); log(`Repairer: พบตารางที่ไม่ละเมิดเงื่อนไขบังคับครั้งแรก ที่ ${(firstFeasible / 1000).toFixed(2)} วินาที (รอบที่ ${iter.toLocaleString()})`); }
      if (now() - lastPost > 120) {
        lastPost = now();
        if (history.length < 400) history.push({ t: Math.round(now() - t0), cost: bestSnap.cost, hard: hardOf(bestSnap.cost) });
        prog(4, 30 + Math.round(Math.min(1, frac) * 65), { cost, hard: hardOf(cost), best: bestSnap.cost, bestHard: hardOf(bestSnap.cost), iter, maxIter, temp: +temp.toFixed(2) });
        if (opts.shouldStop && opts.shouldStop()) { cancelled = true; break; }
      }
      if (iter >= maxIter) { stopReason = 'ครบจำนวนรอบที่กำหนด'; break; }
      if (now() - t0 > safetyMs) { stopReason = 'ครบเวลาสูงสุด (ผลอาจไม่ซ้ำเดิมทุกครั้ง)'; break; }
      if (hardOf(bestSnap.cost) === 0 && iter - lastImprove > Math.max(300000, maxIter * 0.12) && frac > 0.2) { stopReason = 'ไม่มีข้อขัดแย้งบังคับ และคะแนนคงที่แล้ว'; break; }
      if (bestSnap.cost === 0) { stopReason = 'ได้คำตอบที่ไม่ละเมิดเงื่อนไขใดเลย'; break; }
    }
  }
  log(`Repairer: หยุดค้นหา เพราะ${stopReason}`);
  history.push({ t: Math.round(now() - t0), cost: bestSnap.cost, hard: hardOf(bestSnap.cost) });

  // คืนสถานะดีที่สุด
  const placements = blocks.map((b, i) => {
    const a = assignments[b.a];
    return { a: b.a, g: a.g, s: a.s, t: bestSnap.teacher[b.a], r: bestSnap.room[i], day: bestSnap.day[i], start: bestSnap.start[i], len: b.len };
  });
  log(`Repairer: จบการค้นหา ${iter.toLocaleString()} รอบ ต้นทุนดีที่สุด = ${Math.round(bestSnap.cost)} (ข้อขัดแย้งบังคับ ${hardOf(bestSnap.cost)})`);
  return {
    placements, seed, iterations: iter, maxIter, elapsedMs: Math.round(now() - t0), cost: Math.round(bestSnap.cost * 100) / 100,
    hardEstimate: hardOf(bestSnap.cost), history, cancelled, firstFeasibleMs: firstFeasible, stopReason, reheats, buildCost: Math.round(buildCost), buildHard: hardOf(buildCost),
  };
}

// วิธีพื้นฐาน (First-Fit) สำหรับเปรียบเทียบ: เรียงตามข้อมูลนำเข้า ใช้ครูคนแรก วางช่องแรกที่กลุ่มว่าง ไม่มีการแก้ไขภายหลัง
export function baselineFirstFit(model) {
  const { assignments, groups, rooms } = model;
  const gOcc = new Uint8Array(groups.length * NS);
  const placements = [];
  assignments.forEach((a, ai) => {
    const sj = model.subjects[a.s];
    a.blocks.forEach((len) => {
      let day = -1, start = -1;
      if (sj.fixed) { day = sj.fixed.day; start = sj.fixed.start; }
      else {
        outer: for (let d = 0; d < ND; d++) for (const st of startsFor(len)) {
          let ok = true;
          for (let k = 0; k < len; k++) if (gOcc[a.g * NS + d * NP + st + k]) { ok = false; break; }
          if (ok) { day = d; start = st; break outer; }
        }
        if (day < 0) { day = 0; start = startsFor(len)[0]; }
      }
      for (let k = 0; k < len; k++) gOcc[a.g * NS + day * NP + start + k] = 1;
      const r = a.rooms && a.rooms.length ? a.rooms[0] : 0;
      placements.push({ a: ai, g: a.g, s: a.s, t: a.cands[0], r: rooms.length ? r : -1, day, start, len });
    });
  });
  return { placements };
}
