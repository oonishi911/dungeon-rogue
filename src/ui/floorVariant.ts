// 床の模様の選び方（3D表示の床を、何種類かの模様で描き分ける）

/** 床の模様の種類の数 */
export const FLOOR_PATTERNS = 4;

/** 床の模様の選び方。マスの位置から決めるので、同じ場所はいつも同じ模様になる（0〜FLOOR_PATTERNS-1） */
export function floorVariant(x: number, y: number): number {
  const h = Math.imul(x * 73856093 ^ y * 19349663, 0x9e3779b1) >>> 0;
  return h % FLOOR_PATTERNS;
}
