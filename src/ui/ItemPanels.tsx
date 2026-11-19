// 管理画面の「品物」タブ：店で売るすべての品物の名前と値段、武器・防具・指輪の段階ごとの性能を変える（src/game/items.json）。
// 武器・防具は種類ごとに10段階、指輪は5段階。上の段階ほど高く、強くする（下の段より安い・弱い段は、公開の欄の「直すところ」に出る）。

import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ARMOR_BASES,
  ARMOR_INFO,
  gearId,
  INFO_LABELS,
  INFO_TOPICS,
  ITEM_LIMITS,
  RING_INFO,
  RING_KINDS,
  ringId,
  RING_LEVELS,
  SPELLBOOK_IDS,
  SUPPLY_IDS,
  WEAPON_BASES,
  WEAPON_INFO,
  type ArmorBaseId,
  type ItemMaster,
  type PlainItem,
  type WeaponBaseId,
} from '../game/itemMaster';
import type { ItemId, RingKind } from '../game/types';
import { AdminTabs, NumberField, TextField } from './adminParts';
import { ItemIcon } from './ItemIcon';

type Group = WeaponBaseId | ArmorBaseId | `ring:${RingKind}` | 'ringExtra' | 'supplies' | 'spellbooks' | 'information';

const GROUPS: { id: Group; label: string }[] = [
  ...WEAPON_BASES.map((b) => ({ id: b as Group, label: WEAPON_INFO[b].label })),
  ...ARMOR_BASES.map((b) => ({ id: b as Group, label: ARMOR_INFO[b].label })),
  ...RING_KINDS.map((k) => ({ id: `ring:${k}` as Group, label: RING_INFO[k].label })),
  { id: 'ringExtra', label: '二重耐性・弱点' },
  { id: 'supplies', label: '道具' },
  { id: 'spellbooks', label: '呪文書' },
  { id: 'information', label: '情報料' },
];

interface ItemPanelProps {
  base: ItemMaster;
  draft: ItemMaster;
  setDraft: Dispatch<SetStateAction<ItemMaster>>;
}

/** すべての品物の名前（同じ名前は付けられない。自分は除く） */
function otherNames(m: ItemMaster, self: string): Set<string> {
  const all = [
    ...Object.values(m.weapons).flat(),
    ...Object.values(m.armors).flat(),
    ...Object.values(m.rings.kinds).flat(),
    ...Object.values(m.supplies),
    ...Object.values(m.spellbooks),
  ].map((t) => t.name.trim());
  const set = new Set(all);
  if (all.filter((n) => n === self.trim()).length <= 1) set.delete(self.trim());
  return set;
}

export function ItemsPanel({ base, draft, setDraft }: ItemPanelProps) {
  const [group, setGroup] = useState<Group>('sword');
  const nameRule = (self: string) => ({ max: ITEM_LIMITS.name.max, taken: otherNames(draft, self), takenText: 'ほかの品物の名前です' });

  const isWeapon = (WEAPON_BASES as readonly string[]).includes(group);
  const isArmor = (ARMOR_BASES as readonly string[]).includes(group);
  const ringKind = group.startsWith('ring:') ? (group.slice(5) as RingKind) : null;

  const setRing = (kind: RingKind, i: number, change: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, rings: { ...d.rings, kinds: { ...d.rings.kinds, [kind]: d.rings.kinds[kind].map((t, j) => (j === i ? { ...t, ...change } : t)) } } }));
  const setTier = (g: WeaponBaseId | ArmorBaseId, i: number, change: Record<string, unknown>) =>
    setDraft((d) =>
      isWeapon
        ? { ...d, weapons: { ...d.weapons, [g]: d.weapons[g as WeaponBaseId].map((t, j) => (j === i ? { ...t, ...change } : t)) } }
        : { ...d, armors: { ...d.armors, [g]: d.armors[g as ArmorBaseId].map((t, j) => (j === i ? { ...t, ...change } : t)) } },
    );
  const setPlain = (kind: 'supplies' | 'spellbooks', id: string, change: Partial<PlainItem>) =>
    setDraft((d) => ({ ...d, [kind]: { ...d[kind], [id]: { ...(d[kind] as Record<string, PlainItem>)[id], ...change } } }));

  const changedGroup = (g: Group): boolean => {
    const pick = (m: ItemMaster) =>
      g === 'information'
        ? m.information
        : g === 'supplies'
          ? m.supplies
          : g === 'spellbooks'
            ? m.spellbooks
            : g === 'ringExtra'
              ? { dual: m.rings.dualCut, weak: m.rings.weak }
              : g.startsWith('ring:')
                ? m.rings.kinds[g.slice(5) as RingKind]
                : (WEAPON_BASES as readonly string[]).includes(g)
                  ? m.weapons[g as WeaponBaseId]
                  : m.armors[g as ArmorBaseId];
    return JSON.stringify(pick(base)) !== JSON.stringify(pick(draft));
  };

  return (
    <section className="admin__section" role="tabpanel" id="admin-items-panel" aria-labelledby="admin-items-tab">
      <h2 className="admin__heading">品物</h2>
      <ul className="admin__notelist">
        <li>
          <b>名前と値段</b>：店で売る品物の名前と値段です。
        </li>
        <li>
          <b>武器と防具の段階</b>：種類ごとに10段階あり、段階ごとに性能も決めます。上の段階ほど高く、強くしてください。
          <span className="gen__example">例：武器は「攻撃力」と「魔力」。防具は「守り」（受けるダメージから引く数）だけです。守り5の防具なら、敵の攻撃10で受けるダメージは10−5＝5。</span>
        </li>
        <li>
          <b>指輪</b>：属性の耐性は、防具ではなく指輪だけが持ちます。種類ごとに5段階あり、段階ごとに「耐性（%）」（効く属性のダメージを何%カットするか。大きいほど強い）と値段を決めます。
          <span className="gen__example">例：炎の指輪の耐性が30なら、炎の攻撃のダメージは0.7倍。光の攻撃は炎を半分ふくむので、その半分だけ軽くなります。ちがう種類の指輪を重ねると、効果は掛け算です。</span>
        </li>
        <li>
          <b>弱点</b>：炎の指輪は氷に、氷の指輪は炎に、光の指輪は闇に、闇の指輪は光に弱くなります。増える割合は、その指輪の耐性の何%分か（「二重耐性・弱点」の欄。50なら、耐性30の指輪で、逆の属性のダメージが15%増える）。無属性・万能・二重耐性の指輪に弱点はありません。
        </li>
        <li>
          <b>店に並ぶ段階</b>：プレイヤーが持っている、いちばん上の段階の2つ上までが並びます。
          <span className="gen__example">例：段階3の武器まで持っていれば、店には段階5までが並びます。</span>
        </li>
        <li>
          <b>情報料</b>：情報屋で「はっきり聞く」ときの値段です（1回目の「それとなく聞く」は無料）。
        </li>
        <li>
          <b>武器の魔力</b>：持っていくと、魔法の強さ（呪文のダメージのもと。「魔法」タブ）に足される数です。0なら、魔法は強くなりません。杖を持っているときは、足したあとの合計に、杖の倍率が掛かります。
          <span className="gen__example">例：魔法の強さが8で、魔力2の武器を持てば、8＋2＝10。杖で倍率1.5なら、10×1.5＝15です。</span>
        </li>
        <li>武器と体質の相性、指輪の効く属性、道具の働き（回復量など）は、ここでは変えられません。</li>
      </ul>

      <AdminTabs
        label="品物の種類"
        idPrefix="items"
        tabs={GROUPS.map((g) => ({ id: g.id, label: g.label, changed: changedGroup(g.id) }))}
        current={group}
        onSelect={setGroup}
        wrap
      />

      <div className="admin__scroll">
        <table className="admin__table admin__table--cards">
          <thead>
            <tr>
              <th scope="col">{isWeapon || isArmor || ringKind ? '段階と名前' : group === 'information' ? '聞くこと' : group === 'ringExtra' ? '設定' : '名前'}</th>
              {isWeapon && <th scope="col">攻撃力</th>}
              {isWeapon && <th scope="col">魔力</th>}
              {isArmor && <th scope="col">守り</th>}
              {ringKind && <th scope="col">耐性（%）</th>}
              {group !== 'ringExtra' && <th scope="col">値段（G）</th>}
            </tr>
          </thead>
          <tbody>
            {(isWeapon || isArmor) &&
              (isWeapon ? draft.weapons[group as WeaponBaseId] : draft.armors[group as ArmorBaseId]).map((t, i) => {
                const g = group as WeaponBaseId | ArmorBaseId;
                const b = (isWeapon ? base.weapons[g as WeaponBaseId][i] : base.armors[g as ArmorBaseId][i]) as Record<string, unknown> | undefined;
                const rec = t as Record<string, number | string>;
                return (
                  <tr key={i}>
                    <th scope="row">
                      <span className="admin__who">
                        <ItemIcon id={gearId(g, i + 1) as ItemId} size={24} />
                        <span className="admin__id">{i + 1}段目</span>
                        <TextField value={t.name} rule={nameRule(t.name)} changed={t.name !== b?.name} label={`${i + 1}段目の名前`} onChange={(v) => setTier(g, i, { name: v })} />
                      </span>
                    </th>
                    {(isWeapon ? (['atk', 'mag'] as const) : (['def'] as const)).map((k) => (
                      <td key={k} data-label={{ atk: '攻撃力', mag: '魔力', def: '守り' }[k]} className="admin__c2">
                        <NumberField
                          value={rec[k] as number}
                          min={ITEM_LIMITS[k].min}
                          max={ITEM_LIMITS[k].max}
                          changed={rec[k] !== b?.[k]} base={b?.[k] as number | undefined}
                          label={`${t.name}の${{ atk: '攻撃力', mag: '魔力', def: '守り' }[k]}`}
                          onChange={(v) => setTier(g, i, { [k]: v })}
                        />
                      </td>
                    ))}
                    <td data-label="値段（G）" className="admin__c2">
                      <NumberField
                        value={t.price}
                        min={ITEM_LIMITS.price.min}
                        max={ITEM_LIMITS.price.max}
                        jump={10}
                        changed={t.price !== b?.price} base={b?.price as number | undefined}
                        label={`${t.name}の値段`}
                        onChange={(v) => setTier(g, i, { price: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            {ringKind &&
              draft.rings.kinds[ringKind].map((t, i) => {
                const b = base.rings.kinds[ringKind][i];
                return (
                  <tr key={i}>
                    <th scope="row">
                      <span className="admin__who">
                        <ItemIcon id={ringId(ringKind, i + 1)} size={24} />
                        <span className="admin__id">{i + 1}段目</span>
                        <TextField value={t.name} rule={nameRule(t.name)} changed={t.name !== b?.name} label={`${RING_INFO[ringKind].label}の${i + 1}段目の名前`} onChange={(v) => setRing(ringKind, i, { name: v })} />
                      </span>
                    </th>
                    <td data-label="耐性（%）" className="admin__c2">
                      <NumberField
                        value={t.cut}
                        min={ITEM_LIMITS.cut.min}
                        max={ITEM_LIMITS.cut.max}
                        changed={t.cut !== b?.cut}
                        base={b?.cut}
                        label={`${t.name}の耐性`}
                        onChange={(v) => setRing(ringKind, i, { cut: v })}
                      />
                    </td>
                    <td data-label="値段（G）" className="admin__c2">
                      <NumberField
                        value={t.price}
                        min={ITEM_LIMITS.price.min}
                        max={ITEM_LIMITS.price.max}
                        jump={10}
                        changed={t.price !== b?.price}
                        base={b?.price}
                        label={`${t.name}の値段`}
                        onChange={(v) => setRing(ringKind, i, { price: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            {group === 'ringExtra' && (
              <>
                <tr>
                  <th scope="row">逆の属性の弱点（耐性の何%分、ダメージが増えるか）</th>
                  <td data-label="大きさ（%）" className="admin__c2">
                    <NumberField
                      value={draft.rings.weak}
                      min={ITEM_LIMITS.weak.min}
                      max={ITEM_LIMITS.weak.max}
                      changed={draft.rings.weak !== base.rings.weak}
                      base={base.rings.weak}
                      label="指輪の弱点の大きさ"
                      onChange={(v) => setDraft((d) => ({ ...d, rings: { ...d.rings, weak: v } }))}
                    />
                  </td>
                </tr>
                {Array.from({ length: RING_LEVELS }, (_, i) => (
                  <tr key={i}>
                    <th scope="row">二重耐性の指輪の{i + 1}段目の耐性（%。敵が落とす。買えない）</th>
                    <td data-label="耐性（%）" className="admin__c2">
                      <NumberField
                        value={draft.rings.dualCut[i]!}
                        min={ITEM_LIMITS.cut.min}
                        max={ITEM_LIMITS.cut.max}
                        changed={draft.rings.dualCut[i] !== base.rings.dualCut[i]}
                        base={base.rings.dualCut[i]}
                        label={`二重耐性の指輪の${i + 1}段目の耐性`}
                        onChange={(v) => setDraft((d) => ({ ...d, rings: { ...d.rings, dualCut: d.rings.dualCut.map((c, j) => (j === i ? v : c)) } }))}
                      />
                    </td>
                  </tr>
                ))}
              </>
            )}
            {(group === 'supplies' || group === 'spellbooks') &&
              (group === 'supplies' ? SUPPLY_IDS : SPELLBOOK_IDS).map((id) => {
                const t = (draft[group] as Record<string, PlainItem>)[id]!;
                const b = (base[group] as Record<string, PlainItem>)[id];
                return (
                  <tr key={id}>
                    <th scope="row">
                      <span className="admin__who">
                        <ItemIcon id={id} size={24} />
                        <TextField value={t.name} rule={nameRule(t.name)} changed={t.name !== b?.name} label={`${id} の名前`} onChange={(v) => setPlain(group, id, { name: v })} />
                      </span>
                    </th>
                    <td data-label="値段（G）" className="admin__c6">
                      <NumberField
                        value={t.price}
                        min={ITEM_LIMITS.price.min}
                        max={ITEM_LIMITS.price.max}
                        jump={10}
                        changed={t.price !== b?.price} base={b?.price}
                        label={`${t.name}の値段`}
                        onChange={(v) => setPlain(group, id, { price: v })}
                      />
                    </td>
                  </tr>
                );
              })}
            {group === 'information' &&
              INFO_TOPICS.map((t) => (
                <tr key={t}>
                  <th scope="row">{INFO_LABELS[t]}</th>
                  <td data-label="情報料（G）" className="admin__c6">
                    <NumberField
                      value={draft.information[t]}
                      min={ITEM_LIMITS.info.min}
                      max={ITEM_LIMITS.info.max}
                      jump={10}
                      changed={draft.information[t] !== base.information[t]} base={base.information[t]}
                      label={`${INFO_LABELS[t]}の情報料`}
                      onChange={(v) => setDraft((d) => ({ ...d, information: { ...d.information, [t]: v } }))}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
