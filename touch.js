'use strict';
// Mobile touch controls. Feeds the existing input state (keys / mouse) and calls the existing action functions.
// Shown only on touch-capable devices, only while a mission is on screen.
(function () {
  const PHONE = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);   // phone/tablet: touch is the primary input
  window.touchUI = PHONE;
  window.touchMove = { x: 0, y: 0 };
  const TOUCH = (window.matchMedia && matchMedia('(any-pointer: coarse)').matches) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!TOUCH) return;

  const stageEl = document.getElementById('stage'), overlayEl = document.getElementById('overlay');
  let touchMode = PHONE;   // auto-aim on; turns off when a real mouse moves (touch laptops)
  let shown = false, sneakOn = false;
  const stick = { id: null, x: 0, y: 0 };

  const css = document.createElement('style');
  css.textContent = `
#tc{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;
  padding:12px max(14px,env(safe-area-inset-right,0px)) max(14px,env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px));
  pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
#tc[hidden]{display:none}
#tc>*{pointer-events:auto;touch-action:none}
#tc .sbase{position:relative;width:112px;height:112px;border-radius:50%;background:rgba(22,26,32,.55);border:1.5px solid rgba(235,232,227,.35)}
#tc .sknob{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,51,71,.75);border:1.5px solid rgba(255,213,218,.8)}
#tc .pad{display:grid;grid-template-columns:repeat(3,50px);grid-auto-rows:50px;gap:8px}
#tc .b{display:grid;place-items:center;border-radius:50%;background:rgba(22,26,32,.6);border:1.5px solid rgba(235,232,227,.4);color:#ebe8e3;
  font:700 14px/1 "IBM Plex Mono",ui-monospace,monospace;padding:0}
#tc .b.on,#tc .b:active{background:rgba(255,51,71,.7);border-color:#ffd5da}
#tc .b.fire{grid-column:1/4;border-radius:25px;font:700 15px "Noto Sans Thai",sans-serif}
#tc .b.pause{width:44px;height:44px;margin-bottom:6px;font-size:16px}
`;
  document.head.appendChild(css);

  const layer = document.createElement('div');
  layer.id = 'tc'; layer.hidden = true;
  layer.innerHTML = `
    <div class="sbase" id="tcStick"><div class="sknob" id="tcKnob"></div></div>
    <button class="b pause" id="tcPause" aria-label="พักเกม">❚❚</button>
    <div class="pad">
      <button class="b" data-a="Q">Q</button><button class="b" data-a="R">R</button><button class="b" data-a="sneak">ย่อง</button>
      <button class="b" data-a="E">E</button><button class="b" data-a="X">X</button><button class="b" data-a="stab">แทง</button>
      <button class="b fire" id="tcFire">ยิง</button>
    </div>`;
  document.body.appendChild(layer);
  layer.addEventListener('contextmenu', e => e.preventDefault());
  layer.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touchMode = true; }, true);
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') touchMode = false; });

  // ---- phone/tablet only: text that mentions keyboard/mouse, and canvas size that fits the screen ----
  const wrapEl = document.querySelector('.wrap');
  let lastHidden = true, chk = 0;
  function fit() {
    if (stageEl.hidden) { wrapEl.style.width = ''; wrapEl.style.justifySelf = ''; document.body.classList.remove('tc-play'); return; }
    document.body.classList.add('tc-play');
    wrapEl.style.width = '';
    const top = wrapEl.getBoundingClientRect().top + scrollY;
    const w = Math.max(240, Math.min(stageEl.clientWidth, (viewH() - top - 8) * 1.6));   // 16:10, never taller than the visible screen
    wrapEl.style.width = w + 'px'; wrapEl.style.justifySelf = 'center';
  }
  const viewH = () => Math.min(innerHeight, (window.visualViewport && visualViewport.height) || innerHeight, document.documentElement.clientHeight || 1e9);
  // the page must never need scrolling while playing: if anything still overflows (late layout, fonts, browser bars), shrink the map until it fits
  function correct() {
    const over = document.documentElement.scrollHeight - viewH();
    if (over > 1) wrapEl.style.width = Math.max(240, wrapEl.getBoundingClientRect().width - over * 1.6) + 'px';
    else if (scrollY > 0 && over <= 1) scrollTo(0, 0);
  }
  {
    const st = document.createElement('style');
    st.textContent = 'body.tc-play{padding-block:8px}';
    document.head.appendChild(st);
    addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
    if (window.visualViewport) visualViewport.addEventListener('resize', fit);
  }
  if (PHONE) {
    document.querySelector('.note').textContent = 'เล่นด้วยหน้าจอสัมผัส: จอยซ้ายเดิน ปุ่มขวาใช้ท่า เล็งอัตโนมัติไปที่ศัตรูใกล้สุด ผ่านด่านเพื่อปลดล็อกด่านถัดไป';
    document.querySelector('.controls dl').innerHTML = [
      ['จอยซ้าย', 'เดิน (เอียงมากเดินเร็ว เอียงน้อยเดินช้า)'],
      ['ย่อง', 'แตะเพื่อเปิด/ปิดการย่อง (เงียบ มองเห็นยากขึ้น) · เดินปกติมีเสียงฝีเท้า'],
      ['เล็ง', 'อัตโนมัติ ไปที่ศัตรูใกล้สุดที่มองเห็น'],
      ['ยิง', 'กดค้างเพื่อยิง (ถ้ามีปืน) หรือแทงมีด'],
      ['แทง', 'แทงมีด'],
      ['E', 'หยิบปืนของศัตรู'],
      ['X', 'ทิ้งปืนที่ถือ'],
      ['Q', 'สกิล'],
      ['R', 'อันติ (ชาร์จจากการสังหาร)'],
      ['❚❚', 'พักเกม'],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    document.getElementById('pauseBtn').textContent = 'พัก';
    for (const c of CHARS) c.sk.d = c.sk.d.replace('ไปทางเมาส์', 'ไปทางที่เล็ง').replace('ไปที่เมาส์', 'ไปที่เป้าที่เล็ง');
  }

  const canAct = () => !!G && G.state === 'play' && !G.paused && !stageEl.hidden;

  // ---- movement stick -> WASD keys (8 directions) ----
  const sbase = document.getElementById('tcStick'), knob = document.getElementById('tcKnob'), R = 42, DZ = .12;
  // analog: dead zone in the middle, full speed from 90% tilt; the game reads window.touchMove (length 0..1)
  function applyStick() {
    const m = Math.hypot(stick.x, stick.y);
    if (m < DZ) { touchMove.x = touchMove.y = 0; return; }
    const k = Math.min(1, (m - DZ) / (.9 - DZ)) / m;
    touchMove.x = stick.x * k; touchMove.y = stick.y * k;
  }
  function stickMove(e) {
    const r = sbase.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    stick.x = dx / R; stick.y = dy / R; applyStick();
  }
  function stickEnd() {
    if (stick.id === null) return;
    stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; applyStick();
  }
  sbase.addEventListener('pointerdown', e => { e.preventDefault(); stick.id = e.pointerId; sbase.setPointerCapture(e.pointerId); stickMove(e); });
  sbase.addEventListener('pointermove', e => { if (e.pointerId === stick.id) stickMove(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) sbase.addEventListener(t, e => { if (e.pointerId === stick.id) stickEnd(); });

  // ---- buttons ----
  const sneakBtn = layer.querySelector('[data-a="sneak"]');
  function setSneak(v) { sneakOn = v; keys.ShiftLeft = v; sneakBtn.classList.toggle('on', v); }
  const actions = {
    Q: () => useSkill(), R: () => useUlt(), E: () => pickup(), X: () => dropGun(), stab: () => stab(),
    sneak: () => setSneak(!sneakOn),
  };
  layer.querySelectorAll('[data-a]').forEach(b => b.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (canAct()) actions[b.dataset.a]();
  }));
  // fire = same as holding the left mouse button (shoots with a gun, otherwise stabs)
  const fire = document.getElementById('tcFire');
  fire.addEventListener('pointerdown', e => { e.preventDefault(); fire.setPointerCapture(e.pointerId); if (canAct()) { mouse.down = true; fire.classList.add('on'); } });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(t, () => { mouse.down = false; fire.classList.remove('on'); });
  document.getElementById('tcPause').addEventListener('pointerdown', e => { e.preventDefault(); if (canAct()) togglePause(); });

  // ---- auto-aim: nearest enemy with a clear line of sight; otherwise face the walking direction ----
  function autoAim() {
    const g = G, p = g.p;
    let best = null, bd = 1e9;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd && losClear(p.x, p.y, e.x, e.y, g.walls)) { bd = d; best = e; }
    }
    if (best) { mouse.x = best.x; mouse.y = best.y; return; }
    const a = (stick.x || stick.y) ? Math.atan2(stick.y, stick.x) : p.ang;
    mouse.x = clamp(p.x + Math.cos(a) * 90, 0, W); mouse.y = clamp(p.y + Math.sin(a) * 90, 0, H);
  }

  function releaseAll() {
    stickEnd(); mouse.down = false; fire.classList.remove('on');
  }
  function loop() {
    if (stageEl.hidden !== lastHidden) { lastHidden = stageEl.hidden; fit(); }
    if (!stageEl.hidden && ++chk % 10 === 0) correct();
    const show = !stageEl.hidden && !!G && overlayEl.hidden;
    if (show !== shown) { shown = show; layer.hidden = !show; if (!show) releaseAll(); }
    if (!G || stageEl.hidden || G.state !== 'play') { if (sneakOn) setSneak(false); }
    if (show) {
      if (sneakOn) keys.ShiftLeft = true;   // survives the blur handler clearing keys
      if (touchMode && canAct()) autoAim();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
