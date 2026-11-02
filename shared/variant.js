// 다시 할 때마다 조금씩 다른 단계 만들기 (리플레이성)
//  1) 맵 뒤집기: 좌우·위아래를 무작위로 뒤집음 (같은 단계를 거울에 비춘 것 → 똑같이 풀 수 있음)
//  2) 망루 늪 길: 2칸 너비 징검다리 길을 새로 만들고, 풀 수 있는지 바로 검사
//  3) 딸기 자리: 걸어서 갈 수 있는 곳 중 서로 떨어진 3곳을 새로 고름
//  4) 장애물 타이밍: 꿀벌·통나무·눈덩이 출발 시점과 빠르기(±15%)를 바꿈
import { FIELD } from './constants.js';
import { TILE, swampCells } from './levelkit.js';
import { analyzeLevel } from './solver.js';
import { buildGrid, findPath, CELL, COLS, ROWS } from './grid.js';
import { circleRectPush, homeRect } from './geometry.js';

// 같은 seed면 같은 결과 (시험할 때 다시 만들 수 있게)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1) 뒤집기 ----------
const COLS_T = FIELD.w / TILE, ROWS_T = FIELD.h / TILE;   // 16 × 9 징검다리 칸

export function mirrorLevel(L, fx, fy) {
  if (!fx && !fy) return L;
  const X = (x) => (fx ? FIELD.w - x : x);
  const Y = (y) => (fy ? FIELD.h - y : y);
  const pt = (p) => ({ ...p, x: X(p.x), y: Y(p.y) });
  const rect = (r) => ({ ...r, x: X(r.x), y: Y(r.y) });
  const plates = (s) => {
    if (s.type === 'crate') return { ...s, x: X(s.x), y: Y(s.y) };
    if (s.type === 'code') return { ...s, sign: pt(s.sign), pads: s.pads.map(pt), booth: { door: rect(s.booth.door), room: rect(s.booth.room), pad: pt(s.booth.pad) } };
    return { ...s, at: s.at.map(pt) };
  };
  const swamps = L.swamps.map((sw) => ({
    x1: fx ? FIELD.w - sw.x2 : sw.x1, x2: fx ? FIELD.w - sw.x1 : sw.x2,
    y1: fy ? FIELD.h - sw.y2 : sw.y1, y2: fy ? FIELD.h - sw.y1 : sw.y2,
    tiles: sw.tiles.map(([c, r]) => [fx ? COLS_T - 1 - c : c, fy ? ROWS_T - 1 - r : r])
  }));
  // 선생님 힌트 글의 방향 낱말도 맞춰 바꿈
  let tip = L.tip;
  const swap = (s, a, b) => s.split(a).map((part) => part.split(b).join('\u0000')).join(b).split('\u0000').join(a);
  if (fy) tip = swap(tip, '아래', '위');
  if (fx) tip = swap(tip, '왼쪽', '오른쪽');
  return {
    ...L, tip,
    start: pt(L.start), home: pt(L.home), crate: { ...L.crate, x: X(L.crate.x), y: Y(L.crate.y) },
    walls: L.walls.map(rect),
    gates: L.gates.map((g) => ({ ...g, door: rect(g.door), plates: plates(g.plates) })),
    water: L.water.map(rect), thorns: L.thorns.map(pt), ice: L.ice.map(rect), mud: L.mud.map(rect),
    streams: L.streams.map((s) => ({ ...rect(s), vx: fx ? -s.vx : s.vx, vy: fy ? -s.vy : s.vy })),
    movers: L.movers.map((m) => ({ ...m, path: m.path.map(([x, y]) => [X(x), Y(y)]) })),
    pumpkins: L.pumpkins.map(pt), levers: L.levers.map(pt), bridges: L.bridges.map(rect),
    lookouts: L.lookouts.map(pt), berries: L.berries.map(([x, y]) => [X(x), Y(y)]),
    swamps, swampCells: swamps.flatMap(swampCells)
  };
}

// ---------- 2) 망루 늪 길 새로 만들기 ----------
// 2×2 붓을 들어온 쪽에서 나가는 쪽으로 옮기며 칠함 (가로로 한 칸씩, 중간중간 위아래로)
function randomSwampPath(sw, oldTiles, rand) {
  const c1 = Math.round(sw.x1 / TILE), c2 = Math.round(sw.x2 / TILE) - 1;   // 늪 첫·끝 열
  const r1 = Math.round(sw.y1 / TILE), r2 = Math.round(sw.y2 / TILE) - 1;
  // 원래 길이 늪에 들어오는 줄(바구니가 들어올 수 있는 높이)은 그대로
  const leftEdge = oldTiles.some(([c]) => c === c1);
  const entryCol = leftEdge ? c1 : c2;
  const step = leftEdge ? 1 : -1;
  const entryRows = oldTiles.filter(([c]) => c === entryCol).map(([, r]) => r);
  let r = Math.min(...entryRows);
  const tiles = new Set();
  const paint = (c, rr) => { for (const dc of [0, step]) for (const dr of [0, 1]) tiles.add(`${c + dc},${rr + dr}`); };
  let c = entryCol;
  paint(c, r);
  while ((c + step - c2) * step <= 0 && (c + step - c1) * step >= 0) {
    // 위나 아래로 0~3칸 꺾기
    if (rand() < 0.6) {
      const dir = rand() < 0.5 ? -1 : 1;
      const len = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < len; k++) {
        const nr = r + dir;
        if (nr < r1 || nr + 1 > r2) break;
        r = nr;
        paint(c, r);
      }
    }
    c += step;
    if ((c + step - c2) * step > 0 && (c + step - c1) * step < 0) break;
    paint(c, r);
  }
  // 끝 열까지 채우기 (홀수 폭이면 마지막 한 줄)
  const endCol = leftEdge ? c2 : c1;
  for (const dr of [0, 1]) tiles.add(`${endCol},${r + dr}`);
  return [...tiles].map((k) => k.split(',').map(Number))
    .filter(([cc, rr]) => cc >= Math.min(c1, c2) && cc <= Math.max(c1, c2) && rr >= r1 && rr <= r2);
}

// ---------- 3) 딸기 자리 ----------
function randomBerries(L, rand) {
  const open = L.gates.map(() => true);
  const grid = buildGrid(L, open, 'safe', { inflate: 6 });
  const avoid = [
    homeRect(L.home), { x: L.crate.x, y: L.crate.y, w: 140, h: 140 },
    ...L.gates.map((g) => ({ ...g.door, w: g.door.w + 60, h: g.door.h + 60 })),
    ...L.streams, ...L.bridges,
    ...L.gates.filter((g) => g.plates.booth).map((g) => ({ ...g.plates.booth.room, w: g.plates.booth.room.w + 120, h: g.plates.booth.room.h + 120 }))
  ];
  const picks = [];
  for (let tries = 0; tries < 400 && picks.length < 3; tries++) {
    const c = 2 + Math.floor(rand() * (COLS - 4)), r = 2 + Math.floor(rand() * (ROWS - 4));
    if (grid[r * COLS + c]) continue;
    const p = { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
    if (Math.hypot(p.x - L.start.x, p.y - L.start.y) < 180) continue;
    if (avoid.some((a) => circleRectPush(p.x, p.y, 30, a))) continue;
    if (picks.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < 220)) continue;
    const path = findPath(grid, L.start, p);
    if (!path || Math.hypot(path.at(-1).x - p.x, path.at(-1).y - p.y) > 20) continue;
    picks.push([p.x, p.y]);
  }
  return picks.length === 3 ? picks : L.berries;
}

// ---------- 모두 합치기 ----------
// n: 모둠 인원(풀 수 있는지 검사에 씀), seed: 무작위 씨앗
export function makeVariant(base, n, seed = Date.now()) {
  const rand = rng(seed);
  let L = mirrorLevel(base, rand() < 0.5, rand() < 0.5);
  L = { ...L, variant: { seed } };

  if (L.swamps.length) {
    for (let tries = 0; tries < 12; tries++) {
      const swamps = L.swamps.map((sw) => ({ ...sw, tiles: randomSwampPath(sw, sw.tiles, rand) }));
      const cand = { ...L, swamps, swampCells: swamps.flatMap(swampCells) };
      if (analyzeLevel(cand, Math.max(n, cand.minPlayers || 1)).ok) { L = cand; break; }
    }
  }

  L = { ...L, berries: randomBerries(L, rand) };
  // 호박 퍼즐은 통나무가 호박을 미는 방향·순서가 설계의 핵심이라 타이밍은 그대로 둠
  if (!L.pumpkins.length) {
    L = { ...L, movers: L.movers.map((m) => ({ ...m, phase: (m.phase || 0) + rand(), speed: m.speed * (0.85 + rand() * 0.3) })) };
  }
  return L;
}
