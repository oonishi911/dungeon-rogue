import { describe, expect, it } from 'vitest';
import { MEMORIES } from '../game/story';
import { SCRAWL_CONFIG, chunkLengths, phrases, scrawl, scratches, subPhrases } from './scrawl';

describe('scrawl', () => {
  const m = MEMORIES.flame_beast!;

  it('同じ記憶は、いつも同じ荒れ方になる（シードが違えば変わる）', () => {
    expect(scrawl(m.lines, m.crossed, 'flame_beast')).toEqual(scrawl(m.lines, m.crossed, 'flame_beast'));
    expect(scrawl(m.lines, m.crossed, 'flame_beast')).not.toEqual(scrawl(m.lines, m.crossed, 'ice_colossus'));
  });

  it('文章は、1文字も欠けず、順番も変わらずに並ぶ（荒れていても読める）', () => {
    const items = scrawl(m.lines, m.crossed, 'flame_beast');
    const lines = items.flatMap((i) => (i.kind === 'line' ? [i.glyphs.map((g) => g.ch).join('')] : []));
    expect(lines).toEqual(m.lines);
  });

  it('書いては消した言葉が、1行目のすぐあとに入り、最後は塗りつぶしで終わる', () => {
    const items = scrawl(m.lines, m.crossed, 'flame_beast');
    expect(items[1]!.kind).toBe('crossed');
    expect(items[items.length - 1]!.kind).toBe('black');
  });

  it('文字のずれは、決めた範囲に収まる。上から書き直した文字もある', () => {
    const c = SCRAWL_CONFIG;
    const glyphs = scrawl(m.lines, m.crossed, 'flame_beast').flatMap((i) => (i.kind === 'line' ? i.glyphs : []));
    for (const g of glyphs) {
      expect(Math.abs(g.rot)).toBeLessThanOrEqual(c.rot);
      expect(g.size).toBeGreaterThanOrEqual(c.size[0]);
      expect(g.size).toBeLessThanOrEqual(c.size[1]);
    }
    expect(glyphs.some((g) => g.over.length > 0)).toBe(true);
  });

  it('引っかき傷は、決めた数だけあり、画面の中に収まる。同じシードなら同じ傷', () => {
    const sc = scratches('flame_beast');
    expect(sc).toHaveLength(SCRAWL_CONFIG.scratches);
    expect(scratches('flame_beast')).toEqual(sc);
    for (const s of sc) for (const [, y] of s.points) expect(y >= 0 && y <= 100).toBe(true);
  });
});

describe('折り返してよい区切り（phrases）', () => {
  it('どの記憶の文も、意味のまとまりで区切る（言葉の途中や、句読点の前では切らない）', () => {
    const expected: Record<string, string[][]> = {
      flame_beast: [['大きな声が、', '家をゆらしていた。'], ['あの子は、', '布団の中で', '息をひそめた。'], ['誰も', '来ない。', '耳をふさいでも、', '声は', '入ってきた。'], ['やめて']],
      ice_colossus: [['呼んでも、', '振り向く', '人はいなかった。'], ['あの子は、', '笑うのをやめた。'], ['冷たいのは、', '外ではなかった。'], ['ここにいるよ']],
      ogre_chief: [['うまくできない', '自分が', '悪いのだと、', 'あの子は', '思った。'], ['責める', '声は、', 'いつのまにか、', '自分の', '声になっていた。'], ['ごめんなさい']],
      light_guardian: [['「きっと', '大丈夫」と、', '誰かが', '言った。'], ['あの子は、', 'それを', '信じた。'], ['大丈夫では、', 'なかった。'], ['きっと']],
      dark_lord: [['消えてしまいたい、と、', 'はじめて', '思った夜。'], ['あの子は、', 'まだ', '小さかった。'], ['その願いだけが、', 'いまも、', 'あなたの', '中にある。'], ['だれにも']],
    };
    for (const [boss, m] of Object.entries(MEMORIES)) expect([...m.lines, m.crossed].map(phrases)).toEqual(expected[boss]);
  });

  it('まとまりをつなぐと、もとの文になる。閉じる記号で始まらず、開く記号で終わらない', () => {
    for (const m of Object.values(MEMORIES)) {
      for (const text of [...m.lines, m.crossed]) {
        const parts = phrases(text);
        expect(parts.join('')).toBe(text);
        for (const p of parts) {
          expect('」』）、。！？'.includes(p[0]!)).toBe(false);
          expect('「『（'.includes(p[p.length - 1]!)).toBe(false);
        }
      }
    }
  });

  it('長いまとまりの中の、細かい区切り：漢字のあとの助詞のあと。句読点は前の文字と一緒。「では」は切らない', () => {
    expect(subPhrases('家をゆらしていた。')).toEqual(['家を', 'ゆらしていた。']);
    expect(subPhrases('人はいなかった。')).toEqual(['人は', 'いなかった。']);
    expect(subPhrases('外ではなかった。')).toEqual(['外ではなかった。']);
    expect(subPhrases('声は')).toEqual(['声は']);
    for (const m of Object.values(MEMORIES)) {
      for (const text of [...m.lines, m.crossed]) {
        for (const p of phrases(text)) {
          const subs = subPhrases(p);
          expect(subs.join('')).toBe(p);
          for (const s of subs) expect('」』）、。！？'.includes(s[0]!)).toBe(false);
        }
      }
    }
  });

  it('書きなぐった部品は、区切りごとの文字数を持ち、合計が文字の数と同じ', () => {
    for (const [boss, m] of Object.entries(MEMORIES)) {
      for (const item of scrawl(m.lines, m.crossed, boss)) {
        if (item.kind === 'black') continue;
        expect(item.chunks.flat().reduce((a, b) => a + b, 0)).toBe(item.glyphs.length);
        expect(item.chunks).toEqual(chunkLengths(item.glyphs.map((g) => g.ch).join('')));
      }
    }
  });
});
