import { RULES, FIELD, COLORS, COLOR_NAMES, ANIMALS, TEAM_MAX } from '../shared/constants.js';
import { levelsOf, modeFor, levelCode } from '../shared/missions.js';
import { analyzeLevel, crateNeed } from '../shared/solver.js';
import { makeVariant } from '../shared/variant.js';
import {
  hazardPos, teamPlatePositions, circleRectPush, rectsOverlap, inRect, distToRect, clamp, homeRect, thornRect
} from '../shared/geometry.js';

const parCache = new Map();
function parOf(mode, i, n) {
  const key = `${mode}:${i}:${n}`;
  if (!parCache.has(key)) parCache.set(key, analyzeLevel(levelsOf(mode)[i], n).par || 60);
  return parCache.get(key);
}
const emptyProgress = () => ({ unlocked: 0, best: {} });

// 그림 암호 만들기: 그림 발판 중에서 len개를 겹치지 않게 골라 순서 정하기 (도전할 때마다 바뀜)
function newCode(spec) {
  const syms = spec.pads.map((p) => p.sym);
  for (let i = syms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [syms[i], syms[j]] = [syms[j], syms[i]]; }
  // owner: 오두막 얼굴 발판을 먼저 밟은 친구(pid), sealed: 그 친구가 오두막에 들어가 문이 닫힘 (그 단계 끝까지)
  return { seq: syms.slice(0, Math.min(spec.len, syms.length)), got: 0, reader: false, on: spec.pads.map(() => false), nagAt: 0, owner: null, sealed: false };
}
const pumpkinRect = (p) => ({ x: p.x, y: p.y, w: p.r * 1.6, h: p.r * 1.6 });

// 한 모둠(짝 2명 또는 모둠 3~5명, 선생님이 함께하면 +1)의 게임. 물리 계산은 모두 서버에서만 함
export default class TeamGame {
  constructor(team, emit) {
    this.team = team;
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
    return { mode, unlocked: pr.unlocked, best: pr.best, current: this.current[mode], total: levelsOf(mode).length };
  }

  setProgress(saved) {
    if (!saved) return;
    // 예전 형식({unlocked,best})은 모둠 미션 기록으로
    const src = 'unlocked' in saved ? { team: saved } : saved;
    for (const mode of ['team', 'duo']) {
      const pr = src[mode];
      if (!pr) continue;
      const max = levelsOf(mode).length - 1;
      this.progress[mode] = { unlocked: clamp(+pr.unlocked || 0, 0, max), best: pr.best || {} };
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
  get levels() { return levelsOf(this.mode); }
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
    this.lv = makeVariant(this.levels[i], Math.max(1, this.players.size), Math.floor(Math.random() * 2 ** 31));
    const L = this.level;
    this.gateOpen = L.gates.map(() => false);
    this.berries = L.berries.map(() => false);
    this.crate = { x: L.crate.x, y: L.crate.y, vx: 0, vy: 0, moving: false, grabbers: 0 };
    this.pumpkins = L.pumpkins.map((p) => ({ ...p }));
    this.leverOn = false;
    this.bridgeOn = false;
    this.codes = L.gates.map((g) => (g.plates.type === 'code' ? newCode(g.plates) : null));
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
      return b && !(cd.owner === p.pid && !cd.sealed) ? [b.door] : [];
    });
  }

  stepBooths(players) {
    this.level.gates.forEach((g, i) => {
      const b = g.plates.booth, cd = this.codes[i];
      if (!b) return;
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
      if (g.plates.type === 'crate') {
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
      name: L.name, world: L.world, tip: L.tip, par: parOf(this.mode, this.levelIndex, Math.max(1, this.players.size)),
      field: FIELD, start: L.start, home: L.home, walls: L.walls,
      gates: L.gates.map((g, i) => ({
        door: g.door, open: this.gateOpen[i], type: g.plates.type,
        code: g.plates.type === 'code' ? { sign: g.plates.sign, pads: g.plates.pads, len: this.codes[i].seq.length, booth: g.plates.booth } : undefined
      })),
      levers: L.levers, bridges: L.bridges, swamps: L.swamps, swampCells: L.swampCells, lookouts: L.lookouts,
      plates: this.plates.map(({ gate, type, x, y, color }) => ({ gate, type, x, y, color })),
      water: L.water, thorns: L.thorns, streams: L.streams, ice: L.ice, mud: L.mud,
      movers: L.movers.map(({ kind, r, w, h }) => ({ kind, r, w, h })),
      pumpkins: this.pumpkins.map(({ x, y, r }) => ({ x: Math.round(x), y: Math.round(y), r })),
      berries: L.berries, crate: { weight: L.crate.weight, need: this.need() },
      best: this.progress[this.mode].best[this.levelIndex] || null, roster: this.roster(),
      geo: L   // 이번 변형 전체 (로봇 시연이 길찾기에 씀)
    };
  }

  // ---------- 결과 화면에서 고르기 ----------
  choose(pid, choice) {
    if (!this.players.has(pid) || this.status !== 'result') return;
    if (choice === 'retry') this.loadLevel(this.levelIndex);
    else if (choice === 'next' && this.levelIndex + 1 < this.levels.length) this.loadLevel(this.levelIndex + 1);
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
    return [...L.water, ...L.swampCells, ...(this.bridgeOn ? [] : L.bridges)];
  }
  activeStreams() { return this.level.streams.filter((s) => !(s.lever && this.leverOn)); }

  closedDoors() { return this.level.gates.filter((_, i) => !this.gateOpen[i]).map((g) => g.door); }
  // 바구니를 막는 것 (호박 포함)
  crateSolids(skipPumpkin) {
    const L = this.level;
    return [...L.walls, ...this.water(), ...L.thorns.map(thornRect), ...this.closedDoors(),
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

    // 4) 동물 이동 + 충돌 + 물살
    const solids = [...L.walls, ...this.closedDoors()];
    const crateNow = { x: c.x, y: c.y, w: half * 2, h: half * 2 };
    for (const p of players) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      // 물살: 바구니를 잡고 있는 친구는 바구니를 붙잡고 있어서 떠내려가지 않음
      for (const s of this.activeStreams()) {
        if (inRect(p.x, p.y, s) && (s.strong || !grabbers.includes(p))) { p.x += s.vx * dt; p.y += s.vy * dt; }
      }
      for (let it = 0; it < 2; it++) {
        for (const r of [...solids, crateNow, ...this.boothDoorsFor(p)]) {
          const push = circleRectPush(p.x, p.y, RULES.playerR, r);
          if (push) { p.x += push.x; p.y += push.y; }
        }
        for (const pk of this.pumpkins) {
          const dx = p.x - pk.x, dy = p.y - pk.y, d = Math.hypot(dx, dy) || 1, over = pk.r + RULES.playerR - d;
          if (over > 0) { p.x += (dx / d) * over; p.y += (dy / d) * over; }
        }
        p.x = clamp(p.x, RULES.playerR, FIELD.w - RULES.playerR);
        p.y = clamp(p.y, RULES.playerR, FIELD.h - RULES.playerR);
      }
    }

    this.stepBooths(players);

    // 5) 위험한 곳에 닿으면 → 처음 자리로 (벌칙)
    for (const p of players) {
      if (now < p.safeUntil) continue;
      let cause = null;
      if (L.swampCells.some((w) => inRect(p.x, p.y, w))) cause = 'swamp';
      else if (this.water().some((w) => inRect(p.x, p.y, w))) cause = 'water';
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
        if (cd.got >= cd.seq.length) { this.gateOpen[gi] = true; this.emit('fx', { type: 'door', gate: gi }); }
      } else {
        cd.got = 0;
        this.emit('fx', { type: 'codeWrong', gate: gi });
      }
    });
  }

  moveCrate(dt) {
    const c = this.crate, half = RULES.crateHalf;
    // 센 물살: 바구니도 떠내려감. 물(연못)에 빠지면 바구니가 처음 자리로
    for (const s of this.activeStreams()) {
      if (!s.strong || !inRect(c.x, c.y, s)) continue;
      const hard = [...this.level.walls, ...this.closedDoors()];
      const nx = clamp(c.x + s.vx * dt, half, FIELD.w - half), ny = clamp(c.y + s.vy * dt, half, FIELD.h - half);
      if (!hard.some((w) => rectsOverlap({ x: nx, y: ny, w: half * 2, h: half * 2 }, w))) { c.x = nx; c.y = ny; }
    }
    if (this.water().some((w) => inRect(c.x, c.y, w))) {
      const at = { x: Math.round(c.x), y: Math.round(c.y) };
      Object.assign(c, { x: this.level.crate.x, y: this.level.crate.y, vx: 0, vy: 0 });
      this.mistakes++;
      this.emit('fx', { type: 'crateSplash', ...at });
      return;
    }
    const solids = this.crateSolids();
    const blocked = (x, y) => {
      if (x - half < 0 || x + half > FIELD.w || y - half < 0 || y + half > FIELD.h) return true;
      const r = { x, y, w: half * 2, h: half * 2 };
      return solids.some((s) => rectsOverlap(r, s));
    };
    if (!blocked(c.x + c.vx * dt, c.y)) c.x += c.vx * dt;
    if (!blocked(c.x, c.y + c.vy * dt)) c.y += c.vy * dt;
  }

  // 호박을 (dx,dy)만큼 밀기: 울타리·바구니·맵 끝에 막히면 그만큼만
  movePumpkin(pk, dx, dy) {
    const L = this.level;
    const solids = [...L.walls, ...this.closedDoors(), { x: this.crate.x, y: this.crate.y, w: RULES.crateHalf * 2, h: RULES.crateHalf * 2 },
      ...this.pumpkins.filter((o) => o !== pk).map(pumpkinRect)];
    const free = (x, y) => x - pk.r >= 0 && x + pk.r <= FIELD.w && y - pk.r >= 0 && y + pk.r <= FIELD.h &&
      !solids.some((s) => circleRectPush(x, y, pk.r * 0.8, s));
    if (free(pk.x + dx, pk.y)) pk.x += dx;
    if (free(pk.x, pk.y + dy)) pk.y += dy;
  }

  finishLevel() {
    const i = this.levelIndex, mode = this.mode;
    const pr = this.progress[mode];
    const time = Math.round(this.clock);
    const par = parOf(mode, i, Math.max(1, this.players.size));
    const allBerries = this.berries.every(Boolean);
    const stars = 1 + (allBerries ? 1 : 0) + (time <= par * 1000 ? 1 : 0);
    const prev = pr.best[i];
    const newBest = !prev || stars > prev.stars || (stars === prev.stars && time < prev.time);
    if (newBest) pr.best[i] = { stars: Math.max(stars, prev?.stars || 0), time: Math.min(time, prev?.time ?? Infinity) };
    pr.unlocked = Math.max(pr.unlocked, Math.min(i + 1, this.levels.length - 1));
    this.status = 'result';
    this.resultAt = this.clock + RULES.resultMs;
    const last = i + 1 >= this.levels.length;
    this.result = {
      mode, index: i, code: levelCode(i), name: this.level.name, stars, time, par, mistakes: this.mistakes,
      berries: this.berries.filter(Boolean).length, newBest, best: pr.best[i], last, autoMs: RULES.resultMs
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
      cd: this.codes.map((c) => (c ? [c.seq, c.got, c.reader ? 1 : 0, this.players.get(c.owner)?.slot ?? -1, c.sealed ? 1 : 0] : null)),
      b: this.berries.map((b) => (b ? 1 : 0)),
      m: this.mistakes
    };
  }

  summary() {
    const starsOf = (mode) => Object.values(this.progress[mode].best).reduce((s, b) => s + b.stars, 0);
    const mode = this.activeMode();
    return {
      team: this.team, status: this.status, mode, level: this.levelIndex, code: levelCode(this.levelIndex),
      levelName: (this.status === 'lobby' ? levelsOf(mode)[this.current[mode]] : this.level)?.name,
      levelTip: (this.status === 'lobby' ? levelsOf(mode)[this.current[mode]] : this.level)?.tip,   // 선생님 화면에만
      current: this.current[mode], unlocked: this.progress[mode].unlocked,
      stars: starsOf(mode), starsTeam: starsOf('team'), starsDuo: starsOf('duo'), total: levelsOf(mode).length,
      time: this.status === 'playing' ? Math.floor(this.clock / 1000) : 0, mistakes: this.mistakes || 0,
      roster: this.roster(), progress: this.progress
    };
  }
}
