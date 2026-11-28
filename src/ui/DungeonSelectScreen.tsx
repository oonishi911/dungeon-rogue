// 挑戦の始まり：どのダンジョンに挑むかを選ぶ画面。
// 並ぶのは src/game/dungeons/ にある設定ファイル（管理画面で作ったダンジョン）すべて。
// ダンジョンごとに、階の数・広さ・満腹度を見せる（ダンジョンの属性は、選んだあとに決まる）
// 2026-11-28：これまでの記録（挑んだ回数・いちばん深い階・踏破）と、取り戻した記憶の数も見せる。広い画面では横に並べる

import { useState } from 'react';
import { DUNGEON_IDS, dungeonOf } from '../game/dungeons';
import { bestFloorText, bossesOf, type DungeonRecords } from '../game/records';
import { GearIcon, SettingsDialog } from './SettingsDialog';

interface DungeonSelectScreenProps {
  run: number;
  records: DungeonRecords; // ダンジョンごとの記録
  memories: readonly string[]; // 取り戻した記憶（倒したボスの ID）
  onChoose: (dungeon: string) => void;
  onNotice: () => void; // 注意書きと相談窓口を読む
  onBestiary: () => void; // 敵の図鑑を開く
}

export function DungeonSelectScreen({ run, records, memories, onChoose, onNotice, onBestiary }: DungeonSelectScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <main className="screen screen--narrow screen--fit choose">
      <header className="top">
        <div>
          <p className="top__run">
            {run}回目の挑戦
          </p>
          <h1 className="top__title">ダンジョンを選ぶ</h1>
        </div>
        <div className="choose__tools">
          <button type="button" className="choose__bestiary" onClick={onBestiary}>
            敵の図鑑
          </button>
          <button type="button" className="choose__bestiary choose__settings" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
            <GearIcon />
            設定
          </button>
        </div>
      </header>
      {settingsOpen && <SettingsDialog keyboard={!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)} onClose={() => setSettingsOpen(false)} />}

      {/* スマホでは、画面全体は動かさず、この一覧の中だけを動かす */}
      <ul className="choose__list screen__scroll" aria-label="挑めるダンジョン">
        {DUNGEON_IDS.map((id) => {
          const d = dungeonOf(id);
          const headingId = `choose-${id}`;
          const r = records[id];
          const best = r ? bestFloorText(id, r.best) : null;
          const bosses = bossesOf(id);
          const recalled = bosses.filter((b) => memories.includes(b)).length;
          return (
            <li key={id} className={`choose__item${r?.clears ? ' choose__item--cleared' : ''}`}>
              <section aria-labelledby={headingId}>
                <h2 id={headingId} className="panel__title choose__name">
                  {d.name}
                  {r?.clears ? <span className="choose__badge">踏破</span> : null}
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
                {/* これまでの記録（まだ挑んでいなければ、そう書く） */}
                <p className="choose__record">
                  {r ? (
                    <>
                      挑んだ <b>{r.tries}</b>回 ・ いちばん深く <b>{best ?? '—'}</b>
                      {r.clears > 0 && (
                        <>
                          {' '}
                          ・ 踏破 <b>{r.clears}</b>回
                        </>
                      )}
                    </>
                  ) : (
                    'まだ挑んでいない'
                  )}
                </p>
                <p className="choose__memories" aria-label={`取り戻した記憶 ${recalled}/${bosses.length}`}>
                  <span className="choose__memories-label">取り戻した記憶</span>
                  <span className="choose__pips" aria-hidden="true">
                    {bosses.map((b) => (
                      <span key={b} className={`choose__pip${memories.includes(b) ? ' choose__pip--on' : ''}`} />
                    ))}
                  </span>
                  <span className="choose__memories-num">
                    {recalled}/{bosses.length}
                  </span>
                </p>
                <button type="button" className="primary choose__go" onClick={() => onChoose(id)} aria-describedby={headingId}>
                  このダンジョンに挑む
                </button>
              </section>
            </li>
          );
        })}
      </ul>
      <p className="muted">ダンジョンの属性（炎・氷など）は、挑むたびに変わる。</p>
      <button type="button" className="notice__link" onClick={onNotice}>
        注意書きと相談窓口
      </button>
    </main>
  );
}
