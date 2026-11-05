// 9번째 마을 '무지개 언덕': 색깔 문·저울 발판·밀물과 썰물·수학 문 6단계
//  (화면 꾸밈은 앞 마을들 것을 빌려 씀, 모둠 미션·짝 미션이 같은 장소를 쓰고 바구니 무게로 난이도를 맞춤)
import { vwall, gateV, scale, mathCode, L } from './levelkit.js';
import { R } from './geometry.js';

// 세로 울타리에 난 색깔 문 (바구니 80이 지나가는 동안 옆으로 친구도 지나갈 수 있는 너비)
const colorFence = (x, y1 = 265, y2 = 455) => ({ walls: vwall(x, [y1, y2]), door: R(x - 15, y1, x + 15, y2) });
const fences = (...list) => ({ walls: list.flatMap((f) => f.walls), colorDoors: list.map((f) => f.door) });
const TIDE = { period: 12000, low: 8000 };   // 8초 썰물(끝 2초는 예고) + 4초 밀물

function gimmickLevels(duo) {
  const w2 = duo ? 1 : 2;
  const P = (def) => ({ ...L({ minPlayers: 2, ...def }), pumpkinHolds: [] });
  const suffix = duo ? ' 둘이서' : '';
  return [
    P({ world: 0, name: `색깔 문 릴레이${suffix}`,
      tip: '🎨 문 위 구슬 색의 친구만 지나갈 수 있어요. 바구니는 지나가요! 뒤에 남은 친구가 문까지 밀면, 앞 친구가 잡기로 끌어가요.',
      crate: { x: 300, y: 360, weight: 1 },
      ...fences(colorFence(480), colorFence(840)),
      berries: [[300, 120], [660, 120], [1100, 600]] }),
    P({ world: 2, name: `저울 발판${suffix}`,
      tip: '⚖️ 모두 두 노란 판에 나눠 서서 양쪽 수를 똑같이! 바구니도 한 명으로 세요. 인원이 홀수면 바구니를 판에 올려요.',
      crate: { x: 250, y: 360, weight: w2 },
      gateDefs: [gateV(800, 285, 435, scale(R(300, 70, 540, 250), R(300, 470, 540, 650)))],
      berries: [[640, 120], [640, 600], [1130, 600]] }),
    P({ world: 1, name: `밀물과 썰물${suffix}`,
      tip: '🌊 물이 들어왔다 빠졌다 해요! 썰물일 때 건너고, 물이 들어오기 전에 가운데 땅으로 피해요.',
      crate: { x: 300, y: 360, weight: w2 },
      tides: [R(460, 0, 680, 720), R(860, 0, 1000, 720)], tide: TIDE,
      berries: [[300, 120], [770, 600], [1130, 600]] }),
    P({ world: 2, name: `수학 문${suffix}`,
      tip: '🧮 오두막에 들어간 친구 화면에만 문제가 보여요. 문제를 읽어 주면 다른 친구가 답이 적힌 발판을 밟아요!',
      crate: { x: 330, y: 360, weight: w2 },
      gateDefs: [gateV(900, 285, 435, mathCode([180, 110], [[430, 600], [560, 600], [690, 600], [820, 600]], 3))],
      berries: [[180, 620], [620, 120], [1130, 620]] }),
    P({ world: 1, name: `썰물 릴레이${suffix}`,
      tip: '🌊🎨 썰물 때 바구니를 색깔 문까지 옮기고, 앞 친구가 이어받아 다음 물길을 건너요.',
      crate: { x: 230, y: 360, weight: 1 },
      tides: [R(340, 0, 500, 720), R(780, 0, 940, 720)], tide: TIDE,
      ...fences(colorFence(640)),
      berries: [[230, 120], [570, 120], [1130, 600]] }),
    P({ world: 5, name: `무지개 대작전${suffix}`,
      tip: '⚖️ 저울 → 🧮 수학 문 → 🎨 색깔 문! 차례로 힘을 모아요.',
      crate: { x: 250, y: 360, weight: 1 },
      ...fences(colorFence(960)),
      gateDefs: [
        gateV(460, 285, 435, scale(R(140, 50, 370, 230), R(140, 490, 370, 670))),
        gateV(760, 285, 435, mathCode([600, 110], [[540, 600], [640, 600], [540, 490], [640, 490]], 3))
      ],
      berries: [[600, 360], [860, 120], [1130, 600]] })
  ];
}

export const GIMMICK_TEAM = gimmickLevels(false);
export const GIMMICK_DUO = gimmickLevels(true);
