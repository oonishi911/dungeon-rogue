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

  it('斜め45度の線から22.5度より外れていれば、まっすぐとみなす', () => {
    // 右から20度ほど上：右だけ
    expect(stickDirections(60, -22, r)).toEqual(['right']);
    // 下から20度ほど左：下だけ
    expect(stickDirections(-22, 60, r)).toEqual(['down']);
  });

  it('斜め（右から22.5〜67.5度）なら、指の向きに近い方を先にした2つを返す', () => {
    // 右上で右寄り（右から約30度）：右、だめなら上
    expect(stickDirections(60, -35, r)).toEqual(['right', 'up']);
    // 右上で上寄り（右から約60度）：上、だめなら右
    expect(stickDirections(35, -60, r)).toEqual(['up', 'right']);
    // 左下で左寄り：左、だめなら下
    expect(stickDirections(-60, 35, r)).toEqual(['left', 'down']);
    // 左上で上寄り：上、だめなら左
    expect(stickDirections(-35, -60, r)).toEqual(['up', 'left']);
    // 右下で下寄り：下、だめなら右
    expect(stickDirections(35, 60, r)).toEqual(['down', 'right']);
  });

  it('ちょうど45度なら上下を先にする', () => {
    expect(stickDirections(-50, -50, r)).toEqual(['up', 'left']);
    expect(stickDirections(50, 50, r)).toEqual(['down', 'right']);
  });

  it('土台の外まで指を動かしても、向きは決まる', () => {
    expect(stickDirections(-300, 20, r)).toEqual(['left']);
  });
});

describe('chooseDirection', () => {
  const only = (...ok: Dir[]) => (d: Dir) => ok.includes(d);

  it('右寄りの右上で、右に進めないなら上', () => {
    expect(chooseDirection(['right', 'up'], only('up'))).toBe('up');
  });

  it('右寄りの右上で、上に進めないなら右', () => {
    expect(chooseDirection(['right', 'up'], only('right'))).toBe('right');
  });

  it('どちらにも進めるなら、指の向きに近い方（先の候補）', () => {
    expect(chooseDirection(['right', 'up'], only('up', 'right'))).toBe('right');
    expect(chooseDirection(['up', 'right'], only('up', 'right'))).toBe('up');
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
