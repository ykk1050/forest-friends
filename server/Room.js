import crypto from 'node:crypto';
import TeamGame from './TeamGame.js';
import { TEAM_COUNT } from '../shared/constants.js';

const RECONNECT_GRACE_MS = 60_000;   // 연결이 끊겨도 1분 안에 돌아오면 같은 자리로

// 선생님 한 명이 연 '반'. 그 안에 모둠(TeamGame)이 여러 개
export default class Room {
  constructor(io, code) {
    this.io = io;
    this.code = code;
    this.token = crypto.randomBytes(12).toString('hex');
    this.members = new Map();  // pid → { team, socketId, leaveTimer, isTeacher }
    this.teams = Array.from({ length: TEAM_COUNT }, (_, i) =>
      new TeamGame(i + 1, (ev, data) => io.to(this.channel(i + 1)).emit(ev, data)));
    this.lastActive = Date.now();
  }

  channel(team) { return `${this.code}:t${team}`; }
  get teacherChannel() { return `${this.code}:teacher`; }
  team(n) { return this.teams[n - 1]; }

  // 학생 참가 (teacherToken 이 맞으면 '선생님'으로 함께하기)
  join(socket, { name, team, pid, teacherToken }) {
    this.lastActive = Date.now();
    let m = pid && this.members.get(pid);
    if (m) {
      // 새로고침·잠깐 끊김 → 같은 모둠·같은 자리로 복귀
      clearTimeout(m.leaveTimer);
      m.socketId = socket.id;
      this.team(m.team).setConnected(pid, true);
    } else {
      const t = this.team(team);
      if (!t) return { ok: false, err: '모둠 번호를 다시 골라 주세요.' };
      const isTeacher = !!teacherToken && teacherToken === this.token;
      if (isTeacher && t.hasTeacher()) return { ok: false, err: '이 모둠에는 이미 선생님이 함께하고 있어요.' };
      if (!isTeacher && t.isFull()) return { ok: false, err: `${team}모둠은 자리가 꽉 찼어요. 다른 모둠을 골라 주세요.` };
      pid = crypto.randomBytes(8).toString('hex');
      m = { team, socketId: socket.id, isTeacher };
      this.members.set(pid, m);
      t.addPlayer(pid, isTeacher ? '선생님' : name, { isTeacher });
    }
    socket.join(this.channel(m.team));
    const me = this.team(m.team).players.get(pid);
    return { ok: true, pid, team: m.team, slot: me.slot, name: me.name, isTeacher: m.isTeacher, status: this.team(m.team).status };
  }

  // 참가 응답 뒤: 지금 모둠 상태에 맞춰 화면을 맞춰 줌 (관전도 같이 씀)
  sync(socket, team) {
    const game = this.team(team);
    if (!game) return;
    socket.emit('roster', game.roster());
    socket.emit('progress', game.progressInfo());
    if (game.status === 'playing') socket.emit('level', game.levelInfo());
    else if (game.status === 'result') { socket.emit('level', game.levelInfo()); socket.emit('result', game.result); }
    else if (game.status === 'finished') socket.emit('finished', game.progressInfo());
  }

  // 관전: 자리를 차지하지 않고 한 모둠의 화면만 받아 봄
  watch(socket, team) {
    if (!this.team(team)) return false;
    socket.join(this.channel(team));
    this.sync(socket, team);
    return true;
  }

  disconnect(pid) {
    const m = this.members.get(pid);
    if (!m) return;
    const game = this.team(m.team);
    game.setConnected(pid, false);
    m.leaveTimer = setTimeout(() => {
      this.members.delete(pid);
      game.removePlayer(pid);
    }, RECONNECT_GRACE_MS);
  }

  leave(pid, kicked = false) {
    const m = this.members.get(pid);
    if (!m) return;
    clearTimeout(m.leaveTimer);
    const sock = this.io.sockets.sockets.get(m.socketId);
    sock?.leave(this.channel(m.team));
    if (kicked) sock?.emit('kicked');
    this.members.delete(pid);
    this.team(m.team).removePlayer(pid);
  }

  teamOf(pid) { const m = this.members.get(pid); return m && this.team(m.team); }
  input(pid, inp) { this.teamOf(pid)?.setInput(pid, inp); }
  setAnimal(pid, animal) { this.teamOf(pid)?.setAnimal(pid, animal); }
  choose(pid, choice) { this.teamOf(pid)?.choose(pid, choice); }

  startAll() { this.teams.forEach((t) => t.size && t.start()); this.lastActive = Date.now(); }
  startTeam(n, level) { const t = this.team(n); if (!t) return; if (level != null) t.setCurrent(level); t.start(); }
  setLevel(n, level) { this.team(n)?.setCurrent(level); }
  unlockAll() { this.teams.forEach((t) => t.unlockAll()); }
  resetRecords() { this.teams.forEach((t) => t.resetProgress()); }
  lobbyAll() { this.teams.forEach((t) => t.toLobby()); }

  // 선생님 브라우저에 저장해 둔 학급 기록 되살리기 { "1": {unlocked, best}, ... }
  restore(progress) {
    if (!progress || typeof progress !== 'object') return;
    this.teams.forEach((t) => t.setProgress(progress[t.team]));
  }

  tick(dt) {
    for (const t of this.teams) {
      if (!t.size) continue;
      t.tick(dt);
      if (t.status === 'playing') this.io.to(this.channel(t.team)).volatile.emit('state', t.snapshot());
    }
  }

  summary() {
    return { code: this.code, teams: this.teams.map((t) => t.summary()) };
  }
}
