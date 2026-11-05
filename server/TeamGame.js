import { RULES, FIELD, COLORS, COLOR_NAMES, ANIMALS, TEAM_MAX } from '../shared/constants.js';
import { levelsOf, orderOf, modeFor, levelCode, ORDER_VERSION, fromOldIndex } from '../shared/missions.js';
import { analyzeLevel, crateNeed } from '../shared/solver.js';
import { makeVariant, rng } from '../shared/variant.js';
import { buildGrid, findPath } from '../shared/grid.js';
import {
  hazardPos, teamPlatePositions, circleRectPush, rectsOverlap, inRect, distToRect, clamp, homeRect, thornRect
} from '../shared/geometry.js';

const parCache = new Map();
function parOf(mode, id, n) {
  const key = `${mode}:${id}:${n}`;
  if (!parCache.has(key)) parCache.set(key, analyzeLevel(levelsOf(mode)[id], n).par || 60);
  return parCache.get(key);
}
// 방 안에서는 모둠 인원이 달라도 같은 단계가 나오도록, 나올 수 있는 인원 모두로 검사해 만든 변형을 함께 씀
const ROOM_SIZES = { team: [1, 3, 4, 5, 6], duo: [2, 3] };
const roomVariants = new Map();
function roomVariant(mode, id, base, seed) {
  const key = `${mode}:${id}:${seed}`;
  if (!roomVariants.has(key)) {
    if (roomVariants.size > 2000) roomVariants.clear();
    roomVariants.set(key, makeVariant(base, ROOM_SIZES[mode], seed));
  }
  return roomVariants.get(key);
}
// order: 단계 순서 판 (퍼즐 단계를 섞기 전에 저장한 기록은 번호를 바꿔서 되살림)
const emptyProgress = () => ({ unlocked: 0, best: {}, order: ORDER_VERSION });

// 그림 암호 만들기: 그림 발판 중에서 len개를 겹치지 않게 골라 순서 정하기 (도전할 때마다 바뀜)
// 수학 문: 숫자 발판 n개와, 그 답이 나오는 문제 (곱셈구구 또는 뺄셈)
function mathPads(n, rand) {
  const out = [];
  while (out.length < n) {
    const a = 3 + Math.floor(rand() * 7), b = 3 + Math.floor(rand() * 7), v = a * b;
    if (out.some((q) => q.v === v)) continue;
    const k = 7 + Math.floor(rand() * 30);
    out.push({ v, q: rand() < 0.7 ? `${a} × ${b}` : `${v + k} − ${k}` });
  }
  return out;
}
function newCode(spec, rand) {
  const syms = spec.pads.map((p) => p.sym);
  for (let i = syms.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [syms[i], syms[j]] = [syms[j], syms[i]]; }
  // owner: 오두막 얼굴 발판을 먼저 밟은 친구(pid), sealed: 그 친구가 오두막에 들어가 문이 닫힘 (그 단계 끝까지)
  const cd = { seq: syms.slice(0, Math.min(spec.len, syms.length)), got: 0, reader: false, on: spec.pads.map(() => false), nagAt: 0, owner: null, sealed: false };
  if (spec.math) {
    const list = mathPads(spec.pads.length, rand);
    cd.nums = list.map((q) => q.v);                 // 발판에 쓰인 숫자 (pad.sym 번호 순서)
    cd.qs = cd.seq.map((sym) => list[sym].q);       // 차례대로 나오는 문제
  }
  return cd;
}
const pumpkinRect = (p) => ({ x: p.x, y: p.y, w: p.r * 1.6, h: p.r * 1.6 });

// 한 모둠(짝 2명 또는 모둠 3~5명, 선생님이 함께하면 +1)의 게임. 물리 계산은 모두 서버에서만 함
export default class TeamGame {
  // seed: 방 씨앗. 같은 씨앗이면 단계 순서·내용이 같음 (없으면 정해진 순서에 도전할 때마다 무작위)
  constructor(team, emit, seed = null) {
    this.team = team;
    this.seed = seed;
    this.emit = emit;            // (event, data) => 이 모둠 화면들로 전송
    this.players = new Map();    // pid → player
    this.progress = { team: emptyProgress(), duo: emptyProgress() };   // best[단계] = { stars, time }
    this.current = { team: 0, duo: 0 };   // 다음에 시작할 단계
    this.status = 'lobby';       // lobby | playing | result | finished
    this.mode = 'team';
    this.levelIndex = 0;
    this.result = null;
  }

  // ---------- 모둠원 ----------
  get size() { return this.players.size; }
  get students() { return [...this.players.values()].filter((p) => !p.isTeacher).length; }
  isFull() { return this.students >= TEAM_MAX; }
  hasTeacher() { return [...this.players.values()].some((p) => p.isTeacher); }
  // 대기실에서는 지금 인원으로, 게임 중에는 시작할 때 정한 미션 종류
  activeMode() { return this.status === 'lobby' ? modeFor(this.students) : this.mode; }

  addPlayer(pid, name, { isTeacher = false } = {}) {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const p = {
      pid, name, slot, isTeacher, color: COLORS[slot % COLORS.length], colorName: COLOR_NAMES[slot % COLORS.length],
      animal: isTeacher ? 'owl' : ANIMALS[slot % ANIMALS.length].id, connected: true,
      x: 0, y: 0, vx: 0, vy: 0, fx: 1, fy: 0, inp: { x: 0, y: 0, a: false }, grab: false, safeUntil: 0
    };
    this.players.set(pid, p);
    if (this.status === 'playing') this.spawn(p);
    this.rosterChanged();
    return p;
  }

  removePlayer(pid) {
    if (!this.players.delete(pid)) return;
    if (this.players.size === 0) this.status = 'lobby';
    this.rosterChanged();
  }

  setAnimal(pid, animal) {
    const p = this.players.get(pid);
    if (!p || p.isTeacher || !ANIMALS.some((a) => a.id === animal)) return;
    p.animal = animal;
    this.emit('roster', this.roster());
  }

  setConnected(pid, on) {
    const p = this.players.get(pid);
    if (!p) return;
    p.connected = on;
    if (!on) p.inp = { x: 0, y: 0, a: false };
    this.rosterChanged();   // 발판 수도 연결된 친구 수에 맞춰 다시 깔기
  }

  setInput(pid, inp) {
    const p = this.players.get(pid);
    if (!p || !inp) return;
    let x = clamp(+inp.x || 0, -1, 1), y = clamp(+inp.y || 0, -1, 1);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.inp = { x, y, a: !!inp.a };
  }

  rosterChanged() {
    // 발판 수 = 인원 수 → 게임 중이면 인원에 맞게 다시 깔기
    if (this.status === 'playing') this.buildPlates();
    this.emit('roster', this.roster());
    if (this.status === 'playing') this.emit('level', this.levelInfo());
    if (this.status === 'lobby') this.emit('progress', this.progressInfo());   // 인원에 따라 짝/모둠 지도가 바뀜
  }

  roster() {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot).map(({ pid, name, slot, color, colorName, animal, connected, isTeacher }) =>
      ({ pid, name, slot, color, colorName, animal, connected, isTeacher }));
  }

  // ---------- 진행 기록 (짝·모둠 따로) ----------
  progressInfo(mode = this.activeMode()) {
    const pr = this.progress[mode];
    // best는 단계 고유 번호로 저장 → 화면에는 이 방의 차례 번호로 바꿔서 보냄
    const best = {};
    orderOf(mode, this.seed).forEach((id, i) => { if (pr.best[id]) best[i] = pr.best[id]; });
    return { mode, unlocked: pr.unlocked, best, current: this.current[mode], total: levelsOf(mode).length, seed: this.seed };
  }

  setProgress(saved) {
    if (!saved) return;
    // 예전 형식({unlocked,best})은 모둠 미션 기록으로
    const src = 'unlocked' in saved ? { team: saved } : saved;
    for (const mode of ['team', 'duo']) {
      const pr = src[mode];
      if (!pr) continue;
      const max = levelsOf(mode).length - 1;
      const old = pr.order !== ORDER_VERSION;
      const idx = (i) => (old ? fromOldIndex(clamp(+i || 0, 0, max)) : clamp(+i || 0, 0, max));
      const best = Object.fromEntries(Object.entries(pr.best || {}).map(([i, b]) => [idx(i), b]));
      this.progress[mode] = { unlocked: idx(pr.unlocked), best, order: ORDER_VERSION };
      this.current[mode] = this.progress[mode].unlocked;
    }
    this.emit('progress', this.progressInfo());
  }

  setCurrent(i, mode = this.activeMode()) {
    const max = levelsOf(mode).length - 1;
    this.current[mode] = clamp(+i || 0, 0, max);
    this.progress[mode].unlocked = Math.max(this.progress[mode].unlocked, this.current[mode]);
    this.emit('progress', this.progressInfo());
  }

  unlockAll() {
    for (const mode of ['team', 'duo']) this.progress[mode].unlocked = levelsOf(mode).length - 1;
    this.emit('progress', this.progressInfo());
  }

  // 별·기록을 모두 지우고 1-1부터 (게임 중이면 대기실로)
  resetProgress() {
    this.progress = { team: emptyProgress(), duo: emptyProgress() };
    this.current = { team: 0, duo: 0 };
    if (this.status === 'lobby') this.emit('progress', this.progressInfo());
    else this.toLobby();
  }

  toLobby() {
    this.status = 'lobby';
    this.result = null;
    this.emit('lobby', this.progressInfo());
  }

  // ---------- 단계 ----------
  get levels() { return levelsOf(this.mode, this.seed); }
  // 이 방의 차례 번호 → 단계 고유 번호
  idOf(i, mode = this.mode) { return orderOf(mode, this.seed)[i]; }
  // 지금 하고 있는 단계 = 도전할 때마다 새로 만든 변형 (뒤집기·늪 길·딸기·장애물 타이밍)
  get level() { return this.lv || this.levels[this.levelIndex]; }

  start(i) {
    if (this.players.size === 0) return;
    this.mode = modeFor(this.students);
    this.loadLevel(clamp(i ?? this.current[this.mode], 0, this.levels.length - 1));
  }

  loadLevel(i) {
    this.levelIndex = i;
    this.current[this.mode] = i;
    this.status = 'playing';
    this.result = null;
    this.clock = 0;
    this.mistakes = 0;
    const id = this.idOf(i);
    // 씨앗이 있으면 방·단계마다 정해진 변형과 암호 → 같은 방의 모든 모둠이 같은 단계
    const levelSeed = this.seed == null ? null : (this.seed * 31 + id * 2654435761) >>> 0;
    this.lv = levelSeed == null ? makeVariant(this.levels[i], Math.max(1, this.players.size), Math.floor(Math.random() * 2 ** 31))
      : roomVariant(this.mode, id, this.levels[i], levelSeed);
    const rand = levelSeed == null ? Math.random : rng(levelSeed ^ 0x9e3779b9);
    const L = this.level;
    this.gateOpen = L.gates.map(() => false);
    this.berries = L.berries.map(() => false);
    // sx, sy: 마지막으로 안전한 땅 위에 있던 자리 (빠지면 여기로 돌아옴)
    this.crate = { x: L.crate.x, y: L.crate.y, sx: L.crate.x, sy: L.crate.y, vx: 0, vy: 0, moving: false, grabbers: 0 };
    this.pumpkins = L.pumpkins.map((p) => ({ ...p, ox: p.x, oy: p.y, sx: p.x, sy: p.y }));
    this.leverOn = false;
    this.bridgeOn = false;
    this.codes = L.gates.map((g) => (g.plates.type === 'code' ? newCode(g.plates, rand) : null));
    this.scales = L.gates.map((g) => (g.plates.type === 'scale' ? [0, 0] : null));
    // 시계가 0부터 다시 가므로 지난 단계의 무적(깜빡임) 시간도 지움 — 안 지우면 다음 단계에서 오래 깜빡임
    for (const p of this.players.values()) { this.spawn(p); p.safeUntil = 0; }
    this.buildPlates();
    this.emit('level', this.levelInfo());
  }

  spawn(p) {
    const list = [...this.players.values()].sort((a, b) => a.slot - b.slot);
    const k = list.indexOf(p), n = list.length;
    const a = (k / Math.max(1, n)) * Math.PI * 2;
    const s = this.level.start;
    Object.assign(p, {
      x: clamp(s.x + Math.cos(a) * 45, 20, FIELD.w - 20), y: clamp(s.y + Math.sin(a) * 45, 20, FIELD.h - 20),
      vx: 0, vy: 0
    });
  }

  // 오두막 문: 주인이 아직 안 들어갔으면 주인만 지나가고, 들어간 뒤에는 아무도 못 지나감
  boothDoorsFor(p) {
    return this.level.gates.flatMap((g, i) => {
      const b = g.plates.booth, cd = this.codes[i];
      // 암호를 다 맞혀 문이 열리면 오두막 문도 열림 (갇힌 친구가 나올 수 있게)
      return b && !this.gateOpen[i] && !(cd.owner === p.pid && !cd.sealed) ? [b.door] : [];
    });
  }

  // 색깔 문마다 지나갈 수 있는 친구(자리 번호). 앞 문일수록 많이 지나가서 친구마다 맡는 구역이 생김
  // 1번 문은 첫 친구를 빼고 모두, 2번 문은 둘째까지 빼고 모두… 마지막 친구는 늘 끝까지 감. 혼자 남으면 모두 열림
  colorAllowed() {
    const slots = [...this.players.values()].filter((p) => p.connected).map((p) => p.slot).sort((a, b) => a - b);
    return this.level.colorDoors.map((_, i) => (slots.length < 2 ? slots : slots.slice(Math.min(i + 1, slots.length - 1))));
  }
  colorDoorsFor(p) {
    const doors = this.level.colorDoors;
    if (!doors.length) return doors;
    const ok = this.colorAllowed();
    return doors.filter((_, i) => !ok[i].includes(p.slot));
  }

  // 저울 발판: 연결된 친구 모두가 판 위에 있고 양쪽 수가 같으면 문이 열리고 계속 열림 (바구니도 1)
  stepScale(g, gi, players) {
    const on = players.filter((p) => p.connected);
    const count = (r) => on.filter((p) => inRect(p.x, p.y, r)).length + (inRect(this.crate.x, this.crate.y, r) ? 1 : 0);
    const { left, right } = g.plates;
    const a = count(left), b = count(right);
    this.scales[gi] = [a, b];
    const allOn = on.every((p) => inRect(p.x, p.y, left) || inRect(p.x, p.y, right));
    if (!this.gateOpen[gi] && allOn && a === b && a > 0) {
      this.gateOpen[gi] = true;
      this.emit('fx', { type: 'door', gate: gi });
    }
  }

  // 밀물: 0 = 썰물, 1 = 곧 물이 들어옴(2초 전 예고), 2 = 밀물
  tideState() {
    const T = this.level.tide;
    if (!T) return 0;
    const t = this.clock % T.period;
    return t < T.low - 2000 ? 0 : t < T.low ? 1 : 2;
  }

  stepBooths(players) {
    this.level.gates.forEach((g, i) => {
      const b = g.plates.booth, cd = this.codes[i];
      if (!b || this.gateOpen[i]) return;
      const owner = cd.owner && this.players.get(cd.owner);
      // 주인이 끊기거나 나가면 다른 친구가 맡을 수 있게
      if (cd.owner && (!owner || !owner.connected)) { cd.owner = null; cd.sealed = false; }
      // 아직 안 들어간 주인이 발판에서 멀어지면 자리 내놓기
      if (owner && !cd.sealed && Math.hypot(owner.x - b.pad.x, owner.y - b.pad.y) > RULES.plateR * 2.5 &&
        !inRect(owner.x, owner.y, b.door) && !inRect(owner.x, owner.y, b.room)) cd.owner = null;
      if (!cd.owner) {
        const p = players.find((q) => q.connected && Math.hypot(q.x - b.pad.x, q.y - b.pad.y) < RULES.plateR);
        if (p) { cd.owner = p.pid; this.emit('fx', { type: 'boothClaim', gate: i, slot: p.slot }); }
      }
      for (const p of players) {
        if (!inRect(p.x, p.y, b.room)) continue;
        if (p.pid === cd.owner) {
          if (!cd.sealed) { cd.sealed = true; this.emit('fx', { type: 'boothSeal', gate: i, slot: p.slot }); }
        } else {
          this.spawn(p);   // 주인이 아닌 친구가 안에 있으면(끊겼다 돌아온 옛 주인 등) 처음 자리로
        }
      }
    });
  }

  // 모둠 발판 수 = 지금 연결된 친구 수 (끊긴 친구 몫의 발판 때문에 문이 안 열리는 일이 없도록)
  buildPlates() {
    const sorted = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.slot - b.slot);
    const n = Math.max(1, sorted.length);
    this.plates = [];
    this.level.gates.forEach((g, gi) => {
      if (g.plates.type === 'scale') {
        // 저울판은 stepScale이 따로 다룸
      } else if (g.plates.type === 'crate') {
        this.plates.push({ gate: gi, type: 'crate', x: g.plates.x, y: g.plates.y, color: '#c98a4b', on: false });
      } else if (g.plates.type === 'code') {
        // 그림 발판은 stepCode가 따로 다룸
      } else if (g.plates.type === 'hold') {
        g.plates.at.forEach((pos) => this.plates.push({ gate: gi, type: 'hold', x: pos.x, y: pos.y, color: '#9c6bff', on: false }));
      } else {
        teamPlatePositions(g.plates, n).forEach((pos, k) =>
          this.plates.push({ gate: gi, type: 'team', ...pos, color: sorted[k]?.color || '#ffffff', on: false }));
      }
    });
  }

  // 바구니를 밀 인원은 지금 연결된 친구만 셈 (잠깐 끊긴 친구 때문에 못 미는 일이 없도록)
  need() {
    const online = [...this.players.values()].filter((p) => p.connected).length;
    return crateNeed(this.level.crate.weight, Math.max(1, online));
  }

  levelInfo() {
    const L = this.level;
    return {
      mode: this.mode, index: this.levelIndex, code: levelCode(this.levelIndex), total: this.levels.length,
      name: L.name, world: L.world, tip: L.tip, par: parOf(this.mode, this.idOf(this.levelIndex), Math.max(1, this.players.size)),
      field: FIELD, start: L.start, home: L.home, house: L.house, walls: L.walls, colorDoors: L.colorDoors, tides: L.tides,
      gates: L.gates.map((g, i) => ({
        door: g.door, open: this.gateOpen[i], type: g.plates.type,
        code: g.plates.type === 'code' ? { sign: g.plates.sign, pads: g.plates.pads, len: this.codes[i].seq.length, booth: g.plates.booth, nums: this.codes[i].nums } : undefined,
        scale: g.plates.type === 'scale' ? { left: g.plates.left, right: g.plates.right } : undefined
      })),
      levers: L.levers, bridges: L.bridges, swamps: L.swamps, swampCells: L.swampCells, lookouts: L.lookouts,
      plates: this.plates.map(({ gate, type, x, y, color }) => ({ gate, type, x, y, color })),
      water: L.water, thorns: L.thorns, streams: L.streams, ice: L.ice, mud: L.mud,
      movers: L.movers.map(({ kind, r, w, h }) => ({ kind, r, w, h })),
      pumpkins: this.pumpkins.map(({ x, y, r }) => ({ x: Math.round(x), y: Math.round(y), r })),
      berries: L.berries, crate: { weight: L.crate.weight, need: this.need() },
      best: this.progress[this.mode].best[this.idOf(this.levelIndex)] || null, roster: this.roster(),
      geo: L   // 이번 변형 전체 (로봇 시연이 길찾기에 씀)
    };
  }

  // ---------- 결과 화면에서 고르기 ----------
  choose(pid, choice) {
    if (!this.players.has(pid) || this.status !== 'result') return;
    if (choice === 'next' && this.levelIndex + 1 < this.levels.length) this.loadLevel(this.levelIndex + 1);
  }

  // ---------- 물리 한 걸음 ----------
  tick(dt) {
    if (this.status === 'result') {
      this.clock += dt * 1000;
      if (this.clock >= this.resultAt) {
        if (this.levelIndex + 1 < this.levels.length) this.loadLevel(this.levelIndex + 1);
        else { this.status = 'finished'; this.emit('finished', this.progressInfo()); }
      }
      return;
    }
    if (this.status !== 'playing') return;
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps && this.status === 'playing'; s++) this.step(h);
  }

  water() {
    const L = this.level;
    return [...L.water, ...L.swampCells, ...(this.bridgeOn ? [] : L.bridges), ...(this.tideState() === 2 ? L.tides : [])];
  }
  activeStreams() { return this.level.streams.filter((s) => !(s.lever && this.leverOn)); }

  // 물·늪·다리·물결·꾹 발판 문에서 r(+여유)만큼 떨어진 땅 위인지 → 빠졌을 때 돌아올 자리로 기억해도 되는 곳
  safeGround(x, y, r) {
    const L = this.level, m = r + 20;
    const near = (w) => Math.abs(x - w.x) < w.w / 2 + m && Math.abs(y - w.y) < w.h / 2 + m;
    const swamps = L.swamps.map((sw) => ({ x: (sw.x1 + sw.x2) / 2, y: (sw.y1 + sw.y2) / 2, w: sw.x2 - sw.x1, h: sw.y2 - sw.y1 }));
    const holdDoors = L.gates.filter((g) => g.plates.type === 'hold').map((g) => g.door);
    return ![...L.water, ...swamps, ...L.bridges, ...L.streams, ...L.tides, ...holdDoors].some(near);
  }

  // 빠진 물건이 돌아갈 자리: 처음 자리와 땅으로 이어져 있으면 처음 자리로.
  // 레버 다리·꾹 발판 문·안개 늪·센 물살·밀물 자리·닫힌 문 너머로 옮겨 온 물건만 빠지기 전 땅으로 (다시 가져오다 단계가 막히지 않게)
  fallBack(origin, safe) {
    const L = this.level;
    const open = L.gates.map((g, i) => g.plates.type !== 'hold' && this.gateOpen[i]);
    const swamps = L.swamps.map((sw) => ({ x: (sw.x1 + sw.x2) / 2, y: (sw.y1 + sw.y2) / 2, w: sw.x2 - sw.x1, h: sw.y2 - sw.y1 }));
    const grid = buildGrid(L, open, 'crate', { bridges: false, extra: [...swamps, ...L.tides, ...L.streams.filter((s) => s.strong)] });
    const path = findPath(grid, safe, origin);
    const joined = path && Math.hypot(path.at(-1).x - origin.x, path.at(-1).y - origin.y) <= 60;
    return { ...(joined ? origin : safe), back: joined ? 'start' : 'safe' };
  }
  // 물이 아닌 구멍(안개 늪의 빠지는 칸·얼음판 구멍)인지
  isHole(x, y) {
    const L = this.level;
    return L.swampCells.some((w) => inRect(x, y, w)) ||
      L.water.some((w) => inRect(x, y, w) && L.ice.some((r) => rectsOverlap(w, r)));
  }

  closedDoors() { return this.level.gates.filter((_, i) => !this.gateOpen[i]).map((g) => g.door); }
  // 바구니를 막는 것 (호박 포함). 물·늪 구멍은 막지 않음 → 밀다가 빠지면 처음 자리로
  crateSolids(skipPumpkin) {
    const L = this.level;
    return [...L.walls, L.house, ...L.thorns.map(thornRect), ...this.closedDoors(),
      ...this.pumpkins.filter((p) => p !== skipPumpkin).map(pumpkinRect)];
  }

  step(dt) {
    this.clock += dt * 1000;
    const now = this.clock;
    const L = this.level;
    const players = [...this.players.values()];

    // 0) 레버: 누군가 레버 앞에서 잡기를 누르고 있으면 다리가 놓이고 레버 물살이 멈춤 (다리 위에 누가 있으면 다리는 그대로)
    const wasLever = this.leverOn;
    this.leverOn = L.levers.some((lv) => players.some((p) => p.inp.a && Math.hypot(p.x - lv.x, p.y - lv.y) < RULES.leverR));
    if (this.leverOn !== wasLever) this.emit('fx', { type: this.leverOn ? 'leverOn' : 'leverOff' });
    const cNow = { x: this.crate.x, y: this.crate.y, w: RULES.crateHalf * 2, h: RULES.crateHalf * 2 };
    const onBridge = L.bridges.some((b) => rectsOverlap(cNow, b) || players.some((p) => inRect(p.x, p.y, b)));
    this.bridgeOn = this.leverOn || (this.bridgeOn && onBridge);

    // 1) 조작 → 속도 (얼음: 잘 안 멈춤 / 진흙: 느림)
    const c = this.crate, half = RULES.crateHalf;
    const crateRect = { x: c.x, y: c.y, w: half * 2, h: half * 2 };
    for (const p of players) {
      p.grab = p.inp.a;
      // 바구니를 잡는 순간 잡은 면 쪽으로 방향을 고정 → 잡고 있는 동안은 그 방향으로 밀고 당기기만
      if (p.grab && distToRect(p.x, p.y, crateRect) < RULES.playerR + RULES.grabDist) {
        if (!p.lock) {
          const dx = c.x - p.x, dy = c.y - p.y;
          p.lock = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
        }
        const along = p.inp.x * p.lock.x + p.inp.y * p.lock.y;
        p.move = Math.abs(along) < 0.2 ? { x: 0, y: 0 } : { x: p.lock.x * along, y: p.lock.y * along };
      } else {
        p.lock = null;
        p.move = p.inp;
      }
      const onIce = L.ice.some((r) => inRect(p.x, p.y, r));
      const inMud = L.mud.some((r) => inRect(p.x, p.y, r));
      const top = RULES.speed * (inMud ? RULES.mudSpeed : 1);
      const k = Math.min(1, (onIce ? RULES.iceSteer : RULES.steer) * dt);
      p.vx += (p.move.x * top - p.vx) * k;
      p.vy += (p.move.y * top - p.vy) * k;
      if (p.lock) { p.fx = p.lock.x; p.fy = p.lock.y; }
      else if (p.inp.x || p.inp.y) { p.fx = p.inp.x; p.fy = p.inp.y; }
    }

    // 2) 바구니: 필요한 인원 이상이 같은 방향(±45°)으로 잡아 밀어야 움직임
    const grabbers = players.filter((p) => p.lock);
    c.grabbers = grabbers.length;
    const need = this.need();
    let tx = 0, ty = 0;
    grabbers.forEach((p) => { tx += p.move.x; ty += p.move.y; });
    c.moving = false;
    if (grabbers.length >= need && Math.hypot(tx, ty) > 0.1) {
      const dir = Math.atan2(ty, tx);
      const aligned = grabbers.filter((p) => {
        if (Math.hypot(p.move.x, p.move.y) < 0.1) return false;
        let d = Math.atan2(p.move.y, p.move.x) - dir;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        return Math.abs(d) <= Math.PI / 4;
      });
      if (aligned.length >= need) {
        const boost = Math.min(1.4, 0.8 + 0.2 * aligned.length / need);
        c.vx = Math.cos(dir) * RULES.crateSpeed * boost;
        c.vy = Math.sin(dir) * RULES.crateSpeed * boost;
        c.moving = true;
      }
    }
    if (!c.moving) { c.vx = 0; c.vy = 0; }
    const crateWas = { x: c.x, y: c.y };
    this.moveCrate(dt);

    // 3) 움직이는 장애물 → 호박을 밀어냄 (통나무·눈덩이만, 꿀벌은 날아다녀서 못 밂)
    const movers = L.movers.map((m) => ({ m, pos: hazardPos(m, now) }));
    for (const pk of this.pumpkins) {
      for (const { m, pos } of movers) {
        if (m.kind === 'bee') continue;
        const push = m.kind === 'log'
          ? circleRectPush(pk.x, pk.y, pk.r, { x: pos.x, y: pos.y, w: m.w, h: m.h })
          : (() => {
            const dx = pk.x - pos.x, dy = pk.y - pos.y, d = Math.hypot(dx, dy) || 1, over = pk.r + m.r - d;
            return over > 0 ? { x: (dx / d) * over, y: (dy / d) * over } : null;
          })();
        if (push) this.movePumpkin(pk, push.x, push.y);
      }
    }

    // 물결 위의 호박도 물결 방향으로 떠내려감
    for (const pk of [...this.pumpkins]) {
      const s = this.activeStreams().find((st) => inRect(pk.x, pk.y, st));
      if (s) this.movePumpkin(pk, s.vx * dt, s.vy * dt);
    }

    // 4) 동물 이동 + 충돌 + 물살
    const solids = [...L.walls, L.house, ...this.closedDoors()];
    const crateNow = { x: c.x, y: c.y, w: half * 2, h: half * 2 };
    for (const p of players) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      // 물살: 바구니를 잡고 있는 친구는 바구니를 붙잡고 있어서 떠내려가지 않음
      for (const s of this.activeStreams()) {
        if (inRect(p.x, p.y, s) && (s.strong || !grabbers.includes(p))) { p.x += s.vx * dt; p.y += s.vy * dt; }
      }
      // 당기는 동안에는 바구니보다 빨리 걸어가 손이 놓이지 않도록, 잡을 수 있는 거리 안에서 바구니와 함께 움직임
      if (p.lock && p.move.x * p.lock.x + p.move.y * p.lock.y < 0) {
        const gap = (c.x - p.x) * p.lock.x + (c.y - p.y) * p.lock.y - half;
        const over = gap - (RULES.playerR + RULES.grabDist - 4);
        if (over > 0) { p.x += p.lock.x * over; p.y += p.lock.y * over; }
      }
      for (let it = 0; it < 2; it++) {
        const push = circleRectPush(p.x, p.y, RULES.playerR, crateNow);
        if (push) { p.x += push.x; p.y += push.y; }
        for (const pk of this.pumpkins) {
          const dx = p.x - pk.x, dy = p.y - pk.y, d = Math.hypot(dx, dy) || 1, over = pk.r + RULES.playerR - d;
          if (over > 0) { p.x += (dx / d) * over; p.y += (dy / d) * over; }
        }
        // 벽을 맨 나중에 → 바구니·호박에 밀려도 벽을 뚫고 나가지 않음
        for (const r of [...solids, ...this.boothDoorsFor(p), ...this.colorDoorsFor(p)]) {
          const out = circleRectPush(p.x, p.y, RULES.playerR, r);
          if (out) { p.x += out.x; p.y += out.y; }
        }
        p.x = clamp(p.x, RULES.playerR, FIELD.w - RULES.playerR);
        p.y = clamp(p.y, RULES.playerR, FIELD.h - RULES.playerR);
      }
    }
    // 바구니와 벽 사이에 낀 친구가 있으면 바구니가 더 못 감 (물에 빠져 멀리 돌아간 때는 빼고)
    if (Math.hypot(c.x - crateWas.x, c.y - crateWas.y) < 40 &&
      players.some((p) => circleRectPush(p.x, p.y, RULES.playerR - 4, crateNow))) Object.assign(c, crateWas);

    this.stepBooths(players);

    // 5) 위험한 곳에 닿으면 → 처음 자리로 (벌칙)
    for (const p of players) {
      if (now < p.safeUntil) continue;
      let cause = null;
      if (L.swampCells.some((w) => inRect(p.x, p.y, w))) cause = 'swamp';
      else if (this.water().some((w) => inRect(p.x, p.y, w))) cause = this.isHole(p.x, p.y) ? 'hole' : 'water';
      else if (L.thorns.some((t) => Math.hypot(p.x - t.x, p.y - t.y) < t.r + RULES.playerR * 0.6)) cause = 'thorn';
      else {
        for (const { m, pos } of movers) {
          const hit = m.kind === 'log'
            ? circleRectPush(p.x, p.y, RULES.playerR - 4, { x: pos.x, y: pos.y, w: m.w, h: m.h })
            : Math.hypot(p.x - pos.x, p.y - pos.y) < m.r + RULES.playerR - 4;
          if (hit) { cause = m.kind; break; }
        }
      }
      if (cause) {
        const at = { x: Math.round(p.x), y: Math.round(p.y) };
        this.spawn(p);
        p.safeUntil = now + RULES.safeMs;
        this.mistakes++;
        this.emit('fx', { type: 'oops', slot: p.slot, cause, ...at });
      }
    }

    // 6) 딸기
    L.berries.forEach((b, i) => {
      if (this.berries[i]) return;
      const p = players.find((q) => Math.hypot(q.x - b[0], q.y - b[1]) < RULES.berryR + RULES.playerR);
      if (p) { this.berries[i] = true; this.emit('fx', { type: 'berry', i, slot: p.slot }); }
    });

    // 7) 발판 → 문
    //  - 모둠 발판·바구니 발판: 모두 눌리면 열리고 계속 열림
    //  - 꾹 발판: 누르는 동안만 열림 (문 사이에 누가 있으면 닫히지 않음)
    const onPlate = (x, y, r) => players.some((p) => Math.hypot(p.x - x, p.y - y) < r) ||
      Math.hypot(c.x - x, c.y - y) < r + 20 || this.pumpkins.some((pk) => Math.hypot(pk.x - x, pk.y - y) < r);
    for (const pl of this.plates) {
      const was = pl.on;
      pl.on = pl.type === 'crate' ? Math.hypot(c.x - pl.x, c.y - pl.y) < RULES.cratePlateR : onPlate(pl.x, pl.y, RULES.plateR);
      if (pl.on && !was && (pl.type === 'hold' || !this.gateOpen[pl.gate])) this.emit('fx', { type: 'plate' });
    }
    L.gates.forEach((g, gi) => {
      if (g.plates.type === 'code') return this.stepCode(g, gi, players, now);
      if (g.plates.type === 'scale') return this.stepScale(g, gi, players);
      const mine = this.plates.filter((pl) => pl.gate === gi);
      if (!mine.length) return;
      if (g.plates.type === 'hold') {
        const pressed = mine.some((pl) => pl.on);
        const busy = players.some((p) => circleRectPush(p.x, p.y, RULES.playerR, g.door)) ||
          rectsOverlap(crateRect, g.door) || this.pumpkins.some((pk) => rectsOverlap(pumpkinRect(pk), g.door));
        const open = pressed || (this.gateOpen[gi] && busy);
        if (open !== this.gateOpen[gi]) this.emit('fx', { type: open ? 'door' : 'doorClose', gate: gi, hold: true });
        this.gateOpen[gi] = open;
      } else if (!this.gateOpen[gi] && mine.every((pl) => pl.on)) {
        this.gateOpen[gi] = true;
        this.emit('fx', { type: 'door', gate: gi });
      }
    });

    // 8) 바구니가 집에 들어가면 성공!
    const home = homeRect(L.home);
    if (Math.abs(c.x - home.x) < home.w / 2 - 25 && Math.abs(c.y - home.y) < home.h / 2 - 25) this.finishLevel();
  }

  // 그림 암호: 표지판 앞에 친구가 있을 때만 그림 발판이 눌림. 순서가 틀리면 처음부터
  stepCode(g, gi, players, now) {
    if (this.gateOpen[gi]) return;
    const spec = g.plates, cd = this.codes[gi];
    // 표지판을 읽을 수 있는 건 오두막에 들어간 주인뿐
    const owner = cd.sealed && this.players.get(cd.owner);
    cd.reader = !!owner && Math.hypot(owner.x - spec.sign.x, owner.y - spec.sign.y) < RULES.signR;
    spec.pads.forEach((pad, k) => {
      const on = players.some((p) => Math.hypot(p.x - pad.x, p.y - pad.y) < RULES.plateR);
      const entered = on && !cd.on[k];
      cd.on[k] = on;
      if (!entered) return;
      if (!cd.reader) {
        if (now > cd.nagAt) { cd.nagAt = now + 2500; this.emit('fx', { type: 'codeNoReader', gate: gi }); }
        return;
      }
      if (pad.sym === cd.seq[cd.got]) {
        cd.got++;
        this.emit('fx', { type: 'codeOk', gate: gi, got: cd.got });
        if (cd.got >= cd.seq.length) {
          this.gateOpen[gi] = true;
          this.emit('fx', { type: 'door', gate: gi });
          if (cd.sealed) this.emit('fx', { type: 'boothOpen', gate: gi, slot: this.players.get(cd.owner)?.slot });
          cd.sealed = false;
        }
      } else {
        cd.got = 0;
        this.emit('fx', { type: 'codeWrong', gate: gi });
      }
    });
  }

  moveCrate(dt) {
    const c = this.crate, half = RULES.crateHalf;
    const solids = this.crateSolids();
    const blocked = (x, y) => {
      if (x - half < 0 || x + half > FIELD.w || y - half < 0 || y + half > FIELD.h) return true;
      const r = { x, y, w: half * 2, h: half * 2 };
      return solids.some((s) => rectsOverlap(r, s));
    };
    // 물결 위에 올라간 바구니는 물결 방향으로 떠내려감 (미는 힘에 더해짐 → 비스듬히 밀어야 건넘)
    for (const s of this.activeStreams()) {
      if (!inRect(c.x, c.y, s)) continue;
      if (!blocked(c.x + s.vx * dt, c.y)) c.x += s.vx * dt;
      if (!blocked(c.x, c.y + s.vy * dt)) c.y += s.vy * dt;
    }
    // 물(연못)·늪 구멍에 빠지면 처음 자리나 마지막으로 안전했던 자리로
    if (this.water().some((w) => inRect(c.x, c.y, w))) {
      const at = { x: Math.round(c.x), y: Math.round(c.y), hole: this.isHole(c.x, c.y) };
      const to = this.fallBack({ x: this.level.crate.x, y: this.level.crate.y }, { x: c.sx, y: c.sy });
      Object.assign(c, { x: to.x, y: to.y, sx: to.x, sy: to.y, vx: 0, vy: 0 });
      this.mistakes++;
      this.emit('fx', { type: 'crateSplash', ...at, back: to.back });
      return;
    }
    if (!blocked(c.x + c.vx * dt, c.y)) c.x += c.vx * dt;
    if (!blocked(c.x, c.y + c.vy * dt)) c.y += c.vy * dt;
    if (this.safeGround(c.x, c.y, half)) { c.sx = c.x; c.sy = c.y; }
  }

  // 호박을 (dx,dy)만큼 밀기: 울타리·바구니·맵 끝에 막히면 그만큼만
  movePumpkin(pk, dx, dy) {
    const L = this.level;
    const solids = [...L.walls, L.house, ...this.closedDoors(), { x: this.crate.x, y: this.crate.y, w: RULES.crateHalf * 2, h: RULES.crateHalf * 2 },
      ...this.pumpkins.filter((o) => o !== pk).map(pumpkinRect)];
    const free = (x, y) => x - pk.r >= 0 && x + pk.r <= FIELD.w && y - pk.r >= 0 && y + pk.r <= FIELD.h &&
      !solids.some((s) => circleRectPush(x, y, pk.r * 0.8, s));
    if (free(pk.x + dx, pk.y)) pk.x += dx;
    if (free(pk.x, pk.y + dy)) pk.y += dy;
    // 물·늪 구멍에 빠지면 처음 자리나 마지막으로 안전했던 자리로
    if (this.water().some((w) => inRect(pk.x, pk.y, w))) {
      const at = { x: Math.round(pk.x), y: Math.round(pk.y), hole: this.isHole(pk.x, pk.y) };
      const to = this.fallBack({ x: pk.ox, y: pk.oy }, { x: pk.sx, y: pk.sy });
      pk.x = pk.sx = to.x; pk.y = pk.sy = to.y;
      this.mistakes++;
      this.emit('fx', { type: 'pumpkinSplash', ...at, back: to.back });
    } else if (this.safeGround(pk.x, pk.y, pk.r)) { pk.sx = pk.x; pk.sy = pk.y; }
  }

  finishLevel() {
    const i = this.levelIndex, mode = this.mode, id = this.idOf(i);
    const pr = this.progress[mode];
    const time = Math.round(this.clock);
    const par = parOf(mode, id, Math.max(1, this.players.size));
    const allBerries = this.berries.every(Boolean);
    const stars = 1 + (allBerries ? 1 : 0) + (time <= par * 1000 ? 1 : 0);
    const prev = pr.best[id];
    const newBest = !prev || stars > prev.stars || (stars === prev.stars && time < prev.time);
    if (newBest) pr.best[id] = { stars: Math.max(stars, prev?.stars || 0), time: Math.min(time, prev?.time ?? Infinity) };
    pr.unlocked = Math.max(pr.unlocked, Math.min(i + 1, this.levels.length - 1));
    this.status = 'result';
    this.resultAt = this.clock + RULES.resultMs;
    const last = i + 1 >= this.levels.length;
    this.result = {
      mode, index: i, code: levelCode(i), name: this.level.name, stars, time, par, mistakes: this.mistakes,
      berries: this.berries.filter(Boolean).length, newBest, best: pr.best[id], last, autoMs: RULES.resultMs
    };
    this.emit('fx', { type: 'clear' });
    this.emit('result', this.result);
    this.emit('progress', this.progressInfo());
  }

  // ---------- 전송용 상태 ----------
  snapshot() {
    const now = this.clock;
    const r = Math.round;
    return {
      s: this.status,
      t: Math.floor(now / 1000),
      p: [...this.players.values()].map((p) => [
        p.slot, r(p.x), r(p.y), r(p.fx * 100), r(p.fy * 100), p.grab ? 1 : 0, p.connected ? 1 : 0, now < p.safeUntil ? 1 : 0
      ]),
      c: [r(this.crate.x), r(this.crate.y), this.crate.grabbers, this.crate.moving ? 1 : 0, this.need()],
      g: this.gateOpen.map((o) => (o ? 1 : 0)),
      pl: this.plates.map((p) => (p.on ? 1 : 0)),
      mv: this.level.movers.map((m) => { const q = hazardPos(m, now); return [r(q.x), r(q.y)]; }),
      pk: this.pumpkins.map((p) => [r(p.x), r(p.y)]),
      lv: this.leverOn ? 1 : 0,
      br: this.bridgeOn ? 1 : 0,
      cd: this.codes.map((c) => (c ? [c.seq, c.got, c.reader ? 1 : 0, this.players.get(c.owner)?.slot ?? -1, c.sealed ? 1 : 0, c.qs] : null)),
      sc: this.scales,
      dc: this.colorAllowed(),
      td: this.tideState(),
      b: this.berries.map((b) => (b ? 1 : 0)),
      m: this.mistakes
    };
  }

  summary() {
    const starsOf = (mode) => Object.values(this.progress[mode].best).reduce((s, b) => s + b.stars, 0);
    const mode = this.activeMode();
    return {
      team: this.team, seed: this.seed, status: this.status, mode, level: this.levelIndex, code: levelCode(this.levelIndex),
      levelName: (this.status === 'lobby' ? levelsOf(mode, this.seed)[this.current[mode]] : this.level)?.name,
      levelTip: (this.status === 'lobby' ? levelsOf(mode, this.seed)[this.current[mode]] : this.level)?.tip,   // 선생님 화면에만
      current: this.current[mode], unlocked: this.progress[mode].unlocked,
      stars: starsOf(mode), starsTeam: starsOf('team'), starsDuo: starsOf('duo'), total: levelsOf(mode).length,
      time: this.status === 'playing' ? Math.floor(this.clock / 1000) : 0, mistakes: this.mistakes || 0,
      roster: this.roster(), progress: this.progress
    };
  }
}
