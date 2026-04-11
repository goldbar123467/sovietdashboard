// ═══════════════════════════════════════════════════════════
// Equipment
// ═══════════════════════════════════════════════════════════
export interface EquipmentEffects {
  skillBonus?: number;
  strengthBonus?: number;
  staminaBonus?: number;
  staminaCost?: number;
  protection?: number;      // Injury severity reduction
  blockBonus?: number;      // % added to block chance
  travelBonus?: number;     // Days reduced from travel
}

export interface EquipmentTemplate {
  name: string;
  type: EquipmentSlot;
  tier: 1 | 2 | 3;
  cost: number;
  maxDurability: number;
  effects: EquipmentEffects;
}

export type EquipmentSlot = "lance" | "armor" | "horse" | "shield";

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentSlot;
  tier: 1 | 2 | 3;
  cost: number;
  durability: number;
  maxDurability: number;
  effects: EquipmentEffects;
}

// ═══════════════════════════════════════════════════════════
// Injury
// ═══════════════════════════════════════════════════════════
export type InjuryType = "bruise" | "sprain" | "fracture" | "concussion";

export interface Injury {
  type: InjuryType;
  severity: number;       // 1-3
  daysRemaining: number;
  statPenalty: {
    skill?: number;
    strength?: number;
    stamina?: number;
  };
}

// ═══════════════════════════════════════════════════════════
// Household & Activity Log
// ═══════════════════════════════════════════════════════════
export type LogEntryType = "training" | "purchase" | "event" | "tournament" | "travel" | "rest" | "injury";

export interface LogEntry {
  day: number;
  text: string;
  type: LogEntryType;
}

export interface Household {
  name: string;
  location: string;
  activityLog: LogEntry[];
}

// ═══════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════
export interface GameEvent {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
}

export interface EventChoice {
  label: string;
  effect: (state: GameState) => string; // returns narrative text
}

// ═══════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════
export interface ColorSet {
  primary: number;
  accent: number;
  css: string;
}

export interface Knight {
  id: number;
  name: string;
  // Core stats (0-100)
  skill: number;
  strength: number;
  stamina: number;
  maxStamina: number;
  reputation: number;
  // Condition
  fatigue: number;         // 0-100, accumulates from training
  injury: Injury | null;
  // Record
  wins: number;
  losses: number;
  draws: number;
  // Equipment slots
  equipment: {
    lance: Equipment | null;
    armor: Equipment | null;
    horse: Equipment | null;
    shield: Equipment | null;
  };
  // Appearance
  primary: number;
  accent: number;
  css: string;
}

export interface HitResult {
  type: "miss" | "glance" | "solid" | "shatter";
  score: number;
  label: string;
}

export interface JoustResult {
  knightA: Knight;
  knightB: Knight;
  aHit: HitResult;
  bHit: HitResult;
  winner: Knight | null;
  loser: Knight | null;
  isDraw: boolean;
  narrative: string;
}

export interface Tournament {
  id: number;
  name: string;
  mapX: number;
  mapY: number;
  dayOfSeason: number;
  travelDays: number;
  prizePurse: number;
  prestige: number;
  opponent: Knight;
  status: "upcoming" | "attended" | "missed";
  result: "win" | "loss" | "draw" | null;
}

export interface MatchLogEntry {
  round: number | null;
  narrative: string;
  isDraw: boolean;
  playerWon: boolean;
  isMissed: boolean;
}

export type GameView = "household" | "map" | "shop" | "tiltyard" | "summary" | "gameover";

export interface GameState {
  seed: number;
  round: number;
  roster: Knight[];
  opponents: Knight[];
  selectedKnightId: number | null;
  currentOpponent: Knight | null;
  matchLog: MatchLogEntry[];
  currentView: GameView;
  currentDay: number;
  seasonNumber: number;
  treasury: number;
  renown: number;
  seasonWinnings: number;
  seasonRenown: number;
  tournaments: Tournament[];
  activeTournament: Tournament | null;
  household: Household;
  // Event state
  pendingEvent: GameEvent | null;
  lastEventDay: number;
}

export interface KnightUserData {
  horse: THREE.Group & { userData: { legs: THREE.Mesh[] } };
  rider: THREE.Group;
  lance: THREE.Mesh;
  shield: THREE.Mesh;
}

// Extend THREE.Group to include our userData
import type * as THREE from 'three';
export type KnightGroup = THREE.Group & { userData: KnightUserData };
