"""効果音（public/sounds/*.mp3）を合成するスクリプト。録音ではなく、ノイズや減衰する音を重ねて作る。

使い方（Python 3 と NumPy・SciPy、mp3 に変換する ffmpeg が必要。npm のスクリプトとは別）:
    pip install numpy scipy
    python3 scripts/build-sounds.py
    python3 scripts/build-sounds.py --preview <書き出し先>   # 聞き比べ用に、特性ごとに7歩分の音を書き出す

- 足音は、ダンジョン特性ごとに一歩分の音を VARIATIONS 種類ずつ書き出す（step-{特性}-{番号}.mp3）。
  奇数番が片方の足、偶数番がもう片方の足の音（氷は、片方がシャリッ、もう片方がジャリッ）。
  ゲームでは左右の足で交互に、その足の音から選び、音の高さも少し変えて、同じ音のくり返しに聞こえないようにする
- 乱数の種を決めているので、作り直しても同じ音になる
- 足音は特性ごとに地面を変える：無属性は土、炎は焼けて尖った細かい石、氷は雪、光は磨かれた石の神殿、闇は硬い石の洞窟
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds'
VARIATIONS = 4  # 足音の種類の数（src/audio/sound.ts の STEP_SOUNDS と合わせる）
PEAK = 0.7  # 光の足音の、いちばん大きい音の大きさ（1で割れる）。種類どうしの大きさの違いは残す
# ほかの特性の足音は、光の足音と同じくらいの大きさに聞こえるようにそろえる（音のエネルギーで比べる）。
# 光の足音の大きさを基準にするのは、最初にゲームに入れて、音量の設定もそれで決めたため
REFERENCE = 'light'


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


def grains(n, rate, length, rng, start=0.0, grain=0.0015):
    """細かい粒が砕ける音（土・灰・雪）。まばらな短いノイズの粒を、だんだん減らしながら並べる"""
    x = np.zeros(n)
    t = start
    while t < start + length:
        i = int(t * SR)
        if i < n:
            x[i] += (rng.random() * 2 - 1) * np.exp(-(t - start) / (length * 0.5))
        t += rng.exponential(1 / rate)
    k = max(int(grain * SR), 1)
    kernel = rng.standard_normal(k) * np.exp(-np.arange(k) / (k / 3))
    return np.convolve(x, kernel)[:n]


def heel_toe(make, rng, n):
    """かかと → つま先の順に、同じ音を2回（つま先は弱く）鳴らす"""
    heel = make()
    toe = int((0.028 + 0.012 * rng.random()) * SR)
    y = heel.copy()
    y[toe:] += heel[: n - toe] * 0.55
    return y


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


def step_neutral(rng, foot):
    """無属性：土の上を歩く、低く重い足音（ドスッ）。土がくずれるかすかな音が混ざる。響きは少ない。
    スマホのスピーカーはとても低い音を鳴らせないので、いちばん低い音（約55Hz）に、少し上の胴鳴り（約120〜250Hz）を重ね、
    スマホでも低く重い音に聞こえるようにする"""
    n = int(0.28 * SR)
    noise = rng.standard_normal(n)
    y = heel_toe(lambda: low(noise, 260) * env(n, 0.004, 0.045) * 3.0
                 + ring(n, 55 + 6 * foot, 0.07, rng) * 0.9
                 + ring(n, 125 + 10 * foot, 0.04, rng) * 1.6
                 + band(noise, 160, 420) * env(n, 0.003, 0.035) * 4.0, rng, n)
    y += band(grains(n, 900, 0.07, rng, 0.006), 300, 1100) * 0.25  # 土の粒がこすれる（低めに、控えめに）
    y *= 0.85 + 0.3 * rng.random()
    return reverb(high(y, 30), 0.3, 900, 0.15)


def step_fire(rng, foot):
    """炎：焼けて硬くなった、細かく尖った石を踏む音。足を乗せると、石の先端が砕けてゴリッと鳴る。
    - 硬い石に当たる、短く固い音（カッ）
    - 先端が押しつぶされて砕ける音（ゴリッ）：少し長めの粒を、中くらいの低さで、足に重さがかかるあいだぎっしり並べる
    - 尖った先が折れる、まばらで鋭い高い粒（パキッ）"""
    n = int(0.28 * SR)
    noise = rng.standard_normal(n)
    hit = band(noise, 700, 3500) * env(n, 0.0005, 0.008) * 1.2 + band(noise, 150, 400) * env(n, 0.002, 0.02) * 0.8
    gori = band(grains(n, 2600, 0.11, rng, 0.008, 0.003), 300, 2200) * env(n, 0.02, 0.06) * 2.8
    tips = band(grains(n, 220, 0.09, rng, 0.006, 0.0003), 3000, 8000) * 1.5
    y = hit + gori + tips
    y *= 0.85 + 0.3 * rng.random()
    return reverb(high(y, 60), 0.5, 3000, 0.25)


def step_ice(rng, foot):
    """氷：霜の降りた雪を踏む音。左右の足で、シャリッ（軽く細かい音）とジャリッ（粗く砕ける音）を交互に鳴らす。
    氷の洞窟の閉じた空間に響かせる（左右で少し違う響きにして広がりを出す）。
    弾むように聞こえないよう、踏んだときの低い「ボン」という音は入れず、残響は反射の多いなめらかなもの（cave）にする"""
    n = int(0.3 * SR)
    if foot == 0:
        # シャリ：とても短い氷の粒をぎっしり並べ（粒どうしが溶け合ってサラッと聞こえる）、少し低い粒をまばらに混ぜる
        fine = band(grains(n, 5000, 0.15, rng, 0.006, 0.0002), 2800, 8500) * env(n, 0.02, 0.07) * 2.6
        core = band(grains(n, 700, 0.12, rng, 0.006, 0.0004), 1500, 4200) * 0.9
        y = high(fine + core, 1000)
    else:
        # ジャリ：雪が押し固められる、粗く中くらいの高さの粒（ザクッ）に、氷の粒が砕ける音を重ねる
        crunch = low(band(grains(n, 6000, 0.13, rng, 0.004, 0.002), 500, 3500), 3000) * env(n, 0.03, 0.08) * 1.6
        shari = band(grains(n, 1600, 0.16, rng, 0.006, 0.0004), 2500, 9000) * 2.2
        y = high(crunch + shari, 150) * 0.55  # シャリと同じくらいの大きさに聞こえるように
    # 氷の洞窟に響く：閉じた空間で、硬い氷の壁に反射して、明るく強い響きが長く残る
    return cave(y * (0.85 + 0.3 * rng.random()), 1.8, 9000, 1.4)


def step_light(rng, foot):
    """光：磨かれた石の神殿を歩く、硬く澄んだ足音。広い広間なので残響が長い"""
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


def step_dark(rng, foot):
    """闇：硬い石の上を歩く、カツッという固い足音。暗い洞窟に、こもった残響が長く残る"""
    n = int(0.22 * SR)
    noise = rng.standard_normal(n)
    y = heel_toe(lambda: band(noise, 500, 3500) * env(n, 0.0005, 0.012) * 1.4
                 + ring(n, 760 + 40 * foot, 0.02, rng) * 0.15 + ring(n, 120, 0.025, rng) * 0.6, rng, n)
    y *= 0.85 + 0.3 * rng.random()
    return reverb(high(y, 40), 1.1, 2200, 0.5)


def cave(x, size, damp, mix, predelay=0.012):
    """閉じた空間（洞窟）の残響。左右で少しずつ違う響きにして、音に広がりを出す（左右2チャンネルを返す）。
    reverb より反射を多く重ね、響きをなめらかにする（反射が少ないと、ビヨンと弾むように聞こえる）"""
    pre = int(predelay * SR)
    tail = int(SR * size * 1.3)
    xx = np.concatenate([np.zeros(pre), x, np.zeros(tail)])
    channels = []
    for delays in ([0.0297, 0.0371, 0.0411, 0.0437, 0.0503, 0.0571], [0.0313, 0.0353, 0.0427, 0.0461, 0.0527, 0.0593]):
        wet = np.zeros(len(xx))
        for d in delays:
            k = int(d * SR)
            a = np.zeros(k + 1)
            a[0], a[k] = 1, -(0.001 ** (d / size))
            wet += lfilter([1], a, xx)
        # 反射をさらに細かく散らす（オールパス）
        for d, g in [(0.0051, 0.7), (0.0017, 0.7)]:
            k = int(d * SR)
            b = np.zeros(k + 1)
            b[0], b[k] = -g, 1
            a = np.zeros(k + 1)
            a[0], a[k] = 1, -g
            wet = lfilter(b, a, wet)
        channels.append(low(wet, damp) / len(delays))
    dry = np.concatenate([x, np.zeros(len(xx) - len(x))])
    return np.stack([dry + c * mix for c in channels], axis=1)


STEPS = {'neutral': step_neutral, 'fire': step_fire, 'ice': step_ice, 'light': step_light, 'dark': step_dark}


def loudness(steps):
    """一歩分（0.27秒）の音のエネルギー（左右2チャンネルの音は、両方の平均）"""
    return float(np.sqrt(np.mean([np.mean(s[: int(0.27 * SR)] ** 2) for s in steps])))


def stereo(y):
    """左右2チャンネルにそろえる（1チャンネルの音は、左右に同じ音を置く）"""
    return y if y.ndim == 2 else np.stack([y, y], axis=1)


def make_steps():
    """特性ごとの足音（VARIATIONS 種類ずつ）を作り、大きさをそろえる"""
    made = {}
    for trait, make in STEPS.items():
        rng = np.random.default_rng(11)
        made[trait] = [make(rng, i % 2) for i in range(VARIATIONS)]
    ref = made[REFERENCE]
    ref_scale = PEAK / max(np.max(np.abs(s)) for s in ref)
    target = loudness(ref) * ref_scale
    for trait, steps in made.items():
        scale = ref_scale if trait == REFERENCE else target / loudness(steps)
        scale = min(scale, 0.95 / max(np.max(np.abs(s)) for s in steps))  # 割れないように
        made[trait] = [s * scale for s in steps]
    return made


def write_mp3(y, path):
    """1チャンネル（形が (n,)）か、左右2チャンネル（形が (n, 2)）の音を mp3 で書き出す"""
    wav = path.with_suffix('.wav')
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1 if y.ndim == 1 else 2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame', '-q:a', '4', str(path)], check=True)
    wav.unlink()


def preview(out_dir):
    """聞き比べ用：特性ごとに、ゲームと同じ0.27秒間隔で7歩鳴らした音を書き出す"""
    out_dir.mkdir(parents=True, exist_ok=True)
    for trait, steps in make_steps().items():
        total = np.zeros((int(SR * 3.6), 2))
        for k in range(7):
            s = stereo(steps[k % VARIATIONS])
            at = int((0.05 + 0.27 * k) * SR)
            total[at:at + len(s)] += s[: len(total) - at]
        if all(s.ndim == 1 for s in steps):
            total = total[:, 0]
        write_mp3(total, out_dir / f'preview-{trait}.mp3')
    print(f'wrote {out_dir}/preview-*.mp3')


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--preview':
        preview(Path(sys.argv[2]))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for trait, steps in make_steps().items():
        for i, s in enumerate(steps, 1):
            # 残響の終わりはなめらかに消す
            fade = int(0.1 * SR)
            s = s.copy()
            ramp = np.linspace(1, 0, fade)
            s[-fade:] *= ramp if s.ndim == 1 else ramp[:, None]
            write_mp3(s, OUT / f'step-{trait}-{i}.mp3')
        print(f'wrote public/sounds/step-{trait}-1〜{VARIATIONS}.mp3')


if __name__ == '__main__':
    main()
