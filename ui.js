'use strict';
const $ = id => document.getElementById(id);
const menuEl = $('menu'), stageEl = $('stage'), overlay = $('overlay');

function bar(label, frac) {
  return `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(frac * 100)}%"></b></i></div>`;
}
function buildMenu() {
  $('cards').innerHTML = CHARS.map((c, i) => `
    <button class="card${i === selChar ? ' on' : ''}" data-i="${i}" aria-pressed="${i === selChar}">
      <span class="dot" aria-hidden="true"></span>
      <span class="cname">${c.name}<small>${c.th}</small></span>
      ${bar('เลือด', c.hp / 130)}${bar('ความเร็ว', (c.spd - 120) / 90)}
      <span class="ab"><em>Q</em><strong>${c.sk.n}</strong><span>${c.sk.d}</span><span class="cd">คูลดาวน์ ${c.sk.cd} วิ</span></span>
      <span class="ab ult"><em>R</em><strong>${c.ult.n}</strong><span>${c.ult.d}</span><span class="cd">ชาร์จจากการสังหาร</span></span>
    </button>`).join('');
  $('cards').querySelectorAll('.card').forEach(b => b.addEventListener('click', () => { selChar = +b.dataset.i; buildMenu(); }));
  $('maps').innerHTML = MAPS.map((m, i) => {
    const lock = i >= unlocked;
    return `<button class="map${i === selMap ? ' on' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}>
      <span class="mn">${lock ? 'ล็อก' : 'ด่าน ' + (i + 1)}</span><strong>${m.name}</strong>
      <span class="tags">${m.boss ? `<u style="--c:${BOSSES[m.boss.type].color}">บอส ${BOSSES[m.boss.type].name}</u>` : ''}${m.skills ? '<u style="--c:#37e6d4">ศัตรูมีสกิล</u>' : ''}</span></button>`;
  }).join('');
  $('maps').querySelectorAll('.map').forEach(b => b.addEventListener('click', () => { if (!b.disabled) { selMap = +b.dataset.i; buildMenu(); } }));
}

function showStage(on) { menuEl.hidden = on; stageEl.hidden = !on; }
function beginMap(mi) {
  selMap = mi; overlay.hidden = true; showStage(true);
  startMap(mi);
  window.scrollTo(0, 0);
}
function showOverlay(title, text, buttons, tone) {
  $('ovT').textContent = title; $('ovT').dataset.tone = tone || '';
  $('ovS').innerHTML = text;
  const box = $('ovB'); box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.t; el.className = b.cls || '';
    el.addEventListener('click', b.f); box.appendChild(el);
  }
  overlay.hidden = false;
}
function toMenu() { G = null; overlay.hidden = true; showStage(false); buildMenu(); }
function showResult() {
  const g = G, t = Math.round(g.time);
  const rank = g.alerts === 0 ? 'S' : g.alerts <= 2 ? 'A' : g.alerts <= 5 ? 'B' : 'C';
  const stats = `<div class="rs"><span>เวลา</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
    <div class="rs"><span>สังหาร</span><b>${g.kills}</b></div>
    <div class="rs"><span>ฆ่าเงียบ</span><b>${g.stealth}</b></div>
    <div class="rs"><span>ถูกจับได้</span><b>${g.alerts}</b></div>
    <div class="rs rank"><span>เกรด</span><b>${rank}</b></div>`;
  if (g.state === 'clear') {
    if (g.mi + 1 >= unlocked && g.mi + 1 < MAPS.length) { unlocked = g.mi + 2; try { localStorage.setItem('cd_unlocked', String(unlocked)); } catch (e) {} }
    const last = g.mi + 1 >= MAPS.length;
    const btns = last ? [{ t: 'เล่นด่านสุดท้ายอีกครั้ง', f: () => beginMap(g.mi) }, { t: 'กลับเมนู', f: toMenu, cls: 'ghost' }]
      : [{ t: 'ด่านถัดไป', f: () => beginMap(g.mi + 1) }, { t: 'เล่นซ้ำ', f: () => beginMap(g.mi), cls: 'ghost' }, { t: 'เมนู', f: toMenu, cls: 'ghost' }];
    showOverlay(last ? 'จบภารกิจทั้งหมด' : 'ภารกิจสำเร็จ', stats, btns, 'win');
  } else {
    showOverlay('ภารกิจล้มเหลว', stats, [{ t: 'ลองใหม่', f: () => beginMap(g.mi) }, { t: 'เมนู', f: toMenu, cls: 'ghost' }], 'lose');
  }
}
function togglePause() {
  if (!G || G.state !== 'play') return;
  G.paused = !G.paused;
  if (G.paused) showOverlay('พักเกม', 'กด P หรือ Esc เพื่อเล่นต่อ', [{ t: 'เล่นต่อ', f: togglePause }, { t: 'กลับเมนู', f: toMenu, cls: 'ghost' }]);
  else overlay.hidden = true;
}

// ---- input ----
addEventListener('keydown', e => {
  if (!G || stageEl.hidden) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (G.paused) return;
  if (e.code === 'KeyQ') useSkill();
  else if (e.code === 'KeyR') useUlt();
  else if (e.code === 'KeyE') pickup();
  else if (e.code === 'KeyX') dropGun();
  else if (e.code === 'KeyH') G.debug = !G.debug;
  else if (e.code === 'Space') stab();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; if (G && G.state === 'play' && !G.paused) togglePause(); });
function setMouse(e) {
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * W / r.width; mouse.y = (e.clientY - r.top) * H / r.height;
}
cv.addEventListener('mousemove', setMouse);
cv.addEventListener('mousedown', e => { setMouse(e); if (e.button === 0) mouse.down = true; else if (e.button === 2 && G && !G.paused) stab(); });
addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

$('start').addEventListener('click', () => beginMap(selMap));
$('pauseBtn').addEventListener('click', togglePause);
$('menuBtn').addEventListener('click', toMenu);

// ---- loop ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  if (G && !stageEl.hidden) { update(dt); draw(); }
  requestAnimationFrame(frame);
}
buildMenu();
requestAnimationFrame(frame);
