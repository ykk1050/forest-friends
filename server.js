import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import Room from './server/Room.js';
import { TICK_HZ } from './shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3100;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.get('/health', (_req, res) => res.send('ok'));   // 수업 전 서버 깨우기용

const server = http.createServer(app);
// 응답 기다리는 시간을 넉넉히: 무거운 3D 화면·학교 와이파이에서 잠깐 늦어도 끊지 않음
const io = new Server(server, { pingInterval: 25000, pingTimeout: 30000 });

const rooms = new Map(); // code → Room

function newCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

const cleanName = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 8) || '친구';
const roomOf = (code) => rooms.get(String(code ?? '').trim());

io.on('connection', (socket) => {
  // ----- 선생님 -----
  socket.on('teacher:create', (_, cb) => {
    const room = new Room(io, newCode());
    rooms.set(room.code, room);
    socket.data.teacherOf = room.code;
    socket.join(room.teacherChannel);
    cb?.({ code: room.code, token: room.token, seed: room.seed });
  });

  socket.on('teacher:resume', ({ code, token, seed } = {}, cb) => {
    let room = roomOf(code), recreated = false;
    // 서버가 다시 켜져(Render 재시작·잠듦) 방이 사라졌으면 같은 코드로 다시 열어 학생들이 그대로 돌아올 수 있게
    if (!room && /^\d{4}$/.test(String(code)) && typeof token === 'string' && token) {
      room = new Room(io, String(code), token, Number.isInteger(seed) && seed >= 0 ? seed : undefined);
      rooms.set(room.code, room);
      recreated = true;
    }
    if (!room || room.token !== token) return cb?.({ ok: false });
    socket.data.teacherOf = room.code;
    socket.join(room.teacherChannel);
    cb?.({ ok: true, code: room.code, recreated, seed: room.seed });
  });

  const teacherRoom = () => rooms.get(socket.data.teacherOf);
  socket.on('teacher:startAll', () => teacherRoom()?.startAll());
  socket.on('teacher:startTeam', ({ team, level } = {}) => teacherRoom()?.startTeam(+team, level == null ? null : +level));
  socket.on('teacher:setLevel', ({ team, level } = {}) => teacherRoom()?.setLevel(+team, +level));
  socket.on('teacher:unlockAll', () => teacherRoom()?.unlockAll());
  socket.on('teacher:resetRecords', () => teacherRoom()?.resetRecords());
  socket.on('teacher:lobby', () => teacherRoom()?.lobbyAll());
  socket.on('teacher:lobbyTeam', ({ team } = {}) => teacherRoom()?.lobbyTeam(+team));
  socket.on('teacher:restore', (progress) => teacherRoom()?.restore(progress));
  socket.on('teacher:kick', (pid) => teacherRoom()?.leave(String(pid), true));

  // ----- 학생 (선생님이 함께하기도 여기로) -----
  socket.on('student:join', ({ code, name, team, pid, teacherToken } = {}, cb) => {
    const room = roomOf(code);
    if (!room) return cb?.({ ok: false, noRoom: true, err: '방 코드를 찾을 수 없어요. 선생님 화면의 숫자를 확인해 주세요.' });
    const res = room.join(socket, { name: cleanName(name), team: +team, pid: pid ? String(pid) : null, teacherToken });
    if (res.ok) { socket.data.room = room.code; socket.data.pid = res.pid; }
    cb?.(res);
    if (res.ok) room.sync(socket, res.team);
  });

  socket.on('watch', ({ code, team } = {}, cb) => {
    const room = roomOf(code);
    const ok = !!room && room.watch(socket, +team);   // cb?.(…) 안에 넣으면 cb가 없을 때 실행조차 안 됨
    cb?.({ ok });
  });

  const myRoom = () => rooms.get(socket.data.room);
  socket.on('input', (inp) => myRoom()?.input(socket.data.pid, inp));
  socket.on('student:animal', (animal) => myRoom()?.setAnimal(socket.data.pid, String(animal)));
  socket.on('team:choice', (choice) => myRoom()?.choose(socket.data.pid, String(choice)));

  socket.on('student:leave', () => {
    myRoom()?.leave(socket.data.pid);
    socket.data.room = null;
  });

  socket.on('disconnect', () => myRoom()?.disconnect(socket.data.pid));
});

// 게임 시계: 모든 반·모둠을 1초에 TICK_HZ번 계산하고 상태를 보냄
const dt = 1 / TICK_HZ;
setInterval(() => { for (const r of rooms.values()) r.tick(dt); }, 1000 / TICK_HZ);

// 선생님 상황판은 1초에 한 번
setInterval(() => {
  for (const r of rooms.values()) io.to(r.teacherChannel).emit('room', r.summary());
}, 1000);

// 3시간 동안 아무 일 없는 방은 정리 (메모리 절약)
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const busy = r.members.size > 0 || io.sockets.adapter.rooms.get(r.teacherChannel)?.size;
    if (busy) r.lastActive = now;
    else if (now - r.lastActive > 3 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 60_000);

server.listen(PORT, () => console.log(`숲속 친구들 대작전 서버: http://localhost:${PORT}`));
