// 開発用の管理画面（Admin.tsx）の、ダンジョンの設定（src/game/dungeons/<ID>.json のうち、マップと探索の設定）のタブ。
// 直すダンジョンは、タブの上の欄で選ぶ（DungeonPanels.tsx）：
// 「階の数・広さ・満腹度」、「小部屋」（多さと大きさ）、
// 「敵の数と置き方」（部屋に集める・部屋には置かない・群れ部屋・部屋から出さない）、
// 「レベルと強敵の報酬」（敵を倒したときのレベルの上がり方と強敵の報酬の倍率）、「魔法」（魔力と呪文の強さ）と、
// 変えた値で作ったマップの見本。
// 変えた内容は、管理画面の「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される

import { useEffect, useMemo, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ENEMIES } from '../game/data';
import { spawnEnemies, type MapEnemy } from '../game/enemies';
import {
  GEN_LABELS,
  GEN_LIMITS,
  MAGIC_FIELDS,
  SPELL_FIELDS,
  SPELL_NAMES,
  genProblems,
  PLACEMENT_LABELS,
  PLACEMENTS,
  type DungeonFile,
  type EnemySettings,
  type FloorSettings,
  type GrowthSettings,
  type MagicSettings,
  type Placement,
  type RoomSettings,
} from '../game/genMaster';
import { orderError } from '../game/fieldCheck';
import { SPELL_HINT_LIST } from '../game/genHints';
import { generateFloor, type FloorMap } from '../game/map';
import { floorParams } from '../game/floorParams';
import type { SpellId } from '../game/types';
import { cls, NumberField } from './adminParts';
import { SpellIcon } from './ItemIcon';

const CANVAS_PX = 640; // 見本の長い辺の描画解像度。表示サイズは CSS で合わせる

/** タブの部品に渡すもの：選んでいるダンジョンの公開版（base。新しく作るダンジョンでは draft と同じ）、画面で変えている設定（draft）、それを変える関数 */
export interface GenPanelProps {
  base: DungeonFile;
  draft: DungeonFile;
  setDraft: Dispatch<SetStateAction<DungeonFile>>;
}

/** 「階の数・広さ・満腹度」のタブ */
export function FloorsPanel({ base, draft, setDraft }: GenPanelProps) {
  const f = draft.floors;
  const bf = base.floors;
  const setFloors = (patch: Partial<FloorSettings>) => setDraft((d) => ({ ...d, floors: { ...d.floors, ...patch } }));
  return (
    <section className="admin__section" role="tabpanel" id="admin-floors-panel" aria-labelledby="admin-floors-tab">
      <h2 className="admin__heading">階の数・広さ・満腹度</h2>
      <p className="admin__note">
        満腹度は、探索のはじめの満腹度で、上限でもあります。広さや階の数を変えても、満腹度は自動では変わらないので、いっしょに見直してください。
        敵の数は、広さから自動で決まります。難しさの段階を作りたいときは、ダンジョンを複製して、広さや満腹度を変えた別のダンジョンにします。
      </p>
      <div className="gen__fields">
        <Field
          label={GEN_LABELS.floorCount}
          hint="通常の階の数です。その下に、ボスの階が1つ付きます。階を増やしたら、満腹度も見直してください。"
          example={`今の${f.count}なら、通常の階が${f.count}つと、ボスの階が1つで、ぜんぶで${f.count + 1}階。`}
        >
          <NumberField {...GEN_LIMITS.floorCount} value={f.count} changed={f.count !== bf.count} base={bf.count} label={GEN_LABELS.floorCount} onChange={(v) => setFloors({ count: v })} />
        </Field>
        <Field
          label={GEN_LABELS.floorSize}
          hint="階の一辺のマス数です。大きいほど広く、歩く距離が長くなります。"
          example={`今の${f.size}なら、${f.size}×${f.size}＝${f.size ** 2}マス。20なら小さな階（400マス）、40なら広めの階（1600マス）。`}
        >
          <NumberField {...GEN_LIMITS.floorSize} value={f.size} changed={f.size !== bf.size} base={bf.size} label={GEN_LABELS.floorSize} onChange={(v) => setFloors({ size: v })} />
        </Field>
        <Field
          label={GEN_LABELS.satiety}
          hint="探索のはじめの満腹度で、食べ物で回復できる上限でもあります。1行動（1歩・1回の攻撃など）ごとに1減り、0になると、HPが1ずつ減ります。"
          example={`今の${f.satiety}なら、食べ物なしで、およそ${f.satiety}行動歩けます（階の面積${f.size ** 2}マスの${(f.satiety / f.size ** 2).toFixed(1)}倍）。`}
        >
          <NumberField {...GEN_LIMITS.satiety} value={f.satiety} changed={f.satiety !== bf.satiety} base={bf.satiety} label={GEN_LABELS.satiety} onChange={(v) => setFloors({ satiety: v })} />
        </Field>
      </div>
    </section>
  );
}

/** 「小部屋」のタブ */
export function RoomsPanel({ base, draft, setDraft }: GenPanelProps) {
  const r = draft.rooms;
  const br = base.rooms;
  const setRooms = (patch: Partial<RoomSettings>) => setDraft((d) => ({ ...d, rooms: { ...d.rooms, ...patch } }));
  // 部屋を置こうとする回数（map.ts と同じ式）：迷路のセル数（奇数座標のマス）× 部屋の多さ
  const size = draft.floors.size;
  const cells = Math.floor((size - 1) / 2) ** 2;
  const tries = Math.round(cells * r.attemptRate);
  return (
    <section className="admin__section" role="tabpanel" id="admin-rooms-panel" aria-labelledby="admin-rooms-tab">
      <h2 className="admin__heading">小部屋</h2>
      <div className="gen__fields">
        <Field
          label={GEN_LABELS.attemptRate}
          hint={`部屋の数の目安です。迷路のマスの数（今の広さ${size}×${size}では${cells}マス）にこの値を掛けた回数だけ、ランダムな場所に部屋を置こうとします。すでに部屋がある所には置けないので、できる部屋の数は、この回数より少なくなります。大きいほど部屋が増え、迷路の通路が減ります（0：部屋なし）。通路が減ると、行き止まりに置く宝箱と強敵も少し減ります。`}
          example={`今の${r.attemptRate}なら、${cells}マス × ${r.attemptRate} ＝ ${tries}回ためします。0.1なら${Math.round(cells * 0.1)}回、0.3なら${Math.round(cells * 0.3)}回。実際にできる部屋の数は、下の見本の「小部屋」で確かめられます。`}
        >
          <NumberField {...GEN_LIMITS.attemptRate} slider value={r.attemptRate} changed={r.attemptRate !== br.attemptRate} base={br.attemptRate} label={GEN_LABELS.attemptRate} onChange={(v) => setRooms({ attemptRate: v })} />
        </Field>
        <Field
          label={GEN_LABELS.minSize}
          hint="部屋の一辺のマス数（奇数）の、いちばん小さい値です。部屋の縦と横は、最小から最大までの奇数から、別々にランダムに決まります。"
          example="最小3・最大7なら、縦も横も、3・5・7のどれか（3×3の小さな部屋から、7×7の大きな部屋まで）。"
        >
          <NumberField
            {...GEN_LIMITS.roomSize}
            odd
            value={r.minSize}
            changed={r.minSize !== br.minSize} base={br.minSize}
            label={GEN_LABELS.minSize}
            error={orderError('atMost', '最小', r.minSize, '最大', r.maxSize)}
            onChange={(v) => setRooms({ minSize: v })}
          />
        </Field>
        <Field
          label={GEN_LABELS.maxSize}
          hint="部屋の一辺のマス数（奇数）の、いちばん大きい値です。大きくすると、大きな部屋ができますが、部屋どうしが重なって置けない分、数は減ります。"
          example="最小も最大も5なら、5×5マスの同じ大きさの部屋ばかりになります。"
        >
          <NumberField
            {...GEN_LIMITS.roomSize}
            odd
            value={r.maxSize}
            changed={r.maxSize !== br.maxSize} base={br.maxSize}
            label={GEN_LABELS.maxSize}
            error={orderError('atLeast', '最大', r.maxSize, '最小', r.minSize)}
            onChange={(v) => setRooms({ maxSize: v })}
          />
        </Field>
      </div>
    </section>
  );
}

/** 「敵の数と置き方」のタブ */
export function PlacementPanel({ base, draft, setDraft }: GenPanelProps) {
  const e = draft.enemies;
  const be = base.enemies;
  const setEnemies = (patch: Partial<EnemySettings>) => setDraft((d) => ({ ...d, enemies: { ...d.enemies, ...patch } }));
  return (
    <section className="admin__section" role="tabpanel" id="admin-placement-panel" aria-labelledby="admin-placement-tab">
      <h2 className="admin__heading">敵の数と置き方</h2>
      <div className="gen__fields">
        <Field
          label={GEN_LABELS.amount}
          hint="通常の敵の数にかける倍率です。1が、広さから決まる今の数です。強敵とボスの数は変わりません。"
          example="1のとき10体なら、1.5で15体、0.5で5体、0で通常の敵がいなくなります。"
        >
          <NumberField {...GEN_LIMITS.amount} slider value={e.amount} changed={e.amount !== be.amount} base={be.amount} label={GEN_LABELS.amount} onChange={(v) => setEnemies({ amount: v })} />
        </Field>
        <Field
          label={GEN_LABELS.placement}
          hint="通常の敵を置く場所です。「部屋にも通路にも」は、部屋も通路も置く場所になります（偏りは、下の「部屋の選ばれやすさ」で決めます）。「部屋だけ」は、すべて部屋に集めます。「通路だけ」は、部屋には置きません（群れ部屋も作りません）。"
          example="広い部屋の中で戦いたいなら「部屋だけ」、通路で不意に出会ってほしいなら「通路だけ」。"
        >
          <select
            className={cls('admin__select', e.placement !== be.placement)}
            value={e.placement}
            aria-label={GEN_LABELS.placement}
            onChange={(ev) => setEnemies({ placement: ev.target.value as Placement })}
          >
            {PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {PLACEMENT_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={GEN_LABELS.roomWeight}
          hint={e.placement === 'mixed' ? '部屋の床1マスが、通路の床1マスの何倍、敵を置く場所に選ばれやすいかです。' : '「敵を置く場所」が「部屋にも通路にも」のときだけ使います。'}
          example={e.placement === 'mixed' ? '1なら、部屋と通路で同じ。2なら、部屋の床は通路の2倍選ばれやすい（部屋に敵が多くなる）。0なら、部屋には置かない。' : undefined}
        >
          <NumberField
            {...GEN_LIMITS.weight}
            value={e.roomWeight}
            changed={e.roomWeight !== be.roomWeight} base={be.roomWeight}
            label={GEN_LABELS.roomWeight}
            onChange={(v) => setEnemies({ roomWeight: v })}
          />
        </Field>
        <Field
          label={GEN_LABELS.nestChance}
          hint="部屋ごとに、この確率で、敵がまとまっている「群れ部屋」にします（0〜1）。群れの敵は、通常の敵とは別に足されます。"
          example="0.2なら、部屋が10個あるとき、およそ2部屋が群れ部屋になります。0なら作らず、1ならすべての部屋が群れ部屋です。"
        >
          <NumberField {...GEN_LIMITS.nestChance} slider value={e.nestChance} changed={e.nestChance !== be.nestChance} base={be.nestChance} label={GEN_LABELS.nestChance} onChange={(v) => setEnemies({ nestChance: v })} />
        </Field>
        <Field
          label={GEN_LABELS.nestMin}
          hint="群れ部屋に置く敵の数の下限です。部屋に入りきらないときは、入る分だけ置きます。"
          example="最小2・最大4なら、群れ部屋ごとに、2〜4体のどれかを置きます。"
        >
          <NumberField
            {...GEN_LIMITS.nestCount}
            value={e.nestMin}
            changed={e.nestMin !== be.nestMin} base={be.nestMin}
            label={GEN_LABELS.nestMin}
            error={orderError('atMost', '最小', e.nestMin, '最大', e.nestMax)}
            onChange={(v) => setEnemies({ nestMin: v })}
          />
        </Field>
        <Field label={GEN_LABELS.nestMax} hint="群れ部屋に置く敵の数の上限です（最小以上にします）。">
          <NumberField
            {...GEN_LIMITS.nestCount}
            value={e.nestMax}
            changed={e.nestMax !== be.nestMax} base={be.nestMax}
            label={GEN_LABELS.nestMax}
            error={orderError('atLeast', '最大', e.nestMax, '最小', e.nestMin)}
            onChange={(v) => setEnemies({ nestMax: v })}
          />
        </Field>
        <Field
          label={GEN_LABELS.stayInRoom}
          hint="オンだと、部屋に置いた敵は、主人公に気付くまで、部屋の中だけを歩きます（気付いたら、部屋を出て追ってきます）。オフだと、気付く前から部屋の外も歩き回ります。"
          example="オンにすると、部屋の外の通路を歩いている間は、部屋の敵に襲われにくくなります。"
        >
          <input
            type="checkbox"
            className={cls('admin__check', e.stayInRoom !== be.stayInRoom)}
            checked={e.stayInRoom}
            aria-label={GEN_LABELS.stayInRoom}
            onChange={(ev) => setEnemies({ stayInRoom: ev.target.checked })}
          />
        </Field>
        <Field
          label={GEN_LABELS.bossMinions}
          hint="ボスの部屋に、ボスといっしょに置く雑魚敵の数です。種類は、その属性の道中の敵（「ダンジョンに出る敵」のタブ）から選ばれます。"
          example="3なら、ボスのほかに雑魚敵が3体。0なら、ボスだけです。"
        >
          <NumberField
            {...GEN_LIMITS.bossMinions}
            value={e.bossMinions}
            changed={e.bossMinions !== be.bossMinions} base={be.bossMinions}
            label={GEN_LABELS.bossMinions}
            onChange={(v) => setEnemies({ bossMinions: v })}
          />
        </Field>
      </div>
    </section>
  );
}

/** 「レベルと強敵の報酬」のタブ */
export function GrowthPanel({ base, draft, setDraft }: GenPanelProps) {
  const g = draft.growth;
  const bg = base.growth;
  const setGrowth = (patch: Partial<GrowthSettings>) => setDraft((d) => ({ ...d, growth: { ...d.growth, ...patch } }));
  return (
    <section className="admin__section" role="tabpanel" id="admin-growth-panel" aria-labelledby="admin-growth-tab">
      <h2 className="admin__heading">レベルと強敵の報酬</h2>
      <p className="admin__note">
        敵を倒して経験値がたまると、その挑戦のあいだだけレベルが上がります。敵ごとの金貨・経験値・道具を落とす確率は、「敵」のタブで変えます。
        強くしすぎると、外れた準備でもクリアできてしまうので気を付けてください（バランスのテストは、今は自動チェックから外しています）。
      </p>
      <div className="gen__fields">
        {(
          [
            ['expBase', '経験値がこれだけたまると、レベル1→2に上がります。', '10なら、経験値が10たまった時点でレベル2。'],
            ['expStep', 'レベルが上がるたびに、次のレベルに要る経験値が、これだけ増えます。', '最初が10で、増える分が5なら、1→2は10、2→3は15、3→4は20。下の表でも確かめられます。'],
            ['hpPerLevel', '1レベル上がるごとに増える最大HPです。上がった分だけ、HPも回復します。', '2なら、レベル3で最大HPが4増えます（2×2レベル分）。'],
            ['atkPerLevel', '1レベル上がるごとに増える攻撃です。敵に与えるダメージ（攻撃−敵の防御）が、その分だけ増えます。', '1なら、レベル3で攻撃が2増え、毎回のダメージも2増えます。'],
            ['magPerLevel', '1レベル上がるごとに増える魔力です。魔法の強さに足されるので、呪文のダメージが、その分だけ（呪文の倍率を掛けて）増えます。', '1なら、レベル3で魔力が2増え、倍率1.5の呪文のダメージは3増えます。'],
            ['maxLevel', 'このレベルより上には、上がりません。', '10なら、レベル10が上限です。'],
            ['eliteRate', '強敵を倒したときに得る金貨と経験値が、通常の敵の何倍になるかです。強敵は、必ず宝箱（金貨と良い道具）も落とします。', '2なら、通常の敵が金貨10・経験値5のとき、強敵は金貨20・経験値10。'],
          ] as const
        ).map(([key, hint, example]) => (
          <Field key={key} label={GEN_LABELS[key]} hint={hint} example={example}>
            <NumberField {...GEN_LIMITS[key]} value={g[key]} changed={g[key] !== bg[key]} base={bg[key]} label={GEN_LABELS[key]} onChange={(v) => setGrowth({ [key]: v })} />
          </Field>
        ))}
      </div>
      <LevelTable growth={g} />
    </section>
  );
}

/** 「魔法」のタブ */
export function MagicPanel({ base, draft, setDraft }: GenPanelProps) {
  const setMagic = (patch: Partial<MagicSettings>) => setDraft((d) => ({ ...d, magic: { ...d.magic, ...patch } }));
  const setSpell = (spell: SpellId, key: string, v: number) =>
    setDraft((d) => ({ ...d, spells: { ...d.spells, [spell]: { ...d.spells[spell], [key]: v } } }));
  return (
    <section className="admin__section" role="tabpanel" id="admin-magic-panel" aria-labelledby="admin-magic-tab">
      <h2 className="admin__heading">魔法</h2>
      <p className="admin__note">
        呪文書を持っていくと（出発するとき、そのダンジョンで有利な2冊を持たせる）、魔力を使ってその呪文を何度でも唱えられます。呪文書を持っていなければ、魔力の棒も出ません。
      </p>
      <div className="gen__fields">
        {MAGIC_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint || undefined} example={f.example}>
            <NumberField
              min={f.min}
              max={f.max}
              step={f.step}
              value={draft.magic[f.key]}
              changed={draft.magic[f.key] !== base.magic[f.key]} base={base.magic[f.key]}
              label={f.label}
              onChange={(v) => setMagic({ [f.key]: v })}
            />
          </Field>
        ))}
      </div>
      <h3 className="gen__subheading">呪文ごとの設定</h3>
      <ul className="admin__notelist">
        {SPELL_HINT_LIST.map((h) => (
          <li key={h.label}>
            <b>{h.label}</b>：{h.text}
          </li>
        ))}
      </ul>
      <div className="gen__spells">
        {(Object.keys(SPELL_FIELDS) as SpellId[]).map((spell) => (
          <div key={spell} className="gen__spell">
            <span className="gen__label gen__spellname">
              <SpellIcon spell={spell} size={28} />
              {SPELL_NAMES[spell]}
            </span>
            {SPELL_FIELDS[spell].map((f) => (
              <label key={f.key} className="gen__spell-field">
                <span>{f.label}</span>
                <NumberField
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  integer={f.integer}
                  value={draft.spells[spell][f.key]!}
                  changed={draft.spells[spell][f.key] !== base.spells[spell][f.key]} base={base.spells[spell][f.key]}
                  label={`${SPELL_NAMES[spell]}の${f.label}`}
                  onChange={(v) => setSpell(spell, f.key, v)}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 変えた値で作ったマップの見本（ダンジョンの設定のタブの下に出す）。見本の種（別のマップ）は、呼ぶ側で持つ */
export function PreviewSection(props: { settings: DungeonFile; onNewMap: () => void; seed: number }) {
  const { settings, seed } = props;
  const problems = useMemo(() => genProblems(settings), [settings]);
  const preview = useMemo(() => (problems.length ? null : makePreview(settings, seed)), [settings, seed, problems.length]);
  return (
    <section className="admin__section" aria-labelledby="admin-preview">
      <h2 id="admin-preview" className="admin__heading">見本</h2>
      <p className="admin__note">値を変えると、見本のマップがすぐに作り直されます（ボスの階は形が決まっているので変わりません）。</p>
      <div className="gen__preview-controls">
        <button type="button" className="explore__wait" onClick={props.onNewMap}>
          別のマップを作る
        </button>
      </div>
      {preview ? <Preview preview={preview} /> : <p className="admin__note">値に問題があるので、見本を作れません（下の「変更を公開」の欄を見てください）。</p>}
    </section>
  );
}

/** レベルごとの、上がるまでに要る経験値（合計）と、最大HP・攻撃の増え方。最初の数レベル分 */
function LevelTable({ growth }: { growth: GrowthSettings }) {
  const rows: { level: number; total: number; hp: number; atk: number; mag: number }[] = [];
  let total = 0;
  for (let level = 2; level <= Math.min(growth.maxLevel, 6); level++) {
    total += growth.expBase + growth.expStep * (level - 2);
    rows.push({ level, total, hp: growth.hpPerLevel * (level - 1), atk: growth.atkPerLevel * (level - 1), mag: growth.magPerLevel * (level - 1) });
  }
  if (!rows.length) return null;
  return (
    <div className="admin__scroll gen__levels">
      <table className="admin__table">
        <thead>
          <tr>
            <th scope="col">レベル</th>
            <th scope="col">経験値の合計</th>
            <th scope="col">最大HP</th>
            <th scope="col">攻撃</th>
            <th scope="col">魔力</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level}>
              <th scope="row">{r.level}</th>
              <td>{r.total}</td>
              <td>+{r.hp}</td>
              <td>+{r.atk}</td>
              <td>+{r.mag}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 項目の名前・入力欄・説明（hint）・例（example）。例は、説明の下に、行を変えて出す */
function Field(props: { label: string; hint?: string; example?: string; children: ReactNode }) {
  return (
    <div className="gen__field">
      <span className="gen__label">{props.label}</span>
      {props.children}
      {(props.hint || props.example) && (
        <span className="gen__hint">
          {props.hint}
          {props.example && <span className="gen__example">例：{props.example}</span>}
        </span>
      )}
    </div>
  );
}

interface PreviewData {
  map: FloorMap;
  enemies: MapEnemy[];
  nest: Set<number>; // 群れ部屋に置いた敵の uid
}

/**
 * 見本のマップと敵。群れの敵を見分けるため、群れ部屋なしでも置いてみて、増えた分を群れの敵とする。
 * 敵は、無属性のときに出る敵で置く（まだ敵を選んでいないときは、ボスでない敵のどれか）
 */
function makePreview(settings: DungeonFile, seed: number): PreviewData {
  const params = floorParams(settings.floors);
  const map = generateFloor(seed, { width: params.mapSize, height: params.mapSize, rooms: settings.rooms });
  const chosen = settings.encounters.neutral.pool.filter((id) => ENEMIES[id] && !ENEMIES[id].boss);
  const pool = chosen.length ? chosen : Object.values(ENEMIES).filter((e) => !e.boss).map((e) => e.id).slice(0, 1);
  const { enemies } = spawnEnemies(map, pool, seed, 0, params.enemyDensity, settings.enemies);
  const plain = spawnEnemies(map, pool, seed, 0, params.enemyDensity, { ...settings.enemies, nestChance: 0 }).enemies.length;
  return { map, enemies, nest: new Set(enemies.slice(plain).map((en) => en.uid)) };
}

function Preview({ preview }: { preview: PreviewData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { map, enemies, nest } = preview;
  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, preview);
  }, [preview]);

  const roomIndexOf = (p: { x: number; y: number }) => map.rooms.findIndex((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height);
  const nestRooms = new Set(enemies.filter((en) => nest.has(en.uid)).map((en) => roomIndexOf(en.pos))).size;
  const normal = enemies.filter((en) => !en.elite && !nest.has(en.uid));
  const inRooms = normal.filter((en) => roomIndexOf(en.pos) >= 0).length;
  const roomTiles = map.rooms.reduce((n, r) => n + r.width * r.height, 0);
  const floor = map.tiles.filter((t) => t === 'floor').length;

  return (
    <div className="mapview__body">
      <canvas ref={canvasRef} className="mapview__canvas" role="img" aria-label={`${map.width}×${map.height}マスの見本のマップ`} />
      <dl className="facts mapview__facts">
        <div>
          <dt>小部屋</dt>
          <dd>{map.rooms.length}</dd>
        </div>
        <div>
          <dt>床のうち部屋</dt>
          <dd>{floor ? Math.round((roomTiles / floor) * 100) : 0}%</dd>
        </div>
        <div>
          <dt>通常の敵（部屋 / 通路）</dt>
          <dd>
            {normal.length}（{inRooms} / {normal.length - inRooms}）
          </dd>
        </div>
        <div>
          <dt>群れの敵（群れ部屋）</dt>
          <dd>
            {nest.size}（{nestRooms}部屋）
          </dd>
        </div>
        <div>
          <dt>宝箱 / 強敵</dt>
          <dd>
            {map.features.filter((f) => f.kind === 'treasure').length} / {map.features.filter((f) => f.kind === 'elite').length}
          </dd>
        </div>
      </dl>
      <ul className="mapview__legend">
        <li><span style={{ background: 'var(--hp-you)' }} />入口</li>
        <li><span style={{ background: 'var(--bone)' }} />階段</li>
        <li><span className="gen__room-swatch" />小部屋</li>
        <li><span style={{ background: 'var(--hp-enemy)', borderRadius: '50%' }} />敵</li>
        <li><span style={{ background: 'var(--alert)', borderRadius: '50%' }} />群れの敵</li>
        <li><span style={{ background: 'var(--fire)' }} />強敵</li>
        <li><span style={{ background: 'var(--procure)' }} />宝箱</li>
      </ul>
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, { map, enemies, nest }: PreviewData) {
  const cell = Math.max(2, Math.floor(CANVAS_PX / Math.max(map.width, map.height)));
  canvas.width = map.width * cell;
  canvas.height = map.height * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  const color = (name: string) => css.getPropertyValue(name).trim();

  ctx.fillStyle = color('--pine-deep');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color('--pine-line');
  map.tiles.forEach((t, i) => {
    if (t === 'floor') ctx.fillRect((i % map.width) * cell, Math.floor(i / map.width) * cell, cell, cell);
  });
  // 小部屋は少し明るく
  ctx.fillStyle = color('--bone');
  ctx.globalAlpha = 0.16;
  for (const r of map.rooms) ctx.fillRect(r.x * cell, r.y * cell, r.width * cell, r.height * cell);
  ctx.globalAlpha = 1;

  const square = (x: number, y: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x * cell, y * cell, cell, cell);
  };
  const dot = (x: number, y: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
  };
  square(map.start.x, map.start.y, color('--hp-you'));
  if (map.stairs) square(map.stairs.x, map.stairs.y, color('--bone'));
  for (const f of map.features) if (f.kind === 'treasure') square(f.pos.x, f.pos.y, color('--procure'));
  for (const en of enemies) {
    if (en.elite) square(en.pos.x, en.pos.y, color('--fire'));
    else dot(en.pos.x, en.pos.y, color(nest.has(en.uid) ? '--alert' : '--hp-enemy'));
  }
}
