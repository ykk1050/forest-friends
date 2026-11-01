import * as THREE from 'three';

// 귀여운 동물(큰 머리·볼터치·짧은 팔다리)을 도형으로 직접 만듭니다. 외부 모델 파일 없음 → 저작권 걱정 없음
// 앞쪽 = +x 방향. 키는 약 1.4 (바닥 1칸 = 1)

// 만화 같은 3단 명암
const gradient = (() => {
  const data = new Uint8Array([90, 180, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();
const matCache = new Map();
export function toon(color) {
  const key = color instanceof THREE.Color ? color.getHexString() : String(color);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient }));
  return matCache.get(key);
}
const flat = (color) => new THREE.MeshBasicMaterial({ color });

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
function ball(mat, r, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(sphereGeo, mat);
  m.scale.set(r * sx, r * sy, r * sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cone(mat, r, h, x, y, z) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const PALETTE = {
  bear: { body: 0xa8754b, belly: 0xedd2a8, ear: 0xedd2a8, dark: 0x3b2618 },
  rabbit: { body: 0xfaf6f0, belly: 0xffffff, ear: 0xffb3c7, dark: 0x3b2a2a },
  fox: { body: 0xf28c38, belly: 0xfff4e6, ear: 0x3b2618, dark: 0x2a1a10 },
  panda: { body: 0xfbfbfb, belly: 0xffffff, ear: 0x222222, dark: 0x1a1a1a },
  penguin: { body: 0x2f3a5c, belly: 0xffffff, ear: 0xffa726, dark: 0x111111 },
  owl: { body: 0x8d6e63, belly: 0xf3e0c7, ear: 0x5d4037, dark: 0x1a1a1a }
};

// kind: bear|rabbit|fox|panda|penguin|owl, scarf: 목도리 색(자리 색)
export function makeAnimal(kind, scarf = '#29b6f6') {
  const P = PALETTE[kind] || PALETTE.bear;
  const body = toon(P.body), belly = toon(P.belly), dark = toon(P.dark), ear = toon(P.ear);
  const root = new THREE.Group();     // 위치·방향
  const bob = new THREE.Group();      // 걷기 들썩임
  root.add(bob);

  // 몸통
  const torso = new THREE.Group();
  bob.add(torso);
  torso.add(ball(kind === 'panda' ? dark : body, 0.36, 0, 0.5, 0, 1, 1.05, 1));
  torso.add(ball(belly, 0.27, 0.14, 0.47, 0, 0.75, 0.95, 0.95));

  // 머리 (크게!)
  const head = new THREE.Group();
  head.position.y = 1.08;
  bob.add(head);
  head.add(ball(body, 0.46, 0, 0, 0, 1, 0.92, 1));

  // 눈 + 반짝임
  const eyeY = kind === 'owl' ? 0.05 : 0.02;
  for (const z of [-0.17, 0.17]) {
    if (kind === 'panda') head.add(ball(dark, 0.12, 0.36, eyeY - 0.01, z * 1.05, 0.5, 1.15, 0.9));
    if (kind === 'owl') head.add(ball(belly, 0.16, 0.33, eyeY, z * 1.15, 0.5, 1, 1));
    const eye = ball(flat(0x1b1b1b), kind === 'owl' ? 0.09 : 0.075, 0.41, eyeY, z * (kind === 'owl' ? 1.15 : 1), 0.6, 1.1, 1);
    eye.castShadow = false;
    head.add(eye);
    const shine = ball(flat(0xffffff), 0.027, 0.46, eyeY + 0.035, z * (kind === 'owl' ? 1.15 : 1) - 0.02);
    shine.castShadow = false;
    head.add(shine);
    // 볼터치
    if (kind !== 'owl') {
      const blush = ball(new THREE.MeshBasicMaterial({ color: 0xff8fab, transparent: true, opacity: 0.75 }), 0.07, 0.37, -0.1, z * 1.55, 0.35, 0.6, 1);
      blush.castShadow = false;
      head.add(blush);
    }
  }

  // 동물마다 다른 부분 (귀·코·꼬리)
  const ears = new THREE.Group();
  head.add(ears);
  let tail = null;
  if (kind === 'bear' || kind === 'panda') {
    for (const z of [-0.3, 0.3]) {
      ears.add(ball(kind === 'panda' ? dark : body, 0.15, -0.05, 0.37, z));
      if (kind === 'bear') ears.add(ball(ear, 0.08, 0.03, 0.37, z));
    }
    head.add(ball(kind === 'bear' ? belly : belly, 0.17, 0.33, -0.1, 0, 0.7, 0.62, 0.9));
    head.add(ball(flat(0x222222), 0.055, 0.45, -0.05, 0, 0.8, 0.7, 1));
    tail = ball(kind === 'panda' ? dark : body, 0.1, -0.36, 0.42, 0);
  } else if (kind === 'rabbit') {
    for (const z of [-0.14, 0.14]) {
      const e = new THREE.Group();
      e.position.set(-0.05, 0.32, z);
      e.rotation.x = z > 0 ? 0.18 : -0.18;
      e.add(ball(body, 0.1, 0, 0.27, 0, 1, 2.8, 0.75));
      e.add(ball(ear, 0.06, 0.04, 0.27, 0, 0.6, 2.4, 0.6));
      ears.add(e);
    }
    head.add(ball(flat(0xff7aa2), 0.04, 0.45, -0.07, 0));
    tail = ball(belly, 0.13, -0.37, 0.4, 0);
  } else if (kind === 'fox') {
    for (const z of [-0.24, 0.24]) {
      const e = cone(body, 0.13, 0.32, -0.02, 0.45, z);
      e.rotation.x = z > 0 ? 0.25 : -0.25;
      ears.add(e);
      const tip = cone(ear, 0.07, 0.13, -0.02, 0.58, z * 1.12);
      tip.rotation.x = e.rotation.x;
      ears.add(tip);
    }
    const snout = cone(belly, 0.16, 0.32, 0.45, -0.1, 0);
    snout.rotation.z = -Math.PI / 2;
    head.add(snout);
    head.add(ball(flat(0x222222), 0.045, 0.62, -0.1, 0));
    head.add(ball(belly, 0.3, 0.12, -0.2, 0, 0.9, 0.5, 1.2));
    tail = new THREE.Group();
    tail.position.set(-0.38, 0.45, 0);
    tail.add(ball(body, 0.17, -0.18, 0.12, 0, 1.6, 0.9, 0.9));
    tail.add(ball(belly, 0.11, -0.42, 0.2, 0, 1, 0.9, 0.9));
  } else if (kind === 'penguin') {
    head.add(ball(belly, 0.36, 0.14, -0.04, 0, 0.75, 0.85, 1));
    const beak = cone(ear, 0.08, 0.2, 0.52, -0.08, 0);
    beak.rotation.z = -Math.PI / 2;
    head.add(beak);
  } else if (kind === 'owl') {
    for (const z of [-0.27, 0.27]) {
      const tuft = cone(ear, 0.09, 0.25, -0.02, 0.42, z);
      tuft.rotation.x = z > 0 ? 0.35 : -0.35;
      ears.add(tuft);
    }
    const beak = cone(toon(0xffb300), 0.06, 0.16, 0.5, -0.08, 0);
    beak.rotation.z = -Math.PI / 2;
    head.add(beak);
    // 선생님 학사모
    const cap = new THREE.Group();
    cap.position.y = 0.42;
    cap.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 16), toon(0x263238)));
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), toon(0x263238));
    board.position.y = 0.08;
    board.rotation.y = Math.PI / 4;
    cap.add(board);
    cap.add(ball(toon(0xffca28), 0.05, 0.22, 0.08, 0.22));
    head.add(cap);
  }
  if (tail) bob.add(tail);

  // 팔(앞발·날개)
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group();
    a.position.set(0.06, 0.62, s * 0.33);
    const isWing = kind === 'penguin' || kind === 'owl';
    a.add(ball(kind === 'panda' ? dark : body, isWing ? 0.11 : 0.1, 0.05, -0.12, 0, isWing ? 0.6 : 1, isWing ? 2.2 : 1.6, 1));
    bob.add(a);
    return a;
  });

  // 발
  const feetMat = kind === 'penguin' ? toon(0xffa726) : kind === 'panda' ? dark : kind === 'owl' ? toon(0xffb300) : body;
  const feet = [-1, 1].map((s) => {
    const f = ball(feetMat, 0.12, 0.05, 0.08, s * 0.17, 1.4, 0.7, 1);
    root.add(f);
    return f;
  });

  // 목도리 (자리 색) — 누가 누군지 한눈에
  const scarfMat = toon(new THREE.Color(scarf));
  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.075, 8, 20), scarfMat);
  scarfRing.rotation.x = Math.PI / 2;
  scarfRing.position.y = 0.8;
  bob.add(scarfRing);
  const scarfTail = ball(scarfMat, 0.08, -0.25, 0.68, 0.16, 0.6, 1.6, 0.8);
  bob.add(scarfTail);

  let phase = Math.random() * 10;
  return {
    root,
    // speed: 0~1 (걷는 빠르기), grab: 잡기 중인지
    animate(dt, speed, grab, t) {
      phase += dt * (6 + speed * 8);
      const walk = Math.min(1, speed * 1.5);
      bob.position.y = Math.abs(Math.sin(phase)) * 0.09 * walk + Math.sin(t * 2.4) * 0.012;
      bob.rotation.x = Math.sin(phase) * 0.09 * walk;         // 뒤뚱뒤뚱
      head.rotation.x = Math.sin(t * 1.7) * 0.04;
      feet.forEach((f, i) => { f.position.x = 0.05 + Math.sin(phase + i * Math.PI) * 0.13 * walk; f.position.y = 0.08 + Math.max(0, Math.sin(phase + i * Math.PI)) * 0.06 * walk; });
      arms.forEach((a, i) => {
        if (grab) { a.rotation.z = 1.35; a.position.x = 0.22; }   // 두 팔을 앞으로 쭉
        else { a.rotation.z = Math.sin(phase + i * Math.PI) * 0.5 * walk; a.position.x = 0.06; }
      });
      ears.rotation.x = Math.sin(t * 3 + 1) * 0.05;
      if (tail) tail.rotation.y = Math.sin(t * 5) * 0.25;
    }
  };
}
