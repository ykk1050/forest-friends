import World3D from './World3D.js';
import Controls from './Controls.js';
import { Sfx } from './sfx.js';
import { TEAM_COUNT, TEAM_RECOMMENDED, ANIMALS, TEACHER_ANIMAL, WORLDS } from '/shared/constants.js';
import { MODES, levelsOf, levelCode } from '/shared/missions.js';
import Minimap from './Minimap.js';
import { SYMBOLS } from '/shared/levelkit.js';
import { RULES } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);
const socket = io();
const SAVE_KEY = 'ffm-session';
const emojiOf = (id) => (id === 'owl' ? TEACHER_ANIMAL.emoji : ANIMALS.find((a) => a.id === id)?.emoji || '🐾');

let me = null;          // { code, pid, team, slot, name, watch?, teacherToken? }
let roster = [];
let progress = { mode: 'team', unlocked: 0, best: {}, current: 0 };
const minimap = new Minimap($('minimap'));
const modeTag = (mode) => (mode === 'duo' ? '👫 짝' : '👨‍👩‍👧 모둠');
let world = null;
let controls = null;
let level = null;
let pickedTeam = null;
let lastSnap = null;
let resultTimer = null;

const store = {
  get() { try { return JSON.parse(sessionStorage.getItem(SAVE_KEY)); } catch { return null; } },
  set(v) { try { v ? sessionStorage.setItem(SAVE_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SAVE_KEY); } catch { /* 저장 불가 */ } }
};
const lowQuality = () => { try { return localStorage.getItem('ffm-low') === '1'; } catch { return false; } };
// 카메라: 학생은 '따라가기'가 기본, 구경하기는 '맵 전체'
const savedCam = () => { try { return localStorage.getItem('ffm-cam'); } catch { return null; } };
function setCam(mode) {
  const m = me?.watch ? 'overview' : mode;
  world?.setCamMode(m);
  document.body.classList.toggle('overview', m === 'overview');
  $('cam-btn').textContent = m === 'follow' ? '🗺️' : '🎥';
  $('cam-btn').title = m === 'follow' ? '맵 전체 보기 (C)' : '내 동물 따라가기 (C)';
  try { if (!me?.watch) localStorage.setItem('ffm-cam', m); } catch { /* 저장 불가 */ }
}
const toggleCam = () => setCam(world?.camMode === 'follow' ? 'overview' : 'follow');
// 화면 돌리기: 기본은 꺼짐(북쪽 고정). 설정에서 켠 기기만 돌릴 수 있음
const savedRotate = () => { try { return localStorage.getItem('ffm-rotate') === '1'; } catch { return false; } };
function setRotate(on) {
  world?.setRotate(on);
  document.body.classList.toggle('north', !on);
  $('rotate-toggle').checked = on;
  try { localStorage.setItem('ffm-rotate', on ? '1' : '0'); } catch { /* 저장 불가 */ }
}
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function show(id) {
  ['join', 'wait', 'game', 'done'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  document.body.classList.toggle('playing', id === 'game');
}

// ---------- 참가 화면 ----------
const params = new URLSearchParams(location.search);
$('code').value = params.get('code') || '';
for (let t = 1; t <= TEAM_COUNT; t++) {
  const b = document.createElement('button');
  b.textContent = `${t}모둠`;
  b.onclick = () => { pickedTeam = t; [...$('teams').children].forEach((c) => c.classList.toggle('on', c === b)); };
  $('teams').appendChild(b);
}

$('join-btn').onclick = () => {
  Sfx.unlock();
  const code = $('code').value.trim(), name = $('name').value.trim();
  if (!/^\d{4}$/.test(code)) return ($('join-err').textContent = '방 코드 숫자 4개를 넣어 주세요.');
  if (!name) return ($('join-err').textContent = '이름을 적어 주세요.');
  if (!pickedTeam) return ($('join-err').textContent = '우리 모둠 번호를 눌러 주세요.');
  join({ code, name, team: pickedTeam });
};

let rejoinTries = 0;
function join(info) {
  socket.emit('student:join', info, (res) => {
    if (!res.ok) {
      // 서버가 다시 켜지는 중이면 선생님 화면이 방을 다시 열 때까지 기다렸다가 자동으로 다시 들어감
      if (info.pid && res.noRoom && (rejoinTries = (rejoinTries || 0) + 1) <= 200) {
        $('offline').textContent = '서버가 다시 켜지는 중이에요… 잠시만 기다려 주세요 📡';
        $('offline').classList.remove('hidden');
        setTimeout(() => socket.connected && join(info), 3000);
        return;
      }
      if (info.pid) { store.set(null); me = null; show('join'); }
      $('join-err').textContent = res.err;
      return;
    }
    rejoinTries = 0;
    $('offline').classList.add('hidden');
    me = { ...info, pid: res.pid, team: res.team, slot: res.slot, name: res.name, isTeacher: res.isTeacher };
    store.set(me);
    $('join-err').textContent = '';
    if (res.status === 'lobby') showWait();   // 게임 중이면 곧 'level'이 옴
    Sfx.join();
  });
}

// ---------- 모둠 대기실 ----------
function showWait() {
  if (!me) return;
  level = null;
  $('result').classList.add('hidden');
  show('wait');
  $('wait-title').textContent = me.watch ? `👀 ${me.team}모둠 구경하기` : `${me.team}모둠 대기실`;
  renderModeLine();
  renderRoster();
  renderMap();
}

$('leave-btn').onclick = () => {
  socket.emit('student:leave');
  store.set(null);
  me = null; level = null;
  show('join');
};

function renderAnimalPick() {
  const box = $('animal-pick');
  const mine = roster.find((r) => r.pid === me?.pid);
  box.classList.toggle('hidden', !mine || mine.isTeacher || !!me.watch);
  $('leave-btn').classList.toggle('hidden', !!me?.watch || !!mine?.isTeacher);
  if (!mine || mine.isTeacher) return;
  box.replaceChildren(...ANIMALS.map((a) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="e">${a.emoji}</span>${a.name}`;
    b.classList.toggle('on', mine.animal === a.id);
    b.onclick = () => socket.emit('student:animal', a.id);
    return b;
  }));
}

function chip(r) {
  const el = document.createElement('span');
  el.className = 'chip' + (r.connected ? '' : ' off');
  el.style.borderColor = r.color;
  el.textContent = `${emojiOf(r.animal)} ${r.name}${r.slot === me?.slot && !me.watch ? ' (나)' : ''}`;
  el.dataset.slot = r.slot;
  return el;
}

function renderRoster() {
  const mine = roster.find((r) => r.pid === me?.pid);
  if (mine) {
    me.slot = mine.slot;
    document.documentElement.style.setProperty('--me', mine.color);
  }
  $('wait-roster').replaceChildren(...roster.map(chip));
  $('hud-roster').replaceChildren(...roster.map(chip));
  const students = roster.filter((r) => !r.isTeacher).length;
  const short = TEAM_RECOMMENDED - students;
  if (short > 0) $('wait-roster').insertAdjacentHTML('beforeend', `<div style="width:100%;color:#8a7a66">친구가 ${short}명 더 오면 딱 좋아요 (3~5명)</div>`);
  renderAnimalPick();
}

function renderModeLine() {
  if ($('wait').classList.contains('hidden')) return;
  const m = MODES[progress.mode] || MODES.team;
  $('wait-msg').innerHTML = (me?.watch ? '모둠이 시작하면 화면이 나와요' : '선생님이 시작하면 출발해요! 🚀') +
    `<br><small>지금은 ${modeTag(progress.mode)} 미션 (${m.short === '짝' ? '학생 2명' : '학생 3~5명'})</small>`;
}

function renderMap() {
  const levels = levelsOf(progress.mode);
  renderModeLine();
  $('map').replaceChildren(...WORLDS.map((w, wi) => {
    const box = document.createElement('div');
    box.className = 'world';
    box.innerHTML = `<h4>${w.emoji} ${w.name}</h4><div class="lv"></div>`;
    for (let k = 0; k < 6; k++) {
      const i = wi * 6 + k;
      const best = progress.best?.[i];
      const el = document.createElement('div');
      const locked = i > progress.unlocked;
      el.className = 'lvbox' + (best ? ' done' : locked ? ' lock' : ' open') + (i === progress.current ? ' cur' : '');
      el.title = levels[i].name;
      el.innerHTML = `${levelCode(i)}<small>${locked ? '🔒' : best ? '⭐'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '☆☆☆'}</small>`;
      box.querySelector('.lv').appendChild(el);
    }
    return box;
  }));
}

// ---------- 게임 화면 ----------
function ensureWorld() {
  if (world) return;
  world = new World3D($('view'), { low: lowQuality() });
  controls = new Controls({
    moveZone: $('stick-zone'), moveBase: $('stick-base'), moveKnob: $('stick-knob'),
    lookZone: $('look-zone'), lookBase: $('look-base'), lookKnob: $('look-knob'),
    grabBtn: $('grab-btn'), onCamToggle: toggleCam
  });
  setCam(savedCam() || 'follow');
  setRotate(savedRotate());
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const c = controls.get();
    world.look(c.look.x, c.look.y, dt);
    world.render(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // 내 조작을 1초에 20번 서버로 (따라가기 카메라면 '화면 위 = 내가 보는 쪽'으로 바꿔서)
  setInterval(() => {
    if (!me || !level || me.watch) return;
    const c = controls.get();
    const w = world.moveToWorld(c.move.x, c.move.y);
    socket.volatile.emit('input', { x: +w.x.toFixed(2), y: +w.y.toFixed(2), a: c.a });
  }, 50);
}

function banner(text, ms = 1800) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(banner.t);
  banner.t = setTimeout(() => b.classList.add('hidden'), ms);
}

// 잠깐 보여 주는 알림 (무슨 일이 일어났는지만. 푸는 방법은 알려 주지 않음)
function say(text, ms = 2500) {
  $('hud-msg').textContent = text;
  clearTimeout(say.t);
  if (ms) say.t = setTimeout(() => { $('hud-msg').textContent = ''; }, ms);
}

// 화면 맨 위에는 최종 목표만: "🎯 수박을 🏠 우리 집에 갖다 놓아라!"
const particle = (word) => { const c = word.charCodeAt(word.length - 1) - 0xac00; return c >= 0 && c % 28 ? '을' : '를'; };
function goalText(info) {
  const item = WORLDS[info.world]?.crate || '바구니';
  return `🎯 ${item}${particle(item)} 🏠 우리 집에 갖다 놓아라!`;
}

socket.on('roster', (list) => {
  roster = list;
  renderRoster();
  if (world && level) world.setRoster(roster, me?.slot);
});

socket.on('progress', (p) => { progress = p; renderMap(); });

socket.on('level', (info) => {
  if (!me) return;
  const isNew = !level || level.index !== info.index || $('result').offsetParent !== null;
  level = info;
  roster = info.roster;
  renderRoster();
  show('game');
  ensureWorld();
  world.buildLevel(info, me.watch ? -1 : me.slot);
  minimap.setLevel(info);
  $('hud-level').textContent = `${modeTag(info.mode)} ${info.code} ${info.name}`;
  if (isNew) {
    $('result').classList.add('hidden');
    clearInterval(resultTimer);
    banner(`${info.code} ${info.name}`, 2000);
    $('hud-goal').textContent = goalText(info);
    say('', 0);
  }
});

socket.on('state', (s) => {
  if (!world || !level) return;
  lastSnap = s;
  world.applyState(s);
  if (world.camMode === 'follow') minimap.draw(s, me?.slot, world.canRotate ? world.yaw : null, roster, world.isLookout);
  showPuzzlePanels(s);
  const over = s.t > level.par;
  $('hud-time').textContent = `⏱ ${fmt(s.t)} / 🎯${fmt(level.par)}`;
  $('hud-time').classList.toggle('over', over);
  $('hud-berry').textContent = `🍓 ${s.b.reduce((a, b) => a + b, 0)}/3`;
  $('hud-miss').textContent = `💥 ${s.m}`;
});

// 오두막에 들어간 친구(와 구경하는 선생님)에게만 암호를 보여 줌. 망루 위 친구에게는 안내
function showPuzzlePanels(s) {
  const mine = s.p.find((p) => p[0] === me?.slot);
  let codeShown = false;
  level.gates.forEach((gate, i) => {
    if (!gate.code || !s.cd?.[i] || s.g[i] || codeShown) return;
    const atSign = me?.watch || (mine && s.cd[i][3] === me.slot && Math.hypot(mine[1] - gate.code.sign.x, mine[2] - gate.code.sign.y) < RULES.signR);
    if (!atSign) return;
    const [seq, got] = s.cd[i];
    $('code-seq').innerHTML = seq.map((sym, k) => `<span class="${k < got ? 'done' : ''}">${SYMBOLS[sym]}</span>`).join(' → ');
    codeShown = true;
  });
  $('code-panel').classList.toggle('hidden', !codeShown);
}

const OOPS = { swamp: '풍덩! 안개 늪에 빠졌어요', water: '풍덩! 물에 빠졌어요', bee: '앗 따가워! 꿀벌에 쏘였어요', thorn: '아야! 가시덤불이에요', log: '쿵! 통나무에 부딪혔어요', snowball: '쿵! 눈덩이에 부딪혔어요' };

socket.on('fx', (fx) => {
  if (!world) return;
  switch (fx.type) {
    case 'plate': Sfx.plate(); break;
    case 'door':
      if (fx.hold) { Sfx.plate(); break; }
      Sfx.door();
      banner('🔓 문이 열렸어요!', 1400);
      break;
    case 'doorClose': Sfx.stun(); break;
    case 'leverOn': Sfx.plate(); break;
    case 'leverOff': Sfx.stun(); break;
    case 'codeOk': Sfx.plate(); say('🔢 딩동!', 1200); break;
    case 'codeWrong': Sfx.stun(); say('🔢 땡!', 1500); break;
    case 'codeNoReader': Sfx.stun(); break;
    case 'boothClaim': case 'boothSeal': {
      Sfx.plate();
      const who = fx.slot === me?.slot && !me.watch ? '내가' : `${roster.find((r) => r.slot === fx.slot)?.name || '친구'}이(가)`;
      say(fx.type === 'boothClaim' ? `🔢 ${who} 암호 오두막을 맡았어요! 오두막으로 들어가요` : `🔢 ${who} 오두막에 들어갔어요. 이제 못 나와요, 암호를 읽어 주세요!`, 2500);
      break;
    }
    case 'boothOpen': Sfx.plate(); say('🔓 암호를 맞혔어요! 오두막 문이 열렸어요', 2500); break;
    case 'crateSplash': world.poof(fx.x, fx.y, 'water'); Sfx.stun(); say('풍덩! 바구니가 처음 자리로 돌아갔어요', 3000); break;
    case 'pumpkinSplash': world.poof(fx.x, fx.y, 'water'); Sfx.stun(); say('풍덩! 호박이 처음 자리로 돌아갔어요', 3000); break;
    case 'oops': {
      world.poof(fx.x, fx.y, fx.cause);
      const who = roster.find((r) => r.slot === fx.slot);
      if (fx.slot === me?.slot && !me.watch) { Sfx.stun(); say(`${OOPS[fx.cause] || '앗!'} → 처음 자리로!`, 2500); }
      else say(`${who ? who.name : '친구'}: ${OOPS[fx.cause] || '앗!'} → 처음 자리로!`, 2500);
      break;
    }
    case 'berry':
      Sfx.revive();
      world.hearts(fx.slot);
      break;
    case 'clear':
      Sfx.clear();
      world.confetti();
      break;
  }
});

socket.on('result', (r) => {
  if (!r) return;
  $('res-title').textContent = `${modeTag(r.mode)} ${r.code} ${r.name} 성공!`;
  $('res-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}" style="animation-delay:${0.3 + i * 0.25}s">⭐</span>`).join('');
  $('res-new').classList.toggle('hidden', !r.newBest);
  $('res-time').textContent = fmt(Math.round(r.time / 1000));
  $('res-par').textContent = fmt(r.par);
  $('res-berry').textContent = `${r.berries} / 3`;
  $('res-miss').textContent = `${r.mistakes}번`;
  $('res-next').classList.toggle('hidden', r.last);
  $('result').classList.remove('hidden');
  let left = Math.round(r.autoMs / 1000);
  const tickText = () => { $('res-next').textContent = r.last ? '' : `▶ 다음 단계 (${left})`; };
  tickText();
  clearInterval(resultTimer);
  resultTimer = setInterval(() => { left = Math.max(0, left - 1); tickText(); }, 1000);
});

$('res-next').onclick = () => socket.emit('team:choice', 'next');

socket.on('finished', (p) => {
  progress = p;
  const stars = Object.values(p.best || {}).reduce((s, b) => s + b.stars, 0);
  $('done-stars').textContent = `${MODES[p.mode]?.name || ''} 모은 별 ⭐ ${stars} / ${p.total * 3}`;
  if (me?.watch) { say('🏆 모든 단계 완료!', 0); return; }
  setTimeout(() => { level = null; show('done'); }, 3000);
});

socket.on('lobby', (p) => { progress = p; showWait(); });
socket.on('kicked', () => {
  store.set(null); me = null; level = null;
  show('join');
  $('join-err').textContent = '선생님이 모둠을 다시 고르라고 했어요.';
});

// ---------- 연결 끊김 · 새로고침 복구 ----------
socket.on('disconnect', () => {
  $('offline').textContent = '연결이 끊겼어요… 다시 연결하는 중 📡';
  $('offline').classList.remove('hidden');
});
socket.on('connect', () => {
  $('offline').classList.add('hidden');
  if (me?.watch) return socket.emit('watch', { code: me.code, team: me.team });
  const saved = me || store.get();
  if (saved) join({ code: saved.code, name: saved.name, team: saved.team, pid: saved.pid, teacherToken: saved.teacherToken });
});

// ---------- 화면 도구 ----------
$('cam-btn').onclick = toggleCam;
$('quality-btn').onclick = () => {
  const low = !lowQuality();
  try { localStorage.setItem('ffm-low', low ? '1' : '0'); } catch { /* 저장 불가 */ }
  alert(low ? '가벼운 화질로 바꿔요. (느린 기기용)' : '고운 화질로 바꿔요.');
  location.reload();
};
$('quality-btn').textContent = lowQuality() ? '🐢' : '✨';
$('settings-btn').onclick = () => $('settings').classList.remove('hidden');
$('settings-close').onclick = () => $('settings').classList.add('hidden');
$('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('settings').classList.add('hidden'); });
$('rotate-toggle').addEventListener('change', (e) => setRotate(e.target.checked));
document.body.classList.toggle('north', !savedRotate());

const root = document.documentElement;
const requestFs = root.requestFullscreen || root.webkitRequestFullscreen;
if (!requestFs) $('fs-btn').style.display = 'none';
$('fs-btn').onclick = () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else requestFs.call(root);
};
document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- 시작: 구경하기 / 선생님 함께하기 / 새로고침 복귀 / 처음 참가 ----------
if (params.get('watch')) {
  // ?watch=방코드&team=모둠 → 자리 없이 그 모둠 화면만 보기
  me = { watch: true, code: params.get('watch'), team: +params.get('team') || 1, slot: -1 };
  document.body.classList.add('watching');
  showWait();
} else if (params.get('teacher') && params.get('code') && params.get('team')) {
  // 선생님 화면의 [함께하기] → 부엉이 선생님으로 바로 참가
  const saved = store.get();
  me = saved && saved.isTeacher && saved.team === +params.get('team') ? saved
    : { code: params.get('code'), team: +params.get('team'), name: '선생님', teacherToken: params.get('teacher') };
  history.replaceState(null, '', '/');   // 주소창에 비밀 열쇠가 남지 않게
  store.set(me);
  show('wait');
} else {
  const resume = store.get();
  if (resume) { me = resume; showWait(); } else show('join');
}
