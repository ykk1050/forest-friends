// 단계 만들기 도구 (모둠 미션·짝 미션이 함께 씀). 좌표는 가로 1280 × 세로 720 (왼쪽 위가 0,0)
import { R } from './geometry.js';
import { placeHouse } from './grid.js';

export const T = 30; // 울타리 두께

// 세로 울타리: x 위치에 gaps([y1,y2] 구멍)만 비우고 세움
export function vwall(x, ...gaps) {
  const out = [];
  let y = 0;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > y) out.push(R(x - T / 2, y, x + T / 2, a));
    y = b;
  }
  if (y < 720) out.push(R(x - T / 2, y, x + T / 2, 720));
  return out;
}
export function hwall(y, x1, x2) { return [R(x1, y - T / 2, x2, y + T / 2)]; }

// 문 달린 세로 울타리. plates: team(...) / cratePlate(x,y) / hold(...)
export function gateV(x, y1, y2, plates) {
  return { walls: vwall(x, [y1, y2]), gate: { door: R(x - T / 2, y1, x + T / 2, y2), plates } };
}
export const team = (...at) => ({ type: 'team', at: at.map(([x, y]) => ({ x, y })) });
export const cratePlate = (x, y) => ({ type: 'crate', x, y });
// 저울 발판: 연결된 친구가 모두 두 저울판 중 하나에 서고 양쪽 수가 같으면 문이 열림 (바구니도 1로 셈 → 홀수 모둠은 바구니가 꼭 필요)
export const scale = (left, right) => ({ type: 'scale', left, right });
// 꾹 발판: 누르고 있는 동안만 문이 열림 (보통 문 양쪽에 하나씩)
export const hold = (...at) => ({ type: 'hold', at: at.map(([x, y]) => ({ x, y })) });
// 호박: 친구들은 못 밀지만, 굴러오는 통나무·눈덩이에는 밀려남
export const pumpkin = (x, y, r = 34) => ({ x, y, r });

export const bee = (path, speed = 130, extra = {}) => ({ kind: 'bee', r: 22, path, speed, ...extra });
export const snowball = (path, speed = 150, extra = {}) => ({ kind: 'snowball', r: 32, path, speed, ...extra });
// 바위: 눈덩이와 똑같이 움직임 (노을 계곡처럼 눈이 어색한 곳에서 씀)
export const rock = (path, speed = 150, extra = {}) => ({ kind: 'rock', r: 32, path, speed, ...extra });
// 통나무: 굴러가는 긴 사각형 (w×h)
export const log = (path, w, h, speed = 140, extra = {}) => ({ kind: 'log', w, h, path, speed, ...extra });
// ───── 생각하는 협동 퍼즐 (수수께끼 숲) ─────
// 그림 암호 문: 표지판(sign) 앞에 선 친구 화면에만 암호가 보이고, 그동안만 그림 발판(pads)이 눌림
// 표지판은 울타리 오두막 안에 있음. 문(door: 'up'|'down'|'left'|'right') 앞 얼굴 발판을 처음 밟은 친구 한 명만 들어갈 수 있고,
// 한번 들어가면 그 단계가 끝날 때까지 못 나옴
export const SYMBOLS = ['⭐', '🌙', '❤️', '🍀', '🍎', '💎'];
export const code = (sign, pads, len = 3, door = 'down') => ({
  type: 'code', sign: { x: sign[0], y: sign[1] }, len, door,
  pads: pads.map(([x, y], i) => ({ x, y, sym: i }))
});
// 수학 문: 그림 대신 숫자 발판. 오두막 친구 화면에 나오는 문제의 답을 차례로 밟음 (문제는 도전할 때마다 새로 나옴)
export const mathCode = (sign, pads, len = 3, door = 'down') => ({ ...code(sign, pads, len, door), math: true });
export const BOOTH = { hw: 60, hh: 50, t: 16, gap: 64, pad: 40 };   // 안쪽 반 너비·반 높이, 울타리 두께, 문 너비, 얼굴 발판 거리
// 오두막 울타리(walls) · 문(door) · 안쪽(room) · 얼굴 발판(pad)
export function signBooth(sign, side) {
  const { hw, hh, t, gap, pad } = BOOTH;
  const x1 = sign.x - hw, x2 = sign.x + hw, y1 = sign.y - hh, y2 = sign.y + hh;
  const g1x = sign.x - gap / 2, g2x = sign.x + gap / 2, g1y = sign.y - gap / 2, g2y = sign.y + gap / 2;
  const full = { up: R(x1 - t, y1 - t, x2 + t, y1), down: R(x1 - t, y2, x2 + t, y2 + t), left: R(x1 - t, y1, x1, y2), right: R(x2, y1, x2 + t, y2) };
  const open = {
    up: { wall: [R(x1 - t, y1 - t, g1x, y1), R(g2x, y1 - t, x2 + t, y1)], door: R(g1x, y1 - t, g2x, y1), pad: { x: sign.x, y: y1 - t - pad } },
    down: { wall: [R(x1 - t, y2, g1x, y2 + t), R(g2x, y2, x2 + t, y2 + t)], door: R(g1x, y2, g2x, y2 + t), pad: { x: sign.x, y: y2 + t + pad } },
    left: { wall: [R(x1 - t, y1, x1, g1y), R(x1 - t, g2y, x1, y2)], door: R(x1 - t, g1y, x1, g2y), pad: { x: x1 - t - pad, y: sign.y } },
    right: { wall: [R(x2, y1, x2 + t, g1y), R(x2, g2y, x2 + t, y2)], door: R(x2, g1y, x2 + t, g2y), pad: { x: x2 + t + pad, y: sign.y } }
  }[side];
  const walls = Object.keys(full).flatMap((k) => (k === side ? open.wall : [full[k]]));
  return { walls, door: open.door, room: R(x1, y1, x2, y2), pad: open.pad };
}
// 레버: 누군가 레버 위에 서 있는 동안 다리가 생기고(bridges), 레버 물살(lever:true)이 멈춤
export const lever = (x, y) => ({ x, y });
// 안개 늪: 80칸 격자 중 tiles([열,행])만 안전한 징검다리. 망루(lookout)에 선 친구 화면에만 보임
export const TILE = 80;
export const swamp = (x1, y1, x2, y2, tiles) => ({ x1, y1, x2, y2, tiles });

export const ring = (cx, cy, r, n = 8) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
});

// 기본값 채우기 + 문 묶음 펼치기
export function L(def) {
  const lv = build(def);
  return { ...lv, house: placeHouse(lv) };
}
function build(def) {
  const walls = [...(def.walls || [])];
  const gates = [];
  (def.gateDefs || []).forEach((g) => {
    walls.push(...g.walls);
    if (g.gate.plates.type !== 'code') return gates.push(g.gate);
    const { walls: bw, ...booth } = signBooth(g.gate.plates.sign, g.gate.plates.door);
    walls.push(...bw);
    gates.push({ ...g.gate, plates: { ...g.gate.plates, booth } });
  });
  return {
    name: def.name, world: def.world,
    start: def.start || { x: 150, y: 360 },
    crate: { weight: 2, ...def.crate },
    home: def.home || { x: 1130, y: 360 },
    walls, gates,
    water: def.water || [], thorns: def.thorns || [], streams: def.streams || [],
    ice: def.ice || [], mud: def.mud || [], movers: def.movers || [], pumpkins: def.pumpkins || [],
    levers: def.levers || [], bridges: def.bridges || [],
    // 색깔 문: 바구니는 지나가고 친구는 정해진 색만 지나감 (TeamGame.colorAllowed)
    colorDoors: def.colorDoors || [],
    // 밀물: tide = { period, low } (ms). 주기마다 처음 low 동안은 썰물, 나머지는 tides 자리가 물이 됨
    tides: def.tides || [], tide: def.tide || null,
    swamps: def.swamps || [], swampCells: (def.swamps || []).flatMap(swampCells), lookouts: def.lookouts || [],
    minPlayers: def.minPlayers || 1,
    berries: def.berries,
    tip: def.tip || ''
  };
}

// 안개 늪에서 '빠지는' 칸들 (징검다리가 아닌 칸) → 물처럼 취급
export function swampCells(sw) {
  const safe = new Set(sw.tiles.map(([c, r]) => `${c},${r}`));
  const out = [];
  for (let x = sw.x1; x < sw.x2; x += TILE) {
    for (let y = sw.y1; y < sw.y2; y += TILE) {
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      if (!safe.has(`${c},${r}`)) out.push(R(x, y, Math.min(x + TILE, sw.x2), Math.min(y + TILE, sw.y2)));
    }
  }
  return out;
}
