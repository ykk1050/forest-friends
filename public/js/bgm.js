// BGM 연주 장치: bgm-tracks.js의 악보를 Web Audio로 연주 (음원 파일이 없어 전송량이 거의 없음)
import { TRACKS, chordInfo, noteFreq, expandTrack, barSeconds } from './bgm-tracks.js';
import { audioContext } from './sfx.js';

const VOL_KEY = 'ffm-bgm-vol';
const LOOKAHEAD = 1.6;       // 초. 탭이 잠깐 느려져도 끊기지 않게 미리 예약
const MASTER = 0.42;         // 음량 100%일 때 최대 크기 (효과음이 묻히지 않게 낮게)

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// 소리 하나: 오실레이터 + 음량 변화
function voice(ctx, out, { freq, type = 'sine', at, attack = 0.01, hold = 0, release = 0.2, vol = 0.1, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  if (hold > 0) g.gain.setValueAtTime(vol, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + attack + hold + release + 0.02);
}

// 악기
const LEAD = {
  flute: (c, o, f, at, dur, v) => {
    voice(c, o, { freq: f, type: 'triangle', at, attack: 0.04, hold: Math.max(0, dur - 0.1), release: 0.14, vol: 0.2 * v });
    voice(c, o, { freq: f * 2, at, attack: 0.05, hold: Math.max(0, dur - 0.12), release: 0.1, vol: 0.03 * v });
  },
  mallet: (c, o, f, at, dur, v) => {
    voice(c, o, { freq: f, at, attack: 0.004, release: 0.55, vol: 0.26 * v });
    voice(c, o, { freq: f * 4, at, attack: 0.002, release: 0.09, vol: 0.05 * v });
  },
  pluck: (c, o, f, at, dur, v) => voice(c, o, { freq: f, type: 'triangle', at, attack: 0.004, release: 0.26, vol: 0.25 * v }),
  bell: (c, o, f, at, dur, v) => {
    voice(c, o, { freq: f, at, attack: 0.004, release: 1.3, vol: 0.2 * v });
    voice(c, o, { freq: f * 2.76, at, attack: 0.002, release: 0.45, vol: 0.035 * v });
  }
};

function shaker(ctx, out, at, vol) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
  s.buffer = noise(ctx);
  hp.type = 'highpass'; hp.frequency.value = 6000;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  s.connect(hp).connect(g).connect(out);
  s.start(at); s.stop(at + 0.07);
}

function softKick(ctx, out, at, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(110, at);
  o.frequency.exponentialRampToValueAtTime(50, at + 0.09);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + 0.15);
}

// 반주: 코드 하나를 from(8분음표)부터 len만큼 채움
function comp(ctx, out, style, ch, at, from, len, e8) {
  const t = (n) => at + (from + n) * e8;
  const bass = (n, d, vol = 0.2) => voice(ctx, out, { freq: ch.bass, type: 'triangle', at: t(n), attack: 0.01, hold: d, release: 0.12, vol });
  const stab = (n, vol = 0.05) => ch.freqs.slice(0, 3).forEach((f) => voice(ctx, out, { freq: f, type: 'triangle', at: t(n), attack: 0.005, release: 0.2, vol }));
  for (let n = 0; n < len; n++) {
    const beat = n + from;
    if (style === 'bounce') { if (beat % 4 === 0) bass(n, e8 * 0.8); if (beat % 4 === 2) stab(n); }
    else if (style === 'arp') {
      if (beat % 8 === 0) bass(n, e8 * 3, 0.16);
      voice(ctx, out, { freq: ch.freqs[[0, 1, 2, 1][beat % 4]] * 2, at: t(n), attack: 0.006, release: 0.34, vol: 0.055 });
    } else if (style === 'pick') {
      if (beat % 4 === 0) bass(n, e8 * 0.6, 0.18);
      if (beat % 2 === 1) voice(ctx, out, { freq: ch.freqs[(beat >> 1) % 3], type: 'triangle', at: t(n), attack: 0.004, release: 0.12, vol: 0.05 });
    } else if (style === 'waltz') {
      if (beat % 6 === 0) bass(n, e8 * 1.2, 0.15);
      if (beat % 6 === 2 || beat % 6 === 4) stab(n, 0.03);
    } else if (style === 'strum') {
      if (beat % 8 === 0) bass(n, e8 * 3, 0.17);
      if (beat % 4 === 0) ch.freqs.slice(0, 3).forEach((f, i) => voice(ctx, out, { freq: f, type: 'triangle', at: t(n) + i * 0.025, attack: 0.006, release: 0.7, vol: 0.05 }));
    } else if (style === 'pad') {
      if (n === 0) {
        const d = len * e8;
        ch.freqs.slice(0, 3).forEach((f) => {
          voice(ctx, out, { freq: f, at: t(0), attack: d * 0.3, hold: d * 0.5, release: d * 0.3, vol: 0.035, detune: -4 });
          voice(ctx, out, { freq: f, at: t(0), attack: d * 0.3, hold: d * 0.5, release: d * 0.3, vol: 0.035, detune: 4 });
        });
        voice(ctx, out, { freq: ch.bass, at: t(0), attack: 0.2, hold: d * 0.6, release: d * 0.3, vol: 0.09 });
      }
    }
  }
}

// 한 마디 연주를 예약 (실시간 재생·소리 크기 검사가 함께 씀)
export function scheduleBar(ctx, out, track, bar, at) {
  const e8 = 60 / track.bpm / 2;
  const leadVol = track.quiet ? 0.75 : 1;
  for (const n of bar.notes) {
    const f = noteFreq(n.name), start = at + n.at * e8, dur = n.len * e8 * 0.92;
    LEAD[track.lead](ctx, out, f, start, dur, leadVol);
    if (bar.double) voice(ctx, out, { freq: f * 2, at: start, attack: 0.006, release: 0.4, vol: 0.05 * leadVol });
  }
  const total = track.beats * 2, per = total / bar.chords.length;
  if (track.comp !== 'none') bar.chords.forEach((c, i) => comp(ctx, out, track.comp, chordInfo(c), at, i * per, per, e8));
  for (let n = 0; n < total; n++) {
    const t = at + n * e8;
    if (track.perc === 'shaker') shaker(ctx, out, t, n % 2 ? 0.05 : 0.025);
    if (track.perc === 'soft') { if (n % 8 === 0) softKick(ctx, out, t, 0.12); if (n % 4 === 2) shaker(ctx, out, t, 0.03); }
  }
}

// 출력단: 높은 소리를 살짝 줄이고 큰 소리를 눌러 귀에 편하게
export function outputChain(ctx, dest) {
  const lp = ctx.createBiquadFilter(), comp2 = ctx.createDynamicsCompressor();
  lp.type = 'lowpass'; lp.frequency.value = 5200;
  lp.connect(comp2).connect(dest);
  return lp;
}

export const Bgm = {
  id: null,
  on: null,            // 지금 연주 { track, bars, gain, next, index, startedAt }
  timer: null,
  allowed: true,       // 선생님이 끄면 false
  volume: 0.5,

  init() {
    try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 1) this.volume = v; } catch { /* 저장 불가 */ }
    document.addEventListener('visibilitychange', () => {
      const ctx = audioContext();
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
  },

  level() { return this.allowed ? this.volume * MASTER : 0; },

  applyVolume() {
    const ctx = audioContext();
    if (ctx && this.master) this.master.gain.setTargetAtTime(this.level(), ctx.currentTime, 0.05);
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch { /* 저장 불가 */ }
    this.applyVolume();
  },

  setAllowed(on) { this.allowed = !!on; this.applyVolume(); },

  // 같은 곡이 이미 나오고 있으면 그대로 둠 (이어 듣기). 다른 곡이면 부드럽게 바꿈
  play(id) {
    if (this.id === id) return;
    this.stop();
    this.id = id;
    const track = TRACKS[id];
    if (!track) return;
    const ctx = audioContext();
    if (!ctx) return;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.level();
      this.master.connect(outputChain(ctx, ctx.destination));
    }
    const gain = ctx.createGain();
    gain.gain.value = track.gain || 1;
    gain.connect(this.master);
    this.on = { track, bars: expandTrack(track), gain, index: 0, next: 0 };
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 200);
    this.pump();
  },

  pump() {
    const ctx = audioContext(), on = this.on;
    if (!ctx || !on || ctx.state !== 'running') return;   // 첫 터치 전이면 기다림
    if (!on.next) { on.next = ctx.currentTime + 0.12; on.startedAt = on.next; }
    if (on.next < ctx.currentTime) on.next = ctx.currentTime + 0.05;   // 오래 멈췄다 돌아온 경우
    const secs = barSeconds(on.track);
    while (on.next < ctx.currentTime + LOOKAHEAD) {
      if (on.index >= on.bars.length) {
        if (!on.track.loop) { this.on = null; clearInterval(this.timer); return; }
        on.index = 0;
      }
      scheduleBar(ctx, on.gain, on.track, on.bars[on.index], on.next);
      on.index++;
      on.next += secs;
    }
  },

  // 지금 곡의 몇 초째인지 (들어 보기 페이지용)
  position() {
    const ctx = audioContext(), on = this.on;
    return ctx && on?.startedAt ? Math.max(0, ctx.currentTime - on.startedAt) : 0;
  },

  stop() {
    clearInterval(this.timer);
    const ctx = audioContext(), on = this.on;
    this.id = null; this.on = null;
    if (ctx && on) {
      on.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      setTimeout(() => on.gain.disconnect(), 2500);
    }
  }
};
