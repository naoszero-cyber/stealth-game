'use strict';
// Mobile touch controls. Feeds the existing input state (keys / mouse) and calls the existing action functions.
// Shown only on touch-capable devices, only while a mission is on screen.
(function () {
  const TOUCH = (window.matchMedia && matchMedia('(any-pointer: coarse)').matches) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!TOUCH) return;

  const stageEl = document.getElementById('stage'), overlayEl = document.getElementById('overlay');
  let touchMode = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);   // auto-aim on; turns off when a real mouse moves (touch laptops)
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

  const canAct = () => !!G && G.state === 'play' && !G.paused && !stageEl.hidden;

  // ---- movement stick -> WASD keys (8 directions) ----
  const sbase = document.getElementById('tcStick'), knob = document.getElementById('tcKnob'), R = 42, T = .4;
  function applyStick() {
    keys.KeyD = stick.x > T; keys.KeyA = stick.x < -T; keys.KeyS = stick.y > T; keys.KeyW = stick.y < -T;
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
