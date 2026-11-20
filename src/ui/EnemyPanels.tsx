// 開発用の管理画面（Admin.tsx）の、敵のマスターデータ（src/game/enemies.json）のタブ：
// 「敵」（敵の値を変える・敵を足す・消す）。どのダンジョンにどの敵が出るかは、ダンジョンの設定の「ダンジョンに出る敵」タブ（DungeonPanels.tsx）で決める。
// 変えた内容は、管理画面の「変更を公開」でリポジトリに保存され、自動チェックが通れば数分で公開版に反映される。
// 表の上に、探す欄・並び順・「変えた敵だけ」がある。並び順が「属性ごと」のときは、属性ごとにまとめて、まとまりをたたんで隠せる。
// 狭い画面（スマホ）では、表が敵1体ごとのカードになる（styles.css の .admin__table--cards）

import { Fragment, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { BODY_NAMES } from '../game/data';
import { addEnemy, BEHAVIOR_LABELS, BEHAVIOR_TEXTS, BEHAVIORS, BODIES, ELEMENTS, enemyIds, LIMITS, RATE_LABELS, REWARD_LABELS, TRAIT_LABELS, type EnemyLook, type EnemyMaster, type EnemyRecord } from '../game/enemyMaster';
import { Sprite } from '../sprites/Sprite';
import type { Body, Element, EnemyId } from '../game/types';
import { textError } from '../game/fieldCheck';
import { ENEMY_SORTS, enemyStrength, filterEnemies, groupEnemies, sortEnemies, type EnemyGroup, type EnemySort } from '../game/enemyView';
import { cls, NumberField, ResetMark, TextField } from './adminParts';

/** タブの部品に渡すもの：公開版（base）、画面で変えているデータ（draft）、それを変える関数 */
export interface EnemyPanelProps {
  base: EnemyMaster;
  draft: EnemyMaster;
  setDraft: Dispatch<SetStateAction<EnemyMaster>>;
}

/**
 * 「敵」のタブ：敵の一覧（値を変える・消す）と、敵を足すところ。busy は、公開しているあいだ（足す・消すを止める）。
 * bossUsesOf は、その敵をボスにしているところ（「標準の炎」など。あれば消せない）。onRemove は、敵をすべてのダンジョンから外して消す
 */
export function EnemiesPanel({
  base,
  draft,
  setDraft,
  busy,
  bossUsesOf,
  onRemove,
}: EnemyPanelProps & { busy: boolean; bossUsesOf: (id: EnemyId) => string[]; onRemove: (id: EnemyId) => void }) {
  const allIds = enemyIds(draft);
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [sort, setSort] = useState<EnemySort>('master');
  const [folded, setFolded] = useState<ReadonlySet<EnemyGroup>>(new Set());
  const filtering = query.trim() !== '' || changedOnly;
  const found = useMemo(() => filterEnemies(base, draft, allIds, { query, changedOnly }), [base, draft, allIds, query, changedOnly]);
  const sorted = useMemo(() => sortEnemies(draft, found, sort), [draft, found, sort]);
  // 属性ごとにまとめるのは、並び順が「属性ごと」のとき。探している間は、たたんであっても開いて見せる
  const groups = useMemo(() => (sort === 'master' ? groupEnemies(draft, sorted) : null), [draft, sorted, sort]);
  const toggle = (g: EnemyGroup) => setFolded((prev) => (prev.has(g) ? new Set([...prev].filter((x) => x !== g)) : new Set([...prev, g])));
  const allFolded = groups !== null && groups.every((g) => folded.has(g.group));
  // 見た目の候補：今いる敵の見た目（同じ見た目はまとめる）
  const looks = useMemo(() => lookChoices(draft), [draft]);

  const setEnemy = (id: EnemyId, patch: Partial<EnemyRecord>) =>
    setDraft((d) => ({ ...d, enemies: { ...d.enemies, [id]: { ...d.enemies[id]!, ...patch } } }));

  /** 敵1体の行（狭い画面では、1枚のカード） */
  const row = (id: EnemyId) => {
    const e = draft.enemies[id]!;
    // 足したばかりの敵は、公開版にない（どの値も「変えた」として印を付ける）
    const b = base.enemies[id] ?? {
      ...e,
      name: '',
      hp: -1,
      atk: -1,
      def: -1,
      look: { sprite: e.look.sprite, recolor: { _: '' } },
      reward: { gold: -1, exp: -1, drop: -1 },
    };
    const added = !(id in base.enemies);
    const bossOf = bossUsesOf(id);
    const lookKey = JSON.stringify(e.look);
    return (
      <tr key={id} className={added ? 'admin__row--new' : undefined}>
        <th scope="row">
          <span className="admin__who">
            <Sprite id={e.look.sprite} recolor={e.look.recolor} scale={1} label={`${e.name}の見た目`} className="admin__sprite" />
            <TextField
              value={e.name}
              rule={{ max: LIMITS.name.max, taken: otherNames(draft, id), takenText: 'ほかの敵の名前です' }}
              changed={e.name !== b.name}
              base={b.name}
              label={`${id} の名前`}
              onChange={(v) => setEnemy(id, { name: v })}
            />
          </span>
          <span className="admin__id">
            {id}
            {added && '（足す）'}
          </span>
        </th>
        {(['hp', 'atk', 'def'] as const).map((key) => (
          <td key={key} data-label={{ hp: 'HP', atk: '攻撃', def: '防御' }[key]} className="admin__c2">
            <NumberField
              value={e[key]}
              min={LIMITS[key].min}
              max={LIMITS[key].max}
              changed={e[key] !== b[key]}
              base={b[key]}
              label={`${e.name}の${{ hp: 'HP', atk: '攻撃', def: '防御' }[key]}`}
              onChange={(v) => setEnemy(id, { [key]: v })}
            />
          </td>
        ))}
        <td data-label="強さの目安（HP × 攻撃）" className="admin__c6 admin__strength">
          <span className="admin__strength-num">{enemyStrength(e)}</span>
        </td>
        <td data-label="属性" className="admin__c3">
          <span className="admin__numrow">
            <select
              className={cls('admin__select', e.element !== b.element)}
              value={e.element}
              aria-label={`${e.name}の属性`}
              onChange={(ev) => setEnemy(id, { element: ev.target.value as Element })}
            >
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {TRAIT_LABELS[el]}
                </option>
              ))}
            </select>
            <ResetMark show={e.element !== b.element} label={`${e.name}の属性を公開版の「${TRAIT_LABELS[b.element]}」に戻す`} onClick={() => setEnemy(id, { element: b.element })} />
          </span>
        </td>
        <td data-label="体質" className="admin__c3">
          <span className="admin__numrow">
            <select
              className={cls('admin__select', e.body !== b.body)}
              value={e.body}
              aria-label={`${e.name}の体質`}
              onChange={(ev) => setEnemy(id, { body: ev.target.value as Body })}
            >
              {BODIES.map((body) => (
                <option key={body} value={body}>
                  {BODY_NAMES[body]}
                </option>
              ))}
            </select>
            <ResetMark show={e.body !== b.body} label={`${e.name}の体質を公開版の「${BODY_NAMES[b.body]}」に戻す`} onClick={() => setEnemy(id, { body: b.body })} />
          </span>
        </td>
        {(['physical', 'magic'] as const).map((key) => (
          <td key={key} data-label={RATE_LABELS[key]} className="admin__c3">
            <NumberField
              value={e[key] ?? 1}
              min={LIMITS.rate.min}
              max={LIMITS.rate.max}
              step={LIMITS.rate.step}
              integer={false}
              changed={(e[key] ?? 1) !== (b[key] ?? 1)}
              base={b[key] ?? 1}
              slider="narrow"
              label={`${e.name}の${RATE_LABELS[key]}`}
              onChange={(v) => setEnemy(id, { [key]: v })}
            />
          </td>
        ))}
        <td data-label="ボスにする" className="admin__c6 admin__boss-cell">
          <span className="admin__numrow">
            <input
              type="checkbox"
              className={cls('admin__check', Boolean(e.boss) !== Boolean(b.boss))}
              checked={Boolean(e.boss)}
              aria-label={`${e.name}をボスにする`}
              onChange={(ev) => setEnemy(id, { boss: ev.target.checked || undefined })}
            />
            <ResetMark show={Boolean(e.boss) !== Boolean(b.boss)} label={`${e.name}のボスの設定を公開版に戻す`} onClick={() => setEnemy(id, { boss: b.boss })} />
          </span>
        </td>
        <td data-label="行動の個性" className="admin__c6 admin__behaviors">
          {BEHAVIORS.map((bh) => {
            const on = e.behaviors?.includes(bh) ?? false;
            const was = b.behaviors?.includes(bh) ?? false;
            return (
              <label key={bh} className="admin__behavior" title={BEHAVIOR_TEXTS[bh]}>
                <input
                  type="checkbox"
                  className={cls('admin__check', on !== was)}
                  checked={on}
                  aria-label={`${e.name}の行動の個性：${BEHAVIOR_LABELS[bh]}`}
                  onChange={(ev) => {
                    const next = BEHAVIORS.filter((x) => (x === bh ? ev.target.checked : (e.behaviors?.includes(x) ?? false)));
                    setEnemy(id, { behaviors: next.length ? next : undefined });
                  }}
                />
                {BEHAVIOR_LABELS[bh]}
              </label>
            );
          })}
          <ResetMark
            show={BEHAVIORS.some((bh) => (e.behaviors?.includes(bh) ?? false) !== (b.behaviors?.includes(bh) ?? false))}
            label={`${e.name}の行動の個性を公開版に戻す`}
            onClick={() => setEnemy(id, { behaviors: b.behaviors })}
          />
        </td>
        {(['gold', 'exp', 'drop'] as const).map((key) => (
          <td key={key} data-label={{ gold: '報酬 金貨', exp: '報酬 経験値', drop: '報酬 落とす%' }[key]} className="admin__c2">
            {e.boss ? (
              <span className="admin__ingame" title="ボスを倒したときは、ボスの報酬が出る">—</span>
            ) : (
              <NumberField
                value={e.reward[key]}
                min={LIMITS[key].min}
                max={LIMITS[key].max}
                changed={e.reward[key] !== b.reward[key]}
                base={b.reward[key]}
                slider={key === 'drop' ? 'narrow' : false}
                label={`${e.name}の${REWARD_LABELS[key]}`}
                onChange={(v) => setEnemy(id, { reward: { ...e.reward, [key]: v } })}
              />
            )}
          </td>
        ))}
        <td data-label="見た目" className="admin__c6">
          <span className="admin__numrow">
            <select
              className={cls('admin__select admin__look', lookKey !== JSON.stringify(b.look))}
              value={lookKey}
              aria-label={`${e.name}の見た目`}
              onChange={(ev) => setEnemy(id, { look: JSON.parse(ev.target.value) as EnemyLook })}
            >
              {looks.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
            <ResetMark show={!added && lookKey !== JSON.stringify(b.look)} label={`${e.name}の見た目を公開版に戻す`} onClick={() => setEnemy(id, { look: b.look })} />
          </span>
        </td>
        <td className="admin__c6 admin__remove-cell">
          <button
            type="button"
            className="explore__wait admin__remove"
            disabled={busy || bossOf.length > 0}
            title={bossOf.length ? `${bossOf.join('・')}のボスなので消せません（先に「ダンジョンに出る敵」のタブでボスを変えてください）` : undefined}
            aria-label={`${e.name}を消す`}
            onClick={() => onRemove(id)}
          >
            消す
          </button>
        </td>
      </tr>
    );
  };

  return (
    <section className="admin__section" role="tabpanel" id="admin-enemies-panel" aria-labelledby="admin-enemies-tab">
      <h2 className="admin__heading">敵</h2>
      <ul className="admin__notelist">
        <li>
          <b>HP・攻撃・防御</b>：ゲームの中でも、この数字のとおりです（強敵だけ、HPが2倍・攻撃が1.5倍になります）。
          <span className="gen__example">例：攻撃10のプレイヤーが、防御3の敵を殴ると、10−3＝7ダメージ。攻撃8の敵が、防御2のプレイヤーに当たると、8−2＝6ダメージ（どちらも、最低1）。</span>
        </li>
        <li>
          <b>物理・魔法</b>：武器で殴られたとき・呪文を受けたときのダメージの倍率です。体質や属性の相性とは別に、さらに掛けます。
          <span className="gen__example">例：1はふつう。1.5なら弱点で、ダメージが1.5倍。0.5なら強く、半分。</span>
        </li>
        <li>
          <b>強さ</b>：目安は「HP × 攻撃」です。強敵の元になるのは、ダンジョンの道中で、この数字がいちばん大きい敵です。
          <span className="gen__example">例：HP20・攻撃5なら100。HP10・攻撃8なら80なので、前の敵のほうが強いと数えます。</span>
        </li>
        <li>
          <b>金貨・経験値・落とす%</b>：倒したときの報酬です。落とす%は、回復薬か食料を落とす確率です。強敵は、金貨と経験値がダンジョンごとの倍率（「HP・レベル・強敵の報酬」のタブ）で増え、必ず宝箱を落とします。
          <span className="gen__example">例：金貨10・経験値5・落とす%30なら、倒すと金貨10と経験値5を得て、10回倒すと、およそ3回、回復薬か食料を落とします。</span>
        </li>
        <li>値を変えた欄には「戻す」が出ます。数字の欄は、「−」「＋」でも変えられます（押し続けると、連続して動きます）。</li>
      </ul>
      <div className="admin__list">
      <div className="admin__toolbar">
        <label className="admin__search">
          <span className="visually-hidden">敵を探す</span>
          <input type="search" className="admin__name" value={query} placeholder="名前で探す" aria-label="敵を探す（名前か ID の一部）" onChange={(ev) => setQuery(ev.target.value)} />
        </label>
        <label className="admin__sort">
          <span>並び順</span>
          <select className="admin__select" value={sort} aria-label="敵の並び順" onChange={(ev) => setSort(ev.target.value as EnemySort)}>
            {ENEMY_SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin__toggle">
          <input type="checkbox" className="admin__check" checked={changedOnly} onChange={(ev) => setChangedOnly(ev.target.checked)} />
          変えた敵だけ
        </label>
        <span className="admin__count" role="status">
          {sorted.length === allIds.length ? `${allIds.length}体` : `${sorted.length} / ${allIds.length}体`}
        </span>
        {groups && !filtering && (
          <button type="button" className="explore__wait" onClick={() => setFolded(allFolded ? new Set() : new Set(groups.map((g) => g.group)))}>
            {allFolded ? 'すべてひらく' : 'すべてたたむ'}
          </button>
        )}
      </div>
      {sorted.length === 0 && <p className="admin__note">条件に合う敵がいません。探す言葉や「変えた敵だけ」を見直してください。</p>}
      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">HP</th>
              <th scope="col">攻撃</th>
              <th scope="col">防御</th>
              <th scope="col">強さ</th>
              <th scope="col">属性</th>
              <th scope="col">体質</th>
              <th scope="col">物理</th>
              <th scope="col">魔法</th>
              <th scope="col">ボス</th>
              <th scope="col">個性</th>
              <th scope="col">金貨</th>
              <th scope="col">経験値</th>
              <th scope="col">落とす%</th>
              <th scope="col">見た目</th>
              <th scope="col">
                <span className="visually-hidden">消す</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? [{ group: null, label: '', ids: sorted }]).map((g) => {
              const open = g.group === null || filtering || !folded.has(g.group);
              return (
                <Fragment key={g.group ?? 'all'}>
                  {g.group !== null && (
                  <tr key={`group-${g.group}`} className="admin__group-row">
                    <th colSpan={16} scope="colgroup">
                      <button type="button" className="admin__group-toggle" aria-expanded={open} onClick={() => toggle(g.group!)} disabled={filtering}>
                        <span aria-hidden="true">{open ? '▼' : '▶'}</span> {g.label}（{g.ids.length}体）
                      </button>
                    </th>
                  </tr>
                  )}
                  {open && g.ids.map((id) => row(id))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
      <AddEnemy master={draft} disabled={busy} onAdd={(id, record) => setDraft((d) => addEnemy(d, id, record))} />
      <p className="admin__note">
        <b>個性</b>：行動の個性です（重ねられます）。遠距離は、まっすぐ4マス以内で見通せれば撃ってきます。突進は、まっすぐ3マス以内で身構えてから走ってきます。盾持ちは、向いている正面からの武器の攻撃を7割カットします。召喚は、5ターンごとに弱い敵を呼びます。文字の上にマウスを置くと、くわしい説明が出ます。
      </p>
      <p className="admin__note">
        ボスにしているダンジョンがある敵は消せません。消すと、その敵はどのダンジョンにも出なくなります。足した敵は、ダンジョンごとの「ダンジョンに出る敵」のタブで出やすさを決めるまで、どのダンジョンにも出ません。
      </p>
    </section>
  );
}

/** 敵を足すところ。ID と名前を決め、見た目と強さは今いる敵から写す */
function AddEnemy({ master, disabled, onAdd }: { master: EnemyMaster; disabled: boolean; onAdd: (id: EnemyId, record: EnemyRecord) => void }) {
  const ids = enemyIds(master);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [from, setFrom] = useState(ids[0] ?? '');
  const template = master.enemies[from] ?? master.enemies[ids[0] ?? ''];
  const names = new Set(Object.values(master.enemies).map((e) => e.name));
  // まだ何も入れていない欄には、エラーを出さない（quietWhenEmpty）。「足す」は、両方の欄が決まりに合うまで押せない
  const idRule = {
    max: LIMITS.id.max,
    pattern: { test: LIMITS.id.pattern, text: `英小文字で始まり、英小文字・数字・_ だけの2〜${LIMITS.id.max}文字` },
    taken: new Set(ids),
    takenText: 'ほかの敵の ID です',
  };
  const nameRule = { max: LIMITS.name.max, taken: names, takenText: 'ほかの敵の名前です' };
  const ready = Boolean(template && !textError(id, idRule) && !textError(name, nameRule));
  return (
    <div className="admin__add" role="group" aria-label="敵を足す">
      <p className="admin__add-title">敵を足す</p>
      <label>
        <span>ID（英小文字・数字・_）</span>
        <TextField value={id} rule={idRule} quietWhenEmpty changed={false} label="足す敵の ID" spellCheck={false} onChange={(v) => setId(v.trim())} placeholder="cave_bat" />
      </label>
      <label>
        <span>名前</span>
        <TextField value={name} rule={nameRule} quietWhenEmpty changed={false} label="足す敵の名前" onChange={setName} placeholder="洞窟コウモリ" />
      </label>
      <label>
        <span>見た目と強さのもと</span>
        <select className="admin__select" value={from} onChange={(e) => setFrom(e.target.value)}>
          {ids.map((i) => (
            <option key={i} value={i}>
              {master.enemies[i]!.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="explore__wait admin__add-button"
        disabled={disabled || !ready}
        onClick={() => {
          if (!template) return;
          onAdd(id, { ...JSON.parse(JSON.stringify(template)), name: name.trim() } as EnemyRecord);
          setId('');
          setName('');
        }}
      >
        足す
      </button>
    </div>
  );
}

/** ほかの敵の名前（名前の欄で、同じ名前にしないため） */
function otherNames(master: EnemyMaster, id: EnemyId): Set<string> {
  return new Set(enemyIds(master).flatMap((other) => (other === id ? [] : [master.enemies[other]!.name])));
}

/** 見た目の候補（今いる敵の見た目。同じ見た目は1つにまとめる） */
function lookChoices(master: EnemyMaster): { key: string; label: string }[] {
  const out = new Map<string, string[]>();
  for (const id of enemyIds(master)) {
    const key = JSON.stringify(master.enemies[id]!.look);
    out.set(key, [...(out.get(key) ?? []), master.enemies[id]!.name]);
  }
  return [...out].map(([key, names]) => ({ key, label: `${names[0]}${names.length > 1 ? `ほか${names.length - 1}体` : ''}の見た目` }));
}
