import { bestLoadout } from '../game/bestLoadout';
import { dungeonOf } from '../game/dungeons';
import { startExplore } from '../game/explore';
import { ExploreScreen } from './ExploreScreen';
import { DEV_LOADOUT, devFoes, devSick, newSeed, urlBest, urlDungeon, urlSeed, urlTrait } from './exploreDev';

/**
 * 開発用：ダンジョンを選ばずに探索だけを試す。?seed=・?trait=・?dungeon= で条件を指定できる。
 * ?poison=3&chill=2 なら、毒・鈍足にかかった状態で始める（状態異常の見た目の確認用）。?foeburn=3&foefreeze=2 なら、近くの敵が燃焼・凍結した状態で始める。
 * ?best=1 なら、そのダンジョンの特性に合わせて、いちばん強い装備・道具・呪文書で始める（bestLoadout.ts）
 */
export function ExploreDevScreen() {
  return (
    <ExploreScreen
      devBest={urlBest}
      start={() => {
        const seed = Number.isInteger(urlSeed) && urlSeed > 0 ? urlSeed : newSeed();
        const dungeon = urlDungeon;
        if (!urlBest) return devFoes(devSick(startExplore(seed, { dungeon, loadout: DEV_LOADOUT, trait: urlTrait })));
        // 特性を決めてから、その特性に合う装備で始め直す（同じシードなら同じダンジョン）
        const trait = urlTrait ?? startExplore(seed, { dungeon }).trait;
        return devFoes(devSick(startExplore(seed, { dungeon, loadout: bestLoadout(trait, dungeonOf(dungeon)), trait })));
      }}
    />
  );
}
