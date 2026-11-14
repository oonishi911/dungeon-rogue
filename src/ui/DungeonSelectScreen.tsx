// 挑戦の始まり：どのダンジョンに挑むかを選ぶ画面。
// 並ぶのは src/game/dungeons/ にある設定ファイル（管理画面で作ったダンジョン）すべて。
// ダンジョンごとに、階の数・広さ・満腹度を見せる（ダンジョンの属性は、選んだあとに決まる）

import { DUNGEON_IDS, dungeonOf } from '../game/dungeons';

interface DungeonSelectScreenProps {
  run: number;
  onChoose: (dungeon: string) => void;
}

export function DungeonSelectScreen({ run, onChoose }: DungeonSelectScreenProps) {
  return (
    <main className="screen screen--narrow screen--fit">
      <header className="top">
        <div>
          <p className="top__run">
            {run}回目の挑戦
          </p>
          <h1 className="top__title">ダンジョンを選ぶ</h1>
        </div>
      </header>

      {/* スマホでは、画面全体は動かさず、この一覧の中だけを動かす */}
      <ul className="choose__list screen__scroll" aria-label="挑めるダンジョン">
        {DUNGEON_IDS.map((id) => {
          const d = dungeonOf(id);
          const headingId = `choose-${id}`;
          return (
            <li key={id} className="choose__item">
              <section aria-labelledby={headingId}>
                <h2 id={headingId} className="panel__title choose__name">
                  {d.name}
                </h2>
                {d.description && <p className="choose__text">{d.description}</p>}
                <dl className="facts choose__facts">
                  <div>
                    <dt>階の数</dt>
                    <dd>{d.floors.count}階と最深部</dd>
                  </div>
                  <div>
                    <dt>広さ</dt>
                    <dd>
                      {d.floors.size}×{d.floors.size}マス
                    </dd>
                  </div>
                  <div>
                    <dt>満腹度</dt>
                    <dd>{d.floors.satiety}</dd>
                  </div>
                </dl>
                <button type="button" className="primary choose__go" onClick={() => onChoose(id)} aria-describedby={headingId}>
                  このダンジョンに挑む
                </button>
              </section>
            </li>
          );
        })}
      </ul>
      <p className="muted">ダンジョンの属性（炎・氷など）は、挑むたびに変わる。</p>
    </main>
  );
}
