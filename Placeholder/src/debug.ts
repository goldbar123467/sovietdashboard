import { gameState } from './state';
import { SEED } from './data';
import { SEASON_LENGTH } from './season';

declare global {
  interface Window { render_game_to_text: () => string; }
}

export function setupDebug() {
  window.render_game_to_text = function () {
    let out = `=== Tournament House ===\n`;
    out += `Seed: ${SEED} | Season: ${gameState.seasonNumber} | Day: ${gameState.currentDay}/${SEASON_LENGTH} | Treasury: ${gameState.treasury} marks\n\n`;
    out += `YOUR ROSTER:\n`;
    for (const k of gameState.roster) {
      const sel = k.id === gameState.selectedKnightId ? "*" : " ";
      out += `${sel} ${k.name} | SKL:${k.skill} STR:${k.strength} STA:${k.stamina} REP:${k.reputation} | ${k.wins}W ${k.losses}L ${k.draws}D\n`;
    }
    out += `\nTOURNAMENTS:\n`;
    for (const t of gameState.tournaments) {
      const status = t.status === "attended" ? `ATTENDED (${t.result})` : t.status === "missed" ? "MISSED" : `Day ${t.dayOfSeason}`;
      out += `  ${t.name} | ${status} | Prize: ${t.prizePurse}m | Prestige: ${"*".repeat(t.prestige)}\n`;
    }
    out += `\nMATCH LOG:\n`;
    for (const e of gameState.matchLog.slice(-5)) {
      out += `  ${e.isMissed ? "MISSED" : `R${e.round}`}: ${e.narrative}\n`;
    }
    return out;
  };

  console.log(window.render_game_to_text());
}
