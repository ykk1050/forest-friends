import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io } from 'socket.io-client';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3197;

test('이상한 값을 보내도 서버가 멈추지 않음', async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  try {
    await new Promise((resolve, reject) => {
      srv.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) resolve(); });
      srv.on('exit', (c) => reject(new Error(`서버가 꺼짐 ${c}`)));
      setTimeout(() => reject(new Error('서버가 안 켜짐')), 8000);
    });
    const s = io(`http://localhost:${PORT}`, { forceNew: true });
    await new Promise((r) => s.on('connect', r));
    const events = ['teacher:resume', 'teacher:startTeam', 'teacher:setLevel', 'teacher:lobbyTeam', 'student:join', 'watch',
      'input', 'teacher:restore', 'student:animal', 'team:choice', 'teacher:kick', 'teacher:noise', 'teacher:bgm'];
    for (const ev of events) for (const bad of [null, 5, 'x', undefined]) s.emit(ev, bad);
    s.emit('teacher:resume', null, () => {});
    s.emit('watch', () => {});
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(srv.exitCode, null, '서버가 꺼지면 안 됨');
    // 그 뒤에도 정상으로 방을 만들 수 있어야 함
    const res = await new Promise((r, reject) => {
      s.emit('teacher:create', null, r);
      setTimeout(() => reject(new Error('서버가 응답하지 않음')), 3000);
    });
    assert.match(res.code, /^\d{4}$/);
    s.close();
  } finally {
    srv.kill();
  }
});

test('한 기기가 다른 방에 들어가면 예전 방에서 빠짐 (두 방 화면이 섞이지 않음)', async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT + 1) }, stdio: 'pipe' });
  try {
    await new Promise((resolve, reject) => {
      srv.stdout.on('data', (d) => { if (String(d).includes(String(PORT + 1))) resolve(); });
      setTimeout(() => reject(new Error('서버가 안 켜짐')), 8000);
    });
    const U = `http://localhost:${PORT + 1}`;
    const t = io(U, { forceNew: true }); await new Promise((r) => t.on('connect', r));
    const A = await new Promise((r) => t.emit('teacher:create', null, r));
    const B = await new Promise((r) => t.emit('teacher:create', null, r));
    const s = io(U, { forceNew: true }); await new Promise((r) => s.on('connect', r));
    const ra = await new Promise((r) => s.emit('student:join', { code: A.code, name: 'a', team: 1 }, r));
    const rb = await new Promise((r) => s.emit('student:join', { code: B.code, name: 'a', team: 1 }, r));
    assert.ok(ra.ok && rb.ok);
    // 방 A만 시작 → 이 기기에는 A의 상태가 오면 안 됨
    let fromA = 0;
    s.on('state', () => { fromA++; });
    const tA = io(U, { forceNew: true }); await new Promise((r) => tA.on('connect', r));
    await new Promise((r) => tA.emit('teacher:resume', { code: A.code, token: A.token }, r));
    tA.emit('teacher:startTeam', { team: 1, level: 0 });
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(fromA, 0, '예전 방 상태가 섞여 들어옴');
    s.close(); t.close(); tA.close();
  } finally {
    srv.kill();
  }
});
