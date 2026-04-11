import { gameState } from './state';
import { placeKnights } from './scene/knight3d';
import { joustState } from './animation';
import { injuryLabel } from './systems/injury';

function statColor(val: number): string {
  if (val >= 70) return "good";
  if (val >= 50) return "mid";
  return "low";
}

export function renderUI() {
  // Header
  document.getElementById("season-display")!.textContent = String(gameState.seasonNumber);
  document.getElementById("day-display")!.textContent = String(gameState.currentDay);
  document.getElementById("treasury-display")!.textContent = String(gameState.treasury);

  // Roster (single knight in Phase 1)
  const rosterEl = document.getElementById("roster")!;
  rosterEl.innerHTML = "";
  for (const k of gameState.roster) {
    const card = document.createElement("div");
    card.className = "knight-card selected";

    const injuryHtml = k.injury ? `<div class="stats injury-status">${injuryLabel(k.injury)}</div>` : "";
    const fatigueClass = k.fatigue > 70 ? "low" : k.fatigue > 40 ? "mid" : "good";

    card.innerHTML = `
      <div class="name"><span class="color-dot" style="background:${k.css}"></span>${k.name}</div>
      <div class="stats">
        SKL <span class="val ${statColor(k.skill)}">${k.skill}</span>
        STR <span class="val ${statColor(k.strength)}">${k.strength}</span>
        STA <span class="val ${statColor(k.stamina)}">${k.stamina}</span>
      </div>
      <div class="stats">
        REP <span class="val">${k.reputation}</span>
        FAT <span class="val ${fatigueClass}">${k.fatigue}</span>
        <span class="record">${k.wins}W ${k.losses}L ${k.draws}D</span>
      </div>
      ${injuryHtml}
    `;
    rosterEl.appendChild(card);
  }

  // Opponent (only visible in tiltyard view)
  if (gameState.currentView === "tiltyard" && gameState.currentOpponent) {
    const oppEl = document.getElementById("opponent")!;
    const o = gameState.currentOpponent;
    oppEl.innerHTML = `
      <div class="opponent-card">
        <div class="name"><span class="color-dot" style="background:${o.css}"></span>${o.name}</div>
        <div class="stats">
          SKL <span class="val">${o.skill}</span>
          STR <span class="val">${o.strength}</span>
          STA <span class="val">${o.stamina}</span>
        </div>
        <div class="stats">
          REP <span class="val">${o.reputation}</span>
          <span class="record">${o.wins}W ${o.losses}L ${o.draws}D</span>
        </div>
      </div>
    `;
  }

  // Match log
  const logEl = document.getElementById("match-log")!;
  if (gameState.matchLog.length === 0) {
    logEl.innerHTML = '<div class="hint">No jousts yet</div>';
  } else {
    logEl.innerHTML = gameState.matchLog.slice(-8).reverse().map(entry => {
      if (entry.isMissed) {
        return `<div class="log-entry">
          <span class="result-missed">MISSED</span>
          <div class="narrative">${entry.narrative}</div>
        </div>`;
      }
      const resultClass = entry.isDraw ? "result-draw" : (entry.playerWon ? "result-win" : "result-loss");
      const resultText = entry.isDraw ? "DRAW" : (entry.playerWon ? "WIN" : "LOSS");
      return `<div class="log-entry">
        <span class="round-num">R${entry.round}</span>
        <span class="${resultClass}">${resultText}</span>
        <div class="narrative">${entry.narrative}</div>
      </div>`;
    }).join("");
  }
}
