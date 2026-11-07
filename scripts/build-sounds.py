"""効果音（public/sounds/*.mp3）を合成するスクリプト。録音ではなく、ノイズや減衰する音を重ねて作る。

使い方（Python 3 と NumPy・SciPy、mp3 に変換する ffmpeg が必要。npm のスクリプトとは別）:
    pip install numpy scipy
    python3 scripts/build-sounds.py

- 足音は、ダンジョン特性ごとに一歩分の音を VARIATIONS 種類ずつ書き出す（step-{特性}-{番号}.mp3）。
  ゲームでは一歩ごとにこの中から選び、音の高さも少し変えて、同じ音のくり返しに聞こえないようにする
- 乱数の種を決めているので、作り直しても同じ音になる
- 今あるのは光のダンジョンの足音だけ（磨かれた石の神殿を、硬い靴で歩く音。残響が長い）。ほかの特性は足音を鳴らさない
"""
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds'
VARIATIONS = 4  # 足音の種類の数（src/audio/sound.ts の STEP_SOUNDS と合わせる）
PEAK = 0.7  # いちばん大きい音の大きさ（1で割れる）。種類どうしの大きさの違いは残す


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(t / max(attack, 1e-4), 1) * np.exp(-t / decay)


def band(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def low(x, f):
    return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)


def high(x, f):
    return sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)


def ring(n, f, decay, rng):
    """減衰していく正弦波（石や金属の響き）"""
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t / decay)


def reverb(x, size, damp, mix):
    """部屋の残響（くし形フィルタを並べた簡単なもの）。size は残響の長さ（秒）、damp は響きのこもり具合（Hz）"""
    out = np.zeros(len(x) + int(SR * size * 1.2))
    xx = np.concatenate([x, np.zeros(len(out) - len(x))])
    for d in [0.0297, 0.0371, 0.0411, 0.0437]:
        k = int(d * SR)
        a = np.zeros(k + 1)
        a[0], a[k] = 1, -(0.001 ** (d / size))
        out += lfilter([1], a, xx)
    return xx + low(out, damp) / 4 * mix


def step_light(rng, foot):
    """光のダンジョン：磨かれた石の神殿を歩く、硬く澄んだ足音（かかと → つま先）"""
    n = int(0.22 * SR)
    noise = rng.standard_normal(n)
    heel = (band(noise, 900, 4500) * env(n, 0.0005, 0.009) * 1.3
            + ring(n, 1180 + 60 * foot, 0.025, rng) * 0.12
            + ring(n, 140, 0.02, rng) * 0.5)
    toe = int((0.028 + 0.012 * rng.random()) * SR)
    y = heel.copy()
    y[toe:] += heel[: n - toe] * 0.6
    y *= 0.85 + 0.3 * rng.random()  # 一歩ごとに少し強さを変える
    return reverb(high(y, 40), 1.4, 6000, 0.55)


STEPS = {'light': step_light}


def write_mp3(y, path):
    wav = path.with_suffix('.wav')
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame', '-q:a', '4', str(path)], check=True)
    wav.unlink()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for trait, make in STEPS.items():
        rng = np.random.default_rng(11)
        steps = [make(rng, i % 2) for i in range(VARIATIONS)]
        scale = PEAK / max(np.max(np.abs(s)) for s in steps)
        for i, s in enumerate(steps, 1):
            # 残響の終わりはなめらかに消す
            fade = int(0.1 * SR)
            s = s * scale
            s[-fade:] *= np.linspace(1, 0, fade)
            write_mp3(s, OUT / f'step-{trait}-{i}.mp3')
        print(f'wrote public/sounds/step-{trait}-1〜{VARIATIONS}.mp3')


if __name__ == '__main__':
    main()
