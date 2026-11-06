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
# - rect：敵がいる範囲（左, 上, 右, 下）。この外は背景とみなす
# - body：敵の大まかな形（多角形のリスト）。この中は「たぶん敵」として切り抜きを始める
# - strokes：確実に敵の一部である線。sure：確実に敵の一部である多角形（背景と色が似ている部分に使う）
# - background：確実に背景である多角形（敵の近くにある物など）。sky：空の色（明るく、くすんだ青）を背景とみなす
# - foot：足元（マスの中心に置く位置）の x。fade：下の端の、透明にしていく範囲（絵の高さに対する割合）
# - brighten：明るさの倍率（画面ではたいまつの光を掛けて描くので、暗い写真は少し明るくする）
SUBJECTS = {
    # ゴブリン：緑の肌で、とげの付いた棍棒を左手前に構えている。太ももから下は写真の下で切れている
    'goblin': {
        'rect': (130, 15, 1205, 768),
        'body': [[(640, 20), (950, 20), (960, 230), (1170, 450), (1205, 760), (580, 768), (560, 470), (640, 230)],
                 [(140, 480), (300, 440), (640, 600), (640, 690), (200, 610)]],
        'strokes': [((790, 100), (790, 740)), ((680, 420), (1080, 420)), ((180, 500), (620, 650)), ((1110, 520), (1140, 720)),
                    ((680, 60), (690, 120)), ((830, 70), (820, 120))],
        'foot': 790, 'fade': 0.16, 'brighten': 1.3,
    },
    # 大ネズミ：下水道で、こちらへ飛びかかろうとしている。体は写真の中に全部入っている。右下の空き缶は背景
    'giant_rat': {
        'rect': (460, 45, 1150, 700),
        'body': [[(470, 140), (520, 90), (700, 55), (860, 70), (960, 150), (1010, 300), (1130, 380), (1140, 450), (1000, 430),
                  (975, 540), (880, 520), (760, 560), (760, 690), (640, 690), (580, 630), (560, 520), (480, 420), (470, 300)]],
        'strokes': [((560, 250), (950, 250)), ((540, 330), (640, 200)), ((600, 480), (600, 640)), ((700, 520), (720, 670)),
                    ((920, 420), (930, 500)), ((1005, 335), (1060, 365)), ((1060, 365), (1120, 420))],
        # 背中の茶色い毛は、後ろのれんがと色が似ているので、体の中ほどは確実に敵とする
        'sure': [[(560, 200), (700, 90), (850, 100), (940, 170), (985, 300), (975, 410), (860, 460), (700, 470), (600, 420), (540, 330)]],
        'background': [[(885, 565), (1100, 525), (1100, 700), (885, 700)]],
        'foot': 760, 'fade': 0, 'brighten': 1.15,
    },
    # 石ゴーレム：青く光る文字の刻まれた岩の巨人。足元まで写真の中に入っている
    'stone_golem': {
        'rect': (490, 20, 1205, 765),
        'body': [[(500, 280), (640, 80), (740, 30), (860, 30), (1000, 80), (1100, 190), (1195, 380), (1190, 470), (1120, 590),
                  (1000, 570), (1000, 760), (620, 760), (640, 560), (600, 590), (500, 500)]],
        'strokes': [((820, 60), (820, 740)), ((600, 200), (1060, 200)), ((540, 330), (560, 560)), ((1130, 400), (1100, 540)),
                    ((700, 500), (690, 740)), ((950, 500), (950, 740))],
        # 足元の地面と、腕や脚のすき間の空は背景
        'background': [[(490, 735), (1205, 735), (1205, 768), (490, 768)], [(490, 640), (640, 640), (640, 735), (490, 735)],
                       [(1040, 560), (1205, 560), (1205, 735), (1040, 735)], [(795, 480), (848, 480), (848, 640), (795, 640)],
                       [(780, 640), (890, 640), (890, 735), (780, 735)]],
        # 青白い石（右腕の、文字の刻まれた石）は空の色に近いので、体の中ほどは確実に敵とする
        'sure': [[(720, 150), (940, 150), (935, 300), (905, 440), (745, 440), (728, 300)], [(1050, 345), (1185, 345), (1185, 435), (1050, 435)],
                 [(660, 500), (760, 500), (760, 700), (660, 700)], [(900, 500), (1000, 500), (1000, 700), (900, 700)],
                 [(530, 340), (605, 340), (600, 550), (535, 550)]],
        'sky': True,
        'foot': 830, 'fade': 0, 'brighten': 0.9,
    },
    # 鬼の首領：赤い肌の鬼が、とげの付いた金棒を左手前に構えている。ひざから下は写真の下で切れている
    'ogre_chief': {
        'rect': (150, 70, 1160, 768),
        'body': [[(700, 80), (880, 80), (1000, 100), (1070, 180), (1080, 330), (1130, 400), (1150, 620), (1000, 700), (1000, 768),
                  (560, 768), (540, 600), (520, 330), (560, 240)],
                 [(160, 580), (530, 500), (530, 580), (160, 710)]],
        'strokes': [((790, 120), (790, 740)), ((600, 350), (930, 350)), ((190, 640), (500, 560)), ((1060, 380), (1080, 560))],
        # 胴と右腕のあいだ、右手の下に見える岩は背景
        'background': [[(948, 330), (992, 330), (992, 465), (948, 465)], [(1120, 610), (1160, 600), (1160, 768), (1005, 768), (1005, 690)]],
        'foot': 790, 'fade': 0.14, 'brighten': 1.3,
    },
}


def cut_out(img: np.ndarray, s: dict) -> np.ndarray:
    """GrabCut で敵の部分を切り出し、0〜1 の不透明度を返す"""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = s['rect']
    mask = np.full((h, w), cv2.GC_BGD, np.uint8)
    mask[y0:y1, x0:x1] = cv2.GC_PR_BGD
    cv2.fillPoly(mask, [np.array(poly, np.int32) for poly in s['body']], cv2.GC_PR_FGD)
    for a, b in s['strokes']:
        cv2.line(mask, a, b, cv2.GC_FGD, 14)
    for poly in s.get('sure', []):
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_FGD)
    if s.get('sky'):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        b, r = img[..., 0].astype(int), img[..., 2].astype(int)
        # 青空と、地平線近くの白っぽいもや（どちらも青みがあり、岩は赤みがある）
        sky = ((b - r > 10) & (hsv[..., 2] > 120) & (hsv[..., 1] < 120) | (b - r >= 0) & (hsv[..., 2] > 160) & (hsv[..., 1] < 50)) & (mask != cv2.GC_FGD)
        mask[sky] = cv2.GC_BGD
    for poly in s.get('background', []):
        cv2.fillPoly(mask, [np.array(poly, np.int32)], cv2.GC_BGD)
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
    if s.get('fade', 0) > 0:
        a = a * (t * t * (3 - 2 * t))[:, None]

    rgb = np.clip(rgb * s.get('brighten', 1.0), 0, 1)
    out = np.dstack([rgb, a])
    size = (round(out.shape[1] * HEIGHT / out.shape[0]), HEIGHT)
    image = Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').resize(size, Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f'{enemy}.png', optimize=True)
    # src/ui/explore3d.ts の ENEMY_PHOTOS に書く値
    print(f'wrote public/textures/enemies/{enemy}.png ({size[0]}x{size[1]}) aspect: {size[0] / size[1]:.3f}, footX: {(s["foot"] - left) / (right - left):.2f}')


if __name__ == '__main__':
    for enemy in sys.argv[1:] or SUBJECTS:
        build(enemy)
