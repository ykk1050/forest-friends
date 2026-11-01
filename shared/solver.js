// 단계 분석: 정말 풀 수 있는지(길찾기) + 별 기준 목표 시간 계산
import { buildGrid, findPath, pathLength, solidsFor } from './grid.js';
import { teamPlatePositions, homeRect, circleRectPush } from './geometry.js';
import { FIELD, RULES } from './constants.js';

const CRATE_INFLATE = 20; // 바구니 둘레에 밀어 줄 자리가 남도록 넉넉하게

// 목표 지점에 동물이 실제로 설 수 있고, 거기까지 길이 있는지
function reachable(level, open, grid, from, to) {
  const r = RULES.playerR;
  if (to.x < r || to.y < r || to.x > FIELD.w - r || to.y > FIELD.h - r) return false;
  if (solidsFor(level, open, 'safe').some((s) => circleRectPush(to.x, to.y, r, s))) return false;
  const path = findPath(grid, from, to);
  return !!path && Math.hypot(path.at(-1).x - to.x, path.at(-1).y - to.y) < 30;
}

export function crateNeed(weight, n) {
  return weight === 1 ? 1 : weight === 3 ? n : Math.ceil(n / 2);
}

// n: 모둠 인원. 결과 { ok, reason, crateDistance, par }
export function analyzeLevel(level, n = 3) {
  const open = level.gates.map(() => false);
  const isHold = (i) => level.gates[i].plates.type === 'hold' && !(level.pumpkinHolds || []).includes(i);
  const need = crateNeed(level.crate.weight, n);
  let crate = { x: level.crate.x, y: level.crate.y };
  let crateDistance = 0;

  // 바구니가 a→b 로 갈 수 있는지. 꾹 발판 문·레버 다리를 지나야 하면 한 명은 잡고 있어야 하므로 need < n 이어야 함
  const reach = (path, to) => path && Math.hypot(path.at(-1).x - to.x, path.at(-1).y - to.y) <= 40;
  const cratePath = (to) => {
    const grid = buildGrid(level, open, 'crate', { inflate: CRATE_INFLATE });
    const path = findPath(grid, crate, to);
    if (!reach(path, to)) return null;
    const usesHold = open.some((o, i) => o && isHold(i));
    if ((usesHold || level.bridges?.length) && need >= n) {
      const closed = open.map((o, i) => o && !isHold(i));
      const p2 = findPath(buildGrid(level, closed, 'crate', { inflate: CRATE_INFLATE, bridges: false }), crate, to);
      if (!reach(p2, to)) return 'heavy';
    }
    return path;
  };
  // 레버 다리가 있으면 레버 하나는 처음부터 갈 수 있어야 함
  if (level.bridges?.length) {
    const grid = buildGrid(level, open, 'safe', { bridges: false });
    if (!level.levers.some((lv) => reachable(level, open, grid, level.start, lv))) return { ok: false, reason: '레버에 갈 수 없어요' };
  }

  while (open.some((o) => !o)) {
    let progressed = false;
    for (let i = 0; i < level.gates.length; i++) {
      if (open[i]) continue;
      const g = level.gates[i];
      const safe = () => buildGrid(level, open, 'safe');
      if (g.plates.type === 'team') {
        const grid = safe();
        const plates = teamPlatePositions(g.plates, n);
        if (plates.every((p) => reachable(level, open, grid, level.start, p))) { open[i] = progressed = true; }
      } else if (g.plates.type === 'code') {
        // 그림 암호: 한 명은 표지판, 다른 친구는 그림 발판 → 2명 이상
        if (n < 2) return { ok: false, reason: '그림 암호 문은 2명 이상이 필요해요' };
        const grid = safe();
        const spots = [g.plates.sign, ...g.plates.pads];
        if (spots.every((p) => reachable(level, open, grid, level.start, p))) { open[i] = progressed = true; }
      } else if (g.plates.type === 'hold') {
        if ((level.pumpkinHolds || []).includes(i)) { open[i] = progressed = true; continue; }
        // 문 양쪽에 꾹 발판이 하나씩 있어야 둘 다 건널 수 있음
        const left = g.plates.at.some((p) => p.x < g.door.x), right = g.plates.at.some((p) => p.x > g.door.x);
        if (!left || !right) return { ok: false, reason: `문 ${i + 1}번: 꾹 발판이 문 양쪽에 있어야 해요` };
        const grid = safe();
        if (g.plates.at.some((p) => reachable(level, open, grid, level.start, p))) { open[i] = progressed = true; }
      } else {
        const path = cratePath(g.plates);
        if (path === 'heavy') return { ok: false, reason: `무거운 바구니는 꾹 발판 문을 지날 수 없어요 (${n}명)` };
        if (path) {
          crateDistance += pathLength(path);
          crate = { x: g.plates.x, y: g.plates.y };
          open[i] = progressed = true;
        }
      }
    }
    if (!progressed) return { ok: false, reason: `문 ${open.findIndex((o) => !o) + 1}번을 열 수 없어요` };
  }

  const home = homeRect(level.home);
  const path = cratePath(home);
  if (path === 'heavy') return { ok: false, reason: `무거운 바구니는 꾹 발판 문을 지날 수 없어요 (${n}명)` };
  if (!path) return { ok: false, reason: '바구니가 집까지 갈 길이 없어요' };
  crateDistance += pathLength(path);

  const safe = buildGrid(level, open, 'safe');
  const lostBerry = level.berries.findIndex((b) => !reachable(level, open, safe, level.start, { x: b[0], y: b[1] }));
  if (lostBerry >= 0) return { ok: false, reason: `딸기 ${lostBerry + 1}번에 닿을 수 없어요` };

  // 목표 시간(초): 바구니 이동 거리 + 문·장애물 수로 어림, 5초 단위로 올림
  const kinds = level.gates.map((g) => g.plates.type);
  const puzzle = kinds.filter((k) => k === 'code').length * 20 + (level.swamps?.length || 0) * 15 + (level.levers?.length ? 12 : 0);
  const raw = 15 + crateDistance / 50 + kinds.filter((k) => k === 'team').length * 12 +
    kinds.filter((k) => k === 'crate').length * 8 + kinds.filter((k) => k === 'hold').length * 14 +
    level.movers.length * 4 + (level.pumpkins?.length || 0) * 6 +
    puzzle + (level.crate.weight === 3 ? 10 : 0) + (level.ice.length || level.mud.length ? 10 : 0) + level.streams.length * 4;
  return { ok: true, crateDistance: Math.round(crateDistance), par: Math.ceil(raw / 5) * 5 };
}
