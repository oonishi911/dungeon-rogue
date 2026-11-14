// 管理画面から、リポジトリのファイルを書き換えて公開する（GitHub の API を使う）。
// 書き換えると main に保存され、CI（自動チェック → 公開）が動く。自動チェックが通らなければ公開されない。
// 複数のファイルは、1回のコミットでまとめて保存する（CI も1回だけ動く）。ファイルを新しく作る・消すこともできる
// GitHub のトークンは、使う人のブラウザにだけ保存する（このリポジトリへの書き込みだけを許した、期限つきのものを使う）

export const REPO = { owner: 'oonishi911', repo: 'dungeon-rogue', branch: 'main' } as const;
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;
const TOKEN_KEY = 'dungeon-prep/github-token';

export function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 保存できなくても、この画面を開いているあいだは使える
  }
}

export class PublishError extends Error {}

/** GitHub の API を呼ぶ。missingOk なら、見つからない（404）ときに、エラーにしないで null を返す（まだないファイルを確かめるとき） */
async function api(token: string, path: string, init?: RequestInit, missingOk = false): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new PublishError('トークンが正しくないか、期限が切れています');
  if (res.status === 404 && missingOk) return null;
  if (res.status === 403 || res.status === 404) {
    throw new PublishError('このトークンでは、リポジトリに書き込めません（トークンの権限を確かめてください）');
  }
  if (res.status === 409 || res.status === 422) throw new PublishError('ほかの変更と重なりました。画面を読み込み直してから、もう一度試してください');
  if (!res.ok) throw new PublishError(`GitHub への接続に失敗しました（${res.status}）`);
  return res.json();
}

const decode = (base64: string) => new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

/**
 * 保存するファイル1つ。text は保存する中身（null なら、ファイルを消す）。
 * base は、画面を開いたときの（公開版の）中身（null なら、まだないファイルを新しく作る）
 */
export interface PublishItem {
  path: string;
  text: string | null;
  base: string | null;
}

const NEWER = '公開版より新しい変更が、すでにリポジトリに入っています。公開が終わるのを待ち、画面を読み込み直してから変更してください';

/**
 * ファイルをいくつか書き換えて（作る・消すも）、1回のコミットで main に保存する（途中までしか保存されない、ということがない）。
 * 今リポジトリにある中身が base と違う（ほかの変更が先に入っている。作るファイルが、もうある）ときは、何も保存しないで止める。
 * 調べてから保存するまでのあいだに、ほかの変更が入ったときも、上書きしないで止まる。返すのは保存したコミット
 */
export async function publishFiles(token: string, items: PublishItem[], message: string): Promise<string> {
  if (!items.length) throw new PublishError('保存するファイルがありません');
  // 今の main の先頭。このコミットの上に、1つコミットを足す
  const head = ((await api(token, `/git/ref/heads/${REPO.branch}`)) as { object: { sha: string } }).object.sha;
  const { tree } = (await api(token, `/git/commits/${head}`)) as { tree: { sha: string } };
  const current = await Promise.all(
    // ないファイルは null（作るファイルは、まだないはず。消すファイルや書き換えるファイルが、もうなければ、ほかの変更が先に入っている）
    items.map((item) => api(token, `/contents/${item.path}?ref=${head}`, undefined, true) as Promise<{ content: string } | null>),
  );
  if (current.some((c, i) => (c === null ? null : decode(c.content)) !== items[i]!.base)) throw new PublishError(NEWER);

  // 消すファイルは sha を null にする（GitHub の決まり）
  const entries = items.map((item) =>
    item.text === null ? { path: item.path, mode: '100644', type: 'blob', sha: null } : { path: item.path, mode: '100644', type: 'blob', content: item.text },
  );
  const newTree = (await api(token, '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: tree.sha, tree: entries }),
  })) as { sha: string };
  const commit = (await api(token, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
  })) as { sha: string };
  // 先頭を進めるだけ（force しない）。ほかの変更が先に入っていたら、ここで 422 になって止まる
  await api(token, `/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return commit.sha;
}

export type DeployStage =
  | { stage: 'waiting' } // 自動チェックが始まるのを待っている
  | { stage: 'checking'; url: string } // 自動チェック中（型・テスト・ビルド）
  | { stage: 'deploying'; url: string } // 公開中
  | { stage: 'done'; url: string } // 公開した
  | { stage: 'failed'; url: string; reason: string };

/** コミットの CI（自動チェック → 公開）が、今どこまで進んだか */
export async function deployStage(token: string, commit: string): Promise<DeployStage> {
  const runs = (await api(token, `/actions/runs?head_sha=${commit}&per_page=5`)) as {
    workflow_runs: { id: number; html_url: string; event: string }[];
  };
  const run = runs.workflow_runs.find((r) => r.event === 'push') ?? runs.workflow_runs[0];
  if (!run) return { stage: 'waiting' };
  const { jobs } = (await api(token, `/actions/runs/${run.id}/jobs`)) as {
    jobs: { name: string; status: string; conclusion: string | null }[];
  };
  const check = jobs.find((j) => j.name === 'check');
  const deploy = jobs.find((j) => j.name === 'deploy');
  const url = run.html_url;
  if (!check || check.status !== 'completed') return { stage: 'checking', url };
  if (check.conclusion !== 'success') {
    return { stage: 'failed', url, reason: '自動チェックが通らなかったので、公開しませんでした（設定の形がおかしいなど。GitHub の記録で原因を確かめてください）' };
  }
  if (!deploy || deploy.status !== 'completed') return { stage: 'deploying', url };
  if (deploy.conclusion !== 'success') return { stage: 'failed', url, reason: '公開に失敗しました（GitHub 側の一時的な失敗のことが多いので、少し待ってやり直してください）' };
  return { stage: 'done', url };
}
