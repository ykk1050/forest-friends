// 서버와 브라우저가 함께 쓰는 값. 좌표 단위는 '칸'(가로 1280 × 세로 720)
export const GAME_TITLE = '숲속 친구들 대작전';
export const FIELD = { w: 1280, h: 720 };

export const RULES = {
  playerR: 18,
  speed: 230,
  steer: 12,           // 조작에 반응하는 빠르기 (얼음 위에서는 아주 작아짐)
  iceSteer: 1.2,
  mudSpeed: 0.45,      // 진흙에서는 이만큼만 빠르게
  crateHalf: 40,       // 바구니(상자) 반 크기 → 80×80
  crateSpeed: 150,
  grabDist: 32,        // 바구니 테두리에서 이만큼 안이면 잡을 수 있음
  safeMs: 1600,        // 처음 자리로 돌아간 뒤 잠깐 무적
  plateR: 34,
  cratePlateR: 56,
  berryR: 26,
  homeSize: 170,
  leverR: 36,          // 레버·망루·표지판 앞에 '서 있다'고 보는 거리
  signR: 60,
  lookoutR: 50,
  resultMs: 12000      // 결과 화면에서 다음 단계로 자동으로 넘어가기까지
};

export const TICK_HZ = 20;
export const TEAM_COUNT = 8;
export const TEAM_MAX = 5;
export const TEAM_RECOMMENDED = 3;

// 모둠 안 자리(슬롯)마다 정해지는 목도리 색 — 발판 색과 같음 (6번째는 함께하는 선생님 자리)
export const COLORS = ['#29b6f6', '#ff5fa2', '#ffc928', '#5bd65b', '#ff8a3d', '#a77bff'];
export const COLOR_NAMES = ['파랑', '분홍', '노랑', '초록', '주황', '보라'];

export const ANIMALS = [
  { id: 'bear', name: '곰', emoji: '🐻' },
  { id: 'rabbit', name: '토끼', emoji: '🐰' },
  { id: 'fox', name: '여우', emoji: '🦊' },
  { id: 'panda', name: '판다', emoji: '🐼' },
  { id: 'penguin', name: '펭귄', emoji: '🐧' }
];
export const TEACHER_ANIMAL = { id: 'owl', name: '부엉이 선생님', emoji: '🦉' };

export const WORLDS = [
  { name: '꽃밭 마을', emoji: '🌼', crate: '과일 바구니' },
  { name: '시냇가', emoji: '💧', crate: '호박' },
  { name: '꿀벌 숲', emoji: '🐝', crate: '꿀단지' },
  { name: '눈 덮인 산', emoji: '❄️', crate: '선물 상자' },
  { name: '노을 계곡', emoji: '🌅', crate: '왕도토리' },
  { name: '수수께끼 숲', emoji: '🔮', crate: '보물 상자' }
];
// 학생 지도의 마을 묶음 (6단계씩). 7·8번째 마을은 위 마을들의 꾸밈을 빌려 씀
export const MAP_GROUPS = [...WORLDS, { name: '물안개 호수', emoji: '🌫️' }, { name: '비밀 섬', emoji: '🏝️' }];
