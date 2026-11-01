// 학생 30명 동시 접속 부하 시험: node scripts/load-30.mjs [주소]
import { io } from 'socket.io-client';
const URL = process.argv[2] || 'http://localhost:3100';
const N = 30;
const t = io(URL);
const code = await new Promise((r) => t.emit('teacher:create', null, (res) => r(res.code)));
const kids = [];
for (let i = 0; i < N; i++) {
  const s = io(URL, { forceNew: true });
  const res = await new Promise((r) => s.emit('student:join', { code, name: `학생${i + 1}`, team: (i % 8) + 1 }, r));
  if (!res.ok) throw new Error(res.err);
  s.states = 0; s.bytes = 0;
  s.on('state', (st) => { s.states++; s.bytes += JSON.stringify(st).length; });
  kids.push(s);
}
t.emit('teacher:startAll');
const timer = setInterval(() => kids.forEach((s) => s.emit('input', { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, a: Math.random() < 0.5 })), 50);
await new Promise((r) => setTimeout(r, 5000));
clearInterval(timer);
const rate = kids.map((s) => s.states / 5);
const kb = kids.reduce((a, s) => a + s.bytes, 0) / 5 / 1024;
console.log(`학생 ${N}명, 모둠 8개`);
console.log(`학생 1명이 받는 상태: 초당 ${Math.min(...rate).toFixed(1)}~${Math.max(...rate).toFixed(1)}회 (목표 20)`);
console.log(`서버가 보내는 전체 양: 초당 약 ${kb.toFixed(0)}KB → 40분 수업 약 ${(kb * 2400 / 1024).toFixed(0)}MB`);
kids.forEach((s) => s.close()); t.close();
process.exit(0);
