"""正面・側面・背面の絵（public/textures/enemies/{敵のID}-{向き}.png）の輪郭から、敵の立体の形（public/models/enemies/{敵のID}.bin）を作る。

使い方（Python 3 と Pillow・NumPy・SciPy・scikit-image が必要。npm のスクリプトとは別）:
    pip install pillow numpy scipy scikit-image
    python3 scripts/build-enemy-models.py              # MODELS の敵をすべて作る
    python3 scripts/build-enemy-models.py yeti         # 1体だけ作る

作り方：
- 空間を小さな立方体（ボクセル）に区切り、正面の絵と側面の絵の両方で「体の中」に見える立方体だけを残す（輪郭から削り出す）。
  背面の絵でも、少し余裕を持たせて「体の外」の立方体を削る
- 2方向の輪郭だけだと、上から見て四角い体になるので、横の幅と奥行きの範囲の中で、角を丸めた形（超楕円）にする
- 残った立方体の集まりをぼかしてから、表面を三角形の網にする（マーチングキューブ法）
- 表面の色は、画面で同じ絵を投影して貼る（src/ui/projectedSkin.ts）。ここでは形だけを書き出す

書き出す形式（リトルエンディアン）：頂点の数（uint32）、三角形の頂点番号の数（uint32）、
頂点の位置（float32 × 3 × 頂点の数、マス単位で足元が原点、正面が +z）、三角形の頂点番号（uint16 × 番号の数）
絵の大きさと足元の位置は src/ui/enemyViews.json（画面で絵を貼るときと同じ値）を使う。
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure

ROOT = Path(__file__).resolve().parent.parent
TEXTURES = ROOT / 'public' / 'textures' / 'enemies'
OUT = ROOT / 'public' / 'models' / 'enemies'
VIEWS = json.loads((ROOT / 'src' / 'ui' / 'enemyViews.json').read_text())

VOXEL = 0.014  # 立方体の一辺（マス）
ROUND = 2.4  # 角の丸め方（2 で楕円、大きいほど四角に近い）
SMOOTH = 1.3  # 表面をなめらかにする強さ（立方体いくつ分ぼかすか）
BACK_SLACK = 6  # 背面の絵で削るときの余裕（絵のpx）。正面と背面の絵の位置が少しずれていても削りすぎないように
DEPTH_PER_WIDTH = 1.5  # 腕など細い部分の奥行きを、幅の何倍までにするか（体の奥行きのまま太くならないように）

# 立体にする敵。トロルは手で組んだ模型（src/ui/troll3d.ts）なので入れない
MODELS = ['lava_slime', 'iwao', 'wraith', 'yeti', 'dark_knight', 'holy_knight']


def load_mask(file: str) -> np.ndarray:
    alpha = np.asarray(Image.open(TEXTURES / file).convert('RGBA'))[:, :, 3]
    return alpha > 128


class View:
    """1枚の絵。世界の座標（横 a、高さ y）から、絵のピクセルが体の中かを調べる"""

    def __init__(self, spec: dict, height: float, sign: float, slack: int = 0):
        mask = load_mask(spec['file'])
        if slack:
            mask = ndimage.binary_dilation(mask, iterations=slack)
        self.mask = mask
        self.h, self.w = mask.shape
        self.height = height  # 絵の縦全体が何マスか
        self.foot = spec['footX']
        self.aspect = spec['aspect']
        self.sign = sign  # 横の座標が増えると、絵の右へ進むなら 1、左へ進むなら -1

    def cols(self, a: np.ndarray) -> np.ndarray:
        u = self.foot + self.sign * a / (self.height * self.aspect)
        return np.floor(u * self.w).astype(int)

    def rows(self, y: np.ndarray) -> np.ndarray:
        return np.floor((1 - y / self.height) * self.h).astype(int)

    def inside(self, a: np.ndarray, y: np.ndarray) -> np.ndarray:
        c, r = self.cols(a), self.rows(y)
        ok = (c >= 0) & (c < self.w) & (r >= 0) & (r < self.h)
        out = np.zeros(np.broadcast(a, y).shape, dtype=bool)
        cc, rr = np.broadcast_arrays(c, r)
        out[ok] = self.mask[rr[ok], cc[ok]]
        return out


def runs(line: np.ndarray):
    """True が続く範囲 [始め, 終わり) のリスト"""
    d = np.diff(np.concatenate([[0], line.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def build(enemy: str) -> tuple[np.ndarray, np.ndarray]:
    spec = VIEWS[enemy]
    base = spec['height']
    px_front = spec['views']['front']['px']
    heights = {side: base * v['px'] / px_front for side, v in spec['views'].items()}
    front = View(spec['views']['front'], heights['front'], 1)
    side = View(spec['views']['side'], heights['side'], -1)  # 側面の絵は左向き：正面（+z）が絵の左
    back = View(spec['views']['back'], heights['back'], -1, BACK_SLACK)  # 背面の絵は後ろから見るので、左右が逆

    top = max(heights.values())
    half_w = max(front.height * front.aspect * max(front.foot, 1 - front.foot), 0.1) + VOXEL * 3
    half_d = max(side.height * side.aspect * max(side.foot, 1 - side.foot), 0.1) + VOXEL * 3
    xs = np.arange(-half_w, half_w, VOXEL) + VOXEL / 2
    zs = np.arange(-half_d, half_d, VOXEL) + VOXEL / 2
    ys = np.arange(0, top + VOXEL * 3, VOXEL) + VOXEL / 2
    vol = np.zeros((len(ys), len(zs), len(xs)), dtype=bool)  # [高さ, 奥行き, 横]

    for iy, y in enumerate(ys):
        in_x = front.inside(xs, np.full_like(xs, y))
        in_z = side.inside(zs, np.full_like(zs, y))
        if not in_x.any() or not in_z.any():
            continue
        in_back = back.inside(xs, np.full_like(xs, y))
        slab = np.zeros((len(zs), len(xs)), dtype=bool)
        z_runs = runs(in_z)
        for x0, x1 in runs(in_x):
            xc, rx = (xs[x0] + xs[x1 - 1]) / 2, (x1 - x0) * VOXEL / 2
            for z0, z1 in z_runs:
                zc, rz = (zs[z0] + zs[z1 - 1]) / 2, (z1 - z0) * VOXEL / 2
                rz = min(rz, max(rx * DEPTH_PER_WIDTH, VOXEL * 2))  # 細い部分は奥行きも細く
                dx = np.abs(xs[x0:x1] - xc) / rx
                dz = np.abs(zs[:, None] - zc) / rz
                slab[:, x0:x1] |= (dx[None, :] ** ROUND + dz ** ROUND) <= 1.0
        slab &= in_back[None, :]
        vol[iy] = slab

    # いちばん大きなかたまりだけを残す（輪郭のずれで浮いた小さなかけらを消す）
    labels, n = ndimage.label(vol)
    if n > 1:
        sizes = ndimage.sum(vol, labels, range(1, n + 1))
        vol = labels == (int(np.argmax(sizes)) + 1)
    field = ndimage.gaussian_filter(vol.astype(np.float32), SMOOTH)
    field = np.pad(field, 1)
    verts, faces, _, _ = measure.marching_cubes(field, 0.5, step_size=1)
    # 添字 → マス単位の座標（[高さ, 奥行き, 横] の順を x, y, z に直す）
    iy, iz, ix = verts[:, 0] - 1, verts[:, 1] - 1, verts[:, 2] - 1
    pos = np.stack([xs[0] + ix * VOXEL, ys[0] + iy * VOXEL, zs[0] + iz * VOXEL], axis=1)
    pos[:, 1] = np.maximum(pos[:, 1] - VOXEL / 2, 0)  # 足の裏が床に着くように
    faces = faces[:, [0, 2, 1]]  # 添字の並びを入れ替えたので、面の表裏をそろえる
    return pos.astype(np.float32), faces.astype(np.uint16)


def write(enemy: str, pos: np.ndarray, faces: np.ndarray):
    OUT.mkdir(parents=True, exist_ok=True)
    idx = faces.reshape(-1)
    with open(OUT / f'{enemy}.bin', 'wb') as f:
        f.write(struct.pack('<II', len(pos), len(idx)))
        f.write(pos.astype('<f4').tobytes())
        f.write(idx.astype('<u2').tobytes())


def main():
    for enemy in sys.argv[1:] or MODELS:
        pos, faces = build(enemy)
        if len(pos) >= 65536:
            raise SystemExit(f'{enemy}: 頂点が多すぎる（{len(pos)}）')
        write(enemy, pos, faces)
        size = (OUT / f'{enemy}.bin').stat().st_size
        print(f'{enemy}: 頂点 {len(pos)}、三角形 {len(faces)}、{size // 1024}KB')


if __name__ == '__main__':
    main()
