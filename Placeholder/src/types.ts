export interface ColorSet {
  primary: number;
  accent: number;
  css: string;
}

export interface Knight {
  id: number;
  name: string;
  skill: number;
  strength: number;
  reputation: number;
  stamina: number;
  wins: number;
  losses: number;
  draws: number;
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

export interface GameState {
  seed: number;
  round: number;
  roster: Knight[];
  opponents: Knight[];
  selectedKnightId: number | null;
  currentOpponent: Knight | null;
  matchLog: MatchLogEntry[];
  currentView: "map" | "tiltyard" | "summary";
  currentDay: number;
  seasonNumber: number;
  treasury: number;
  renown: number;
  seasonWinnings: number;
  seasonRenown: number;
  tournaments: Tournament[];
  activeTournament: Tournament | null;
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
