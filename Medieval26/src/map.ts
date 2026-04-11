import { gameState } from './state';
import { HQ_MAP, romanNumeral } from './data';
import { canTravelTo, getEffectiveTravelDays } from './season';
import { travelCost } from './systems/economy';
import { SEASON_LENGTH } from './systems/calendar';
import { GB_PATHS } from './gb-paths';
import type { Tournament } from './types';

export function renderMap() {
  document.getElementById("map-day")!.textContent = String(gameState.currentDay);
  document.getElementById("map-treasury")!.textContent = String(gameState.treasury);
  document.getElementById("map-season-title")!.innerHTML = `Season ${romanNumeral(gameState.seasonNumber)} &mdash; Spring to Autumn`;
  document.getElementById("season-bar-fill")!.style.width = `${Math.min(100, (gameState.currentDay / SEASON_LENGTH) * 100)}%`;
  buildMapSVG();
}

export function buildMapSVG() {
  const container = document.getElementById("map-svg-container")!;
  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // Crop viewBox to center on Great Britain (data spans roughly x:14-86, y:5-96)
  svg.setAttribute("viewBox", "10 0 80 100");
  svg.setAttribute("width", String(Math.min(w * 0.85, h * 0.75)));
  svg.setAttribute("height", String(Math.min(h * 0.9, w * 1.1)));
  svg.style.overflow = "visible";

  // ── Great Britain map from real SVG paths ──
  // Original SVG is 1000x1000; scale(0.1) maps it to our 0-100 viewBox

  // Coastline shadow layer — subtle outer glow behind the island
  const shadowGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  shadowGroup.setAttribute("transform", "scale(0.1)");
  shadowGroup.classList.add("gb-county");
  for (const p of GB_PATHS) {
    const shadow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadow.setAttribute("d", p.d);
    shadow.setAttribute("fill", "none");
    shadow.setAttribute("stroke", "rgba(90,60,20,0.15)");
    shadow.setAttribute("stroke-width", "18");
    shadow.setAttribute("stroke-linejoin", "round");
    shadow.setAttribute("stroke-linecap", "round");
    shadowGroup.appendChild(shadow);
  }
  svg.appendChild(shadowGroup);

  // Main map layer
  const mapGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  mapGroup.setAttribute("transform", "scale(0.1)");

  for (const p of GB_PATHS) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.d);
    path.setAttribute("fill", "rgba(170,145,100,0.4)");
    path.setAttribute("stroke", "#7a5a2a");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.classList.add("gb-county");
    mapGroup.appendChild(path);
  }

  svg.appendChild(mapGroup);

  // Coastline highlight — thin bright edge on top
  const coastGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  coastGroup.setAttribute("transform", "scale(0.1)");
  coastGroup.classList.add("gb-county");
  for (const p of GB_PATHS) {
    const coast = document.createElementNS("http://www.w3.org/2000/svg", "path");
    coast.setAttribute("d", p.d);
    coast.setAttribute("fill", "none");
    coast.setAttribute("stroke", "rgba(210,190,140,0.35)");
    coast.setAttribute("stroke-width", "2");
    coast.setAttribute("stroke-linejoin", "round");
    coast.setAttribute("stroke-linecap", "round");
    coastGroup.appendChild(coast);
  }
  svg.appendChild(coastGroup);

  // ── Compass rose ──
  const compass = document.createElementNS("http://www.w3.org/2000/svg", "g");
  compass.setAttribute("transform", "translate(16,8) scale(0.5)");
  const compassPaths = [
    { d: "M 0,-10 L 2,-2 0,-4 -2,-2 Z", fill: "#6b5030" },
    { d: "M 0,10 L 2,2 0,4 -2,2 Z", fill: "#8a7050" },
    { d: "M 10,0 L 2,2 4,0 2,-2 Z", fill: "#8a7050" },
    { d: "M -10,0 L -2,2 -4,0 -2,-2 Z", fill: "#6b5030" },
  ];
  for (const p of compassPaths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.d);
    path.setAttribute("fill", p.fill);
    path.setAttribute("opacity", "0.5");
    compass.appendChild(path);
  }
  const nLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  nLabel.setAttribute("x", "0");
  nLabel.setAttribute("y", "-13");
  nLabel.setAttribute("text-anchor", "middle");
  nLabel.setAttribute("font-size", "5");
  nLabel.setAttribute("fill", "#6b5030");
  nLabel.setAttribute("font-family", "Georgia, serif");
  nLabel.setAttribute("opacity", "0.5");
  nLabel.textContent = "N";
  compass.appendChild(nLabel);
  svg.appendChild(compass);

  // ── HQ banner in the Atlantic ──
  const hqGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  hqGroup.setAttribute("transform", "translate(24, 52)");

  // Banner background
  const banner = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  banner.setAttribute("x", "-12"); banner.setAttribute("y", "-8");
  banner.setAttribute("width", "24"); banner.setAttribute("height", "18");
  banner.setAttribute("rx", "1.5"); banner.setAttribute("ry", "1.5");
  banner.setAttribute("fill", "rgba(35,25,12,0.85)");
  banner.setAttribute("stroke", "#8a6a3a");
  banner.setAttribute("stroke-width", "0.6");
  hqGroup.appendChild(banner);

  // Inner border
  const inner = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  inner.setAttribute("x", "-10.5"); inner.setAttribute("y", "-6.5");
  inner.setAttribute("width", "21"); inner.setAttribute("height", "15");
  inner.setAttribute("rx", "0.8"); inner.setAttribute("ry", "0.8");
  inner.setAttribute("fill", "none");
  inner.setAttribute("stroke", "#5a4a30");
  inner.setAttribute("stroke-width", "0.3");
  inner.setAttribute("stroke-dasharray", "1,0.5");
  hqGroup.appendChild(inner);

  // Castle icon (larger)
  const castle = document.createElementNS("http://www.w3.org/2000/svg", "g");
  castle.setAttribute("transform", "translate(0,-3) scale(1.5)");
  const castlePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  castlePath.setAttribute("d", "M -3,-4 L -3,-1 -2,-1 -2,-2 -1,-2 -1,-1 0,-1 0,-2 1,-2 1,-1 2,-1 2,-4 1,-4 1,-3 0,-3 0,-4 -1,-4 -1,-3 -2,-3 Z M -3,-1 L -3,1 3,1 3,-1 Z");
  castlePath.setAttribute("fill", "#d4a843");
  castlePath.setAttribute("stroke", "#6b4226");
  castlePath.setAttribute("stroke-width", "0.2");
  castle.appendChild(castlePath);
  hqGroup.appendChild(castle);

  // House name
  const houseName = document.createElementNS("http://www.w3.org/2000/svg", "text");
  houseName.setAttribute("x", "0"); houseName.setAttribute("y", "4");
  houseName.setAttribute("text-anchor", "middle");
  houseName.setAttribute("font-size", "2.8");
  houseName.setAttribute("fill", "#e8d5a3");
  houseName.setAttribute("font-family", "Georgia, serif");
  houseName.setAttribute("letter-spacing", "0.8");
  houseName.textContent = "IRON LANCE";
  hqGroup.appendChild(houseName);

  // Subtitle
  const hqSub = document.createElementNS("http://www.w3.org/2000/svg", "text");
  hqSub.setAttribute("x", "0"); hqSub.setAttribute("y", "7");
  hqSub.setAttribute("text-anchor", "middle");
  hqSub.setAttribute("font-size", "1.6");
  hqSub.setAttribute("fill", "#8a7a60");
  hqSub.setAttribute("font-family", "Georgia, serif");
  hqSub.setAttribute("font-style", "italic");
  hqSub.textContent = "Your Household";
  hqGroup.appendChild(hqSub);

  svg.appendChild(hqGroup);

  // ── Tournament markers ──
  for (const t of gameState.tournaments) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${t.mapX}, ${t.mapY})`);
    g.classList.add("tournament-marker");
    g.dataset.tournamentId = String(t.id);

    if (t.status === "missed") g.classList.add("missed");
    if (t.status === "attended") g.classList.add("attended");

    // Invisible hit area — larger than visible marker for easy clicking
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hitArea.setAttribute("cx", "0");
    hitArea.setAttribute("cy", "-2");
    hitArea.setAttribute("r", "2.5");
    hitArea.classList.add("marker-hit-area");
    g.appendChild(hitArea);

    // Hover glow ring — visible on hover via CSS
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    glow.setAttribute("cx", "0");
    glow.setAttribute("cy", "0");
    glow.setAttribute("r", "3");
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", "#d4a843");
    glow.setAttribute("stroke-width", "0.5");
    glow.setAttribute("opacity", "0");
    glow.classList.add("marker-glow");
    g.appendChild(glow);

    // Banner pole
    const pole = document.createElementNS("http://www.w3.org/2000/svg", "line");
    pole.setAttribute("x1", "0"); pole.setAttribute("y1", "-6");
    pole.setAttribute("x2", "0"); pole.setAttribute("y2", "0");
    pole.setAttribute("stroke", "#5a4020");
    pole.setAttribute("stroke-width", "0.4");
    g.appendChild(pole);

    // Flag color
    let flagColor: string;
    if (t.status === "missed") {
      flagColor = "#666";
    } else if (t.status === "attended") {
      flagColor = t.result === "win" ? "#4a8a4a" : t.result === "loss" ? "#8a4a4a" : "#8a8a4a";
    } else {
      const presColors = ["#8a6a3a", "#9a7a3a", "#b08a40", "#c4983a", "#d4a843"];
      flagColor = presColors[t.prestige - 1];
    }

    const flag = document.createElementNS("http://www.w3.org/2000/svg", "path");
    flag.setAttribute("d", "M 0,-6 L 4,-5 4,-2.5 0,-3.5 Z");
    flag.setAttribute("fill", flagColor);
    flag.setAttribute("stroke", "#3a2a10");
    flag.setAttribute("stroke-width", "0.2");
    g.appendChild(flag);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", "0"); dot.setAttribute("cy", "0"); dot.setAttribute("r", "1");
    dot.setAttribute("fill", flagColor);
    dot.setAttribute("stroke", "#3a2a10");
    dot.setAttribute("stroke-width", "0.2");
    g.appendChild(dot);

    // Per-marker label offsets to prevent overlap
    const labelOffsets: Record<number, { dx: number; dy: number; anchor: string }> = {
      0: { dx: -5, dy: 3.5, anchor: "end" },     // Winchester — below-left
      1: { dx: -6, dy: -1, anchor: "end" },       // Kenilworth — left
      2: { dx: 5, dy: 1, anchor: "start" },       // Smithfield — right
      3: { dx: 5, dy: -1, anchor: "start" },      // York — right
      4: { dx: -6, dy: 3, anchor: "end" },        // Hereford — left-below
      5: { dx: 5, dy: -1, anchor: "start" },      // Lincoln — right
    };
    const off = labelOffsets[t.id] || { dx: 5, dy: 0, anchor: "start" };
    const labelX = String(off.dx);
    const anchor = off.anchor;

    // Leader line from dot to label area
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leader.setAttribute("x1", "0"); leader.setAttribute("y1", "0");
    leader.setAttribute("x2", String(off.dx * 0.6)); leader.setAttribute("y2", String(off.dy - 1));
    leader.setAttribute("stroke", "#8a7050");
    leader.setAttribute("stroke-width", "0.2");
    leader.setAttribute("opacity", "0.5");
    g.appendChild(leader);

    // MISSED label
    if (t.status === "missed") {
      const missedLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      missedLabel.setAttribute("x", labelX); missedLabel.setAttribute("y", String(off.dy - 2.5));
      missedLabel.setAttribute("text-anchor", anchor);
      missedLabel.setAttribute("font-size", "1.8");
      missedLabel.setAttribute("fill", "#8a5040");
      missedLabel.setAttribute("font-family", "Georgia, serif");
      missedLabel.setAttribute("font-weight", "bold");
      missedLabel.setAttribute("letter-spacing", "0.5");
      missedLabel.textContent = "MISSED";
      g.appendChild(missedLabel);
    }

    // Result label for attended
    if (t.status === "attended" && t.result) {
      const resLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      resLabel.setAttribute("x", labelX); resLabel.setAttribute("y", String(off.dy - 2.5));
      resLabel.setAttribute("text-anchor", anchor);
      resLabel.setAttribute("font-size", "1.6");
      resLabel.setAttribute("font-family", "Georgia, serif");
      resLabel.setAttribute("font-weight", "bold");
      if (t.result === "win") { resLabel.setAttribute("fill", "#4a8a4a"); resLabel.textContent = "VICTORY"; }
      else if (t.result === "loss") { resLabel.setAttribute("fill", "#8a4a4a"); resLabel.textContent = "DEFEAT"; }
      else { resLabel.setAttribute("fill", "#8a8a4a"); resLabel.textContent = "DRAW"; }
      g.appendChild(resLabel);
    }

    // Name label
    const nameLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nameLabel.setAttribute("x", labelX);
    nameLabel.setAttribute("y", String(t.status !== "upcoming" ? off.dy : off.dy - 1.5));
    nameLabel.setAttribute("text-anchor", anchor);
    nameLabel.setAttribute("font-size", "1.8");
    nameLabel.setAttribute("fill", "#5a4020");
    nameLabel.setAttribute("font-family", "Georgia, serif");
    nameLabel.textContent = t.name.replace("Tournament at ", "").replace("Grand Tourney at ", "").replace("Tourney at ", "").replace("Joust at ", "");
    g.appendChild(nameLabel);

    // Day label
    const dayLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    dayLabel.setAttribute("x", labelX);
    dayLabel.setAttribute("y", String(t.status !== "upcoming" ? off.dy + 2 : off.dy + 0.5));
    dayLabel.setAttribute("text-anchor", anchor);
    dayLabel.setAttribute("font-size", "1.4");
    dayLabel.setAttribute("fill", "#8a7050");
    dayLabel.setAttribute("font-family", "Georgia, serif");
    dayLabel.textContent = `Day ${t.dayOfSeason}`;
    g.appendChild(dayLabel);

    svg.appendChild(g);
  }

  // ── Title cartouche ──
  const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  titleText.setAttribute("x", "50"); titleText.setAttribute("y", "99");
  titleText.setAttribute("text-anchor", "middle");
  titleText.setAttribute("font-size", "3.5");
  titleText.setAttribute("fill", "#5a4020");
  titleText.setAttribute("font-family", "Georgia, serif");
  titleText.setAttribute("font-style", "italic");
  titleText.setAttribute("letter-spacing", "1");
  titleText.textContent = "The Realm of England";
  svg.appendChild(titleText);

  const subtitleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  subtitleText.setAttribute("x", "50"); subtitleText.setAttribute("y", "102");
  subtitleText.setAttribute("text-anchor", "middle");
  subtitleText.setAttribute("font-size", "2");
  subtitleText.setAttribute("fill", "#8a7050");
  subtitleText.setAttribute("font-family", "Georgia, serif");
  subtitleText.textContent = "- Anno Domini MCCLXX -";
  svg.appendChild(subtitleText);

  container.innerHTML = "";
  container.appendChild(svg);
  attachMarkerListeners();
}

function attachMarkerListeners() {
  const tooltip = document.getElementById("map-tooltip")!;
  const container = document.getElementById("map-svg-container")!;

  document.querySelectorAll(".tournament-marker").forEach(marker => {
    const tId = parseInt((marker as HTMLElement).dataset.tournamentId!);
    const tournament = gameState.tournaments.find(t => t.id === tId)!;

    marker.addEventListener("mouseenter", () => {
      const svgEl = container.querySelector("svg")!;
      const svgRect = svgEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const viewBox = svgEl.viewBox.baseVal;
      const scaleX = svgRect.width / viewBox.width;
      const scaleY = svgRect.height / viewBox.height;

      const tooltipX = svgRect.left - containerRect.left + (tournament.mapX - viewBox.x) * scaleX + 20;
      const tooltipY = svgRect.top - containerRect.top + (tournament.mapY - viewBox.y) * scaleY - 20;

      tooltip.style.left = tooltipX + "px";
      tooltip.style.top = tooltipY + "px";
      tooltip.querySelector(".tt-name")!.textContent = tournament.name;

      let dayText = `Day ${tournament.dayOfSeason}`;
      if (tournament.status === "missed") dayText += " (passed)";
      else if (tournament.status === "attended") dayText += " (attended)";
      else {
        const daysUntil = tournament.dayOfSeason - gameState.currentDay;
        dayText += daysUntil > 0 ? ` (${daysUntil} days away)` : " (today)";
      }
      tooltip.querySelector(".tt-day")!.textContent = dayText;
      tooltip.classList.add("visible");
    });

    marker.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });

    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tournament.status !== "upcoming") return;
      showTournamentDetail(tournament);
    });
  });
}

export function showTournamentDetail(tournament: Tournament) {
  const detail = document.getElementById("tournament-detail")!;
  const effectiveDays = getEffectiveTravelDays(tournament);
  const cost = travelCost(effectiveDays);

  document.getElementById("td-name")!.textContent = tournament.name;
  document.getElementById("td-date")!.textContent = `Day ${tournament.dayOfSeason} of the season`;
  document.getElementById("td-travel")!.textContent = `${effectiveDays} days each way`;
  const totalDays = effectiveDays + 1 + effectiveDays;
  document.getElementById("td-total-days")!.textContent = `${totalDays} days`;
  document.getElementById("td-cost")!.textContent = `${cost} marks`;
  document.getElementById("td-prize")!.textContent = `${tournament.prizePurse} marks`;
  document.getElementById("td-prestige")!.textContent = "\u2605".repeat(tournament.prestige) + "\u2606".repeat(5 - tournament.prestige);

  const opp = tournament.opponent;
  document.getElementById("td-opp-name")!.textContent = opp.name;
  document.getElementById("td-opp-stats")!.innerHTML = `SKL <span class="val">${opp.skill}</span> STR <span class="val">${opp.strength}</span> STA <span class="val">${opp.stamina}</span> REP <span class="val">${opp.reputation}</span>`;

  const statusEl = document.getElementById("td-status")!;
  const travelBtn = document.getElementById("travel-btn") as HTMLButtonElement;
  const travelInfo = document.getElementById("td-travel-info")!;

  if (tournament.status === "missed") {
    statusEl.innerHTML = '<span class="td-status-badge missed">Missed</span>';
    travelBtn.style.display = "none";
    travelInfo.textContent = "";
  } else if (tournament.status === "attended") {
    const badgeClass = `attended-${tournament.result}`;
    statusEl.innerHTML = `<span class="td-status-badge ${badgeClass}">${tournament.result!.toUpperCase()}</span>`;
    travelBtn.style.display = "none";
    travelInfo.textContent = "";
  } else if (canTravelTo(tournament)) {
    statusEl.innerHTML = "";
    travelBtn.style.display = "block";
    travelBtn.disabled = false;
    const daysUntil = tournament.dayOfSeason - gameState.currentDay;
    travelInfo.textContent = `Departs immediately. Arrives in ${effectiveDays} days.`;
    if (daysUntil > effectiveDays) {
      travelInfo.textContent = `${daysUntil} days until the tourney. Travel takes ${effectiveDays} days.`;
    }
  } else {
    statusEl.innerHTML = "";
    travelBtn.style.display = "block";
    travelBtn.disabled = true;
    const arrivalDay = gameState.currentDay + effectiveDays;
    if (arrivalDay > tournament.dayOfSeason) {
      travelInfo.textContent = "Too late to arrive in time.";
    } else {
      travelInfo.textContent = "Cannot afford travel costs.";
    }
  }

  detail.dataset.tournamentId = String(tournament.id);
  detail.classList.add("visible");
}
