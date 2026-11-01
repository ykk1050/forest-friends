// 시연용 로봇 학생: 스스로 방을 만들고 1모둠에 로봇 N명을 넣어 게임을 플레이합니다.
// 사용: node scripts/demo-bots.mjs [로봇 수=3] [주소=http://localhost:3100] [시작 단계=1]   (로봇 2명이면 짝 미션)
// 실행하면 관전 주소가 출력되고 8초 뒤 시작. 결과 화면이 나오면 자동으로 다음 단계로 넘어갑니다.
import { io } from 'socket.io-client';
import { levelsOf } from '../shared/missions.js';
import { buildGrid, findPath } from '../shared/grid.js';
import { homeRect } from '../shared/geometry.js';

const N = +(process.argv[2] || 3);
const URL = process.argv[3] || 'http://localhost:3100';
const START = Math.max(1, +(process.argv[4] || 1)) - 1;
const NAMES = ['로봇곰', '로봇토끼', '로봇여우', '로봇판다', '로봇펭귄'];
const ANIMALS = ['bear', 'rabbit', 'fox', 'panda', 'penguin'];
const HALF = 40, R = 18;

const teacher = io(URL);
const { code } = await new Promise((r) => teacher.emit('teacher:create', null, r));
console.log(`방 코드 ${code}`);
console.log(`관전 주소: ${URL}/?watch=${code}&team=1`);

let info = null, state = null;
const bots = [];
for (let i = 0; i < N; i++) {
  const s = io(URL, { forceNew: true });
  const res = await new Promise((r) => s.emit('student:join', { code, name: NAMES[i], team: 1 }, r));
  s.slot = res.slot;
  s.emit('student:animal', ANIMALS[i % 5]);
  Object.assign(s, { path: null, pathAt: 0, goal: null, stuck: 0, last: null, jitterUntil: 0 });
  bots.push(s);
}
bots[0].on('level', (lv) => { info = lv; bots.forEach((b) => { b.path = null; }); console.log(`▶ ${lv.code} ${lv.name}`); });
bots[0].on('state', (st) => { state = st; });
bots[0].on('result', (r) => {
  console.log(`  성공! ⭐${r.stars} ${Math.round(r.time / 1000)}초 실수 ${r.mistakes}`);
  setTimeout(() => bots[0].emit('team:choice', 'next'), 3500);
});

setTimeout(() => { teacher.emit('teacher:startTeam', { team: 1, level: START }); }, 8000);

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;

// 길 캐시: 목표가 크게 바뀌거나 1초가 지나면 다시 찾기
function follow(b, me, goal, extra) {
  const now = Date.now();
  if (!b.path || !b.goal || len(sub(goal, b.goal)) > 30 || now - b.pathAt > 1000) {
    const lvl = info.geo || levelsOf(info.mode)[info.index];   // 이번 변형(뒤집기 등) 그대로
    const open = state.g.map(Boolean);
    const grid = buildGrid(lvl, open, 'safe', { inflate: 4, extra });
    b.path = findPath(grid, me, goal) || [goal];
    b.goal = goal; b.pathAt = now;
  }
  while (b.path.length > 1 && len(sub(b.path[0], me)) < 22) b.path.shift();
  const wp = b.path.length > 1 ? b.path[0] : goal;
  const d = sub(wp, me);
  const l = len(d);
  if (l < 5) return { x: 0, y: 0 };
  const k = b.path.length > 1 ? 1 : Math.min(1, l / 40);
  return { x: (d.x / l) * k, y: (d.y / l) * k };
}

let cratePath = null, cratePathAt = 0, crateGoalKey = '';

setInterval(() => {
  if (!info || !state || state.s !== 'playing') return;
  const lvl = info.geo || levelsOf(info.mode)[info.index];   // 이번 변형(뒤집기 등) 그대로
  const P = new Map(state.p.map(([slot, x, y]) => [slot, { x, y }]));
  const crate = { x: state.c[0], y: state.c[1] };
  const order = [...P.keys()].sort((a, b) => a - b);
  const open = state.g.map(Boolean);
  const crateBox = { x: crate.x, y: crate.y, w: HALF * 2 + 6, h: HALF * 2 + 6 };

  // 지금 할 일: 아직 못 지난 첫 문
  //  - 모둠 발판: 모두 발판으로 / 바구니 발판: 바구니를 거기로
  //  - 꾹 발판: 한 명이 문을 잡고 나머지가 바구니를 넘김 → 건너편에서 문을 잡아 주고 마지막 친구가 건넘
  //  - 호박이 눌러 주는 꾹 발판: 기다렸다가 그냥 지나감
  const beyond = (g, p, m = 30) => p.x > g.door.x + m;
  const passed = (g, i) => g.plates.type !== 'hold'
    ? open[i]
    : beyond(g, crate, 115) && order.every((s) => beyond(g, P.get(s)));
  const gi = lvl.gates.findIndex((g, i) => !passed(g, i));
  const gate = gi >= 0 ? lvl.gates[gi] : null;
  const pumpkinHeld = gate && (lvl.pumpkinHolds || []).includes(gi);
  let crateGoal = null;
  let holder = null, holdPlate = null;
  if (!gate) crateGoal = homeRect(lvl.home);
  else if (gate.plates.type === 'crate') crateGoal = { x: gate.plates.x, y: gate.plates.y };
  else if (gate.plates.type === 'hold') {
    const near = gate.plates.at.find((p) => p.x < gate.door.x), far = gate.plates.at.find((p) => p.x > gate.door.x);
    if (!beyond(gate, crate, 115)) {
      crateGoal = { x: gate.door.x + 170, y: gate.door.y };
      // 문 잡는 친구는 자기가 있는 쪽 발판을 밟음
      if (!pumpkinHeld) { holder = order[0]; holdPlate = beyond(gate, P.get(holder), 0) ? far : near; }
    } else if (!pumpkinHeld) {
      // 바구니는 넘어감 → 건너편에 있는 친구가 문을 잡고, 남은 친구가 건넘
      holder = order.find((s) => beyond(gate, P.get(s))); holdPlate = far;
    }
  }

  let dir = null;
  if (crateGoal) {
    const key = `${gi}:${Math.round(crate.x / 40)}:${Math.round(crate.y / 40)}`;
    if (!cratePath || key !== crateGoalKey || Date.now() - cratePathAt > 1500) {
      cratePath = findPath(buildGrid(lvl, open, 'crate', { inflate: 16 }), crate, crateGoal) || [crateGoal];
      crateGoalKey = key; cratePathAt = Date.now();
    }
    let wp = cratePath.find((p) => len(sub(p, crate)) > 50) || crateGoal;
    dir = norm(sub(wp, crate));
  }

  bots.forEach((b) => {
    const me = P.get(b.slot);
    if (!me) return;
    let inp = { x: 0, y: 0, a: false };
    const myPlates = info.plates.filter((p) => p.gate === gi && p.type === 'team');
    if (b.slot === holder && holdPlate) {
      inp = follow(b, me, holdPlate, [crateBox]);
    } else if (gate && gate.plates.type === 'hold' && beyond(gate, crate, 115) && !beyond(gate, me)) {
      inp = follow(b, me, { x: gate.door.x + 120, y: gate.door.y }, [crateBox]);   // 열린 문으로 건너가기
    } else if (gate && gate.plates.type === 'hold' && beyond(gate, crate, 115)) {
      inp = { x: 0, y: 0, a: false };                                             // 건너편에서 친구 기다리기
    } else if (gate && gate.plates.type === 'team') {
      // 모둠 발판: 자리 순서대로 하나씩
      const plate = myPlates[order.indexOf(b.slot)] || myPlates[0];
      inp = follow(b, me, plate, [crateBox]);
    } else if (dir) {
      // 바구니 뒤로 돌아가 다 같이 밀기
      const perp = { x: -dir.y, y: dir.x };
      const lane = (order.indexOf(b.slot) - (order.length - 1) / 2) * 24;
      const behind = { x: crate.x - dir.x * (HALF + R + 6) + perp.x * lane, y: crate.y - dir.y * (HALF + R + 6) + perp.y * lane };
      const rel = sub(me, crate);
      if (dot(rel, dir) > -(HALF + 4) || len(sub(behind, me)) > 16) {
        inp = follow(b, me, behind, [crateBox]);
      } else {
        inp = { x: dir.x, y: dir.y, a: true };
      }
    }
    // 끼어서 못 움직이면 잠깐 옆으로
    if (b.last && len(sub(me, b.last)) < 1 && len(inp) > 0.5 && !inp.a) b.stuck++; else b.stuck = 0;
    b.last = { x: me.x, y: me.y };
    if (b.stuck > 12) { b.jitterUntil = Date.now() + 400; b.jitter = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 }; b.stuck = 0; b.path = null; }
    if (Date.now() < b.jitterUntil) inp = { ...b.jitter, a: false };
    b.emit('input', { x: +inp.x.toFixed(2), y: +inp.y.toFixed(2), a: !!inp.a });
  });
}, 50);
