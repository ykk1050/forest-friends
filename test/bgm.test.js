import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, WORLD_TRACKS, parseBar, chordInfo, noteFreq, expandTrack, trackSeconds } from '../public/js/bgm-tracks.js';
import { WORLDS } from '../shared/constants.js';

test('BGM은 9곡, 마을 테마마다 곡이 있음', () => {
  assert.equal(Object.keys(TRACKS).length, 9);
  assert.ok(WORLD_TRACKS.length >= WORLDS.length);
  for (const id of WORLD_TRACKS) assert.ok(TRACKS[id], id);
});

for (const [id, t] of Object.entries(TRACKS)) {
  test(`${t.title}: 모든 마디 길이가 박자에 맞고 음·코드를 읽을 수 있음`, () => {
    const eighths = t.beats * 2;
    for (const key of ['A', 'B']) {
      const sec = t[key];
      if (!sec) continue;
      const mel = sec.mel.split('|'), chords = sec.chords.split('|');
      assert.equal(mel.length, chords.length, `${key} 멜로디와 코드 마디 수`);
      mel.forEach((m, i) => {
        const { notes, total } = parseBar(m);
        assert.equal(total, eighths, `${key} ${i + 1}마디: ${m}`);
        notes.forEach((n) => assert.ok(noteFreq(n.name) > 100));
      });
      chords.forEach((c) => c.split(' ').forEach((ch) => assert.ok(chordInfo(ch).freqs.length >= 3)));
    }
    assert.ok(expandTrack(t).length > 0);
  });

  test(`${t.title}: 길이가 계획대로`, () => {
    const s = trackSeconds(t);
    if (id === 'clear') assert.ok(s >= 3 && s <= 4, `${s}초`);
    else if (id === 'ending') assert.ok(s >= 8 && s <= 11, `${s}초`);
    else assert.ok(s >= 55 && s <= 95, `${s}초`);
  });
}

test('A음 기준 음높이가 맞음', () => {
  assert.ok(Math.abs(noteFreq('A4') - 440) < 0.01);
  assert.ok(Math.abs(noteFreq('C5') - 523.25) < 0.1);
  assert.ok(Math.abs(noteFreq('Bb5') - 932.33) < 0.1);
});
