// 따라가기 카메라일 때 왼쪽 위에 보이는 작은 지도 (맵 전체 + 화면이 보는 쪽 부채꼴 + 동물이 바라보는 쪽 화살촉)
const W = 1280, H = 720;

export default class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.info = null;
  }

  setLevel(info) { this.info = info; }

  draw(s, mySlot, yaw, players, lookout = false) {
    const info = this.info;
    if (!info || !s) return;
    const cv = this.cv, g = this.g;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; }
    g.setTransform(dpr * cw / W, 0, 0, dpr * ch / H, 0, 0);

    g.fillStyle = 'rgba(120,190,90,.92)'; g.fillRect(0, 0, W, H);
    const rect = (r, color) => { g.fillStyle = color; g.fillRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h); };
    const dot = (x, y, r, color, line) => {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
      if (line) { g.lineWidth = line; g.strokeStyle = '#fff'; g.stroke(); }
    };

    info.ice.forEach((r) => rect(r, '#dff6ff'));
    info.mud.forEach((r) => rect(r, '#7a5236'));
    info.streams.forEach((r) => {
      rect(r, r.lever && s.lv ? '#cfeffd' : '#8fd8ff');
      if (!r.lever || !s.lv) return;
      // 솟아오른 제방 (물이 들어오는 쪽 끝)
      const alongX = Math.abs(r.vx) > Math.abs(r.vy), back = (alongX ? r.w : r.h) / 2 - 30;
      const x = r.x - (alongX ? Math.sign(r.vx) * back : 0), y = r.y - (alongX ? 0 : Math.sign(r.vy) * back);
      rect({ x, y, w: alongX ? 28 : r.w, h: alongX ? r.h : 28 }, '#8d6e63');
    });
    info.water.forEach((r) => rect(r, '#2f9ee8'));
    (info.swamps || []).forEach((sw) => {
      rect({ x: (sw.x1 + sw.x2) / 2, y: (sw.y1 + sw.y2) / 2, w: sw.x2 - sw.x1, h: sw.y2 - sw.y1 }, '#4a3f63');
      if (lookout) sw.tiles.forEach(([c, r]) => rect({ x: c * 80 + 40, y: r * 80 + 40, w: 74, h: 74 }, '#80deea'));
    });
    (info.bridges || []).forEach((r) => rect(r, s.br ? '#bc8f5a' : '#2f9ee8'));
    (info.levers || []).forEach((lv) => dot(lv.x, lv.y, 30, s.lv ? '#ff5252' : '#ffab91'));
    (info.lookouts || []).forEach((lk) => dot(lk.x, lk.y, 40, '#ffd54f'));
    info.gates.forEach((gt) => {
      if (!gt.code) return;
      dot(gt.code.sign.x, gt.code.sign.y, 34, '#ffe0b2');
      gt.code.pads.forEach((p) => dot(p.x, p.y, 28, '#f5f0e6'));
      if (gt.code.booth) { dot(gt.code.booth.pad.x, gt.code.booth.pad.y, 28, '#ffcc80'); rect(gt.code.booth.door, '#bcaaa4'); }
    });
    info.walls.forEach((r) => rect(r, '#6d4c41'));
    info.gates.forEach((gt, i) => { if (!s.g[i]) rect(gt.door, gt.type === 'hold' ? '#9c6bff' : '#ff7043'); });
    rect({ x: info.home.x, y: info.home.y, w: 170, h: 170 }, 'rgba(255,224,130,.9)');
    if (info.house) rect(info.house, '#c62828');
    g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🏠', info.home.x, info.home.y);
    info.plates.forEach((p, i) => dot(p.x, p.y, p.type === 'crate' ? 50 : 30, s.pl[i] ? '#fff59d' : p.color));
    info.thorns.forEach((t) => dot(t.x, t.y, t.r, '#2e6b30'));
    info.berries.forEach((b, i) => { if (!s.b[i]) dot(b[0], b[1], 16, '#ff1744'); });
    (s.pk || []).forEach(([x, y]) => dot(x, y, 34, '#ff8f1f'));
    s.mv.forEach(([x, y], i) => dot(x, y, info.movers[i].kind === 'bee' ? 24 : 32, info.movers[i].kind === 'bee' ? '#ffd600' : '#fff'));
    rect({ x: s.c[0], y: s.c[1], w: 80, h: 80 }, '#a0522d');

    // 동물이 바라보는 쪽을 가리키는 화살촉
    const arrow = (x, y, fx, fy, r, color) => {
      const a = Math.atan2(fy, fx), tip = r + 34;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * tip, y + Math.sin(a) * tip);
      g.lineTo(x + Math.cos(a + 0.6) * r, y + Math.sin(a + 0.6) * r);
      g.lineTo(x + Math.cos(a - 0.6) * r, y + Math.sin(a - 0.6) * r);
      g.closePath(); g.fillStyle = color; g.fill();
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    };
    for (const [slot, x, y, fx, fy] of s.p) {
      const pl = players.find((r) => r.slot === slot);
      const r = slot === mySlot ? 34 : 26;
      if (slot === mySlot && yaw != null) {
        // 화면(카메라)이 보는 쪽 부채꼴 (화면 돌리기를 켰을 때만. 끄면 늘 북쪽이라 필요 없음)
        g.beginPath(); g.moveTo(x, y);
        g.arc(x, y, 190, yaw - 0.55, yaw + 0.55); g.closePath();
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
      }
      if (fx || fy) arrow(x, y, fx, fy, r, pl?.color || '#fff');
      dot(x, y, r, pl?.color || '#fff', slot === mySlot ? 12 : 0);
    }
    g.lineWidth = 10; g.strokeStyle = '#fff'; g.strokeRect(0, 0, W, H);
  }
}
