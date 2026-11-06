"""写真のようなシームレステクスチャ1枚から、3D表示のテクスチャ6枚（床1〜4・壁の上面・壁の側面）を作る。

使い方（Python 3 と Pillow・NumPy が必要。npm のスクリプトとは別）:
    pip install pillow numpy
    python3 scripts/build-photo-textures.py ice assets/texture-sources/ice.jpg

- 元の画像は、端どうしがつながる（並べても継ぎ目が出ない）正方形の画像にする。1024×1024px くらいがよい
- 書き出し先は public/textures/{特性}/
- 床（1枚1マス、256×256px。写真の細かい模様を生かすため、仮の素材の128pxより大きい）：画像の別々の場所を4か所切り出し、
  壁より明るくならないよう少し暗くして、縁を目地へなだらかに沈ませる（種類の違う床が隣り合っても、継ぎ目が板の目地に見えるように）
- 壁の上面（1枚で4×4マス、512×512px）：元の画像全体をそのまま使う。元の画像は端どうしがつながるので、マスの境目に縁取りのない
  ひと続きの岩肌になる
- 壁の側面（1枚で横4マス、512×128px）：元の画像の横いっぱいの帯。上側を少し明るくする
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 256  # 1マスの大きさ（px）
WALL_SPAN = 4  # 壁の絵1枚が、何マス分にまたがるか（src/ui/explore3d.ts の WALL_TEXTURE_SPAN と合わせる）
WALL_TILE = 128  # 壁の1マスの大きさ（px）。壁の絵は大きいので、スマホで読み込みが重くならないよう床より小さくする
# 継ぎ目や陰に使う深い色（特性ごと）。足りない特性は無属性の色を使う
DEEP = {
    'ice': (0x16, 0x2A, 0x3A),
    'fire': (0x25, 0x0C, 0x08),
    'neutral': (0x14, 0x1A, 0x18),
    'light': (0x4A, 0x41, 0x28),
    'dark': (0x0C, 0x09, 0x12),
}


def main(trait: str, source: str) -> None:
    src = Image.open(source).convert('RGB')
    w, h = src.size
    # 端でつながる画像なので、2×2に並べてから切り出せば、どの位置からでも切り出せる
    tiled = Image.new('RGB', (w * 2, h * 2))
    for i in range(2):
        for j in range(2):
            tiled.paste(src, (i * w, j * h))

    def crop(x: float, y: float, size: float) -> np.ndarray:
        box = (int(x * w), int(y * h), int(x * w + size * w), int(y * h + size * h))
        return np.asarray(tiled.crop(box).resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float32) / 255

    deep = np.array(DEEP.get(trait, DEEP['neutral']), np.float32) / 255
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) + 0.5
    edge = np.minimum.reduce([xx, yy, SIZE - xx, SIZE - yy]) / SIZE  # 縁で0、中央で0.5

    def smooth(t: np.ndarray) -> np.ndarray:
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)

    out = Path(__file__).resolve().parent.parent / 'public' / 'textures' / trait
    out.mkdir(parents=True, exist_ok=True)

    def save(a: np.ndarray, name: str) -> None:
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out / name, optimize=True)

    # 床：画像の4か所（元の画像に対する割合）。半分の大きさで切り出す
    for k, (ox, oy) in enumerate([(0, 0), (0.5, 0.094), (0.156, 0.5), (0.625, 0.586)]):
        a = crop(ox, oy, 0.5) * 0.62 + deep * 0.12
        b = smooth(edge / 0.11)[..., None]
        save(a * (0.45 + 0.55 * b) + deep * (1 - b) * 0.35, f'floor{k + 1}.png')

    # 壁の上面：元の画像全体（端どうしがつながる）を、4×4マス分の大きさにする
    wall = WALL_TILE * WALL_SPAN
    top = np.asarray(src.resize((wall, wall), Image.LANCZOS)).astype(np.float32) / 255
    save(top * 0.95, 'wall-top.png')

    # 壁の側面：元の画像の横いっぱいの帯（高さは画像の1/4）を、横4マス分の大きさにする。左右の端でつながる
    band = src.crop((0, int(h * 0.371), w, int(h * 0.371) + h // WALL_SPAN)).resize((wall, WALL_TILE), Image.LANCZOS)
    side = np.asarray(band).astype(np.float32) / 255 * 0.82
    ly = (np.arange(WALL_TILE, dtype=np.float32) + 0.5)[:, None, None] / WALL_TILE
    save(side * (1.06 - ly * 0.14), 'wall-side.png')  # 上側は光が当たって明るい
    print(f'wrote public/textures/{trait}/ (floor1-4, wall-top, wall-side)')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('使い方: python3 scripts/build-photo-textures.py <特性> <元の画像>')
    main(sys.argv[1], sys.argv[2])
