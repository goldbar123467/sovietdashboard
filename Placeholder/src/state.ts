import type { GameState } from './types';
import { HERALDIC_COLORS, OPPONENT_COLORS, generateKnight, generateTournaments } from './data';

export const gameState: GameState = {
  seed: 42,
  round: 1,
  roster: [],
  opponents: [],
  selectedKnightId: null,
  currentOpponent: null,
  matchLog: [],
  currentView: "map",
  currentDay: 1,
  seasonNumber: 1,
  treasury: 50,
  renown: 0,
  seasonWinnings: 0,
  seasonRenown: 0,
  tournaments: [],
  activeTournament: null,
};

// Generate 3 player knights
for (let i = 0; i < 3; i++) {
  gameState.roster.push(generateKnight(HERALDIC_COLORS[i]));
}
// Generate 3 opponent knights (kept for compatibility)
for (let i = 0; i < 3; i++) {
  gameState.opponents.push(generateKnight(OPPONENT_COLORS[i]));
}
// Select first knight by default
gameState.selectedKnightId = gameState.roster[0].id;

// Generate tournaments for season 1
gameState.tournaments = generateTournaments();
gameState.currentOpponent = gameState.tournaments[0].opponent;
