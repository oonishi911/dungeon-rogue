import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockSound } from './audio/sound';
import { ExploreDevScreen } from './ui/ExploreScreen';
import { MapViewer } from './ui/MapViewer';
import './styles.css';

const view = new URLSearchParams(location.search).get('view');

// スマホのブラウザは、画面に触れるかキーを押すまで音を出させてくれないので、そのときに音の準備をする
// （iPhone の Safari は、指を離したときでないと許さないことがあるので、離したときにも準備する）
for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const) window.addEventListener(type, unlockSound, { capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 開発用：?view=map でマップ生成、?view=explore で探索の確認画面を開く */}
    {{ map: <MapViewer />, explore: <ExploreDevScreen /> }[view ?? ''] ?? <App />}
  </StrictMode>,
);
