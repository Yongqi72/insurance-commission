/**
 * 提成计算单一权威函数（TRD §共享组件建议）：commission-summary 与 commission-report
 * 两个接口的提成计算必须调用本函数，禁止在 Controller/Service 中另外重复实现阶梯匹配/
 * 乘法逻辑，避免两个接口各自实现产生结果不一致。
 *
 * 按左开右闭区间 (下限, 上限] 在 tiers 中查档定单价，上限为空视为 +∞；提成 = 票数 × 单价。
 * 调用方需先经 `ruleComplete(tiers)` 确认阶梯规则完整覆盖，否则可能出现票数落不进任何
 * 区间的情况，此时本函数抛错而非静默返回 0，避免把"漏算"误当作"零提成"。
 */
export interface CommissionTierRate {
  lowerBound: number;
  upperBound: number | null;
  unitPrice: number;
}

/** calcCommission() 返回结构：提成金额与命中该结果的阶梯单价，供调用方在不另起匹配逻辑的前提下同时取用两者。 */
export interface CommissionCalcResult {
  commission: number;
  unitPrice: number;
}

export function calcCommission(
  ticketCount: number,
  tiers: CommissionTierRate[],
): CommissionCalcResult {
  const matchedTier = tiers.find(
    (tier) =>
      ticketCount > tier.lowerBound &&
      (tier.upperBound === null || ticketCount <= tier.upperBound),
  );

  if (!matchedTier) {
    throw new Error(
      `未找到匹配的提成阶梯区间：ticketCount=${ticketCount}，请检查阶梯规则是否完整覆盖`,
    );
  }

  return {
    commission: ticketCount * matchedTier.unitPrice,
    unitPrice: matchedTier.unitPrice,
  };
}
