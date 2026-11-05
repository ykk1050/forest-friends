import { test } from 'node:test';
import assert from 'node:assert/strict';
import TeamGame from '../server/TeamGame.js';
import Room from '../server/Room.js';
import { MODES, orderOf, levelsOf, PUZZLE_SLOTS } from '../shared/missions.js';
import { analyzeLevel } from '../shared/solver.js';
import { makeVariant } from '../shared/variant.js';

const SEEDS = [1, 7, 1234, 987654, 2147483646];
const game = (seed, n = 3) => {
  const g = new TeamGame(1, () => {}, seed);
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `학생${i}`);
  return g;
};
const name = (l) => l.name.replace(' 둘이서', '');

for (const mode of Object.keys(MODES)) {
  test(`${MODES[mode].name}: 씨앗마다 규칙에 맞는 순서`, () => {
    const seen = new Set();
    for (const seed of SEEDS) {
      const order = orderOf(mode, seed), lv = levelsOf(mode, seed);
      assert.deepEqual([...order].sort((a, b) => a - b), MODES[mode].levels.map((_, i) => i), '모든 단계가 한 번씩');
      assert.deepEqual(order.slice(0, 3), [0, 1, 2], '처음 3단계는 고정');
      assert.deepEqual(orderOf(mode, seed), order, '같은 씨앗이면 같은 순서');
      seen.add(order.join());
      // 수수께끼 숲 6단계는 원래 차례대로
      const at = PUZZLE_SLOTS.map((id) => order.indexOf(id));
      assert.deepEqual(at, [...at].sort((a, b) => a - b), `씨앗 ${seed}: 퍼즐 순서`);
      // 소개 단계가 먼저
      const pos = (n2) => lv.findIndex((l) => name(l) === n2);
      for (const [intro, later] of [['색깔 문 릴레이', '썰물 릴레이'], ['밀물과 썰물', '썰물 릴레이'], ['저울 발판', '무지개 대작전'], ['수학 문', '무지개 대작전'], ['망루 길잡이', '늪 건너 발판'], ['다리 레버', '두 개의 다리']]) {
        assert.ok(pos(intro) < pos(later), `씨앗 ${seed}: ${intro} → ${later}`);
      }
      // 합동 단계는 뒤쪽
      assert.ok(pos('무지개 대작전') >= lv.length - 18, `씨앗 ${seed}: 대작전이 너무 앞`);
    }
    assert.ok(seen.size >= SEEDS.length - 1, '씨앗이 달라도 순서가 그대로');
  });
}

test('씨앗이 없으면 지금까지의 정해진 순서', () => {
  assert.deepEqual(levelsOf('team'), MODES.team.levels);
});

test('같은 방이면 인원이 달라도 단계 내용과 암호가 같고, 다른 방이면 달라짐', () => {
  const id = levelsOf('team', 5).findIndex((l) => l.name === '수학 문');
  const a = game(5, 3), b = game(5, 5), c = game(6, 3);
  a.start(id); b.start(id);
  assert.equal(a.level.name, '수학 문');
  assert.equal(JSON.stringify({ ...a.level, variant: 0 }), JSON.stringify({ ...b.level, variant: 0 }));
  assert.deepEqual(a.codes[0], b.codes[0]);
  c.start(levelsOf('team', 6).findIndex((l) => l.name === '수학 문'));
  assert.notEqual(JSON.stringify({ ...a.level, variant: 0 }), JSON.stringify({ ...c.level, variant: 0 }));
});

test('방 변형은 나올 수 있는 인원 모두 풀 수 있음', () => {
  for (const [mode, sizes] of [['team', [1, 3, 4, 5, 6]], ['duo', [2, 3]]]) {
    MODES[mode].levels.forEach((lv) => {
      const v = makeVariant(lv, sizes, 4242);
      for (const n of sizes) {
        const r = analyzeLevel(v, Math.max(n, lv.minPlayers || 1));
        assert.ok(r.ok, `${lv.name} ${n}명: ${r.reason}`);
      }
    });
  }
});

test('별은 단계에 붙어서, 순서가 다른 방에서도 그 단계에 남음', () => {
  const a = game(11);
  const i = levelsOf('team', 11).findIndex((l) => l.name === '저울 발판');
  a.start(i);
  a.finishLevel();
  assert.equal(a.progressInfo('team').best[i].stars >= 1, true);
  const b = game(22);
  b.setProgress(JSON.parse(JSON.stringify(a.progress)));
  const j = levelsOf('team', 22).findIndex((l) => l.name === '저울 발판');
  assert.notEqual(i, j);
  assert.deepEqual(b.progressInfo('team').best[j], a.progressInfo('team').best[i]);
  assert.deepEqual(Object.keys(b.progressInfo('team').best), [String(j)]);
});

test('방의 모든 모둠이 같은 씨앗을 쓰고, 서버가 다시 켜져도 씨앗을 이어받음', () => {
  const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
  const room = new Room(io, '1234');
  assert.ok(room.teams.every((t) => t.seed === room.seed));
  const again = new Room(io, '1234', room.token, room.seed);
  assert.deepEqual(orderOf('team', again.teams[0].seed), orderOf('team', room.seed));
});
