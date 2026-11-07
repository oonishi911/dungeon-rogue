// 効果音の設定。画面の上のボタンで開き、オン・オフと音量を変える。変えた設定はブラウザに保存する

import { useEffect, useId, useRef, useState } from 'react';
import { playSample, setSoundSettings, soundSettings, unlockSound } from '../audio/sound';
import type { SoundSettings } from '../audio/settings';

export function SoundButton() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SoundSettings>(soundSettings);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const muted = !settings.enabled || settings.volume === 0;

  const change = (next: SoundSettings) => {
    setSettings(next);
    setSoundSettings(next);
  };

  // 設定の外に触れたとき・Esc キーで閉じる
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sound" ref={rootRef}>
      <button
        type="button"
        className="explore__wait sound__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="効果音の設定"
        onClick={() => setOpen((v) => !v)}
      >
        <SpeakerIcon muted={muted} />
      </button>
      {open && (
        <div id={panelId} className="sound__panel" role="group" aria-label="効果音の設定">
          <p className="sound__title">効果音</p>
          <button
            type="button"
            className="explore__wait sound__switch"
            aria-pressed={settings.enabled}
            onClick={() => {
              const next = { ...settings, enabled: !settings.enabled };
              change(next);
              if (next.enabled) {
                unlockSound();
                playSample();
              }
            }}
          >
            {settings.enabled ? 'オン' : 'オフ'}
          </button>
          <label className="sound__volume">
            <span>
              音量 <output>{Math.round(settings.volume * 100)}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.volume * 100)}
              disabled={!settings.enabled}
              onChange={(e) => change({ ...settings, volume: Number(e.target.value) / 100 })}
              // つまみを離したときに、その音量で試しに鳴らす
              onPointerUp={() => playSample()}
              onKeyUp={() => playSample()}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <>
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" />
        </>
      )}
    </svg>
  );
}
