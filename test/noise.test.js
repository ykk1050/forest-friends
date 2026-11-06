import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoiseBanner, NoiseGate, levelFromRms } from '../public/js/noise.js';

test('소리 세기를 0~100 크기로 바꿈', () => {
  assert.equal(levelFromRms(0), 0);
  assert.equal(levelFromRms(0.001), 0);
  assert.equal(levelFromRms(1), 100);
  assert.equal(levelFromRms(0.1), 67);
});

const play = (gate, levels, step = 100, limit = 70) => levels.map((v, i) => gate.feed(v, limit, i * step));

test('기준을 넘는 소리가 2초 이어져야 경고', () => {
  const out = play(new NoiseGate(), Array(25).fill(80));
  assert.equal(out.indexOf(true), 20);
});

test('짧은 큰 소리는 경고하지 않음', () => {
  const levels = [...Array(10).fill(90), ...Array(20).fill(30), ...Array(10).fill(90)];
  assert.ok(!play(new NoiseGate(), levels).includes(true));
});

test('말소리처럼 잠깐씩 끊겨도 이어진 소리로 봄', () => {
  const levels = Array.from({ length: 30 }, (_, i) => (i % 5 === 4 ? 40 : 80));
  assert.ok(play(new NoiseGate(), levels).includes(true));
});

test('다른 탭을 봐서 1초마다 재더라도 경고할 수 있음', () => {
  assert.ok(play(new NoiseGate(), Array(5).fill(80), 1000).includes(true));
});

test('학생 경고: 기준을 넘으면 바로 켜지고 넘는 동안 계속 보냄', () => {
  const b = new NoiseBanner();
  assert.equal(b.feed(false, 0), null);
  assert.equal(b.feed(true, 100), true);
  assert.equal(b.feed(true, 200), null);
  assert.equal(b.feed(true, 1100), true);
});

test('학생 경고: 잠깐 조용해도 깜빡이지 않고 1초 뒤에 꺼짐', () => {
  const b = new NoiseBanner();
  b.feed(true, 0);
  assert.equal(b.feed(false, 500), null);
  assert.equal(b.feed(true, 700), null);
  assert.equal(b.feed(false, 1600), true);
  assert.equal(b.feed(false, 1700), false);
  assert.equal(b.feed(false, 1800), null);
});

test('학생 경고: 마이크를 끄면 켜져 있을 때만 끄라고 보냄', () => {
  const b = new NoiseBanner();
  assert.equal(b.off(), null);
  b.feed(true, 0);
  assert.equal(b.off(), false);
});

test('reset 뒤에는 처음부터 다시 잼', () => {
  const gate = new NoiseGate();
  play(gate, Array(25).fill(80));
  gate.reset();
  assert.equal(gate.feed(80, 70, 2500), false);
});
