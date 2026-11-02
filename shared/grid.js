// 격자 길찾기: 단계가 풀리는지 자동 검사 + 로봇 시연에서 사용
import { FIELD, RULES } from './constants.js';
import { rectsOverlap, circleRectPush, thornRect, houseSpots, homeRect } from './geometry.js';

export const CELL = 20;
export const COLS = FIELD.w / CELL;
export const ROWS = FIELD.h / CELL;

// 바구니·동물이 못 지나가는 것들 (열린 문은 제외)
// bridges: 레버 다리가 놓였다고 볼지 (안 놓였으면 그 자리는 물)
export function solidsFor(level, openGates, who, { bridges = true } = {}) {
  const list = [...level.walls, ...(level.house ? [level.house] : [])];
  level.gates.forEach((g, i) => { if (!openGates[i]) list.push(g.door); });
  if (who === 'crate' || who === 'safe') {
    // 동물은 물·늪·가시덤불에 '들어갈 수는' 있지만 들어가면 처음 자리로 → 길찾기에서는 피함
    level.water.forEach((w) => list.push(w));
    (level.swampCells || []).forEach((w) => list.push(w));
    if (!bridges) (level.bridges || []).forEach((w) => list.push(w));
    level.thorns.forEach((t) => list.push(thornRect(t)));
  }
  return list;
}

// who: 'crate'(바구니 중심), 'safe'(동물, 위험한 곳 피함)
export function buildGrid(level, openGates, who, { inflate = 0, extra = [], bridges = true } = {}) {
  const solids = [...solidsFor(level, openGates, who, { bridges }), ...extra];
  const blocked = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
      let bad;
      if (who === 'crate') {
        const half = RULES.crateHalf + inflate;
        bad = x - half < 0 || x + half > FIELD.w || y - half < 0 || y + half > FIELD.h ||
          solids.some((s) => rectsOverlap({ x, y, w: half * 2, h: half * 2 }, s));
      } else {
        const rr = RULES.playerR + inflate;
        bad = x < rr || x > FIELD.w - rr || y < rr || y > FIELD.h - rr ||
          solids.some((s) => circleRectPush(x, y, rr, s));
      }
      blocked[r * COLS + c] = bad ? 1 : 0;
    }
  }
  return blocked;
}

const toCell = (p) => [Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL)))];

// 막히지 않은 가장 가까운 칸
function nearestFree(blocked, c, r) {
  if (!blocked[r * COLS + c]) return [c, r];
  for (let d = 1; d < 8; d++) {
    for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS && !blocked[rr * COLS + cc]) return [cc, rr];
    }
  }
  return null;
}

// A* (8방향). 성공하면 [{x,y}...] 픽셀 경로, 실패하면 null
export function findPath(blocked, from, to) {
  const s = nearestFree(blocked, ...toCell(from));
  const g = nearestFree(blocked, ...toCell(to));
  if (!s || !g) return null;
  const start = s[1] * COLS + s[0], goal = g[1] * COLS + g[0];
  const N = COLS * ROWS;
  const cost = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const open = [start];
  const inOpen = new Uint8Array(N);
  cost[start] = 0; inOpen[start] = 1;
  const h = (i) => Math.hypot((i % COLS) - g[0], Math.floor(i / COLS) - g[1]);
  const f = new Float32Array(N).fill(Infinity);
  f[start] = h(start);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop(); inOpen[cur] = 0;
    if (cur === goal) {
      const path = [];
      for (let i = cur; i !== -1; i = came[i]) path.push({ x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 });
      return path.reverse();
    }
    const cx = cur % COLS, cy = Math.floor(cur / COLS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (blocked[ni]) continue;
      if (dx && dy && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue; // 모서리 끼기 방지
      const nc = cost[cur] + (dx && dy ? 1.414 : 1);
      if (nc < cost[ni]) {
        cost[ni] = nc; came[ni] = cur; f[ni] = nc + h(ni);
        if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
      }
    }
  }
  return null;
}

export const pathLength = (p) => p.reduce((s, q, i) => (i ? s + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);

// 집 건물 자리 고르기: 위·아래·오른쪽·왼쪽 중 다른 것과 겹치지 않고 바구니가 집까지 갈 길을 막지 않는 첫 자리
export function placeHouse(level) {
  const L = { ...level, house: null };
  const open = L.gates.map(() => true);
  const busy = [...L.walls, ...L.water, ...L.streams, ...L.bridges, ...L.ice, ...L.mud,
    ...L.gates.map((g) => g.door), ...L.thorns.map(thornRect),
    ...(L.swamps || []).map((sw) => ({ x: (sw.x1 + sw.x2) / 2, y: (sw.y1 + sw.y2) / 2, w: sw.x2 - sw.x1, h: sw.y2 - sw.y1 })),
    { x: L.crate.x, y: L.crate.y, w: 120, h: 120 }, { x: L.start.x, y: L.start.y, w: 100, h: 100 }];
  const spots = houseSpots(L.home);
  const home = homeRect(L.home);
  const free = spots.filter((r) => !busy.some((b) => rectsOverlap(r, b)));
  for (const r of free) {
    const path = findPath(buildGrid(L, open, 'crate', { inflate: 20, extra: [r] }), L.crate, home);
    if (path && Math.hypot(path.at(-1).x - home.x, path.at(-1).y - home.y) <= 40) return r;
  }
  return free[0] || spots[0];
}
