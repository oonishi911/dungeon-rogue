// 効果音の設定（オン・オフと音量）。ブラウザに保存し、次に遊ぶときも同じ設定にする

export type SoundSettings = {
  enabled: boolean;
  /** 音量（0〜1） */
  volume: number;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.7 };

/** 保存された文字列から設定を読む。形がおかしいところは、ふだんの設定にする */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SOUND_SETTINGS };
    const { enabled, volume } = data as Record<string, unknown>;
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume: typeof volume === 'number' && Number.isFinite(volume) ? clampVolume(volume) : DEFAULT_SOUND_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

/**
 * 音量のつまみの位置（0〜1）から、実際に掛ける大きさを決める。
 * 人の耳は音の大きさの違いを比で感じるので、2乗にして、つまみの動きと聞こえ方の変わり方を近づける
 */
export function gainOf(settings: SoundSettings): number {
  return settings.enabled ? clampVolume(settings.volume) ** 2 : 0;
}
