import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockSound } from './audio/sound';
import { Admin } from './ui/Admin';
import { ExploreDevScreen } from './ui/ExploreDevScreen';
import { MapViewer } from './ui/MapViewer';
import './styles.css';

const view = new URLSearchParams(location.search).get('view');

// スマホのブラウザは、画面に触れるかキーを押すまで音を出させてくれないので、そのときに音の準備をする
// （iPhone の Safari は、指を離したときでないと許さないことがあるので、離したときにも準備する）
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const) window.addEventListener(type, unlockSound, { capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 開発用：?view=map でマップ生成、?view=explore で探索の確認画面、?view=admin で管理画面（敵のマスターデータ・ダンジョンの設定。前の ?view=enemies と ?view=gen も、同じ画面の合うタブを開く）を開く */}
    {{ map: <MapViewer />, explore: <ExploreDevScreen />, admin: <Admin />, enemies: <Admin />, gen: <Admin /> }[view ?? ''] ?? <App />}
  </StrictMode>,
);
