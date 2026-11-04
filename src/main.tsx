import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExploreScreen } from './ui/ExploreScreen';
import { MapViewer } from './ui/MapViewer';
import './styles.css';

const view = new URLSearchParams(location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 開発用：?view=map でマップ生成、?view=explore で探索の確認画面を開く */}
    {{ map: <MapViewer />, explore: <ExploreScreen /> }[view ?? ''] ?? <App />}
  </StrictMode>,
);
