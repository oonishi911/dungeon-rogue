// 32×32ドット絵の下絵を図形の組み合わせで作るスクリプト。
// 出力は1行32文字の文字列配列（src/sprites/data.ts に保存する形式）。

const N = 32;
type Grid = string[][];

class Canvas {
  g: Grid = Array.from({ length: N }, () => Array<string>(N).fill('.'));
  px(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < N && y >= 0 && y < N) this.g[y]![x] = c;
  }
  get(x: number, y: number) {
    return x >= 0 && x < N && y >= 0 && y < N ? this.g[y]![x]! : '.';
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, c);
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: string) {
    const s = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
      (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) this.px(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < w; dy++) this.px(Math.floor(x) + dx, Math.floor(y) + dy, c);
    }
  }
  pts(list: [number, number][], c: string) {
    for (const [x, y] of list) this.px(x, y, c);
  }
  /** 左半分（x=0〜15）を右に写す */
  mirror() {
    for (let y = 0; y < N; y++) for (let x = 0; x < 16; x++) this.g[y]![N - 1 - x] = this.g[y]![x]!;
  }
  /** 色 c のうち、右か下が空いているドットを影色 s にする */
  shade(c: string, s: string) {
    const hits: [number, number][] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (this.get(x, y) === c && (this.get(x + 1, y) === '.' || this.get(x, y + 1) === '.')) hits.push([x, y]);
    this.pts(hits, s);
  }
  /** 色 c のうち、上か左が空いているドットを明るい色 l にする */
  light(c: string, l: string) {
    const hits: [number, number][] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (this.get(x, y) === c && (this.get(x - 1, y) === '.' || this.get(x, y - 1) === '.')) hits.push([x, y]);
    this.pts(hits, l);
  }
  /** 絵のまわりに1ドットのふちを付ける */
  outline(c = 'k') {
    const hits: [number, number][] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (this.get(x, y) !== '.') continue;
        const n = [this.get(x + 1, y), this.get(x - 1, y), this.get(x, y + 1), this.get(x, y - 1)];
        if (n.some((v) => v !== '.' && v !== c)) hits.push([x, y]);
      }
    this.pts(hits, c);
  }
  rows() {
    return this.g.map((r) => r.join(''));
  }
}

export const SPRITES: Record<string, () => string[]> = {
  hero() {
    const c = new Canvas();
    // マント（体）
    for (let y = 15; y <= 27; y++) {
      const hw = 5 + (y - 15) * 0.5;
      c.rect(Math.round(15.5 - hw), y, 15, y, 'C');
    }
    c.rect(12, 16, 12, 26, 'H'); // マントの前の縁
    c.rect(13, 16, 15, 26, 't'); // 服
    c.rect(13, 21, 15, 21, 'b'); // ベルト
    c.rect(9, 22, 10, 23, 's'); // 手
    c.rect(13, 27, 14, 28, 'p'); // 脚
    c.rect(12, 29, 14, 30, 'B'); // ブーツ
    // フード
    c.ell(15.5, 9.5, 8, 7.5, 'H');
    c.ell(15.5, 11.5, 5.6, 4.6, 's');
    c.rect(11, 7, 15, 8, 'h'); // 前髪
    c.rect(12, 9, 12, 9, 'h');
    c.rect(12, 11, 13, 12, 'k'); // 目
    c.px(12, 11, 'W');
    c.mirror();
    c.shade('C', 'c');
    c.shade('t', 'T');
    c.shade('s', 'S');
    c.outline();
    return c.rows();
  },

  goblin() {
    const c = new Canvas();
    c.ell(15.5, 22, 6, 5, 'g'); // 体
    c.rect(11, 23, 15, 26, 'n'); // 腰布
    c.rect(12, 27, 13, 28, 'g'); // 脚
    c.rect(11, 29, 13, 30, 'G');
    c.rect(8, 19, 9, 24, 'g'); // 腕
    c.ell(15.5, 11, 7, 6, 'g'); // 頭
    c.pts([[8, 10], [7, 10], [8, 11], [7, 11], [6, 9], [7, 9], [5, 8], [6, 8], [4, 7], [5, 7], [3, 6], [6, 10], [5, 9], [4, 8], [3, 7], [7, 12], [6, 11]], 'g'); // 耳
    c.rect(11, 9, 13, 11, 'Y'); // 目
    c.rect(12, 10, 13, 11, 'k');
    c.rect(12, 14, 15, 14, 'k'); // 口
    c.px(13, 15, 'W');
    c.mirror();
    // 右手のこん棒
    c.rect(22, 19, 23, 24, 'g');
    c.rect(24, 9, 26, 22, 'n');
    c.rect(23, 6, 27, 12, 'N');
    c.shade('g', 'G');
    c.shade('n', 'N');
    c.outline();
    return c.rows();
  },

  fire_imp() {
    const c = new Canvas();
    c.ell(15.5, 18, 9, 8.5, 'R'); // 体
    c.line(9, 12, 6, 4, 'F', 2); // 角
    c.pts([[14, 9], [15, 8], [15, 7], [14, 6], [15, 5]], 'F'); // 頭の炎
    c.pts([[15, 9], [14, 8]], 'Y');
    c.ell(6, 21, 2.5, 2.5, 'r'); // 腕
    c.rect(11, 26, 13, 28, 'r'); // 脚
    c.rect(10, 29, 13, 30, 'r');
    c.rect(10, 14, 13, 16, 'Y'); // 目
    c.rect(12, 15, 13, 16, 'k');
    c.rect(11, 20, 15, 20, 'k'); // 口
    c.rect(12, 21, 15, 21, 'W');
    c.rect(13, 22, 15, 22, 'k');
    c.mirror();
    c.light('R', 'O');
    c.shade('R', 'r');
    c.outline();
    return c.rows();
  },

  flame_hound() {
    const c = new Canvas();
    // 尻尾の炎
    c.pts([[6, 15], [5, 14], [5, 13], [4, 12], [4, 11], [3, 10], [3, 9], [4, 8], [6, 14], [5, 12], [6, 13]], 'F');
    c.pts([[4, 10], [5, 11], [4, 9]], 'Y');
    c.ell(16, 18, 9.5, 5, 'R'); // 胴
    c.rect(8, 21, 9, 28, 'r'); // 脚
    c.rect(12, 22, 13, 28, 'R');
    c.rect(19, 22, 20, 28, 'r');
    c.rect(22, 21, 23, 28, 'R');
    c.pts([[7, 28], [11, 28], [18, 28], [21, 28]], 'R');
    c.ell(24.5, 13, 5, 4.5, 'R'); // 頭
    c.rect(27, 13, 31, 16, 'R'); // 鼻先
    c.pts([[21, 7], [22, 8], [21, 8], [22, 9], [23, 9], [20, 9]], 'R'); // 耳
    // たてがみの炎（背中に沿った炎の列）
    const mane = [0, 1, 3, 2, 4, 3, 2, 4, 3, 1, 0];
    mane.forEach((h, i) => {
      c.rect(11 + i, 13 - h, 11 + i, 13, 'F');
      if (h >= 2) c.rect(11 + i, 14 - h, 11 + i, 13, 'Y');
    });
    c.rect(25, 11, 26, 12, 'Y'); // 目
    c.px(26, 12, 'k');
    c.rect(28, 16, 31, 16, 'k'); // 口
    c.px(31, 13, 'k'); // 鼻
    c.light('R', 'O');
    c.shade('R', 'r');
    c.outline();
    return c.rows();
  },

  fire_drake() {
    const c = new Canvas();
    c.tri(10, 15, 2, 2, 16, 8, 'r'); // 翼
    c.line(10, 14, 4, 4, 'R');
    c.line(11, 13, 10, 4, 'R');
    c.line(3, 23, 0, 29, 'R', 2); // 尻尾
    c.ell(13.5, 20, 9, 7, 'R'); // 胴
    c.ell(15, 23, 5.5, 3.5, 'F'); // 腹
    c.line(19, 17, 23, 9, 'R', 4); // 首
    c.ell(25, 8, 5, 4, 'R'); // 頭
    c.rect(27, 7, 31, 11, 'R'); // 口先
    c.line(22, 5, 20, 0, 't', 2); // 角
    c.rect(8, 25, 10, 29, 'r'); // 脚
    c.rect(17, 25, 19, 29, 'R');
    c.pts([[8, 30], [10, 30], [17, 30], [19, 30]], 'W'); // 爪
    c.rect(25, 6, 26, 7, 'Y'); // 目
    c.px(26, 7, 'k');
    c.rect(27, 11, 31, 11, 'k'); // 口
    c.pts([[28, 12], [30, 12]], 'W'); // 牙
    c.px(30, 8, 'k'); // 鼻
    c.light('R', 'O');
    c.shade('R', 'r');
    c.shade('F', 'R');
    c.outline();
    return c.rows();
  },

  poison_slime() {
    const c = new Canvas();
    c.ell(15.5, 22.5, 13, 6.5, 'U');
    c.ell(15.5, 18, 9.5, 8.5, 'U');
    c.rect(4, 26, 15, 28, 'U'); // 平らな底
    c.pts([[6, 29], [7, 29], [7, 30]], 'U'); // しずく
    c.ell(10.5, 13.5, 2.5, 1.5, 'L'); // ツヤ
    c.px(14, 12, 'L');
    c.rect(10, 18, 12, 21, 'k'); // 目
    c.px(10, 18, 'W');
    c.rect(14, 24, 15, 24, 'u'); // 口
    c.mirror();
    c.shade('U', 'u');
    c.outline();
    return c.rows();
  },

  venom_spider() {
    const c = new Canvas();
    // 脚（左側だけ描いて写す）
    c.line(10, 14, 5, 9, 'u');
    c.line(5, 9, 2, 15, 'u');
    c.line(10, 16, 4, 14, 'u');
    c.line(4, 14, 1, 20, 'u');
    c.line(10, 18, 5, 19, 'u');
    c.line(5, 19, 2, 25, 'u');
    c.line(11, 20, 7, 23, 'u');
    c.line(7, 23, 5, 29, 'u');
    c.ell(15.5, 22, 8, 6.5, 'V'); // 腹
    c.pts([[15, 19], [14, 20], [15, 20], [15, 21], [13, 21], [14, 21], [14, 22], [15, 22], [15, 23], [14, 24], [15, 24], [15, 25]], 'U'); // 模様
    c.ell(15.5, 13.5, 5.5, 4.5, 'V'); // 頭胸部
    c.pts([[12, 12], [13, 11], [14, 13]], 'E'); // 目
    c.pts([[14, 17], [14, 18]], 'W'); // 牙
    c.px(14, 19, 'Z'); // 毒のしずく
    c.mirror();
    c.light('V', 'u');
    c.shade('V', 'v');
    c.outline();
    return c.rows();
  },

  venom_queen() {
    const c = new Canvas();
    // 太い脚
    c.line(9, 13, 4, 7, 'u', 2);
    c.line(4, 7, 1, 13, 'u', 2);
    c.line(9, 16, 3, 13, 'u', 2);
    c.line(3, 13, 0, 20, 'u', 2);
    c.line(9, 19, 3, 20, 'u', 2);
    c.line(3, 20, 1, 27, 'u', 2);
    c.ell(15.5, 22.5, 11, 8, 'V'); // 大きな腹
    // 腹の模様（どくろ風）
    c.ell(15.5, 22, 4, 3.5, 'U');
    c.rect(13, 21, 14, 22, 'V');
    c.rect(13, 26, 15, 27, 'U');
    c.px(14, 26, 'V');
    c.pts([[8, 19], [9, 20], [8, 24], [9, 25]], 'U');
    c.ell(15.5, 12.5, 6.5, 5.5, 'V'); // 頭胸部
    c.rect(11, 3, 15, 6, 'b'); // 王冠
    c.pts([[11, 2], [13, 1], [15, 0], [15, 1], [13, 2]], 'b');
    c.px(15, 5, 'E');
    c.pts([[11, 11], [12, 10], [13, 12], [12, 12]], 'E'); // 目
    c.px(11, 11, 'Y');
    c.pts([[14, 17], [14, 18], [13, 18]], 'W'); // 牙
    c.pts([[13, 19], [13, 20]], 'Z');
    c.mirror();
    c.light('V', 'u');
    c.shade('V', 'v');
    c.shade('b', 'N');
    c.outline();
    return c.rows();
  },
};

export const PALETTE: Record<string, string> = {
  k: '#23201b',
  W: '#ece5d3',
  s: '#e8b98a', S: '#c99167', h: '#5a3a24',
  t: '#b9b29f', T: '#8f8977', b: '#b48d35', p: '#5a4a3a', B: '#3a2e24',
  Y: '#f7e27a', F: '#f2b04a', O: '#ec8a5a', R: '#d9653b', r: '#a8432a',
  g: '#7f9a4a', G: '#5d7434', n: '#8a6b4a', N: '#6a5038',
  U: '#9a7cc4', u: '#6f5596', L: '#cdb9e6', V: '#4b3a63', v: '#36294a', E: '#e05a7a', Z: '#7fb069',
};

// マントの色（H：明るい色、C：本体、c：影）
export const CLOAKS = {
  none: { H: '#a88660', C: '#8a6b4a', c: '#6a5038' },
  fire: { H: '#ec8a5a', C: '#d9653b', c: '#a8432a' },
  poison: { H: '#b49ad6', C: '#9a7cc4', c: '#6f5596' },
};
