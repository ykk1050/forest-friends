import { TEAM_RECOMMENDED, ANIMALS, TEACHER_ANIMAL } from '/shared/constants.js';
import { levelsOf, levelCode } from '/shared/missions.js';

const $ = (id) => document.getElementById(id);
const socket = io();
const KEY = 'ffm-teacher';
const REC_KEY = 'ffm-class-records';   // { 학급이름: { 모둠번호: { unlocked, best } } }
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const STATUS = { lobby: '대기실', playing: '플레이 중', result: '단계 성공!', finished: '🏆 모든 단계 완료' };
const emojiOf = (id) => (id === 'owl' ? TEACHER_ANIMAL.emoji : ANIMALS.find((a) => a.id === id)?.emoji || '🐾');

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

let session = load(KEY, null);    // { code, token, className }
let lastTeams = [];
const openSelect = new Set();     // 선생님이 고르는 중인 드롭다운은 다시 그리지 않음
const openTips = new Set();       // 펼쳐 둔 힌트는 1초마다 다시 그려도 펼친 채로

$('class-name').value = session?.className || '';
$('class-name').addEventListener('change', () => {
  session = { ...session, className: $('class-name').value.trim() };
  save(KEY, session);
  restoreRecords();
});

function records() { return load(REC_KEY, {}); }
function className() { return $('class-name').value.trim() || '기본'; }
function restoreRecords() { socket.emit('teacher:restore', records()[className()] || {}); }

function setRoom(code) {
  $('code').textContent = code;
  $('url').textContent = `${location.host}  (방 코드 ${code})`;
  document.title = `방 ${code} · 숲속 친구들 대작전`;
}

function createRoom() {
  socket.emit('teacher:create', null, ({ code, token }) => {
    session = { code, token, className: $('class-name').value.trim() };
    save(KEY, session);
    setRoom(code);
    restoreRecords();
  });
}

// 새로고침해도 같은 방을 이어서 관리
socket.on('connect', () => {
  if (!session?.code) return createRoom();
  socket.emit('teacher:resume', session, (res) => (res.ok ? setRoom(res.code) : createRoom()));
});

$('start-all').onclick = () => socket.emit('teacher:startAll');
$('lobby-all').onclick = () => { if (confirm('모든 모둠을 대기실로 보낼까요? (별·기록은 그대로예요)')) socket.emit('teacher:lobby'); };
$('unlock-all').onclick = () => { if (confirm('모든 모둠이 36단계 모두를 고를 수 있게 열까요?')) socket.emit('teacher:unlockAll'); };
$('reset-records').onclick = () => {
  if (!confirm(`'${className()}' 학급의 모든 모둠 별·기록을 지우고 1-1부터 다시 시작할까요?
(게임 중인 모둠은 대기실로 돌아가요. 지운 기록은 되돌릴 수 없어요.)`)) return;
  const rec = records();
  delete rec[className()];
  save(REC_KEY, rec);
  socket.emit('teacher:resetRecords');
};
$('new-room').onclick = () => { if (confirm('새 방을 만들면 지금 방 코드는 더 이상 쓰지 않아요. 만들까요?')) createRoom(); };

const MODE_TAG = { team: '👨‍👩‍👧 모둠 미션', duo: '👫 짝 미션' };
const levelOptions = (mode, unlocked, current) => levelsOf(mode).map((lv, i) =>
  `<option value="${i}" ${i === current ? 'selected' : ''}>${levelCode(i)} ${lv.name}${i > unlocked ? ' 🔒' : ''}</option>`).join('');

socket.on('room', ({ teams }) => {
  lastTeams = teams;
  // 학급 기록 저장 (이 컴퓨터에)
  const rec = records();
  // progress = { team: {unlocked, best}, duo: {unlocked, best} }
  const played = (t) => Object.values(t.progress).some((pr) => Object.keys(pr.best || {}).length || pr.unlocked);
  rec[className()] = Object.fromEntries(teams.filter(played).map((t) => [t.team, t.progress]));
  save(REC_KEY, rec);

  const people = teams.reduce((n, t) => n + t.roster.filter((r) => !r.isTeacher).length, 0);
  $('t-stat').textContent = `접속 학생 ${people}명 · 모둠 ${teams.filter((t) => t.roster.length).length}개`;

  // 1초마다 카드를 새로 만들면 화면이 깜빡이므로, 바뀐 카드만 새로 그리고 시계는 글자만 바꿈
  // (고르는 중인 드롭다운이 있는 카드는 그대로 둠 — 갈아 끼우면 드롭다운이 닫혀 버림)
  const grid = $('teams');
  const code = $('code').textContent;
  const cards = teams.map((t) => {
    const prev = grid.querySelector(`.t-team[data-team="${t.team}"]`);
    const sig = JSON.stringify([{ ...t, time: 0 }, code, openTips.has(t.team)]);
    if (prev && (openSelect.has(t.team) || prev.dataset.sig === sig)) {
      const clock = prev.querySelector('.clock');
      if (clock) clock.textContent = fmt(t.time);
      return prev;
    }
    const el = document.createElement('div');
    el.dataset.sig = sig;
    const n = t.roster.length;
    const students = t.roster.filter((r) => !r.isTeacher).length;
    const hasTeacher = t.roster.some((r) => r.isTeacher);
    el.dataset.team = t.team;
    el.className = `t-team ${n ? t.status : 'empty'}`;
    const playingInfo = t.status === 'playing' || t.status === 'result'
      ? `${t.code} ${t.levelName} · ⏱ <span class="clock">${fmt(t.time)}</span> · 💥 ${t.mistakes}` : `다음: ${levelCode(t.current)} ${t.levelName}`;
    el.innerHTML = `
      <h3><span>${t.team}모둠</span><span class="st">${n ? STATUS[t.status] : '비어 있음'}</span></h3>
      ${n ? `<div class="info"><b>${MODE_TAG[t.mode]}</b> · ${playingInfo}</div>` : ''}
      ${n && t.levelTip ? `<details class="tip" ${openTips.has(t.team) ? 'open' : ''}><summary>💡 막히면 줄 힌트</summary>${t.levelTip}</details>` : ''}
      <div class="info">⭐ 모둠 ${t.starsTeam}/${t.total * 3} · 짝 ${t.starsDuo}/${t.total * 3} · 열린 단계 ${t.unlocked + 1}/${t.total}</div>
      <div class="members"></div>
      ${n && students < TEAM_RECOMMENDED ? `<div class="warn">⚠ 학생 ${students}명 — 3~5명이 알맞아요</div>` : ''}
      <div class="row">
        <select class="lv-select">${levelOptions(t.mode, t.unlocked, t.current)}</select>
        ${n ? '<button class="one go start-one">▶ 이 단계로 시작</button>' : ''}
      </div>
      <div class="row">
        <a class="one" target="_blank" href="/?watch=${code}&team=${t.team}">👀 구경하기</a>
        ${hasTeacher ? '' : `<a class="one" target="_blank" href="/?code=${code}&team=${t.team}&teacher=${session?.token || ''}">🦉 함께하기</a>`}
      </div>`;
    const box = el.querySelector('.members');
    t.roster.forEach((r) => {
      const c = document.createElement('span');
      c.className = 'chip' + (r.connected ? '' : ' off');
      c.style.borderColor = r.color;
      c.textContent = `${emojiOf(r.animal)} ${r.name}${r.connected ? '' : ' (끊김)'}`;
      c.title = '눌러서 모둠에서 내보내기';
      c.onclick = () => { if (confirm(`${r.name}을(를) 모둠에서 내보낼까요?`)) socket.emit('teacher:kick', r.pid); };
      box.appendChild(c);
    });
    el.querySelector('details.tip')?.addEventListener('toggle', (e) => {
      if (e.target.open) openTips.add(t.team); else openTips.delete(t.team);
    });
    const sel = el.querySelector('.lv-select');
    sel.addEventListener('focus', () => openSelect.add(t.team));
    sel.addEventListener('blur', () => openSelect.delete(t.team));
    sel.addEventListener('change', () => { socket.emit('teacher:setLevel', { team: t.team, level: +sel.value }); openSelect.delete(t.team); sel.blur(); });
    el.querySelector('.start-one')?.addEventListener('click', () => socket.emit('teacher:startTeam', { team: t.team, level: +sel.value }));
    return el;
  });
  cards.forEach((el, i) => {
    const prev = grid.querySelector(`.t-team[data-team="${el.dataset.team}"]`);
    if (prev === el) { if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null); }
    else if (prev) prev.replaceWith(el);
    else grid.insertBefore(el, grid.children[i] || null);
  });
  [...grid.children].filter((el) => !cards.includes(el)).forEach((el) => el.remove());

  const total = (t) => t.starsTeam + t.starsDuo;
  const ranked = teams.filter((t) => total(t)).sort((a, b) => total(b) - total(a));
  $('rank').classList.toggle('hidden', !ranked.length);
  const rankHtml = '<h2>🏆 별 순위</h2>' + ranked
    .map((t, i) => `<div>${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${t.team}모둠 — ⭐ ${total(t)}개 (모둠 ${t.starsTeam} · 짝 ${t.starsDuo})</div>`).join('');
  if ($('rank').innerHTML !== rankHtml) $('rank').innerHTML = rankHtml;
});
