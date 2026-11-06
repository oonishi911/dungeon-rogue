"""敵の写真（AIで作った画像など）から、背景を切り抜いた敵の絵（public/textures/enemies/{敵のID}.png）を作る。

使い方（Python 3 と Pillow・NumPy・OpenCV が必要。npm のスクリプトとは別）:
    pip install pillow numpy opencv-python-headless
    python3 scripts/build-enemy-textures.py            # SUBJECTS の敵をすべて作る
    python3 scripts/build-enemy-textures.py ogre_chief # 1体だけ作る

- 元の画像は assets/texture-sources/enemies/{敵のID}.jpg（または .png）に置く
- 背景の切り抜きは OpenCV の GrabCut で行う。写真ごとに、敵がいる範囲（rect）と、敵の大まかな形（body）、
  確実に敵の一部である線（strokes）を下の SUBJECTS に書いておくと、それを手がかりに切り抜く
- 写真の下の端で体が切れているときは、下の端をなめらかに透明にする（fade）。床の上で、足元が闇に溶けて見えるように
- 画面ではたいまつの光を掛けて描くので、暗い写真は少し明るくして書き出す（brighten）
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'assets' / 'texture-sources' / 'enemies'
OUT = ROOT / 'public' / 'textures' / 'enemies'
HEIGHT = 384  # 書き出す絵の高さ（px）。画面ではボスでも高さ200ドットほどなので、これで足りる

# 写真ごとの切り抜きの手がかり（座標は元の画像のピクセル）
SUBJECTS = {
    # 鬼の首領：赤い肌の鬼が、とげの付いた金棒を左手前に構えている。腰から下は写真の下で切れている
    'ogre_chief': {
        'rect': (30, 8, 1175, 760),  # 敵がいる範囲（左, 上, 右, 下）。この外は背景とみなす
        'body': [(640, 20), (870, 40), (900, 230), (1100, 330), (1160, 520), (1160, 768), (600, 768), (620, 560),
                 (540, 560), (60, 520), (60, 470), (540, 520), (620, 330), (680, 220)],
        'strokes': [((770, 130), (770, 700)), ((700, 400), (1000, 400)), ((58, 505), (580, 620)), ((70, 480), (70, 540)),
                    ((1050, 500), (1080, 700)), ((680, 60), (700, 110)), ((835, 70), (820, 110))],
        'fade': 0.14,  # 下の端の、透明にしていく範囲（絵の高さに対する割合）
        'brighten': 1.3,
    },
}


def cut_out(img: np.ndarray, s: dict) -> np.ndarray:
    """GrabCut で敵の部分を切り出し、0〜1 の不透明度を返す"""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = s['rect']
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    mask[y0:y1, x0:x1] = cv2.GC_PR_BGD
    cv2.fillPoly(mask, [np.array(s['body'], np.int32)], cv2.GC_PR_FGD)
    for a, b in s['strokes']:
        cv2.line(mask, a, b, cv2.GC_FGD, 14)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1.0, 0.0).astype(np.float32)
    # 小さな切れ端を消してから、縁を少しぼかす
    n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 400]
    alpha = np.isin(labels, keep).astype(np.float32)
    return cv2.GaussianBlur(alpha, (0, 0), 1.2)


def build(enemy: str) -> None:
    s = SUBJECTS[enemy]
    src = next((p for p in (SOURCES / f'{enemy}.jpg', SOURCES / f'{enemy}.png') if p.exists()), None)
    if src is None:
        sys.exit(f'{SOURCES}/{enemy}.jpg がない')
    img = cv2.imread(str(src))
    alpha = cut_out(img, s)

    # 敵の部分だけを切り出す（周りに少し余白を残す）
    ys, xs = np.nonzero(alpha > 0.02)
    pad = 6
    top, bottom = max(ys.min() - pad, 0), min(ys.max() + pad + 1, img.shape[0])
    left, right = max(xs.min() - pad, 0), min(xs.max() + pad + 1, img.shape[1])
    rgb = cv2.cvtColor(img[top:bottom, left:right], cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    a = alpha[top:bottom, left:right]

    # 下の端をなめらかに透明にする
    rows = a.shape[0]
    fade = max(int(rows * s.get('fade', 0)), 1)
    t = np.clip((rows - 1 - np.arange(rows, dtype=np.float32)) / fade, 0, 1)
    a = a * (t * t * (3 - 2 * t))[:, None]

    rgb = np.clip(rgb * s.get('brighten', 1.0), 0, 1)
    out = np.dstack([rgb, a])
    size = (round(out.shape[1] * HEIGHT / out.shape[0]), HEIGHT)
    image = Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f'{enemy}.png', optimize=True)
    print(f'wrote public/textures/enemies/{enemy}.png ({size[0]}x{size[1]}, 横:縦 = {size[0] / size[1]:.3f})')


if __name__ == '__main__':
    for enemy in sys.argv[1:] or SUBJECTS:
        build(enemy)
