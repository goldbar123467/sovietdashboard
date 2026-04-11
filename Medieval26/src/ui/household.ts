import { gameState } from '../state';
import { canTrain } from '../systems/training';
import { nextTournament } from '../systems/calendar';
import { injuryLabel } from '../systems/injury';
import { equipmentSummary } from '../systems/equipment';
import { renderActivityLog } from './activity-log';
import type { Equipment } from '../types';

export function renderHousehold(): void {
  const container = document.getElementById("household-view")!;
  const knight = gameState.roster[0];
  const next = nextTournament(gameState);

  // Knight status section
  const injuryStatus = knight.injury
    ? `<div class="hh-injury">${injuryLabel(knight.injury)}</div>`
    : "";

  const fatigueClass = knight.fatigue > 70 ? "low" : knight.fatigue > 40 ? "mid" : "good";

  function renderSlot(label: string, item: Equipment | null): string {
    if (!item) return `<div class="eq-slot empty"><span class="eq-label">${label}:</span> <span class="eq-empty">None</span></div>`;
    const durText = item.type === "horse" ? "" : ` (${item.durability}/${item.maxDurability})`;
    const durClass = item.type !== "horse" && item.durability <= 2 ? "eq-low" : "";
    return `<div class="eq-slot">
      <span class="eq-label">${label}:</span>
      <span class="eq-name">${item.name}</span>
      <span class="eq-dur ${durClass}">${durText}</span>
    </div>`;
  }

  // Next tournament info
  let nextInfo = "";
  if (next) {
    const daysAway = next.dayOfSeason - gameState.currentDay;
    const travelDays = next.travelDays;
    nextInfo = `
      <div class="hh-next-tournament">
        <div class="hh-next-label">Next tournament</div>
        <div class="hh-next-name">${next.name}</div>
        <div class="hh-next-detail">${daysAway} days away (${travelDays} day travel)</div>
      </div>`;
  } else {
    nextInfo = `<div class="hh-next-tournament"><div class="hh-next-label">No tournaments remaining</div></div>`;
  }

  const canTrainNow = canTrain(knight);
  const trainDisabled = !canTrainNow ? "disabled" : "";
  const trainTooltip = !canTrainNow ? "title=\"Cannot train while injured\"" : "";

  container.innerHTML = `
    <div class="hh-layout">
      <div class="hh-main">
        <div class="hh-title">
          <h2>${gameState.household.name}</h2>
          <div class="hh-meta">Day ${gameState.currentDay} / 180 &middot; Season ${gameState.seasonNumber} &middot; ${gameState.treasury} marks</div>
        </div>

        <div class="hh-knight-status">
          <div class="hh-knight-name"><span class="color-dot" style="background:${knight.css}"></span>${knight.name}</div>
          <div class="hh-stats-row">
            <div class="hh-stat">SKL <span class="val ${statColor(knight.skill)}">${knight.skill}</span></div>
            <div class="hh-stat">STR <span class="val ${statColor(knight.strength)}">${knight.strength}</span></div>
            <div class="hh-stat">STA <span class="val ${statColor(knight.stamina)}">${knight.stamina}/${knight.maxStamina}</span></div>
          </div>
          <div class="hh-stats-row">
            <div class="hh-stat">REP <span class="val">${knight.reputation}</span></div>
            <div class="hh-stat">FAT <span class="val ${fatigueClass}">${knight.fatigue}</span></div>
            <div class="hh-stat"><span class="record">${knight.wins}W ${knight.losses}L ${knight.draws}D</span></div>
          </div>
          ${injuryStatus}
        </div>

        <div class="hh-equipment">
          <div class="hh-section-label">Equipment</div>
          ${renderSlot("Lance", knight.equipment.lance)}
          ${renderSlot("Armor", knight.equipment.armor)}
          ${renderSlot("Horse", knight.equipment.horse)}
          ${renderSlot("Shield", knight.equipment.shield)}
        </div>

        <div class="hh-actions">
          <div class="hh-section-label">Actions</div>
          <div class="hh-action-grid">
            <button id="action-train-skill" class="hh-action-btn" ${trainDisabled} ${trainTooltip}>
              <div class="action-icon">&#9876;</div>
              <div class="action-name">Train Skill</div>
            </button>
            <button id="action-train-strength" class="hh-action-btn" ${trainDisabled} ${trainTooltip}>
              <div class="action-icon">&#9775;</div>
              <div class="action-name">Train Strength</div>
            </button>
            <button id="action-train-stamina" class="hh-action-btn" ${trainDisabled} ${trainTooltip}>
              <div class="action-icon">&#9832;</div>
              <div class="action-name">Train Endurance</div>
            </button>
            <button id="action-rest" class="hh-action-btn">
              <div class="action-icon">&#9790;</div>
              <div class="action-name">Rest</div>
            </button>
            <button id="action-shop" class="hh-action-btn">
              <div class="action-icon">&#9878;</div>
              <div class="action-name">Shop</div>
            </button>
            <button id="action-map" class="hh-action-btn">
              <div class="action-icon">&#9873;</div>
              <div class="action-name">Map</div>
            </button>
          </div>
        </div>

        ${nextInfo}

        <div class="hh-log">
          <div class="hh-section-label">Activity Log</div>
          <div id="activity-log-entries"></div>
        </div>
      </div>
    </div>
  `;

  // Render activity log
  const logEl = document.getElementById("activity-log-entries")!;
  renderActivityLog(gameState.household.activityLog, logEl);
}

function statColor(val: number): string {
  if (val >= 70) return "good";
  if (val >= 50) return "mid";
  return "low";
}
