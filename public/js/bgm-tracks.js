// 게임 BGM 악보 9곡. 이 게임을 위해 새로 쓴 곡이고, 음원 파일 없이 bgm.js가 Web Audio로 연주함
// 멜로디: '음이름/길이'(길이는 8분음표 수), '-'는 쉼표, '|'는 마디 구분
// 코드: 마디마다 하나, 한 마디에 둘이면 띄어쓰기 ('Dm G')
// gain: 곡마다 들리는 크기를 맞추는 값 (렌더링으로 잰 RMS 기준)
// form: 연주 순서. 끝에 +가 붙으면 멜로디를 높은 소리로 겹쳐 조금 풍성하게

export const TRACKS = {
  lobby: {
    title: '대기실', sub: '숲속 광장에 모여요', gain: 0.8, bpm: 96, beats: 4, lead: 'flute', comp: 'bounce', perc: 'soft', loop: true,
    form: ['A', 'A+', 'B'],
    A: {
      chords: 'C|Am|F|G|C|Am|Dm G|C',
      mel: 'E5/2 G5/2 C6/3 B5/1|A5/2 G5/2 E5/4|F5/2 A5/2 D6/3 C6/1|B5/2 A5/2 G5/4|E5/2 G5/2 C6/3 D6/1|E6/2 D6/2 C6/2 A5/2|G5/2 A5/2 F5/2 D5/2|C5/6 -/2'
    },
    B: {
      chords: 'Am|F|G|C|Am|F|G|G7',
      mel: 'A5/3 G5/1 E5/2 C5/2|F5/3 E5/1 C5/4|G5/3 F5/1 D5/2 B4/2|E5/3 D5/1 C5/4|A5/3 G5/1 E5/2 C5/2|F5/2 A5/2 C6/4|B5/2 G5/2 D5/2 F5/2|G5/8'
    }
  },
  flower: {
    title: '꽃밭 마을', sub: '통통 튀는 나무 실로폰', gain: 1.25, bpm: 112, beats: 4, lead: 'mallet', comp: 'bounce', perc: 'soft', loop: true,
    form: ['A', 'A+', 'B', 'A'],
    A: {
      chords: 'F|F|C|F|Dm|Bb|C|F',
      mel: 'C5/1 F5/1 A5/2 G5/1 F5/1 D5/2|C5/1 F5/1 A5/2 C6/4|Bb5/1 A5/1 G5/2 E5/1 G5/1 C6/2|A5/2 F5/2 C5/4|C5/1 F5/1 A5/2 G5/1 F5/1 D5/2|D5/1 F5/1 Bb5/2 D6/4|C6/1 Bb5/1 A5/2 G5/2 E5/2|F5/6 -/2'
    },
    B: {
      chords: 'Bb|C|Am F|Dm C|Bb|Gm|F C|C7',
      mel: 'D6/2 C6/1 A5/1 Bb5/2 A5/1 F5/1|G5/2 F5/1 D5/1 E5/4|A5/2 G5/1 E5/1 F5/2 E5/1 C5/1|D5/2 E5/2 F5/2 G5/2|D6/2 C6/1 A5/1 Bb5/2 A5/1 F5/1|G5/2 Bb5/2 D6/4|C6/2 A5/2 Bb5/2 G5/2|C6/8'
    }
  },
  stream: {
    title: '시냇가', sub: '졸졸 흐르는 물결', gain: 0.8, bpm: 88, beats: 4, lead: 'flute', comp: 'arp', perc: 'none', loop: true,
    form: ['A', 'A+', 'B', 'A'],
    A: {
      chords: 'G|Em|C|Am|C|G|D|G',
      mel: 'D5/4 G5/2 A5/2|B5/6 A5/2|G5/4 E5/2 D5/2|E5/6 -/2|C5/4 E5/2 G5/2|B5/4 A5/2 G5/2|A5/4 F#5/2 D5/2|G5/6 -/2'
    },
    B: {
      chords: 'Em|Am|D|G|C|Em|Am|D',
      mel: 'E5/4 G5/2 B5/2|A5/6 G5/2|F#5/4 A5/2 D6/2|B5/6 -/2|C6/4 B5/2 A5/2|G5/4 E5/2 G5/2|A5/2 B5/2 C6/2 A5/2|D6/8'
    }
  },
  bee: {
    title: '꿀벌 숲', sub: '살금살금, 윙윙', gain: 1.6, bpm: 120, beats: 4, lead: 'pluck', comp: 'pick', perc: 'shaker', loop: true,
    form: ['A', 'A+', 'B', 'A'],
    A: {
      chords: 'Am|D|Am|G|Am|F|Em|Am',
      mel: 'A4/1 C5/1 E5/1 -/1 A5/1 G5/1 E5/1 -/1|D5/1 F#5/1 A5/1 -/1 G5/1 E5/1 D5/1 -/1|A4/1 C5/1 E5/1 -/1 A5/1 B5/1 C6/1 -/1|B5/1 A5/1 G5/1 E5/1 D5/2 -/2|A4/1 C5/1 E5/1 -/1 A5/1 G5/1 E5/1 -/1|F5/1 A5/1 C6/1 -/1 B5/1 A5/1 G5/1 -/1|E5/1 G5/1 B5/1 -/1 A5/1 G5/1 E5/1 D5/1|A4/4 -/4'
    },
    B: {
      chords: 'C|F|C|Em|G|G|F|E',
      mel: 'C6/1 -/1 C6/1 B5/1 A5/2 G5/2|F5/1 -/1 F5/1 G5/1 A5/4|C6/1 -/1 C6/1 B5/1 A5/2 G5/2|E5/1 G5/1 B5/1 -/1 E6/4|D6/1 -/1 D6/1 C6/1 B5/2 A5/2|G5/1 -/1 G5/1 A5/1 B5/4|C6/1 B5/1 A5/1 G5/1 F5/1 E5/1 D5/1 C5/1|B4/2 E5/2 G#5/4'
    }
  },
  snow: {
    title: '눈 덮인 산', sub: '오르골 왈츠', gain: 1.4, bpm: 90, beats: 3, lead: 'bell', comp: 'waltz', perc: 'none', loop: true,
    form: ['A', 'A+', 'B', 'A'],
    A: {
      chords: 'D|A|Bm|D|G|G|A|D',
      mel: 'F#5/2 A5/2 D6/2|C#6/2 A5/2 E5/2|D5/2 F#5/2 B5/2|A5/6|G5/2 B5/2 E6/2|D6/2 B5/2 G5/2|E5/2 A5/2 C#6/2|D6/6'
    },
    B: {
      chords: 'Em|D|Em|A|G|D|A|D',
      mel: 'B5/3 A5/1 G5/2|F#5/3 E5/1 D5/2|G5/3 F#5/1 E5/2|A5/6|B5/3 A5/1 G5/2|F#5/2 A5/2 D6/2|E6/2 D6/2 C#6/2|D6/4 A5/2'
    }
  },
  sunset: {
    title: '노을 계곡', sub: '해 질 녘 산들바람', gain: 0.8, bpm: 88, beats: 4, lead: 'flute', comp: 'strum', perc: 'soft', loop: true,
    form: ['A', 'A+', 'B'],
    A: {
      chords: 'A|F#m|D|E|A|Bm|E|A',
      mel: 'A4/3 C#5/1 E5/4|F#5/3 E5/1 C#5/4|D5/3 F#5/1 A5/4|E5/6 -/2|A4/3 C#5/1 E5/2 A5/2|B5/3 A5/1 F#5/4|G#5/2 E5/2 F#5/2 G#5/2|A5/6 -/2'
    },
    B: {
      chords: 'F#m|A|D|A|F#m|A|A E|E',
      mel: 'F#5/4 A5/2 B5/2|C#6/6 A5/2|D6/4 C#6/2 B5/2|A5/6 -/2|F#5/4 A5/2 B5/2|C#6/4 E6/2 D6/2|C#6/2 B5/2 A5/2 G#5/2|E5/8'
    }
  },
  mystery: {
    title: '수수께끼 숲', sub: '조용히 생각하는 시간', gain: 1, bpm: 84, beats: 4, lead: 'bell', comp: 'pad', perc: 'none', loop: true, quiet: true,
    form: ['A', 'A', 'B', 'A'],
    A: {
      chords: 'Em|Bm|Am|Em|C|D|Bm|Em',
      mel: '-/2 E5/2 G5/4|-/2 F#5/2 B4/4|-/2 E5/2 A5/4|G5/6 -/2|-/2 C5/2 E5/4|-/2 D5/2 F#5/4|-/2 D5/2 B4/4|E5/6 -/2'
    },
    B: {
      chords: 'Em|C|Am|D|C|Am|B|Em',
      mel: 'B5/6 A5/2|G5/6 -/2|A5/6 G5/2|F#5/6 -/2|E5/4 G5/4|C6/6 B5/2|A5/2 F#5/2 B5/2 D#5/2|E5/6 -/2'
    }
  },
  clear: {
    title: '단계 성공', sub: '짧은 축하 음악', gain: 1.3, bpm: 140, beats: 4, lead: 'mallet', comp: 'none', perc: 'none', loop: false,
    form: ['A+'],
    A: {
      chords: 'C|G C',
      mel: 'C5/1 E5/1 G5/1 C6/1 E6/2 G6/2|F6/1 E6/1 D6/1 B5/1 C6/4'
    }
  },
  ending: {
    title: '모든 단계 완료', sub: '큰 축하 음악', gain: 1.2, bpm: 120, beats: 4, lead: 'mallet', comp: 'strum', perc: 'none', loop: false,
    form: ['A+'],
    A: {
      chords: 'C|F|G|C|C',
      mel: 'C5/2 E5/2 G5/2 C6/2|A5/2 C6/2 F6/4|G5/2 B5/2 D6/2 G6/2|C6/2 E6/2 G6/2 E6/2|C6/8'
    }
  }
};

// 마을 번호(constants.js WORLDS 순서) → 곡
export const WORLD_TRACKS = ['flower', 'stream', 'bee', 'snow', 'sunset', 'mystery'];

// ---------- 악보 읽기 ----------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 'F#5' → 주파수(Hz)
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`잘못된 음: ${name}`);
  const semi = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((semi + (+m[3] + 1) * 12 - 69) / 12);
}

// 'Bm', 'G7' → { root, freqs: [근음부터 코드 음들(4옥타브 부근)], bass }
export function chordInfo(name) {
  const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(name);
  if (!m) throw new Error(`잘못된 코드: ${name}`);
  const root = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const steps = [0, m[3] ? 3 : 4, 7, ...(m[4] ? [10] : [])];
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  return { freqs: steps.map((s) => hz(60 + root + s)), bass: hz(36 + ((root + 12) % 12)) };
}

// 'C5/2 -/2' → [{ at: 시작(8분음표), len, name }]
export function parseBar(text) {
  let at = 0;
  const notes = [];
  for (const tok of text.trim().split(/\s+/)) {
    const [name, len] = tok.split('/');
    if (name !== '-') notes.push({ at, len: +len, name });
    at += +len;
  }
  return { notes, total: at };
}

// 곡 전체를 마디 목록으로 펼침: [{ notes, chords: [..], double }]
export function expandTrack(track) {
  const bars = [];
  for (const part of track.form) {
    const sec = track[part.replace('+', '')];
    const mel = sec.mel.split('|'), chords = sec.chords.split('|');
    mel.forEach((m, i) => bars.push({ notes: parseBar(m).notes, chords: chords[i].split(' '), double: part.endsWith('+') }));
  }
  return bars;
}

export const barSeconds = (track) => (track.beats * 60) / track.bpm;
export const trackSeconds = (track) => expandTrack(track).length * barSeconds(track);
