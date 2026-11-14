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
import { generateFloor, type FloorMap } from '../game/map';
import { floorParams } from '../game/floorParams';
import type { SpellId } from '../game/types';
import { cls, NumberField } from './adminParts';

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
        敵の数・HPの回復の速さは、広さから自動で決まります。難しさの段階を作りたいときは、ダンジョンを複製して、広さや満腹度を変えた別のダンジョンにします。
      </p>
      <div className="gen__fields">
        <Field label={GEN_LABELS.floorCount} hint="通常の階の数。その下に、ボスの階が1つある。階を増やしたら、満腹度も見直す">
          <NumberField {...GEN_LIMITS.floorCount} value={f.count} changed={f.count !== bf.count} label={GEN_LABELS.floorCount} onChange={(v) => setFloors({ count: v })} />
        </Field>
        <Field label={GEN_LABELS.floorSize} hint={`一辺のマス数（${f.size}×${f.size}マス）`}>
          <NumberField {...GEN_LIMITS.floorSize} value={f.size} changed={f.size !== bf.size} label={GEN_LABELS.floorSize} onChange={(v) => setFloors({ size: v })} />
        </Field>
        <Field label={GEN_LABELS.satiety} hint={`探索のはじめの満腹度。これが上限。マップの面積（${f.size ** 2}）の${(f.satiety / f.size ** 2).toFixed(1)}倍`}>
          <NumberField {...GEN_LIMITS.satiety} value={f.satiety} changed={f.satiety !== bf.satiety} label={GEN_LABELS.satiety} onChange={(v) => setFloors({ satiety: v })} />
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
  return (
    <section className="admin__section" role="tabpanel" id="admin-rooms-panel" aria-labelledby="admin-rooms-tab">
      <h2 className="admin__heading">小部屋</h2>
      <div className="gen__fields">
        <Field label={GEN_LABELS.attemptRate} hint="大きいほど部屋が増え、迷路の通路が減る（0：部屋なし）。通路が減ると、行き止まりに置く宝箱と強敵も少し減る">
          <NumberField {...GEN_LIMITS.attemptRate} value={r.attemptRate} changed={r.attemptRate !== br.attemptRate} label={GEN_LABELS.attemptRate} onChange={(v) => setRooms({ attemptRate: v })} />
        </Field>
        <Field label={GEN_LABELS.minSize} hint="部屋の一辺のマス数（奇数）">
          <NumberField
            {...GEN_LIMITS.roomSize}
            odd
            value={r.minSize}
            changed={r.minSize !== br.minSize}
            label={GEN_LABELS.minSize}
            error={orderError('atMost', '最小', r.minSize, '最大', r.maxSize)}
            onChange={(v) => setRooms({ minSize: v })}
          />
        </Field>
        <Field label={GEN_LABELS.maxSize} hint="小さくすると、部屋の数が増えて一つ一つが小さくなる">
          <NumberField
            {...GEN_LIMITS.roomSize}
            odd
            value={r.maxSize}
            changed={r.maxSize !== br.maxSize}
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
        <Field label={GEN_LABELS.amount} hint="通常の敵の数（1：今の数。広さに合わせて増える分は、そのまま）。強敵とボスは変わらない">
          <NumberField {...GEN_LIMITS.amount} value={e.amount} changed={e.amount !== be.amount} label={GEN_LABELS.amount} onChange={(v) => setEnemies({ amount: v })} />
        </Field>
        <Field label={GEN_LABELS.placement} hint="部屋だけにすると、通常の敵をすべて部屋に集める。通路だけにすると、部屋には敵を置かない（群れ部屋も作らない）">
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
          hint={e.placement === 'mixed' ? '部屋の床が、通路の床の何倍選ばれやすいか（1：同じ、0：部屋に置かない）' : '「部屋にも通路にも」のときだけ使う'}
        >
          <NumberField
            {...GEN_LIMITS.weight}
            value={e.roomWeight}
            changed={e.roomWeight !== be.roomWeight}
            label={GEN_LABELS.roomWeight}
            onChange={(v) => setEnemies({ roomWeight: v })}
          />
        </Field>
        <Field label={GEN_LABELS.nestChance} hint="部屋ごとに、この確率で敵がまとまっている部屋にする（0〜1。0：作らない）。群れの敵は、通常の敵とは別に足す">
          <NumberField {...GEN_LIMITS.nestChance} value={e.nestChance} changed={e.nestChance !== be.nestChance} label={GEN_LABELS.nestChance} onChange={(v) => setEnemies({ nestChance: v })} />
        </Field>
        <Field label={GEN_LABELS.nestMin} hint="部屋に入りきらないときは、入る分だけ置く">
          <NumberField
            {...GEN_LIMITS.nestCount}
            value={e.nestMin}
            changed={e.nestMin !== be.nestMin}
            label={GEN_LABELS.nestMin}
            error={orderError('atMost', '最小', e.nestMin, '最大', e.nestMax)}
            onChange={(v) => setEnemies({ nestMin: v })}
          />
        </Field>
        <Field label={GEN_LABELS.nestMax}>
          <NumberField
            {...GEN_LIMITS.nestCount}
            value={e.nestMax}
            changed={e.nestMax !== be.nestMax}
            label={GEN_LABELS.nestMax}
            error={orderError('atLeast', '最大', e.nestMax, '最小', e.nestMin)}
            onChange={(v) => setEnemies({ nestMax: v })}
          />
        </Field>
        <Field label={GEN_LABELS.stayInRoom} hint="部屋に置いた敵は、主人公に気付くまで部屋の中だけを歩く（気付いたら追ってくる）">
          <input
            type="checkbox"
            className={cls('admin__check', e.stayInRoom !== be.stayInRoom)}
            checked={e.stayInRoom}
            aria-label={GEN_LABELS.stayInRoom}
            onChange={(ev) => setEnemies({ stayInRoom: ev.target.checked })}
          />
        </Field>
        <Field label={GEN_LABELS.bossMinions} hint="ボスの部屋に、ボスといっしょに置く雑魚敵の数。種類は、その属性の道中の敵から選ぶ（0：ボスだけ）">
          <NumberField
            {...GEN_LIMITS.bossMinions}
            value={e.bossMinions}
            changed={e.bossMinions !== be.bossMinions}
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
            ['expBase', '経験値がこれだけたまると、レベル1→2に上がる'],
            ['expStep', 'レベルが上がるたびに、次に要る経験値がこれだけ増える'],
            ['hpPerLevel', '上がった分だけ、HPも回復する'],
            ['atkPerLevel', ''],
            ['maxLevel', ''],
            ['eliteRate', '強敵は、通常の敵の金貨と経験値のこの倍。強敵は必ず宝箱（金貨と良い道具）も落とす'],
          ] as const
        ).map(([key, hint]) => (
          <Field key={key} label={GEN_LABELS[key]} hint={hint || undefined}>
            <NumberField {...GEN_LIMITS[key]} value={g[key]} changed={g[key] !== bg[key]} label={GEN_LABELS[key]} onChange={(v) => setGrowth({ [key]: v })} />
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
          <Field key={f.key} label={f.label} hint={f.hint || undefined}>
            <NumberField
              min={f.min}
              max={f.max}
              step={f.step}
              value={draft.magic[f.key]}
              changed={draft.magic[f.key] !== base.magic[f.key]}
              label={f.label}
              onChange={(v) => setMagic({ [f.key]: v })}
            />
          </Field>
        ))}
      </div>
      <h3 className="gen__subheading">呪文ごとの設定</h3>
      <div className="gen__spells">
        {(Object.keys(SPELL_FIELDS) as SpellId[]).map((spell) => (
          <div key={spell} className="gen__spell">
            <span className="gen__label">{SPELL_NAMES[spell]}</span>
            {SPELL_FIELDS[spell].map((f) => (
              <label key={f.key} className="gen__spell-field">
                <span>{f.label}</span>
                <NumberField
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  integer={f.integer}
                  value={draft.spells[spell][f.key]!}
                  changed={draft.spells[spell][f.key] !== base.spells[spell][f.key]}
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
  const rows: { level: number; total: number; hp: number; atk: number }[] = [];
  let total = 0;
  for (let level = 2; level <= Math.min(growth.maxLevel, 6); level++) {
    total += growth.expBase + growth.expStep * (level - 2);
    rows.push({ level, total, hp: growth.hpPerLevel * (level - 1), atk: growth.atkPerLevel * (level - 1) });
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level}>
              <th scope="row">{r.level}</th>
              <td>{r.total}</td>
              <td>+{r.hp}</td>
              <td>+{r.atk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="gen__field">
      <span className="gen__label">{props.label}</span>
      {props.children}
      {props.hint && <span className="gen__hint">{props.hint}</span>}
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
