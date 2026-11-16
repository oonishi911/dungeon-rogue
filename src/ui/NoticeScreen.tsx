// 注意書きと、相談窓口。最初に遊ぶときに必ず出し（読んだら進める）、そのあとは、ダンジョンを選ぶ画面からいつでも読める。
// 文章と連絡先は src/game/story.ts にある。

import { EMERGENCY, HOTLINES, HOTLINE_PAGE, NOTICE } from '../game/story';

interface NoticeScreenProps {
  first: boolean; // 最初に遊ぶとき（読んだら進む）か、あとから読み返しているか
  onClose: () => void;
}

export function NoticeScreen({ first, onClose }: NoticeScreenProps) {
  return (
    <main className="screen screen--narrow notice">
      <header className="top">
        <div>
          <h1 className="top__title">はじめに</h1>
        </div>
      </header>
      <section className="panel notice__body" aria-label="注意書き">
        {NOTICE.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
      <section className="panel" aria-labelledby="hotline-heading">
        <h2 id="hotline-heading" className="panel__title">相談できる窓口</h2>
        <dl className="notice__hotlines">
          {HOTLINES.map((h) => (
            <div key={h.number}>
              <dt>{h.name}</dt>
              <dd>
                <a className="notice__tel" href={`tel:${h.number.replace(/-/g, '')}`}>
                  {h.number}
                </a>
                <span className="muted">{h.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p>{EMERGENCY}</p>
        <p className="muted">
          ほかの窓口や、最新の連絡先は、厚生労働省の
          <a href={HOTLINE_PAGE} target="_blank" rel="noreferrer">
            「まもろうよ こころ」
          </a>
          で見られる。
        </p>
      </section>
      <button type="button" className="primary primary--wide" onClick={onClose}>
        {first ? '読んだ。はじめる' : 'もどる'}
      </button>
    </main>
  );
}
