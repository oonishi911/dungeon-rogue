"""効果音（public/sounds/*.mp3）を合成するスクリプト。録音ではなく、ノイズや減衰する音を重ねて作る。

使い方（Python 3 と NumPy・SciPy、mp3 に変換する ffmpeg が必要。npm のスクリプトとは別）:
    pip install numpy scipy
    python3 scripts/build-sounds.py
    python3 scripts/build-sounds.py --preview <書き出し先>   # 聞き比べ用に、特性ごとに7歩分の音を書き出す

- 足音は、ダンジョン特性ごとに一歩分の音を VARIATIONS 種類ずつ書き出す（step-{特性}-{番号}.mp3）。
  奇数番が片方の足、偶数番がもう片方の足の音（氷は、片方がシャリッ、もう片方がジャリッ）。
  ゲームでは左右の足で交互に、その足の音から選び、音の高さも少し変えて、同じ音のくり返しに聞こえないようにする
- 乱数の種を決めているので、作り直しても同じ音になる
- 宝箱の音（chest-open.mp3）：宝箱から中身を取ったときに鳴らす
- 環境音（ambient-{特性}.mp3）：ダンジョンにいるあいだ、くり返し鳴らす。最後と最初が継ぎ目なくつながる
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


def chest_open():
    """宝箱を開けて中身を取ったときの音（約0.9秒）：木の宝箱のふたが「ぎー」ときしみながら開き、「ガコッ」と重く当たって止まる。
    - ぎー：蝶番の木がこすれて鳴る、低く伸びるきしみ。こすれて引っかかる間隔をきしみの音の高さ（約120Hz）にして、
      「い」の声に近い響き（低い響きと、高い響き）に通し、声のように「ぎー」と聞こえるようにする。高さは少し揺れながら下がる
    - ガコッ：開き切ったふたが、重く当たる「ガ」と、すぐあとに跳ね返って当たる中空の「コッ」
    - 小さな部屋の短い反射を少し付ける"""
    rng = np.random.default_rng(23)

    def resonate(x, freqs, decays, gains):
        """衝撃の列を、減衰する固有振動（共鳴器）に通す"""
        y = np.zeros_like(x)
        for f, d, g in zip(freqs, decays, gains):
            r = np.exp(-1 / (d * SR))
            w = 2 * np.pi * f / SR
            y += lfilter([1], [1, -2 * r * np.cos(w), r * r], x) * g * (1 - r)
        return y

    total = 0.9
    n = int(SR * total)
    # ぎー（0.02〜0.55秒）
    exc = np.zeros(n)
    creak_from, creak_to = 0.02, 0.55
    t = creak_from
    while t < creak_to:
        u = (t - creak_from) / (creak_to - creak_from)
        pitch = 128 - 16 * u + 7 * np.sin(2 * np.pi * 7 * u) + 3 * rng.standard_normal()
        level = min(u / 0.06, 1) * (1 - max(u - 0.9, 0) / 0.1) * (0.85 + 0.15 * np.sin(2 * np.pi * 3 * u))
        exc[int(t * SR)] += level * (0.8 + 0.2 * rng.random())
        t += 1 / pitch
    gii = resonate(exc, [165, 580, 1250, 1800], [0.008, 0.006, 0.005, 0.003], [1.0, 1.6, 4.5, 1.5])
    gii += band(rng.standard_normal(n), 700, 2200) * np.convolve(np.abs(exc), np.ones(300) / 300, 'same') * 0.15  # こすれるざらつき
    # ガコッ：ガ（0.57秒）、コッ（0.64秒）
    ga_at, ko_at = int(0.57 * SR), int(0.64 * SR)
    hit = np.zeros(n)
    hit[ga_at] = 1.0
    hit[ga_at + int(0.004 * SR)] = 0.6
    ga = resonate(hit, [120, 210, 380, 650], [0.06, 0.045, 0.03, 0.02], [1.6, 1.3, 0.9, 0.5])
    k = int(0.05 * SR)
    ga[ga_at:ga_at + k] += low(band(rng.standard_normal(k), 200, 2500), 1500) * env(k, 0.0005, 0.012) * 0.12  # 当たったときのガッというざらつき
    hit2 = np.zeros(n)
    hit2[ko_at] = 0.7
    ko = resonate(hit2, [780, 1250, 1900], [0.03, 0.018, 0.01], [1.0, 0.5, 0.25])
    y = gii * 0.9 + ga * 3.2 + ko * 1.4
    for d, g in [(0.017, 0.22), (0.029, 0.15), (0.047, 0.09)]:
        k = int(d * SR)
        y[k:] += y[:-k] * g
    y = high(y, 60)
    y = y / np.max(np.abs(y)) * CHEST_PEAK
    fade = int(0.08 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y


def resonant_sweep(x, centers, q):
    """中心の高さが時間とともに動く、狭い帯域のフィルタ（風が穴や岩のすき間で鳴る「ヒュウ」「ウォー」）。
    centers は1サンプルごとの中心の高さ（Hz）。256サンプルごとに係数を変える"""
    out = np.zeros_like(x)
    block = 256
    z = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.mean(centers[i:i + block]))
        w = 2 * np.pi * f / SR
        alpha = np.sin(w) / (2 * q)
        b = np.array([alpha, 0, -alpha])
        a = np.array([1 + alpha, -2 * np.cos(w), 1 - alpha])
        out[i:i + block], z = lfilter(b / a[0], a / a[0], x[i:i + block], zi=z)
    return out


def ambient_wind(length=24.0, seed=3):
    """無属性の環境音：洞窟を吹き抜ける風のうなり（左右2チャンネル、length 秒でつながるループ）。
    - 低いゴォーという風の音：低い音だけのノイズを、ゆっくりした強弱（突風）で揺らす
    - うなり：狭い帯域のフィルタに通したノイズ。中心の高さがゆっくり上下し、ウォー・ヒュウと鳴る
    - 強弱や高さの揺れは、どれも length 秒でちょうど元に戻る周期にする。最後の数秒を最初に重ねて、継ぎ目を消す"""
    rng = np.random.default_rng(seed)
    over = 3.0  # 継ぎ目を重ねる長さ（秒）
    n = int(length * SR)
    m = n + int(over * SR)
    t = np.arange(m) / SR

    def lfo(cycles, phase):
        """length 秒にちょうど cycles 回まわる、ゆっくりした揺れ（-1〜1）"""
        return np.sin(2 * np.pi * cycles * t / length + phase)

    channels = []
    for side in range(2):
        ph = rng.random(8) * 2 * np.pi
        # 突風：いくつかの遅い揺れを重ねた強弱（0.35〜1）
        gust = 0.68 + 0.2 * lfo(2, ph[0]) + 0.08 * lfo(5, ph[1]) + 0.05 * lfo(9, ph[2])
        rumble = low(low(rng.standard_normal(m), 180), 180) * gust * 1.3
        # うなり：2つの穴が、それぞれの高さで鳴る。風が強いほど少し高くなる
        howl1 = resonant_sweep(rng.standard_normal(m), 260 + 70 * lfo(3, ph[3]) + 60 * (gust - 0.68), 14)
        howl2 = resonant_sweep(rng.standard_normal(m), 520 + 120 * lfo(4, ph[4]) + 90 * (gust - 0.68), 18)
        h1 = np.clip(0.55 + 0.45 * lfo(3, ph[5]), 0, 1) ** 1.5  # うなりは、出たり消えたりする
        h2 = np.clip(0.4 + 0.6 * lfo(5, ph[6]), 0, 1) ** 2
        air = band(rng.standard_normal(m), 800, 2500) * (gust - 0.3) * 0.08  # 吹き抜ける空気のかすかなサー
        y = high(rumble + howl1 * h1 * gust * 6 + howl2 * h2 * gust * 4 + air, 30)
        # 継ぎ目：最後の over 秒を、最初の over 秒になめらかに重ねる（音の大きさが変わらない重ね方）
        k = int(over * SR)
        fade = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
        loop = y[:n].copy()
        loop[:k] = y[:k] * np.sqrt(fade) + y[n:n + k] * np.sqrt(1 - fade)
        channels.append(loop)  # フィルタは重ねる前にかける（重ねたあとにかけると、ループの頭で音が跳ねる）
    y = np.stack(channels, axis=1)
    return y / np.max(np.abs(y)) * AMBIENT_PEAK


def ambient_ice(length=24.0, seed=5):
    """氷の環境音：氷の洞窟（左右2チャンネル、length 秒でつながるループ）。
    - 冷たく細い風：無属性の風より高く細いヒュウという音と、かすかなサーという空気の音。低いゴォーはほとんどない
    - 氷がきしむ音：遠くで、低くギィ…と長くきしむ（ループの中で2回）
    - 氷が割れる音：遠くで、ピシッと短く割れる（1回）
    - 水が滴る音：ポチャン…と高く澄んだ水滴が、洞窟に響く（ところどころ）
    - きらめき：氷の粒がふれ合うような、とても小さく高いチリン（まばら）
    ときどき鳴る音は決まった時刻に置き、ループの終わりからはみ出した響きは最初に回して、継ぎ目を消す"""
    rng = np.random.default_rng(seed)
    over = 3.0
    n = int(length * SR)
    m = n + int(over * SR)
    t = np.arange(m) / SR

    def lfo(cycles, phase):
        return np.sin(2 * np.pi * cycles * t / length + phase)

    # 冷たく細い風
    wind = []
    for side in range(2):
        ph = rng.random(6) * 2 * np.pi
        gust = 0.65 + 0.2 * lfo(2, ph[0]) + 0.1 * lfo(7, ph[1])
        whistle1 = resonant_sweep(rng.standard_normal(m), 780 + 160 * lfo(3, ph[2]) + 120 * (gust - 0.65), 24)
        whistle2 = resonant_sweep(rng.standard_normal(m), 1450 + 260 * lfo(5, ph[3]) + 200 * (gust - 0.65), 30)
        w1 = np.clip(0.5 + 0.5 * lfo(3, ph[4]), 0, 1) ** 1.5
        w2 = np.clip(0.3 + 0.7 * lfo(4, ph[5]), 0, 1) ** 2.5
        air = band(rng.standard_normal(m), 2000, 7000) * gust * 0.05
        base = low(rng.standard_normal(m), 150) * gust * 0.35
        y = high(whistle1 * w1 * gust * 5 + whistle2 * w2 * gust * 3 + air + base, 40)
        k = int(over * SR)
        fade = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
        loop = y[:n].copy()
        loop[:k] = y[:k] * np.sqrt(fade) + y[n:n + k] * np.sqrt(1 - fade)
        wind.append(loop)
    wind = np.stack(wind, axis=1)

    # ときどき鳴る音：左右の位置（-1：左、1：右）を決めて置き、まとめて洞窟に響かせる
    dry = np.zeros((n + int(4 * SR), 2))
    send = np.zeros(len(dry))

    def place(sound, at, pan, wet=1.0):
        i = int(at * SR)
        left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        dry[i:i + len(sound), 0] += sound * left
        dry[i:i + len(sound), 1] += sound * right
        send[i:i + len(sound)] += sound * wet

    def creak(dur):
        """氷がきしむ：低い音が、こすれるように細かく途切れながら、ゆっくり高さを変える"""
        k = int(dur * SR)
        tt = np.arange(k) / SR
        f = 95 + 40 * np.sin(np.pi * tt / dur) + 15 * np.sin(2 * np.pi * 1.3 * tt)
        tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR)
        # こすれ：速さの揺れる、細かい途切れ
        rate = 18 + 10 * np.sin(np.pi * tt / dur)
        stick = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(rate) / SR))
        shape = np.sin(np.pi * tt / dur) ** 0.8
        return low(band(tone * (0.4 + 0.6 * stick), 70, 900), 700) * shape * 0.28

    def crack():
        """氷が割れる：鋭い一撃と、氷の高い響き"""
        k = int(0.6 * SR)
        noise = rng.standard_normal(k)
        snap = band(noise, 1200, 7000) * env(k, 0.0003, 0.012) * 1.5
        body = sum(ring(k, f, 0.12, rng) * g for f, g in [(1870, 0.25), (2960, 0.18), (4410, 0.1)])
        return low(snap + body * env(k, 0.0005, 0.15), 6000) * 0.5

    def drip(pitch):
        """水滴：高さが一瞬で下がる、澄んだポチャン"""
        k = int(0.25 * SR)
        tt = np.arange(k) / SR
        f = pitch * (1 + 0.6 * np.exp(-tt / 0.008))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(k, 0.0005, 0.035) * 0.6

    def tinkle():
        """きらめき：氷の粒がふれ合う、小さく高いチリン"""
        k = int(0.4 * SR)
        f = 4200 + 2500 * rng.random()
        return (ring(k, f, 0.08, rng) + ring(k, f * 1.53, 0.05, rng) * 0.4) * 0.1

    place(creak(1.6), 5.3, -0.6, 0.8)
    place(creak(1.2), 16.8, 0.5, 0.8)
    place(crack() * 0.6, 11.4, 0.7)
    for at, pan, pitch in [(2.1, 0.3, 1650), (2.75, 0.3, 1600), (8.6, -0.4, 1900), (13.9, -0.1, 1500), (19.4, 0.6, 1750), (22.3, -0.7, 1820)]:
        place(drip(pitch), at, pan)
    for at in np.sort(rng.random(14) * (length - 0.5)):
        place(tinkle(), at, rng.random() * 1.6 - 0.8, 0.6)
    wet = cave(send, 2.2, 7000, 1.0)[:len(dry)] - np.stack([send, send], axis=1)[: len(dry)]
    events = dry + wet[: len(dry)] * 0.9
    # ループの終わりからはみ出した響きは、最初に回す
    loop_events = events[:n].copy()
    rest = events[n:]
    loop_events[: len(rest)] += rest[:n]

    y = wind + loop_events
    # 無属性の風と同じくらいの大きさにそろえる（割れる音などが大きすぎないよう、いちばん大きいところも抑える）
    y = y * (AMBIENT_RMS / float(np.sqrt(np.mean(y ** 2))))
    return y * min(1.0, AMBIENT_MAX / float(np.max(np.abs(y))))


def ambient_fire(length=24.0, seed=9):
    """炎の環境音：溶岩の流れる火山の洞窟（左右2チャンネル、length 秒でつながるループ）。
    - 溶岩の流れ：低く重いゴォーという地鳴りが、ゆっくりうねる
    - 溶岩の泡：ボコッ…と、粘りのある泡がふくらんで弾ける（ところどころ。左右のいろいろな位置）
    - 火のはぜる音：パチッ・パチパチと、まばらにはぜる（ずっと、ときどき固まって）
    - 蒸気：遠くで、シューッと蒸気が噴き出す（2回）
    ときどき鳴る音は決まった時刻に置き、ループの終わりからはみ出した響きは最初に回して、継ぎ目を消す"""
    rng = np.random.default_rng(seed)
    over = 3.0
    n = int(length * SR)
    m = n + int(over * SR)
    t = np.arange(m) / SR

    def lfo(cycles, phase):
        return np.sin(2 * np.pi * cycles * t / length + phase)

    # 溶岩の流れ（ずっと鳴る低い音）
    flow = []
    for side in range(2):
        ph = rng.random(5) * 2 * np.pi
        swell = 0.7 + 0.18 * lfo(2, ph[0]) + 0.1 * lfo(5, ph[1])
        rumble = low(low(rng.standard_normal(m), 110), 110) * swell * 0.7
        # 低いうなり：狭い帯域を、ゆっくり上下させる（流れが岩にぶつかる音）
        churn = resonant_sweep(rng.standard_normal(m), 210 + 40 * lfo(3, ph[2]), 5) * swell * 2.2
        # 熱気のかすかなサー
        heat = band(rng.standard_normal(m), 900, 3000) * (0.5 + 0.5 * lfo(4, ph[3])) * 0.05
        y = high(rumble + churn + heat, 30)
        k = int(over * SR)
        fade = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
        loop = y[:n].copy()
        loop[:k] = y[:k] * np.sqrt(fade) + y[n:n + k] * np.sqrt(1 - fade)
        flow.append(loop)
    flow = np.stack(flow, axis=1)

    dry = np.zeros((n + int(4 * SR), 2))
    send = np.zeros(len(dry))

    def place(sound, at, pan, wet=1.0):
        i = int(at * SR)
        left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        dry[i:i + len(sound), 0] += sound * left
        dry[i:i + len(sound), 1] += sound * right
        send[i:i + len(sound)] += sound * wet

    def bubble(size):
        """溶岩の泡：泡がふくらむあいだ音が少し上がり、弾けるとボコッと鳴る"""
        k = int((0.12 + 0.1 * size) * SR)
        tt = np.arange(k) / SR
        f0 = 70 + 50 * (1 - size)
        f = f0 * (1 + 0.8 * tt / tt[-1])
        grow = np.sin(2 * np.pi * np.cumsum(f) / SR) * (tt / tt[-1]) ** 1.5 * 0.5
        pop_k = int(0.08 * SR)
        pop = band(rng.standard_normal(pop_k), 120, 900) * env(pop_k, 0.001, 0.02) * 0.9
        y = np.concatenate([grow, np.zeros(pop_k)])
        y[k - int(0.004 * SR):k - int(0.004 * SR) + pop_k] += pop
        return low(y, 1200) * (0.6 + 0.4 * size)

    def crackle(count):
        """火のはぜる音：短く鋭い粒を、まばらに並べる"""
        k = int(0.6 * SR)
        y = np.zeros(k)
        at = 0.0
        for _ in range(count):
            i = int(at * SR)
            g = int(0.002 * SR)
            if i + g < k:
                y[i:i + g] += rng.standard_normal(g) * np.exp(-np.arange(g) / (g / 4)) * (0.4 + 0.6 * rng.random())
            at += rng.exponential(0.06)
        return band(y, 1500, 7000) * 1.0

    def steam(dur):
        """蒸気：シューッと噴き出して、だんだん弱まる"""
        k = int(dur * SR)
        tt = np.arange(k) / SR
        shape = np.minimum(tt / 0.15, 1) * np.exp(-tt / (dur * 0.45))
        return band(rng.standard_normal(k), 2500, 8000) * shape * 0.3

    for at, pan, size in [(1.4, -0.5, 0.8), (3.1, 0.4, 0.4), (3.5, 0.45, 0.3), (6.8, -0.2, 1.0), (9.9, 0.7, 0.5),
                          (12.2, -0.7, 0.7), (12.6, -0.65, 0.4), (15.8, 0.1, 0.9), (18.3, 0.6, 0.6), (21.0, -0.4, 0.5), (22.6, 0.3, 0.8)]:
        place(bubble(size), at, pan, 0.5)
    for at in np.sort(rng.random(26) * (length - 0.7)):
        place(crackle(int(1 + rng.integers(0, 4))), at, rng.random() * 1.6 - 0.8, 0.3)
    place(steam(2.2), 7.9, 0.75, 0.8)
    place(steam(1.6), 19.6, -0.8, 0.8)
    wet = cave(send, 1.2, 2500, 1.0)[: len(dry)] - np.stack([send, send], axis=1)[: len(dry)]
    events = dry + wet[: len(dry)] * 0.6
    loop_events = events[:n].copy()
    rest = events[n:]
    loop_events[: len(rest)] += rest[:n]

    y = flow + loop_events
    y = y * (AMBIENT_RMS / float(np.sqrt(np.mean(y ** 2))))
    return y * min(1.0, AMBIENT_MAX / float(np.max(np.abs(y))))


def loop_layer(make, length, over=3.0):
    """ずっと鳴る音（左右2チャンネル）を length 秒のループにする。make(m, t, lfo, side) で m サンプル分を作り、
    最後の over 秒を最初になめらかに重ねて継ぎ目を消す"""
    n = int(length * SR)
    m = n + int(over * SR)
    t = np.arange(m) / SR

    def lfo(cycles, phase):
        return np.sin(2 * np.pi * cycles * t / length + phase)

    out = []
    for side in range(2):
        y = make(m, t, lfo, side)
        k = int(over * SR)
        fade = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
        loop = y[:n].copy()
        loop[:k] = y[:k] * np.sqrt(fade) + y[n:n + k] * np.sqrt(1 - fade)
        out.append(loop)
    return np.stack(out, axis=1)


class Events:
    """ときどき鳴る音を、左右の位置を決めて置き、まとめて響かせる。ループの終わりからはみ出した響きは、最初に回す"""

    def __init__(self, length):
        self.n = int(length * SR)
        self.dry = np.zeros((self.n + int(8 * SR), 2))
        self.send = np.zeros(len(self.dry))

    def place(self, sound, at, pan, wet=1.0):
        i = int(at * SR)
        sound = sound[: len(self.dry) - i]
        left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.dry[i:i + len(sound), 0] += sound * left
        self.dry[i:i + len(sound), 1] += sound * right
        self.send[i:i + len(sound)] += sound * wet

    def mix(self, size, damp, amount):
        wet = cave(self.send, size, damp, 1.0)[: len(self.dry)] - np.stack([self.send, self.send], axis=1)
        events = self.dry + wet * amount
        loop = events[: self.n].copy()
        rest = events[self.n:]
        while len(rest):
            loop[: min(len(rest), self.n)] += rest[: self.n]
            rest = rest[self.n:]
        return loop


def level_ambient(y):
    """環境音を、無属性の風と同じくらいの大きさにそろえる（いちばん大きいところも抑える）"""
    y = y * (AMBIENT_RMS / float(np.sqrt(np.mean(y ** 2))))
    return y * min(1.0, AMBIENT_MAX / float(np.max(np.abs(y))))


def ambient_light(length=24.0, seed=13):
    """光の環境音：磨かれた石の神殿の広間（左右2チャンネル、length 秒でつながるループ）。
    - 聖なる響き：遠くの合唱のような、やわらかく澄んだ和音が、ゆっくり満ち引きする（明るい長調の和音）
    - 鐘：遠くで、小さな鐘がひとつ鳴り、広い広間に長く響く（2回）
    - そよ風：高い窓から入る、やわらかな空気の音
    - きらめき：光の粒のような、とても小さく高い音（まばら）"""
    rng = np.random.default_rng(seed)
    # 和音の音（Hz）。length 秒でちょうど元に戻るよう、1/length の倍数にする
    notes = [round(f * length) / length for f in (220.0, 277.18, 329.63, 440.0, 554.37)]

    def pad(m, t, lfo, side):
        ph = rng.random(12) * 2 * np.pi
        y = np.zeros(m)
        for i, f in enumerate(notes):
            # 合唱らしく、少しずつ高さのずれた声を重ねる（ゆっくりうなる）
            for d in (-0.4, 0.4):
                f2 = f + d + (0.15 if side else -0.15)
                f2 = round(f2 * length) / length
                voice = np.sin(2 * np.pi * f2 * t + ph[i]) + 0.3 * np.sin(4 * np.pi * f2 * t + ph[i + 5])
                y += voice * (0.55 + 0.45 * lfo(1 + i % 3, ph[(i + 2) % 12])) * (1.0 if i < 3 else 0.6)
        y = low(y, 2500) * (0.75 + 0.25 * lfo(2, ph[11]))
        breeze = band(rng.standard_normal(m), 1500, 6000) * (0.5 + 0.5 * lfo(3, ph[10])) * 0.6
        return high(y * 0.05 + breeze * 0.05, 60)

    base = loop_layer(pad, length)
    ev = Events(length)

    def bell(f):
        k = int(5.0 * SR)
        y = sum(ring(k, f * r, d, rng) * g for r, d, g in [(1, 2.2, 1.0), (2.01, 1.4, 0.45), (2.76, 0.9, 0.3), (5.4, 0.4, 0.12)])
        return y * env(k, 0.002, 2.0) * 0.12

    def sparkle():
        k = int(0.6 * SR)
        f = 3500 + 3000 * rng.random()
        return ring(k, f, 0.15, rng) * 0.04

    ev.place(bell(880), 4.2, -0.4, 1.0)
    ev.place(bell(659.25), 15.6, 0.5, 1.0)
    for at in np.sort(rng.random(16) * length):
        ev.place(sparkle(), at, rng.random() * 1.8 - 0.9, 0.8)
    return level_ambient(base + ev.mix(3.0, 7000, 0.8))


def ambient_dark(length=24.0, seed=17):
    """闇の環境音：光の届かない、硬い石の洞窟の奥（左右2チャンネル、length 秒でつながるループ）。
    - 低い不気味なうなり：わずかに高さのずれた低い音が、ゆっくりうなり合う（落ち着かない響きの組み合わせ）
    - ささやき：人の声のようにも聞こえる、かすかな息づかいの風が、ゆっくり満ち引きする
    - うめき声：遠くで、低い声のような音が、ゆっくり上がって下がる（2回）
    - 石の音：暗がりの奥で、石が落ちる・転がる音が、こもって長く響く（ところどころ）"""
    rng = np.random.default_rng(seed)

    def drone(m, t, lfo, side):
        ph = rng.random(10) * 2 * np.pi
        y = np.zeros(m)
        # 低い音と、そこから少し外れた不安な音を重ねる。length 秒でちょうど元に戻る高さにする
        for f, g in [(55.0, 0.45), (55.5, 0.35), (77.75, 0.3), (110.0, 0.8), (110.6, 0.6), (155.5, 0.6), (233.0, 0.3), (311.0, 0.12)]:
            f = round(f * length) / length
            y += np.sin(2 * np.pi * f * t + ph[int(f) % 10]) * g
        y = y * (0.7 + 0.3 * lfo(2, ph[0]))
        # ささやき：声の響きに近い帯域を、ゆっくり動かしたノイズ
        whisper = resonant_sweep(rng.standard_normal(m), 700 + 250 * lfo(3, ph[1]) + (60 if side else -60), 4)
        whisper = whisper * np.clip(0.35 + 0.65 * lfo(4, ph[2]), 0, 1) ** 2
        air = low(rng.standard_normal(m), 400) * 0.3
        return high(y * 0.12 + whisper * 0.9 + air * 0.25, 30)

    base = loop_layer(drone, length)
    ev = Events(length)

    def moan(dur):
        k = int(dur * SR)
        tt = np.arange(k) / SR
        f = 160 + 70 * np.sin(np.pi * tt / dur) ** 1.5
        voice = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(6 * np.pi * np.cumsum(f) / SR)
        breath = band(rng.standard_normal(k), 300, 1500) * 0.3
        return low(voice + breath, 1200) * np.sin(np.pi * tt / dur) ** 2 * 0.12

    def stone(count):
        k = int(1.2 * SR)
        y = np.zeros(k)
        at = 0.0
        for _ in range(count):
            i = int(at * SR)
            hit = band(rng.standard_normal(int(0.05 * SR)), 300, 2500) * env(int(0.05 * SR), 0.0005, 0.01)
            hit = hit + ring(len(hit), 180 + 200 * rng.random(), 0.03, rng) * 0.3
            y[i:i + len(hit)] += hit * (0.4 + 0.6 * rng.random())
            at += 0.12 + 0.25 * rng.random()
        return low(y, 1800) * 0.25

    ev.place(moan(3.0), 6.5, -0.7, 0.9)
    ev.place(moan(2.4), 17.2, 0.6, 0.9)
    for at, pan, c in [(2.8, 0.5, 2), (11.3, -0.3, 4), (14.6, 0.8, 1), (21.1, -0.6, 3)]:
        ev.place(stone(c), at, pan, 1.0)
    return level_ambient(base + ev.mix(2.6, 1800, 0.9))


# 環境音のいちばん大きいところ。足音や宝箱の音のじゃまにならないよう、小さめにする
AMBIENT_PEAK = 0.35
# 無属性の風の音の、平均の大きさ。ほかの特性の環境音も、この大きさにそろえる
AMBIENT_RMS = 0.0424
# ほかの特性の環境音で、ときどき鳴る音（割れる音など）のいちばん大きいところの上限
AMBIENT_MAX = 0.45

# 宝箱の音のいちばん大きいところ。たまにしか鳴らない大事な音なので、足音よりはっきり聞こえる大きさにする
CHEST_PEAK = 0.6

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
    write_mp3(chest_open(), OUT / 'chest-open.mp3')
    print('wrote public/sounds/chest-open.mp3')
    write_mp3(ambient_wind(), OUT / 'ambient-neutral.mp3')
    print('wrote public/sounds/ambient-neutral.mp3')
    write_mp3(ambient_ice(), OUT / 'ambient-ice.mp3')
    print('wrote public/sounds/ambient-ice.mp3')
    write_mp3(ambient_fire(), OUT / 'ambient-fire.mp3')
    print('wrote public/sounds/ambient-fire.mp3')
    write_mp3(ambient_light(), OUT / 'ambient-light.mp3')
    print('wrote public/sounds/ambient-light.mp3')
    write_mp3(ambient_dark(), OUT / 'ambient-dark.mp3')
    print('wrote public/sounds/ambient-dark.mp3')


if __name__ == '__main__':
    main()
