'use strict';
let G = null, selChar = 0, selMap = 0, unlocked = 1;
try { unlocked = Math.max(1, +localStorage.getItem('cd_unlocked') || 1); } catch (e) {}
const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };

function aiInit() {
  return { react: 0, aim: 0, token: true, slot: 0, flankA: null, sr: null, cautious: 0, dir: 1, face: null,
    lkv: { x: 0, y: 0 }, buddy: null, missDelay: 0, diedAt: 0, silent: false, corpseRef: null, surprise: 0, susPeak: 0, scanA: 0, scanT: 0,
    tac: null, surA: null, ckd: null, pz: 0, pzA: 0, lookA: null };
}
// each guard keeps a "buddy" (nearest other guard). If the buddy goes missing without anyone finding the body, the partner gets suspicious.
function pickBuddy(e) {
  let best = null, bd = 1e9;
  for (const o of G.enemies) {
    if (o === e || o.dead || o.boss) continue;
    const d = Math.hypot(o.path[0][0] - e.path[0][0], o.path[0][1] - e.path[0][1]);
    if (d < bd) { bd = d; best = o; }
  }
  e.buddy = best;
}
function mkEnemy(d, M, i) {
  const elite = !!M.skills && i % 2 === 0;
  const first = d.path[1] || d.path[0];
  return { x: d.x, y: d.y, r: 12, ang: Math.atan2(first[1] - d.y, first[0] - d.x), mv: 0,
    hp: elite ? 70 : 40, max: elite ? 70 : 40, state: 'patrol', path: d.path, pi: 1 % d.path.length,
    gun: d.gun, meter: 0, tgt: null, wait: 0, loseT: 0, chaseT: 0, fireT: rand(0, .6), skCd: rand(2, 4),
    rage: 0, ultUsed: false, elite, boss: false, dead: false, spd: elite ? 108 : 90, flash: 0, dash: null,
    vision: 230, bossT: 0, burst: 0, ...aiInit() };
}
function mkBoss(d) {
  const c = BOSSES[d.type];
  return { x: d.x, y: d.y, r: c.r, ang: Math.PI, mv: 0, hp: c.hp, max: c.hp, state: 'patrol', path: d.path, pi: 1 % d.path.length,
    gun: d.type === 'brute' ? 'shotgun' : (d.type === 'phantom' || d.type === 'wraith') ? 'smg' : 'rifle',
    meter: 0, tgt: null, wait: 0, loseT: 0, chaseT: 0, fireT: 1, skCd: 0, rage: 0, ultUsed: false, elite: false,
    boss: true, type: d.type, color: c.color, dead: false, spd: c.spd, flash: 0, dash: null,
    vision: c.vision, bossT: d.type === 'wraith' ? rand(3.5, 4.5) : rand(2.5, 3.5), sandWarn: 0, rushT: 0, counter: false, counterAt: -99, burst: 0, enraged: false, meleeT: 0, ...aiInit() };
}

function startMap(mi) {
  const M = MAPS[mi], ch = CHARS[selChar];
  const walls = [[0, 0, W, 20], [0, H - 20, W, 20], [0, 0, 20, H], [W - 20, 0, 20, H]].concat(M.walls);
  buildNav(walls);
  const p = { x: M.spawn[0], y: M.spawn[1], r: 12, ang: 0, hp: ch.hp, max: ch.hp, spd: ch.spd, stabT: 0, stabAnim: 0,
    fireT: 0, gun: null, skCd: 0, ult: 0, invis: 0, inv: 0, dash: null, blade: 0, haste: 1, mvx: 0, mvy: 0, sneak: false, flash: 0, moving: false,
    vx: 0, vy: 0, stepT: 0 };
  const enemies = M.enemies.map((d, i) => mkEnemy(d, M, i));
  if (M.boss) enemies.push(mkBoss(M.boss));
  G = { mi, M, ch, walls, p, enemies, bullets: [], drops: [], smokes: [], fx: [], decals: [], texts: [], rings: [],
    corpses: [], time: 0, stopT: 0, pslowT: 0, pslowMax: 3.5, pslowF: 1, pf: 1, rt: 0, clash: false, slowT: 0, slowF: 1, slowMax: 0, sandIntro: 0, sandMax: .9, ghosts: [], paused: false, state: 'play', endT: 0, shown: false, kills: 0, alerts: 0, stealth: 0,
    fieldT: 0, shake: 0, prompt: null, alertLvl: 0, debug: false, searched: [], grenades: [], corners: [], stillT: 0, intel: null };
  for (const w of M.walls) for (const c of [[w[0], w[1]], [w[0] + w[2], w[1]], [w[0], w[1] + w[3]], [w[0] + w[2], w[1] + w[3]]]) G.corners.push(c);   // wall corners for careful pursuit
  { // pair guards up (closest pairs first) so every guard has a partner who would notice them missing
    const L = enemies.filter(e => !e.boss), free = new Set(L), prs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++)
      prs.push([Math.hypot(L[i].path[0][0] - L[j].path[0][0], L[i].path[0][1] - L[j].path[0][1]), L[i], L[j]]);
    prs.sort((a, b) => a[0] - b[0]);
    for (const [, a, b] of prs) if (free.has(a) && free.has(b)) { a.buddy = b; b.buddy = a; free.delete(a); free.delete(b); }
    for (const e of free) { let best = null, bd = 1e9; for (const o of L) if (o !== e) { const d = Math.hypot(o.path[0][0] - e.path[0][0], o.path[0][1] - e.path[0][1]); if (d < bd) { bd = d; best = o; } } e.buddy = best; }
    for (const e of L) e.missDelay = rand(8, 14);
  }
}

function addText(x, y, s, col) { G.texts.push({ x, y, s, col: col || '#fff', t: 1.3 }); }
function spark(x, y, n, col, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = rand(30, sp || 140);
    G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(.2, .5), max: .5, col, r: rand(1.5, 3) });
  }
}
function ebullet(x, y, a, spd, dmg, col, life) {
  G.bullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, own: 'e', dmg, life: life || 1.6, r: 3.5, col: col || '#ffe08a' });
}

// ---------- noise / alert ----------
// vision range grows as the whole base gets more alert, and while a guard is actively searching
function visRange(e) {
  return e.vision * (1 + .06 * G.alertLvl) * (e.state === 'search' ? 1.12 : 1) * (e.cautious > 0 ? 1.08 : 1);
}
function goSus(e, x, y, meter) {
  if (x !== undefined) e.tgt = { x, y };
  if (e.state !== 'sus') { e.surprise = .45; e.susPeak = 0; }
  e.state = 'sus'; e.wait = 0; e.insp = null; e.sr = null;
  if (meter) e.meter = Math.max(e.meter, meter);
}
function backToPatrol(e) {
  e.state = 'patrol'; e.meter = 0; e.wait = 0; e.insp = null; e.sr = null; e.susPeak = 0; e.cautious = 14 + 4 * G.alertLvl;
  let bi = 0, bd = 1e9;
  e.path.forEach((w, i) => { const d = Math.hypot(w[0] - e.x, w[1] - e.y); if (d < bd) { bd = d; bi = i; } });
  e.pi = bi;
}
// search = go to last known position, then sweep nearby hiding spots (ahead of player's last heading first)
function startSearch(e, x, y, vx, vy, bonus) {
  e.state = 'search'; e.tgt = { x, y }; e.insp = null; e.wait = 0; e.meter = Math.max(e.meter, .5);
  e.lkv = { x: vx || 0, y: vy || 0 };
  spreadTarget(e);
  e.sr = { stage: 'go', pts: [], i: 0, pause: 0, t: 0, sgn: 1, budget: 8 + 2.5 * G.alertLvl + (bonus || 0) };
}
// guards searching the same incident each get their own standoff spot instead of stacking on one point
function spreadTarget(e) {
  const g = G, t = e.tgt, others = g.enemies.filter(o => o !== e && !o.dead && o.state === 'search' && o.tgt).map(o => o.tgt);
  const free = (x, y) => !blocked[cellOf(x, y)] && x > 40 && x < W - 40 && y > 40 && y < H - 40 && others.every(q => Math.hypot(q.x - x, q.y - y) > 45);
  if (free(t.x, t.y)) return;
  for (const R of [50, 85, 120]) {
    const off = rand(0, TAU);
    for (let i = 0; i < 8; i++) {
      const a = off + i * TAU / 8, x = t.x + Math.cos(a) * R, y = t.y + Math.sin(a) * R;
      if (free(x, y) && losClear(t.x, t.y, x, y, g.walls)) { e.tgt = { x, y }; return; }
    }
  }
}
function pickSearchPoints(e) {
  const g = G, c = e.tgt, f = field(c.x, c.y), v = e.lkv || { x: 0, y: 0 };
  const sp = Math.hypot(v.x, v.y), base = Math.atan2(v.y, v.x);
  const others = [];
  for (const o of g.enemies) if (o !== e && !o.dead && o.sr && o.sr.pts) for (const q of o.sr.pts) others.push(q);
  const cand = [];
  for (let i = 0; i < 32; i++) {
    const a = sp > 40 && i % 2 === 0 ? base + rand(-1.1, 1.1) : rand(0, TAU), r = rand(60, 200);
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    if (x < 40 || x > W - 40 || y < 40 || y > H - 40) continue;
    const k = cellOf(x, y);
    if (blocked[k] || f[k] < 0) continue;
    if (others.some(q => Math.hypot(q[0] - x, q[1] - y) < 60)) continue;
    if (g.searched.some(q => g.time - q[2] < 15 && Math.hypot(q[0] - x, q[1] - y) < 60)) continue;   // already checked recently
    if (g.enemies.some(o => o !== e && !o.dead && o.state === 'search' && o.tgt && Math.hypot(o.tgt.x - x, o.tgt.y - y) < 60)) continue;   // spread out, don't all check the same spot
    const sc = rand(0, 1) + (losClear(c.x, c.y, x, y, g.walls) ? 0 : .8) + (sp > 40 ? Math.cos(angDiff(a, base)) * .6 : 0);
    cand.push([x, y, sc]);
  }
  cand.sort((a, b) => b[2] - a[2]);
  const want = 3 + Math.round(g.alertLvl), pts = [];
  for (const q of cand) { if (pts.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) > 55)) pts.push(q); if (pts.length >= want) break; }
  let cx = e.x, cy = e.y; const out = [];
  while (pts.length) {
    pts.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    const q = pts.shift(); out.push(q); cx = q[0]; cy = q[1];
  }
  return out;
}
// kind 'step' = soft footsteps: builds suspicion gradually. Walls muffle sound (effective distance x1.6).
function noise(x, y, r, loud, kind) {
  const g = G;
  if (kind === 'step') g.rings.push({ x, y, r: 6, max: r * .8, t: .28 });
  else if (loud) g.rings.push({ x, y, r: 10, max: r, t: .5 });
  for (const e of g.enemies) {
    if (e.dead || e.state === 'chase') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    const eff = d * (losClear(e.x, e.y, x, y, g.walls) ? 1 : 1.6);
    if (eff >= r) continue;
    if (kind === 'step') {
      e.meter += .5 * (1 - eff / r);
      e.face = { a: Math.atan2(y - e.y, x - e.x), t: .9 };
      if (e.state === 'patrol' && e.meter > .3) goSus(e, x, y);
      else if (e.state === 'sus' && !e.insp) e.tgt = { x, y };
      continue;
    }
    e.meter = loud && eff < r * .35 ? 1 : Math.max(e.meter, .5);
    if (e.state === 'search') startSearch(e, x, y, 0, 0);
    else goSus(e, x, y);
  }
}
// can the guard see the player's body? true if the centre OR either edge of the body is exposed (peeking round a corner shows)
function canSeeBody(e, p) {
  if (losClear(e.x, e.y, p.x, p.y, G.walls)) return true;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * (p.r - 2), ny = dx / d * (p.r - 2);
  return losClear(e.x, e.y, p.x + nx, p.y + ny, G.walls) || losClear(e.x, e.y, p.x - nx, p.y - ny, G.walls);
}
function seesPoint(e, x, y) {
  const d = Math.hypot(x - e.x, y - e.y);
  if (d > visRange(e) || !losClear(e.x, e.y, x, y, G.walls)) return false;
  return d < 60 || Math.abs(angDiff(Math.atan2(y - e.y, x - e.x), e.ang)) < VIS.core + .15;
}
function reactSmoke(e, x, y, meter) {
  if (e.dead || e.state === 'chase') return;
  e.meter = Math.max(e.meter, meter);
  if (e.state === 'search') startSearch(e, x, y, 0, 0); else goSus(e, x, y, meter);
  e.face = { a: Math.atan2(y - e.y, x - e.x), t: 1 };
  addText(e.x, e.y - 22, '?', '#ffd24a'); beep(430, .08, 'triangle', .03);
}
function updGrenades(dt) {
  const g = G;
  if (g.stopT > 0) return;           // time stop freezes thrown canisters too
  for (const gr of g.grenades) {
    gr.t += dt; const k = Math.min(1, gr.t / gr.dur);
    gr.x = gr.sx + (gr.tx - gr.sx) * k; gr.y = gr.sy + (gr.ty - gr.sy) * k; gr.z = Math.sin(k * Math.PI) * 34;
    if (k < 1) {   // guards who see it flying through their view get suspicious
      for (const e of g.enemies) if (!e.dead && e.state !== 'chase' && !gr.seen.has(e) && seesPoint(e, gr.x, gr.y)) { gr.seen.add(e); reactSmoke(e, gr.x, gr.y, .35); }
    } else {
      gr.done = true;
      g.smokes.push({ x: gr.tx, y: gr.ty, r: 95, t: 7, max: 7 });
      g.rings.push({ x: gr.tx, y: gr.ty, r: 6, max: 60, t: .35 });
      spark(gr.tx, gr.ty, 10, '#c4ccd8', 90); beep(180, .3, 'sine', .06, -90);
      for (const e of g.enemies) {      // see the burst or hear it land -> investigate
        if (e.dead || e.state === 'chase') continue;
        const d = Math.hypot(e.x - gr.tx, e.y - gr.ty) * (losClear(e.x, e.y, gr.tx, gr.ty, g.walls) ? 1 : 1.6);
        if (d < 110 || seesPoint(e, gr.tx, gr.ty)) reactSmoke(e, gr.tx, gr.ty, .6);
      }
    }
  }
  g.grenades = g.grenades.filter(x => !x.done);
}

// a guard who finds a body (or hears a shout) pulls nearby friends over to search the spot
function callNearby(e, x, y, R) {
  for (const o of G.enemies) {
    if (o === e || o.dead || o.state === 'chase') continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d >= R) continue;
    const t = .5 + d / 500;
    if (!o.hear || o.hear.t > t) o.hear = { t, x, y };
  }
}
function goChase(e) {
  const g = G;
  if (e.state === 'chase') return;
  e.state = 'chase'; e.meter = 1; e.tgt = { x: g.p.x, y: g.p.y }; e.loseT = 0; e.chaseT = 0; g.alerts++;
  e.sr = null; e.insp = null; e.aim = 0; e.flankA = null; e.react = e.boss ? .15 : rand(.35, .6);   // reaction time before first shot
  g.alertLvl = Math.min(3, g.alertLvl + .3);
  addText(e.x, e.y - 22, '!', '#ff5a5a');
  beep(700, .1, 'square', .04);
  // shout: farther friends react later; through walls slower
  const R = 350;
  g.rings.push({ x: e.x, y: e.y, r: 10, max: R * .6, t: .5 });
  for (const o of g.enemies) {
    if (o === e || o.dead || o.state === 'chase') continue;
    const los = losClear(e.x, e.y, o.x, o.y, g.walls);
    const d = Math.hypot(o.x - e.x, o.y - e.y) * (los ? 1 : 1.6);   // walls muffle the shout
    if (d >= R) continue;
    const t = (.2 + (d / R) * 2.2) * (los ? 1 : 1.5);
    if (!o.hear || o.hear.t > t) o.hear = { t, x: g.p.x, y: g.p.y };
  }
}

// ---------- damage ----------
function hurtPlayer(dmg) {
  const p = G.p;
  if (p.inv > 0 || G.state !== 'play') return;
  p.hp -= dmg; p.flash = .15; G.shake = 6;
  beep(120, .12, 'sawtooth', .06, -40);
  spark(p.x, p.y, 6, '#ff3347', 120);
}
function hurtEnemy(e, dmg, o) {
  o = o || {};
  if (e.dead) return;
  e.hp -= dmg; e.flash = .12;
  spark(e.x, e.y, o.melee ? 8 : 4, e.boss ? e.color : '#9fb6d1', 130);
  if (e.hp <= 0) killEnemy(e, o);
  else { if (e.state !== 'chase') goChase(e); beep(220, .06, 'square', .03); }
}
function killEnemy(e, o) {
  const g = G, p = g.p;
  e.dead = true; e.hp = 0; e.dash = null;
  const quiet = e.state !== 'chase';
  g.kills++;
  if (quiet) g.stealth++;
  g.decals.push({ x: e.x, y: e.y, r: e.boss ? 34 : 20 });
  e.corpseRef = { x: e.x, y: e.y }; e.diedAt = g.time; e.silent = quiet;
  g.corpses.push(e.corpseRef);
  g.drops.push({ kind: 'gun', x: e.x, y: e.y, gun: e.boss ? 'rifle' : e.gun, ammo: e.boss ? 18 : Math.ceil(GUNS[e.gun].ammo * .7), t: 0 });
  if (e.boss || Math.random() < .2) g.drops.push({ kind: 'med', x: e.x + 14, y: e.y + 10, t: 0 });
  p.ult = Math.min(100, p.ult + (e.boss ? 60 : 25));
  spark(e.x, e.y, e.boss ? 40 : 16, e.boss ? e.color : '#c8d6e8', 200);
  addText(e.x, e.y - 18, e.boss ? 'BOSS DOWN' : (quiet ? 'เงียบ' : 'สังหาร'), e.boss ? e.color : (quiet ? '#9be15d' : '#fff'));
  beep(e.boss ? 90 : 160, e.boss ? .5 : .15, 'sawtooth', .06, -60);
}

// ---------- player actions ----------
function stab() {
  const g = G, p = g.p;
  if (p.stabT > 0 || g.state !== 'play') return;
  p.stabT = .4; p.stabAnim = .18;
  beep(520, .06, 'triangle', .05, -200);
  let hit = false;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d > e.r + p.r + 24) continue;
    if (Math.abs(angDiff(Math.atan2(dy, dx), p.ang)) > 1.05 && d > e.r + 8) continue;
    const behind = Math.abs(angDiff(Math.atan2(p.y - e.y, p.x - e.x), e.ang)) > 1.9;
    const sneak = behind || e.state !== 'chase' || p.invis > 0 || g.stopT > 0 || (g.slowT > 0 && g.slowF < .1);
    const dmg = e.boss ? (sneak ? 95 : 34) : (sneak ? 999 : 44);
    hurtEnemy(e, dmg, { melee: true });
    hit = true;
  }
  if (hit) noise(p.x, p.y, 70, false);
}
function fireGun() {
  const g = G, p = g.p, gun = GUNS[p.gun.type];
  if (p.fireT > 0 || g.state !== 'play') return;
  p.fireT = gun.rate; p.gun.ammo--;
  for (let i = 0; i < gun.pellets; i++) {
    const a = p.ang + rand(-1, 1) * gun.spread;
    g.bullets.push({ x: p.x + Math.cos(p.ang) * 16, y: p.y + Math.sin(p.ang) * 16, vx: Math.cos(a) * gun.spd, vy: Math.sin(a) * gun.spd,
      own: 'p', dmg: gun.dmg, life: 1.1, r: 3, col: '#c8f4ff' });
  }
  spark(p.x + Math.cos(p.ang) * 20, p.y + Math.sin(p.ang) * 20, 3, '#ffe9a8', 90);
  beep(gun.rate < .15 ? 260 : 150, .08, 'sawtooth', .05, -80);
  noise(p.x, p.y, 430, true);
  if (p.gun.ammo <= 0) dropGun(true);   // magazine empty: the gun is dropped on its own
}
// Sandevistan: the world runs at slowF of normal speed while the player keeps real time
function startSandevistan(dur, f) {
  const g = G, p = g.p;
  g.slowT = dur; g.slowMax = dur; g.slowF = f;
  p.haste = f < .1 ? 1.7 : 1.25;
  g.shake = 0;
  g.sandIntro = g.sandMax = .35;     // short activation: white flash -> cyan streak wipe -> time slows
  p.lgx = p.x; p.lgy = p.y; p.ghostT = 0;
  g.ghosts = g.ghosts.filter(gh => !gh.sand);
  g.rings.push({ x: p.x, y: p.y, r: 10, max: 140, t: .45 });
  beep(300, .26, 'sawtooth', .04, 1400); setTimeout(() => beep(1700, .5, 'sine', .035, -1300), 260);
}
function useSkill() {
  const g = G, p = g.p;
  if (g.state !== 'play' || p.skCd > 0) return;
  const ch = g.ch, c = Math.cos(p.ang), s = Math.sin(p.ang);
  if (ch.id === 'shade') {
    p.dash = { vx: c * 1060, vy: s * 1060, t: .16 }; p.inv = .35; beep(320, .16, 'sawtooth', .05, -200);
  } else if (ch.id === 'david') {
    p.dash = { vx: c * 1400, vy: s * 1400, t: .14, slash: true, hits: new Set() }; p.inv = .3; p.stabAnim = .18;
    beep(900, .1, 'sawtooth', .05, -600); beep(260, .14, 'square', .04, -120);
  } else if (ch.id === 'viper') {
    g.bullets.push({ x: p.x + c * 14, y: p.y + s * 14, vx: c * 740, vy: s * 740, own: 'k', dmg: 999, bossDmg: 70, life: .8, r: 5, col: '#ffd7dc', pierce: true, hits: new Set() });
    beep(700, .1, 'triangle', .05, -300);
  } else {
    // thrown canister: flies in an arc to the cursor (stops short at a wall), smoke bursts when it lands
    let d = Math.min(270, Math.hypot(mouse.x - p.x, mouse.y - p.y));
    d = Math.max(6, Math.min(d, castRay(p.x, p.y, p.ang, d + 12, g.walls) - 14));
    g.grenades.push({ sx: p.x, sy: p.y, x: p.x, y: p.y, tx: p.x + c * d, ty: p.y + s * d, t: 0, dur: Math.max(.3, d / 420), z: 0, seen: new Set() });
    beep(260, .12, 'triangle', .05, 120);
  }
  p.skCd = ch.sk.cd;
}
function useUlt() {
  const g = G, p = g.p;
  if (g.state !== 'play' || p.ult < 100) return;
  p.ult = 0;
  if (g.pslowT > 0 && g.ch.id !== 'david') { g.pslowT = 0; g.pslowF = 1; addText(p.x, p.y - 46, 'ทำลายสนาม!', '#ff4fc3'); g.rings.push({ x: p.x, y: p.y, r: 10, max: 170, t: .45 }); }
  if (g.ch.id === 'shade') p.invis = 6;
  else if (g.ch.id === 'viper') p.blade = 4;
  else if (g.ch.id === 'david') startSandevistan(5, .06);
  else g.stopT = 4;
  addText(p.x, p.y - 28, g.ch.ult.n, '#ff6b7a');
  beep(220, .5, 'sawtooth', .07, 400);
}
// X: put the held gun on the floor with whatever ammo is left. Empty guns (auto-dropped) can't be picked up and vanish after a while.
function dropGun(auto) {
  const g = G, p = g.p;
  if (g.state !== 'play' || !p.gun) return;
  const d = auto ? 12 : 16;
  g.drops.push({ kind: 'gun', x: p.x + Math.cos(p.ang) * d, y: p.y + Math.sin(p.ang) * d, gun: p.gun.type, ammo: p.gun.ammo, t: 0, cool: 1, exp: p.gun.ammo > 0 ? 0 : g.rt + 6 });
  if (!auto) addText(p.x, p.y - 22, 'ทิ้ง' + GUNS[p.gun.type].name, '#cbd1d9');
  p.gun = null;
  beep(auto ? 160 : 220, .08, 'triangle', .04, -80);
}
function pickup() {
  const g = G, p = g.p;
  let best = null, bd = 38;
  for (const dr of g.drops) { if (dr.kind !== 'gun' || dr.ammo <= 0) continue; const d = Math.hypot(dr.x - p.x, dr.y - p.y); if (d < bd) { bd = d; best = dr; } }
  if (!best) return;
  if (p.gun && p.gun.ammo > 0) g.drops.push({ kind: 'gun', x: p.x, y: p.y, gun: p.gun.type, ammo: p.gun.ammo, t: 0, cool: 1 });
  p.gun = { type: best.gun, ammo: best.ammo };
  g.drops.splice(g.drops.indexOf(best), 1);
  addText(p.x, p.y - 22, GUNS[best.gun].name, GUNS[best.gun].color);
  beep(400, .08, 'triangle', .05, 200);
}

function inSmoke(x1, y1, x2, y2) {
  for (const s of G.smokes) if (segPointDist(x1, y1, x2, y2, s.x, s.y) < s.r * .9) return true;
  return false;
}

function playerUpdate(dt, real) {
  const g = G, p = g.p;
  real = real || dt;
  p.sneak = !!(keys.ShiftLeft || keys.ShiftRight);
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (ix || iy) { const l = Math.hypot(ix, iy); ix /= l; iy /= l; }
  p.moving = !!(ix || iy);
  const sp = p.spd * (p.sneak ? .55 : 1) * p.haste;
  const ox = p.x, oy = p.y;
  if (p.dash) {
    for (let i = 0; i < 4; i++) {
      p.x += p.dash.vx * dt / 4; p.y += p.dash.vy * dt / 4; pushOut(p, g.walls);
      if (p.dash.slash) for (const e of g.enemies) {
        if (e.dead || p.dash.hits.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r + 14) continue;
        p.dash.hits.add(e);
        hurtEnemy(e, e.boss ? 70 : 999, { melee: true });
        g.shake = 4; spark(e.x, e.y, 10, '#ff3347', 220);
        g.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: .25, max: .25, col: '#ffffff', r: 12 });
      }
    }
    g.fx.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: .3, max: .3, col: '#ff3347', r: 10 });
    p.dash.t -= dt;
    if (p.dash.t <= 0) { p.mvx = clamp(p.dash.vx * .14, -sp, sp); p.mvy = clamp(p.dash.vy * .14, -sp, sp); p.dash = null; }   // glide out of the dash instead of stopping dead
  } else {
    // smooth movement: velocity eases toward the input target (quick pickup, slightly longer slide when letting go)
    const k = (ix || iy) ? 15 : 19, f = 1 - Math.exp(-k * dt);
    p.mvx += (ix * sp - p.mvx) * f; p.mvy += (iy * sp - p.mvy) * f;
    if (!(ix || iy) && Math.hypot(p.mvx, p.mvy) < 4) { p.mvx = 0; p.mvy = 0; }
    p.x += p.mvx * dt; p.y += p.mvy * dt; pushOut(p, g.walls);
    // blocked by a wall: drop the velocity that was absorbed so we slide along it rather than stick or jitter
    const rx = (p.x - ox) / dt, ry = (p.y - oy) / dt;
    if (Math.abs(rx) < Math.abs(p.mvx) * .6) p.mvx = rx;
    if (Math.abs(ry) < Math.abs(p.mvy) * .6) p.mvy = ry;
  }
  if (p.dash) { p.mvx = 0; p.mvy = 0; }
  p.vx = clamp((p.x - ox) / real, -260, 260); p.vy = clamp((p.y - oy) / real, -260, 260);
  p.stepT -= dt;
  if (p.moving && !p.sneak && !p.dash && p.invis <= 0 && g.stopT <= 0 && g.slowT <= 0 && p.stepT <= 0) { p.stepT = .38; noise(p.x, p.y, 70, false, 'step'); }
  p.ang = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  p.stabT -= dt * p.haste; p.stabAnim -= dt; p.fireT -= dt * p.haste; p.skCd = Math.max(0, p.skCd - dt);
  p.inv = Math.max(0, p.inv - dt); p.invis = Math.max(0, p.invis - dt); p.flash = Math.max(0, p.flash - dt);
  p.ult = Math.min(100, p.ult + 3 * dt);
  // Sandevistan afterimages: drop a ghost copy whenever the player has moved
  if (g.slowT > 0) {
    // David's trail: a long evenly spaced chain of copies that ages cyan -> blue -> violet -> olive -> maroon
    p.ghostT = (p.ghostT || 0) - dt;
    const moved = Math.hypot(p.x - (p.lgx ?? p.x), p.y - (p.lgy ?? p.y));
    if (moved >= 7 || (p.ghostT <= 0 && moved > .4)) {
      p.ghostT = .05; p.lgx = p.x; p.lgy = p.y;
      g.ghosts.push({ x: p.x, y: p.y, ang: p.ang, t: 1, max: 1, sand: true, gun: p.gun ? p.gun.type : null });
      let n = 0; for (const gh of g.ghosts) if (gh.sand) n++;
      if (n > 110) { const i = g.ghosts.findIndex(gh => gh.sand); if (i >= 0) g.ghosts.splice(i, 1); }
    }
  } else if (p.dash && p.dash.slash) {
    p.ghostT = (p.ghostT || 0) - dt;
    if (p.ghostT <= 0) { p.ghostT = .02; g.ghosts.push({ x: p.x, y: p.y, ang: p.ang, t: .45, max: .45 }); }
  }
  if (p.blade > 0) {
    p.blade -= dt;
    for (const e of g.enemies) {
      if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > 88 + e.r) continue;
      hurtEnemy(e, e.boss ? 80 * dt : 999, { melee: true });
    }
  }
  if (mouse.down) { if (p.gun && p.gun.ammo > 0) fireGun(); else stab(); }
  // pickups
  g.prompt = null;
  let bd = 38;
  for (const dr of g.drops) {
    const d = Math.hypot(dr.x - p.x, dr.y - p.y);
    if (dr.kind === 'med' && d < 22) { p.hp = Math.min(p.max, p.hp + 25); dr.gone = true; addText(p.x, p.y - 22, '+25 HP', '#7dff9b'); beep(600, .1, 'sine', .05, 300); }
    if (dr.kind === 'gun' && dr.ammo > 0 && d < bd) { bd = d; g.prompt = dr; }
  }
  g.drops = g.drops.filter(d => !d.gone && !(d.exp && g.rt > d.exp));
}

// ---------- enemy AI ----------
function turnTo(e, a, dt, rate) {
  const d = angDiff(a, e.ang), m = rate * dt;
  e.ang += Math.abs(d) < m ? d : Math.sign(d) * m;
}
// keep guards from walking through each other: soft push-apart when close, hard separation on overlap
function sepAllies(e, dt) {
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || .01, lim = (e.r + o.r) * 1.6;
    if (od < lim) { const k = (1 - od / lim) * 70 * dt, hard = od < e.r + o.r ? (e.r + o.r - od) * .5 : 0; e.x += ox / od * (k + hard); e.y += oy / od * (k + hard); }
  }
  pushOut(e, G.walls);
}
// careful = true: slow down near wall corners, swing wide of them, and pause to look round before turning the corner
function moveTo(e, tx, ty, speed, dt, careful) {
  const g = G;
  e.lookA = null;
  if (careful && e.pz > 0) { e.pz -= dt; e.lookA = e.pzA; return; }
  let wx = tx, wy = ty;
  if (!clearWide(e.x, e.y, tx, ty, g.walls, e.r - 2)) { const n = nextStep(e.x, e.y, tx, ty); wx = n[0]; wy = n[1]; }
  const dx = wx - e.x, dy = wy - e.y, d = Math.hypot(dx, dy);
  if (d < 1) return;
  let ux = dx / d, uy = dy / d;
  if (careful) {
    const h = Math.atan2(dy, dx);
    let ci = -1, nd = 1e9;
    for (let i = 0; i < g.corners.length; i++) {
      const c = g.corners[i], cd = Math.hypot(c[0] - e.x, c[1] - e.y);
      if (cd > 64 || cd >= nd) continue;
      if (Math.abs(angDiff(Math.atan2(c[1] - e.y, c[0] - e.x), h)) > 1.05) continue;   // only corners ahead of us
      if (e.ckd && g.time - (e.ckd[i] === undefined ? -99 : e.ckd[i]) < 5) continue;    // already checked this one recently
      ci = i; nd = cd;
    }
    if (ci >= 0) {
      const c = g.corners[ci], ca = Math.atan2(c[1] - e.y, c[0] - e.x), side = Math.sign(angDiff(ca, h)) || 1;
      const near = clamp(1 - (nd - 22) / 42, 0, 1);
      speed *= 1 - .6 * near;                                   // slow down on approach
      e.lookA = h + side * .9 * near;                           // gun/eyes swing toward the blind side
      if (nd < 46) {                                            // bend the path away from the corner instead of hugging it
        const w = (1 - nd / 46) * .9;
        ux += (e.x - c[0]) / (nd || 1) * w; uy += (e.y - c[1]) / (nd || 1) * w;
        const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
      }
      if (nd < 26) { (e.ckd || (e.ckd = {}))[ci] = g.time; e.pz = .35; e.pzA = e.lookA; }   // stop and check the angle
    }
  }
  const s = Math.min(speed * dt, d);
  e.x += ux * s; e.y += uy * s;
  e.mv = Math.atan2(uy, ux);
  sepAllies(e, dt);
}
function faceMove(e, dt, rate) { turnTo(e, e.lookA !== null ? e.lookA : e.mv, dt, rate); }

// ---------- tactical combat (regular enemies only; bosses keep their own AI) ----------
// preferred distance band per weapon: [too close, too far]
const RANGE = { pistol: [150, 230], smg: [110, 180], shotgun: [55, 105], rifle: [250, 340] };
// move a small step in a direction, refusing to push into walls. Returns false if blocked.
function slide(e, vx, vy, dt) {
  const g = G, m = Math.hypot(vx, vy) || 1, ax = e.x + vx / m * (e.r + 8), ay = e.y + vy / m * (e.r + 8);
  if (blocked[cellOf(ax, ay)] || !clearWide(e.x, e.y, ax, ay, g.walls, e.r - 3)) return false;
  e.x += vx * dt; e.y += vy * dt; sepAllies(e, dt);
  return true;
}
// spread chasers evenly around the player so they come from different sides
function assignSurround(ch, dt) {
  const n = ch.length, p = G.p;
  if (!n) return;
  const L = ch.map(e => ({ e, a: Math.atan2(e.y - p.y, e.x - p.x) })).sort((u, v) => u.a - v.a);
  let sx = 0, sy = 0;
  L.forEach((o, i) => { const b = o.a - i * TAU / n; sx += Math.cos(b); sy += Math.sin(b); });
  const base = Math.atan2(sy, sx), k = Math.min(1, dt * 2.5);
  L.forEach((o, i) => { const want = base + i * TAU / n; o.e.surA = o.e.surA === null ? want : o.e.surA + angDiff(want, o.e.surA) * k; });
}
// a reachable spot on the guard's own bearing around the centre (falls back to nearby bearings/radii)
function surroundPoint(e, R, c) {
  const a0 = e.surA === null ? Math.atan2(e.y - c.y, e.x - c.x) : e.surA, f = field(e.x, e.y);
  for (const k of [1, .75, 1.3, .5]) for (const da of [0, .4, -.4, .8, -.8]) {
    const x = c.x + Math.cos(a0 + da) * R * k, y = c.y + Math.sin(a0 + da) * R * k;
    if (x < 40 || x > W - 40 || y < 40 || y > H - 40) continue;
    const ci = cellOf(x, y);
    if (blocked[ci] || f[ci] < 0) continue;
    return { x, y };
  }
  return { x: clamp(c.x, 40, W - 40), y: clamp(c.y, 40, H - 40) };
}
// from a hidden spot, find a nearby step sideways that exposes the player (peek position)
function peekFor(x, y) {
  const g = G, p = g.p, a = Math.atan2(y - p.y, x - p.x), px = -Math.sin(a), py = Math.cos(a);
  for (const s of [20, 32, 46, 62]) for (const sg of [1, -1]) {
    const qx = x + px * s * sg, qy = y + py * s * sg;
    if (qx < 40 || qx > W - 40 || qy < 40 || qy > H - 40 || blocked[cellOf(qx, qy)]) continue;
    if (!losClear(p.x, p.y, qx, qy, g.walls) || !clearWide(x, y, qx, qy, g.walls, 9)) continue;
    return { x: qx, y: qy };
  }
  return null;
}
// find a spot close by that is hidden from the player, has a peek position, and sits in the weapon's range band
function findCover(e, lo, hi) {
  const g = G, p = g.p, f = field(e.x, e.y), mid = (lo + hi) / 2;
  let best = null, bs = 1e9;
  for (let i = 0; i < 28; i++) {
    const a = rand(0, TAU), r = rand(30, 170), x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (x < 40 || x > W - 40 || y < 40 || y > H - 40) continue;
    const ci = cellOf(x, y);
    if (blocked[ci] || f[ci] < 0) continue;
    if (canSeeBody({ x, y }, p)) continue;                              // fully hidden, body edges included
    const dp = Math.hypot(x - p.x, y - p.y);
    if (dp > hi + 70 || dp < lo * .45) continue;
    if (g.enemies.some(o => o !== e && !o.dead && o.tac && o.tac.cov && Math.hypot(o.tac.cov.x - x, o.tac.cov.y - y) < 45)) continue;   // don't share a cover spot
    const pk = peekFor(x, y);
    if (!pk) continue;
    const sc = f[ci] * CS + Math.abs(dp - mid) * .6 + Math.hypot(pk.x - x, pk.y - y) * .4 + rand(0, 25);
    if (sc < bs) { bs = sc; best = { cov: { x, y }, pk }; }
  }
  return best;
}
// sidestep an incoming player bullet (not perfect: only reacts some of the time, with a cooldown)
function dodgeBullets(e, T) {
  if (T.dcd > 0) return;
  for (const b of G.bullets) {
    if (b.own === 'e') continue;
    const v2 = b.vx * b.vx + b.vy * b.vy;
    if (!v2) continue;
    const rx = e.x - b.x, ry = e.y - b.y, t = (rx * b.vx + ry * b.vy) / v2;
    if (t < 0 || t > .35) continue;
    if (Math.hypot(b.x + b.vx * t - e.x, b.y + b.vy * t - e.y) > e.r + 12) continue;
    const vm = Math.sqrt(v2), nx = -b.vy / vm, ny = b.vx / vm, s = (rx * nx + ry * ny) >= 0 ? 1 : -1;
    T.dcd = .8;
    if (Math.random() < .7) { T.dodge = .22; T.dvx = nx * s; T.dvy = ny * s; }
    return;
  }
}
// exposed movement: hold the weapon's range band while strafing side to side like dodging fire
function dodgeStrafe(e, T, a2p, d, lo, hi, mid, spd, dt) {
  dodgeBullets(e, T);
  if (T.dodge > 0) { slide(e, T.dvx * spd * 1.8, T.dvy * spd * 1.8, dt); return; }
  if (T.sT <= 0) { if (Math.random() < .65) T.sd *= -1; T.sT = rand(.45, 1.3); }
  const rad = d > hi ? 1 : d < lo ? -1.1 : (d - mid) / 120;
  let vx = -Math.sin(a2p) * T.sd * .75 + Math.cos(a2p) * rad, vy = Math.cos(a2p) * T.sd * .75 + Math.sin(a2p) * rad;
  const m = Math.hypot(vx, vy) || 1; vx = vx / m * spd * .8; vy = vy / m * spd * .8;
  if (!slide(e, vx, vy, dt)) { T.sd *= -1; T.sT = rand(.3, .8); }
}
function toCover(e, T, lo, hi) {
  const c = findCover(e, lo, hi);
  if (c) { T.cov = c.cov; T.pk = c.pk; T.ph = 'toCover'; T.t = 3; T.cT = .3; return true; }
  return false;
}
function tacticalChase(e, dt, seen, a2p, d, spd) {
  const g = G, p = g.p;
  const T = e.tac || (e.tac = { ph: 'move', t: 0, cov: null, pk: null, sd: Math.random() < .5 ? 1 : -1, sT: 0, dodge: 0, dcd: 0, cT: 0, pl: 0, pkT: 0, n: 0, dvx: 0, dvy: 0 });
  T.t -= dt; T.sT -= dt; T.dodge -= dt; T.dcd -= dt; T.cT -= dt;
  const rg = RANGE[e.gun] || RANGE.pistol, sq = clamp(((g.stillT || 0) - 1) / 3, 0, 1) * .3;   // standing still tightens the ring
  const lo = rg[0] * (1 - sq), hi = rg[1] * (1 - sq), mid = (lo + hi) / 2;
  const centre = seen ? p : e.tgt;
  // no attack slot (or sight lost): surround from our own bearing
  const covering = T.ph === 'toCover' || T.ph === 'hide' || T.ph === 'peek' || (T.ph === 'fight' && e.loseT < .5);   // brief sight loss while fighting doesn't break the routine
  if (!e.token || (!seen && !covering)) {
    if (T.ph !== 'move') { T.ph = 'move'; T.cov = null; }
    const gp = surroundPoint(e, seen ? mid : Math.min(mid, 90), centre), far = Math.hypot(gp.x - e.x, gp.y - e.y);
    if (seen && far < 22) { dodgeStrafe(e, T, a2p, d, lo * .8, hi * 1.1, mid, spd, dt); turnTo(e, a2p, dt, 8); }
    else { moveTo(e, gp.x, gp.y, spd * (seen ? .95 : 1), dt, !seen); if (seen) turnTo(e, a2p, dt, 8); else faceMove(e, dt, 7); }
    if (e.token && seen && d <= hi * 1.05) { T.ph = 'fight'; T.t = rand(1.3, 2.4); T.n = 0; }
    return;
  }
  if (T.ph === 'move') { if (d <= hi * 1.05) { T.ph = 'fight'; T.t = rand(1.3, 2.4); T.n = 0; } else { moveTo(e, p.x, p.y, spd, dt); turnTo(e, a2p, dt, 8); return; } }
  if (T.ph === 'fight') {
    if (d > hi * 1.5) { T.ph = 'move'; return; }
    if (d > hi) moveTo(e, p.x, p.y, spd * .9, dt); else dodgeStrafe(e, T, a2p, d, lo, hi, mid, spd, dt);
    turnTo(e, a2p, dt, 9);
    if ((T.t <= 0 || (e.hp < e.max * .5 && T.t < 1)) && e.react <= 0) { if (!toCover(e, T, lo, hi)) T.t = rand(1.2, 2.2); }
    return;
  }
  // cover cycle: run to cover -> hide -> step out and shoot -> back behind cover
  if (T.cov && T.cT <= 0 && T.ph !== 'peek') {                          // cover blown (player now sees it)? pick another
    T.cT = .3;
    if (canSeeBody({ x: T.cov.x, y: T.cov.y }, p) && !toCover(e, T, lo, hi)) { T.ph = 'fight'; T.t = rand(1.2, 2); return; }
  }
  if (T.ph === 'toCover') {
    moveTo(e, T.cov.x, T.cov.y, spd * 1.15, dt);
    if (seen) turnTo(e, a2p, dt, 9); else faceMove(e, dt, 8);
    if (Math.hypot(T.cov.x - e.x, T.cov.y - e.y) < 10 || T.t <= 0) { T.ph = 'hide'; T.t = rand(.9, 1.7) * (e.gun === 'rifle' ? 1.3 : 1); }
  } else if (T.ph === 'hide') {
    turnTo(e, Math.atan2(p.y - e.y, p.x - e.x), dt, 6);
    if (seen && d < lo * .7) { T.ph = 'fight'; T.t = rand(1.2, 2); return; }      // cornered: stop hiding and fight
    if (T.t <= 0) { T.pk = peekFor(T.cov.x, T.cov.y); if (T.pk) { T.ph = 'peek'; T.t = 2.2; T.pl = rand(.5, .9); T.pkT = 0; } else if (!toCover(e, T, lo, hi)) { T.ph = 'fight'; T.t = rand(1.2, 2); } }
  } else if (T.ph === 'peek') {
    if (T.pk) moveTo(e, T.pk.x, T.pk.y, spd, dt);
    turnTo(e, a2p, dt, 10);
    if (seen) T.pkT += dt;
    if (T.pkT > T.pl || T.t <= 0) {                                              // had our shots: duck back
      if (++T.n >= 3) { T.n = 0; T.ph = 'fight'; T.t = rand(1.5, 2.5); }         // after a few peeks, reposition in the open
      else if (T.pkT > T.pl) { T.ph = 'toCover'; T.t = 3; }
      else if (!toCover(e, T, lo, hi)) { T.ph = 'fight'; T.t = rand(1.2, 2); }   // peek point never worked: new cover
    }
  } else T.ph = 'move';
}

function enemyShoot(e, a, d) {
  const p = G.p, gun = GUNS[e.gun];
  if (e.fireT > 0 || d > 380) return;
  // aim improves the longer the guard keeps you in sight; once locked on they lead a moving target
  if (e.gun !== 'shotgun' && e.aim > .5) {
    const t = d / 440 * .6;
    a = Math.atan2(p.y + (p.vy || 0) * t - e.y, p.x + (p.vx || 0) * t - e.x);
  }
  const sp = (gun.spread + .07) * (1.5 - .7 * e.aim);
  e.fireT = gun.rate * (e.boss ? 1.3 : 2.2) * (e.rage > 0 ? .5 : 1);
  for (let i = 0; i < gun.pellets; i++) {
    ebullet(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a + rand(-1, 1) * sp, 440, gun.dmg * .55, '#ffe08a');
  }
  beep(130, .06, 'square', .025, -40);
}
function bossAI(e, dt, seen, a2p, d) {
  const g = G, p = g.p;
  e.bossT -= dt;
  if (e.type === 'brute') {
    if (seen && e.fireT <= 0 && d < 430) {
      e.fireT = 1.3;
      for (let i = 0; i < 9; i++) ebullet(e.x, e.y, a2p + rand(-.24, .24), 430, 9, '#ffb04a');
      beep(90, .15, 'sawtooth', .06, -30);
    }
    if (e.bossT <= 0 && seen && d > 100) {
      e.dash = { vx: Math.cos(a2p) * 640, vy: Math.sin(a2p) * 640, t: .42, hit: false };
      e.bossT = 5.5; addText(e.x, e.y - 30, 'CHARGE', e.color);
    }
  } else if (e.type === 'phantom') {
    if (e.bossT <= 0 && seen) {
      const a = p.ang + Math.PI + rand(-.6, .6), nx = p.x + Math.cos(a) * 125, ny = p.y + Math.sin(a) * 125;
      if (nx > 50 && nx < W - 50 && ny > 50 && ny < H - 50 && clearWide(p.x, p.y, nx, ny, g.walls, 8)) {
        spark(e.x, e.y, 14, e.color, 160); e.x = nx; e.y = ny; spark(e.x, e.y, 14, e.color, 160);
        e.burst = 3; e.fireT = .2; e.bossT = 4.5; beep(900, .2, 'sine', .05, -600);
      } else e.bossT = .6;
    }
    if (seen && e.fireT <= 0) {
      if (e.burst > 0) { e.burst--; e.fireT = .24; for (let i = -1; i <= 1; i++) ebullet(e.x, e.y, a2p + i * .16, 470, 9, '#d9b0ff'); }
      else { e.fireT = .5; ebullet(e.x, e.y, a2p + rand(-.05, .05), 480, 9, '#d9b0ff'); }
      beep(500, .05, 'square', .03);
    }
  } else if (e.type === 'wraith') {
    // fan of 3 shots at a steady rhythm
    if (seen && e.fireT <= 0 && d < 470 && e.sandWarn <= 0) {
      e.fireT = .55;
      for (let i = -1; i <= 1; i++) ebullet(e.x + Math.cos(a2p) * e.r, e.y + Math.sin(a2p) * e.r, a2p + i * .13, 470, 9, '#ff7ad9');
      beep(420, .05, 'square', .03);
    }
    // Sandevistan: short telegraph, then the player's time crawls
    if (e.sandWarn > 0) {
      e.sandWarn -= dt;
      if (e.sandWarn <= 0) {
        g.pslowT = e.counter ? Math.max(3.5, g.slowT) : 3.5; g.pslowMax = g.pslowT; e.counter = false;
        g.pslowF = .35; e.bossT = 20; e.rushT = .9;   // cooldown 20s (field lasts 3.5s of it)
        e.fireT = .1;
        g.shake = 6; g.rings.push({ x: p.x, y: p.y, r: 10, max: 160, t: .5 });
        addText(p.x, p.y - 40, 'เวลาของคุณช้าลง', '#ff4fc3'); beep(70, .7, 'sawtooth', .07, 380);
      }
    } else if (e.bossT <= 0 && seen && g.pslowT <= 0 && g.stopT <= 0) {
      e.sandWarn = .7; addText(e.x, e.y - 34, 'SANDEVISTAN!', e.color); beep(1200, .3, 'sine', .05, -700);
    } else if (g.slowT > 0 && g.pslowT <= 0 && g.stopT <= 0 && g.rt - e.counterAt > 22) {
      // the player just opened Sandevistan: answer it with a quick cast (no cooldown wait, shorter telegraph)
      e.sandWarn = .35; e.counter = true; e.counterAt = g.rt;
      addText(e.x, e.y - 34, 'สวน SANDEVISTAN!', e.color); beep(1500, .25, 'sine', .05, -900);
    }
    // charge in while the player is slowed
    if (e.rushT > 0) {
      e.rushT -= dt;
      if (e.rushT <= 0 && seen && g.pslowT > 0) e.dash = { vx: Math.cos(a2p) * 650, vy: Math.sin(a2p) * 650, t: .4, hit: false };
    }
  } else {
    if (!e.enraged && e.hp < e.max * .5) { e.enraged = true; e.rage = 999; addText(e.x, e.y - 34, 'WARDEN ULT', e.color); }
    if (seen && e.fireT <= 0 && d < 500) { e.fireT = e.enraged ? .5 : .85; ebullet(e.x, e.y, a2p + rand(-.03, .03), 520, 16, '#8ff7e8', 1.8); beep(260, .06, 'square', .03); }
    if (e.bossT <= 0) {
      const n = e.enraged ? 28 : 18, off = Math.random() * TAU;
      for (let i = 0; i < n; i++) ebullet(e.x, e.y, off + i / n * TAU, 235, 10, '#5ff0dc', 3);
      e.bossT = e.enraged ? 3 : 4.2; g.rings.push({ x: e.x, y: e.y, r: 10, max: 90, t: .5 });
      beep(110, .3, 'sawtooth', .06, 80);
    }
  }
}

function inspectCorpse(e, dt, spd) {
  const g = G, s = e.insp, c = s.c;
  e.meter = Math.max(e.meter, .35);
  if (s.stage === 'go') {
    moveTo(e, c.x, c.y, spd * .78, dt); turnTo(e, e.mv, dt, 5);
    if (Math.hypot(c.x - e.x, c.y - e.y) < 28) {
      s.stage = 'look'; s.pause = 1.1; s.pts = [];
      callNearby(e, c.x, c.y, 320); g.alertLvl = Math.min(3, g.alertLvl + .25);
      addText(e.x, e.y - 22, '!?', '#ff9f68'); beep(560, .12, 'square', .04);
      const off = Math.random() * TAU;
      for (let i = 0; i < 4; i++) {
        const a = off + i * TAU / 4, px = c.x + Math.cos(a) * 65, py = c.y + Math.sin(a) * 65;
        if (px > 30 && px < W - 30 && py > 30 && py < H - 30 && clearWide(c.x, c.y, px, py, g.walls, e.r - 2)) s.pts.push([px, py]);
      }
    }
  } else if (s.stage === 'look') {
    e.ang += dt * 1.8; s.pause -= dt;
    if (s.pause <= 0) {
      if (s.i >= s.pts.length) { startSearch(e, c.x, c.y, 0, 0, 2); }
      else { s.stage = 'walk'; s.t = 0; }
    }
  } else {
    const pt = s.pts[s.i]; s.t += dt;
    moveTo(e, pt[0], pt[1], spd * .6, dt); turnTo(e, e.mv, dt, 5);
    if (Math.hypot(pt[0] - e.x, pt[1] - e.y) < 10 || s.t > 3) { s.i++; s.stage = 'look'; s.pause = .7; }
  }
}

function updEnemy(e, dt) {
  const g = G, p = g.p;
  if (e.dead) return;
  e.flash = Math.max(0, e.flash - dt); e.fireT -= dt; e.skCd -= dt; e.rage -= dt;
  if (e.meleeT > 0) e.meleeT -= dt;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), a2p = Math.atan2(dy, dx);

  // dash in progress (elite skill / boss charge)
  if (e.dash) {
    e.x += e.dash.vx * dt; e.y += e.dash.vy * dt; pushOut(e, g.walls);
    e.dash.t -= dt;
    g.fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: .25, max: .25, col: e.boss ? e.color : '#37e6d4', r: e.r * .8 });
    if (e.boss && !e.dash.hit && d < e.r + p.r + 4) { e.dash.hit = true; hurtPlayer(26); }
    if (e.dash.t <= 0) e.dash = null;
    return;
  }

  // ---- perception: central cone (full rate) + wide short peripheral cone (slow rate) ----
  let seen = false, rate = 0;
  const hidden = p.invis > 0 || inSmoke(e.x, e.y, p.x, p.y);
  const rng = visRange(e);
  if (!hidden) {
    if (e.state === 'chase') seen = d < 430 && (clearWide(e.x, e.y, p.x, p.y, g.walls, 3) || canSeeBody(e, p));
    else {
      const range = rng * (p.sneak ? VIS.sneak : 1) * (p.moving ? 1 : VIS.still);
      if (d < range && canSeeBody(e, p)) {
        const off = Math.abs(angDiff(a2p, e.ang));
        if (off < VIS.core) rate = 1;
        else if (off < VIS.per && d < range * VIS.perR) rate = .45 + .3 * (1 - (off - VIS.core) / (VIS.per - VIS.core));   // fades out toward the edge of the periphery
        if (d < VIS.close) rate = Math.max(rate, 1);
      }
      seen = rate > 0;
    }
  }
  if (seen) e.lkv = { x: p.vx || 0, y: p.vy || 0 };
  if (e.cautious > 0) e.cautious -= dt;
  if (e.state !== 'chase') {
    if (seen) {
      const k = (1.7 - d / rng) * rate * (p.sneak ? .6 : 1) * (d < VIS.close - 10 ? 3 : 1) * (e.state === 'search' ? 1.35 : 1);
      e.meter += k * dt; e.tgt = { x: p.x, y: p.y }; e.insp = null;
      if (e.state === 'patrol' && e.meter > .3) goSus(e);
      else if (e.state === 'search' && e.meter > .6) startSearch(e, p.x, p.y, p.vx, p.vy);
    } else e.meter = Math.max(0, e.meter - dt * (e.cautious > 0 ? .12 : .3));
    if (e.meter >= 1) goChase(e);
  }

  // heard a friend's shout / call about a body -> go search that spot
  if (e.state === 'chase') e.hear = null;
  else if (e.hear) {
    e.hear.t -= dt;
    if (e.hear.t <= 0) {
      const h = e.hear; e.hear = null;
      startSearch(e, h.x, h.y, 0, 0, 1);
      addText(e.x, e.y - 22, '?', '#ffd24a'); beep(480, .08, 'triangle', .03);
    }
  }
  // spot a friend's corpse -> become suspicious and inspect it
  if (e.state !== 'chase' && !e.insp) {
    if (!e.known) e.known = new Set();
    for (const c of g.corpses) {
      if (e.known.has(c)) continue;
      const cd = Math.hypot(c.x - e.x, c.y - e.y);
      if (cd > e.vision * .9) continue;
      if (cd > 30 && Math.abs(angDiff(Math.atan2(c.y - e.y, c.x - e.x), e.ang)) > VIS.core + .15) continue;
      if (!losClear(e.x, e.y, c.x, c.y, g.walls) || inSmoke(e.x, e.y, c.x, c.y)) continue;
      e.known.add(c);
      goSus(e, c.x, c.y, .4); e.surprise = 0;
      e.insp = { c, stage: 'go', pts: null, i: 0, pause: 0, t: 0 };
      addText(e.x, e.y - 22, '?', '#ffd24a'); beep(380, .1, 'triangle', .03);
      break;
    }
  }

  // buddy missing and nobody has found the body: after a while, go check his patrol route
  if (e.state === 'patrol' && !e.boss && e.buddy && e.buddy.dead) {
    const bd = e.buddy;
    if (!bd.silent || (e.known && e.known.has(bd.corpseRef))) pickBuddy(e);
    else if (g.time - bd.diedAt > e.missDelay) {
      const w = bd.path[bd.pi];
      startSearch(e, w[0], w[1], 0, 0, 2);
      g.alertLvl = Math.min(3, g.alertLvl + .15);
      addText(e.x, e.y - 22, '? เพื่อนหาย', '#ffd24a'); beep(340, .14, 'triangle', .035);
      pickBuddy(e);
    }
  }

  let spd = e.spd * (e.rage > 0 ? 1.35 : 1);
  if (e.boss && g.clash) spd = p.spd * p.haste;   // Sandevistan clash: the boss moves exactly as fast as the player
  if (e.state === 'patrol') {
    const w = e.path[e.pi];
    if (e.wait > 0) {                       // pause at waypoint and sweep the view left/right
      e.wait -= dt; e.scanT += dt;
      turnTo(e, e.scanA + Math.sin(e.scanT * 1.7) * 1.1, dt, 3.2);
    } else {
      moveTo(e, w[0], w[1], spd * .62, dt);
      if (e.face && e.face.t > 0) { e.face.t -= dt; turnTo(e, e.face.a, dt, 5); }   // glance toward a faint sound
      else turnTo(e, e.mv, dt, 4);
      if (Math.hypot(w[0] - e.x, w[1] - e.y) < 10) {
        e.scanA = e.mv; e.scanT = 0;
        if (e.path.length > 2 && Math.random() < .2) e.dir *= -1;      // occasionally reverse so routes aren't predictable
        e.pi = (e.pi + e.dir + e.path.length) % e.path.length; e.wait = rand(.8, 2.2);
      }
    }
  } else if (e.state === 'sus' && e.insp) {
    inspectCorpse(e, dt, spd);
  } else if (e.state === 'sus') {
    const t = e.tgt || { x: e.x, y: e.y };
    e.susPeak = Math.max(e.susPeak, e.meter);
    if (e.surprise > 0) { e.surprise -= dt; turnTo(e, Math.atan2(t.y - e.y, t.x - e.x), dt, 8); }   // stop and turn toward it first
    else if (Math.hypot(t.x - e.x, t.y - e.y) > 14 && e.wait === 0) { moveTo(e, t.x, t.y, spd * .78, dt); turnTo(e, e.mv, dt, 5); }
    else {
      if (e.wait === 0) { e.scanA = Math.atan2(t.y - e.y, t.x - e.x); e.scanT = 0; }
      e.wait += dt; e.scanT += dt;
      turnTo(e, e.scanA + Math.sin(e.scanT * 2.2) * 1.3, dt, 4.5);
      if (e.wait > 3.2) {
        if (e.susPeak >= .5) startSearch(e, t.x, t.y, e.lkv.x, e.lkv.y);   // really saw something -> escalate
        else backToPatrol(e);
      }
    }
  } else if (e.state === 'search') {
    updSearch(e, dt, spd);
  } else { // chase
    e.chaseT += dt;
    if (e.react > 0) e.react -= dt;
    if (seen) {
      if (e.loseT > .5) { e.react = Math.max(e.react, .4); e.aim = 0; }   // had lost you: needs a moment to re-acquire and re-aim
      e.tgt = { x: p.x, y: p.y }; e.loseT = 0; turnTo(e, a2p, dt, 9); e.aim = Math.min(1, e.aim + dt * .55);
      g.intel = { x: p.x, y: p.y, t: g.time };   // squad shares what it sees
    } else {
      e.loseT += dt * (hidden ? 2.2 : 1); e.aim = Math.max(0, e.aim - dt * .5);
      if (!hidden && g.intel && g.time - g.intel.t < 1.5 && e.loseT < 1.2) e.tgt = { x: g.intel.x, y: g.intel.y };   // a squadmate still has eyes on you
    }   // smoke/invisibility: they give up looking sooner
    if (e.boss) {
      const keep = BOSSES[e.type].keep;
      if (!seen || d > keep) { moveTo(e, e.tgt.x, e.tgt.y, spd, dt); if (!seen) turnTo(e, e.mv, dt, 6); }
      else if (d < keep - 35) {
        const rx = -Math.cos(a2p), ry = -Math.sin(a2p);
        e.x += rx * spd * .5 * dt; e.y += ry * spd * .5 * dt; pushOut(e, g.walls);
      }
      bossAI(e, dt, seen, a2p, d);
    } else {
      tacticalChase(e, dt, seen, a2p, d, spd);
      if (seen && e.token && e.react <= 0 && e.tac.ph !== 'hide') enemyShoot(e, a2p, d);
    }
    if (d < e.r + p.r + 6 && e.meleeT <= 0 && (e.boss || !e.gun)) { e.meleeT = .7; hurtPlayer(e.boss ? 20 : 12); }
    if (g.M.skills && e.elite) {
      if (seen && e.skCd <= 0 && d > 110 && d < 330) { e.dash = { vx: Math.cos(a2p) * 900, vy: Math.sin(a2p) * 900, t: .17 }; e.skCd = 6; }
      if (!e.ultUsed && e.chaseT > 6) { e.ultUsed = true; e.rage = 5; addText(e.x, e.y - 24, 'RAGE', '#ffb347'); }
    }
    // lost the player: don't give up, go to last known position and search from there
    if (!seen && (e.loseT > 1.4 || (e.loseT > .4 && Math.hypot(e.tgt.x - e.x, e.tgt.y - e.y) < 18))) {
      startSearch(e, e.tgt.x, e.tgt.y, hidden ? 0 : e.lkv.x, hidden ? 0 : e.lkv.y);   // lost in smoke: no idea which way you went
      addText(e.x, e.y - 22, '?', '#ff9f68');
    }
  }
}

// chasers without an attack slot hold a flanking bearing around the player instead of queueing in a line
function flank(e, a2p, keep, spd, dt) {
  const p = G.p;
  if (e.flankA === null) e.flankA = a2p + Math.PI + (e.slot % 2 ? 1 : -1) * 1.0;
  const R = keep + 70;
  const fx = clamp(p.x + Math.cos(e.flankA) * R, 40, W - 40), fy = clamp(p.y + Math.sin(e.flankA) * R, 40, H - 40);
  if (!blocked[cellOf(fx, fy)] && Math.hypot(fx - e.x, fy - e.y) > 16) moveTo(e, fx, fy, spd * .9, dt);
  turnTo(e, a2p, dt, 7);
}

function g_searched(pt) { G.searched.push([pt[0], pt[1], G.time]); if (G.searched.length > 40) G.searched.shift(); }
function updSearch(e, dt, spd) {
  const s = e.sr;
  if (!s) { backToPatrol(e); return; }
  s.budget -= dt; s.t += dt; e.meter = Math.max(e.meter, .4);
  if (s.stage === 'go') {
    moveTo(e, e.tgt.x, e.tgt.y, spd * .95, dt, true); faceMove(e, dt, 6);
    if (Math.hypot(e.tgt.x - e.x, e.tgt.y - e.y) < 18 || s.t > 7) s.stage = 'plan';
  } else if (s.stage === 'plan') {
    s.pts = pickSearchPoints(e); s.i = 0; s.stage = 'look'; s.pause = .9; s.sgn = Math.random() < .5 ? 1 : -1;
  } else if (s.stage === 'look') {
    e.ang += s.sgn * dt * 2.4; s.pause -= dt;
    if (s.pause <= 0) {
      if (s.budget <= 0 || s.i >= s.pts.length) { addText(e.x, e.y - 22, '...', '#9fb6d1'); beep(300, .12, 'triangle', .03, -80); backToPatrol(e); }
      else { s.stage = 'walk'; s.t = 0; }
    }
  } else {
    const pt = s.pts[s.i];
    moveTo(e, pt[0], pt[1], spd * .78, dt, true); faceMove(e, dt, 5);
    if (Math.hypot(pt[0] - e.x, pt[1] - e.y) < 12 || s.t > 3.5) { g_searched(pt); s.i++; s.stage = 'look'; s.pause = .8; s.sgn *= -1; }
  }
}

function updBullets(rdt, wdt) {
  const g = G, p = g.p;
  for (const b of g.bullets) {
    const dt = b.own === 'e' ? wdt : wdt * g.pf;   // every bullet runs on world time; the player's are also slowed by WRAITH's field
    if (g.stopT > 0) continue;   // time stop: every bullet (enemy and player) hangs in the air, keeps its heading and lifetime
    for (let s = 0; s < 2 && !b.dead; s++) {
      b.x += b.vx * dt / 2; b.y += b.vy * dt / 2;
      for (const w of g.walls) {
        if (b.x > w[0] && b.x < w[0] + w[2] && b.y > w[1] && b.y < w[1] + w[3]) { b.dead = true; spark(b.x, b.y, 3, '#aab4c2', 80); break; }
      }
      if (b.dead) break;
      if (b.own === 'e') {
        if (p.blade > 0 && Math.hypot(b.x - p.x, b.y - p.y) < 92) { b.dead = true; spark(b.x, b.y, 3, '#fff', 90); }
        else if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + b.r) { hurtPlayer(b.dmg); b.dead = true; }
      } else {
        for (const e of g.enemies) {
          if (e.dead || Math.hypot(b.x - e.x, b.y - e.y) > e.r + b.r) continue;
          if (b.hits) { if (b.hits.has(e)) continue; b.hits.add(e); }
          hurtEnemy(e, e.boss && b.bossDmg ? b.bossDmg : b.dmg, { bullet: true });
          if (!b.pierce) { b.dead = true; break; }
        }
      }
    }
    b.life -= dt; if (b.life <= 0) b.dead = true;
  }
  g.bullets = g.bullets.filter(b => !b.dead);
}

function update(dt) {
  const g = G;
  if (!g || g.paused) return;
  const rdt = dt;                                   // real time (player)
  if (g.sandIntro > 0) {                            // Sandevistan activation cinematic: everything holds still
    g.sandIntro -= rdt; g.shake = 0;
    if (g.sandIntro <= 0) { g.sandIntro = 0; g.shake = 6; g.rings.push({ x: g.p.x, y: g.p.y, r: 10, max: 190, t: .5 }); beep(80, .5, 'sawtooth', .05, 500); }
    return;
  }
  g.rt += rdt;
  if (g.slowT > 0) { g.slowT -= rdt; if (g.slowT <= 0) { g.slowT = 0; g.slowF = 1; g.p.haste = 1; g.ghosts = g.ghosts.filter(gh => !gh.sand); beep(500, .3, 'sine', .04, -300); } }
  if (g.pslowT > 0) { g.pslowT -= rdt; if (g.pslowT <= 0) { g.pslowT = 0; g.pslowF = 1; beep(520, .3, 'sine', .04, -300); } }
  // both Sandevistans running at once: player and boss share the same (real-time) speed, everything else stays slowed
  const clash = g.slowT > 0 && g.pslowT > 0;
  if (clash && !g.clash) { addText(W / 2, H / 2 - 40, 'SANDEVISTAN CLASH', '#ff4fc3'); g.shake = 7; beep(60, .6, 'sawtooth', .07, 300); }
  g.clash = clash;
  const pf = g.pslowT > 0 && !clash ? g.pslowF : 1;   // WRAITH's Sandevistan: the player's own time runs slower (unless David matches it)
  g.pf = pf;
  dt = rdt * (g.slowT > 0 ? g.slowF : 1);           // world time (enemies, enemy bullets, smoke, grenades)
  g.time += dt;
  g.fieldT -= dt;
  if (g.fieldT <= 0) { fieldCache.clear(); g.fieldT = .35; }
  if (g.state === 'play') playerUpdate(rdt * pf, rdt);
  for (const gh of g.ghosts) gh.t -= rdt;
  g.ghosts = g.ghosts.filter(gh => gh.t > 0);
  if (g.stopT > 0) g.stopT -= rdt;
  else {
    // attack slots: only the nearest few chasers shoot at once (with hysteresis), the rest flank
    const ch = g.enemies.filter(e => !e.dead && !e.boss && e.state === 'chase');
    const key = e => Math.hypot(e.x - g.p.x, e.y - g.p.y) - (e.token ? 40 : 0) - (e.tac && (e.tac.ph === 'toCover' || e.tac.ph === 'hide' || e.tac.ph === 'peek') ? 150 : 0);   // ducked-behind-cover shooters keep their slot
    ch.sort((a, b) => key(a) - key(b));
    const maxTok = g.M.skills ? 4 : 3;   // one more slot than before: shooters spend part of the time ducked behind cover
    ch.forEach((e, i) => { e.token = i < maxTok; e.slot = i; if (e.token) e.flankA = null; });
    assignSurround(ch, dt);
    g.stillT = g.p.moving ? 0 : g.stillT + dt;
    if (!g.enemies.some(e => !e.dead && (e.state === 'chase' || e.state === 'search'))) g.alertLvl = Math.max(0, g.alertLvl - dt / 15);
    for (const e of g.enemies) updEnemy(e, e.boss && (clash || e.sandWarn > 0) ? rdt : dt);   // in a clash the boss runs at the player's speed
    // final pass: no two guards may occupy the same spot, whatever moved them
    const L = g.enemies.filter(e => !e.dead);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, m = a.r + b.r;
      if (d >= m) continue;
      const k = (m - d) * .5, nx = dx / d, ny = dy / d;
      if (!a.dash) { a.x -= nx * k; a.y -= ny * k; pushOut(a, g.walls); }
      if (!b.dash) { b.x += nx * k; b.y += ny * k; pushOut(b, g.walls); }
    }
  }
  updBullets(rdt, dt);
  updGrenades(dt * pf);
  if (g.pslowT > 0) for (const b of g.enemies) {   // boss afterimages while its field is up
    if (!b.boss || b.dead) continue;
    b.gT = (b.gT || 0) - rdt;
    if (b.gT <= 0) { b.gT = .04; g.ghosts.push({ x: b.x, y: b.y, ang: b.ang, t: .4, max: .4, c: b.color, r: b.r }); }
  }
  for (const s of g.smokes) s.t -= dt;
  g.smokes = g.smokes.filter(s => s.t > 0);
  for (const f of g.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= .93; f.vy *= .93; f.t -= dt; }
  g.fx = g.fx.filter(f => f.t > 0);
  for (const t of g.texts) { t.y -= 26 * rdt; t.t -= rdt; }
  g.texts = g.texts.filter(t => t.t > 0);
  for (const r of g.rings) { r.t -= dt; r.r += (r.max - r.r) * Math.min(1, dt * 7); }
  g.rings = g.rings.filter(r => r.t > 0);
  g.shake = Math.max(0, g.shake - rdt * 22);
  if (g.state === 'play') {
    if (g.p.hp <= 0) { g.state = 'dead'; g.endT = 1.1; }
    else if (!g.enemies.some(e => !e.dead)) { g.state = 'clear'; g.endT = 1.1; }
  } else {
    g.endT -= rdt;
    if (g.endT <= 0 && !g.shown) { g.shown = true; showResult(); }
  }
}
