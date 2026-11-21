// 開発用：記憶の画面を単独で開く（?view=memory&boss=flame_beast。boss を省くと炎の魔獣）。
// 動く場面（MemoryMovie.tsx）の見た目の確認に使う。最後まで進めると、同じ場面をもう一度出す。

import { useState } from 'react';
import { MEMORIES, roomScene, type Scene } from '../game/story';
import { MemoryScreen } from './MemoryScreen';

export function MemoryDevScreen() {
  const boss = new URLSearchParams(location.search).get('boss') ?? 'flame_beast';
  const memory = MEMORIES[boss];
  const [round, setRound] = useState(0);
  if (!memory) return <p>記憶にないボス：{boss}（{Object.keys(MEMORIES).join('・')}）</p>;
  const scene: Scene = { kind: 'memory', boss, room: roomScene(0), memory, ending: null };
  return <MemoryScreen key={round} scene={scene} onDone={() => setRound(round + 1)} />;
}
