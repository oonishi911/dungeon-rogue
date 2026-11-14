// ブラウザの「戻る」を一度受け止めて、ページを離れるかを確かめる。

import { useEffect, useState } from 'react';

const BACK_GUARD_REARM_MS = 600;

/** ブラウザの「戻る」を受け止めるための見張りを、履歴に1つ積む（もう積んであれば何もしない） */
function armBackGuard() {
  const state: unknown = history.state;
  const armed = typeof state === 'object' && state !== null && (state as { backGuard?: boolean }).backGuard === true;
  if (!armed) history.pushState({ backGuard: true }, '');
}

/**
 * ブラウザの「戻る」を一度受け止める：履歴に「見張り」を1つ積んでおき、戻るで見張りが外れたら、ページを離れるかを確かめる。
 * 完全には防げない（iPhone の端からのスワイプや、戻るの連打は止められない。画面に一度も触れていないと、ブラウザが見張りを無視することもある）。
 * 途中の状態は保存してあるので、離れてしまっても続きから遊べる
 */
export function useBackGuard(enabled: boolean) {
  // ブラウザの「戻る」が押されて、ページを離れるかを確かめているところ
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    armBackGuard();
    const onPop = () => setLeaving(true);
    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', armBackGuard); // 離れたあと、進むで戻ってきたときに張り直す
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', armBackGuard);
    };
  }, [enabled]);
  const stay = () => {
    armBackGuard();
    setLeaving(false);
  };
  const leave = () => {
    setLeaving(false);
    history.back();
    // 戻る先がなくてページに残ったときは、見張りを張り直す
    window.setTimeout(armBackGuard, BACK_GUARD_REARM_MS);
  };
  return { leaving, stay, leave };
}
