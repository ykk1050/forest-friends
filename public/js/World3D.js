import * as THREE from 'three';
import { makeAnimal, toon } from './animals.js';
import { SYMBOLS } from '/shared/levelkit.js';
import { RULES, ANIMALS, TEACHER_ANIMAL } from '/shared/constants.js';
import {
  THEMES, groundTexture, emojiTexture, makeTree, makeFlower, makeRock, makeHouse, makeCrate,
  makeBee, makeSnowball, makeLog, makeThorn, makeStrawberry, makeFloorPatch, makePumpkin,
  makeTower, makeSign, makeLever, makeBridge, makeDam
} from './props.js';

// 서버 좌표(가로 1280 × 세로 720) → 3D 바닥 좌표(가로 32 × 세로 18)
const S = 1 / 40;
const wx = (x) => (x - 640) * S;
const wz = (y) => (y - 360) * S;
const WALL_H = 1.0;

// 글자를 그린 캔버스를 스프라이트로 (한글·이모지 모두 OK)
function makeLabel(text, { color = '#fff', size = 48, height = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  sprite.userData.set = (t, c = color) => {
    if (sprite.userData.text === t && sprite.userData.color === c) return;
    sprite.userData.text = t; sprite.userData.color = c;
    const g = canvas.getContext('2d');
    const font = `900 ${size}px 'Malgun Gothic','Apple SD Gothic Neo',sans-serif`;
    g.font = font;
    canvas.width = Math.max(Math.ceil(g.measureText(t).width) + 24, 2); canvas.height = size + 20;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = size / 5; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineJoin = 'round';
    g.strokeText(t, canvas.width / 2, canvas.height / 2);
    g.fillStyle = c; g.fillText(t, canvas.width / 2, canvas.height / 2);
    tex.needsUpdate = true;
    sprite.scale.set(height * (canvas.width / canvas.height), height, 1);
  };
  sprite.userData.set(text);
  return sprite;
}

// 물살 방향 화살표(흰 꺾쇠) 무늬. angle: 화면 기준 흐르는 방향
function arrowTexture(angle) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.translate(32, 32);
  g.rotate(angle);
  g.strokeStyle = 'rgba(255,255,255,.6)';
  g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-8, -14); g.lineTo(8, 0); g.lineTo(-8, 14); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default class World3D {
  constructor(container, { low = false } = {}) {
    this.container = container;
    this.low = low;
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.5));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
    sun.position.set(-10, 22, 12);
    sun.castShadow = !low;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 1, far: 70 });
    sun.shadow.mapSize.set(low ? 512 : 1536, low ? 512 : 1536);
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.env = new THREE.Group();
    this.levelGroup = new THREE.Group();
    this.scene.add(this.env, this.levelGroup);
    this.players = new Map();   // slot → { animal, label, ... }
    this.effects = [];
    this.myslot = -1;
    this.theme = -1;
    // 카메라: 'follow' = 내 캐릭터 뒤에서 내려다보기, 'overview' = 맵 전체
    this.camMode = 'overview';
    this.yaw = 0;          // 바라보는 방향 (바닥 기준, 0 = 오른쪽)
    this.pitch = 1.0;      // 내려다보는 각도
    this.camLook = new THREE.Vector3();
    this.camReady = false;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  // 비스듬히 내려다보는 고정 카메라: 화면 비율에 맞춰 맵 전체가 보이도록
  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    const vf = THREE.MathUtils.degToRad(cam.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const D = Math.max(33.5 / (2 * Math.tan(hf / 2)), 21.5 / (2 * Math.tan(vf / 2)));
    const tilt = THREE.MathUtils.degToRad(60);
    this.overviewPos = new THREE.Vector3(0, Math.sin(tilt) * D, 0.6 + Math.cos(tilt) * D);
    this.overviewLook = new THREE.Vector3(0, 0, -0.4);
    cam.updateProjectionMatrix();
    this.camReady = false;
  }

  faceTexture(slot) {
    const kind = this.players?.get(slot)?.kind;
    const emoji = slot < 0 || !kind ? '❓' : kind === 'owl' ? TEACHER_ANIMAL.emoji : ANIMALS.find((a) => a.id === kind)?.emoji || '🐾';
    this.faceTex ??= new Map();
    if (!this.faceTex.has(emoji)) this.faceTex.set(emoji, emojiTexture(emoji));
    return this.faceTex.get(emoji);
  }

  // ---------- 카메라 ----------
  setCamMode(mode) { this.camMode = mode; this.camReady = false; }

  // 오른쪽 조이스틱: 좌우 = 돌기, 위아래 = 내려다보는 각도
  look(lx, ly, dt) {
    if (this.camMode !== 'follow') return;
    this.yaw += lx * 2.4 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + ly * 1.2 * dt, 0.45, 1.3);
  }

  // 조이스틱 방향 → 서버로 보낼 맵 방향. 따라가기 카메라에서는 '화면 위 = 내가 보는 쪽'
  moveToWorld(sx, sy) {
    if (this.camMode !== 'follow') return { x: sx, y: sy };
    const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
    return { x: fx * -sy + -fz * sx, y: fz * -sy + fx * sx };
  }

  updateCamera(dt) {
    const cam = this.camera;
    const me = this.camMode === 'follow' ? this.playerPos(this.myslot) : null;
    let pos, look;
    if (me) {
      const D = 13.5;
      const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
      const back = Math.cos(this.pitch) * D, up = Math.sin(this.pitch) * D;
      pos = new THREE.Vector3(me.x - fx * back, up, me.z - fz * back);
      look = new THREE.Vector3(me.x + fx * 1.8, 0.6, me.z + fz * 1.8);
    } else {
      pos = this.overviewPos; look = this.overviewLook;
    }
    const k = this.camReady ? 1 - Math.exp(-dt * 9) : 1;
    cam.position.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.lookAt(this.camLook);
    this.camReady = true;
  }

  // ---------- 월드 테마 (하늘·땅·테두리 나무) ----------
  setTheme(world) {
    if (this.theme === world) return;
    this.theme = world;
    const T = THEMES[world];
    this.env.clear();
    this.scene.background = new THREE.Color(T.sky);
    this.scene.fog = new THREE.Fog(T.sky, 45, 90);

    const outside = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), new THREE.MeshLambertMaterial({ color: T.outside }));
    outside.rotation.x = -Math.PI / 2; outside.position.y = -0.02; outside.receiveShadow = true;
    this.env.add(outside);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshLambertMaterial({ map: groundTexture(T.ground, T.ground2) }));
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true;
    this.env.add(field);

    // 바깥 낮은 울타리
    const rim = toon(T.cap);
    [[0, -9.2, 32.8, 0.4], [0, 9.2, 32.8, 0.4], [-16.2, 0, 0.4, 18.8], [16.2, 0, 0.4, 18.8]].forEach(([x, z, w, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), rim);
      m.position.set(x, 0.17, z); m.receiveShadow = true;
      this.env.add(m);
    });

    // 테두리 나무·바위 (맵 바깥)
    const count = this.low ? 26 : 48;
    for (let i = 0; i < count; i++) {
      const side = i % 4;
      const u = Math.random();
      let x, z;
      if (side === 0) { x = -18 + u * 36; z = -10.5 - Math.random() * 3; }
      else if (side === 1) { x = -18 + u * 36; z = 10.6 + Math.random() * 2; }
      else if (side === 2) { x = -17.5 - Math.random() * 4; z = -10 + u * 20; }
      else { x = 17.5 + Math.random() * 4; z = -10 + u * 20; }
      const deco = (T.deco === 'autumn' && Math.random() < 0.35) ? makeRock(0xa1887f) : makeTree(T.deco);
      deco.position.set(x, 0, z);
      this.env.add(deco);
    }
    if (T.deco === 'flowers' || T.deco === 'reeds') {
      for (let i = 0; i < (this.low ? 20 : 45); i++) {
        const f = makeFlower();
        const edge = Math.random() < 0.5;
        f.position.set(edge ? (Math.random() < 0.5 ? -16.6 : 16.6) + (Math.random() - 0.5) : -16 + Math.random() * 32,
          0, edge ? -9 + Math.random() * 18 : (Math.random() < 0.5 ? -9.7 : 9.7));
        this.env.add(f);
      }
    }
  }

  // ---------- 단계 배치 ----------
  buildLevel(info, mySlot) {
    this.setTheme(info.world);
    this.myslot = mySlot;
    const key = `${info.mode}:${info.index}`;
    if (this.levelKey !== key) {
      this.levelKey = key;
      this.yaw = Math.atan2(info.home.y - info.start.y, info.home.x - info.start.x);
      this.pitch = 1.0;
      this.camReady = false;
    }
    this.info = info;
    this.levelGroup.clear();
    const g = this.levelGroup;
    const T = THEMES[info.world];
    const wallMat = toon(T.wall), capMat = toon(T.cap);
    const box = (r, h, mat, y0 = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w * S, h, r.h * S), mat);
      m.position.set(wx(r.x), y0 + h / 2, wz(r.y));
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };

    // 바닥 판들
    const patch = (r, kind) => {
      const m = makeFloorPatch(r.w * S, r.h * S, kind);
      m.position.x = wx(r.x); m.position.z = wz(r.y);
      g.add(m);
      return m;
    };
    info.ice.forEach((r) => patch(r, 'ice'));
    info.mud.forEach((r) => patch(r, 'mud'));
    info.water.forEach((r) => patch(r, 'water'));
    this.streams = info.streams.map((r) => {
      const m = patch(r, 'stream');
      const tex = arrowTexture(Math.atan2(r.vy, r.vx));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(r.w * S / 1.5, r.h * S / 1.5);
      const arrows = new THREE.Mesh(new THREE.PlaneGeometry(r.w * S, r.h * S),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      arrows.rotation.x = -Math.PI / 2;
      arrows.position.set(wx(r.x), 0.04, wz(r.y));
      g.add(arrows);
      // 레버 물살: 물이 들어오는 쪽 끝에 제방(평소엔 바닥 아래에 숨어 있음)
      let dam = null;
      if (r.lever) {
        const alongX = Math.abs(r.vx) > Math.abs(r.vy);   // 물살이 가로로 흐르면 제방은 세로로 섬
        dam = makeDam((alongX ? r.h : r.w) * S, alongX);
        const ux = alongX ? Math.sign(r.vx) : 0, uy = alongX ? 0 : Math.sign(r.vy);
        const back = (alongX ? r.w : r.h) / 2 - 30;
        dam.position.set(wx(r.x - ux * back), 0, wz(r.y - uy * back));
        dam.userData.body.scale.y = 0.001;
        dam.visible = false;
        g.add(dam);
      }
      return { tex, arrows, dam, lever: !!r.lever, v: { x: r.vx * (r.strong ? 1.6 : 1), y: r.vy * (r.strong ? 1.6 : 1) }, size: { w: r.w * S / 1.5, h: r.h * S / 1.5 } };
    });

    // ---- 수수께끼 숲 ----
    // 안개 늪 + 징검다리(망루 친구에게만 보임)
    (info.swamps || []).forEach((sw) => {
      patch({ x: (sw.x1 + sw.x2) / 2, y: (sw.y1 + sw.y2) / 2, w: sw.x2 - sw.x1, h: sw.y2 - sw.y1 }, 'swamp');
      for (let i = 0; i < (this.low ? 6 : 14); i++) {
        const mist = makeLabel('☁️', { height: 1.6 + Math.random() });
        mist.material.opacity = 0.45;
        mist.position.set(wx(sw.x1 + Math.random() * (sw.x2 - sw.x1)), 0.6 + Math.random() * 0.6, wz(sw.y1 + Math.random() * (sw.y2 - sw.y1)));
        mist.userData.drift = Math.random() * 6;
        g.add(mist);
        (this.mists ||= []).push(mist);
      }
    });
    this.mists = this.mists?.filter((m) => m.parent) || [];
    this.tiles = new THREE.Group();
    (info.swamps || []).forEach((sw) => sw.tiles.forEach(([c, r]) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(80 * S * 0.88, 0.12, 80 * S * 0.88),
        new THREE.MeshToonMaterial({ color: 0x80deea, emissive: 0x26c6da, emissiveIntensity: 0.6 }));
      t.position.set(wx(c * 80 + 40), 0.07, wz(r * 80 + 40));
      this.tiles.add(t);
    }));
    this.tiles.visible = false;
    g.add(this.tiles);
    this.lookouts = (info.lookouts || []).map((lk) => {
      const tower = makeTower();
      tower.position.set(wx(lk.x), 0, wz(lk.y) - 1.5);
      g.add(tower);
      const spot = new THREE.Mesh(new THREE.CylinderGeometry(50 * S, 50 * S, 0.1, 24), new THREE.MeshToonMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.2 }));
      spot.position.set(wx(lk.x), 0.05, wz(lk.y));
      g.add(spot);
      const lab = makeLabel('🔭 망루', { height: 0.6, color: '#ffe082' });
      lab.position.set(wx(lk.x), 4.4, wz(lk.y) - 1.5);
      g.add(lab);
      return lk;
    });

    // 레버 + 다리 (레버를 잡는 동안만 다리)
    this.levers = (info.levers || []).map((lv) => {
      const obj = makeLever();
      obj.position.set(wx(lv.x), 0, wz(lv.y));
      g.add(obj);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.92, 28), new THREE.MeshBasicMaterial({ color: 0xff5252, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(wx(lv.x), 0.05, wz(lv.y));
      g.add(ring);
      const lab = makeLabel('🚰 레버', { height: 0.5 });
      lab.position.set(wx(lv.x), 1.9, wz(lv.y));
      g.add(lab);
      return obj;
    });
    (info.bridges || []).forEach((b) => patch(b, 'water'));
    this.bridges = (info.bridges || []).map((b) => {
      const obj = makeBridge(b.w * S, b.h * S);
      obj.position.set(wx(b.x), -0.6, wz(b.y));
      g.add(obj);
      return obj;
    });
    this.leverOn = false; this.bridgeOn = false;

    // 그림 암호: 표지판 + 그림 발판 + 문 위 진행 표시
    this.codeGates = info.gates.map((gate) => {
      if (!gate.code) return null;
      const sign = makeSign();
      sign.position.set(wx(gate.code.sign.x), 0, wz(gate.code.sign.y) - 0.9);
      g.add(sign);
      const signLab = makeLabel('🔢 ?', { height: 0.55, color: '#5d4037' });
      signLab.position.set(wx(gate.code.sign.x), 1.5, wz(gate.code.sign.y) - 0.8);
      g.add(signLab);
      const spot = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      spot.rotation.x = -Math.PI / 2; spot.position.set(wx(gate.code.sign.x), 0.05, wz(gate.code.sign.y));
      g.add(spot);
      const pads = gate.code.pads.map((pad) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.14, 24), new THREE.MeshToonMaterial({ color: 0xf5f0e6, emissive: 0xffffff, emissiveIntensity: 0 }));
        m.position.set(wx(pad.x), 0.07, wz(pad.y));
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: emojiTexture(SYMBOLS[pad.sym]), transparent: true }));
        icon.rotation.x = -Math.PI / 2; icon.position.y = 0.08;
        m.add(icon);
        g.add(m);
        return m;
      });
      const prog = makeLabel('', { height: 0.6 });
      prog.position.set(wx(gate.door.x), WALL_H + 0.6, wz(gate.door.y));
      g.add(prog);
      // 오두막 문 + 문 앞 얼굴 발판 (먼저 밟은 친구 얼굴이 나타남)
      const b = gate.code.booth;
      const doorMat = new THREE.MeshToonMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      const boothDoor = new THREE.Mesh(new THREE.BoxGeometry(b.door.w * S, WALL_H, b.door.h * S), doorMat);
      boothDoor.position.set(wx(b.door.x), WALL_H / 2, wz(b.door.y));
      g.add(boothDoor);
      // 주인이 들어가면 위에서 쾅 내려와 닫히는 나무 문 (평소엔 위에 숨어 있음)
      const shut = new THREE.Group();
      const horiz = b.door.w > b.door.h;
      const len = (horiz ? b.door.w : b.door.h) * S + 0.1, thick = 0.24;
      const n = 4;
      for (let k = 0; k < n; k++) {
        const t = (-0.5 + (k + 0.5) / n) * len;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len / n * 0.9 : thick, WALL_H + 0.2, horiz ? thick : len / n * 0.9), toon(k % 2 ? 0x8d6e63 : 0x795548));
        plank.position.set(horiz ? t : 0, (WALL_H + 0.2) / 2, horiz ? 0 : t);
        plank.castShadow = true;
        shut.add(plank);
      }
      for (const y of [0.25, WALL_H - 0.1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : thick + 0.08, 0.14, horiz ? thick + 0.08 : len), toon(0x4e342e));
        bar.position.y = y;
        shut.add(bar);
      }
      const lock = makeLabel('🔒', { height: 0.7 });
      lock.position.y = WALL_H + 0.7;
      shut.add(lock);
      shut.position.set(wx(b.door.x), 4, wz(b.door.y));
      shut.visible = false;
      shut.userData.v = 0;
      g.add(shut);
      const facePad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.14, 24), new THREE.MeshToonMaterial({ color: 0xffe0b2 }));
      facePad.position.set(wx(b.pad.x), 0.07, wz(b.pad.y));
      const faceMat = new THREE.MeshBasicMaterial({ map: this.faceTexture(-1), transparent: true });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), faceMat);
      face.rotation.x = -Math.PI / 2; face.position.y = 0.08;
      facePad.add(face);
      g.add(facePad);
      return { pads, prog, sign: gate.code.sign, signLab, doorMat, boothDoor, shut, at: b.door, faceMat, owner: -1, sealed: false, fresh: true };
    });

    // 울타리
    info.walls.forEach((r) => {
      box(r, WALL_H, wallMat);
      box({ x: r.x, y: r.y, w: r.w + 8, h: r.h + 8 }, 0.18, capMat, WALL_H);
    });

    // 문 (열리면 바닥 아래로 쏙)
    this.doors = info.gates.map((gate) => {
      const d = new THREE.Group();
      const hold = gate.type === 'hold';
      const door = new THREE.Mesh(new THREE.BoxGeometry(gate.door.w * S, WALL_H, gate.door.h * S), toon(hold ? 0x9c6bff : 0xff7043));
      door.position.y = WALL_H / 2; door.castShadow = true;
      d.add(door);
      const plank = toon(hold ? 0xd1b3ff : 0xffab91);
      for (let k = -1; k <= 1; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(gate.door.w * S + 0.04, 0.12, gate.door.h * S * 0.9), plank);
        p.position.y = WALL_H / 2 + k * 0.3;
        d.add(p);
      }
      const lock = makeLabel(hold ? '✋' : '🔒', { height: 0.8 });
      lock.position.y = WALL_H + 0.7;
      d.add(lock);
      d.position.set(wx(gate.door.x), gate.open ? -WALL_H - 0.5 : 0, wz(gate.door.y));
      g.add(d);
      return { group: d, lock, open: gate.open, hold };
    });

    // 발판: 모둠 발판(동그란 발자국 돌) / 바구니 발판(큰 네모)
    const pawTex = emojiTexture('🐾', { color: 'rgba(255,255,255,.9)' });
    const holdTex = emojiTexture('✋');
    this.plates = info.plates.map((p) => {
      const col = new THREE.Color(p.color);
      const mat = new THREE.MeshToonMaterial({ color: col, emissive: col, emissiveIntensity: 0.05 });
      let m;
      if (p.type === 'crate') {
        m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 2.6), mat);
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: emojiTexture('🧺'), transparent: true }));
        icon.rotation.x = -Math.PI / 2; icon.position.y = 0.06;
        m.add(icon);
      } else {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, p.type === 'hold' ? 0.2 : 0.12, 24), mat);
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: p.type === 'hold' ? holdTex : pawTex, transparent: true }));
        if (p.type === 'hold') icon.position.y = 0.11;
        icon.rotation.x = -Math.PI / 2; icon.position.y = 0.07;
        m.add(icon);
      }
      m.position.set(wx(p.x), 0.06, wz(p.y));
      m.receiveShadow = true;
      g.add(m);
      return { mesh: m, mat, gate: p.gate };
    });

    // 가시덤불
    info.thorns.forEach((t) => {
      const th = makeThorn(t.r * S);
      th.position.set(wx(t.x), 0, wz(t.y));
      g.add(th);
    });

    // 움직이는 장애물
    this.movers = info.movers.map((m) => {
      let obj;
      if (m.kind === 'bee') obj = makeBee();
      else if (m.kind === 'snowball') obj = makeSnowball(m.r * S);
      else obj = makeLog(m.w * S, m.h * S);
      g.add(obj);
      return { obj, kind: m.kind, target: null, last: null };
    });

    // 호박
    this.pumpkinObjs = (info.pumpkins || []).map((p) => {
      const obj = makePumpkin(p.r * S);
      obj.position.set(wx(p.x), 0, wz(p.y));
      g.add(obj);
      return { obj, target: null };
    });

    // 딸기
    this.berries = info.berries.map(([x, y]) => {
      const b = makeStrawberry();
      b.position.set(wx(x), 0, wz(y));
      g.add(b);
      return b;
    });

    // 집 + 마당
    const H = info.home, hs = 170 * S;
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(hs, hs), new THREE.MeshBasicMaterial({ color: 0xfff8e1, transparent: true, opacity: 0.55 }));
    yard.rotation.x = -Math.PI / 2; yard.position.set(wx(H.x), 0.035, wz(H.y));
    g.add(yard);
    const yardEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hs, 0.01, hs)), new THREE.LineBasicMaterial({ color: 0xffa000 }));
    yardEdge.position.set(wx(H.x), 0.05, wz(H.y));
    g.add(yardEdge);
    const house = makeHouse(info.world);
    const backZ = wz(H.y) - hs / 2 - 1.0;
    house.position.set(wx(H.x), 0, backZ < -8.2 ? wz(H.y) + hs / 2 + 1.0 : backZ);
    if (backZ < -8.2) house.rotation.y = Math.PI;
    house.scale.setScalar(0.9);
    g.add(house);
    const homeLabel = makeLabel('🏠 우리 집', { color: '#ffe082', height: 0.6 });
    homeLabel.position.set(wx(H.x), 0.9, wz(H.y));
    g.add(homeLabel);

    // 출발점 표시
    const startMark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    startMark.rotation.x = -Math.PI / 2;
    startMark.position.set(wx(info.start.x), 0.04, wz(info.start.y));
    g.add(startMark);

    // 바구니
    this.crate = makeCrate(info.world);
    this.crateLabel = makeLabel('', { height: 0.6 });
    this.crateLabel.position.y = 2.6;
    this.crate.add(this.crateLabel);
    this.crate.userData.target = null;
    g.add(this.crate);
    this.need = info.crate.need;

    this.setRoster(info.roster, mySlot);
  }

  // ---------- 동물들 ----------
  setRoster(roster, mySlot) {
    this.myslot = mySlot;
    const keep = new Set();
    roster.forEach((r) => {
      keep.add(r.slot);
      let pl = this.players.get(r.slot);
      if (pl && (pl.kind !== r.animal || pl.color !== r.color)) { this.scene.remove(pl.group); pl = null; }
      if (!pl) {
        const a = makeAnimal(r.animal, r.color);
        a.root.scale.setScalar(1.25);   // 맵 전체가 보이는 카메라라서 조금 크게
        const group = new THREE.Group();
        group.add(a.root);
        const label = makeLabel(r.name, { height: 0.45 });
        label.position.y = 2.35;
        const marker = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xffeb3b, side: THREE.DoubleSide }));
        marker.rotation.x = -Math.PI / 2; marker.position.y = 0.04;
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xffeb3b }));
        arrow.rotation.x = Math.PI; arrow.position.y = 2.95;
        group.add(label, marker, arrow);
        this.scene.add(group);
        pl = { group, animal: a, label, marker, arrow, kind: r.animal, color: r.color, target: null, face: 0, speed: 0, grab: false };
        this.players.set(r.slot, pl);
      }
      const me = r.slot === mySlot;
      pl.label.userData.set(me ? `나 (${r.name})` : r.name, me ? '#ffeb3b' : r.isTeacher ? '#d1b3ff' : '#fff');
      pl.marker.visible = pl.arrow.visible = me;
    });
    for (const [slot, pl] of this.players) if (!keep.has(slot)) { this.scene.remove(pl.group); this.players.delete(slot); }
  }

  // ---------- 서버 상태 적용 ----------
  applyState(s) {
    for (const [slot, x, y, fx, fy, grab, online, safe] of s.p) {
      const pl = this.players.get(slot);
      if (!pl) continue;
      const t = new THREE.Vector3(wx(x), 0, wz(y));
      // 처음 자리로 순간이동했으면 미끄러지지 말고 바로
      if (!pl.target || pl.target.distanceTo(t) > 3) pl.group.position.copy(t);
      pl.target = t;
      if (fx || fy) pl.face = Math.atan2(fy, fx);
      pl.grab = !!grab;
      pl.safe = !!safe;
      pl.online = !!online;
    }
    if (this.crate) {
      const t = new THREE.Vector3(wx(s.c[0]), 0, wz(s.c[1]));
      if (!this.crate.userData.target) this.crate.position.copy(t);
      this.crate.userData.target = t;
      this.crate.userData.moving = !!s.c[3];
      const ok = s.c[2] >= (s.c[4] ?? this.need);
      // 몇 명이 필요한지는 알려 주지 않고, 지금 잡은 수만 (충분하면 초록)
      this.crateLabel.userData.set(s.c[2] ? `✋ ${s.c[2]}` : '', ok ? '#76ff03' : '#fff');
    }
    (this.plates || []).forEach((p, i) => {
      const on = !!s.pl[i];
      p.mat.emissiveIntensity = on ? 0.9 : 0.05;
      p.mesh.position.y = on ? 0.02 : 0.06;
    });
    (this.doors || []).forEach((d, i) => {
      d.open = !!s.g[i];
      if (!d.hold) d.lock.userData.set(d.open ? '🔓' : '🔒');
    });
    (this.movers || []).forEach((m, i) => {
      if (!s.mv[i]) return;
      const t = new THREE.Vector3(wx(s.mv[i][0]), 0, wz(s.mv[i][1]));
      if (!m.target) m.obj.position.copy(t);
      m.target = t;
    });
    (this.berries || []).forEach((b, i) => { if (s.b[i] && b.visible) { b.visible = false; this.sparkle(b.position); } });
    if (!!s.lv !== this.leverOn) {
      // 제방이 솟거나 가라앉을 때 물보라
      (this.streams || []).forEach((st) => { if (st.dam) this.splash(st.dam.position); });
    }
    this.leverOn = !!s.lv; this.bridgeOn = !!s.br;
    (this.streams || []).forEach((st) => { st.arrows.visible = !(st.lever && this.leverOn); });
    (this.codeGates || []).forEach((cg, i) => {
      if (!cg || !s.cd?.[i]) return;
      const [, got, reader] = s.cd[i];
      const len = s.cd[i][0].length;
      cg.prog.userData.set(s.g[i] ? '🔓' : '●'.repeat(got) + '○'.repeat(len - got), s.g[i] ? '#fff' : '#ffeb3b');
      cg.signLab.userData.set(reader ? '🔢 읽는 중!' : '🔢 ?', reader ? '#2e7d32' : '#5d4037');
      const owner = s.cd[i][3] ?? -1, sealed = !!s.cd[i][4];
      if (owner !== cg.owner || sealed !== cg.sealed) {
        cg.owner = owner; cg.sealed = sealed;
        cg.faceMat.map = this.faceTexture(owner);
        // 주인을 기다릴 때는 하얗게 비치는 문, 주인 친구가 정해지면 그 친구 색, 들어가면 꽉 닫힌 문
        const pl = this.players.get(owner);
        cg.doorMat.color.set(pl ? pl.color : 0xffffff);
        cg.doorMat.opacity = 0.45;
        cg.boothDoor.visible = !sealed;
        // 맵을 새로 그린 직후(늦게 들어온 구경꾼 등)에는 이미 닫힌 문을 그냥 닫힌 채로
        if (sealed && cg.fresh) { cg.shut.visible = true; cg.shut.position.y = 0; Object.assign(cg.shut.userData, { v: 0, landed: true, done: true }); }
        else if (sealed) { cg.shut.visible = true; cg.shut.position.y = 4; Object.assign(cg.shut.userData, { v: 0, landed: false, done: false }); }
        else cg.shut.visible = false;
      }
      cg.fresh = false;
    });
    (this.pumpkinObjs || []).forEach((p, i) => {
      if (!s.pk?.[i]) return;
      p.target = new THREE.Vector3(wx(s.pk[i][0]), 0, wz(s.pk[i][1]));
    });
  }

  playerPos(slot) { return this.players.get(slot)?.group.position; }

  // ---------- 효과 ----------
  addParticle(obj, v, life, opts = {}) {
    this.scene.add(obj);
    this.effects.push({ obj, v, life, max: life, ...opts });
  }

  splash(at) {
    for (let i = 0; i < (this.low ? 8 : 16); i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x4fc3f7 : 0xe1f5fe, transparent: true }));
      m.position.set(at.x + (Math.random() - 0.5) * 2.5, 0.3, at.z + (Math.random() - 0.5) * 0.8);
      this.addParticle(m, new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3), 0.9, {});
    }
  }

  poof(x, y, cause) {
    const at = new THREE.Vector3(wx(x), 0.6, wz(y));
    const color = cause === 'water' ? 0x4fc3f7 : 0xffffff;
    for (let i = 0; i < (this.low ? 8 : 14); i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5);
      this.addParticle(m, v, 0.8, { grow: true });
    }
    const label = makeLabel(cause === 'water' ? '풍덩!' : cause === 'bee' ? '앗 따가워!' : cause === 'thorn' ? '아야!' : cause === 'gate' ? '쾅! 닫혔어요' : '쿵!', { height: 0.7, color: '#ffeb3b' });
    label.position.copy(at).add(new THREE.Vector3(0, 1.4, 0));
    this.addParticle(label, new THREE.Vector3(0, 1.2, 0), 1.2, { noGravity: true });
  }

  sparkle(pos) {
    for (let i = 0; i < 8; i++) {
      const sp = makeLabel(i % 2 ? '✨' : '🍓', { height: 0.45 });
      sp.position.set(pos.x, 0.8, pos.z);
      this.addParticle(sp, new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3), 1);
    }
  }

  hearts(slot) {
    const p = this.playerPos(slot);
    if (!p) return;
    for (let i = 0; i < 6; i++) {
      const sp = makeLabel('💖', { height: 0.45 });
      sp.position.set(p.x, 1.6, p.z);
      this.addParticle(sp, new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2), 1);
    }
  }

  confetti() {
    const colors = [0xff4f9a, 0x29b6f6, 0xffd400, 0x66dd55, 0xff8a3d];
    const at = this.crate ? this.crate.position : new THREE.Vector3();
    for (let i = 0; i < (this.low ? 40 : 100); i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.13), new THREE.MeshBasicMaterial({ color: colors[i % 5], transparent: true }));
      m.position.set(at.x, 1.2, at.z);
      this.addParticle(m, new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 6, (Math.random() - 0.5) * 10), 2.2, { spin: true });
    }
  }

  // ---------- 매 프레임 ----------
  render(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const t = performance.now() / 1000;

    for (const [slot, pl] of this.players) {
      const before = pl.group.position.clone();
      if (pl.target) pl.group.position.lerp(pl.target, k);
      const moved = before.distanceTo(pl.group.position) / Math.max(dt, 0.001);
      pl.speed += (Math.min(1, moved / 5.5) - pl.speed) * Math.min(1, dt * 10);
      // 바라보는 방향으로 부드럽게 돌기 (앞 = +x)
      let diff = -pl.face - pl.animal.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      pl.animal.root.rotation.y += diff * Math.min(1, dt * 12);
      pl.animal.animate(dt, pl.speed, pl.grab, t);
      // 처음 자리로 돌아온 직후엔 깜빡깜빡
      pl.animal.root.visible = !pl.safe || Math.floor(t * 10) % 2 === 0;
      pl.label.material.opacity = pl.online === false ? 0.35 : 1;   // 연결 끊긴 친구는 이름이 흐리게
      if (slot === this.myslot) {
        const follow = this.camMode === 'follow';
        pl.label.visible = pl.arrow.visible = !follow;
        pl.arrow.position.y = 2.95 + Math.sin(t * 4) * 0.15;
        pl.marker.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
      }
    }

    if (this.crate?.userData.target) {
      this.crate.position.lerp(this.crate.userData.target, k);
      this.crate.rotation.z = this.crate.userData.moving ? Math.sin(t * 18) * 0.03 : 0;
    }
    (this.movers || []).forEach((m) => {
      if (!m.target) return;
      const prev = m.obj.position.clone();
      m.obj.position.lerp(m.target, k);
      const d = m.obj.position.clone().sub(prev);
      if (m.kind === 'bee') {
        m.obj.userData.animate(t);
        if (d.lengthSq() > 1e-6) m.obj.rotation.y = Math.atan2(-d.z, d.x);
      } else if (m.kind === 'snowball') {
        m.obj.userData.roll.rotation.z -= d.x * 2; m.obj.userData.roll.rotation.x += d.z * 2;
      } else {
        const roll = m.obj.userData.roll;
        if (m.obj.userData.alongX) roll.rotation.x += d.z * 3; else roll.rotation.z -= d.x * 3;
      }
    });
    (this.doors || []).forEach((d) => {
      const want = d.open ? -WALL_H - 0.5 : 0;
      d.group.position.y += (want - d.group.position.y) * Math.min(1, dt * 4);
      d.lock.visible = d.group.position.y > -0.6;   // 문과 함께 내려간 자물쇠는 감춤
    });
    (this.berries || []).forEach((b, i) => { b.rotation.y = t * 2 + i; b.position.y = Math.sin(t * 3 + i) * 0.1; });
    (this.pumpkinObjs || []).forEach((p) => {
      if (!p.target) return;
      const prev = p.obj.position.clone();
      p.obj.position.lerp(p.target, k);
      const d = p.obj.position.clone().sub(prev);
      p.obj.userData.roll.rotation.z -= d.x * 1.5; p.obj.userData.roll.rotation.x += d.z * 1.5;
    });
    // 오두막 문이 위에서 떨어져 쿵 닫힘 (한 번 통 튀었다가 멈춤)
    (this.codeGates || []).forEach((cg) => {
      if (!cg?.shut.visible || cg.shut.userData.done) return;
      const u = cg.shut.userData;
      u.v -= 30 * dt;
      cg.shut.position.y += u.v * dt;
      if (cg.shut.position.y <= 0) {
        cg.shut.position.y = 0;
        if (!u.landed) { u.landed = true; this.poof(cg.at.x, cg.at.y, 'gate'); }
        if (u.v < -2.5) u.v = -u.v * 0.3; else { u.v = 0; u.done = true; }
      }
    });
    (this.streams || []).forEach((s) => {
      s.tex.offset.x -= s.v.x * S * dt / 1.5; s.tex.offset.y += s.v.y * S * dt / 1.5;
      if (!s.dam) return;
      // 제방: 레버를 당기면 바닥에서 쑥 솟아(살짝 튀어 오름), 놓으면 천천히 가라앉음 (물 밑이 비치므로 땅 밑으로 숨기지 않고 높이를 줄임)
      const body = s.dam.userData.body, up = s.lever && this.leverOn;
      const goal = up ? 1 : 0;
      body.userData.v = (body.userData.v || 0) + ((goal - body.scale.y) * (up ? 90 : 30) - (body.userData.v || 0) * (up ? 9 : 10)) * dt;
      body.scale.y = Math.max(0.001, body.scale.y + body.userData.v * dt);
      if (!up && body.scale.y < 0.02) { body.scale.y = 0.001; body.userData.v = 0; }
      body.position.x = up && body.scale.y < 0.95 ? Math.sin(t * 60) * 0.03 : 0;   // 솟는 동안 덜덜
      s.dam.visible = body.scale.y > 0.01;
    });

    this.effects = this.effects.filter((e) => {
      e.life -= dt;
      if (!e.noGravity) e.v.y -= 9 * dt;
      e.obj.position.addScaledVector(e.v, dt);
      if (e.spin) { e.obj.rotation.x += dt * 8; e.obj.rotation.y += dt * 5; }
      if (e.grow) e.obj.scale.multiplyScalar(1 + dt * 1.5);
      if (e.obj.position.y < 0.05) { e.obj.position.y = 0.05; e.v.set(0, 0, 0); }
      if (e.obj.material) { e.obj.material.transparent = true; e.obj.material.opacity = Math.min(1, (e.life / e.max) * 2); }
      if (e.life <= 0) { this.scene.remove(e.obj); return false; }
      return true;
    });

    // 레버 손잡이·다리
    (this.levers || []).forEach((lv) => { const h = lv.userData.handle; h.rotation.z += ((this.leverOn ? -0.6 : 0.6) - h.rotation.z) * Math.min(1, dt * 8); });
    (this.bridges || []).forEach((b) => {
      b.position.y += ((this.bridgeOn ? 0.02 : -0.6) - b.position.y) * Math.min(1, dt * 6);
      b.visible = b.position.y > -0.55;
    });
    (this.mists || []).forEach((m, i) => { m.position.x += Math.sin(t * 0.3 + m.userData.drift) * dt * 0.3; });
    // 망루에 서 있는 친구(또는 구경하는 선생님)에게만 징검다리가 보임
    if (this.tiles) {
      const me = this.playerPos(this.myslot);
      const onTower = !!me && (this.info?.lookouts || []).some((lk) => Math.hypot(wx(lk.x) - me.x, wz(lk.y) - me.z) < RULES.lookoutR * S);
      this.isLookout = onTower;
      this.tiles.visible = onTower || this.myslot < 0;
      this.tiles.children.forEach((c) => { c.material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.25; });
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
