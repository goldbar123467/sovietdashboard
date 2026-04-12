/* ------------------------------------------------------------------ */
/*  Scoring — delivery score calculation and run totals                */
/* ------------------------------------------------------------------ */

export interface DeliveryScore {
  base: number;
  timeBonus: number;
  shroomMultiplier: number;
  coldPenalty: number;
  total: number;
}

/**
 * Calculate the score for a single delivery.
 *
 * Formula (MASTERPLAN Section 5):
 *   delivery_score = 100 * time_bonus * (1 + 0.25 * shrooms) * (cold ? 0.5 : 1.0)
 *
 * time_bonus:
 *   <= 30s  → 2.0
 *   >= 90s  → 0.5
 *   else    → lerp 2.0 → 0.5  (2.0 - (t - 30) / 60 * 1.5)
 *
 * cold = timeSeconds > 75
 */
export function calculateDeliveryScore(
  timeSeconds: number,
  shroomsCollected: number,
): DeliveryScore {
  const base = 100;

  let timeBonus: number;
  if (timeSeconds <= 30) {
    timeBonus = 2.0;
  } else if (timeSeconds >= 90) {
    timeBonus = 0.5;
  } else {
    timeBonus = 2.0 - ((timeSeconds - 30) / 60) * 1.5;
  }

  const shroomMultiplier = 1 + 0.25 * shroomsCollected;
  const cold = timeSeconds > 75;
  const coldPenalty = cold ? 0.5 : 1.0;

  const total = Math.round(base * timeBonus * shroomMultiplier * coldPenalty);

  return { base, timeBonus, shroomMultiplier, coldPenalty, total };
}

/**
 * Calculate the total run score across all deliveries with wipeout penalty.
 *
 * run_total = sum(delivery_totals) * max(0.5, 1.0 - 0.05 * wipeouts)
 */
export function calculateRunTotal(
  deliveryScores: DeliveryScore[],
  wipeoutCount: number,
): number {
  const sum = deliveryScores.reduce((acc, s) => acc + s.total, 0);
  const wipeoutPenalty = Math.max(0.5, 1.0 - 0.05 * wipeoutCount);
  return Math.round(sum * wipeoutPenalty);
}
