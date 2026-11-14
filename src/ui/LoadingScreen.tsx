// ゲームの始まりの読み込み画面。テクスチャと音をすべて読み込むまで出す（preload.ts）。

import { useEffect, useState } from 'react';
import { preloadAll } from '../preload';

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  useEffect(() => {
    let alive = true;
    void preloadAll((done, total) => alive && setProgress({ done, total })).then(() => alive && onDone());
    return () => {
      alive = false;
    };
    // 読み込みは1回だけ
  }, []);
  const rate = progress.total ? progress.done / progress.total : 0;
  return (
    <main className="screen screen--narrow loading">
      <h1 className="top__title loading__title">出発前夜</h1>
      <div className="loading__bar" role="progressbar" aria-label="読み込み" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <div className="loading__fill" style={{ width: `${rate * 100}%` }} />
      </div>
      <p className="muted loading__text">
        絵と音を読み込んでいます（{progress.done}/{progress.total}）
      </p>
    </main>
  );
}
