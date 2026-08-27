/**
 * 提成阶梯规则完整性判定（TRD §接口：GET /api/commission-tiers）。
 * 纯函数：不查库、无副作用，只接收已查询好的档位数组；GET /api/commission-tiers 与
 * commission-summary/commission-report 接口共用同一份实现，判定口径唯一（不得各自重复实现）。
 *
 * 完整性三条件（按 lowerBound 排序后）同时满足才为 true：
 * 1. 首档 lowerBound === 0
 * 2. 末档 upperBound === null（覆盖到无穷）
 * 3. 相邻档位首尾相接：前一档 upperBound === 后一档 lowerBound
 */
export interface TierBoundary {
  lowerBound: number;
  upperBound: number | null;
}

export function ruleComplete(tiers: TierBoundary[]): boolean {
  if (tiers.length === 0) {
    return false;
  }

  const sorted = [...tiers].sort((a, b) => a.lowerBound - b.lowerBound);

  if (sorted[0].lowerBound !== 0) {
    return false;
  }
  if (sorted[sorted.length - 1].upperBound !== null) {
    return false;
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i].upperBound !== sorted[i + 1].lowerBound) {
      return false;
    }
  }
  return true;
}
