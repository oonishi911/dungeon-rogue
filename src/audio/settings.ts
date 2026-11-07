// 音の設定（オン・オフと、効果音・環境音それぞれの音量）。ブラウザに保存し、次に遊ぶときも同じ設定にする

export type SoundSettings = {
  /** 音をすべて鳴らすか */
  enabled: boolean;
  /** 効果音（足音・宝箱など）の音量（0〜1） */
  volume: number;
  /** 環境音（ダンジョンにいるあいだ流れる風の音など）の音量（0〜1） */
  ambient: number;
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.7, ambient: 0.6 };

/** 保存された文字列から設定を読む。形がおかしいところ・ないところは、ふだんの設定にする */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_SOUND_SETTINGS };
    const { enabled, volume, ambient } = data as Record<string, unknown>;
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SOUND_SETTINGS.enabled,
      volume: readVolume(volume, DEFAULT_SOUND_SETTINGS.volume),
      ambient: readVolume(ambient, DEFAULT_SOUND_SETTINGS.ambient),
    };
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

function readVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampVolume(value) : fallback;
}

export function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume));
}

/**
 * 音量のつまみの位置（0〜1）から、実際に掛ける大きさを決める。
 * 人の耳は音の大きさの違いを比で感じるので、2乗にして、つまみの動きと聞こえ方の変わり方を近づける
 */
export function gainOf(settings: SoundSettings, kind: 'effect' | 'ambient' = 'effect'): number {
  if (!settings.enabled) return 0;
  return clampVolume(kind === 'effect' ? settings.volume : settings.ambient) ** 2;
}
