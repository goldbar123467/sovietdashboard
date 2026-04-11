import type { GameState, GameEvent } from '../types';
import { rand } from '../data';

// Event probability increases with days since last event
// At 5 days: ~20%, at 10 days: ~80%
function shouldTriggerEvent(daysSinceEvent: number): boolean {
  const chance = Math.min(0.8, (daysSinceEvent - 4) * 0.15);
  return rand() < chance;
}

export function rollEvent(state: GameState, daysSinceEvent: number): GameEvent | null {
  if (!shouldTriggerEvent(daysSinceEvent)) return null;

  const knight = state.roster[0];
  const events = buildEventPool(state);
  if (events.length === 0) return null;

  return events[Math.floor(rand() * events.length)];
}

function buildEventPool(state: GameState): GameEvent[] {
  const pool: GameEvent[] = [];
  const knight = state.roster[0];

  // Merchant visit
  pool.push({
    id: "merchant_visit",
    title: "Traveling Merchant",
    description: "A merchant arrives at your gate with wares to sell. He offers a discount on a fine piece of equipment.",
    choices: [
      {
        label: "Browse his wares",
        effect: (s) => {
          // Just opens the shop — no special discount for Phase 1
          return "You examine the merchant's goods.";
        },
      },
      {
        label: "Send him away",
        effect: () => "The merchant departs, grumbling about the wasted journey.",
      },
    ],
  });

  // Favorable weather
  pool.push({
    id: "good_weather",
    title: "Fine Weather",
    description: "The sun shines bright and the air is crisp. Perfect conditions for training.",
    choices: [
      {
        label: "Make the most of it",
        effect: (s) => {
          const k = s.roster[0];
          const bonus = 1 + Math.floor(rand() * 2);
          k.skill = Math.min(100, k.skill + bonus);
          return `The good weather lifts your spirits. Skill +${bonus}.`;
        },
      },
    ],
  });

  // Local challenge
  pool.push({
    id: "local_challenge",
    title: "Local Challenge",
    description: "A hedge knight passes through and challenges you to a friendly bout. There's coin on the line, but also risk of injury.",
    choices: [
      {
        label: "Accept the challenge",
        effect: (s) => {
          const k = s.roster[0];
          if (rand() < 0.65) {
            const prize = 8 + Math.floor(rand() * 8);
            s.treasury += prize;
            return `You defeat the challenger handily! +${prize} marks.`;
          } else {
            // Minor injury
            k.injury = { type: "bruise", severity: 1, daysRemaining: 3, statPenalty: { strength: 5 } };
            return "The bout goes badly. You take a bruise for your trouble.";
          }
        },
      },
      {
        label: "Decline politely",
        effect: () => "You watch the hedge knight ride on. Perhaps another time.",
      },
    ],
  });

  // Rumor
  const upcoming = state.tournaments.filter(t => t.status === "upcoming");
  if (upcoming.length > 0) {
    const t = upcoming[Math.floor(rand() * upcoming.length)];
    const opp = t.opponent;
    const statToReveal = rand() < 0.5 ? "skill" : "strength";
    pool.push({
      id: "rumor",
      title: "Tournament Rumor",
      description: `Word reaches you about ${opp.name}, who defends at ${t.name}. They say his ${statToReveal} is ${opp[statToReveal]}.`,
      choices: [
        {
          label: "Note this intelligence",
          effect: () => `You file the information away for later.`,
        },
      ],
    });
  }

  // Equipment wear warning
  const eq = knight.equipment;
  const fragile = [eq.lance, eq.armor, eq.shield].filter(
    e => e && e.durability <= 2 && e.type !== "horse"
  );
  if (fragile.length > 0) {
    const item = fragile[0]!;
    pool.push({
      id: "equipment_wear",
      title: "Equipment Wearing Thin",
      description: `Your ${item.name} is showing signs of heavy wear. It won't last much longer.`,
      choices: [
        {
          label: "I'll visit the shop soon",
          effect: () => `Best to replace it before the next tournament.`,
        },
      ],
    });
  }

  return pool;
}
