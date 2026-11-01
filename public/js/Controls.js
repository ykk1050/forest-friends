// 내 캐릭터 하나만 조종
//  - 터치: 왼쪽 조이스틱 = 이동, 오른쪽 조이스틱 = 화면(카메라) 돌리기, 오른쪽 아래 버튼 = 잡기
//  - 키보드: WASD/방향키 = 이동, Q/E = 화면 돌리기, Space/Enter/J = 잡기, C = 카메라 바꾸기
//  - 게임패드: 왼쪽 스틱 이동, 오른쪽 스틱 화면, A 잡기
const RADIUS = 60;

class Stick {
  constructor(zone, base, knob) {
    this.zone = zone; this.base = base; this.knob = knob;
    this.id = null; this.v = { x: 0, y: 0 };
    zone.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
  }
  down(e) {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    const r = this.zone.getBoundingClientRect();
    Object.assign(this.base.style, { display: 'block', left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` });
    this.move(e);
  }
  move(e) {
    if (e.pointerId !== this.id) return;
    let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.v = len < 10 ? { x: 0, y: 0 } : { x: dx / RADIUS, y: dy / RADIUS };
  }
  up(e) {
    if (e && e.pointerId !== this.id) return;
    this.id = null; this.v = { x: 0, y: 0 };
    this.base.style.display = 'none'; this.knob.style.transform = '';
  }
}

export default class Controls {
  constructor({ moveZone, moveBase, moveKnob, lookZone, lookBase, lookKnob, grabBtn, onCamToggle }) {
    this.moveStick = new Stick(moveZone, moveBase, moveKnob);
    this.lookStick = new Stick(lookZone, lookBase, lookKnob);
    this.grabBtn = grabBtn;
    this.touchGrab = false;
    this.grabIds = new Set();
    this.keys = new Set();

    grabBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.grabIds.add(e.pointerId);
      this.touchGrab = true;
      grabBtn.classList.add('on');
    });
    const release = (e) => {
      if (this.grabIds.delete(e.pointerId) && this.grabIds.size === 0) { this.touchGrab = false; grabBtn.classList.remove('on'); }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    grabBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyC' && !e.repeat) onCamToggle?.();
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.reset(); });
  }

  reset() {
    this.moveStick.up(); this.lookStick.up();
    this.grabIds.clear(); this.touchGrab = false; this.grabBtn.classList.remove('on');
  }

  pad() {
    try {
      for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p && p.connected) return p;
    } catch { /* 게임패드 미지원 브라우저 */ }
    return null;
  }

  // move: 조이스틱 그대로(위 = -y), look: 화면 돌리기, a: 잡기
  get() {
    const k = this.keys;
    let { x, y } = this.moveStick.v;
    let lx = this.lookStick.v.x, ly = this.lookStick.v.y;
    let a = this.touchGrab || k.has('Space') || k.has('Enter') || k.has('KeyJ');
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (kx || ky) { x = kx; y = ky; }
    const kl = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (kl) lx = kl;
    const p = this.pad();
    if (p) {
      const px = p.axes[0] || 0, py = p.axes[1] || 0;
      if (Math.hypot(px, py) > 0.25) { x = px; y = py; }
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > 0.25) lx = rx;
      if (Math.abs(ry) > 0.25) ly = ry;
      if (p.buttons[0]?.pressed) a = true;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { move: { x, y }, look: { x: lx, y: ly }, a };
  }
}
