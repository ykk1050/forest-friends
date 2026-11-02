// 7·8번째 마을 '물안개 호수'·'비밀 섬': 물·얼음 구멍·안개 늪·레버 다리·망루·물살·그림 암호를 섞은 12단계
//  (화면 꾸밈은 시냇가·눈 덮인 산·수수께끼 숲 것을 빌려 씀)
// 모둠 미션·짝 미션이 같은 장소를 쓰고, 바구니 무게·암호 길이로 난이도를 맞춤
import { gateV, team, code, lever, swamp, L } from './levelkit.js';
import { R } from './geometry.js';

// 세로 강: x1~x2 사이를 물로 채우고 gaps([y1,y2]) 자리만 레버 다리로
function river(x1, x2, ...gaps) {
  const water = [], bridges = [];
  let y = 0;
  for (const [a, b] of gaps) {
    if (a > y) water.push(R(x1, y, x2, a));
    bridges.push(R(x1, a, x2, b));
    y = b;
  }
  if (y < 720) water.push(R(x1, y, x2, 720));
  return { water, bridges };
}
const join = (...parts) => ({
  water: parts.flatMap((p) => p.water || []), bridges: parts.flatMap((p) => p.bridges || [])
});
// 늪 안 가로 띠 징검다리 (열 c1~c2, 행 r, r+1) — 다시 할 때마다 길은 무작위로 바뀜
const band = (c1, c2, r) => Array.from({ length: c2 - c1 + 1 }, (_, k) => [[c1 + k, r], [c1 + k, r + 1]]).flat();

function extraLevels(duo) {
  const w2 = duo ? 1 : 2;
  const len = (team) => (duo ? 3 : team);
  const P = (def) => ({ ...L({ minPlayers: 2, ...def }), pumpkinHolds: [] });
  const suffix = duo ? ' 둘이서' : '';
  return [
    // ───── 7. 물안개 호수 ─────
    P({ world: 1, name: `두 개의 다리${suffix}`,
      tip: '🚰 레버 하나로 두 다리가 함께 놓여요. 레버 친구가 잡고 있는 동안 두 강을 모두 건너요!',
      crate: { x: 300, y: 360, weight: w2 },
      ...join(river(440, 540, [280, 440]), river(780, 880, [280, 440])),
      levers: [lever(300, 620), lever(660, 110)],
      berries: [[660, 620], [300, 110], [1000, 150]] }),
    P({ world: 5, name: `늪 건너 발판${suffix}`,
      tip: '🔭 망루 친구가 늪 길을 알려 주면, 모두 늪을 건너 문 앞 발판을 밟아요!',
      crate: { x: 260, y: 200, weight: w2 },
      swamps: [swamp(400, 0, 720, 720, band(5, 8, 4))],
      lookouts: [{ x: 200, y: 600 }],
      gateDefs: [gateV(960, 285, 435, team([840, 150], [840, 570]))],
      berries: [[300, 620], [840, 360], [1130, 620]] }),
    P({ world: 1, name: `물살 위 다리${suffix}`,
      tip: '물결 위의 바구니는 아래로 떠내려가요! 연못에 빠지지 않게 비스듬히 밀고, 다음 강은 레버 다리로.',
      crate: { x: 260, y: 200, weight: w2 },
      streams: [{ ...R(400, 0, 520, 560), vx: 0, vy: 120 }],
      ...join({ water: [R(400, 560, 520, 720)] }, river(800, 900, [280, 440])),
      levers: [lever(640, 620), lever(1000, 120)],
      berries: [[260, 620], [640, 140], [1130, 620]] }),
    P({ world: 3, name: `구멍 숭숭 얼음판${suffix}`,
      tip: '미끄러운 얼음판에 구멍이 숭숭! 바구니가 구멍에 빠지지 않게 천천히 길을 골라요.',
      crate: { x: 260, y: 360, weight: w2 },
      ice: [R(360, 0, 1000, 720)],
      water: [R(440, 90, 560, 230), R(440, 490, 560, 630), R(720, 300, 820, 420), R(940, 0, 1040, 150), R(940, 570, 1040, 720)],
      berries: [[620, 120], [620, 600], [900, 360]] }),
    P({ world: 1, name: `제방과 다리${suffix}`,
      tip: '🚰 레버를 잡고 있으면 제방이 솟아 센 물살이 멈추고, 다리도 함께 놓여요. 그동안 나머지 친구들이 바구니를!',
      crate: { x: 260, y: 200, weight: w2 },
      streams: [{ ...R(400, 0, 560, 600), vx: 0, vy: 170, strong: true, lever: true }],
      ...join({ water: [R(400, 600, 560, 720)] }, river(820, 920, [280, 440])),
      levers: [lever(280, 600), lever(690, 110)],
      berries: [[260, 620], [690, 620], [1100, 140]] }),
    P({ world: 5, name: `망루 두 개${suffix}`,
      tip: '🔭 늪이 두 개! 망루도 두 개예요. 늪 사이 망루에 누가 먼저 가서 다음 길을 알려 줄까요?',
      crate: { x: 200, y: 200, weight: w2 },
      swamps: [swamp(320, 0, 560, 720, band(4, 6, 2)), swamp(800, 0, 1040, 720, band(10, 12, 5))],
      lookouts: [{ x: 180, y: 620 }, { x: 680, y: 620 }],
      berries: [[180, 420], [680, 120], [1130, 620]] }),
    // ───── 8. 비밀 섬 ─────
    P({ world: 1, name: `암호와 다리${suffix}`,
      tip: '레버 다리로 강을 건넌 뒤, 그림 암호로 문을 열어요. 레버 친구·오두막 친구·미는 친구, 역할을 나눠요!',
      crate: { x: 260, y: 360, weight: w2 },
      ...river(440, 540, [280, 440]),
      levers: [lever(300, 620), lever(300, 110)],
      gateDefs: [gateV(900, 285, 435, code([700, 110], [[620, 600], [740, 600], [620, 480], [740, 480]], len(3)))],
      berries: [[680, 360], [1130, 140], [1130, 620]] }),
    P({ world: 5, name: `늪 속 다리${suffix}`,
      tip: '🔭 늪을 건너면 강이 또 있어요! 레버는 늪 건너편에 있어요.',
      crate: { x: 200, y: 200, weight: w2 },
      swamps: [swamp(320, 0, 640, 720, band(4, 7, 3))],
      lookouts: [{ x: 180, y: 620 }],
      ...river(820, 920, [280, 440]),
      levers: [lever(730, 620), lever(730, 110)],
      berries: [[180, 420], [730, 360], [1100, 620]] }),
    P({ world: 1, name: `섬 사이 징검다리${suffix}`,
      tip: '🚰 다리가 두 군데 놓여요. 연못 섬 사이로 바구니를 이리저리 옮겨요!',
      crate: { x: 260, y: 360, weight: w2 },
      ...join(river(420, 520, [120, 280], [440, 600]), { water: [R(700, 150, 860, 300), R(700, 450, 860, 600), R(980, 0, 1040, 120), R(980, 600, 1040, 720)] }),
      levers: [lever(250, 620), lever(620, 360)],
      berries: [[620, 120], [780, 375], [620, 620]] }),
    P({ world: 5, name: `늪과 물살${suffix}`,
      tip: '물결이 바구니를 아래로 끌어당겨요! 물결을 건너면 안개 늪, 망루 친구가 길을 알려 줘요.',
      crate: { x: 230, y: 200, weight: w2 },
      streams: [{ ...R(360, 0, 460, 720), vx: 0, vy: 120 }],
      swamps: [swamp(560, 0, 880, 720, band(7, 10, 4))],
      lookouts: [{ x: 220, y: 600 }],
      berries: [[220, 420], [510, 120], [1130, 620]] }),
    P({ world: 3, name: `얼음 늪${suffix}`,
      tip: '🔭 얼음판에서 미끄러지면 안개 늪으로 쑥! 망루 친구 말을 잘 듣고 천천히 가요.',
      crate: { x: 200, y: 200, weight: w2 },
      ice: [R(300, 0, 640, 720)],
      swamps: [swamp(640, 0, 960, 720, band(8, 11, 2))],
      lookouts: [{ x: 160, y: 620 }],
      berries: [[460, 360], [160, 420], [1130, 620]] }),
    P({ world: 5, name: `물안개 대장정${suffix}`,
      tip: '레버 다리 → 안개 늪 → 그림 암호 문! 레버·망루·오두막·밀기, 모두 할 일이 있어요.',
      start: { x: 120, y: 360 }, crate: { x: 230, y: 360, weight: w2 }, home: { x: 1150, y: 360 },
      ...river(340, 440, [280, 440]),
      levers: [lever(220, 620), lever(500, 640)],
      swamps: [swamp(640, 0, 880, 720, band(8, 10, 4))],
      lookouts: [{ x: 200, y: 110 }],
      gateDefs: [gateV(1000, 260, 480, code([540, 110], [[940, 640], [940, 540], [940, 200], [940, 100]], len(4)))],
      berries: [[540, 620], [940, 360], [1150, 620]] })
  ];
}

export const EXTRA_TEAM = extraLevels(false);
export const EXTRA_DUO = extraLevels(true);
