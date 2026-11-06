"""写真のようなシームレステクスチャ1枚から、3D表示のテクスチャ3枚（床・壁の上面・壁の側面）を作る。

使い方（Python 3 と Pillow・NumPy が必要。npm のスクリプトとは別）:
    pip install pillow numpy
    python3 scripts/build-photo-textures.py ice assets/texture-sources/ice.jpg

- 元の画像は、端どうしがつながる（並べても継ぎ目が出ない）正方形の画像にする。1024×1024px くらいがよい
- 書き出し先は public/textures/{特性}/
- 床（1枚で4×4マス、512×512px）：元の画像全体を、壁より明るくならないよう少し暗くして使う。目地は付けない
- 壁の上面（1枚で4×4マス、512×512px）：元の画像全体をそのまま使う。元の画像は端どうしがつながるので、マスの境目に縁取りのない
  ひと続きの岩肌になる
- 壁の側面（1枚で横4マス、512×128px）：元の画像の横いっぱいの帯。上側を少し明るくする
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SPAN = 4  # 絵1枚が、何マス分にまたがるか（src/ui/explore3d.ts の TEXTURE_SPAN と合わせる）
TILE = 128  # 1マスの大きさ（px）。絵は何マスにもまたがって大きいので、スマホで読み込みが重くならないようにこの大きさにする
# 床に混ぜる深い色（特性ごと）。足りない特性は無属性の色を使う
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
    deep = np.array(DEEP.get(trait, DEEP['neutral']), np.float32) / 255

    out = Path(__file__).resolve().parent.parent / 'public' / 'textures' / trait
    out.mkdir(parents=True, exist_ok=True)

    def save(a: np.ndarray, name: str) -> None:
        Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out / name, optimize=True)

    wall = TILE * SPAN

    # 床：元の画像全体（端どうしがつながる）を、4×4マス分の大きさにする。壁より明るくならないよう少し暗くする。
    # 壁の上面と同じ絵なので、画面では向きと位置をずらして貼る（src/ui/explore3d.ts の worldMapped）
    floor = np.asarray(src.resize((wall, wall), Image.LANCZOS)).astype(np.float32) / 255
    save(floor * 0.62 + deep * 0.12, 'floor.png')

    # 壁の上面：元の画像全体（端どうしがつながる）を、4×4マス分の大きさにする
    top = np.asarray(src.resize((wall, wall), Image.LANCZOS)).astype(np.float32) / 255
    save(top * 0.95, 'wall-top.png')

    # 壁の側面：元の画像の横いっぱいの帯（高さは画像の1/4）を、横4マス分の大きさにする。左右の端でつながる
    band = src.crop((0, int(h * 0.371), w, int(h * 0.371) + h // SPAN)).resize((wall, TILE), Image.LANCZOS)
    side = np.asarray(band).astype(np.float32) / 255 * 0.82
    ly = (np.arange(TILE, dtype=np.float32) + 0.5)[:, None, None] / TILE
    save(side * (1.06 - ly * 0.14), 'wall-side.png')  # 上側は光が当たって明るい
    print(f'wrote public/textures/{trait}/ (floor, wall-top, wall-side)')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('使い方: python3 scripts/build-photo-textures.py <特性> <元の画像>')
    main(sys.argv[1], sys.argv[2])
