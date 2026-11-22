// マップ上の敵：配置・能力・移動の経路。
// 敵の手番の進め方（気付く・追う・攻撃する）は explore.ts にある。

import { phaseAtkRate, phaseBehaviors } from './bossPhase';
import { enemyBase } from './data';
import type { EnemySettings } from './genMaster';
import { DIRS, tileAt, type FloorMap, type Pos, type Room } from './map';
import { nextInt, nextRandom } from './rng';
import type { Dir } from './exploreTypes';
import type { EnemyBehavior, EnemyDef, EnemyId } from './types';

// 数値はすべて仮。バランス調整で見直す
export const ENEMY_CONFIG = {
  density: 0.0075, // 通路1マスあたりの通常の敵の数（40×40で6〜7体）
  safeDistance: 8, // 入口からこのマス数以内には通常の敵を置かない
  sight: 5, // 敵の視界の半径
  loseTurns: 5, // 見失ってから、うろつきに戻るまでのターン数
  wanderMoveChance: 0.6, // うろついているとき、1ターンに動く確率
  surpriseMultiplier: 2, // 不意打ちのダメージ倍率
  backAttackChance: 0.5, // 通常の敵から離れたとき、背後から攻撃される確率（強敵は必ず）
  eliteHpRate: 2, // 強敵の能力は、元の敵の何倍か
  eliteAtkRate: 1.5,
  eliteRoam: 2, // 強敵が気付いていないとき、持ち場から何マスまでうろつくか（縦横それぞれ）
  eliteLeash: 6, // 強敵が追うとき、持ち場から何マスまで離れるか（それより先へは行かず、あきらめて持ち場へ戻る）
  chaseSearchLimit: 40, // 追いかけるときの経路探索の最大距離
  // 行動の個性（types.ts の EnemyBehavior。詳しい決まりは enemyBehavior.ts）
  rangedRange: 4, // 遠距離：まっすぐこのマス数以内で撃ってくる（2マス以上離れているとき）
  rangedRate: 0.8, // 遠距離のダメージは、ふつうの攻撃のこの倍率
  retreatCool: 2, // 遠距離：下がったあと、次に下がれるまでのターン数（そのあいだは近づかれたら殴る。いつまでも逃げ続けて、決着がつかなくなるのを防ぐ）
  chargeRange: 3, // 突進：まっすぐこのマス数以内にいると、構える（2マス以上離れているとき）
  chargeRun: 5, // 突進：走る距離の最大（マス）
  chargeRate: 1.5, // 突進が命中したときのダメージは、ふつうの攻撃のこの倍率
  chargeCool: 2, // 突進のあと、次に構えるまで待つターン数
  chargeStun: 1, // 壁にぶつかって動けなくなるターン数
  shieldCut: 0.7, // 盾持ち：正面からの武器の攻撃を、この割合カットする
  summonEvery: 5, // 召喚：何ターンごとに呼ぶか
  summonMax: 2, // 召喚：同時に出していられる数
  ambushRange: 2, // 待ち伏せ：気付かれていないあいだ、このマス数以内に近づかれると襲いかかる（ふつうの敵の視界は sight）
  alarmRange: 5, // 見張り：気付いて叫んだとき、このマス数以内（縦横斜め。壁ごしでも届く）の仲間も気付く
  alarmMax: 3, // 見張り：1回の叫びで気付かせる仲間の数の上限（近い順。敵が密集した階で、部屋じゅうが一度に押し寄せないように）
} as const;

/**
 * 敵の状態。
 * wander：気付いていない（不意打ちできる） / chase：追っている / search：見失って探している
 */
export type EnemyMode = 'wander' | 'chase' | 'search';

export interface MapEnemy {
  uid: number;
  id: EnemyId;
  elite: boolean; // 強敵（とボス）は、離れようとすると必ず背後から攻撃してくる。強敵は持ち場（home）の近くを守り、ボスは歩いて追ってくる
  pos: Pos;
  hp: number;
  mode: EnemyMode;
  justNoticed: boolean; // このターンに気付いた（「！」を強調して表示する）
  lastSeen: Pos | null; // 最後にプレイヤーを見た場所
  searchTurns: number; // search のとき、あと何ターン探すか
  room?: Room; // 気付くまでは、この部屋の中だけを歩く（部屋に置いた敵で、設定の stayInRoom がオンのとき）
  stun?: number; // 動けないターンの残り（強衝撃。あるあいだは、気付くことも、動くことも、攻撃することもしない）
  bleed?: { amount: number; turns: number }; // 出血（烈なぎ払い）。あと何ターン、1ターンにいくつのダメージを受けるか
  home?: Pos; // 強敵の持ち場（置かれた場所）。この近くをうろつき、追っても離れすぎると持ち場へ戻る
  facing?: Dir; // 最後に歩いた向き（盾持ちの正面。ない敵は下向きとして扱う）
  charge?: Dir; // 突進の構え中：この向きへ、次のターンに走る
  cool?: number; // 突進のあと、次に構えられるまでのターン数
  summonIn?: number; // 召喚まであと何ターン（ない敵は、召喚の間隔から数え始める）
  summoned?: boolean; // 召喚された敵（倒しても報酬はなく、倒した数にも入れない）
  summonedBy?: number; // 呼んだ敵の uid（同時に出していられる数を数えるため）
  burn?: { turns: number; amount: number }; // 燃焼（炎の呪文・炎の砥石）。あと何ターン、1ターンにいくつのダメージを受けるか（foeStatus.ts）
  frozen?: boolean; // 凍結（氷の呪文・氷の砥石）。動けないターンは stun で数える（stun が切れると解ける）。ハンマーで殴ると砕ける
  chilled?: boolean; // 霜の床の上で、次の1歩のために1ターン使った（次のターンに歩ける）
  phase?: number; // ボスの段階（1〜3。ない敵は1。bossPhase.ts）
  power?: EnemyPower; // 強さの倍率（ダンジョンと階で決まる。powerAt）。ない敵は1倍（できる前の中断データ）
}

/** 敵のHP・攻撃の倍率（1：敵の設定 enemies.json のまま） */
export interface EnemyPower {
  hp: number;
  atk: number;
}

/**
 * その階の敵の強さ（floor は0から数えた階。ボス階は階の数と同じ）。settings はダンジョンの設定の enemies。
 * 1階目は hpRate・atkRate 倍で、1階深くなるごとに floorHpRate・floorAtkRate ずつ増える
 */
export function powerAt(settings: Pick<EnemySettings, 'hpRate' | 'atkRate' | 'floorHpRate' | 'floorAtkRate'>, floor: number): EnemyPower {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { hp: round(settings.hpRate * (1 + settings.floorHpRate * floor)), atk: round(settings.atkRate * (1 + settings.floorAtkRate * floor)) };
}

/** 敵に強さの倍率を付け、HPをその強さでの満タンにする */
export function empower(enemy: MapEnemy, power: EnemyPower): MapEnemy {
  const e = { ...enemy, power };
  return { ...e, hp: enemyDef(e).hp };
}

/** 敵の行動の個性（なければ空） */
export const behaviorsOf = (def: Pick<EnemyDef, 'behaviors'>): readonly EnemyBehavior[] => def.behaviors ?? [];

/**
 * 実際に戦うときの敵の能力。敵のマスター（enemies.json）の値に、ダンジョンと階の強さ（power。HPと攻撃）を掛ける。
 * 強敵は、さらにHP・攻撃力を上げる（防御力はそのまま）。
 * ボスは、段階（phase）が上がるごとに攻撃力が上がり、行動の個性が加わる（bossPhase.ts）
 */
export function enemyDef(enemy: Pick<MapEnemy, 'id' | 'elite' | 'phase' | 'power'>): EnemyDef {
  const def = unscaledDef(enemy);
  const p = enemy.power;
  if (!p || (p.hp === 1 && p.atk === 1)) return def;
  // ダンジョンと階の強さ：HPと攻撃を掛ける（ボスの攻撃は、段階で上がるので、そのまま）
  return { ...def, hp: Math.max(1, Math.round(def.hp * p.hp)), atk: def.boss ? def.atk : Math.max(1, Math.round(def.atk * p.atk)) };
}

/** 強さの倍率を掛ける前の、敵の能力（強敵・ボスの段階は入っている） */
function unscaledDef(enemy: Pick<MapEnemy, 'id' | 'elite' | 'phase'>): EnemyDef {
  const base = enemyBase(enemy.id);
  if (base.boss) {
    const phase = enemy.phase ?? 1;
    if (phase <= 1) return base;
    return { ...base, atk: Math.round(base.atk * phaseAtkRate(phase)), behaviors: [...behaviorsOf(base), ...phaseBehaviors(enemy.id, phase)] };
  }
  if (!enemy.elite) return base;
  return {
    ...base,
    name: `${base.name}（強敵）`,
    hp: Math.round(base.hp * ENEMY_CONFIG.eliteHpRate),
    atk: Math.round(base.atk * ENEMY_CONFIG.eliteAtkRate),
  };
}

/** 道中に出る敵のうち、いちばん強いもの。強敵の元にする */
function strongestOf(pool: readonly EnemyId[]): EnemyId {
  return [...pool].sort((a, b) => enemyBase(b).hp * enemyBase(b).atk - enemyBase(a).hp * enemyBase(a).atk)[0]!;
}

/**
 * 階に敵を配置する。pool は道中に出る敵（ダンジョンの設定の encounters の、その属性の pool）。
 * 強敵はマップの「強敵」の行き止まりに置き、通常の敵は入口から離れた床にランダムに置く。
 * 数と置き方はダンジョンの設定（src/game/dungeons/*.json の enemies）で決める：数は amount 倍。置く場所は placement で、
 * 部屋にも通路にも（部屋の床は roomWeight 倍選ばれやすい）・部屋だけ・通路だけ。部屋が足りなければ置ける分だけ置く。
 * さらに、部屋ごとに nestChance の確率で「群れ部屋」にして、通常の敵とは別に nestMin〜nestMax 体をまとめて置く（通路だけのときは作らない）。
 * 入口から safeDistance マス以内には、どちらも置かない
 */
export function spawnEnemies(
  map: FloorMap,
  pool: readonly EnemyId[],
  rngState: number,
  firstUid: number,
  density: number,
  settings: EnemySettings,
): { enemies: MapEnemy[]; rngState: number } {
  let s = rngState;
  const enemies: MapEnemy[] = [];
  // マスごとの「どの部屋の中か」を先に調べておく（敵を1体置くたびに全部の部屋を調べ直すと、部屋の多い広い階でとても遅い）。
  // 部屋どうしは重ならないが、念のため、前の書き方と同じく、先に並んでいる部屋を選ぶ
  const roomIndex = new Int16Array(map.tiles.length).fill(-1);
  for (let i = map.rooms.length - 1; i >= 0; i--) {
    const r = map.rooms[i]!;
    for (let y = Math.max(0, r.y); y < Math.min(map.height, r.y + r.height); y++) {
      roomIndex.fill(i, y * map.width + Math.max(0, r.x), y * map.width + Math.min(map.width, r.x + r.width));
    }
  }
  const inMap = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const roomAt = (p: Pos) => (inMap(p) ? map.rooms[roomIndex[p.y * map.width + p.x]!] : undefined);
  const make = (id: EnemyId, pos: Pos, elite: boolean): MapEnemy => {
    const room = !elite && settings.stayInRoom ? roomAt(pos) : undefined;
    return {
      uid: firstUid + enemies.length,
      id,
      elite,
      pos,
      hp: enemyDef({ id, elite }).hp,
      mode: 'wander',
      justNoticed: false,
      lastSeen: null,
      searchTurns: 0,
      ...(room ? { room: { ...room } } : {}),
      ...(elite ? { home: { ...pos } } : {}),
    };
  };

  const occupied = new Set<string>([key(map.start), ...(map.stairs ? [key(map.stairs)] : [])]);
  for (const f of map.features) {
    occupied.add(key(f.pos));
    if (f.kind === 'elite') enemies.push(make(strongestOf(pool), f.pos, true));
  }

  const candidates: Pos[] = [];
  map.tiles.forEach((t, i) => {
    const pos = { x: i % map.width, y: Math.floor(i / map.width) };
    if (t !== 'floor' || occupied.has(key(pos))) return;
    if (Math.abs(pos.x - map.start.x) + Math.abs(pos.y - map.start.y) <= ENEMY_CONFIG.safeDistance) return;
    candidates.push(pos);
  });
  const floorCount = map.tiles.filter((t) => t === 'floor').length;
  const count = Math.min(candidates.length, Math.round(floorCount * density * settings.amount));
  // 場所の選ばれやすさ（0 の場所には置かない）。部屋にも通路にも置くとき、部屋の床は roomWeight、通路の床は1
  const roomWeight = { mixed: settings.roomWeight, rooms: 1, corridors: 0 }[settings.placement];
  const corridorWeight = settings.placement === 'rooms' ? 0 : 1;
  const weights = candidates.map((p) => (roomAt(p) ? roomWeight : corridorWeight));
  const even = roomWeight === 1 && corridorWeight === 1; // どこも同じなら、前と同じ選び方（同じシードなら同じ配置）
  for (let n = 0; n < count; n++) {
    let index: number;
    if (even) {
      const pick = nextInt(s, candidates.length);
      s = pick.state;
      index = pick.value;
    } else {
      const total = weights.reduce((a, w) => a + w, 0);
      if (total <= 0) break;
      const r = nextRandom(s);
      s = r.state;
      let left = r.value * total;
      index = weights.findIndex((w) => (left -= w) < 0);
      if (index < 0) index = weights.length - 1;
    }
    const kind = nextInt(s, pool.length);
    s = kind.state;
    const [pos] = candidates.splice(index, 1);
    weights.splice(index, 1);
    enemies.push(make(pool[kind.value]!, pos!, false));
  }

  // 群れ部屋：部屋ごとに確率で決め、部屋の中の空いている床に、まとめて置く
  if (settings.nestChance > 0 && settings.placement !== 'corridors') {
    for (const room of map.rooms) {
      const roll = nextRandom(s);
      s = roll.state;
      if (roll.value >= settings.nestChance) continue;
      const size = nextInt(s, settings.nestMax - settings.nestMin + 1);
      s = size.state;
      // この部屋の中の、空いている床（candidates の中の番号。小さい順）
      const free = candidates.flatMap((p, i) => (roomAt(p) === room ? [i] : []));
      for (let n = 0; n < settings.nestMin + size.value; n++) {
        if (free.length === 0) break;
        const pick = nextInt(s, free.length);
        const kind = nextInt(pick.state, pool.length);
        s = kind.state;
        const [pos] = candidates.splice(free[pick.value]!, 1);
        // 置いたマスを空きから外し、それより後ろの番号を1つずつ詰める（candidates から1つ抜いたので）
        free.splice(pick.value, 1);
        for (let k = pick.value; k < free.length; k++) free[k]!--;
        enemies.push(make(pool[kind.value]!, pos!, false));
      }
    }
  }
  return { enemies, rngState: s };
}

/**
 * ボス階のボス（id はダンジョンの設定の encounters の、その属性の boss）。背後から必ず攻撃してくる点は強敵と同じなので elite として扱う。
 * 強敵とちがって歩く：気付くまではボスの部屋（room）の中をうろつき、気付いたら追ってくる
 */
export function spawnBoss(pos: Pos, id: EnemyId, uid: number, room?: Room): MapEnemy {
  return {
    uid,
    id,
    elite: true,
    pos,
    hp: enemyBase(id).hp,
    mode: 'wander',
    justNoticed: false,
    lastSeen: null,
    searchTurns: 0,
    ...(room ? { room: { ...room } } : {}),
  };
}

/** ボスの部屋で、ボスや入口から離しておく距離（マス。斜めも1と数える） */
const MINION_CLEARANCE = { boss: 2, start: 4 } as const;

/**
 * ボスの部屋に置く雑魚敵（pool はその属性の道中の敵）。部屋の床から、ボスのまわりと入口の近くを除いて、ばらばらに count 体置く。
 * stayInRoom なら、気付くまでは部屋の中だけを歩く
 */
export function spawnBossMinions(
  map: FloorMap,
  pool: readonly EnemyId[],
  count: number,
  rngState: number,
  firstUid: number,
  stayInRoom: boolean,
): { enemies: MapEnemy[]; rngState: number } {
  const room = map.rooms[0];
  if (!room || !map.boss || pool.length === 0 || count <= 0) return { enemies: [], rngState };
  const far = (p: Pos, q: Pos, d: number) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) > d;
  const free: Pos[] = [];
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      const p = { x, y };
      if (map.tiles[y * map.width + x] === 'floor' && far(p, map.boss, MINION_CLEARANCE.boss) && far(p, map.start, MINION_CLEARANCE.start)) free.push(p);
    }
  }
  const enemies: MapEnemy[] = [];
  let s = rngState;
  for (let i = 0; i < count && free.length > 0; i++) {
    const spot = nextInt(s, free.length);
    const kind = nextInt(spot.state, pool.length);
    s = kind.state;
    const pos = free.splice(spot.value, 1)[0]!;
    const id = pool[kind.value]!;
    enemies.push({
      uid: firstUid + i,
      id,
      elite: false,
      pos,
      hp: enemyDef({ id, elite: false }).hp,
      mode: 'wander',
      justNoticed: false,
      lastSeen: null,
      searchTurns: 0,
      ...(stayInRoom ? { room: { ...room } } : {}),
    });
  }
  return { enemies, rngState: s };
}

/**
 * from から to へ向かう最短路の最初の1歩。blocked のマスは通れない（to 自体は通れる扱い）。
 * 届かない・遠すぎるときは null。
 */
export function nextStepToward(map: FloorMap, from: Pos, to: Pos, blocked: ReadonlySet<string>): Pos | null {
  if (from.x === to.x && from.y === to.y) return null;
  // マスは番号（y × 幅 + x）で扱う（文字列の鍵で調べるより速い）
  const { width, height, tiles } = map;
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const parent = new Int32Array(width * height).fill(-1); // そのマスへ来る前のマス。-1 はまだ来ていない
  const dist = new Int32Array(width * height);
  parent[start] = start;
  const queue = new Int32Array(width * height);
  queue[0] = start;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const at = queue[head]!;
    const d = dist[at]!;
    if (d >= ENEMY_CONFIG.chaseSearchLimit) continue;
    const x = at % width;
    const y = (at - x) / width;
    for (const step of DIRS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (parent[n] !== -1 || tiles[n] === 'wall') continue;
      if (n !== goal && blocked.has(`${nx},${ny}`)) continue;
      dist[n] = d + 1;
      parent[n] = at;
      if (n === goal) {
        // ゴールからたどって、from の次のマスを返す
        let cur = n;
        while (parent[cur] !== start) cur = parent[cur]!;
        return { x: cur % width, y: Math.floor(cur / width) };
      }
      queue[tail++] = n;
    }
  }
  return null;
}

/** うろつき：一定の確率で、空いている隣の通路へランダムに動く */
export function wanderStep(
  map: FloorMap,
  from: Pos,
  blocked: ReadonlySet<string>,
  rngState: number,
  area?: Room, // あれば、この部屋の外へは出ない
): { pos: Pos; rngState: number } {
  const move = nextRandom(rngState);
  if (move.value >= ENEMY_CONFIG.wanderMoveChance) return { pos: from, rngState: move.state };
  const inArea = (p: Pos) => !area || (p.x >= area.x && p.x < area.x + area.width && p.y >= area.y && p.y < area.y + area.height);
  const open = neighbors(from).filter((n) => tileAt(map, n) === 'floor' && !blocked.has(key(n)) && (!inArea(from) || inArea(n)));
  if (open.length === 0) return { pos: from, rngState: move.state };
  const pick = nextInt(move.state, open.length);
  return { pos: open[pick.value]!, rngState: pick.state };
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function key(p: Pos): string {
  return `${p.x},${p.y}`;
}

function neighbors(p: Pos): Pos[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
  ];
}

/** 強敵が、気付いていないときにうろつく範囲（持ち場を中心にした四角） */
export function eliteArea(home: Pos): Room {
  const r = ENEMY_CONFIG.eliteRoam;
  return { x: home.x - r, y: home.y - r, width: r * 2 + 1, height: r * 2 + 1 };
}

/** 持ち場からの距離（縦横の大きい方） */
export function fromHome(home: Pos, p: Pos): number {
  return Math.max(Math.abs(p.x - home.x), Math.abs(p.y - home.y));
}
