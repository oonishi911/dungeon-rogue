// 開発用の管理画面。?view=admin で開く（?view=enemies と ?view=gen も、同じ画面の合うタブを開く）。
// 敵のマスターデータ（src/game/enemies.json）と、品物の設定（src/game/items.json。名前・値段・武器と防具の段階ごとの性能）と、ダンジョンの設定ファイル（src/game/dungeons/<ID>.json。プレイヤーが選ぶダンジョンごとに1つ）を、
// タブで分けて1つの画面で変えられる：敵／品物／名前と説明／ダンジョンに出る敵／階の数・広さ・満腹度／小部屋／敵の数と置き方／レベルと強敵の報酬／魔法。
// ダンジョンの設定のタブでは、上の欄で直すダンジョンを選ぶ。ダンジョンは、複製して作る・消すこともできる。
// 変えた内容は「変更を公開」でまとめてリポジトリに保存され（変えたファイルを、1回のコミットで）、自動チェックが通れば数分で公開版に反映される。
// 変えている途中の内容は、ブラウザに残して、次に開いたときに戻す（下書き。adminScreen.ts の packDraft・unpackDraft）。画面の下には、変えた数と「変更を公開」のバーを固定で出す（adminParts.tsx の PublishBar）

import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  ADMIN_TABS,
  adminDungeonFromUrl,
  adminTabFromUrl,
  adminTabUrl,
  bossUses,
  copyJson,
  duplicateDungeon,
  isDungeonTab,
  packDraft,
  planPublish,
  removeDungeon,
  removeEnemyEverywhere,
  showsPreview,
  tabChanged,
  unpackDraft,
  type AdminData,
  type AdminTab,
} from '../game/adminScreen';
import { ENEMY_MASTER, ITEM_MASTER } from '../game/data';
import type { ItemMaster } from '../game/itemMaster';
import { DEFAULT_DUNGEON_ID, DUNGEON_IDS, DUNGEONS, sortDungeonIds } from '../game/dungeons';
import type { EnemyMaster } from '../game/enemyMaster';
import type { DungeonFile } from '../game/genMaster';
import { AdminTabs, PublishBar, PublishPanel, readDraft, usePublish, writeDraft } from './adminParts';
import { AboutPanel, DungeonPicker, PoolPanel } from './DungeonPanels';
import { EnemiesPanel } from './EnemyPanels';
import { ItemsPanel } from './ItemPanels';
import { FloorsPanel, GrowthPanel, MagicPanel, PlacementPanel, PreviewSection, RoomsPanel } from './GenPanels';

const published = (): AdminData => copyJson({ enemies: ENEMY_MASTER, items: ITEM_MASTER, dungeons: { ...DUNGEONS } });
/** 開いたとき：公開版と、ブラウザに残してあった下書き（公開版が同じなら戻す） */
function initial(): { base: AdminData; draft: AdminData; notice: Notice } {
  const base = published();
  const restore = unpackDraft(readDraft(), base);
  if (restore.kind === 'restored') return { base, draft: restore.draft, notice: { kind: 'restored', changes: restore.changes } };
  return { base, draft: copyJson(base), notice: restore.kind === 'stale' ? { kind: 'stale' } : null };
}

/** 画面の上に出す、下書きのお知らせ。restored：戻した、stale：公開版が変わっていて使えなかった */
type Notice = { kind: 'restored'; changes: number } | { kind: 'stale' } | null;

/** 変えている途中の内容を、少し待ってからブラウザに残す（入力のたびに書かない）。画面を閉じる・隠すときは、待たずにすぐ残す */
const SAVE_DELAY_MS = 400;

const apply = <T,>(action: SetStateAction<T>, prev: T): T => (typeof action === 'function' ? (action as (p: T) => T)(prev) : action);

export function Admin() {
  // base：今公開されている（この画面を開いたときの）データ。draft：画面で変えているデータ
  const [start] = useState(initial);
  const [base, setBase] = useState<AdminData>(start.base);
  const [draft, setDraft] = useState<AdminData>(start.draft);
  const [notice, setNotice] = useState<Notice>(start.notice);
  const [tab, setTab] = useState<AdminTab>(() => adminTabFromUrl(window.location.search));
  const [dungeonId, setDungeonId] = useState(() => adminDungeonFromUrl(window.location.search, DUNGEON_IDS));
  const [seed, setSeed] = useState(1);
  const publisher = usePublish();
  const plan = useMemo(() => planPublish(base, draft), [base, draft]);

  // 下書きをブラウザに残す（誤って閉じても、読み込み直しても、続きから直せる）
  const latest = useRef({ base, draft });
  latest.current = { base, draft };
  useEffect(() => {
    const timer = window.setTimeout(() => writeDraft(packDraft(base, draft)), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [base, draft]);
  useEffect(() => {
    const flush = () => writeDraft(packDraft(latest.current.base, latest.current.draft));
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // 直しているダンジョン（消したばかりなら標準）
  const current = draft.dungeons[dungeonId] ? dungeonId : DEFAULT_DUNGEON_ID;
  const dungeon = draft.dungeons[current]!;
  const dungeonBase = base.dungeons[current];

  // 読み込み直しても同じタブ・同じダンジョンが開くように、住所に残す（履歴は増やさない）
  const remember = (nextTab: AdminTab, nextDungeon: string) =>
    window.history.replaceState(window.history.state, '', adminTabUrl(window.location.href, nextTab, nextDungeon));
  const select = (next: AdminTab) => {
    setTab(next);
    remember(next, current);
  };
  const selectDungeon = (id: string) => {
    setDungeonId(id);
    remember(tab, id);
  };

  const setEnemies = (action: SetStateAction<EnemyMaster>) => setDraft((d) => ({ ...d, enemies: apply(action, d.enemies) }));
  const setItems = (action: SetStateAction<ItemMaster>) => setDraft((d) => ({ ...d, items: apply(action, d.items) }));
  const setDungeon = (action: SetStateAction<DungeonFile>) =>
    setDraft((d) => (d.dungeons[current] ? { ...d, dungeons: { ...d.dungeons, [current]: apply(action, d.dungeons[current]!) } } : d));

  const onPublish = () => {
    if (plan.problems.length || !plan.files.length) return;
    void publisher.send(plan.files, plan.message, () => setBase(copyJson(draft)));
  };
  const onReset = () => {
    setDraft(copyJson(base));
    setNotice(null);
  };

  const genProps = { base: dungeonBase ?? dungeon, draft: dungeon, setDraft: setDungeon };
  const names = new Map(sortDungeonIds(Object.keys(draft.dungeons)).map((id) => [id, draft.dungeons[id]!.name]));

  return (
    <main className={plan.changes.length > 0 || publisher.busy || publisher.publish.state !== 'idle' ? 'screen admin admin--bar' : 'screen admin'}>
      <header className="top">
        <div>
          <p className="top__run">開発用</p>
          <h1 className="top__title">管理画面</h1>
        </div>
      </header>

      <AdminTabs
        label="設定の種類"
        idPrefix="admin"
        tabs={ADMIN_TABS.map((t) => ({ id: t.id, label: t.label, changed: tabChanged(t.id, base, draft, current) }))}
        current={tab}
        onSelect={select}
      />

      {notice?.kind === 'restored' && (
        <p className="admin__notice" role="status">
          前回の続きから、変えかけの内容（{notice.changes}件）を戻しました。
          <button type="button" className="explore__wait" disabled={publisher.busy} onClick={onReset}>
            捨てて、公開版に戻す
          </button>
        </p>
      )}
      {notice?.kind === 'stale' && (
        <p className="admin__notice" role="status">
          前回の変えかけの内容は、公開されているデータが変わっていたので、戻せませんでした。
          <button type="button" className="explore__wait" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </p>
      )}

      <p className="admin__lead">
        値を変えて「変更を公開」を押すと、変えたところが一度にリポジトリに保存され、自動チェックが通れば数分で公開版に反映されます。
        「敵」は、すべてのダンジョンで使う敵のデータ（マスター）です。「品物」は、店で売る品物の名前・値段と、武器・防具の段階ごとの性能です。そのほかのタブは、上の欄で選んだダンジョンの設定です。
        プレイヤーは、遊ぶ前にダンジョンを選びます。タブやダンジョンをまたいで変えても、まとめて公開できます。
      </p>

      {isDungeonTab(tab) && <DungeonPicker base={base} draft={draft} current={current} onSelect={selectDungeon} />}

      {tab === 'enemies' && (
        <EnemiesPanel
          base={base.enemies}
          draft={draft.enemies}
          setDraft={setEnemies}
          busy={publisher.busy}
          bossUsesOf={(id) => bossUses(draft, id)}
          onRemove={(id) => setDraft((d) => removeEnemyEverywhere(d, id))}
        />
      )}
      {tab === 'items' && <ItemsPanel base={base.items} draft={draft.items} setDraft={setItems} />}
      {tab === 'about' && (
        <AboutPanel
          base={dungeonBase}
          draft={dungeon}
          id={current}
          allNames={names}
          allIds={[...names.keys()]}
          busy={publisher.busy}
          setDraft={setDungeon}
          onDuplicate={(id, name) => {
            setDraft((d) => duplicateDungeon(d, current, id, name));
            selectDungeon(id);
          }}
          onRemove={() => {
            setDraft((d) => removeDungeon(d, current));
            selectDungeon(DEFAULT_DUNGEON_ID);
          }}
        />
      )}
      {tab === 'pool' && (
        <PoolPanel
          master={draft.enemies}
          base={dungeonBase?.encounters}
          draft={dungeon.encounters}
          dungeonName={dungeon.name || current}
          setDraft={(change) => setDungeon((d) => ({ ...d, encounters: change(d.encounters) }))}
        />
      )}
      {tab === 'floors' && <FloorsPanel {...genProps} />}
      {tab === 'rooms' && <RoomsPanel {...genProps} />}
      {tab === 'placement' && <PlacementPanel {...genProps} />}
      {tab === 'growth' && <GrowthPanel {...genProps} />}
      {tab === 'magic' && <MagicPanel {...genProps} />}

      {showsPreview(tab) && (
        <PreviewSection settings={dungeon} seed={seed} onNewMap={() => setSeed(Math.floor(Math.random() * 2 ** 31))} />
      )}

      <PublishPanel
        changes={plan.changes}
        files={plan.files.map((f) => (f.text === null ? `${f.path}（消す）` : f.base === null ? `${f.path}（作る）` : f.path))}
        problems={plan.problems}
        publisher={publisher}
        onReset={onReset}
        onPublish={onPublish}
      />
      <PublishBar count={plan.changes.length} problems={plan.problems.length} publisher={publisher} onPublish={onPublish} />
    </main>
  );
}
