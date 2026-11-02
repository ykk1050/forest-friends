import { test } from 'node:test';
import assert from 'node:assert/strict';
import TeamGame from '../server/TeamGame.js';
import { LEVELS } from '../shared/levels.js';
import { homeRect, hazardPos } from '../shared/geometry.js';

function makeGame(n, level = 0) {
  const events = [];
  const g = new TeamGame(1, (ev, data) => events.push([ev, data]));
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `학생${i}`);
  g.start(level);
  return { g, events, ps: [...g.players.values()] };
}
const run = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };
const fx = (events, type) => events.filter(([e, d]) => e === 'fx' && d.type === type);

test('바구니 무게: 가벼움 1명, 보통 절반, 무거움 전원', () => {
  assert.equal(makeGame(4, 0).g.need(), 1);
  assert.equal(makeGame(4, 1).g.need(), 2);
  assert.equal(makeGame(4, 11).g.need(), 4);
});

test('필요 인원보다 적게 밀면 안 움직이고, 충분하면 움직임', () => {
  const { g, ps } = makeGame(4, 1);
  const c = g.crate;
  ps.forEach((p, i) => Object.assign(p, { x: c.x - 60, y: c.y - 20 + i * 15 }));
  g.setInput('p0', { x: 1, y: 0, a: true });
  const x0 = c.x;
  run(g, 0.5);
  assert.equal(Math.round(c.x), Math.round(x0));
  g.setInput('p1', { x: 1, y: 0.2, a: true });
  run(g, 0.5);
  assert.ok(c.x > x0 + 30);
});

test('바구니를 잡고 밀면 잡은 면 방향으로만 밀리고, 동물도 그쪽만 바라봄', () => {
  const { g, ps } = makeGame(1, 0);
  const c = g.crate, p = ps[0];
  Object.assign(p, { x: c.x - 60, y: c.y });
  const y0 = c.y, py0 = p.y;
  g.setInput('p0', { x: 0.8, y: 0.6, a: true });   // 비스듬히 밀어도
  run(g, 0.5);
  assert.equal(Math.round(c.y), Math.round(y0));    // 바구니는 옆으로 안 미끄러짐
  assert.ok(Math.abs(p.y - py0) < 1);
  assert.deepEqual([p.fx, p.fy], [1, 0]);
  g.setInput('p0', { x: 0, y: 1, a: true });       // 잡은 채로 옆으로 꺾어도 안 돌아감
  run(g, 0.3);
  assert.deepEqual([p.fx, p.fy], [1, 0]);
  g.setInput('p0', { x: 0, y: 1, a: false });      // 놓으면 다시 자유롭게
  run(g, 0.1);
  assert.deepEqual([p.fx, p.fy], [0, 1]);
});

test('기록 초기화: 별·열린 단계가 지워지고 대기실 1-1로', () => {
  const { g } = makeGame(3, 4);
  g.progress.team.best[0] = { stars: 3, time: 10 };
  g.unlockAll();
  g.resetProgress();
  assert.equal(g.status, 'lobby');
  assert.deepEqual(g.progress.team, { unlocked: 0, best: {} });
  assert.deepEqual(g.current, { team: 0, duo: 0 });
});

test('모두 발판을 밟으면 문이 열림', () => {
  const { g, ps, events } = makeGame(3, 2);
  g.plates.forEach((pl, i) => Object.assign(ps[i], { x: pl.x, y: pl.y }));
  run(g, 0.1);
  assert.equal(g.gateOpen[0], true);
  assert.equal(fx(events, 'door').length, 1);
});

test('물에 빠지면 처음 자리로 돌아가고 실수 +1, 잠깐 무적', () => {
  const { g, ps, events } = makeGame(3, 6);
  const w = g.level.water[0];
  Object.assign(ps[0], { x: w.x, y: w.y });
  run(g, 0.05);
  assert.equal(g.mistakes, 1);
  assert.ok(Math.hypot(ps[0].x - g.level.start.x, ps[0].y - g.level.start.y) < 60);
  assert.equal(fx(events, 'oops')[0][1].cause, 'water');
  Object.assign(ps[0], { x: w.x, y: w.y });
  run(g, 0.05);
  assert.equal(g.mistakes, 1, '무적 시간에는 다시 안 걸림');
});

test('꿀벌에 닿으면 처음 자리로', () => {
  const { g, ps } = makeGame(3, 12);
  const pos = hazardPos(g.level.movers[0], g.clock);
  Object.assign(ps[1], { x: pos.x, y: pos.y });
  run(g, 0.05);
  assert.equal(g.mistakes, 1);
});

test('딸기 3개 + 빨리 깨면 별 3개, 기록 저장·다음 단계 열림', () => {
  const { g, ps, events } = makeGame(3, 0);
  g.level.berries.forEach(([x, y]) => { Object.assign(ps[0], { x, y }); run(g, 0.05); });
  const h = homeRect(g.level.home);
  Object.assign(g.crate, { x: h.x, y: h.y });
  run(g, 0.1);
  assert.equal(g.status, 'result');
  assert.equal(g.result.stars, 3);
  assert.equal(g.progress.team.unlocked, 1);
  assert.equal(g.progress.team.best[0].stars, 3);
  g.choose('p0', 'retry');
  assert.equal(g.status, 'playing');
  assert.equal(g.levelIndex, 0);
  assert.ok(events.some(([e]) => e === 'result'));
});

test('결과 화면은 시간이 지나면 다음 단계로', () => {
  const { g } = makeGame(3, 0);
  const h = homeRect(g.level.home);
  Object.assign(g.crate, { x: h.x, y: h.y });
  run(g, 0.1);
  run(g, 13);
  assert.equal(g.levelIndex, 1);
  assert.equal(g.status, 'playing');
});

test('선생님이 함께하면 꽉 찬 모둠에도 들어가고, 부엉이가 됨', () => {
  const { g } = makeGame(5, 2);
  assert.ok(g.isFull());
  const t = g.addPlayer('teacher', '선생님', { isTeacher: true });
  assert.equal(t.animal, 'owl');
  assert.equal(g.size, 6);
  assert.equal(g.plates.length, 6, '발판도 6개로');
});

test('무거운 바구니: 끊긴 친구는 빼고 연결된 친구만 다 밀면 움직임', () => {
  const { g, ps } = makeGame(4, 11);
  const c = g.crate;
  ps.forEach((p, i) => Object.assign(p, { x: c.x - 60, y: c.y - 20 + i * 15 }));
  g.setConnected('p3', false);
  assert.equal(g.need(), 3);
  ['p0', 'p1', 'p2'].forEach((id) => g.setInput(id, { x: 1, y: 0, a: true }));
  const x0 = c.x;
  run(g, 0.5);
  assert.ok(c.x > x0 + 30);
  g.setConnected('p3', true);
  assert.equal(g.need(), 4);
});

test('도중에 한 명이 나가면 발판 수가 줄어듦', () => {
  const { g } = makeGame(4, 2);
  g.removePlayer('p3');
  assert.equal(g.plates.length, 3);
});

test('도중에 한 명이 끊기면 발판 수가 줄고, 돌아오면 다시 늘어남', () => {
  const { g, ps, events } = makeGame(3, 2);
  g.setConnected('p2', false);
  assert.equal(g.plates.length, 2);
  g.plates.forEach((pl, i) => Object.assign(ps[i], { x: pl.x, y: pl.y }));
  run(g, 0.1);
  assert.equal(g.gateOpen[0], true);
  assert.ok(events.some(([e]) => e === 'level'));
  g.setConnected('p2', true);
  assert.equal(g.plates.length, 3);
});

test('물살: 바구니를 잡은 친구는 떠내려가지 않음', () => {
  const { g, ps } = makeGame(1, 7);
  const s = g.level.streams[0];
  const dirX = Math.sign(s.x - 640) || 1;          // 뒤집혀 있어도 물살 옆에서
  Object.assign(g.crate, { x: s.x + 60 * dirX, y: 360 });
  g.gateOpen[0] = true;
  Object.assign(ps[0], { x: g.crate.x - 60 * dirX, y: 360 });
  g.setInput('p0', { x: 0, y: 0, a: true });
  run(g, 0.5);
  assert.ok(Math.abs(ps[0].y - 360) < 3, `잡고 있으면 그대로 (y=${ps[0].y})`);
  g.setInput('p0', { x: 0, y: 0, a: false });
  run(g, 0.5);
  assert.ok(Math.abs(ps[0].y - 360) > 20, '놓으면 떠내려감');
});
