import { afterEach } from 'vitest';

// テストを1つ終えるたびに、いったん処理を手放す。
// Vitest は、テストを動かしているプロセスから本体へ途中経過を送り、60秒以内に返事が来ないと
// "Timeout calling onTaskUpdate" で失敗にする。テストどうしのあいだで処理を手放さないと、返事はファイルの
// テストがすべて終わるまで受け取れないので、合わせて60秒を超えるファイル（重いバランスのテスト）で失敗していた。
// 1つのテストは長くても20秒ほどなので、テストごとに手放せば返事は間に合う
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
