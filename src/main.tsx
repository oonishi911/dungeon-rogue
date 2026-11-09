import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockSound } from './audio/sound';
import { EnemyAdmin } from './ui/EnemyAdmin';
import { ExploreDevScreen } from './ui/ExploreScreen';
import { GenAdmin } from './ui/GenAdmin';
import { MapViewer } from './ui/MapViewer';
import './styles.css';

const view = new URLSearchParams(location.search).get('view');

// スマホのブラウザは、画面に触れるかキーを押すまで音を出させてくれないので、そのときに音の準備をする
// （iPhone の Safari は、指を離したときでないと許さないことがあるので、離したときにも準備する）
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const) window.addEventListener(type, unlockSound, { capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 開発用：?view=map でマップ生成、?view=explore で探索の確認画面、?view=enemies で敵のマスターデータ、?view=gen でダンジョンの設定（生成・レベル）の管理画面を開く */}
    {{ map: <MapViewer />, explore: <ExploreDevScreen />, enemies: <EnemyAdmin />, gen: <GenAdmin /> }[view ?? ''] ?? <App />}
  </StrictMode>,
);
