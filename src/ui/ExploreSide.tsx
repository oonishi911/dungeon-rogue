// 探索画面の右側（スマホでは下）。体力などのゲージ、呪文と道具のボタン、装備・見えている敵・記録・リタイア。

import { useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { BODY_NAMES, expToNext, ITEMS, SPELLS, TRAITS } from '../game/data';
import { enemyDef } from '../game/enemies';
import type { Dir, ExploreState } from '../game/exploreTypes';
import type { DungeonFile } from '../game/genMaster';
import type { ItemId, SpellId } from '../game/types';
import { playerHitDamage, swapWeapons } from '../game/combat';
import { SKILL_TEXTS, skillOf } from '../game/weaponSkill';
import { ENEMY_MARK } from './exploreRender';
import { feelSettings, subscribeFeel } from './feelSettings';
import { keyLabel, spellKeys } from './keyBindings';
import { LogList, Meter } from './ExploreParts';
import { statusChips } from './statusChips';
import { stickDirections } from './stick';
import { ItemIcon, ItemLabel, SpellIcon } from './ItemIcon';

interface ExploreSideProps {
  state: ExploreState;
  dungeon: DungeonFile;
  ended: boolean;
  mpShake: number; // 魔力が足りずに唱えられなかった回数（魔力のゲージを震わせる）
  itemGroups: { id: ItemId; count: number }[]; // 同じ道具はまとめて「回復薬 ×2」のように表示する
  visibleEnemies: ExploreState['enemies'];
  recentLog: string[];
  aiming: SpellId | null; // 構えている呪文（向きのある呪文を1回押したとき）
  infoOpen: boolean; // スマホで、装備・敵・記録をまとめた画面を開いているか（PCでは常に横に出ている）
  onCast: (spell: SpellId) => void;
  // 向きのある呪文を、押したまま構える（2026-11-23）：押すと構え、指をずらすと向きが変わり、離すと唱える。「やめる」の上で離すとやめる
  onAimStart: (spell: SpellId) => boolean; // 構えられたか（魔力が足りないときは構えない）
  onAimDir: (dir: Dir) => void;
  onAimRelease: (spell: SpellId, cancel: boolean) => void;
  onSkill: () => void;
  onSwap: () => void;
  onUseItem: (item: ItemId) => void;
  onCloseInfo: () => void;
  onRetire: () => void;
  onSuspend?: (() => void) | undefined; // 「中断してもどる」（ないときは出さない）
  onInfo: (text: string) => void; // 説明を、3D画面の上に短く出す（状態のアイコンを押したとき・呪文を長押ししたとき）
}

const weaponName = (id: ItemId | null): string => (id ? ITEMS[id].name : '素手');

/** 長押しと見なすまでの時間（ミリ秒） */
const LONG_PRESS_MS = 480;
/** 押したままの構えで、向きを変えるのに指をずらす距離（px） */
const AIM_DRAG = 40;
/** これより短く押して離したら「さっと押した」とみなす（ミリ秒）。構えたままにして、もう一度押すと唱える */
const QUICK_TAP_MS = 260;

export function ExploreSide({ state, dungeon, ended, mpShake, itemGroups, visibleEnemies, recentLog, aiming, infoOpen, onCast, onAimStart, onAimDir, onAimRelease, onSkill, onSwap, onUseItem, onCloseInfo, onRetire, onSuspend, onInfo }: ExploreSideProps) {
  const keys = useSyncExternalStore(subscribeFeel, feelSettings).keys; // 設定で変えたキーを、ボタンに出す
  const { stats } = state;
  const skill = skillOf(stats.weapon, stats.echoes); // 持っている武器の固有技（素手なら無い）
  const chips = statusChips(state);
  // 長押し：押したまま少し待つと、説明を出す（そのあと指を離しても、唱えない）
  const pressed = useRef<{ timer: number; long: boolean }>({ timer: 0, long: false });
  const holdFor = (text: string) => {
    window.clearTimeout(pressed.current.timer);
    pressed.current.long = false;
    pressed.current.timer = window.setTimeout(() => {
      pressed.current.long = true;
      onInfo(text);
    }, LONG_PRESS_MS);
  };
  const releaseHold = () => window.clearTimeout(pressed.current.timer);
  // 向きのある呪文の、押したままの構え：押した場所・時刻・ずらしたか・押す前から構えていたか
  const aimPress = useRef<{ spell: SpellId; x: number; y: number; at: number; moved: boolean; aimed: boolean; was: boolean } | null>(null);
  const skipClick = useRef(false);
  const aimDown = (spell: SpellId, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (ended || e.button !== 0) return;
    const was = aiming === spell;
    const aimed = onAimStart(spell);
    aimPress.current = { spell, x: e.clientX, y: e.clientY, at: performance.now(), moved: false, aimed, was };
    if (aimed) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const aimMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = aimPress.current;
    if (!p?.aimed) return;
    const dirs = stickDirections(e.clientX - p.x, e.clientY - p.y, AIM_DRAG);
    if (!dirs) return;
    p.moved = true;
    onAimDir(dirs[0]!);
  };
  const aimUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = aimPress.current;
    aimPress.current = null;
    if (!p) return;
    skipClick.current = true;
    if (!p.aimed) return;
    // 「やめる」の上で離したら、やめる
    if (document.elementFromPoint(e.clientX, e.clientY)?.closest('.explore__aim-cancel')) return onAimRelease(p.spell, true);
    // さっと押して離しただけ（ずらしていない）：構えたままにする。構えていた呪文をもう一度さっと押したときは唱える
    const quick = !p.moved && performance.now() - p.at < QUICK_TAP_MS;
    if (quick && !p.was) return;
    onAimRelease(p.spell, false);
  };
  const aimCancel = () => {
    const p = aimPress.current;
    aimPress.current = null;
    if (p?.aimed && !p.was) onAimRelease(p.spell, true);
  };
  const other = swapWeapons(stats, state.skill)?.stats ?? null; // 持ち替えたあとの能力（サブ武器がないときは null）
  return (
    <aside className="explore__side">
      <div className="explore__status">
        {/* 体力・満腹度・魔力は、数字（今 / 最大）とゲージ。体力と満腹度は、残りが少ないと数字が赤くなり、ゲージが点滅する。体力は、減った分を赤く少し残す（2026-11-23） */}
        <Meter label="HP" value={stats.hp} max={stats.maxHp} tone="hp" warnBelow={0.25} pulse trail />
        <Meter label="満腹度" value={state.satiety} max={state.maxSatiety} tone="satiety" warnBelow={0.25} />
        {/* 状態のアイコン（毒・鈍足・空腹・魔力の盾・再生・武器に宿った属性）：短い字と残りの数。押すと説明が出る。
            状態がないときも1行分の場所を空けておき、かかったりとけたりしても、欄の縦幅を変えない */}
        <ul className="explore__chips" aria-label="状態" aria-hidden={chips.length === 0 ? true : undefined}>
          {chips.map((c) => (
            <li key={c.id}>
              <button type="button" className={`explore__chip explore__chip--${c.id}`} title={`${c.name}：${c.text}`} onClick={() => onInfo(`${c.name}：${c.text}`)}>
                <span className="explore__chip-mark" aria-hidden="true">
                  {c.mark}
                </span>
                <span className="sr-only">{c.name}</span>
                {c.left && <span className="explore__chip-left">{c.left}</span>}
              </button>
            </li>
          ))}
        </ul>
        {state.maxMp > 0 && <Meter label="魔力" value={state.mp} max={state.maxMp} tone="mp" pulse shakeKey={mpShake} trail />}
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
        {stats.sub && (
          // 持ち替え：手に持っている武器と、サブ武器を入れ替える（1ターンかかる）
          <button
            type="button"
            className="explore__use explore__swap"
            onClick={onSwap}
            disabled={ended}
            aria-label={`${ITEMS[stats.sub.weapon].name}に持ち替える`}
            title={`${ITEMS[stats.weapon!].name}から${ITEMS[stats.sub.weapon].name}に持ち替える（1ターンかかる。技ゲージは武器ごとにたまる）`}
          >
            <span className="explore__key">{keyLabel(keys.swap)}</span>
            <ItemIcon id={stats.sub.weapon} size={22} />
            持ち替え
            <span className="explore__cost">{ITEMS[stats.sub.weapon].name}</span>
          </button>
        )}
        {skill && (
          // 武器の固有技：通常攻撃を当てるとゲージ（丸）がたまり、満タンで押せる
          <button
            type="button"
            className={`explore__use explore__skill${state.skill >= skill.max ? ' explore__skill--ready' : ''}`}
            onClick={onSkill}
            disabled={ended || state.skill < skill.max}
            aria-label={`${skill.name}（技ゲージ ${state.skill}/${skill.max}）`}
            title={`${skill.name}：${SKILL_TEXTS[skill.weapon]}（通常攻撃を${skill.max}回当てると使える。主人公が向いている方向に出す）`}
          >
            <span className="explore__key">{keyLabel(keys.skill)}</span>
            {skill.name}
            <span className="explore__pips" aria-hidden="true">
              {Array.from({ length: skill.max }, (_, i) => (
                <span key={i} className={`explore__pip${i < state.skill ? ' explore__pip--on' : ''}`} />
              ))}
            </span>
          </button>
        )}
        {state.spells.length > 0 && (
          <ul className="explore__items explore__spells" aria-label="呪文">
            {state.spells.map((spell, i) => {
              const cost = dungeon.spells[spell].cost ?? 0;
              const short = state.mp < cost;
              const about = `${SPELLS[spell].name}（魔力${cost}）：${ITEMS[`book_${spell}` as ItemId].description}${SPELLS[spell].aim ? '（1回押すと届く範囲が出て、もう一度押すと唱える）' : ''}`;
              return (
                <li key={spell}>
                  {/* 魔力が足りないときも押せる（押すと、足りないことを知らせて魔力のゲージを震わせる）。長押しで説明 */}
                  <button
                    type="button"
                    className={`explore__use explore__spell${short ? ' explore__spell--short' : ''}${aiming === spell ? ' explore__spell--aiming' : ''}`}
                    onClick={() => {
                      // 指・マウスで押したときは、押したままの構えの方で扱う（キーボードで押したときだけ、ここで唱える・構える）
                      if (skipClick.current || pressed.current.long) {
                        skipClick.current = false;
                        pressed.current.long = false;
                        return;
                      }
                      onCast(spell);
                    }}
                    onPointerDown={(e) => (SPELLS[spell].aim ? aimDown(spell, e) : holdFor(about))}
                    onPointerMove={SPELLS[spell].aim ? aimMove : undefined}
                    onPointerUp={(e) => (SPELLS[spell].aim ? aimUp(e) : releaseHold())}
                    onPointerLeave={SPELLS[spell].aim ? undefined : releaseHold}
                    onPointerCancel={() => (SPELLS[spell].aim ? aimCancel() : releaseHold())}
                    disabled={ended}
                    aria-pressed={aiming === spell}
                    aria-label={`${SPELLS[spell].name}（魔力${cost}${short ? '、足りない' : ''}）`}
                    title={about}
                  >
                    <span className="explore__key">{keyLabel(spellKeys(keys)[i] ?? '')}</span>
                    <SpellIcon spell={spell} size={22} />
                    <span className="explore__spell-name">{SPELLS[spell].name}</span>
                    <span className="explore__cost">{short ? '不足' : `魔力${cost}`}</span>
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
            {stats.sub && (
              <>
                サブ：<ItemLabel id={stats.sub.weapon} name={ITEMS[stats.sub.weapon].name} />
                <br />
              </>
            )}
            防具：{stats.armor ? <ItemLabel id={stats.armor} name={ITEMS[stats.armor].name} /> : 'なし'}
            <br />
            指輪：{stats.rings?.length ? stats.rings.map((id) => <ItemLabel key={id} id={id} name={ITEMS[id].name} />) : 'なし'}
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
                  {(e.burn || e.frozen || e.silenced || e.asleep) && (
                    // 敵の燃焼・凍結・静寂（残りのターン数つき）・眠り
                    <span className="explore__foe-states">
                      {e.burn && <span className="explore__ailment explore__ailment--burn">燃焼 <span className="explore__ailment-left">{e.burn.turns}</span></span>}
                      {e.frozen && <span className="explore__ailment explore__ailment--freeze">凍結 <span className="explore__ailment-left">{e.stun ?? 0}</span></span>}
                      {e.silenced && <span className="explore__ailment explore__ailment--silence">静寂 <span className="explore__ailment-left">{e.silenced}</span></span>}
                      {e.asleep && <span className="explore__ailment explore__ailment--sleep">眠り</span>}
                    </span>
                  )}
                  {other && (
                    // サブ武器があるときは、手に持っている武器と、持ち替えたときの1回のダメージを並べる（持ち替えを選ぶ目安）
                    <span className="explore__matchup">
                      {' '}
                      ダメージ：{weaponName(stats.weapon)} {playerHitDamage(stats, enemyDef(e))}
                      {' ／ '}
                      {weaponName(other.weapon)} {playerHitDamage(other, enemyDef(e))}
                    </span>
                  )}
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
        {onSuspend && (
          <button type="button" className="explore__wait explore__suspend" disabled={ended} onClick={onSuspend}>
            中断してもどる
          </button>
        )}
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
