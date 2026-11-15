"""床・壁のテクスチャ（public/textures/{特性}/*.png）を、読み込みが軽いJPEGにする。

使い方（Python 3 と Pillow が必要）:
    python3 scripts/compress-textures.py

- 1枚1024px の絵が5特性×3枚あり、PNG のままだと合わせて15MB ほどになり、ゲームを開くときの読み込みが重い。
  JPEG（品質90、色を間引かない）にすると、見た目はほとんど変わらず、約2MBに収まる
- 宝箱のテクスチャ（透明の部分がある）は対象外
- 変換したら元の PNG は消す。作り直すときは、scripts/build-textures.ts か scripts/build-photo-textures.py のあとに、もう一度実行する
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'textures'


def main() -> None:
    for png in sorted(ROOT.glob('*/*.png')):
        if png.parent.name == 'chest':
            continue
        Image.open(png).convert('RGB').save(png.with_suffix('.jpg'), quality=90, subsampling=0, optimize=True)
        png.unlink()
        print(f'{png.parent.name}/{png.name} -> .jpg')


if __name__ == '__main__':
    main()
