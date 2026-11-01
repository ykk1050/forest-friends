// 미션 묶음: 모둠(3~5명) / 짝(2명)
import { LEVELS } from './levels.js';
import { DUO_LEVELS } from './levels-duo.js';
import { PUZZLE_TEAM, PUZZLE_DUO } from './levels-puzzle.js';

// 각 30단계 + 6번째 마을 '수수께끼 숲' 6단계 = 36단계
export const MODES = {
  team: { name: '모둠 미션', short: '모둠', levels: [...LEVELS, ...PUZZLE_TEAM] },
  duo: { name: '짝 미션', short: '짝', levels: [...DUO_LEVELS, ...PUZZLE_DUO] }
};

export const levelsOf = (mode) => MODES[mode]?.levels || LEVELS;

// 학생(선생님 제외)이 딱 2명이면 짝 미션
export const modeFor = (students) => (students === 2 ? 'duo' : 'team');

export const levelCode = (i) => `${Math.floor(i / 6) + 1}-${(i % 6) + 1}`;
