import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishError, publishFiles } from './githubPublish';

// GitHub の代わりに答える、小さな偽物（本物の GitHub には、何も送らない）
const API = 'https://api.github.com/repos/oonishi911/dungeon-rogue';
const b64 = (text: string) => btoa(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join(''));

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function fakeGithub(files: Record<string, string>, fail: { path?: string; status?: number } = {}) {
  const calls: Call[] = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = String(url).replace(API, '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) });
    if (fail.path && path.startsWith(fail.path)) return json({}, fail.status ?? 500);
    if (path === '/git/ref/heads/main') return json({ object: { sha: 'head1' } });
    if (path === '/git/commits/head1') return json({ tree: { sha: 'tree1' } });
    if (path.startsWith('/contents/')) {
      const text = files[path.slice('/contents/'.length).split('?')[0]!];
      return text === undefined ? json({}, 404) : json({ content: b64(text).replace(/(.{60})/g, '$1\n') });
    }
    if (method === 'POST' && path === '/git/trees') return json({ sha: 'tree2' });
    if (method === 'POST' && path === '/git/commits') return json({ sha: 'commit2' });
    if (method === 'PATCH' && path === '/git/refs/heads/main') return json({});
    return json({}, 404);
  });
  const writes = () => calls.filter((c) => c.method !== 'GET');
  return { calls, writes };
}

const ENEMIES = { path: 'src/game/enemies.json', base: '{ "敵": 1 }\n', text: '{ "敵": 2 }\n' };
const GEN = { path: 'src/game/dungeons/standard.json', base: '{ "階": 3 }\n', text: '{ "階": 4 }\n' };
const NEW = { path: 'src/game/dungeons/deep_cave.json', base: null, text: '{ "階": 7 }\n' };
const FILES = { [ENEMIES.path]: ENEMIES.base, [GEN.path]: GEN.base };

afterEach(() => vi.unstubAllGlobals());

describe('管理画面からの公開（複数のファイルを1回のコミットで保存する）', () => {
  it('2つのファイルを、1つのコミットにまとめて main に保存する', async () => {
    const gh = fakeGithub(FILES);
    const commit = await publishFiles('token', [ENEMIES, GEN], '更新する');
    expect(commit).toBe('commit2');
    // 保存の呼び出しは、木・コミット・先頭を進める、の3つだけ（ファイルごとのコミットはない）
    expect(gh.writes().map((c) => `${c.method} ${c.path}`)).toEqual(['POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main']);
    const [tree, made, ref] = gh.writes();
    expect(tree!.body).toEqual({
      base_tree: 'tree1',
      tree: [
        { path: ENEMIES.path, mode: '100644', type: 'blob', content: ENEMIES.text },
        { path: GEN.path, mode: '100644', type: 'blob', content: GEN.text },
      ],
    });
    expect(made!.body).toEqual({ message: '更新する', tree: 'tree2', parents: ['head1'] });
    // 先頭を進めるだけ（上書きの force はしない）
    expect(ref!.body).toEqual({ sha: 'commit2', force: false });
  });

  it('ファイル1つだけのときも、同じ手順で保存する（変えていないファイルは触らない）', async () => {
    const gh = fakeGithub(FILES);
    await publishFiles('token', [GEN], 'ダンジョンだけ');
    const tree = gh.writes()[0]!.body as { tree: { path: string }[] };
    expect(tree.tree.map((t) => t.path)).toEqual([GEN.path]);
    expect(gh.calls.some((c) => c.path.startsWith(`/contents/${ENEMIES.path}`))).toBe(false);
  });

  it('日本語の中身も、読み違えずに比べられる', async () => {
    fakeGithub({ [ENEMIES.path]: ENEMIES.base });
    expect(await publishFiles('token', [ENEMIES], 'm')).toBe('commit2');
  });

  it('どちらかのファイルが、公開版より新しくなっていたら、何も保存しないで止める', async () => {
    const gh = fakeGithub({ ...FILES, [GEN.path]: '{ "階": 5 }\n' });
    const error = await publishFiles('token', [ENEMIES, GEN], 'm').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect((error as Error).message).toContain('新しい変更');
    expect(gh.writes()).toEqual([]);
  });

  it('調べてから保存するまでのあいだに、ほかの変更が入ったら（先頭が進められない）、上書きしないで止める', async () => {
    fakeGithub(FILES, { path: '/git/refs/heads/main', status: 422 });
    const error = await publishFiles('token', [ENEMIES, GEN], 'm').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect((error as Error).message).toContain('重なりました');
  });

  it('トークンが正しくないときは、そう伝える', async () => {
    fakeGithub(FILES, { path: '/git/ref/', status: 401 });
    const error = await publishFiles('token', [ENEMIES], 'm').catch((e: unknown) => e);
    expect((error as Error).message).toContain('トークン');
  });

  it('まだないファイルを新しく作り、いらないファイルを消すことも、1つのコミットでできる', async () => {
    const gh = fakeGithub(FILES);
    await publishFiles('token', [NEW, { path: GEN.path, text: null, base: GEN.base }], 'ダンジョンを作り、消す');
    const tree = gh.writes()[0]!.body as { tree: unknown[] };
    expect(tree.tree).toEqual([
      { path: NEW.path, mode: '100644', type: 'blob', content: NEW.text },
      // 消すファイルは sha を null にする（GitHub の決まり）
      { path: GEN.path, mode: '100644', type: 'blob', sha: null },
    ]);
  });

  it('作るはずのファイルが、もうリポジトリにあれば、何も保存しないで止める', async () => {
    const gh = fakeGithub({ ...FILES, [NEW.path]: '{}\n' });
    const error = await publishFiles('token', [NEW], 'm').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(gh.writes()).toEqual([]);
  });

  it('消すはずのファイルが、もうないとき（ほかの人が先に消した）も、止める', async () => {
    const gh = fakeGithub({ [ENEMIES.path]: ENEMIES.base });
    const error = await publishFiles('token', [{ path: GEN.path, text: null, base: GEN.base }], 'm').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(gh.writes()).toEqual([]);
  });

  it('保存するファイルがないときは、何もしない', async () => {
    const gh = fakeGithub(FILES);
    const error = await publishFiles('token', [], 'm').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(gh.calls).toEqual([]);
  });
});
