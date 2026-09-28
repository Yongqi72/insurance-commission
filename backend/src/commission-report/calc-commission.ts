/**
 * 提成计算单一权威函数（TRD §共享组件建议）：commission-summary 与 commission-report
 * 两个接口的提成计算必须调用本函数，避免两个接口各自实现产生结果不一致。
 *
 * 档位为闭区间 [下限, 上限]，各档票数分别乘以该档单价后累加。
 * 调用方先用 `ruleComplete(tiers)` 确认档位连续；本函数也检查票数是否恰好覆盖。
 */
export interface CommissionTierRate {
  lowerBound: number;
  upperBound: number | null;
  unitPrice: number;
}

export interface CommissionSegment extends CommissionTierRate {
  ticketCount: number;
  commission: number;
}

export interface CommissionCalcResult {
  commission: number;
  segments: CommissionSegment[];
}

/** Tickets are numbered from 1; a configured 0–10 tier covers tickets 1–10. */
export function calcCommission(
  ticketCount: number,
  tiers: CommissionTierRate[],
): CommissionCalcResult {
  if (!Number.isSafeInteger(ticketCount) || ticketCount < 0) {
    throw new Error(`Invalid ticketCount: ${ticketCount}`);
  }

  const segments = [...tiers]
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .map((tier): CommissionSegment => {
      const firstTicket = Math.max(1, tier.lowerBound);
      const lastTicket = Math.min(ticketCount, tier.upperBound ?? ticketCount);
      const count = Math.max(0, lastTicket - firstTicket + 1);
      // unit_price is DECIMAL(10,2); use cents for exact numeric output.
      const cents = Math.round(tier.unitPrice * 100) * count;
      return {
        lowerBound: tier.lowerBound,
        upperBound: tier.upperBound,
        ticketCount: count,
        unitPrice: tier.unitPrice,
        commission: cents / 100,
      };
    })
    .filter((segment) => segment.ticketCount > 0);

  if (
    segments.reduce((sum, segment) => sum + segment.ticketCount, 0) !==
    ticketCount
  ) {
    throw new Error(
      `Commission tiers do not cover ${ticketCount} tickets exactly`,
    );
  }

  return {
    commission:
      segments.reduce(
        (sum, segment) => sum + Math.round(segment.commission * 100),
        0,
      ) / 100,
    segments,
  };
}
