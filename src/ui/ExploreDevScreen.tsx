import { bestLoadout } from '../game/bestLoadout';
import { dungeonOf } from '../game/dungeons';
import { startExplore } from '../game/explore';
import { ExploreScreen } from './ExploreScreen';
import { DEV_LOADOUT, newSeed, urlBest, urlDungeon, urlSeed, urlTrait } from './exploreDev';

/**
 * 開発用：ダンジョンを選ばずに探索だけを試す。?seed=・?trait=・?dungeon= で条件を指定できる。
 * ?best=1 なら、そのダンジョンの特性に合わせて、いちばん強い装備・道具・呪文書で始める（bestLoadout.ts）
 */
export function ExploreDevScreen() {
  return (
    <ExploreScreen
      devBest={urlBest}
      start={() => {
        const seed = Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed();
        const dungeon = urlDungeon;
        if (!urlBest) return startExplore(seed, { dungeon, loadout: DEV_LOADOUT, trait: urlTrait });
        // 特性を決めてから、その特性に合う装備で始め直す（同じシードなら同じダンジョン）
        const trait = urlTrait ?? startExplore(seed, { dungeon }).trait;
        return startExplore(seed, { dungeon, loadout: bestLoadout(trait, dungeonOf(dungeon)), trait });
      }}
    />
  );
}
