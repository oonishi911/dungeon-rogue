// 開発用：ダンジョンの設定（src/game/dungeonGen.json）を管理する画面。?view=gen で開く。
// 階の数とランクごとの広さ、小部屋の多さと大きさ、敵の数と置き方（部屋に集める・部屋には置かない・群れ部屋・部屋から出さない）、
// 敵を倒したときのレベルの上がり方と強敵の報酬の倍率、魔力と呪文の強さを変えられる。
// 変えた値で作ったマップの見本を、その場で見て確かめられる。
// 変えた内容は「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { spawnEnemies, type MapEnemy } from '../game/enemies';
import {
  describeGenChanges,
  GEN_LABELS,
  GEN_LIMITS,
  GEN_SETTINGS,
  MAGIC_FIELDS,
  SPELL_FIELDS,
  SPELL_NAMES,
  genProblems,
  PLACEMENT_LABELS,
  PLACEMENTS,
  serializeGenSettings,
  type EnemySettings,
  type FloorSettings,
  type GenSettings,
  type GrowthSettings,
  type MagicSettings,
  type Placement,
  type RoomSettings,
} from '../game/genMaster';
import { generateFloor, type FloorMap } from '../game/map';
import { RANK_CONFIG, rankParams } from '../game/rank';
import type { SpellId } from '../game/types';
import { AdminNav, AdminTabs, cls, NumberField, PublishPanel, usePublish } from './adminParts';

const FILE = 'src/game/dungeonGen.json';
const CANVAS_PX = 640; // 見本の長い辺の描画解像度。表示サイズは CSS で合わせる

const copy = (g: GenSettings): GenSettings => JSON.parse(JSON.stringify(g)) as GenSettings;

export function GenAdmin() {
  const [base, setBase] = useState<GenSettings>(() => copy(GEN_SETTINGS));
  const [draft, setDraft] = useState<GenSettings>(() => copy(GEN_SETTINGS));
  const [rank, setRank] = useState(1);
  const [tab, setTab] = useState<GenTab>(firstTab);
  const [seed, setSeed] = useState(1);
  const publisher = usePublish(FILE);

  const changes = useMemo(() => describeGenChanges(base, draft), [base, draft]);
  const problems = useMemo(() => genProblems(draft), [draft]);
  const preview = useMemo(() => (problems.length ? null : makePreview(draft, rank, seed)), [draft, rank, seed, problems.length]);

  const setFloors = (patch: Partial<FloorSettings>) => setDraft((d) => ({ ...d, floors: { ...d.floors, ...patch } }));
  const setFloorSize = (index: number, size: number) => setFloors({ sizes: draft.floors.sizes.map((v, i) => (i === index ? size : v)) });
  const f = draft.floors;
  const bf = base.floors;
  const setRooms = (patch: Partial<RoomSettings>) => setDraft((d) => ({ ...d, rooms: { ...d.rooms, ...patch } }));
  const setEnemies = (patch: Partial<EnemySettings>) => setDraft((d) => ({ ...d, enemies: { ...d.enemies, ...patch } }));
  const setGrowth = (patch: Partial<GrowthSettings>) => setDraft((d) => ({ ...d, growth: { ...d.growth, ...patch } }));
  const g = draft.growth;
  const bg = base.growth;
  const setMagic = (patch: Partial<MagicSettings>) => setDraft((d) => ({ ...d, magic: { ...d.magic, ...patch } }));
  const setSpell = (spell: SpellId, key: string, v: number) =>
    setDraft((d) => ({ ...d, spells: { ...d.spells, [spell]: { ...d.spells[spell], [key]: v } } }));
  const r = draft.rooms;
  const e = draft.enemies;
  const br = base.rooms;
  const be = base.enemies;

  const onPublish = () => {
    if (problems.length || !changes.length) return;
    const message = `ダンジョンの設定を更新する（管理画面から）\n\n${changes.map((c) => `- ${c}`).join('\n')}`;
    void publisher.send(serializeGenSettings(draft), serializeGenSettings(base), message, () => setBase(copy(draft)));
  };

  return (
    <main className="screen admin">
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">ダンジョンの設定</h1>
        </div>
      </header>
      <AdminNav current="gen" />
      <AdminTabs
        label="設定の種類"
        idPrefix="gen"
        tabs={GEN_TABS.map((t) => ({ ...t, changed: changedIn(t.id, base, draft) }))}
        current={tab}
        onSelect={(t) => {
          setTab(t);
          rememberTab(t);
        }}
      />

      <p className="admin__lead">
        値を変えると、下の見本のマップがすぐに作り直されます。「変更を公開」を押すと、リポジトリの <code>{FILE}</code>{' '}
        に保存され、自動チェックが通れば数分で公開版に反映されます（ボスの階は形が決まっているので変わりません）。
      </p>

      {tab === 'floors' && (
      <section className="admin__section" role="tabpanel" id="gen-floors-panel" aria-labelledby="gen-floors-tab">
        <h2 className="admin__heading">階の数と広さ</h2>
        <p className="admin__note">
          広さは、ランクごとに決めます（上のランクほど、同じか広く）。満腹度の上限・敵の数・HPの回復の速さは、広さと階の数から自動で決まります。
          大きく変えると、自動チェックのバランステストに通らず、公開されないことがあります。
        </p>
        <div className="gen__fields">
          <Field label={GEN_LABELS.floorCount} hint="通常の階の数。その下に、ボスの階が1つある。満腹度の上限は、階の数に合わせて増える">
            <NumberField {...GEN_LIMITS.floorCount} value={f.count} changed={f.count !== bf.count} label={GEN_LABELS.floorCount} onChange={(v) => setFloors({ count: v })} />
          </Field>
        </div>
        <h3 className="gen__subheading">ランクごとの広さ（一辺のマス数）</h3>
        <div className="gen__fields">
          {f.sizes.map((size, i) => (
            <Field key={i} label={`ランク${i + 1}`} hint={`${size}×${size}マス ・ 満腹度の上限 ${rankParams(i + 1, f).maxSatiety}`}>
              <NumberField
                {...GEN_LIMITS.floorSize}
                value={size}
                changed={size !== bf.sizes[i]}
                label={`ランク${i + 1}の${GEN_LABELS.floorSize}`}
                onChange={(v) => setFloorSize(i, v)}
              />
            </Field>
          ))}
        </div>
      </section>
      )}

      {tab === 'rooms' && (
      <section className="admin__section" role="tabpanel" id="gen-rooms-panel" aria-labelledby="gen-rooms-tab">
        <h2 className="admin__heading">小部屋</h2>
        <div className="gen__fields">
          <Field label={GEN_LABELS.attemptRate} hint="大きいほど部屋が増え、迷路の通路が減る（0：部屋なし）。通路が減ると、行き止まりに置く宝箱と強敵も少し減る">
            <NumberField {...GEN_LIMITS.attemptRate} value={r.attemptRate} changed={r.attemptRate !== br.attemptRate} label={GEN_LABELS.attemptRate} onChange={(v) => setRooms({ attemptRate: v })} />
          </Field>
          <Field label={GEN_LABELS.minSize} hint="部屋の一辺のマス数（奇数）">
            <NumberField {...GEN_LIMITS.roomSize} value={r.minSize} changed={r.minSize !== br.minSize} label={GEN_LABELS.minSize} onChange={(v) => setRooms({ minSize: v })} />
          </Field>
          <Field label={GEN_LABELS.maxSize} hint="小さくすると、部屋の数が増えて一つ一つが小さくなる">
            <NumberField {...GEN_LIMITS.roomSize} value={r.maxSize} changed={r.maxSize !== br.maxSize} label={GEN_LABELS.maxSize} onChange={(v) => setRooms({ maxSize: v })} />
          </Field>
        </div>
      </section>
      )}

      {tab === 'enemies' && (
      <section className="admin__section" role="tabpanel" id="gen-enemies-panel" aria-labelledby="gen-enemies-tab">
        <h2 className="admin__heading">敵の数と置き方</h2>
        <div className="gen__fields">
          <Field label={GEN_LABELS.amount} hint="通常の敵の数（1：今の数。ランクで広くなるほど増える分は、そのまま）。強敵とボスは変わらない">
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
            <NumberField {...GEN_LIMITS.nestCount} value={e.nestMin} changed={e.nestMin !== be.nestMin} label={GEN_LABELS.nestMin} onChange={(v) => setEnemies({ nestMin: v })} />
          </Field>
          <Field label={GEN_LABELS.nestMax}>
            <NumberField {...GEN_LIMITS.nestCount} value={e.nestMax} changed={e.nestMax !== be.nestMax} label={GEN_LABELS.nestMax} onChange={(v) => setEnemies({ nestMax: v })} />
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
        </div>
      </section>
      )}

      {tab === 'growth' && (
      <section className="admin__section" role="tabpanel" id="gen-growth-panel" aria-labelledby="gen-growth-tab">
        <h2 className="admin__heading">レベルと強敵の報酬</h2>
        <p className="admin__note">
          敵を倒して経験値がたまると、その挑戦のあいだだけレベルが上がります。敵ごとの金貨・経験値・道具を落とす確率は、敵のマスターデータの画面で変えます。
          強くしすぎると、自動チェックのバランステスト（外れた準備でクリアできすぎないか）に通らず、公開されません。
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
      )}

      {tab === 'magic' && (
      <section className="admin__section" role="tabpanel" id="gen-magic-panel" aria-labelledby="gen-magic-tab">
        <h2 className="admin__heading">魔法</h2>
        <p className="admin__note">
          呪文書（準備の魔法屋で買う）を持っていくと、魔力を使ってその呪文を何度でも唱えられます。呪文書を持っていなければ、魔力の棒も出ません。
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
      )}

      <section className="admin__section" aria-labelledby="gen-preview">
        <h2 id="gen-preview" className="admin__heading">見本</h2>
        <div className="gen__preview-controls">
          <label>
            <span>ランク</span>
            <select className="admin__select" value={rank} onChange={(ev) => setRank(Number(ev.target.value))}>
              {Array.from({ length: RANK_CONFIG.maxRank }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  ランク{n}（{f.sizes[n - 1]}×{f.sizes[n - 1]}）
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="explore__wait" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
            別のマップを作る
          </button>
        </div>
        {preview ? <Preview preview={preview} /> : <p className="admin__note">値に問題があるので、見本を作れません（下の「変更を公開」の欄を見てください）。</p>}
      </section>

      <PublishPanel changes={changes} problems={problems} publisher={publisher} onReset={() => setDraft(copy(base))} onPublish={onPublish} />
    </main>
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

// ===== タブ =====

/** 設定の種類ごとのタブ。どれを選んでも、下の見本と「変更を公開」はそのまま出す */
const GEN_TABS = [
  { id: 'floors', label: '階の数と広さ' },
  { id: 'rooms', label: '小部屋' },
  { id: 'enemies', label: '敵の数と置き方' },
  { id: 'growth', label: 'レベルと強敵の報酬' },
  { id: 'magic', label: '魔法' },
] as const;
type GenTab = (typeof GEN_TABS)[number]['id'];

/** そのタブの値を、公開している値から変えたか */
function changedIn(tab: GenTab, base: GenSettings, draft: GenSettings): boolean {
  const parts: Record<GenTab, (g: GenSettings) => unknown> = {
    floors: (g) => g.floors,
    rooms: (g) => g.rooms,
    enemies: (g) => g.enemies,
    growth: (g) => g.growth,
    magic: (g) => [g.magic, g.spells],
  };
  return JSON.stringify(parts[tab](base)) !== JSON.stringify(parts[tab](draft));
}

/** 開いたときのタブ：住所の tab=（?view=gen&tab=magic のように、タブを指して開ける）、なければ最初のタブ */
function firstTab(): GenTab {
  const want = new URLSearchParams(window.location.search).get('tab');
  return GEN_TABS.find((t) => t.id === want)?.id ?? GEN_TABS[0].id;
}

/** 選んだタブを住所に残す（読み込み直しても、同じタブが開くように。履歴は増やさない） */
function rememberTab(tab: GenTab) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', url);
}

/** 見本のマップと敵。群れの敵を見分けるため、群れ部屋なしでも置いてみて、増えた分を群れの敵とする */
function makePreview(settings: GenSettings, rank: number, seed: number): PreviewData {
  const params = rankParams(rank, settings.floors);
  const map = generateFloor(seed, { width: params.mapSize, height: params.mapSize, rooms: settings.rooms });
  const { enemies } = spawnEnemies(map, 'neutral', seed, 0, params.enemyDensity, settings.enemies);
  const plain = spawnEnemies(map, 'neutral', seed, 0, params.enemyDensity, { ...settings.enemies, nestChance: 0 }).enemies.length;
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
