// 探索画面の右側（スマホでは下）。体力などのゲージ、呪文と道具のボタン、装備・見えている敵・記録・リタイア。

import { BODY_NAMES, expToNext, ITEMS, SPELLS, TRAITS } from '../game/data';
import { enemyDef } from '../game/enemies';
import type { ExploreState } from '../game/exploreTypes';
import type { DungeonFile } from '../game/genMaster';
import type { ItemId, SpellId } from '../game/types';
import { ENEMY_MARK } from './exploreRender';
import { SPELL_KEYS } from './exploreKeys';
import { LogList, Meter } from './ExploreParts';
import { ItemIcon, ItemLabel, SpellIcon } from './ItemIcon';

interface ExploreSideProps {
  state: ExploreState;
  dungeon: DungeonFile;
  ended: boolean;
  mpShake: number; // 魔力が足りずに唱えられなかった回数（魔力のゲージを震わせる）
  itemGroups: { id: ItemId; count: number }[]; // 同じ道具はまとめて「回復薬 ×2」のように表示する
  visibleEnemies: ExploreState['enemies'];
  recentLog: string[];
  infoOpen: boolean; // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  onCast: (spell: SpellId) => void;
  onUseItem: (item: ItemId) => void;
  onCloseInfo: () => void;
  onRetire: () => void;
}

export function ExploreSide({ state, dungeon, ended, mpShake, itemGroups, visibleEnemies, recentLog, infoOpen, onCast, onUseItem, onCloseInfo, onRetire }: ExploreSideProps) {
  const { stats } = state;
  return (
    <aside className="explore__side">
      <div className="explore__status">
        {/* 体力・満腹度・魔力は、数字を出さずゲージだけにする。体力と満腹度は、残りが少ないと点滅する */}
        <Meter label="HP" value={stats.hp} max={stats.maxHp} tone="hp" gaugeOnly warnBelow={0.25} pulse />
        <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" gaugeOnly warnBelow={0.25} />
        {state.maxMp > 0 && <Meter label="魔力" value={state.mp} max={state.maxMp} tone="mp" gaugeOnly pulse shakeKey={mpShake} />}
        {/* レベルは、この挑戦のあいだだけ。いちばん上のレベルでは経験値の棒を出さない */}
        {state.level < dungeon.growth.maxLevel ? (
          <Meter label={`レベル${state.level}`} value={state.exp} max={expToNext(state.level, dungeon.growth)} tone="exp" unit="経験値" />
        ) : (
          <p className="meter__head">
            <span>レベル{state.level}</span>
            <span>最大</span>
          </p>
        )}
      </div>

      <div className="explore__controls">
        {state.spells.length > 0 && (
          <ul className="explore__items explore__spells" aria-label="呪文">
            {state.spells.map((spell, i) => {
              const cost = dungeon.spells[spell].cost ?? 0;
              return (
                <li key={spell}>
                  <button
                    type="button"
                    className="explore__use explore__spell"
                    onClick={() => onCast(spell)}
                    disabled={ended || state.mp < cost}
                    title={`${ITEMS[`book_${spell}` as ItemId].description}${SPELLS[spell].aim ? '（主人公が向いている方向に唱える）' : ''}`}
                  >
                    <span className="explore__key">{SPELL_KEYS[i]?.toUpperCase()}</span>
                    <SpellIcon spell={spell} size={22} />
                    {SPELLS[spell].name}
                    <span className="explore__cost">魔力{cost}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {itemGroups.length === 0 ? (
          <p className="muted explore__items">道具はない</p>
        ) : (
          <ul className="explore__items" aria-label="道具">
            {itemGroups.map((g, i) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="explore__use"
                  onClick={() => onUseItem(g.id)}
                  disabled={ended}
                  // 読み上げでは、名前と個数をまとめて伝える
                  aria-label={g.count > 1 ? `${ITEMS[g.id].name}（${g.count}個）` : ITEMS[g.id].name}
                  title={`${ITEMS[g.id].name}：${ITEMS[g.id].description}`}
                >
                  <span className="explore__key">{i + 1}</span>
                  {/* アイコンと名前（名前は小さい字。スマホでは、アイコンの下に置く） */}
                  <span className="explore__item-face">
                    <ItemIcon id={g.id} size={26} />
                    <span className="explore__item-name" aria-hidden="true">
                      {ITEMS[g.id].name}
                    </span>
                  </span>
                  {g.count > 1 && <span className="explore__count">×{g.count}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* スマホでは画面に収まらないので、ふだんは隠して「装備と敵」で重ねて開く */}
      <div id="explore-more" className={`explore__more${infoOpen ? ' explore__more--open' : ''}`}>
        <div className="explore__more-head">
          <h2 className="panel__title">装備と敵</h2>
          <button type="button" className="explore__wait" onClick={onCloseInfo}>
            閉じる
          </button>
        </div>
        <section className="explore__info" aria-labelledby="explore-gear">
          <h2 id="explore-gear" className="meter__head">
            装備
          </h2>
          <p className="explore__gear">
            武器：{stats.weapon ? <ItemLabel id={stats.weapon} name={ITEMS[stats.weapon].name} /> : 'なし'}
            <br />
            防具：{stats.armor ? <ItemLabel id={stats.armor} name={ITEMS[stats.armor].name} /> : 'なし'}
            {stats.enchant && (
              <>
                <br />
                付与：{TRAITS[stats.enchant.element].name}（あと{stats.enchant.hits}回）
              </>
            )}
          </p>
        </section>

        <section className="explore__info" aria-labelledby="explore-enemies">
          <h2 id="explore-enemies" className="meter__head">
            見えている敵
          </h2>
          {visibleEnemies.length === 0 ? (
            <p className="muted">いない</p>
          ) : (
            <ul className="explore__enemies">
              {visibleEnemies.map((e) => (
                <li key={e.uid}>
                  <span className={`explore__mark explore__mark--${e.mode}`} aria-hidden="true">
                    {ENEMY_MARK[e.mode].mark}
                  </span>
                  {enemyDef(e).name}（{TRAITS[enemyDef(e).element].name}・{BODY_NAMES[enemyDef(e).body]}、HP {e.hp}）：
                  {ENEMY_MARK[e.mode].text}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="muted explore__help">
          マスをタップするとそこまで歩く（敵をタップすると攻撃しに行く。歩いている途中にタップすると止まる）。画面を指でなぞると、なぞった向きに歩き続ける。主人公をダブルタップするとその場で1ターン待つ。階段は踏むとそのまま降りる。キーボードでは矢印キー／WASDで移動、スペースで待つ、数字キーで道具を使う
        </p>
        <section className="explore__more-log" aria-label="記録">
          <h3 className="meter__head">記録</h3>
          <LogList lines={recentLog} total={state.log.length} />
        </section>
        {/* 押してすぐには終わらず、確かめてからリタイアする */}
        <button
          type="button"
          className="explore__wait explore__retire"
          disabled={ended}
          onClick={onRetire}
        >
          リタイアする
        </button>
      </div>
    </aside>
  );
}
