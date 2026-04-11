import type { Knight, HitResult, JoustResult } from './types';
import { rand } from './data';
import { effectiveStats } from './systems/equipment';
import { injuryPenalties } from './systems/injury';

function classifyHit(roll: number, skill: number): HitResult {
  const s = skill / 100;
  if (roll < 0.08 * (1 - s * 0.5)) return { type: "miss", score: 0, label: "misses wide" };
  if (roll < 0.35 * (1 - s * 0.3)) return { type: "glance", score: 1, label: "lands a glancing blow" };
  if (roll < 0.75 + s * 0.1) return { type: "solid", score: 2, label: "strikes solid center-shield" };
  return { type: "shatter", score: 3, label: "shatters his lance!" };
}

export function simulateJoust(knightA: Knight, knightB: Knight): JoustResult {
  // Calculate effective stats with equipment bonuses and injury penalties
  const aStats = effectiveStats(knightA);
  const bStats = effectiveStats(knightB);
  const aPenalty = injuryPenalties(knightA);
  const bPenalty = injuryPenalties(knightB);

  const aEffSkill = Math.max(0, aStats.skill - aPenalty.skill);
  const bEffSkill = Math.max(0, bStats.skill - bPenalty.skill);
  const aEffStrength = Math.max(0, knightA.strength + (knightA.equipment.lance?.effects.strengthBonus ?? 0) - aPenalty.strength);
  const bEffStrength = Math.max(0, knightB.strength + (knightB.equipment.lance?.effects.strengthBonus ?? 0) - bPenalty.strength);

  const aStaminaMod = Math.max(0, aStats.stamina - aPenalty.stamina) / 100;
  const bStaminaMod = Math.max(0, bStats.stamina - bPenalty.stamina) / 100;

  const aRoll = rand();
  const bRoll = rand();
  const aHit = classifyHit(aRoll, aEffSkill * aStaminaMod);
  const bHit = classifyHit(bRoll, bEffSkill * bStaminaMod);

  const aBonus = aHit.score >= 2 ? (aEffStrength * aStaminaMod * rand() * 0.02) : 0;
  const bBonus = bHit.score >= 2 ? (bEffStrength * bStaminaMod * rand() * 0.02) : 0;

  const aTotal = aHit.score + aBonus;
  const bTotal = bHit.score + bBonus;

  const aCost = 12 + Math.floor(rand() * 10);
  const bCost = 12 + Math.floor(rand() * 10);

  let winner: Knight | null;
  let loser: Knight | null;
  let isDraw = false;

  if (Math.abs(aTotal - bTotal) < 0.1) {
    if (knightA.reputation > knightB.reputation) { winner = knightA; loser = knightB; }
    else if (knightB.reputation > knightA.reputation) { winner = knightB; loser = knightA; }
    else { isDraw = true; winner = null; loser = null; }
  } else if (aTotal > bTotal) {
    winner = knightA; loser = knightB;
  } else {
    winner = knightB; loser = knightA;
  }

  knightA.stamina = Math.max(0, knightA.stamina - aCost);
  knightB.stamina = Math.max(0, knightB.stamina - bCost);

  if (!isDraw) {
    winner!.wins++;
    winner!.reputation = Math.min(100, winner!.reputation + 5);
    loser!.losses++;
    loser!.reputation = Math.max(0, loser!.reputation - 3);
  } else {
    knightA.draws++;
    knightB.draws++;
  }

  const aName = knightA.name.split(" ")[1];
  const bName = knightB.name.split(" ")[1];
  let narrative = `${aName} ${aHit.label}. ${bName} ${bHit.label}.`;
  if (isDraw) {
    narrative += ` A draw!`;
  } else {
    const wName = winner!.name.split(" ")[1];
    narrative += ` ${wName} wins the pass!`;
  }

  return { knightA, knightB, aHit, bHit, winner, loser, isDraw, narrative };
}
