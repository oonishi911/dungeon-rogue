// 開発用の管理画面。?view=admin で開く（?view=enemies と ?view=gen も、同じ画面の合うタブを開く）。
// 敵のマスターデータ（src/game/enemies.json）とダンジョンの設定（src/game/dungeonGen.json）を、タブで分けて1つの画面で変えられる：
// 敵／ダンジョンに出る敵／階の数・広さ・満腹度／小部屋／敵の数と置き方／レベルと強敵の報酬／魔法。
// 変えた内容は「変更を公開」でまとめてリポジトリに保存され（変えたファイルを、1回のコミットで）、自動チェックが通れば数分で公開版に反映される

import { useMemo, useState } from 'react';
import {
  ADMIN_TABS,
  adminTabFromUrl,
  adminTabUrl,
  copyJson,
  planPublish,
  showsPreview,
  tabChanged,
  type AdminData,
  type AdminTab,
} from '../game/adminScreen';
import { ENEMY_MASTER } from '../game/data';
import type { EnemyMaster } from '../game/enemyMaster';
import { GEN_SETTINGS, type GenSettings } from '../game/genMaster';
import { AdminTabs, PublishPanel, usePublish } from './adminParts';
import { EnemiesPanel, PoolPanel } from './EnemyPanels';
import { FloorsPanel, GrowthPanel, MagicPanel, PlacementPanel, PreviewSection, RoomsPanel } from './GenPanels';

export function Admin() {
  // base：今公開されている（この画面を開いたときの）データ。draft：画面で変えているデータ
  const [enemyBase, setEnemyBase] = useState<EnemyMaster>(() => copyJson(ENEMY_MASTER));
  const [enemyDraft, setEnemyDraft] = useState<EnemyMaster>(() => copyJson(ENEMY_MASTER));
  const [genBase, setGenBase] = useState<GenSettings>(() => copyJson(GEN_SETTINGS));
  const [genDraft, setGenDraft] = useState<GenSettings>(() => copyJson(GEN_SETTINGS));
  const [tab, setTab] = useState<AdminTab>(() => adminTabFromUrl(window.location.search));
  const [rank, setRank] = useState(1);
  const [seed, setSeed] = useState(1);
  const publisher = usePublish();

  const base = useMemo<AdminData>(() => ({ enemies: enemyBase, gen: genBase }), [enemyBase, genBase]);
  const draft = useMemo<AdminData>(() => ({ enemies: enemyDraft, gen: genDraft }), [enemyDraft, genDraft]);
  const plan = useMemo(() => planPublish(base, draft), [base, draft]);

  const select = (next: AdminTab) => {
    setTab(next);
    // 読み込み直しても同じタブが開くように、住所に残す（履歴は増やさない）
    window.history.replaceState(window.history.state, '', adminTabUrl(window.location.href, next));
  };
  const onPublish = () => {
    if (plan.problems.length || !plan.files.length) return;
    void publisher.send(plan.files, plan.message, () => {
      setEnemyBase(copyJson(enemyDraft));
      setGenBase(copyJson(genDraft));
    });
  };
  const onReset = () => {
    setEnemyDraft(copyJson(enemyBase));
    setGenDraft(copyJson(genBase));
  };

  const enemyProps = { base: enemyBase, draft: enemyDraft, setDraft: setEnemyDraft };
  const genProps = { base: genBase, draft: genDraft, setDraft: setGenDraft };

  return (
    <main className="screen admin">
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">管理画面</h1>
        </div>
      </header>

      <AdminTabs
        label="設定の種類"
        idPrefix="admin"
        tabs={ADMIN_TABS.map((t) => ({ id: t.id, label: t.label, changed: tabChanged(t.id, base, draft) }))}
        current={tab}
        onSelect={select}
      />

      <p className="admin__lead">
        値を変えて「変更を公開」を押すと、変えたところが一度にリポジトリに保存され、自動チェックが通れば数分で公開版に反映されます。
        「敵」と「ダンジョンに出る敵」は敵のデータ、そのほかはダンジョンの設定です。タブをまたいで変えても、まとめて公開できます。
      </p>

      {tab === 'enemies' && <EnemiesPanel {...enemyProps} busy={publisher.busy} />}
      {tab === 'pool' && <PoolPanel {...enemyProps} />}
      {tab === 'floors' && <FloorsPanel {...genProps} />}
      {tab === 'rooms' && <RoomsPanel {...genProps} />}
      {tab === 'placement' && <PlacementPanel {...genProps} />}
      {tab === 'growth' && <GrowthPanel {...genProps} />}
      {tab === 'magic' && <MagicPanel {...genProps} />}

      {showsPreview(tab) && (
        <PreviewSection settings={genDraft} rank={rank} onRank={setRank} seed={seed} onNewMap={() => setSeed(Math.floor(Math.random() * 2 ** 31))} />
      )}

      <PublishPanel
        changes={plan.changes}
        files={plan.files.map((f) => f.path)}
        problems={plan.problems}
        publisher={publisher}
        onReset={onReset}
        onPublish={onPublish}
      />
    </main>
  );
}
