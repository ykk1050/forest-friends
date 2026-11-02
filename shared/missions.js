// 미션 묶음: 모둠(3~5명) / 짝(2명)
import { LEVELS } from './levels.js';
import { DUO_LEVELS } from './levels-duo.js';
import { PUZZLE_TEAM, PUZZLE_DUO } from './levels-puzzle.js';

// 각 30단계 + '수수께끼 숲' 퍼즐 6단계 = 36단계
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
  team: { name: '모둠 미션', short: '모둠', levels: mix(LEVELS, PUZZLE_TEAM) },
  duo: { name: '짝 미션', short: '짝', levels: mix(DUO_LEVELS, PUZZLE_DUO) }
};

// 예전 순서(앞 30단계 다음에 퍼즐 6단계)로 저장된 기록의 단계 번호 → 지금 번호
export const ORDER_VERSION = 2;
export function fromOldIndex(i) {
  const base = LEVELS.length;
  if (i >= base) return PUZZLE_SLOTS[i - base];
  return Array.from({ length: base + PUZZLE_SLOTS.length }, (_, k) => k).filter((k) => !PUZZLE_SLOTS.includes(k))[i];
}

export const levelsOf = (mode) => MODES[mode]?.levels || LEVELS;

// 학생(선생님 제외)이 딱 2명이면 짝 미션
export const modeFor = (students) => (students === 2 ? 'duo' : 'team');

export const levelCode = (i) => `${Math.floor(i / 6) + 1}-${(i % 6) + 1}`;
