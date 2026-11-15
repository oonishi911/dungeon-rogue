import { describe, expect, it } from 'vitest';
import { deathKindOf } from './deathKind';

describe('倒れ方の種類（deathKind.ts）', () => {
  it('氷の敵は、体が硬くても砕ける', () => {
    expect(deathKindOf('ice_colossus', { element: 'ice', body: 'hard' })).toBe('shatter');
    expect(deathKindOf('ice_slime', { element: 'ice', body: 'soft' })).toBe('shatter');
  });

  it('霊体は消える', () => {
    expect(deathKindOf('shadow', { element: 'dark', body: 'spirit' })).toBe('vanish');
  });

  it('スライムは弾け、硬い敵は崩れ、ほかはつぶれて倒れる', () => {
    expect(deathKindOf('lava_slime', { element: 'fire', body: 'soft' })).toBe('burst');
    expect(deathKindOf('stone_golem', { element: 'neutral', body: 'hard' })).toBe('crumble');
    expect(deathKindOf('goblin', { element: 'neutral', body: 'normal' })).toBe('collapse');
    expect(deathKindOf('flame_hound', { element: 'fire', body: 'soft' })).toBe('collapse');
  });
});
