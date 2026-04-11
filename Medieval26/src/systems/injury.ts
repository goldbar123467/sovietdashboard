import type { Knight, Injury, InjuryType, HitResult } from '../types';
import { rand } from '../data';

interface InjurySpec {
  recovery: [number, number];  // min, max days
  statPenalty: Injury["statPenalty"];
}

const INJURY_SPECS: Record<InjuryType, InjurySpec> = {
  bruise:      { recovery: [2, 4],   statPenalty: { strength: 5 } },
  sprain:      { recovery: [5, 8],   statPenalty: { skill: 8 } },
  fracture:    { recovery: [10, 18], statPenalty: { strength: 15, skill: 10 } },
  concussion:  { recovery: [8, 14],  statPenalty: { skill: 12, stamina: 20 } },
};

export function createInjury(type: InjuryType, severity = 1): Injury {
  const spec = INJURY_SPECS[type];
  const days = spec.recovery[0] + Math.floor(rand() * (spec.recovery[1] - spec.recovery[0] + 1));
  return {
    type,
    severity: Math.min(3, severity),
    daysRemaining: days,
    statPenalty: { ...spec.statPenalty },
  };
}

// Determine injury from joust hit taken
export function injuryFromHit(hit: HitResult, protection: number): Injury | null {
  if (hit.type === "miss" || hit.type === "glance") return null;

  let type: InjuryType;
  let severity: number;

  if (hit.type === "solid") {
    // Solid hit: chance of bruise
    if (rand() < 0.4) {
      type = "bruise";
      severity = 1;
    } else {
      return null;
    }
  } else {
    // Shatter: higher injury chance
    const roll = rand();
    if (roll < 0.3) {
      type = "sprain";
      severity = 1;
    } else if (roll < 0.5) {
      type = "fracture";
      severity = 2;
    } else if (roll < 0.65) {
      type = "concussion";
      severity = 2;
    } else {
      type = "bruise";
      severity = 1;
    }
  }

  // Protection reduces severity (can prevent injury entirely)
  severity = Math.max(0, severity - protection);
  if (severity <= 0) return null;

  return createInjury(type, severity);
}

// Training injury (only bruise, from overtraining)
export function trainingInjury(): Injury {
  return createInjury("bruise", 1);
}

// Heal one day of injury recovery
export function healDay(knight: Knight): boolean {
  if (!knight.injury) return false;
  knight.injury.daysRemaining--;
  if (knight.injury.daysRemaining <= 0) {
    knight.injury = null;
    return true; // fully healed
  }
  return false;
}

// Worsen existing injury (jousting while injured)
export function worsenInjury(knight: Knight): void {
  if (!knight.injury) return;
  knight.injury.severity = Math.min(3, knight.injury.severity + 1);
  const spec = INJURY_SPECS[knight.injury.type];
  knight.injury.daysRemaining = spec.recovery[0] + Math.floor(rand() * (spec.recovery[1] - spec.recovery[0] + 1));
}

// Get effective stat penalties from injury
export function injuryPenalties(knight: Knight): { skill: number; strength: number; stamina: number } {
  if (!knight.injury) return { skill: 0, strength: 0, stamina: 0 };
  return {
    skill: knight.injury.statPenalty.skill ?? 0,
    strength: knight.injury.statPenalty.strength ?? 0,
    stamina: knight.injury.statPenalty.stamina ?? 0,
  };
}

export function injuryLabel(injury: Injury): string {
  const labels: Record<InjuryType, string> = {
    bruise: "Bruised",
    sprain: "Sprained",
    fracture: "Fractured",
    concussion: "Concussed",
  };
  return `${labels[injury.type]} (${injury.daysRemaining}d)`;
}
