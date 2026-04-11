import { gameState } from './state';
import { HQ_MAP, romanNumeral } from './data';
import { canTravelTo, travelToTournament, SEASON_LENGTH } from './season';
import type { Tournament } from './types';

export function renderMap() {
  document.getElementById("map-day")!.textContent = String(gameState.currentDay);
  document.getElementById("map-treasury")!.textContent = String(gameState.treasury);
  document.getElementById("map-season-title")!.innerHTML = `Season ${romanNumeral(gameState.seasonNumber)} &mdash; Spring to Autumn`;
  document.getElementById("season-bar-fill")!.style.width = `${Math.min(100, (gameState.currentDay / SEASON_LENGTH) * 100)}%`;
  buildMapSVG();
}

function buildMapSVG() {
  const container = document.getElementById("map-svg-container")!;
  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", String(Math.min(w * 0.7, h * 0.55)));
  svg.setAttribute("height", String(Math.min(h * 0.85, w * 0.95)));
  svg.style.overflow = "visible";

  // England outline
  const englandPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  englandPath.setAttribute("d", `
    M 48,2 C 50,3 53,2 55,4 L 58,6 C 59,7 57,9 56,10
    L 54,12 C 53,13 55,14 56,15 L 58,16 C 60,17 62,16 64,17
    L 66,19 C 67,21 65,22 63,23 L 60,24 C 58,25 59,27 61,28
    L 63,29 C 66,30 68,29 70,30 L 72,32 C 73,34 71,36 69,37
    L 67,38 C 65,39 66,41 68,42 L 70,43 C 72,44 74,43 75,45
    L 76,48 C 76,50 74,52 72,53 L 70,54 C 68,55 69,57 71,58
    L 73,60 C 74,62 73,64 71,65 L 69,66 C 67,67 66,69 67,71
    L 68,73 C 68,75 66,77 64,78 L 61,80 C 59,81 57,83 55,84
    L 52,86 C 50,87 48,88 46,87 L 43,85 C 41,84 39,82 38,80
    L 36,77 C 35,75 33,73 32,72 L 30,70 C 28,68 27,66 26,64
    L 25,61 C 24,58 23,55 24,53 L 25,50 C 26,48 25,46 24,44
    L 23,41 C 22,39 23,37 24,35 L 26,33 C 27,31 26,29 25,27
    L 24,25 C 24,23 25,20 27,18 L 30,16 C 32,15 33,13 34,12
    L 36,10 C 38,8 40,7 42,6 L 44,4 C 46,3 47,2 48,2 Z
  `);
  englandPath.setAttribute("fill", "none");
  englandPath.setAttribute("stroke", "#6b5030");
  englandPath.setAttribute("stroke-width", "0.8");
  englandPath.setAttribute("stroke-dasharray", "2,1");
  englandPath.setAttribute("opacity", "0.7");
  svg.appendChild(englandPath);

  const englandFill = englandPath.cloneNode() as SVGPathElement;
  englandFill.setAttribute("fill", "rgba(180,155,110,0.08)");
  englandFill.setAttribute("stroke", "none");
  svg.appendChild(englandFill);

  // Compass rose
  const compass = document.createElementNS("http://www.w3.org/2000/svg", "g");
  compass.setAttribute("transform", "translate(85,12) scale(0.5)");
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

  // HQ marker
  const hqGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  hqGroup.setAttribute("transform", `translate(${HQ_MAP.x}, ${HQ_MAP.y})`);

  const castle = document.createElementNS("http://www.w3.org/2000/svg", "path");
  castle.setAttribute("d", "M -3,-4 L -3,-1 -2,-1 -2,-2 -1,-2 -1,-1 0,-1 0,-2 1,-2 1,-1 2,-1 2,-4 1,-4 1,-3 0,-3 0,-4 -1,-4 -1,-3 -2,-3 Z M -3,-1 L -3,1 3,1 3,-1 Z");
  castle.setAttribute("fill", "#d4a843");
  castle.setAttribute("stroke", "#6b4226");
  castle.setAttribute("stroke-width", "0.3");
  hqGroup.appendChild(castle);

  const hqLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  hqLabel.setAttribute("x", "0");
  hqLabel.setAttribute("y", "4.5");
  hqLabel.setAttribute("text-anchor", "middle");
  hqLabel.setAttribute("font-size", "2.5");
  hqLabel.setAttribute("fill", "#5a4020");
  hqLabel.setAttribute("font-family", "Georgia, serif");
  hqLabel.setAttribute("font-style", "italic");
  hqLabel.textContent = "Iron Lance";
  hqGroup.appendChild(hqLabel);
  svg.appendChild(hqGroup);

  // Tournament markers
  for (const t of gameState.tournaments) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${t.mapX}, ${t.mapY})`);
    g.classList.add("tournament-marker");
    g.dataset.tournamentId = String(t.id);

    if (t.status === "missed") g.classList.add("missed");
    if (t.status === "attended") g.classList.add("attended");

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

    // MISSED label
    if (t.status === "missed") {
      const missedLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      missedLabel.setAttribute("x", "0"); missedLabel.setAttribute("y", "3.5");
      missedLabel.setAttribute("text-anchor", "middle");
      missedLabel.setAttribute("font-size", "2");
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
      resLabel.setAttribute("x", "0"); resLabel.setAttribute("y", "3.5");
      resLabel.setAttribute("text-anchor", "middle");
      resLabel.setAttribute("font-size", "1.8");
      resLabel.setAttribute("font-family", "Georgia, serif");
      resLabel.setAttribute("font-weight", "bold");
      if (t.result === "win") { resLabel.setAttribute("fill", "#4a8a4a"); resLabel.textContent = "VICTORY"; }
      else if (t.result === "loss") { resLabel.setAttribute("fill", "#8a4a4a"); resLabel.textContent = "DEFEAT"; }
      else { resLabel.setAttribute("fill", "#8a8a4a"); resLabel.textContent = "DRAW"; }
      g.appendChild(resLabel);
    }

    // Name label
    const nameLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nameLabel.setAttribute("x", "0");
    nameLabel.setAttribute("y", t.status !== "upcoming" ? "6" : "3.5");
    nameLabel.setAttribute("text-anchor", "middle");
    nameLabel.setAttribute("font-size", "2");
    nameLabel.setAttribute("fill", "#5a4020");
    nameLabel.setAttribute("font-family", "Georgia, serif");
    nameLabel.textContent = t.name.replace("Tournament at ", "").replace("Grand Tourney at ", "").replace("Tourney at ", "").replace("Joust at ", "");
    g.appendChild(nameLabel);

    // Day label
    const dayLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    dayLabel.setAttribute("x", "0");
    dayLabel.setAttribute("y", t.status !== "upcoming" ? "8.5" : "6");
    dayLabel.setAttribute("text-anchor", "middle");
    dayLabel.setAttribute("font-size", "1.6");
    dayLabel.setAttribute("fill", "#8a7050");
    dayLabel.setAttribute("font-family", "Georgia, serif");
    dayLabel.textContent = `Day ${t.dayOfSeason}`;
    g.appendChild(dayLabel);

    svg.appendChild(g);
  }

  // Title cartouche
  const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  titleText.setAttribute("x", "50"); titleText.setAttribute("y", "97");
  titleText.setAttribute("text-anchor", "middle");
  titleText.setAttribute("font-size", "3.5");
  titleText.setAttribute("fill", "#5a4020");
  titleText.setAttribute("font-family", "Georgia, serif");
  titleText.setAttribute("font-style", "italic");
  titleText.setAttribute("letter-spacing", "1");
  titleText.textContent = "The Realm of England";
  svg.appendChild(titleText);

  const subtitleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  subtitleText.setAttribute("x", "50"); subtitleText.setAttribute("y", "100");
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

      const tooltipX = svgRect.left - containerRect.left + tournament.mapX * scaleX + 20;
      const tooltipY = svgRect.top - containerRect.top + tournament.mapY * scaleY - 20;

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

    marker.addEventListener("click", () => {
      if (tournament.status !== "upcoming") return;
      showTournamentDetail(tournament);
    });
  });
}

export function showTournamentDetail(tournament: Tournament) {
  const detail = document.getElementById("tournament-detail")!;

  document.getElementById("td-name")!.textContent = tournament.name;
  document.getElementById("td-date")!.textContent = `Day ${tournament.dayOfSeason} of the season`;
  document.getElementById("td-travel")!.textContent = `${tournament.travelDays} days each way`;
  const totalDays = tournament.travelDays + 1 + tournament.travelDays;
  document.getElementById("td-total-days")!.textContent = `${totalDays} days`;
  const cost = tournament.travelDays * 5;
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
    travelInfo.textContent = `Departs immediately. Arrives in ${tournament.travelDays} days.`;
    if (daysUntil > tournament.travelDays) {
      travelInfo.textContent = `${daysUntil} days until the tourney. Travel takes ${tournament.travelDays} days.`;
    }
  } else {
    statusEl.innerHTML = "";
    travelBtn.style.display = "block";
    travelBtn.disabled = true;
    const arrivalDay = gameState.currentDay + tournament.travelDays;
    if (arrivalDay > tournament.dayOfSeason) {
      travelInfo.textContent = "Too late to arrive in time.";
    } else {
      travelInfo.textContent = "Cannot afford travel costs.";
    }
  }

  detail.dataset.tournamentId = String(tournament.id);
  detail.classList.add("visible");
}

// Export for event handler in main.ts
export { travelToTournament };
