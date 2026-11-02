import { test } from 'node:test';
import assert from 'node:assert/strict';
import TeamGame from '../server/TeamGame.js';
import { fromOldIndex } from '../shared/missions.js';
import { DUO_LEVELS } from '../shared/levels-duo.js';
import { homeRect } from '../shared/geometry.js';

function makeGame(n, level = 0, { teacher = false } = {}) {
  const events = [];
  const g = new TeamGame(1, (ev, data) => events.push([ev, data]));
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `학생${i}`);
  if (teacher) g.addPlayer('t', '선생님', { isTeacher: true });
  g.start(fromOldIndex(level));   // 예전 번호(퍼즐 섞기 전)로 고른 단계
  return { g, events, ps: [...g.players.values()] };
}
const run = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };

test('학생 2명이면 짝 미션, 3명이면 모둠 미션', () => {
  assert.equal(makeGame(2).g.mode, 'duo');
  assert.equal(makeGame(3).g.mode, 'team');
  assert.equal(makeGame(2, 0, { teacher: true }).g.mode, 'duo', '선생님이 함께해도 짝 미션 그대로');
});

test('짝 미션 기록은 모둠 미션 기록과 따로 저장', () => {
  const { g } = makeGame(2, 0);
  const h = homeRect(g.level.home);
  Object.assign(g.crate, { x: h.x, y: h.y });
  run(g, 0.1);
  assert.equal(g.progress.duo.unlocked, 1);
  assert.equal(g.progress.team.unlocked, 0);
});

test('꾹 발판: 누르는 동안만 문이 열리고, 문 사이에 있으면 안 닫힘', () => {
  const { g, ps } = makeGame(2, 2);
  const plate = g.plates.find((p) => p.type === 'hold');
  const door = g.level.gates[0].door;
  Object.assign(ps[0], { x: plate.x, y: plate.y });
  run(g, 0.1);
  assert.equal(g.gateOpen[0], true);
  Object.assign(ps[1], { x: door.x, y: door.y });   // 친구가 문 사이에
  Object.assign(ps[0], { x: 150, y: 600 });         // 발판에서 내려옴
  run(g, 0.1);
  assert.equal(g.gateOpen[0], true, '문 사이에 친구가 있으면 열린 채로');
  Object.assign(ps[1], { x: door.x + 120, y: door.y });
  run(g, 0.1);
  assert.equal(g.gateOpen[0], false, '아무도 없으면 닫힘');
});

test('호박은 동물이 밀 수 없음 (벽처럼 막힘)', () => {
  const { g, ps } = makeGame(2, 8);
  const pk = g.pumpkins[0];
  Object.assign(pk, { x: 300, y: 560 });   // 통나무가 닿지 않는 곳으로 옮겨 놓고 시험
  const before = { x: pk.x, y: pk.y };
  Object.assign(ps[0], { x: pk.x, y: pk.y - 60 });
  g.setInput('p0', { x: 0, y: 1, a: true });
  run(g, 1);
  assert.deepEqual({ x: pk.x, y: pk.y }, before);
  assert.ok(Math.hypot(ps[0].x - pk.x, ps[0].y - pk.y) >= pk.r + 17);
});

// 호박이 나오는 단계: 아무도 없어도 통나무·눈덩이가 호박을 밀어 움직이는지, 꾹 발판을 눌러 주는지
DUO_LEVELS.forEach((lv, i) => {
  if (!lv.pumpkins.length) return;
  test(`짝 ${Math.floor(i / 6) + 1}-${(i % 6) + 1} ${lv.name}: 호박이 밀려 움직임`, () => {
    const { g, ps } = makeGame(2, i);
    ps.forEach((p) => Object.assign(p, { x: 40, y: 40 + p.slot * 40 }));
    const start = g.pumpkins.map((p) => ({ x: p.x, y: p.y }));
    run(g, 15);
    g.pumpkins.forEach((p, k) => assert.ok(Math.hypot(p.x - start[k].x, p.y - start[k].y) > 40, `호박 ${k + 1}이 안 움직임`));
    for (const gi of lv.pumpkinHolds) assert.equal(g.gateOpen[gi], true, `호박이 문 ${gi + 1}번 꾹 발판을 눌러야 함`);
  });
});
