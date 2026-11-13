import * as THREE from 'three';

// 한눈에 알아보기 쉽게 돕는 바닥 표시 (방법을 글로 알려 주지 않고 눈으로 알아채게)
//  - 연결선: 발판·그림 발판·저울에서 그 발판이 여는 문까지 은은한 점선. 발판이 눌리면 밝아지고, 문이 열리면 사라짐(꾹 발판은 남음)
//  - 위험 경로: 통나무·눈덩이·바위·꿀벌이 지나갈 길을 바닥에 옅은 점으로
//  - 강조 고리: 바구니·레버·망루 자리·오두막 발판에 가까이 가면 바닥 고리가 반짝임
const S = 1 / 40;
const wx = (x) => (x - 640) * S;
const wz = (y) => (y - 360) * S;

const dotGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);

// (x1,y1)→(x2,y2) 사이에 gap 간격으로 점 찍기 (양 끝은 skipA·skipB만큼 비움). 서버 좌표 기준
function dotsBetween(a, b, gap, skipA = 0, skipB = 0) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const out = [];
  for (let d = skipA; d <= len - skipB; d += gap) out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
  return out;
}

function dotMesh(points, color, radius, opacity, y = 0.045) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const m = new THREE.InstancedMesh(dotGeo, mat, Math.max(1, points.length));
  const mx = new THREE.Matrix4();
  points.forEach((p, i) => { mx.makeScale(radius, 1, radius).setPosition(wx(p.x), y, wz(p.y)); m.setMatrixAt(i, mx); });
  m.count = points.length;
  m.renderOrder = 1;
  return m;
}

function ring(r, color = 0xffffff) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.16, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

export default class Guides {
  constructor(group, info) {
    this.links = [];      // { mesh, gate, plate(이 점선의 발판 번호 또는 -1), hold }
    this.rings = [];      // { mesh, pos() }
    this.build(group, info);
  }

  build(g, info) {
    const doorOf = (i) => info.gates[i].door;
    // 발판 → 문
    info.plates.forEach((p, k) => {
      const d = doorOf(p.gate);
      const color = p.type === 'hold' ? 0x9c6bff : p.type === 'crate' ? 0xc98a4b : new THREE.Color(p.color).getHex();
      const mesh = dotMesh(dotsBetween(p, d, 20, p.type === 'crate' ? 62 : 40, 26), color, 0.11, 0.45);
      g.add(mesh);
      this.links.push({ mesh, gate: p.gate, plate: k, hold: p.type === 'hold' });
    });
    // 그림 발판·저울 → 문
    info.gates.forEach((gt, i) => {
      const from = gt.code ? [...gt.code.pads] : gt.scale ? [gt.scale.left, gt.scale.right] : [];
      from.forEach((p) => {
        const mesh = dotMesh(dotsBetween(p, gt.door, 22, 40, 26), gt.code ? 0xfff3e0 : 0xffe082, 0.08, 0.3);
        g.add(mesh);
        this.links.push({ mesh, gate: i, plate: -1, hold: false });
      });
    });
    // 위험 경로
    const movers = info.geo?.movers || [];
    movers.forEach((m) => {
      const pts = m.loop ? [...m.path, m.path[0]] : m.path;
      const dots = [];
      for (let i = 0; i < pts.length - 1; i++) {
        dots.push(...dotsBetween({ x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, m.kind === 'bee' ? 18 : 24));
      }
      const bee = m.kind === 'bee';
      g.add(dotMesh(dots, bee ? 0xffd54f : 0xff7043, bee ? 0.07 : 0.1, bee ? 0.32 : 0.26, 0.04));
    });
    // 강조 고리: 가까이 오면 반짝
    const add = (r, pos, color) => { const m = ring(r, color); g.add(m); this.rings.push({ mesh: m, pos }); };
    (info.levers || []).forEach((lv) => add(0.75, () => ({ x: wx(lv.x), z: wz(lv.y) }), 0xffeb3b));
    (info.lookouts || []).forEach((lk) => add(1.45, () => ({ x: wx(lk.x), z: wz(lk.y) }), 0xffeb3b));
    info.gates.forEach((gt) => {
      const pad = gt.code?.booth?.pad;
      if (pad) add(0.95, () => ({ x: wx(pad.x), z: wz(pad.y) }), 0xffeb3b);
    });
  }

  // 바구니 고리는 바구니를 따라다님
  setCrate(crateObj) {
    const m = ring(1.75, 0xffffff);
    crateObj.parent.add(m);
    this.rings.push({ mesh: m, pos: () => ({ x: crateObj.position.x, z: crateObj.position.z }) });
  }

  // 서버 상태: 발판 눌림·문 열림
  apply(s) {
    for (const l of this.links) {
      const open = !!s.g[l.gate];
      l.mesh.visible = l.hold || !open;
      l.on = l.plate >= 0 && !!s.pl[l.plate];
    }
  }

  // 매 프레임: me = 내 동물 위치(없으면 구경하기)
  render(t, me) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    for (const l of this.links) l.mesh.material.opacity = l.on ? 0.9 : 0.38 + 0.17 * pulse;
    for (const r of this.rings) {
      const p = r.pos();
      r.mesh.position.x = p.x; r.mesh.position.z = p.z;
      const d = me ? Math.hypot(me.x - p.x, me.z - p.z) : 99;
      const near = Math.max(0, Math.min(1, (3.6 - d) / 1.2));   // 3.6칸(약 145) 안에서 점점 밝게
      r.mesh.material.opacity = near * (0.45 + 0.4 * pulse);
      r.mesh.visible = near > 0;
      r.mesh.scale.setScalar(1 + 0.06 * pulse);
    }
  }
}
