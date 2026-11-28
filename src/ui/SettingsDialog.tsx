// 設定の画面（2026-11-28）：音・演出（画面の揺れ・ヒットストップ）・表示（文字の大きさ・頭上の弱点の印）・キーの割り当てを、ひとつの画面で変える。
// 探索の画面の上の「設定」と、ダンジョンを選ぶ画面の「設定」から開く。変えた設定はブラウザに保存する（audio/settings.ts・feelSettings.ts）

import { useEffect, useState, useSyncExternalStore } from 'react';
import { playSample, setSoundSettings, soundSettings, unlockSound } from '../audio/sound';
import type { SoundSettings } from '../audio/settings';
import { DEFAULT_FEEL_SETTINGS, feelSettings, setFeelSettings, subscribeFeel, TEXT_SIZE_NAMES, TEXT_SIZES } from './feelSettings';
import { BIND_IDS, BIND_NAMES, canBind, DEFAULT_BINDINGS, keyLabel, rebind, type BindId } from './keyBindings';

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className="settings__switch" aria-pressed={on} onClick={onToggle}>
      <span>{label}</span>
      <span className="settings__state">{on ? 'あり' : 'なし'}</span>
    </button>
  );
}

export function SettingsDialog({ onClose, keyboard = true }: { onClose: () => void; keyboard?: boolean }) {
  const [sound, setSound] = useState<SoundSettings>(soundSettings);
  const feel = useSyncExternalStore(subscribeFeel, feelSettings);
  /** キーを待っている操作（「変える」を押したあと、次に押したキーを割り当てる） */
  const [listening, setListening] = useState<BindId | null>(null);
  const [note, setNote] = useState('');

  const changeSound = (next: SoundSettings) => {
    setSound(next);
    setSoundSettings(next);
  };

  // キーを先に受け取る（探索の画面のキー操作より先に。開いているあいだは、ほかのキー操作を止める）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (listening) {
        e.preventDefault();
        if (e.key === 'Escape') {
          setListening(null);
          setNote('');
          return;
        }
        if (!canBind(e.key)) {
          setNote(`「${e.key === 'Enter' ? 'Enter' : keyLabel(e.key)}」は使えません（数字・矢印・Enter・Esc・「.」は決まった働きがあります）`);
          return;
        }
        const now = feelSettings();
        const next = rebind(now.keys, listening, e.key);
        const swapped = BIND_IDS.find((o) => o !== listening && next[o] !== now.keys[o]);
        setFeelSettings({ ...now, keys: next });
        setNote(swapped ? `「${BIND_NAMES[swapped]}」と入れ替えました` : '');
        setListening(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening, onClose]);

  return (
    <div className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings__panel">
        <h2 id="settings-title" className="settings__title">
          設定
        </h2>
        <div className="settings__body">
          <section aria-labelledby="settings-sound" className="settings__group">
            <h3 id="settings-sound" className="settings__head">
              音
            </h3>
            <Switch
              on={sound.enabled}
              label="音を鳴らす"
              onToggle={() => {
                const next = { ...sound, enabled: !sound.enabled };
                changeSound(next);
                if (next.enabled) {
                  unlockSound();
                  playSample();
                }
              }}
            />
            <label className="settings__volume">
              <span>
                効果音 <output>{Math.round(sound.volume * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(sound.volume * 100)}
                disabled={!sound.enabled}
                onChange={(e) => changeSound({ ...sound, volume: Number(e.target.value) / 100 })}
                // つまみを離したときに、その音量で試しに鳴らす
                onPointerUp={() => playSample()}
                onKeyUp={() => playSample()}
              />
            </label>
            {/* 環境音はダンジョンにいるあいだ流れているので、つまみを動かすとそのまま大きさが変わる */}
            <label className="settings__volume">
              <span>
                環境音 <output>{Math.round(sound.ambient * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(sound.ambient * 100)}
                disabled={!sound.enabled}
                onChange={(e) => changeSound({ ...sound, ambient: Number(e.target.value) / 100 })}
              />
            </label>
          </section>

          <section aria-labelledby="settings-feel" className="settings__group">
            <h3 id="settings-feel" className="settings__head">
              演出
            </h3>
            <Switch on={feel.shake} label="画面の揺れ" onToggle={() => setFeelSettings({ ...feel, shake: !feel.shake })} />
            <Switch on={feel.hitStop} label="ヒットストップ（当てた一瞬、止まる）" onToggle={() => setFeelSettings({ ...feel, hitStop: !feel.hitStop })} />
            <Switch on={feel.bossMusic} label="ボス戦の音楽" onToggle={() => setFeelSettings({ ...feel, bossMusic: !feel.bossMusic })} />
            <Switch on={feel.stairsFx} label="階段を降りる音と暗転" onToggle={() => setFeelSettings({ ...feel, stairsFx: !feel.stairsFx })} />
            <Switch on={feel.endFx} label="踏破・力尽きたときの音と画面の演出" onToggle={() => setFeelSettings({ ...feel, endFx: !feel.endFx })} />
          </section>

          <section aria-labelledby="settings-view" className="settings__group">
            <h3 id="settings-view" className="settings__head">
              表示
            </h3>
            <div className="settings__row" role="radiogroup" aria-label="文字の大きさ">
              <span>文字の大きさ</span>
              <span className="settings__seg">
                {TEXT_SIZES.map((size) => (
                  <button key={size} type="button" role="radio" aria-checked={feel.textSize === size} onClick={() => setFeelSettings({ ...feel, textSize: size })}>
                    {TEXT_SIZE_NAMES[size]}
                  </button>
                ))}
              </span>
            </div>
            <Switch on={feel.weakMarks} label="敵の頭上の弱点の印" onToggle={() => setFeelSettings({ ...feel, weakMarks: !feel.weakMarks })} />
          </section>

          {keyboard && (
            <section aria-labelledby="settings-keys" className="settings__group">
              <h3 id="settings-keys" className="settings__head">
                キーの割り当て
              </h3>
              <p className="settings__hint">「変える」を押してから、使いたいキーを押す（Esc でやめる）。ほかの操作で使っているキーにすると、入れ替わる。矢印キー・「.」（待つ）・1〜9（道具）は、いつでも使える。</p>
              <ul className="settings__keys">
                {BIND_IDS.map((id) => (
                  <li key={id} className="settings__key-row">
                    <span>{BIND_NAMES[id]}</span>
                    <kbd className="explore__key settings__kbd">{listening === id ? '…' : keyLabel(feel.keys[id])}</kbd>
                    <button
                      type="button"
                      className="settings__change"
                      aria-pressed={listening === id}
                      onClick={() => {
                        setNote('');
                        setListening(listening === id ? null : id);
                      }}
                    >
                      {listening === id ? 'キーを押す' : '変える'}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="settings__note" role="status">
                {note}
              </p>
              <button
                type="button"
                className="settings__reset"
                disabled={BIND_IDS.every((id) => feel.keys[id] === DEFAULT_BINDINGS[id])}
                onClick={() => {
                  setListening(null);
                  setNote('もとの割り当てに戻しました');
                  setFeelSettings({ ...feel, keys: DEFAULT_FEEL_SETTINGS.keys });
                }}
              >
                もとの割り当てに戻す
              </button>
            </section>
          )}
        </div>
        <button type="button" className="primary settings__close" autoFocus onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/** 歯車の形（「設定」のボタン） */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
