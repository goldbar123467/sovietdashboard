import { gameState } from './state';
import { romanNumeral, generateTournaments } from './data';
import { renderer, camera, controls } from './scene/setup';
import { placeKnights } from './scene/knight3d';
import { renderUI } from './ui';
import { renderMap } from './map';
import type { Tournament } from './types';
import { joustResult } from './animation';

export const SEASON_LENGTH = 180;

export function checkMissedTournaments() {
  for (const t of gameState.tournaments) {
    if (t.status === "upcoming" && t.dayOfSeason < gameState.currentDay) {
      t.status = "missed";
      gameState.matchLog.push({
        round: null,
        narrative: `${t.name} passed on day ${t.dayOfSeason}. We did not attend.`,
        isDraw: false,
        playerWon: false,
        isMissed: true,
      });
    }
  }
}

export function canTravelTo(tournament: Tournament): boolean {
  if (tournament.status !== "upcoming") return false;
  const arrivalDay = gameState.currentDay + tournament.travelDays;
  if (arrivalDay > tournament.dayOfSeason) return false;
  const cost = tournament.travelDays * 5;
  if (gameState.treasury < cost) return false;
  return true;
}

export function travelToTournament(tournament: Tournament) {
  if (!canTravelTo(tournament)) return;

  gameState.treasury -= tournament.travelDays * 5;
  gameState.currentDay = tournament.dayOfSeason;
  gameState.activeTournament = tournament;
  gameState.currentOpponent = tournament.opponent;

  checkMissedTournaments();

  // Recover stamina during travel
  for (const k of gameState.roster) {
    k.stamina = Math.min(100, k.stamina + tournament.travelDays * 5);
  }

  switchView("tiltyard");
}

export function onJoustComplete() {
  const tournament = gameState.activeTournament;

  if (tournament) {
    const sel = gameState.roster.find(k => k.id === gameState.selectedKnightId)!;
    const playerWon = joustResult!.winner === sel;
    const isDraw = joustResult!.isDraw;

    if (playerWon) {
      tournament.result = "win";
      gameState.treasury += tournament.prizePurse;
      gameState.seasonWinnings += tournament.prizePurse;
    } else if (isDraw) {
      tournament.result = "draw";
      const halfPrize = Math.floor(tournament.prizePurse / 2);
      gameState.treasury += halfPrize;
      gameState.seasonWinnings += halfPrize;
    } else {
      tournament.result = "loss";
    }

    tournament.status = "attended";
    gameState.renown += tournament.prestige;
    gameState.seasonRenown += tournament.prestige;
    gameState.round++;

    gameState.currentDay = tournament.dayOfSeason + 1 + tournament.travelDays;

    for (const k of gameState.roster) {
      if (k.id !== gameState.selectedKnightId) {
        k.stamina = Math.min(100, k.stamina + 15);
      }
    }

    checkMissedTournaments();
    gameState.activeTournament = null;

    if (gameState.currentDay > SEASON_LENGTH || gameState.tournaments.every(t => t.status !== "upcoming")) {
      showSeasonSummary();
    } else {
      switchView("map");
    }
  } else {
    gameState.round++;
  }

  (document.getElementById("joust-btn") as HTMLButtonElement).disabled = false;
  renderUI();
}

export function showSeasonSummary() {
  for (const t of gameState.tournaments) {
    if (t.status === "upcoming") {
      t.status = "missed";
    }
  }

  const attended = gameState.tournaments.filter(t => t.status === "attended").length;
  const missed = gameState.tournaments.filter(t => t.status === "missed").length;
  const wins = gameState.tournaments.filter(t => t.result === "win").length;
  const losses = gameState.tournaments.filter(t => t.result === "loss").length;
  const draws = gameState.tournaments.filter(t => t.result === "draw").length;

  document.getElementById("summary-title")!.textContent = `Season ${romanNumeral(gameState.seasonNumber)} Complete`;
  document.getElementById("sum-attended")!.textContent = `${attended} of 6`;
  document.getElementById("sum-missed")!.textContent = `${missed}`;
  document.getElementById("sum-record")!.textContent = `${wins} / ${losses} / ${draws}`;
  document.getElementById("sum-winnings")!.textContent = `${gameState.seasonWinnings} marks`;
  document.getElementById("sum-renown")!.textContent = `${gameState.seasonRenown}`;
  document.getElementById("sum-treasury")!.textContent = `${gameState.treasury} marks`;

  document.getElementById("sum-knights")!.innerHTML = gameState.roster.map(k =>
    `<div class="summary-knight-row">${k.name} &mdash; ${k.wins}W ${k.losses}L ${k.draws}D &middot; REP ${k.reputation}</div>`
  ).join("");

  gameState.currentView = "summary";
  document.getElementById("map-view")!.classList.remove("visible");
  renderer.domElement.style.display = "none";
  document.getElementById("season-summary")!.classList.add("visible");
}

export function beginNewSeason() {
  gameState.seasonNumber++;
  gameState.currentDay = 1;
  gameState.seasonWinnings = 0;
  gameState.seasonRenown = 0;
  gameState.tournaments = generateTournaments();

  for (const k of gameState.roster) {
    k.stamina = 100;
  }

  gameState.activeTournament = null;

  document.getElementById("season-summary")!.classList.remove("visible");
  switchView("map");
  renderUI();
  renderMap();
}

export function switchView(target: "map" | "tiltyard") {
  const fade = document.getElementById("view-fade")!;
  const mapView = document.getElementById("map-view")!;

  fade.classList.add("active");

  setTimeout(() => {
    if (target === "map") {
      gameState.currentView = "map";
      mapView.classList.add("visible");
      renderer.domElement.style.display = "none";
      document.getElementById("joust-btn")!.style.display = "none";
      document.getElementById("opponent-section")!.style.display = "none";
      document.getElementById("tournament-detail")!.classList.remove("visible");
      renderMap();
    } else if (target === "tiltyard") {
      gameState.currentView = "tiltyard";
      mapView.classList.remove("visible");
      renderer.domElement.style.display = "block";
      document.getElementById("joust-btn")!.style.display = "block";
      document.getElementById("opponent-section")!.style.display = "block";

      const sel = gameState.roster.find(k => k.id === gameState.selectedKnightId)!;
      placeKnights(sel, gameState.currentOpponent!);

      camera.position.set(14, 9, 20);
      controls.target.set(0, 1, 0);
      controls.update();
    }

    renderUI();

    setTimeout(() => {
      fade.classList.remove("active");
    }, 100);
  }, 400);
}
