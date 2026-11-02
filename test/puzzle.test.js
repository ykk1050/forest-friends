import { test } from 'node:test';
import assert from 'node:assert/strict';
import TeamGame from '../server/TeamGame.js';
import { levelsOf, fromOldIndex, PUZZLE_SLOTS } from '../shared/missions.js';

const base = 30; // 수수께끼 숲 6-1 = 31번째
function makeGame(n, k) {
  const events = [];
  const g = new TeamGame(1, (ev, data) => events.push([ev, data]));
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `학생${i}`);
  g.start(fromOldIndex(base + k));
  return { g, events, ps: [...g.players.values()] };
}
const run = (g, sec) => { for (let i = 0; i < sec * 20; i++) g.tick(0.05); };
const fx = (events, type) => events.filter(([e, d]) => e === 'fx' && d.type === type);

test('수수께끼 숲은 모둠·짝 모두 6단계, 2명 이상', () => {
  for (const mode of ['team', 'duo']) {
    const lv = levelsOf(mode).filter((l) => l.world === 5);
    assert.equal(lv.length, 6);
    assert.ok(lv.every((l) => l.minPlayers === 2));
  }
});

test('수수께끼 숲 6단계는 순서대로, 앞 단계들 사이에 섞여 나옴 (처음 3단계·연달아는 없음)', () => {
  for (const mode of ['team', 'duo']) {
    const at = levelsOf(mode).map((l, i) => (l.world === 5 ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(at, PUZZLE_SLOTS);
    assert.ok(at[0] >= 3 && at.at(-1) < 35);
    assert.ok(at.every((v, i) => i === 0 || v - at[i - 1] > 1));
    assert.deepEqual(at.map((i) => levelsOf(mode)[i].name.replace(' 둘이서', '')),
      ['망루 길잡이', '그림 암호 문', '다리 레버', '물살 멈추기', '망루와 암호', '수수께끼 숲 대작전']);
  }
});

test('퍼즐을 섞기 전에 저장한 기록은 같은 단계로 옮겨서 되살림', () => {
  const g = new TeamGame(1, () => {});
  g.addPlayer('p0', '학생0');
  // 예전 번호: 2번 = 1-3, 30번 = 첫 퍼즐, 열린 단계 = 31번(두 번째 퍼즐)
  g.setProgress({ team: { unlocked: 31, best: { 2: { stars: 3, time: 10 }, 30: { stars: 2, time: 20 } } } });
  const lv = levelsOf('team');
  const pr = g.progress.team;
  assert.equal(lv[pr.unlocked].name, '그림 암호 문');
  const names = Object.keys(pr.best).map((i) => lv[i].name).sort();
  assert.deepEqual(names, [lv[2].name, '망루 길잡이'].sort());
  // 지금 형식으로 저장한 기록은 그대로
  g.setProgress({ team: { ...pr } });
  assert.deepEqual(g.progress.team.best, pr.best);
});

test('안개 늪: 징검다리는 안전, 다른 칸은 빠져서 처음 자리로', () => {
  const { g, ps } = makeGame(3, 0);
  const [c, r] = g.level.swamps[0].tiles[3];
  const safe = { x: c * 80 + 40, y: r * 80 + 40 }, bad = g.level.swampCells[0];
  Object.assign(ps[0], safe);                  // 징검다리
  Object.assign(ps[1], { x: bad.x, y: bad.y }); // 늪
  run(g, 0.05);
  assert.equal(g.mistakes, 1);
  assert.ok(Math.abs(ps[0].x - safe.x) < 10, '징검다리 위는 그대로');
});

test('그림 암호: 표지판에 아무도 없으면 발판이 안 눌림', () => {
  const { g, ps, events } = makeGame(3, 1);
  const spec = g.level.gates[0].plates, cd = g.codes[0];
  const pad = spec.pads.find((p) => p.sym === cd.seq[0]);
  Object.assign(ps[1], { x: pad.x, y: pad.y });
  run(g, 0.1);
  assert.equal(cd.got, 0);
  assert.equal(fx(events, 'codeNoReader').length, 1);
});

test('그림 암호: 표지판 친구 + 순서대로 밟으면 문이 열림, 틀리면 처음부터', () => {
  const { g, ps, events } = makeGame(3, 1);
  const spec = g.level.gates[0].plates, cd = g.codes[0];
  Object.assign(ps[0], spec.booth.pad); run(g, 0.05);                      // 얼굴 발판 → 오두막 주인
  Object.assign(ps[0], { x: spec.sign.x, y: spec.sign.y }); run(g, 0.05);   // 오두막 안으로
  const padOf = (sym) => spec.pads.find((p) => p.sym === sym);
  const away = { x: 600, y: 360 };
  // 틀린 그림 먼저
  const wrong = spec.pads.find((p) => p.sym !== cd.seq[0]);
  Object.assign(ps[1], wrong); run(g, 0.1); Object.assign(ps[1], away); run(g, 0.1);
  assert.equal(fx(events, 'codeWrong').length, 1);
  for (const sym of cd.seq) { Object.assign(ps[1], padOf(sym)); run(g, 0.1); Object.assign(ps[1], away); run(g, 0.1); }
  assert.equal(g.gateOpen[0], true);
  // 암호를 맞히면 오두막 문이 열려 갇혔던 친구가 걸어 나올 수 있음
  assert.equal(fx(events, 'boothOpen').length, 1);
  const b = spec.booth, inRoom = (p) => Math.abs(p.x - b.room.x) < b.room.w / 2 && Math.abs(p.y - b.room.y) < b.room.h / 2;
  for (let i = 0; i < 60 && inRoom(ps[0]); i++) {
    const dx = b.pad.x - ps[0].x, dy = b.pad.y - ps[0].y, d = Math.hypot(dx, dy) || 1;
    g.setInput('p0', { x: dx / d, y: dy / d, a: false }); run(g, 0.05);
  }
  assert.equal(inRoom(ps[0]), false);
});

test('그림 암호 오두막: 얼굴 발판을 먼저 밟은 한 명만 들어가고, 들어가면 못 나옴', () => {
  const { g, ps, events } = makeGame(3, 1);
  const b = g.level.gates[0].plates.booth, cd = g.codes[0];
  const inRoom = (p) => Math.abs(p.x - b.room.x) < b.room.w / 2 && Math.abs(p.y - b.room.y) < b.room.h / 2;
  const toward = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1; return { x: dx / d, y: dy / d, a: false }; };
  // 다른 친구는 문 앞에서 막힘
  Object.assign(ps[1], b.pad);
  run(g, 0.05);
  assert.equal(cd.owner, 'p1');
  assert.equal(fx(events, 'boothClaim').length, 1);
  Object.assign(ps[0], { x: b.pad.x + 50, y: b.pad.y });
  Object.assign(ps[1], { x: 640, y: 360 });       // 주인이 발판에서 멀어지면 자리를 내놓음
  run(g, 0.05);
  assert.equal(cd.owner, null);
  Object.assign(ps[0], b.pad);                     // 이번엔 p0이 주인
  run(g, 0.05);
  assert.equal(cd.owner, 'p0');
  Object.assign(ps[1], { x: b.pad.x + 40, y: b.pad.y });
  for (let i = 0; i < 40; i++) { g.setInput('p1', toward(ps[1], b.room)); run(g, 0.05); }
  assert.equal(inRoom(ps[1]), false);
  // 주인은 걸어서 들어감
  for (let i = 0; i < 40 && !inRoom(ps[0]); i++) { g.setInput('p0', toward(ps[0], b.room)); run(g, 0.05); }
  assert.equal(inRoom(ps[0]), true);
  assert.equal(cd.sealed, true);
  run(g, 0.3);
  assert.equal(cd.reader, true);
  // 들어간 뒤에는 나오려 해도 못 나옴
  for (let i = 0; i < 40; i++) { g.setInput('p0', toward(ps[0], b.pad)); run(g, 0.05); }
  assert.equal(inRoom(ps[0]), true);
  // 다른 친구를 안에 옮겨 놓아도 처음 자리로
  Object.assign(ps[2], { x: b.room.x + 30, y: b.room.y });
  run(g, 0.05);
  assert.equal(inRoom(ps[2]), false);
});

test('그림 암호 오두막: 들어간 주인이 끊기면 다른 친구가 맡을 수 있음', () => {
  const { g, ps } = makeGame(3, 1);
  const b = g.level.gates[0].plates.booth, cd = g.codes[0];
  Object.assign(ps[0], b.pad); run(g, 0.05);
  Object.assign(ps[0], { x: b.room.x, y: b.room.y }); run(g, 0.05);
  assert.equal(cd.sealed, true);
  g.setConnected('p0', false); run(g, 0.05);
  assert.equal(cd.owner, null);
  Object.assign(ps[1], b.pad); run(g, 0.05);
  assert.equal(cd.owner, 'p1');
});

test('새 단계를 시작하면 지난 단계의 깜빡임(무적)이 남지 않음', () => {
  const { g, ps } = makeGame(3, 1);
  ps[0].safeUntil = 99999;
  g.loadLevel(fromOldIndex(base + 2));
  assert.equal(ps[0].safeUntil, 0);
});

test('그림 암호는 도전할 때마다 바뀜', () => {
  const { g } = makeGame(3, 4);
  const seen = new Set();
  for (let i = 0; i < 8; i++) { g.loadLevel(fromOldIndex(base + 4)); seen.add(g.codes[0].seq.join()); }
  assert.ok(seen.size > 1);
});

test('레버: 잡기를 누르고 있는 동안만 다리, 다리 위에 누가 있으면 안 사라짐', () => {
  const { g, ps } = makeGame(3, 2);
  const lv = g.level.levers[0], br = g.level.bridges[0];
  run(g, 0.05);
  assert.equal(g.bridgeOn, false);
  Object.assign(ps[0], { x: lv.x, y: lv.y });
  run(g, 0.05);
  assert.equal(g.bridgeOn, false, '다가가기만 해서는 안 당겨짐');
  g.setInput('p0', { x: 0, y: 0, a: true });
  run(g, 0.05);
  assert.equal(g.bridgeOn, true);
  Object.assign(ps[1], { x: br.x, y: br.y });   // 다리 위
  g.setInput('p0', { x: 0, y: 0, a: false });   // 레버를 놓음
  run(g, 0.1);
  assert.equal(g.bridgeOn, true, '다리 위 친구가 빠지지 않게');
  assert.equal(g.mistakes, 0);
  Object.assign(ps[1], { x: 900, y: 200 });
  run(g, 0.1);
  assert.equal(g.bridgeOn, false);
});

test('센 물살: 바구니가 떠내려가 연못에 빠지면 처음 자리로, 레버를 잡으면 멈춤', () => {
  const { g, ps, events } = makeGame(3, 3);
  const st = g.level.streams[0];
  ps.forEach((p) => Object.assign(p, { x: 20, y: 20 }));
  Object.assign(g.crate, { x: st.x, y: 360 });
  run(g, 3);
  assert.equal(fx(events, 'crateSplash').length, 1);
  assert.equal(g.crate.x, g.level.crate.x);
  const lv = g.level.levers[0];
  Object.assign(ps[0], { x: lv.x, y: lv.y });
  g.setInput('p0', { x: 0, y: 0, a: true });
  Object.assign(g.crate, { x: st.x, y: 360 });
  run(g, 2);
  assert.equal(Math.round(g.crate.y), 360, '레버를 잡고 있으면 물살이 멈춤');
});
