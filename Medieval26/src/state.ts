import type { GameState } from './types';
import { HERALDIC_COLORS, generateKnight, generateTournaments } from './data';

export const gameState: GameState = {
  seed: 42,
  round: 1,
  roster: [],
  opponents: [],
  selectedKnightId: null,
  currentOpponent: null,
  matchLog: [],
  currentView: "household",
  currentDay: 1,
  seasonNumber: 1,
  treasury: 50,
  renown: 0,
  seasonWinnings: 0,
  seasonRenown: 0,
  tournaments: [],
  activeTournament: null,
  household: {
    name: "Iron Lance",
    location: "Midlands",
    activityLog: [],
  },
  pendingEvent: null,
  lastEventDay: 0,
};

// Phase 1: Single knight with starter gear
const playerKnight = generateKnight(HERALDIC_COLORS[0], true);
gameState.roster.push(playerKnight);
gameState.selectedKnightId = playerKnight.id;

// Generate tournaments for season 1
gameState.tournaments = generateTournaments();
gameState.currentOpponent = gameState.tournaments[0].opponent;
