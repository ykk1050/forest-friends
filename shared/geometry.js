// 서버·브라우저·자동 검사가 함께 쓰는 위치 계산
import { RULES, FIELD } from './constants.js';

// 모서리 좌표로 사각형 만들기 → 중심 좌표 {x, y, w, h}
export const R = (x1, y1, x2, y2) => ({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 });

// 움직이는 장애물의 시간 t(ms) 위치
//  - path: [[x,y],...] 를 speed(칸/초)로 왔다 갔다 (loop: true 면 한 방향으로 계속 돎)
//  - 통나무처럼 사각형인 경우 크기는 h.w/h.h 로 유지
export function hazardPos(h, t) {
  const pts = h.loop ? [...h.path, h.path[0]] : h.path;
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(len);
    total += len;
  }
  if (total === 0) return { x: pts[0][0], y: pts[0][1] };
  let s = ((t / 1000) * h.speed + (h.phase || 0) * total) % (h.loop ? total : total * 2);
  if (!h.loop && s > total) s = total * 2 - s;
  for (let i = 0; i < segs.length; i++) {
    if (s <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, s / segs[i]) : 0;
      return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k };
    }
    s -= segs[i];
  }
  return { x: pts[0][0], y: pts[0][1] };
}

// 발판 위치: 모둠 인원 n명에 맞춰 at[]의 중심들에 번갈아 배치
export function teamPlatePositions(spec, n) {
  const centers = spec.at;
  const groups = centers.map(() => []);
  for (let i = 0; i < n; i++) groups[i % centers.length].push(i);
  const out = new Array(n);
  centers.forEach((c, gi) => {
    const k = groups[gi].length;
    // 한 줄로 나란히 (85칸 간격)
    groups[gi].forEach((pi, j) => {
      out[pi] = { x: Math.round(c.x + (j - (k - 1) / 2) * 85), y: c.y };
    });
  });
  return out;
}

// 원(px,py,r)이 사각형과 겹치면 밀어낼 벡터, 아니면 null
export function circleRectPush(px, py, r, rect) {
  const hw = rect.w / 2, hh = rect.h / 2;
  const cx = Math.max(rect.x - hw, Math.min(px, rect.x + hw));
  const cy = Math.max(rect.y - hh, Math.min(py, rect.y + hh));
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) {
    const left = px - (rect.x - hw), right = rect.x + hw - px;
    const up = py - (rect.y - hh), down = rect.y + hh - py;
    const m = Math.min(left, right, up, down);
    if (m === left) return { x: -(left + r), y: 0 };
    if (m === right) return { x: right + r, y: 0 };
    if (m === up) return { x: 0, y: -(up + r) };
    return { x: 0, y: down + r };
  }
  const d = Math.sqrt(d2);
  return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
}

export const rectsOverlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
export const inRect = (x, y, r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;
export const distToRect = (px, py, rect) => Math.hypot(
  Math.max(Math.abs(px - rect.x) - rect.w / 2, 0), Math.max(Math.abs(py - rect.y) - rect.h / 2, 0));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const homeRect = (home) => ({ x: home.x, y: home.y, w: RULES.homeSize, h: RULES.homeSize });
// 마당 옆에 세울 수 있는 집 건물 자리 (위·아래·오른쪽·왼쪽 순서, 맵 밖으로 나가는 자리는 뺌)
// side: 집 문이 마당을 보도록 3D에서 돌릴 방향
export function houseSpots(home) {
  const o = RULES.homeSize / 2 + 40;
  return [
    { x: home.x, y: home.y - o, w: 92, h: 70, side: 'up' },
    { x: home.x, y: home.y + o, w: 92, h: 70, side: 'down' },
    { x: home.x + o, y: home.y, w: 70, h: 92, side: 'right' },
    { x: home.x - o, y: home.y, w: 70, h: 92, side: 'left' }
  ].filter((r) => r.x - r.w / 2 >= 0 && r.x + r.w / 2 <= FIELD.w && r.y - r.h / 2 >= 0 && r.y + r.h / 2 <= FIELD.h);
}

// 가시덤불(원)을 바구니가 못 지나가는 사각형으로
export const thornRect = (t) => ({ x: t.x, y: t.y, w: t.r * 2, h: t.r * 2 });
