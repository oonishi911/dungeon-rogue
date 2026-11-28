// 操作の説明の画面（2026-11-28）：3D画面の上に重ねて出す。使っている端末（指かマウスか）の説明を先に出す。
// 中身は controlsHelp.ts

import { useState, useSyncExternalStore } from 'react';
import { COMMON_HELP, keyboardHelp, TOUCH_HELP, type HelpRow } from './controlsHelp';
import { feelSettings, subscribeFeel } from './feelSettings';

function Rows({ rows }: { rows: HelpRow[] }) {
  return (
    <dl className="help__rows">
      {rows.map((r) => (
        <div key={r.how} className="help__row">
          <dt>{r.how}</dt>
          <dd>{r.what}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ControlsHelp({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  // もう一方の端末の操作は、押したときだけ出す（狭い画面で長くならないように）
  const [other, setOther] = useState(false);
  const keys = useSyncExternalStore(subscribeFeel, feelSettings).keys;
  const keyboard = (
    <section key="keyboard" aria-labelledby="help-keyboard">
      <h3 id="help-keyboard" className="help__head">
        キーボード・マウス
      </h3>
      <Rows rows={keyboardHelp(keys)} />
    </section>
  );
  const finger = (
    <section key="touch" aria-labelledby="help-touch">
      <h3 id="help-touch" className="help__head">
        スマホ（指）
      </h3>
      <Rows rows={TOUCH_HELP} />
    </section>
  );
  return (
    <div className="help" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="help__panel">
        <h2 id="help-title" className="help__title">
          操作の説明
        </h2>
        <div className="help__body">
          {touch ? finger : keyboard}
          {other ? (
            touch ? keyboard : finger
          ) : (
            <button type="button" className="help__other" onClick={() => setOther(true)}>
              {touch ? 'キーボード・マウスの操作も見る' : 'スマホ（指）の操作も見る'}
            </button>
          )}
          <section aria-labelledby="help-common">
            <h3 id="help-common" className="help__head">
              どちらでも
            </h3>
            <Rows rows={COMMON_HELP} />
          </section>
        </div>
        <button type="button" className="primary help__close" autoFocus onClick={onClose}>
          わかった
        </button>
        <p className="help__note">上の「操作」から、いつでもまた開けます。</p>
      </div>
    </div>
  );
}
