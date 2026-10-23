'use strict';
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
const FONT = '"Noto Sans Thai", "Segoe UI", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const C = { floor: '#12151a', grid: '#181c22', wall: '#262d37', wallTop: '#3b4552', wallShadow: '#0a0c0f',
  red: '#ff3347', steel: '#6d8fb3', elite: '#8db4dc', ring: '#37e6d4' };

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawFloor() {
  ctx.fillStyle = C.floor; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 40; x < W; x += 40) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); }
  for (let y = 40; y < H; y += 40) { ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); }
  ctx.stroke();
  for (const d of G.decals) {
    ctx.fillStyle = 'rgba(120,10,24,.45)';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,6,18,.5)';
    ctx.beginPath(); ctx.arc(d.x + 6, d.y - 4, d.r * .55, 0, TAU); ctx.fill();
  }
}
function drawWalls() {
  for (const w of G.walls) {
    ctx.fillStyle = C.wallShadow; ctx.fillRect(w[0] + 3, w[1] + 4, w[2], w[3]);
  }
  for (const w of G.walls) {
    ctx.fillStyle = C.wall; ctx.fillRect(w[0], w[1], w[2], w[3]);
    ctx.strokeStyle = C.wallTop; ctx.lineWidth = 1.5; ctx.strokeRect(w[0] + .75, w[1] + .75, w[2] - 1.5, w[3] - 1.5);
  }
}
function coneSector(e, half, range, n, col, a0, a1) {
  ctx.beginPath(); ctx.moveTo(e.x, e.y);
  for (let i = 0; i <= n; i++) {
    const a = e.ang - half + (i / n) * half * 2;
    const d = castRay(e.x, e.y, a, range, G.walls);
    ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
  }
  ctx.closePath();
  const gr = ctx.createRadialGradient(e.x, e.y, 6, e.x, e.y, range);
  gr.addColorStop(0, `rgba(${col},${a0})`); gr.addColorStop(1, `rgba(${col},${a1})`);
  ctx.fillStyle = gr; ctx.fill();
}
function drawCone(e) {
  if (e.state === 'chase') return;
  const range = visRange(e);
  const col = e.state === 'search' ? '255,110,70' : e.state === 'sus' ? '255,170,60' : '255,226,120';
  coneSector(e, VIS.core, range, 26, col, .24, .02);                  // central cone: full detection
  coneSector(e, VIS.per, range * VIS.perR, 24, col, .10, .01);           // peripheral cone: slow detection, short range
}
function drawGunIcon(x, y, a, type, len) {
  const gn = GUNS[type];
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = gn.color; ctx.fillRect(0, -2.5, len, 5);
  ctx.fillStyle = '#10141a'; ctx.fillRect(0, -1, len * .35, 2);
  ctx.restore();
}
function drawEnemy(e) {
  if (e.dead) {
    ctx.fillStyle = 'rgba(110,130,155,.28)';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * .9, 0, TAU); ctx.fill();
    return;
  }
  const col = e.boss ? e.color : (e.elite ? C.elite : C.steel);
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.rage > 0) { ctx.fillStyle = 'rgba(255,170,60,.22)'; ctx.beginPath(); ctx.arc(0, 0, e.r + 8, 0, TAU); ctx.fill(); }
  if (e.sandWarn > 0) {   // charging up Sandevistan
    const k = 1 - e.sandWarn / .7;
    ctx.strokeStyle = `rgba(63,242,230,${.35 + .5 * Math.sin(k * 30) ** 2})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 6 + k * 26, 0, TAU); ctx.stroke();
  }
  if (e.boss) { ctx.fillStyle = col + '30'; ctx.beginPath(); ctx.arc(0, 0, e.r + 7, 0, TAU); ctx.fill(); }
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : col;
  ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = e.boss ? '#fff' : '#0e1217'; ctx.stroke();
  if (e.elite) { ctx.strokeStyle = C.ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 3.5, 0, TAU); ctx.stroke(); }
  ctx.rotate(e.ang);
  ctx.fillStyle = '#0e1217'; ctx.beginPath(); ctx.arc(e.r * .45, 0, e.r * .42, -1.1, 1.1); ctx.lineTo(e.r * .1, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  drawGunIcon(e.x, e.y, e.ang, e.gun, e.r + 9);
  if (e.state === 'chase') { ctx.font = `800 17px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5a5a'; ctx.fillText('!', e.x, e.y - e.r - 8); }
  else if (e.state === 'sus') { ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb347'; ctx.fillText('?', e.x, e.y - e.r - 8); }
  else if (e.state === 'search') { ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a4a'; ctx.fillText('?', e.x, e.y - e.r - 8);
    ctx.strokeStyle = 'rgba(255,106,74,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y - e.r - 14, 9, 0, TAU); ctx.stroke(); }
  if (e.meter > .04 && e.state !== 'chase') {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(e.x - 14, e.y - e.r - 20, 28, 4);
    ctx.fillStyle = e.meter > .6 ? '#ff6a4a' : '#ffd166'; ctx.fillRect(e.x - 14, e.y - e.r - 20, 28 * Math.min(1, e.meter), 4);
  }
  if (e.hp < e.max && !e.boss) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(e.x - 12, e.y + e.r + 5, 24, 3);
    ctx.fillStyle = '#9fe870'; ctx.fillRect(e.x - 12, e.y + e.r + 5, 24 * e.hp / e.max, 3);
  }
}
const SAND_STOPS = [[0, 63, 242, 230], [.25, 74, 123, 255], [.5, 155, 92, 255], [.75, 184, 212, 58], [1, 138, 58, 74]];
function sandCol(u) {   // u: 0 = newest copy, 1 = oldest
  for (let i = 1; i < SAND_STOPS.length; i++) {
    const a = SAND_STOPS[i - 1], b = SAND_STOPS[i];
    if (u <= b[0]) { const f = (u - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f].map(Math.round); }
  }
  return SAND_STOPS[SAND_STOPS.length - 1].slice(1);
}
function drawGhosts() {
  const g = G, p = g.p;
  for (const gh of g.ghosts) {
    const k = gh.t / gh.max;
    if (gh.sand) {
      const c = sandCol(1 - k).join(',');
      ctx.save(); ctx.translate(gh.x, gh.y);
      ctx.globalAlpha = .1 + .42 * k;
      ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
      ctx.rotate(gh.ang); ctx.globalAlpha = .08 + .3 * k;   // shoulders + facing nub, so each copy reads as a body, not a dot
      ctx.beginPath(); ctx.ellipse(-1, 0, p.r * .55, p.r * 1.25, 0, 0, TAU); ctx.fill();
      if (gh.gun && GUNS[gh.gun]) { ctx.globalAlpha = .12 + .4 * k; ctx.fillRect(0, -2.5, 26, 5); }   // the held gun leaves a copy too
      else { ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(24, 0); ctx.lineTo(12, 2); ctx.fill(); }   // knife
      ctx.globalAlpha = .15 + .35 * k; ctx.strokeStyle = `rgba(${c},1)`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.save(); ctx.globalAlpha = k * .55;
    ctx.fillStyle = gh.c || (k > .5 ? '#ff3347' : '#37e6d4');
    ctx.beginPath(); ctx.arc(gh.x, gh.y, gh.r || p.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = k * .35; ctx.strokeStyle = '#ffd5da'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
}
function drawPlayer() {
  const p = G.p;
  drawGhosts();
  const a = p.invis > 0 ? .38 : (p.inv > 0 ? .6 : 1);
  ctx.save(); ctx.globalAlpha = a;
  if (p.blade > 0) {
    for (let i = 0; i < 4; i++) {
      const t = G.time * 9 + i * TAU / 4, bx = p.x + Math.cos(t) * 62, by = p.y + Math.sin(t) * 62;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(t + 1.57);
      ctx.fillStyle = '#ffd7dc'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,215,220,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 62, 0, TAU); ctx.stroke();
  }
  if (G.pslowT > 0 && G.pf < 1) {
    ctx.strokeStyle = 'rgba(63,242,230,.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10, G.time * -2, G.time * -2 + TAU * .85); ctx.stroke(); ctx.setLineDash([]);
  }
  if (G.slowT > 0) {
    const pulse = 1 + Math.sin(G.time * 40 + performance.now() / 60) * .08;
    ctx.strokeStyle = 'rgba(63,242,230,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 8) * pulse, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(155,92,255,.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, (p.r + 15) * pulse, 0, TAU); ctx.stroke();
  }
  if (p.stabAnim > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 34, p.ang - .9 + (1 - p.stabAnim / .18) * 1.2, p.ang - .4 + (1 - p.stabAnim / .18) * 1.2); ctx.stroke();
  }
  if (p.gun) drawGunIcon(p.x, p.y, p.ang, p.gun.type, 26);
  else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.fillStyle = '#dfe6ee'; ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(24, 0); ctx.lineTo(12, 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
  const rad = p.sneak ? p.r - 1.5 : p.r;
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : C.red;
  ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffd5da'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(p.x - 3.5, p.y - 3.5, rad * .32, 0, TAU); ctx.fill();
  if (p.sneak) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
function drawDrops() {
  for (const d of G.drops) {
    if (d.kind === 'med') {
      ctx.fillStyle = '#2bd66b'; ctx.fillRect(d.x - 3, d.y - 8, 6, 16); ctx.fillRect(d.x - 8, d.y - 3, 16, 6);
      continue;
    }
    const gn = GUNS[d.gun], near = G.prompt === d;
    if (d.ammo <= 0) {   // spent gun: dim, fades out before it disappears
      ctx.save(); ctx.globalAlpha = Math.min(.45, (d.exp - G.rt) * .3); ctx.fillStyle = '#6d7683';
      ctx.fillRect(d.x - 9, d.y - 2.5, 18, 5); ctx.fillRect(d.x - 3, d.y + 2, 5, 6); ctx.restore();
      continue;
    }
    ctx.strokeStyle = near ? '#fff' : gn.color + '88'; ctx.lineWidth = near ? 2 : 1;
    ctx.beginPath(); ctx.arc(d.x, d.y, 15 + Math.sin(G.time * 4) * 1.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = gn.color; ctx.fillRect(d.x - 9, d.y - 2.5, 18, 5); ctx.fillRect(d.x - 3, d.y + 2, 5, 6);
  }
}
function drawSmokes() {
  for (const s of G.smokes) {
    const k = Math.min(1, s.t / 1.2, (s.max - s.t) * 3 + .2);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + G.time * .3, ox = Math.cos(a) * s.r * .35, oy = Math.sin(a) * s.r * .35;
      const gr = ctx.createRadialGradient(s.x + ox, s.y + oy, 4, s.x + ox, s.y + oy, s.r * .75);
      gr.addColorStop(0, `rgba(190,200,215,${.5 * k})`); gr.addColorStop(1, 'rgba(190,200,215,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, s.r * .75, 0, TAU); ctx.fill();
    }
  }
}
function drawGrenades() {
  for (const gr of G.grenades) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(gr.x, gr.y + 3, 6, 3, 0, 0, TAU); ctx.fill();   // ground shadow
    ctx.save(); ctx.translate(gr.x, gr.y - gr.z); ctx.rotate(G.time * 14);
    ctx.fillStyle = '#aab4c2'; ctx.fillRect(-5, -7, 10, 14); ctx.fillStyle = '#37e6d4'; ctx.fillRect(-5, -2, 10, 3);
    ctx.restore();
  }
}
function drawBullets() {
  for (const b of G.bullets) {
    ctx.strokeStyle = b.col; ctx.lineWidth = b.own === 'k' ? 4 : 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * .018, b.y - b.vy * .018); ctx.stroke();
    if (b.own === 'e') { ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
    if (G.stopT > 0) {   // frozen in time: glowing ring + faint line showing where it will fly when time resumes
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      ctx.strokeStyle = 'rgba(140,190,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + ux * 38, b.y + uy * 38); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(190,225,255,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3 + Math.sin(G.time * 10) * .8, 0, TAU); ctx.stroke();
    }
  }
}
function drawFx() {
  for (const f of G.fx) {
    ctx.globalAlpha = Math.max(0, f.t / f.max) * .9; ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const r of G.rings) {
    ctx.strokeStyle = `rgba(255,255,255,${r.t * .5})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.font = `700 13px ${FONT}`;
  for (const t of G.texts) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y); }
  ctx.globalAlpha = 1;
}

function drawDebug() {
  ctx.font = `600 10px ${MONO}`; ctx.textAlign = 'center';
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.tgt && e.state !== 'patrol') { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tgt.x, e.tgt.y); ctx.stroke(); ctx.setLineDash([]); }
    if (e.sr && e.sr.pts) for (const q of e.sr.pts) { ctx.strokeStyle = 'rgba(255,106,74,.6)'; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#fff';
    const tk = e.state === 'chase' && !e.boss ? (e.token ? ' [ATK:' + (e.tac ? e.tac.ph : '') + ']' : ' [FLANK]') : '';
    if (e.tac && e.tac.cov && e.state === 'chase') { ctx.strokeStyle = 'rgba(90,200,255,.7)'; ctx.strokeRect(e.tac.cov.x - 6, e.tac.cov.y - 6, 12, 12); if (e.tac.pk) { ctx.strokeStyle = 'rgba(255,220,90,.7)'; ctx.beginPath(); ctx.arc(e.tac.pk.x, e.tac.pk.y, 5, 0, TAU); ctx.stroke(); } }
    ctx.fillText(`${e.state}${e.sr ? ':' + e.sr.stage : ''}${tk} m=${e.meter.toFixed(2)}`, e.x, e.y + e.r + 18);
  }
}
function hudBox(x, y, w, h, label, sub, frac, ready, col) {
  ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = ready ? col : 'rgba(255,255,255,.12)'; rr(x, y, w * frac, h, 4); ctx.save(); ctx.clip(); ctx.fillRect(x, y, w * frac, h); ctx.restore();
  ctx.strokeStyle = ready ? col : 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; rr(x + .5, y + .5, w - 1, h - 1, 4); ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = ready ? '#fff' : '#cbd1d9';
  ctx.font = `700 11px ${MONO}`; ctx.fillText(label, x + 8, y + 14);
  ctx.font = `600 12px ${FONT}`; ctx.fillText(sub, x + 8, y + 29);
}
function drawHUD() {
  const g = G, p = g.p, ch = g.ch;
  // hp
  ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(30, 30, 214, 22, 4); ctx.fill();
  ctx.fillStyle = C.red; rr(34, 34, 206 * Math.max(0, p.hp / p.max), 14, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 11px ${MONO}`; ctx.textAlign = 'left'; ctx.fillText('HP ' + Math.ceil(Math.max(0, p.hp)), 40, 45);
  // skill + ult
  const cdFrac = p.skCd > 0 ? 1 - p.skCd / ch.sk.cd : 1;
  hudBox(30, 58, 104, 36, p.skCd > 0 ? 'Q  ' + p.skCd.toFixed(1) + 's' : 'Q  พร้อม', ch.sk.n, cdFrac, p.skCd <= 0, '#c72b3b');
  hudBox(140, 58, 104, 36, p.ult >= 100 ? 'R  พร้อม' : 'R  ' + Math.floor(p.ult) + '%', ch.ult.n, p.ult / 100, p.ult >= 100, '#ff3347');
  // top center
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(W / 2 - 110, 28, 220, 26, 4); ctx.fill();
  const left = g.enemies.filter(e => !e.dead).length;
  ctx.fillStyle = '#e9e6e1'; ctx.font = `600 13px ${FONT}`; ctx.fillText(`${g.M.name}  ·  เหลือ ${left}`, W / 2, 46);
  const boss = g.enemies.find(e => e.boss && !e.dead);
  if (boss) {
    ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(W / 2 - 180, 60, 360, 20, 4); ctx.fill();
    ctx.fillStyle = boss.color; rr(W / 2 - 177, 63, 354 * Math.max(0, boss.hp / boss.max), 14, 3); ctx.fill();
    ctx.fillStyle = '#0b0d10'; ctx.font = `800 11px ${MONO}`; ctx.fillText(BOSSES[boss.type].name, W / 2, 74);
  }
  if (g.slowT > 0) {
    const bw = 220, bx = W / 2 - bw / 2, by = boss ? 86 : 60;
    ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(bx, by, bw, 18, 4); ctx.fill();
    ctx.fillStyle = '#37e6d4'; rr(bx + 3, by + 3, (bw - 6) * (g.slowT / g.slowMax), 12, 3); ctx.fill();
    ctx.fillStyle = '#0b0d10'; ctx.font = `800 10px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText('SANDEVISTAN  ' + g.slowT.toFixed(1) + 's', W / 2, by + 13);
  }
  if (g.pslowT > 0) {
    const bw = 260, bx = W / 2 - bw / 2, by = (boss ? 86 : 60) + (g.slowT > 0 ? 22 : 0);
    ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(bx, by, bw, 18, 4); ctx.fill();
    ctx.fillStyle = '#37e6d4'; rr(bx + 3, by + 3, (bw - 6) * (g.pslowT / g.pslowMax), 12, 3); ctx.fill();
    ctx.fillStyle = '#0b0d10'; ctx.font = `800 10px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText(g.clash ? 'ปะทะ Sandevistan · ความเร็วเท่ากัน  ' + g.pslowT.toFixed(1) + 's' : 'เวลาถูกหน่วง  ' + g.pslowT.toFixed(1) + 's' + (g.p.ult >= 100 ? '  ·  กด R ทำลายสนาม' : ''), W / 2, by + 13);
  }
  // base alertness (raised by detections, decays when things calm down)
  { const lv = Math.ceil(g.alertLvl - .001); ctx.textAlign = 'center'; ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = lv ? '#ff9f68' : '#6c7580'; ctx.fillText('ความตื่นตัว ' + '●'.repeat(lv) + '○'.repeat(3 - lv), W / 2, H - 30); }
  // weapon
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(10,12,16,.78)'; rr(W - 250, 30, 220, 36, 4); ctx.fill();
  if (p.gun) {
    const gn = GUNS[p.gun.type];
    ctx.fillStyle = gn.color; ctx.font = `600 13px ${FONT}`; ctx.fillText(gn.name, W - 120, 46);
    ctx.fillStyle = p.gun.ammo > 0 ? '#fff' : '#ff6b6b'; ctx.font = `700 15px ${MONO}`; ctx.fillText(p.gun.ammo > 0 ? p.gun.ammo + ' นัด' : 'หมด', W - 40, 56);
  } else { ctx.fillStyle = '#cbd1d9'; ctx.font = `600 13px ${FONT}`; ctx.fillText('มีด (ไม่มีปืน)', W - 40, 52); }
  // pickup prompt
  if (g.prompt && g.state === 'play') {
    const d = g.prompt, gn = GUNS[d.gun];
    ctx.textAlign = 'center'; ctx.font = `700 13px ${FONT}`;
    const s = `${window.touchUI ? 'แตะ E' : '[E]'} หยิบ${gn.name} (${d.ammo})`, tw = ctx.measureText(s).width + 16;
    ctx.fillStyle = 'rgba(10,12,16,.85)'; rr(d.x - tw / 2, d.y - 44, tw, 22, 4); ctx.fill();
    ctx.fillStyle = gn.color; ctx.fillText(s, d.x, d.y - 28);
  }
  // intro
  if (g.time < 3.2) {
    ctx.globalAlpha = Math.min(1, (3.2 - g.time) * 1.2);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = `800 34px "Big Shoulders Display", ${FONT}`;
    ctx.fillText(`ด่าน ${g.mi + 1} · ${g.M.name}`, W / 2, H / 2 - 70);
    ctx.fillStyle = '#c9ced6'; ctx.font = `500 14px ${FONT}`; ctx.fillText(g.M.sub, W / 2, H / 2 - 44);
    ctx.globalAlpha = 1;
  }
}

function draw() {
  const g = G;
  ctx.save();
  if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake) * .5, rand(-g.shake, g.shake) * .5);
  drawFloor(); drawDrops();
  for (const e of g.enemies) if (!e.dead) drawCone(e);
  drawSmokes();
  for (const e of g.enemies) if (e.dead) drawEnemy(e);
  for (const e of g.enemies) if (!e.dead) {
    drawEnemy(e);
    if (g.slowT > 0 && !(e.boss && g.clash)) {   // the slowed world goes mint-green, like the clip
      ctx.fillStyle = 'rgba(110,255,195,.38)'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 1, 0, TAU); ctx.fill();
    }
  }
  drawPlayer(); drawGrenades(); drawBullets(); drawWalls(); drawFx();
  if (g.debug) drawDebug();
  if (g.stopT > 0) { ctx.fillStyle = 'rgba(110,160,255,.13)'; ctx.fillRect(0, 0, W, H); }
  if (g.pslowT > 0) {   // WRAITH's field: same teal-green wash as the player's Sandevistan, edges pulled in
    const k = Math.min(1, g.pslowT / .3, (g.pslowMax - g.pslowT) / .15 + .3);
    ctx.fillStyle = `rgba(30,235,185,${.1 * k})`; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .8);
    vg.addColorStop(0, 'rgba(0,20,16,0)'); vg.addColorStop(1, `rgba(0,18,14,${.3 * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  if (g.slowT > 0) {   // Sandevistan: teal-green wash, crushed dark edges, scanlines, speed streaks right after the flash
    const deep = g.slowF < .1, k = Math.min(1, g.slowT / .3, (g.slowMax - g.slowT) / .12 + .3);
    ctx.fillStyle = `rgba(30,235,185,${(deep ? .2 : .1) * k})`; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .85);
    vg.addColorStop(0, 'rgba(0,20,16,0)'); vg.addColorStop(1, `rgba(0,18,14,${(deep ? .62 : .3) * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (deep) { ctx.fillStyle = `rgba(0,0,0,${.12 * k})`; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1); }
    const since = g.slowMax - g.slowT;
    if (deep && since < .55) {
      const f = 1 - since / .55;
      for (let i = 0; i < 9; i++) {
        const y = ((i * 197 + Math.floor(g.rt * 30) * 53) % H), h = 6 + (i * 37) % 26, x = ((i * 113 + Math.floor(g.rt * 30) * 71) % 400) - 100;
        ctx.fillStyle = `rgba(90,255,235,${.22 * f})`; ctx.fillRect(x, y, W, h);
      }
    }
  }
  if (g.p.hp < g.p.max * .3 && g.state === 'play') { ctx.fillStyle = `rgba(255,30,50,${.06 + Math.sin(g.time * 8) * .03})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  drawHUD();
  if (g.sandIntro > 0) drawSandIntro();
  // crosshair
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 7, 0, TAU); ctx.moveTo(mouse.x - 11, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y);
  ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + 11, mouse.y); ctx.moveTo(mouse.x, mouse.y - 11); ctx.lineTo(mouse.x, mouse.y - 4);
  ctx.moveTo(mouse.x, mouse.y + 4); ctx.lineTo(mouse.x, mouse.y + 11); ctx.stroke();
}

// ---- Sandevistan activation: white flash -> cyan wipe with horizontal speed streaks ----
function drawSandIntro() {
  const g = G, u = 1 - g.sandIntro / g.sandMax;
  ctx.save();
  const f = Math.min(1, u / .85);
  ctx.fillStyle = `rgba(60,255,230,${.6 * (1 - f)})`; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    const y = (i * 151 + Math.floor(g.sandIntro * 60) * 47) % H, h = 8 + (i * 29) % 40;
    ctx.fillStyle = i % 3 ? `rgba(120,255,240,${.55 * (1 - f)})` : `rgba(40,110,200,${.55 * (1 - f)})`;
    ctx.fillRect(0, y, W, h);
  }
  if (u < .25) { ctx.fillStyle = `rgba(255,255,255,${1 - u / .25})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
