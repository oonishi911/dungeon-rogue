// 管理画面の「品物」タブ：店で売るすべての品物の名前と値段、武器と防具の段階ごとの性能を変える（src/game/items.json）。
// 武器・防具は種類ごとに10段階。上の段階ほど高く、強くする（下の段より安い・弱い段は、公開の欄の「直すところ」に出る）。

import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ARMOR_BASES,
  ARMOR_INFO,
  gearId,
  ITEM_LIMITS,
  SPELLBOOK_IDS,
  SUPPLY_IDS,
  WEAPON_BASES,
  WEAPON_INFO,
  type ArmorBaseId,
  type ItemMaster,
  type PlainItem,
  type WeaponBaseId,
} from '../game/itemMaster';
import type { ItemId } from '../game/types';
import { AdminTabs, NumberField, TextField } from './adminParts';
import { ItemIcon } from './ItemIcon';

type Group = WeaponBaseId | ArmorBaseId | 'supplies' | 'spellbooks';

const GROUPS: { id: Group; label: string }[] = [
  ...WEAPON_BASES.map((b) => ({ id: b as Group, label: WEAPON_INFO[b].label })),
  ...ARMOR_BASES.map((b) => ({ id: b as Group, label: ARMOR_INFO[b].label })),
  { id: 'supplies', label: '道具' },
  { id: 'spellbooks', label: '呪文書' },
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
      g === 'supplies' ? m.supplies : g === 'spellbooks' ? m.spellbooks : (WEAPON_BASES as readonly string[]).includes(g) ? m.weapons[g as WeaponBaseId] : m.armors[g as ArmorBaseId];
    return JSON.stringify(pick(base)) !== JSON.stringify(pick(draft));
  };

  return (
    <section className="admin__section" role="tabpanel" id="admin-items-panel" aria-labelledby="admin-items-tab">
      <h2 className="admin__heading">品物</h2>
      <p className="admin__note">
        店で売る品物の名前と値段です。武器と防具は種類ごとに10段階あり、段階ごとに性能も決めます（武器：攻撃力。防具：守り＝受けるダメージから引く数と、効く属性のダメージを何%に減らすか）。
        店には、プレイヤーが持っているいちばん上の段階の2つ上までが並びます。上の段階ほど高く、強くしてください。
        武器と体質の相性、防具の効く属性、道具の働き（回復量など）は変えられません。
      </p>

      <AdminTabs
        label="品物の種類"
        idPrefix="items"
        tabs={GROUPS.map((g) => ({ id: g.id, label: g.label, changed: changedGroup(g.id) }))}
        current={group}
        onSelect={setGroup}
      />

      <div className="admin__scroll">
        <table className="admin__table">
          <thead>
            <tr>
              <th scope="col">{isWeapon || isArmor ? '段階と名前' : '名前'}</th>
              {isWeapon && <th scope="col">攻撃力</th>}
              {isArmor && <th scope="col">守り</th>}
              {isArmor && <th scope="col">ダメージの割合（%）</th>}
              <th scope="col">値段（G）</th>
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
                    {(isWeapon ? (['atk'] as const) : (['def', 'rate'] as const)).map((k) => (
                      <td key={k}>
                        <NumberField
                          value={rec[k] as number}
                          min={ITEM_LIMITS[k].min}
                          max={ITEM_LIMITS[k].max}
                          changed={rec[k] !== b?.[k]}
                          label={`${t.name}の${{ atk: '攻撃力', def: '守り', rate: 'ダメージの割合' }[k]}`}
                          onChange={(v) => setTier(g, i, { [k]: v })}
                        />
                      </td>
                    ))}
                    <td>
                      <NumberField
                        value={t.price}
                        min={ITEM_LIMITS.price.min}
                        max={ITEM_LIMITS.price.max}
                        changed={t.price !== b?.price}
                        label={`${t.name}の値段`}
                        onChange={(v) => setTier(g, i, { price: v })}
                      />
                    </td>
                  </tr>
                );
              })}
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
                    <td>
                      <NumberField
                        value={t.price}
                        min={ITEM_LIMITS.price.min}
                        max={ITEM_LIMITS.price.max}
                        changed={t.price !== b?.price}
                        label={`${t.name}の値段`}
                        onChange={(v) => setPlain(group, id, { price: v })}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
