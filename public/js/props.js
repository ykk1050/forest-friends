import * as THREE from 'three';
import { toon } from './animals.js';

// 월드 테마와 소품(나무·집·바구니·장애물·딸기)을 도형으로 만듭니다.

export const THEMES = [
  { sky: 0xaee3ff, ground: 0x8fd16a, ground2: 0x84c860, outside: 0x6fb64e, wall: 0x43a047, cap: 0x66bb6a, deco: 'flowers' },
  { sky: 0xa6dcff, ground: 0x9fd57e, ground2: 0x93cb72, outside: 0x79b85c, wall: 0xa9744a, cap: 0xc99560, deco: 'reeds' },
  { sky: 0xa8dcc4, ground: 0x76b356, ground2: 0x6caa4d, outside: 0x4f8f3a, wall: 0x7b5a3c, cap: 0x9c7a55, deco: 'forest' },
  { sky: 0xdcecff, ground: 0xf4f8ff, ground2: 0xe6eef9, outside: 0xdfe9f5, wall: 0x9fd3f0, cap: 0xe1f5fe, deco: 'snow' },
  { sky: 0xffc8a2, ground: 0xd9b46c, ground2: 0xcfa960, outside: 0xb88d4c, wall: 0x9a7a5c, cap: 0xb9997a, deco: 'autumn' },
  { sky: 0xd8ccff, ground: 0x8fcfa6, ground2: 0x84c49b, outside: 0x6a9f84, wall: 0x7e57c2, cap: 0xb39ddb, deco: 'magic' }
];

const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

// 체크무늬 잔디 바닥 텍스처
export function groundTexture(c1, c2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = `#${new THREE.Color(c1).getHexString()}`; g.fillRect(0, 0, 64, 64);
  g.fillStyle = `#${new THREE.Color(c2).getHexString()}`; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(16, 9);
  return tex;
}

// 글자/이모지 텍스처 (발판 무늬·물살 화살표 등)
export function emojiTexture(text, { size = 128, bg = null, color = '#fff' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  g.font = `${size * 0.62}px 'Segoe UI Emoji','Apple Color Emoji',sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
  g.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 테두리 장식 ----------
export function makeTree(kind) {
  const g = new THREE.Group();
  if (kind === 'snow' || kind === 'forest') {
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8), toon(0x6d4c41), 0, 0.3, 0));
    const leaf = toon(kind === 'snow' ? 0x2e7d5b : 0x2e7d32);
    [[1.1, 1.0, 0.9], [0.85, 1.6, 0.8], [0.55, 2.15, 0.7]].forEach(([r, y, h]) => g.add(mesh(new THREE.ConeGeometry(r, h, 10), leaf, 0, y, 0)));
    if (kind === 'snow') g.add(mesh(new THREE.ConeGeometry(0.4, 0.35, 10), toon(0xffffff), 0, 2.45, 0));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 8), toon(0x8d6e63), 0, 0.45, 0));
    const color = kind === 'autumn' ? [0xff8f3a, 0xffb74d, 0xe65100][Math.floor(Math.random() * 3)]
      : kind === 'magic' ? [0x9575cd, 0x4fc3f7, 0xf48fb1, 0x80cbc4][Math.floor(Math.random() * 4)] : 0x5cb85c;
    g.add(mesh(new THREE.SphereGeometry(0.85, 12, 10), toon(color), 0, 1.4, 0));
    g.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), toon(color), 0.45, 1.15, 0.3));
    if (kind === 'flowers' && Math.random() < 0.5) g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(0xff5252), 0.6, 1.7, 0.4));
  }
  const s = 0.8 + Math.random() * 0.5;
  g.scale.setScalar(s);
  return g;
}

export function makeFlower() {
  const g = new THREE.Group();
  const c = [0xff80ab, 0xffeb3b, 0xffffff, 0xb388ff, 0xff8a65][Math.floor(Math.random() * 5)];
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), toon(0x388e3c), 0, 0.12, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), toon(c), Math.cos(a) * 0.08, 0.27, Math.sin(a) * 0.08));
  }
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), toon(0xffc107), 0, 0.28, 0));
  return g;
}

export function makeRock(color = 0x9e9e9e) {
  const m = mesh(new THREE.DodecahedronGeometry(0.5, 0), toon(color), 0, 0.25, 0);
  m.scale.set(1 + Math.random() * 0.6, 0.6 + Math.random() * 0.4, 1 + Math.random() * 0.4);
  m.rotation.y = Math.random() * 3;
  return m;
}

// ---------- 집 ----------
export function makeHouse(theme) {
  const g = new THREE.Group();
  const wallC = theme === 3 ? 0xffffff : 0xfff3e0;
  g.add(mesh(new THREE.BoxGeometry(2.4, 1.6, 1.8), toon(wallC), 0, 0.8, 0));
  const roof = mesh(new THREE.ConeGeometry(2.0, 1.2, 4), toon([0xe53935, 0x1e88e5, 0x8e24aa, 0x5c6bc0, 0xef6c00, 0x7e57c2][theme]), 0, 2.2, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.8);
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), toon(0x8d6e63), 0, 0.5, 0.91));
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 6), toon(0xffd54f), 0.18, 0.5, 0.95));
  for (const x of [-0.8, 0.8]) {
    g.add(mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), toon(0x81d4fa), x, 1.0, 0.91));
  }
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), toon(0x795548), 0.7, 2.6, -0.3));
  return g;
}

// ---------- 바구니 (월드마다 다른 물건) ----------
export function makeCrate(theme) {
  const g = new THREE.Group();
  if (theme === 0) { // 과일 바구니
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.75, 1.0, 16), toon(0xc68642), 0, 0.5, 0));
    const rim = mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 20), toon(0xa0522d), 0, 1.0, 0);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    [[0xff5252, 0.3, 0.2], [0xffeb3b, -0.3, 0.1], [0x8bc34a, 0, -0.35], [0xff9800, -0.1, 0.4], [0xe91e63, 0.4, -0.2]]
      .forEach(([c, x, z]) => g.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), toon(c), x, 1.15, z)));
    const handle = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 20, Math.PI), toon(0xa0522d), 0, 1.0, 0);
    g.add(handle);
  } else if (theme === 1) { // 수박
    const w = mesh(new THREE.SphereGeometry(0.95, 20, 14), toon(0x2e7d32), 0, 0.85, 0);
    w.scale.set(1, 0.85, 1);
    g.add(w);
    for (let i = 0; i < 6; i++) {
      const s = mesh(new THREE.TorusGeometry(0.95, 0.06, 4, 24, Math.PI), toon(0x1b5e20), 0, 0.85, 0);
      s.rotation.y = (i / 6) * Math.PI; s.scale.set(1, 0.85, 1);
      g.add(s);
    }
  } else if (theme === 2) { // 꿀단지
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.3, 16), toon(0xffb300), 0, 0.65, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.2, 16), toon(0x8d6e63), 0, 1.4, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.25, 16), toon(0xff8f00), 0, 1.12, 0));
    g.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), toon(0xffca28), 0.55, 1.2, 0.4));
  } else if (theme === 3) { // 선물 상자
    g.add(mesh(new THREE.BoxGeometry(1.7, 1.4, 1.7), toon(0xe53935), 0, 0.7, 0));
    g.add(mesh(new THREE.BoxGeometry(1.75, 1.42, 0.3), toon(0xffeb3b), 0, 0.7, 0));
    g.add(mesh(new THREE.BoxGeometry(0.3, 1.42, 1.75), toon(0xffeb3b), 0, 0.7, 0));
    for (const r of [0.6, -0.6]) {
      const bow = mesh(new THREE.TorusGeometry(0.25, 0.08, 6, 12), toon(0xffeb3b), 0, 1.55, 0);
      bow.rotation.y = r; g.add(bow);
    }
  } else if (theme === 5) { // 보물 상자
    g.add(mesh(new THREE.BoxGeometry(1.8, 1.0, 1.4), toon(0x8d5a2b), 0, 0.5, 0));
    const lid = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16, 1, false, 0, Math.PI), toon(0xa0662f), 0, 1.0, 0);
    lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2;
    g.add(lid);
    for (const x of [-0.6, 0.6]) {
      g.add(mesh(new THREE.BoxGeometry(0.15, 1.05, 1.45), toon(0xffc107), x, 0.5, 0));
      const band = mesh(new THREE.TorusGeometry(0.7, 0.07, 6, 16, Math.PI), toon(0xffc107), x, 1.0, 0);
      band.rotation.y = Math.PI / 2;
      g.add(band);
    }
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.35, 0.1), toon(0xffd54f), 0, 0.85, 0.72));
    g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(0x40c4ff), 0, 1.75, 0));
  } else { // 왕도토리
    const nut = mesh(new THREE.SphereGeometry(0.85, 16, 12), toon(0xc17a3a), 0, 0.85, 0);
    nut.scale.set(1, 1.1, 1);
    g.add(nut);
    g.add(mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x6d4c41), 0, 1.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 6), toon(0x5d4037), 0, 2.15, 0));
  }
  return g;
}

// ---------- 장애물 ----------
export function makeBee() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const b = mesh(new THREE.SphereGeometry(0.38, 14, 10), toon(0xffd600), 0, 0.9, 0);
  b.scale.set(1.25, 1, 1);
  body.add(b);
  for (const x of [-0.12, 0.15]) {
    const s = mesh(new THREE.TorusGeometry(0.33, 0.06, 6, 16), toon(0x212121), x, 0.9, 0);
    s.rotation.y = Math.PI / 2;
    body.add(s);
  }
  body.add(mesh(new THREE.SphereGeometry(0.06, 6, 6), toon(0x111111), 0.42, 0.98, 0.12));
  body.add(mesh(new THREE.SphereGeometry(0.06, 6, 6), toon(0x111111), 0.42, 0.98, -0.12));
  const sting = mesh(new THREE.ConeGeometry(0.07, 0.2, 6), toon(0x333333), -0.52, 0.9, 0);
  sting.rotation.z = Math.PI / 2;
  body.add(sting);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), wingMat);
    w.position.set(-0.05, 1.25, s * 0.2);
    w.rotation.x = -Math.PI / 2;
    body.add(w);
    return w;
  });
  g.userData.animate = (t) => {
    wings.forEach((w, i) => { w.rotation.x = -Math.PI / 2 + Math.sin(t * 40 + i) * 0.6 * (i ? 1 : -1); });
    body.position.y = Math.sin(t * 4) * 0.12;
  };
  return g;
}

export function makeSnowball(r) {
  const m = mesh(new THREE.IcosahedronGeometry(r, 2), toon(0xffffff), 0, r, 0);
  const g = new THREE.Group();
  g.add(m);
  g.userData.roll = m;
  return g;
}

export function makeLog(w, h) {
  // 긴 쪽을 축으로 굴러가는 통나무
  const long = Math.max(w, h), short = Math.min(w, h);
  const g = new THREE.Group();
  const log = mesh(new THREE.CylinderGeometry(short / 2, short / 2, long, 12), toon(0x8d5a3b), 0, short / 2, 0);
  if (w > h) log.rotation.z = Math.PI / 2; else log.rotation.x = Math.PI / 2;
  g.add(log);
  const ringMat = toon(0xd7a86e);
  for (const s of [-1, 1]) {
    const cap = mesh(new THREE.CircleGeometry(short / 2 - 0.02, 12), ringMat);
    if (w > h) { cap.position.set(s * long / 2 + s * 0.01, short / 2, 0); cap.rotation.y = s * Math.PI / 2; }
    else { cap.position.set(0, short / 2, s * long / 2 + s * 0.01); cap.rotation.y = s > 0 ? 0 : Math.PI; }
    g.add(cap);
  }
  g.userData.roll = log;
  g.userData.alongX = w > h;
  return g;
}

export function makeThorn(r) {
  const g = new THREE.Group();
  const leaf = toon(0x2e6b30);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(mesh(new THREE.DodecahedronGeometry(r * 0.5, 0), leaf, Math.cos(a) * r * 0.45, r * 0.45, Math.sin(a) * r * 0.45));
  }
  g.add(mesh(new THREE.DodecahedronGeometry(r * 0.55, 0), leaf, 0, r * 0.75, 0));
  const spike = toon(0xf5f5dc);
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, y = r * (0.3 + Math.random() * 0.7);
    const c = mesh(new THREE.ConeGeometry(0.05, 0.25, 4), spike, Math.cos(a) * r * 0.85, y, Math.sin(a) * r * 0.85);
    c.lookAt(Math.cos(a) * r * 3, y, Math.sin(a) * r * 3);
    c.rotateX(Math.PI / 2);
    g.add(c);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.07, 6, 6), toon(0x7b1fa2), Math.cos(a) * r * 0.7, r * 0.9, Math.sin(a) * r * 0.7));
  }
  return g;
}

// 호박: 친구들은 못 밀지만 통나무·눈덩이에 밀려 데굴데굴
export function makePumpkin(r) {
  const g = new THREE.Group();
  const roll = new THREE.Group();
  roll.position.y = r * 0.85;
  g.add(roll);
  const skin = toon(0xff8f1f);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lobe = mesh(new THREE.SphereGeometry(r * 0.55, 12, 10), skin, Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42);
    lobe.scale.set(0.8, 1.45, 0.8);
    roll.add(lobe);
  }
  roll.add(mesh(new THREE.SphereGeometry(r * 0.7, 12, 10), toon(0xff7a00), 0, 0, 0));
  const stem = mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.13, r * 0.4, 6), toon(0x5d7a2a), 0, r * 0.95, 0);
  stem.rotation.z = 0.25;
  roll.add(stem);
  const leaf = mesh(new THREE.SphereGeometry(r * 0.2, 8, 6), toon(0x66bb6a), r * 0.22, r * 0.88, 0);
  leaf.scale.set(1.4, 0.3, 0.9);
  roll.add(leaf);
  g.userData.roll = roll;
  return g;
}

export function makeStrawberry() {
  const g = new THREE.Group();
  const berry = mesh(new THREE.SphereGeometry(0.3, 12, 10), toon(0xff1744), 0, 0.55, 0);
  berry.scale.set(1, 1.2, 1);
  g.add(berry);
  const top = mesh(new THREE.ConeGeometry(0.22, 0.12, 6), toon(0x43a047), 0, 0.92, 0);
  top.rotation.x = Math.PI;
  g.add(top);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.03, 4, 4), toon(0xfff59d), Math.cos(a) * 0.29, 0.5 + (i % 2) * 0.12, Math.sin(a) * 0.29));
  }
  return g;
}

// ---------- 수수께끼 숲 소품 ----------
// 망루: 위에 올라가면(앞 발판에 서면) 안개 늪 징검다리가 보임
export function makeTower() {
  const g = new THREE.Group();
  const wood = toon(0x8d6e63);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), wood, x, 1.3, z));
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.2, 1.9), toon(0xa1887f), 0, 2.6, 0));
  const roof = mesh(new THREE.ConeGeometry(1.5, 1.0, 4), toon(0x7e57c2), 0, 3.6, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), wood, 0, 0.4 + i * 0.45, 0.75));
  const scope = mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.7, 8), toon(0xffc107), 0.4, 2.95, 0);
  scope.rotation.z = Math.PI / 2.6;
  g.add(scope);
  return g;
}

export function makeSign() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), toon(0x6d4c41), 0, 0.7, 0));
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.9, 0.12), toon(0xffe0b2), 0, 1.5, 0));
  g.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), toon(0x8d6e63), 0, 1.5, -0.04));
  return g;
}

export function makeLever() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), toon(0x78909c), 0, 0.15, 0));
  const handle = new THREE.Group();
  handle.position.y = 0.3;
  handle.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), toon(0x5d4037), 0, 0.5, 0));
  handle.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0xff5252), 0, 1.0, 0));
  handle.rotation.z = 0.6;
  g.add(handle);
  g.userData.handle = handle;
  return g;
}

// 제방: 물살을 가로질러 막는 돌·흙 둑 (across = 물살을 가로지르는 길이, 바닥 아래에서 솟아오름)
export function makeDam(across, alongX) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const thick = 0.7, h = 1.1;
  body.add(mesh(new THREE.BoxGeometry(alongX ? thick : across, h, alongX ? across : thick), toon(0x8d6e63), 0, h / 2, 0));
  body.add(mesh(new THREE.BoxGeometry(alongX ? thick + 0.12 : across + 0.1, 0.16, alongX ? across + 0.1 : thick + 0.12), toon(0x6d4c41), 0, h, 0));
  const n = Math.max(3, Math.round(across / 0.55));
  for (let i = 0; i < n; i++) {
    const t = (-0.5 + (i + 0.5) / n) * across;
    const r = 0.2 + ((i * 37) % 5) * 0.03;
    const rock = mesh(new THREE.DodecahedronGeometry(r, 0), toon(i % 2 ? 0x9e9e9e : 0xbdbdbd), alongX ? 0 : t, h + 0.1, alongX ? t : 0);
    rock.rotation.set(i, i * 2, 0);
    body.add(rock);
  }
  g.add(body);
  g.userData.body = body;
  return g;
}

export function makeBridge(w, d) {
  const g = new THREE.Group();
  const along = w < d;   // 다리가 놓이는 방향: 긴 쪽으로 건넘
  const n = Math.round((along ? d : w) / 0.45);
  for (let i = 0; i < n; i++) {
    const t = -0.5 + (i + 0.5) / n;
    const plank = mesh(new THREE.BoxGeometry(along ? w * 1.05 : (w / n) * 0.85, 0.12, along ? (d / n) * 0.85 : d * 1.05), toon(i % 2 ? 0xbc8f5a : 0xa77a47),
      along ? 0 : t * w, 0.06, along ? t * d : 0);
    g.add(plank);
  }
  return g;
}

// 바닥 판(물·물살·얼음·진흙) — 살짝 띄워 겹침 깜빡임 방지
export function makeFloorPatch(w, d, kind) {
  const conf = {
    water: { color: 0x4fc3f7, opacity: 0.85, y: 0.03 },
    stream: { color: 0x81d4fa, opacity: 0.75, y: 0.025 },
    ice: { color: 0xd6f3ff, opacity: 0.9, y: 0.02 },
    mud: { color: 0x7a5236, opacity: 0.95, y: 0.022 },
    swamp: { color: 0x4a3f63, opacity: 0.95, y: 0.024 }
  }[kind];
  const mat = new THREE.MeshPhongMaterial({ color: conf.color, transparent: true, opacity: conf.opacity, shininess: kind === 'ice' || kind === 'water' ? 90 : 5 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = conf.y;
  m.receiveShadow = true;
  return m;
}
