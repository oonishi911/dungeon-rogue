// 探索画面の小さな部品：記録の一覧と、体力などのゲージ。

import { useEffect, useRef, useState } from 'react';

/** 記録（新しい順）。key は記録の通し番号にして、新しい行が増えても古い行を作り直さない */
export function LogList({ lines, total }: { lines: string[]; total: number }) {
  return (
    <ol className="explore__log">
      {lines.map((line, i) => (
        <li key={total - i}>{line}</li>
      ))}
    </ol>
  );
}

interface MeterProps {
  label: string;
  value: number;
  max: number;
  tone: 'hp' | 'satiety' | 'exp' | 'mp';
  unit?: string;
  gaugeOnly?: boolean; // 数字を出さず、ゲージだけにする（読み上げには数字を伝える）
  warnBelow?: number; // 残りがこの割合より少ないと、ゲージを点滅させる
  pulse?: boolean; // 増えたとき・減ったときに、ゲージを一瞬光らせる（唱えた魔力・回復した体力）
  shakeKey?: number; // 変わるたびにゲージを震わせる（魔力が足りないとき）
}

export function Meter({ label, value, max, tone, unit, gaugeOnly, warnBelow, pulse, shakeKey = 0 }: MeterProps) {
  // 光らせる：値が変わったら、増えた・減ったを少しのあいだ覚える
  const prev = useRef(value);
  const [change, setChange] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);
  useEffect(() => {
    if (!pulse || value === prev.current) return;
    const dir = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setChange((c) => ({ dir, n: (c?.n ?? 0) + 1 }));
    const id = window.setTimeout(() => setChange(null), 600);
    return () => window.clearTimeout(id);
  }, [value, pulse]);
  const low = warnBelow !== undefined && value / max < warnBelow;
  const classes = [
    'meter__track',
    `meter__track--${tone}`,
    low ? 'meter__track--low' : '',
    change ? `meter__track--${change.dir}` : '',
    shakeKey > 0 ? 'meter__track--shake' : '',
  ].join(' ');
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        {!gaugeOnly && (
          <span>
            {unit ? `${unit} ` : ''}
            {value} / {max}
          </span>
        )}
      </div>
      <div
        // 震わせる・光らせる動きを、起きるたびに始めからやり直す
        key={`${shakeKey}-${change?.n ?? 0}`}
        className={classes}
        role="meter"
        aria-label={unit ? `${label}の${unit}` : label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={gaugeOnly ? `${Math.round((value / max) * 100)}%` : undefined}
      >
        <div className="meter__fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
