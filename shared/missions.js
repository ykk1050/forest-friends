// 미션 묶음: 모둠(3~5명) / 짝(2명)
import { LEVELS } from './levels.js';
import { DUO_LEVELS } from './levels-duo.js';
import { PUZZLE_TEAM, PUZZLE_DUO } from './levels-puzzle.js';
import { EXTRA_TEAM, EXTRA_DUO } from './levels-extra.js';
import { GIMMICK_TEAM, GIMMICK_DUO } from './levels-gimmick.js';
import { rng } from './variant.js';

// 각 30단계 + '수수께끼 숲' 퍼즐 6단계 = 36단계, 그 뒤에 '물안개 호수'·'비밀 섬' 12단계, '무지개 언덕' 6단계 = 54단계
// (새 단계들은 맨 뒤에 붙여서 이미 저장된 별·기록의 단계 번호가 그대로 맞음)
// 퍼즐 6단계는 순서(첫 퍼즐 → 마지막 퍼즐)는 지키면서 앞 30단계 사이 여기저기에 끼워 넣음.
// 자리는 정해진 씨앗으로 한 번만 섞어 늘 같음 → 단계 번호로 저장하는 별·기록이 어긋나지 않음
// (처음 3단계는 연습이라 빼고, 퍼즐끼리 바로 붙어 나오지 않게)
function puzzleSlots(total, count, seed) {
  let a = seed;
  const rand = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  for (;;) {
    const picks = new Set();
    while (picks.size < count) picks.add(3 + Math.floor(rand() * (total - 3)));
    const s = [...picks].sort((x, y) => x - y);
    if (s.every((v, i) => i === 0 || v - s[i - 1] > 1)) return s;
  }
}
export const PUZZLE_SLOTS = puzzleSlots(LEVELS.length + PUZZLE_TEAM.length, PUZZLE_TEAM.length, 20261102);
const mix = (base, puzzles) => {
  let b = 0, p = 0;
  return Array.from({ length: base.length + puzzles.length }, (_, i) => (PUZZLE_SLOTS.includes(i) ? puzzles[p++] : base[b++]));
};

export const MODES = {
  team: { name: '모둠 미션', short: '모둠', levels: [...mix(LEVELS, PUZZLE_TEAM), ...EXTRA_TEAM, ...GIMMICK_TEAM] },
  duo: { name: '짝 미션', short: '짝', levels: [...mix(DUO_LEVELS, PUZZLE_DUO), ...EXTRA_DUO, ...GIMMICK_DUO] }
};

// 예전 순서(앞 30단계 다음에 퍼즐 6단계)로 저장된 기록의 단계 번호 → 지금 번호
export const ORDER_VERSION = 2;
export function fromOldIndex(i) {
  const base = LEVELS.length;
  if (i >= base) return PUZZLE_SLOTS[i - base];
  return Array.from({ length: base + PUZZLE_SLOTS.length }, (_, k) => k).filter((k) => !PUZZLE_SLOTS.includes(k))[i];
}

// ---------- 방마다 다른 단계 순서 ----------
// MODES의 단계 번호(0~53)는 단계마다 늘 같은 '단계 고유 번호'이고, 별·기록은 이 번호로 저장함.
// 방 씨앗(seed)으로 순서를 섞어서, 같은 방이면 어느 모둠이든 같은 순서가 나옴.
//  1) 처음 3단계는 연습이라 고정
//  2) 쉬움(1) → 보통(2) → 어려움(3) 차례로
//  3) 처음 나오는 기믹은 소개 단계가 먼저, 수수께끼 숲 6단계는 원래 차례대로
//  4) 같은 기믹이 연달아 나오지 않게 (다른 규칙 때문에 어쩔 수 없을 때만 허용)
const EXTRA_START = LEVELS.length + PUZZLE_TEAM.length, GIMMICK_START = EXTRA_START + EXTRA_TEAM.length;
const TIER = {
  puzzle: [1, 2, 2, 2, 3, 3],
  extra: [2, 2, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3],
  gimmick: [2, 2, 2, 2, 3, 3],
  world: [1, 1, 2, 2, 3]     // 앞 30단계는 원래 마을로
};
const tierOf = (lv, id) => {
  if (id >= GIMMICK_START) return TIER.gimmick[id - GIMMICK_START];
  if (id >= EXTRA_START) return TIER.extra[id - EXTRA_START];
  const k = PUZZLE_SLOTS.indexOf(id);
  return k >= 0 ? TIER.puzzle[k] : TIER.world[lv.world];
};
const hasGate = (lv, test) => lv.gates.some((g) => test(g.plates));
const hasMover = (lv, ...kinds) => lv.movers.some((m) => kinds.includes(m.kind));
const TAGS = {
  swamp: (lv) => lv.swamps.length, code: (lv) => hasGate(lv, (p) => p.type === 'code' && !p.math), math: (lv) => hasGate(lv, (p) => p.math),
  lever: (lv) => lv.levers.length, strong: (lv) => lv.streams.some((s) => s.strong), tide: (lv) => lv.tides.length,
  color: (lv) => lv.colorDoors.length, scale: (lv) => hasGate(lv, (p) => p.type === 'scale'), pumpkin: (lv) => lv.pumpkins.length,
  bee: (lv) => hasMover(lv, 'bee'), log: (lv) => hasMover(lv, 'log'), roll: (lv) => hasMover(lv, 'snowball', 'rock'),
  ice: (lv) => lv.ice.length, mud: (lv) => lv.mud.length, stream: (lv) => lv.streams.length
};
const tagsOf = (lv) => Object.keys(TAGS).filter((k) => TAGS[k](lv));
// 기믹별 소개 단계 (이 단계가 나온 뒤에야 같은 기믹을 쓰는 단계가 나옴)
const INTRO = {
  swamp: PUZZLE_SLOTS[0], code: PUZZLE_SLOTS[1], lever: PUZZLE_SLOTS[2], strong: PUZZLE_SLOTS[3],
  color: GIMMICK_START, scale: GIMMICK_START + 1, tide: GIMMICK_START + 2, math: GIMMICK_START + 3
};
function buildOrder(levels, seed) {
  const rand = rng(seed), order = [0, 1, 2], placed = new Set(order);
  const tags = levels.map(tagsOf);
  const ready = (id) => tags[id].every((t) => !(t in INTRO) || INTRO[t] === id || placed.has(INTRO[t])) &&
    (PUZZLE_SLOTS.indexOf(id) < 1 || placed.has(PUZZLE_SLOTS[PUZZLE_SLOTS.indexOf(id) - 1]));
  for (const tier of [1, 2, 3]) {
    const pool = levels.map((_, id) => id).filter((id) => !placed.has(id) && tierOf(levels[id], id) === tier);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    while (pool.length) {
      const last = tags[order.at(-1)];
      const can = pool.filter(ready);
      const id = can.find((c) => !tags[c].some((t) => last.includes(t))) ?? can[0];
      pool.splice(pool.indexOf(id), 1);
      order.push(id);
      placed.add(id);
    }
  }
  return order;
}
const orders = new Map();
// 방 씨앗에 따른 순서 (차례 → 단계 고유 번호). 씨앗이 없으면 정해진 차례 그대로
export function orderOf(mode, seed) {
  const levels = MODES[mode]?.levels || LEVELS;
  if (seed == null) return levels.map((_, id) => id);
  const key = `${mode}:${seed}`;
  if (!orders.has(key)) {
    if (orders.size > 500) orders.clear();
    orders.set(key, buildOrder(levels, seed));
  }
  return orders.get(key);
}
export const levelsOf = (mode, seed) => {
  const levels = MODES[mode]?.levels || LEVELS;
  return seed == null ? levels : orderOf(mode, seed).map((id) => levels[id]);
};

// 학생(선생님 제외)이 딱 2명이면 짝 미션
export const modeFor = (students) => (students === 2 ? 'duo' : 'team');

export const levelCode = (i) => `${Math.floor(i / 6) + 1}-${(i % 6) + 1}`;
