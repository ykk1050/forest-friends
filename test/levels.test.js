import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, levelCode } from '../shared/missions.js';
import { analyzeLevel } from '../shared/solver.js';
import { FIELD } from '../shared/constants.js';

// 모둠 미션은 1·3·5명 + 선생님(6명), 짝 미션은 2명 + 선생님(3명)
const SIZES = { team: [1, 3, 5, 6], duo: [2, 3] };

for (const [mode, { name, levels }] of Object.entries(MODES)) {
  test(`${name}은 48단계 (마을 8개)`, () => assert.equal(levels.length, 48));

  levels.forEach((lv, i) => {
    test(`${name} ${levelCode(i)} ${lv.name}: ${SIZES[mode].join('·')}명 모두 풀 수 있음`, () => {
      for (const n of SIZES[mode].filter((k) => k >= (lv.minPlayers || 1))) {
        const r = analyzeLevel(lv, n);
        assert.ok(r.ok, `${n}명: ${r.reason}`);
      }
      assert.equal(lv.berries.length, 3);
      for (const m of lv.movers) for (const [x, y] of m.path) {
        assert.ok(x >= 0 && x <= FIELD.w && y >= 0 && y <= FIELD.h, '장애물 길이 맵 밖');
      }
    });
  });

  test(`${name} 목표 시간 목록`, () => {
    console.log(levels.map((lv, i) => `${levelCode(i)} ${lv.name}: ${analyzeLevel(lv, SIZES[mode][mode === 'duo' ? 0 : 1]).par}초`).join('\n'));
  });
}
