import { describe, expect, it } from 'vitest';
import { padDirection } from './dpad';

describe('padDirection', () => {
  const r = 100; // パッドの半径

  it('中心付近では向きを決めない', () => {
    expect(padDirection(0, 0, r)).toBeNull();
    expect(padDirection(15, -15, r)).toBeNull();
  });

  it('上下左右は、中心から見た指の向きで決まる（画面の y は下向き）', () => {
    expect(padDirection(0, -60, r)).toBe('up');
    expect(padDirection(0, 60, r)).toBe('down');
    expect(padDirection(-60, 0, r)).toBe('left');
    expect(padDirection(60, 0, r)).toBe('right');
  });

  it('斜めのときは、ずれの大きいほうの向きになる', () => {
    expect(padDirection(50, -30, r)).toBe('right');
    expect(padDirection(30, -50, r)).toBe('up');
  });

  it('パッドの外まで指を滑らせても、向きは決まる', () => {
    expect(padDirection(-300, 20, r)).toBe('left');
  });
});
