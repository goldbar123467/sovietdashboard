import type { GameState } from '../types';
import { deductDailyUpkeep } from './economy';
import { healDay } from './injury';
import { rollEvent } from './events';

export const SEASON_LENGTH = 180;

export interface DayResult {
  day: number;
  upkeepCost: number;
  healed: boolean;
  eventTriggered: boolean;
}

// Advance one day: deduct upkeep, heal injuries, check for events
export function advanceDay(state: GameState): DayResult {
  state.currentDay++;
  const day = state.currentDay;

  // Daily upkeep
  const upkeepCost = deductDailyUpkeep(state);

  // Heal injuries
  const knight = state.roster[0];
  const healed = healDay(knight);

  if (healed) {
    state.household.activityLog.push({
      day,
      text: `${knight.name} has fully recovered from injury.`,
      type: "injury",
    });
  }

  // Random events (one per 5-10 days since last event)
  let eventTriggered = false;
  const daysSinceEvent = day - state.lastEventDay;
  if (daysSinceEvent >= 5) {
    const event = rollEvent(state, daysSinceEvent);
    if (event) {
      state.pendingEvent = event;
      state.lastEventDay = day;
      eventTriggered = true;
    }
  }

  return { day, upkeepCost, healed, eventTriggered };
}

// Advance multiple days (for travel)
export function advanceDays(state: GameState, days: number): DayResult[] {
  const results: DayResult[] = [];
  for (let i = 0; i < days; i++) {
    results.push(advanceDay(state));
  }
  return results;
}

export function isSeasonOver(state: GameState): boolean {
  return state.currentDay > SEASON_LENGTH || state.tournaments.every(t => t.status !== "upcoming");
}

export function nextTournament(state: GameState) {
  return state.tournaments
    .filter(t => t.status === "upcoming")
    .sort((a, b) => a.dayOfSeason - b.dayOfSeason)[0] ?? null;
}

export function daysUntilTournament(state: GameState, tournamentId: number): number {
  const t = state.tournaments.find(t => t.id === tournamentId);
  if (!t) return Infinity;
  return t.dayOfSeason - state.currentDay;
}
