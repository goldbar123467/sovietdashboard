import type { GameState } from '../types';

export const DAILY_UPKEEP = 1;
export const TRAVEL_COST_PER_DAY = 3;

export function canAfford(state: GameState, amount: number): boolean {
  return state.treasury >= amount;
}

export function spend(state: GameState, amount: number): boolean {
  if (state.treasury < amount) return false;
  state.treasury -= amount;
  return true;
}

export function earn(state: GameState, amount: number): void {
  state.treasury += amount;
}

export function sellPrice(cost: number): number {
  return Math.floor(cost / 2);
}

export function deductDailyUpkeep(state: GameState): number {
  const cost = DAILY_UPKEEP;
  state.treasury -= cost;
  return cost;
}

export function travelCost(travelDays: number): number {
  return travelDays * TRAVEL_COST_PER_DAY;
}

export function isBankrupt(state: GameState): boolean {
  const knight = state.roster[0];
  if (state.treasury > 0) return false;
  // Bankrupt if no money AND no equipment left to sell
  const eq = knight.equipment;
  return !eq.lance && !eq.armor && !eq.horse && !eq.shield;
}
