// 외부 음원 파일 없이 Web Audio로 만드는 효과음 → 저작권 걱정 없음
let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freqs, dur = 0.12, type = 'square', vol = 0.08) {
  const a = ac(); if (!a) return;
  freqs.forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain();
    const t = a.currentTime + i * dur;
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur);
  });
}
// BGM도 같은 소리 장치를 씀 (아이패드에서 첫 터치 한 번으로 함께 켜지게)
export const audioContext = () => ctx || ac();

export const Sfx = {
  unlock: () => ac(),   // 아이패드는 첫 터치 때 소리를 켜야 함
  join: () => tone([523, 784], 0.08),
  stun: () => tone([400, 300, 200], 0.1, 'sawtooth'),
  revive: () => tone([523, 659, 784, 1047], 0.07, 'triangle', 0.12),
  plate: () => tone([880], 0.05, 'sine'),
  door: () => tone([392, 523, 659], 0.12, 'triangle', 0.12),
  clear: () => tone([523, 659, 784, 1047, 784, 1047], 0.1, 'triangle', 0.12)
};
