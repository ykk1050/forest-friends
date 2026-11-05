import { test } from 'node:test';
import assert from 'node:assert/strict';
import TeamGame from '../server/TeamGame.js';
import { levelsOf } from '../shared/missions.js';

function makeGame(n, name) {
  const events = [];
  const g = new TeamGame(1, (ev, data) => events.push([ev, data]));
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `학생${i}`);
  g.start(levelsOf(n === 2 ? 'duo' : 'team').findIndex((l) => l.name.replace(' 둘이서', '') === name));
  return { g, events, ps: [...g.players.values()] };
}
const run = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };
const fx = (events, type) => events.filter(([e, d]) => e === 'fx' && d.type === type);
const walkTo = (g, p, id, q) => {
  for (let i = 0; i < 40; i++) {
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    g.setInput(id, { x: dx / d, y: dy / d, a: false }); run(g, 0.05);
  }
  g.setInput(id, { x: 0, y: 0, a: false });
};

test('색깔 문: 앞 문일수록 많이 지나가고, 혼자 남으면 모두 열림', () => {
  const { g, ps } = makeGame(3, '색깔 문 릴레이');
  assert.deepEqual(g.colorAllowed(), [[ps[1].slot, ps[2].slot], [ps[2].slot]]);
  g.setConnected('p2', false);
  assert.deepEqual(g.colorAllowed(), [[ps[1].slot], [ps[1].slot]]);
  g.setConnected('p1', false);
  assert.deepEqual(g.colorAllowed(), [[ps[0].slot], [ps[0].slot]]);
  assert.equal(g.colorDoorsFor(ps[0]).length, 0);
});

test('색깔 문: 구슬 색이 아닌 친구는 막히고, 맞는 친구와 바구니는 지나감', () => {
  const { g, ps } = makeGame(3, '색깔 문 릴레이');
  const d = g.level.colorDoors.reduce((a, b) => (Math.abs(a.x - g.level.start.x) < Math.abs(b.x - g.level.start.x) ? a : b));
  const first = g.level.colorDoors.indexOf(d);
  const side = Math.sign(g.level.home.x - d.x);
  const before = { x: d.x - side * 60, y: d.y }, after = { x: d.x + side * 60, y: d.y };
  Object.assign(g.crate, { x: 1200, y: 60 });
  const blocked = ps.find((p) => !g.colorAllowed()[first].includes(p.slot));
  const passes = ps.find((p) => g.colorAllowed()[first].includes(p.slot));
  Object.assign(blocked, before);
  Object.assign(passes, { ...before, y: d.y + 40 });
  walkTo(g, blocked, `p${ps.indexOf(blocked)}`, after);
  walkTo(g, passes, `p${ps.indexOf(passes)}`, { ...after, y: d.y + 40 });
  assert.ok((blocked.x - d.x) * side < 0, '못 지나가는 친구가 지나감');
  assert.ok((passes.x - d.x) * side > 0, '지나갈 친구가 막힘');
  Object.assign(g.crate, { x: before.x, y: d.y, vx: side * 200, vy: 0 });
  for (let i = 0; i < 20; i++) g.moveCrate(0.05);
  assert.ok((g.crate.x - d.x) * side > 0, '바구니가 막힘');
});

test('저울: 짝수는 나눠 서면, 홀수는 바구니까지 올려야 문이 열림', () => {
  const two = makeGame(2, '저울 발판');
  const s2 = two.g.level.gates[0].plates;
  Object.assign(two.ps[0], { x: s2.left.x, y: s2.left.y }); run(two.g, 0.1);
  assert.equal(two.g.gateOpen[0], false, '한쪽만 서면 안 열림');
  Object.assign(two.ps[1], { x: s2.right.x, y: s2.right.y }); run(two.g, 0.1);
  assert.equal(two.g.gateOpen[0], true);

  const three = makeGame(3, '저울 발판');
  const s3 = three.g.level.gates[0].plates;
  Object.assign(three.g.crate, { x: 700, y: 360 });
  Object.assign(three.ps[0], { x: s3.left.x - 40, y: s3.left.y });
  Object.assign(three.ps[1], { x: s3.left.x + 40, y: s3.left.y });
  Object.assign(three.ps[2], { x: s3.right.x - 60, y: s3.right.y }); run(three.g, 0.1);
  assert.equal(three.g.gateOpen[0], false, '2 : 1 이면 안 열림');
  Object.assign(three.g.crate, { x: s3.right.x + 50, y: s3.right.y }); run(three.g, 0.1);
  assert.deepEqual(three.g.scales[0], [2, 2]);
  assert.equal(three.g.gateOpen[0], true);
});

test('밀물: 썰물엔 안전, 물이 차면 친구는 처음 자리로, 바구니는 빠짐', () => {
  const { g, ps, events } = makeGame(2, '밀물과 썰물');
  const t = g.level.tides[0];
  Object.assign(ps[0], { x: t.x, y: t.y });
  run(g, 1);
  assert.equal(fx(events, 'oops').length, 0);
  assert.equal(g.tideState(), 0);
  Object.assign(g.crate, { x: t.x, y: 120, vx: 0, vy: 0 });
  g.clock = 6100; run(g, 0.2);
  assert.equal(g.tideState(), 1);
  g.clock = 8100; ps[0].safeUntil = 0;
  run(g, 0.2);
  assert.equal(g.tideState(), 2);
  assert.equal(fx(events, 'oops')[0][1].cause, 'water');
  assert.equal(fx(events, 'crateSplash').length, 1);
  assert.equal(fx(events, 'crateSplash')[0][1].hole, false);
});

test('수학 문: 발판 숫자가 서로 다르고, 문제의 답을 차례로 밟으면 열림', () => {
  const { g, ps } = makeGame(3, '수학 문');
  const spec = g.level.gates[0].plates, cd = g.codes[0];
  assert.equal(new Set(cd.nums).size, spec.pads.length);
  cd.qs.forEach((q, k) => {
    const [, a, op, b] = q.match(/(\d+) (.) (\d+)/);
    assert.equal(op === '×' ? a * b : a - b, cd.nums[cd.seq[k]], q);
  });
  Object.assign(ps[0], spec.booth.pad); run(g, 0.05);
  Object.assign(ps[0], { x: spec.sign.x, y: spec.sign.y }); run(g, 0.05);
  const away = { x: 600, y: 360 };
  for (const sym of cd.seq) {
    const pad = spec.pads.find((p) => p.sym === sym);
    Object.assign(ps[1], { x: pad.x, y: pad.y }); run(g, 0.1);
    Object.assign(ps[1], away); run(g, 0.1);
  }
  assert.equal(g.gateOpen[0], true);
  assert.equal(g.snapshot().cd[0][5].length, 3);
});

test('색깔 문 릴레이: 뒤 친구가 문까지 밀면 앞 친구가 이어받아 끌고 감', () => {
  const { g, ps } = makeGame(2, '색깔 문 릴레이');
  const first = g.level.colorDoors.reduce((a, b) => (Math.abs(a.x - g.level.start.x) < Math.abs(b.x - g.level.start.x) ? a : b));
  const side = Math.sign(g.level.home.x - first.x), c = g.crate;
  const [back, front] = [...ps].sort((a, b) => a.slot - b.slot);
  const id = (p) => `p${ps.indexOf(p)}`;
  Object.assign(c, { x: first.x - side * 150, y: first.y });
  Object.assign(back, { x: c.x - side * 60, y: c.y });
  Object.assign(front, { x: first.x + side * 200, y: first.y });
  g.setInput(id(back), { x: side, y: 0, a: true });
  run(g, 3);
  assert.ok((c.x - first.x) * side > 30, `뒤 친구가 문까지 못 밀음: ${c.x}`);
  g.setInput(id(back), { x: 0, y: 0, a: false });
  Object.assign(front, { x: c.x + side * 60, y: c.y });
  g.setInput(id(front), { x: side, y: 0, a: true });
  const x0 = c.x;
  run(g, 1.5);
  assert.ok((c.x - x0) * side > 100, '앞 친구가 못 끌고 감');
});
