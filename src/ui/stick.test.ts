import { describe, expect, it } from 'vitest';
import type { Dir } from '../game/explore';
import { chooseDirection, knobOffset, stickDirections } from './stick';

describe('stickDirections', () => {
  const r = 100; // 土台の半径

  it('中心付近では向きを決めない', () => {
    expect(stickDirections(0, 0, r)).toBeNull();
    expect(stickDirections(15, -15, r)).toBeNull();
  });

  it('まっすぐ倒したら、候補はその向き1つ（画面の y は下向き）', () => {
    expect(stickDirections(0, -60, r)).toEqual(['up']);
    expect(stickDirections(0, 60, r)).toEqual(['down']);
    expect(stickDirections(-60, 0, r)).toEqual(['left']);
    expect(stickDirections(60, 0, r)).toEqual(['right']);
  });

  it('少しだけ斜めなら、まっすぐとみなす', () => {
    expect(stickDirections(60, -20, r)).toEqual(['right']);
    expect(stickDirections(-15, 60, r)).toEqual(['down']);
  });

  it('斜めに倒したら、上下と左右の2つを、上下を先にして返す', () => {
    expect(stickDirections(-50, -50, r)).toEqual(['up', 'left']);
    expect(stickDirections(50, -40, r)).toEqual(['up', 'right']);
    expect(stickDirections(-45, 55, r)).toEqual(['down', 'left']);
  });

  it('土台の外まで指を動かしても、向きは決まる', () => {
    expect(stickDirections(-300, 20, r)).toEqual(['left']);
  });
});

describe('chooseDirection', () => {
  const only = (...ok: Dir[]) => (d: Dir) => ok.includes(d);

  it('左上に倒して、左にだけ進めるなら左', () => {
    expect(chooseDirection(['up', 'left'], only('left'))).toBe('left');
  });

  it('左上に倒して、上にだけ進めるなら上', () => {
    expect(chooseDirection(['up', 'left'], only('up'))).toBe('up');
  });

  it('左上に倒して、どちらにも進めるなら上', () => {
    expect(chooseDirection(['up', 'left'], only('up', 'left'))).toBe('up');
  });

  it('どちらにも進めなければ、最初の候補（壁にぶつかって知らせる）', () => {
    expect(chooseDirection(['up', 'left'], only())).toBe('up');
  });
});

describe('knobOffset', () => {
  it('土台の内側ならそのままの位置', () => {
    expect(knobOffset(30, -40, 100)).toEqual({ x: 30, y: -40 });
  });

  it('土台の外なら、同じ向きのまま縁に止める', () => {
    const k = knobOffset(300, 400, 100);
    expect(k.x).toBeCloseTo(60);
    expect(k.y).toBeCloseTo(80);
  });
});
