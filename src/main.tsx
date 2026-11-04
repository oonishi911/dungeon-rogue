import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MapViewer } from './ui/MapViewer';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 開発用：?view=map でマップ生成の確認画面を開く */}
    {new URLSearchParams(location.search).get('view') === 'map' ? <MapViewer /> : <App />}
  </StrictMode>,
);
