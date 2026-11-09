# 3D表示のテクスチャの仕様

3D表示の床と壁に貼る画像。ダンジョン特性ごとに見た目を変える。
氷と炎は、端でつながる画像（`assets/texture-sources/ice.jpg`・`fire.jpg`）から作った素材。ほかの特性（無属性・光・闇）は、`scripts/build-textures.ts` で作った仮の素材が入っている。
同じ名前のPNGに差し替えれば、そのまま画面に反映される（大きさはコードでは決めていない）。

## ファイル

特性ごとのフォルダに、3枚の画像を置く。

```
public/textures/
  fire/      炎
  ice/       氷
  neutral/   無属性
  light/     光
  dark/      闇
    floor.png       床
    wall-top.png    壁の上面
    wall-side.png   壁の側面
```

- PNG。大きさと、1枚が何マス分かは次のとおり。

| 画像 | 何マス分か | 仮の素材 | 画像から作った素材 |
|---|---|---|---|
| 床 | 4×4マス | 512×512px | 512×512px |
| 壁の上面 | 4×4マス | 512×512px | 512×512px |
| 壁の側面 | 横4マス×高さ1 | 512×128px | 512×128px |
- **なめらかな質感**として描く（ドット絵ではない）。画面では拡大・縮小ともになめらかに補間し、縮小用の画像（ミップマップ）を作って、歩いたときに模様がちらつかないようにしている。斜めから見る床がぼけないよう、異方性フィルタリング（最大8）もかけている。
- どれも1マスあたり128px。画面では1マスが約48px（CSSピクセル）で映る。スマホは画面が2〜3倍細かいので、実際には1マスに約100〜150ドットを使う。128pxならほぼ1ドットずつ表示されるので、これより大きくしても見た目はほとんど変わらない。
- どれも1枚の絵を何マスにもまたがって貼る。マスごとに絵のどこを使うかは、ダンジョンの中の位置で決める（`src/ui/explore3d.ts` の `worldMapped`）。そのため、隣り合うマスの模様はつながり、同じ模様の繰り返しは4マスごとになる。**端どうしがつながるように描き、マスの境目に目地や縁取りは描かない**（床も壁も、マスに分かれずひと続きに見えるように）。
- 1枚でも読み込めなかったときは、その特性は色だけで描く。

### 床
- 1枚の絵を4×4マスにまたがって貼る。真上から見た絵として描く。画面ではカメラが斜め上（約63度）から見下ろすので、少し縦に縮んで見える。
- 壁の上面より暗めに描く。上から見ると床と壁の上面が並ぶので、明るさが違わないと見分けにくい。
- 画面では、床は壁の上面と比べて90度回し、位置もずらして貼る（画像から作った素材は床と壁の上面が同じ絵なので、模様がそろって見えないように）。

### 壁の上面
- 壁（箱）の上の面。真上から見た絵として描く。
- 1枚の絵を4×4マスにまたがって貼る。
- **上下左右の端で模様がつながるように描く**。**マスの境目に縁取りは描かない**（壁がマスに分かれず、ひと続きの岩の塊に見えるように）。

### 壁の側面
- 壁（箱）の横の面。4方向とも同じ絵が使われる。
- 1枚の絵を、壁に沿って横4マス・高さ1にまたがって貼る（上面と同じく、位置で絵のどこを使うかが決まる）。
- **左右の端で模様がつながるように描く**。仮の素材は段ごとに半分ずらしたレンガ積み、画像から作った素材はひと続きの岩肌。

## 色と明るさについて
- 画面では、テクスチャに明るさを掛けて描く。今見えているマスは主人公から離れるほどなめらかに暗く（端で50%）、一度見たが今は見えていないマスは30%になる。
- 壁の側面は、上面より暗く描かれる（向きによって60〜85%）。
- 明るさはほぼ主人公のたいまつの光で決まり、光の届かない場所はかなり暗くなる。壁の上面はたいまつより高いので、たいまつの光は当たらない。暗い場所でも形がわかるよう、**真っ黒に近い色は避ける**。

## 宝箱（`public/textures/chest/`）

宝箱は、箱の本体とかまぼこ形のふたでできた形で、どのダンジョンでも同じテクスチャを使う。宝箱の写真（`assets/texture-sources/chest.jpg`）から作る。

```bash
pip install pillow
python3 scripts/build-chest-textures.py
```

| 画像 | 貼る場所 | 大きさ |
|---|---|---|
| `front.png` | 本体の正面と背面（錠前と鉄の帯） | 256×136px |
| `side.png` | 本体の左右・上下、ふたの両端（取っ手） | 160×136px |
| `lid.png` | ふたの曲面。鉄の帯がふたの前から後ろへかかるよう、90度回して書き出す | 256×256px |

- 写真の中の面を、斜めから見た形をまっすぐに直して切り出す（切り出す四隅はスクリプトの `QUADS`）
- 読み込めなかったときは、金色で描く

## 敵の写真（`public/textures/enemies/`）

写真（AIで作った画像など）から作った敵の絵。ある敵はドット絵の代わりにこの絵で描き、ない敵はドット絵のまま。

```bash
pip install pillow numpy opencv-python-headless
python3 scripts/build-enemy-textures.py            # すべて作る
python3 scripts/build-enemy-textures.py ogre_chief # 1体だけ作る
```

| 敵 | 元の画像 | 画像 | 画面での高さ |
|---|---|---|---|
| ゴブリン（`goblin`） | `assets/texture-sources/enemies/goblin.jpg` | `goblin.png`（555×384px） | 1マス |
| 大ネズミ（`giant_rat`） | `assets/texture-sources/enemies/giant_rat.jpg` | `giant_rat.png`（415×384px） | 0.8マス |
| 石ゴーレム（`stone_golem`） | `assets/texture-sources/enemies/stone_golem.jpg` | `stone_golem.png`（375×384px） | 1.15マス |
| 鬼の首領（`ogre_chief`） | `assets/texture-sources/enemies/ogre_chief.jpg` | `ogre_chief.png`（536×384px） | 1.3マス |

- 元の画像は `assets/texture-sources/enemies/{敵のID}.jpg` に置く。背景はスクリプトが OpenCV の GrabCut で切り抜く。写真ごとに、敵がいる範囲・大まかな形・確実に敵の一部である線や形・確実に背景である形（空の色を背景とみなすかも）を、スクリプトの `SUBJECTS` に書いておく
- 背景を透明にしたPNG（高さ384px）。写真の下の端で体が切れているときは、下の端をなめらかに透明にして、足元が闇に溶けて見えるようにする
- 画面ではドット絵と同じく、カメラの方を向けた板に貼り、たいまつの光と霧をかける。絵の大きさと、足元（マスの中心に置く位置）は `src/ui/explore3d.ts` の `ENEMY_PHOTOS` で決める
- 新しい敵を足すときは、`SUBJECTS` と `ENEMY_PHOTOS` の両方に書き足す。スクリプトが表示する `aspect`（絵の横:縦）と `footX`（足元の位置）を `ENEMY_PHOTOS` に書く

### 向きのある敵（正面・側面・背面の設定画から作る）

正面・側面・背面が1枚に並んだ設定画からは、向きごとに3枚の絵を切り抜く（`{敵のID}-front.png`・`-side.png`・`-back.png`）。画面では、敵が歩いた向き（止まっているときは、追っている主人公の方）に合わせて絵を切り替える。下へ向くと正面、上へ向くと背面、左右は側面（側面の絵は左を向いているので、右を向くときは左右を反転する）。

| 敵 | 元の設定画 | 正面の画面での高さ |
|---|---|---|
| 溶岩スライム（`lava_slime`） | `assets/texture-sources/enemies/lava_slime.jpg` | 0.8マス |
| 岩鬼イワオ（`iwao`） | `assets/texture-sources/enemies/iwao.jpg` | 1.25マス |
| レイス（`wraith`） | `assets/texture-sources/enemies/wraith.jpg` | 1.1マス |
| トロル（`troll`） | `assets/texture-sources/enemies/troll.jpg` | 1.2マス |
| イエティ（`yeti`） | `assets/texture-sources/enemies/yeti.jpg` | 1.15マス |
| 暗黒騎士（`dark_knight`） | `assets/texture-sources/enemies/dark_knight.jpg` | 1.15マス |
| 聖騎士（`holy_knight`） | `assets/texture-sources/enemies/holy_knight.jpg` | 1.15マス |

- スクリプトの `SUBJECTS` には、向きごとに `敵のID-front` のような名前で書き、`source` に元の設定画の名前を書く
- 設定画のラベル文字や寸法の線が体に重なっているところは `inpaint`（まわりの模様で埋めて消す）、背景と体の色が近い敵は `tight`（形を囲んで外は確実に背景とする）、明るい紙のような背景は `light_bg` で除く
- `src/ui/enemyViews.json` に、向きごとの `aspect`・`footX` と、スクリプトが表示する `source px`（元の設定画での絵の高さ）を書く。向きを変えても大きさが変わらないよう、正面の高さに `source px` の比を掛けて、ほかの向きの高さを決める
- 3つの向きの絵がすべて読み込めたときだけ使う。読み込めなければドット絵のまま

### 立体の模型にする（`scripts/build-enemy-models.py`）

向きのある敵は、3枚の絵を板として切り替える代わりに、立体の模型で描く。模型の表面には、同じ3枚の絵を投影して貼る（`src/ui/projectedSkin.ts`）。

- トロルは、体の各部を手で組んだ模型（`src/ui/troll3d.ts`）。腕を振り、息をする
- ほかの6体は、正面と側面（と背面）の絵の輪郭から形を削り出した模型（`public/models/enemies/{敵のID}.bin`、`src/ui/enemyModel.ts`）。体全体で、歩く・浮かぶ・弾むように動く（`src/ui/explore3d.ts` の `SHAPED_ENEMIES`）

```bash
pip install pillow numpy scipy scikit-image
python3 scripts/build-enemy-models.py        # すべて作る
python3 scripts/build-enemy-models.py yeti   # 1体だけ作る
```

- 絵を作り直したり `enemyViews.json` を変えたりしたら、模型も作り直す
- 模型が読み込めなければ、絵の板で描く

## 画像から作る（`scripts/build-photo-textures.py`）

端どうしがつながる（並べても継ぎ目が出ない）正方形の画像1枚から、3枚をまとめて作る。

```bash
pip install pillow numpy
python3 scripts/build-photo-textures.py ice assets/texture-sources/ice.jpg
```

- 元の画像は `assets/texture-sources/{特性}.jpg`（または `.png`）に置く。1024×1024px くらいがよい
- 床と壁の上面は元の画像全体（端どうしがつながる）、壁の側面は元の画像の横いっぱいの帯を使う。床は壁より明るくならないよう少し暗くする。目地や縁取りは付けない
- `assets/texture-sources/` に画像がある特性は、下の仮の素材のスクリプトでは上書きしない

## 仮の素材の作り直し

```bash
npx tsx scripts/build-textures.ts
```

端でつながるノイズを重ねて描いている（乱数は使わないので、作り直しても同じ絵になる）。色は `scripts/pixels.ts` の `PALETTES`。

## 確かめ方

```bash
npm run dev
```

`http://localhost:5173/?view=explore&trait=fire` のように特性を指定して開くと、そのテクスチャで探索画面を確かめられる（`&seed=1` で同じ階層、`&rank=3` で広さを指定）。
