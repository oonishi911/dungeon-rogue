// 探索画面の3D画面に重ねて出す、確かめる画面と、終わったときの画面。

/** 「戻る」が押されたとき、ページを離れるかを確かめる */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="explore__ending explore__leave" role="alertdialog" aria-labelledby="explore-leave">
      <p id="explore-leave">ページを離れますか？</p>
      <p className="explore__leave-note">ここまでの探索は保存されています。次に開いたとき、続きから遊べます。</p>
      <button type="button" className="primary" autoFocus onClick={onStay}>
        探索に戻る
      </button>
      <button type="button" onClick={onLeave}>
        ページを離れる
      </button>
    </div>
  );
}

/** リタイアするかを確かめる */
export function RetireDialog({ onCancel, onRetire }: { onCancel: () => void; onRetire: () => void }) {
  return (
    <div className="explore__ending explore__leave" role="alertdialog" aria-labelledby="explore-retire">
      <p id="explore-retire">リタイアしますか？</p>
      <p className="explore__leave-note">
        探索をやめて、ダンジョンを出ます。踏破にはならず、手に入れた金貨は、力尽きたときと同じく半分だけ持ち帰ります。
      </p>
      <button type="button" className="primary" autoFocus onClick={onCancel}>
        探索に戻る
      </button>
      <button type="button" onClick={onRetire}>
        リタイアする
      </button>
    </div>
  );
}

/** 探索が終わったとき。結果の画面へ進む（開発用では、同じ条件でやり直す） */
export function EndingPanel({ text, onFinish, onRestart }: { text: string | undefined; onFinish?: () => void; onRestart: () => void }) {
  return (
    <div className="explore__ending">
      <p>{text}</p>
      {onFinish ? (
        <button type="button" className="primary" onClick={onFinish}>
          結果を見る
        </button>
      ) : (
        <button type="button" className="primary" onClick={onRestart}>
          もう一度歩く
        </button>
      )}
    </div>
  );
}
