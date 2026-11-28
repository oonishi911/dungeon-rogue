// 管理画面の「クリア率を測る」を、画面を止めずに裏で動かす（2026-11-29）。中身は clearCheck.ts
import { measureCheck } from './clearCheck';
import type { DungeonFile } from './genMaster';

export type CheckRequest = { id: string; published: DungeonFile | null; draft: DungeonFile; trials: number };
export type CheckReply = { kind: 'step'; done: number; total: number } | { kind: 'done'; result: ReturnType<typeof measureCheck> } | { kind: 'error'; message: string };

self.onmessage = (e: MessageEvent<CheckRequest>) => {
  const { id, published, draft, trials } = e.data;
  const post = (m: CheckReply) => self.postMessage(m);
  try {
    const result = measureCheck(id, published, draft, trials, (done, total) => post({ kind: 'step', done, total }));
    post({ kind: 'done', result });
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
