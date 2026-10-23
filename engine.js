'use strict';
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => ((a - b) % TAU + TAU + Math.PI) % TAU - Math.PI;

// segment vs rect [x,y,w,h]; returns entry t (0..1) or null
function segRect(x1, y1, x2, y2, w) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - w[0], w[0] + w[2] - x1, y1 - w[1], w[1] + w[3] - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return t0;
}
function losClear(x1, y1, x2, y2, walls) {
  for (const w of walls) if (segRect(x1, y1, x2, y2, w) !== null) return false;
  return true;
}
function clearWide(x1, y1, x2, y2, walls, hw) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d * hw, ny = dx / d * hw;
  return losClear(x1, y1, x2, y2, walls) &&
         losClear(x1 + nx, y1 + ny, x2 + nx, y2 + ny, walls) &&
         losClear(x1 - nx, y1 - ny, x2 - nx, y2 - ny, walls);
}
function castRay(x, y, a, max, walls) {
  const x2 = x + Math.cos(a) * max, y2 = y + Math.sin(a) * max;
  let best = 1;
  for (const w of walls) { const t = segRect(x, y, x2, y2, w); if (t !== null && t < best) best = t; }
  return best * max;
}
function segPointDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(x1 + dx * t - px, y1 + dy * t - py);
}
function pushOut(o, walls) {
  if (o.r && isFinite(o.x) && isFinite(o.y)) { o.x = clamp(o.x, 20 + o.r, W - 20 - o.r); o.y = clamp(o.y, 20 + o.r, H - 20 - o.r); }   // never leave the arena
  for (const w of walls) {
    const cx = clamp(o.x, w[0], w[0] + w[2]), cy = clamp(o.y, w[1], w[1] + w[3]);
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    if (d < o.r) {
      if (d > 0.0001) { o.x += dx / d * (o.r - d); o.y += dy / d * (o.r - d); }
      else {
        const l = o.x - w[0], r = w[0] + w[2] - o.x, t = o.y - w[1], b = w[1] + w[3] - o.y;
        const m = Math.min(l, r, t, b);
        if (m === l) o.x = w[0] - o.r; else if (m === r) o.x = w[0] + w[2] + o.r;
        else if (m === t) o.y = w[1] - o.r; else o.y = w[1] + w[3] + o.r;
      }
    }
  }
}

// ---- navigation grid (BFS distance fields) ----
let blocked = null;
const fieldCache = new Map();
function buildNav(walls) {
  blocked = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const cx = (gx + .5) * CS, cy = (gy + .5) * CS;
    for (const w of walls) {
      if (cx > w[0] - 15 && cx < w[0] + w[2] + 15 && cy > w[1] - 15 && cy < w[1] + w[3] + 15) { blocked[gy * GW + gx] = 1; break; }
    }
  }
  fieldCache.clear();
}
function cellOf(x, y) { return clamp(y / CS | 0, 0, GH - 1) * GW + clamp(x / CS | 0, 0, GW - 1); }
function field(tx, ty) {
  const k = cellOf(tx, ty);
  let f = fieldCache.get(k);
  if (f) return f;
  f = new Int16Array(GW * GH).fill(-1);
  const q = [k]; f[k] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], cx = c % GW, cy = c / GW | 0, dc = f[c];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (f[n] !== -1 || blocked[n]) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
      f[n] = dc + 1; q.push(n);
    }
  }
  fieldCache.set(k, f);
  return f;
}
function nextStep(x, y, tx, ty) {
  const f = field(tx, ty), c = cellOf(x, y), cx = c % GW, cy = c / GW | 0;
  let best = f[c] < 0 ? 1e9 : f[c], bx = -1, by = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const n = ny * GW + nx;
    if (f[n] < 0) continue;
    if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
    if (f[n] < best) { best = f[n]; bx = nx; by = ny; }
  }
  if (bx < 0) return [tx, ty];
  return [(bx + .5) * CS, (by + .5) * CS];
}

// ---- tiny audio ----
let AC = null;
function beep(f, d, type, v, slide) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), AC.currentTime + d);
    g.gain.value = v || .04;
    g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d);
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d);
  } catch (e) {}
}
