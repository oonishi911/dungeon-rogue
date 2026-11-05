import { describe, expect, it } from 'vitest';
import { knobOffset, stickDirection } from './stick';

describe('stickDirection', () => {
  const r = 100; // 土台の半径

  it('中心付近では向きを決めない', () => {
    expect(stickDirection(0, 0, r)).toBeNull();
    expect(stickDirection(15, -15, r)).toBeNull();
  });

  it('上下左右は、指を置いた点から見た向きで決まる（画面の y は下向き）', () => {
    expect(stickDirection(0, -60, r)).toBe('up');
    expect(stickDirection(0, 60, r)).toBe('down');
    expect(stickDirection(-60, 0, r)).toBe('left');
    expect(stickDirection(60, 0, r)).toBe('right');
  });

  it('斜めのときは、ずれの大きいほうの向きになる', () => {
    expect(stickDirection(50, -30, r)).toBe('right');
    expect(stickDirection(30, -50, r)).toBe('up');
  });

  it('土台の外まで指を動かしても、向きは決まる', () => {
    expect(stickDirection(-300, 20, r)).toBe('left');
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
