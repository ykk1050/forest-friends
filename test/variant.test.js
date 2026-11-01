import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, levelCode } from '../shared/missions.js';
import { makeVariant, mirrorLevel } from '../shared/variant.js';
import { analyzeLevel } from '../shared/solver.js';

// 다시 할 때마다 바뀌는 변형도 모두 풀 수 있어야 함 (단계마다 무작위 8가지)
for (const [mode, { name, levels }] of Object.entries(MODES)) {
  test(`${name}: 모든 단계의 무작위 변형 8가지가 풀 수 있음`, () => {
    const n = mode === 'duo' ? 2 : 3;
    levels.forEach((lv, i) => {
      for (let s = 1; s <= 8; s++) {
        const v = makeVariant(lv, n, 1000 * i + s);
        const r = analyzeLevel(v, Math.max(n, lv.minPlayers || 1));
        assert.ok(r.ok, `${levelCode(i)} ${lv.name} 변형 ${s}: ${r.reason}`);
      }
    });
  });
}

test('뒤집기 4가지 모두 풀 수 있음 (모둠 미션 전체)', () => {
  for (const lv of MODES.team.levels) for (const [fx, fy] of [[1, 0], [0, 1], [1, 1]]) {
    const r = analyzeLevel(mirrorLevel(lv, fx, fy), Math.max(3, lv.minPlayers || 1));
    assert.ok(r.ok, `${lv.name} 뒤집기 ${fx}${fy}: ${r.reason}`);
  }
});

test('같은 단계라도 도전할 때마다 달라짐', () => {
  const lv = MODES.team.levels[30];   // 망루 길잡이
  const seen = new Set();
  for (let s = 1; s <= 10; s++) {
    const v = makeVariant(lv, 3, s);
    seen.add(JSON.stringify([v.start, v.berries, v.swamps[0].tiles]));
  }
  assert.ok(seen.size >= 8, `10번 중 ${seen.size}가지`);
});
