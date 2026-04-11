import type { Knight } from '../types';
import { rand } from '../data';

export type TrainingFocus = "skill" | "strength" | "stamina";

export interface TrainingResult {
  focus: TrainingFocus;
  statGain: number;
  fatigueCost: number;
  injuryRisk: boolean;
  narrative: string;
}

// Diminishing returns multiplier based on current stat level
function diminishingMultiplier(stat: number): number {
  if (stat < 50) return 1.0;
  if (stat < 70) return 0.7;
  if (stat < 85) return 0.4;
  return 0.2;
}

const FOCUS_CONFIG: Record<TrainingFocus, { stat: keyof Knight; baseMin: number; baseMax: number; fatigue: number }> = {
  skill:    { stat: "skill",      baseMin: 1, baseMax: 3, fatigue: 8 },
  strength: { stat: "strength",   baseMin: 1, baseMax: 3, fatigue: 10 },
  stamina:  { stat: "maxStamina", baseMin: 1, baseMax: 2, fatigue: 12 },
};

export function trainKnight(knight: Knight, focus: TrainingFocus): TrainingResult {
  const config = FOCUS_CONFIG[focus];
  const currentStat = knight[config.stat] as number;

  // Base gain (random within range)
  const baseGain = config.baseMin + Math.floor(rand() * (config.baseMax - config.baseMin + 1));

  // Apply diminishing returns
  const diminished = Math.round(baseGain * diminishingMultiplier(currentStat));

  // Apply fatigue reduction: effectiveGain = baseGain * (1 - fatigue/100)
  const fatigueModifier = 1 - knight.fatigue / 100;
  const statGain = Math.max(0, Math.round(diminished * fatigueModifier));

  // Fatigue cost
  const fatigueCost = config.fatigue;

  // Injury risk if fatigue > 70
  const injuryRisk = (knight.fatigue + fatigueCost) > 70 && rand() < 0.15;

  // Build narrative
  const statName = focus === "stamina" ? "endurance" : focus;
  let narrative = `Trained ${statName}`;
  if (statGain > 0) {
    narrative += ` (+${statGain} ${focus === "stamina" ? "max stamina" : focus})`;
  } else {
    narrative += ` (no gain — too fatigued)`;
  }

  return { focus, statGain, fatigueCost, injuryRisk, narrative };
}

export function applyTraining(knight: Knight, result: TrainingResult): void {
  const config = FOCUS_CONFIG[result.focus];
  const stat = config.stat as "skill" | "strength" | "maxStamina";
  knight[stat] = Math.min(100, knight[stat] + result.statGain);
  knight.fatigue = Math.min(100, knight.fatigue + result.fatigueCost);
}

export function canTrain(knight: Knight): boolean {
  // Cannot train if injured (except bruise)
  if (knight.injury && knight.injury.type !== "bruise") return false;
  return true;
}
