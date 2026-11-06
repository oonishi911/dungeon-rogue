"""宝箱の写真（assets/texture-sources/chest.jpg）から、3D表示の宝箱のテクスチャ3枚を作る。

使い方（Python 3 と Pillow が必要。npm のスクリプトとは別）:
    pip install pillow
    python3 scripts/build-chest-textures.py

書き出し先は public/textures/chest/（どのダンジョンでも共通）。
- front.png（256×136px）：箱の正面（錠前と鉄の帯）。写真の正面を、斜めから見た形をまっすぐに直して切り出す
- side.png（160×136px）：箱の横（取っ手）。写真では暗いので、少し明るくする。ふたの両端にも使う
- lid.png（256×256px）：かまぼこ形のふた。鉄の帯がふたの前から後ろへかかるように、90度回して書き出す
  （ふたの前側の留め金が、正面の錠前の上に来る向き）

切り出す位置は、この写真に合わせた値（写真の左上が原点のピクセル座標）。別の写真に替えるときは QUADS を直す。
"""
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'texture-sources' / 'chest.jpg'
OUT = ROOT / 'public' / 'textures' / 'chest'

# 面ごとの、写真の中の四隅（左上・左下・右下・右上）と、書き出す大きさ
QUADS = {
    'front': ((256, 136), [(470, 352), (478, 605), (1012, 690), (1003, 362)]),
    'side': ((160, 136), [(1006, 362), (1012, 610), (1150, 575), (1150, 348)]),
    'lid': ((256, 256), [(505, 172), (478, 300), (1003, 303), (990, 166)]),
}


def main() -> None:
    photo = Image.open(SOURCE).convert('RGB')
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (size, corners) in QUADS.items():
        data = [v for corner in corners for v in corner]
        image = photo.transform(size, Image.QUAD, data=data, resample=Image.BICUBIC)
        if name == 'side':
            image = ImageEnhance.Brightness(image).enhance(1.35)
        if name == 'lid':
            image = image.rotate(-90, expand=True)
        image.save(OUT / f'{name}.png', optimize=True)
    print('wrote public/textures/chest/ (front, side, lid)')


if __name__ == '__main__':
    main()
