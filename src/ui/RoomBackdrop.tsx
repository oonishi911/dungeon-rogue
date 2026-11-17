// 店と情報屋の背景：あの部屋（docs/story.md の、カーテンの閉まった部屋）。
// 思い出した記憶とかけらが増えるほど、カーテンのすきまが広がり、光が差し、机の上にコップが現れる。
// 飾りだけの絵で、読み上げには出さない。進み具合は story.ts の roomStage（0〜8）。

import type { CSSProperties } from 'react';
import { roomStage } from '../game/story';
import type { SaveData } from '../game/save';

/** コップが現れる進み具合 */
export const CUP_AT = 3;
/** 窓の外の、やわらかい明るさが差し始める進み具合 */
export const DAYLIGHT_AT = 5;

export function RoomBackdrop({ save }: { save: Pick<SaveData, 'memories' | 'fragments'> }) {
  const stage = roomStage(save);
  return (
    <div className="roomback" style={{ '--stage': stage } as CSSProperties} data-stage={stage} aria-hidden="true">
      <i className="roomback__daylight" />
      <i className="roomback__curtain roomback__curtain--l" />
      <i className="roomback__curtain roomback__curtain--r" />
      <i className="roomback__light" />
      <i className="roomback__desk" />
      {stage >= CUP_AT && <i className="roomback__cup" />}
    </div>
  );
}
