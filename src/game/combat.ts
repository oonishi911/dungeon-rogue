// ターン制戦闘のロジック。
// 1ラウンド = プレイヤーの行動 → 敵の攻撃 → 毒のダメージ。
// 準備フェーズで揃えた装備（耐性）がダメージ計算に直接効く。

import { COMBAT_CONFIG as C, ENEMIES, ITEMS } from './data';
import type {
  CombatAction,
  CombatState,
  EnemyDef,
  EnemyId,
  ItemId,
  PlayerStats,
  Result,
} from './types';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * 持ち込んだアイテムからプレイヤーの能力を作る。
 * 武器・防具は1つずつ装備。防具を複数持っている場合は armorChoice で選ぶ（省略時は最初の1つ）。
 */
export function buildPlayer(loadout: readonly ItemId[], armorChoice?: ItemId): PlayerStats {
  const weapon = loadout.find((id) => ITEMS[id].slot === 'weapon') ?? null;
  const armors = loadout.filter((id) => ITEMS[id].slot === 'armor');
  const armor = armorChoice && armors.includes(armorChoice) ? armorChoice : (armors[0] ?? null);

  return {
    hp: C.playerHp,
    maxHp: C.playerHp,
    atk: C.playerAtk + (weapon === 'iron_sword' ? C.swordAtk : 0),
    def: C.playerDef,
    poisonTurns: 0,
    weapon,
    armor,
    consumables: loadout.filter((id) => ITEMS[id].slot === 'consumable'),
  };
}

export function startCombat(player: PlayerStats, enemyId: EnemyId): CombatState {
  const enemy = ENEMIES[enemyId];
  return {
    player,
    enemy: { id: enemyId, hp: enemy.hp },
    round: 1,
    outcome: 'ongoing',
    log: [`${enemy.name}が現れた`],
  };
}

/** 敵の攻撃1回でプレイヤーが受けるダメージ（耐性込み） */
export function enemyHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  const base = Math.max(1, enemy.atk - player.def);
  if (enemy.element === 'fire' && resists(player, 'fire')) {
    return Math.max(1, Math.ceil(base * C.fireResistRate));
  }
  return base;
}

/** プレイヤーの攻撃1回で敵が受けるダメージ */
export function playerHitDamage(player: PlayerStats, enemy: EnemyDef): number {
  return Math.max(1, player.atk - enemy.def);
}

/** 1ラウンド進める */
export function act(state: CombatState, action: CombatAction): Result<CombatState> {
  if (state.outcome !== 'ongoing') return err('戦闘は終わっています');

  const enemyDef = ENEMIES[state.enemy.id];
  let player = state.player;
  let enemyHp = state.enemy.hp;
  const log: string[] = [];

  // --- プレイヤーの行動 ---
  switch (action.kind) {
    case 'attack': {
      const dmg = playerHitDamage(player, enemyDef);
      enemyHp -= dmg;
      log.push(`${enemyDef.name}に${dmg}のダメージ`);
      break;
    }
    case 'use_item': {
      const index = player.consumables.indexOf(action.item);
      if (index === -1) return err('そのアイテムは持っていません');
      const consumables = player.consumables.filter((_, i) => i !== index);

      switch (action.item) {
        case 'potion': {
          const hp = Math.min(player.maxHp, player.hp + C.potionHeal);
          log.push(`回復薬でHPが${hp - player.hp}回復`);
          player = { ...player, hp, consumables };
          break;
        }
        case 'antidote': {
          log.push('毒消しで毒が治った');
          player = { ...player, poisonTurns: 0, consumables };
          break;
        }
        case 'frost_scroll': {
          const dmg = enemyDef.element === 'fire' ? C.frostVsFire : C.frostVsOther;
          enemyHp -= dmg;
          log.push(`氷の巻物で${enemyDef.name}に${dmg}のダメージ`);
          player = { ...player, consumables };
          break;
        }
        default:
          return err('戦闘中に使えないアイテムです');
      }
      break;
    }
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }

  if (enemyHp <= 0) {
    log.push(`${enemyDef.name}を倒した`);
    return ok(finish(state, player, 0, 'won', log));
  }

  // --- 敵の攻撃 ---
  const dmg = enemyHitDamage(player, enemyDef);
  player = { ...player, hp: player.hp - dmg };
  log.push(
    enemyDef.element === 'fire' && resists(player, 'fire')
      ? `${enemyDef.name}の炎！ 耐火のマントで軽減して${dmg}のダメージ`
      : `${enemyDef.name}の攻撃で${dmg}のダメージ`,
  );

  if (enemyDef.element === 'poison') {
    if (resists(player, 'poison')) {
      log.push('防毒のマントが毒を防いだ');
    } else {
      player = { ...player, poisonTurns: C.poisonTurns };
      log.push('毒にかかった');
    }
  }

  // --- 毒のダメージ ---
  if (player.poisonTurns > 0) {
    player = { ...player, hp: player.hp - C.poisonDamage, poisonTurns: player.poisonTurns - 1 };
    log.push(`毒で${C.poisonDamage}のダメージ`);
  }

  if (player.hp <= 0) {
    log.push('力尽きた…');
    return ok(finish(state, { ...player, hp: 0 }, enemyHp, 'lost', log));
  }

  return ok(finish(state, player, enemyHp, 'ongoing', log));
}

function resists(player: PlayerStats, trait: 'fire' | 'poison'): boolean {
  return player.armor !== null && ITEMS[player.armor].resist === trait;
}

function finish(
  state: CombatState,
  player: PlayerStats,
  enemyHp: number,
  outcome: CombatState['outcome'],
  log: string[],
): CombatState {
  return {
    player,
    enemy: { ...state.enemy, hp: Math.max(0, enemyHp) },
    round: outcome === 'ongoing' ? state.round + 1 : state.round,
    outcome,
    log: [...state.log, ...log],
  };
}
