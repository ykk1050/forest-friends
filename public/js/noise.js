// 선생님 화면의 소음 감지: 마이크 소리 크기만 이 컴퓨터에서 재고, 소리를 녹음하거나 서버로 보내지 않음

// 소리 세기(RMS, 0~1) → 화면에 보여 줄 크기(0~100). -60dB = 0, 0dB = 100
export function levelFromRms(rms) {
  if (rms <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((20 * Math.log10(rms) + 60) / 60 * 100)));
}

// 기준을 넘는 소리가 holdMs 동안 이어져야 경고 (박수·물건 떨어지는 소리 한 번으로는 울리지 않게)
export class NoiseGate {
  constructor(holdMs = 2000) {
    this.holdMs = holdMs;
    this.reset();
  }

  reset() { this.since = null; this.lastOver = null; this.lastFeed = null; }

  feed(level, limit, now) {
    // 잠깐 작아져도 이어진 소리로 봄. 다른 탭을 보고 있어 측정 간격이 벌어지면 그만큼 더 너그럽게
    const gap = Math.max(600, this.lastFeed == null ? 0 : (now - this.lastFeed) * 1.5);
    this.lastFeed = now;
    if (level < limit) {
      if (this.lastOver != null && now - this.lastOver > gap) this.since = null;
      return false;
    }
    if (this.since == null || now - this.lastOver > gap) this.since = now;
    this.lastOver = now;
    return now - this.since >= this.holdMs;
  }
}

// 마이크를 켜고 0.1초마다 onLevel(크기)를 부름. 돌려주는 함수를 부르면 마이크를 끔
export async function startMic(onLevel) {
  // 자동 음량 조절을 끄지 않으면 큰 소리도 작게 줄어들어 소음을 잴 수 없음
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
  });
  const ctx = new AudioContext();
  await ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    onLevel(levelFromRms(Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)));
  }, 100);
  return () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}
