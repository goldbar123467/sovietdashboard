import { gameState } from './state';
import { romanNumeral, generateTournaments } from './data';
import { renderer, camera, controls } from './scene/setup';
import { placeKnights } from './scene/knight3d';
import { renderUI } from './ui';
import { renderMap } from './map';
import { renderHousehold } from './ui/household';
import { renderShop } from './ui/shop';
import type { Tournament } from './types';
import { joustResult } from './animation';
import { advanceDays, isSeasonOver, SEASON_LENGTH } from './systems/calendar';
import { travelCost } from './systems/economy';
import { degradeAfterJoust, horseTravelBonus } from './systems/equipment';
import { injuryFromHit, worsenInjury } from './systems/injury';

export { SEASON_LENGTH };

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
  const knight = gameState.roster[0];
  const bonus = horseTravelBonus(knight);
  const effectiveTravelDays = Math.max(1, tournament.travelDays - bonus);
  const arrivalDay = gameState.currentDay + effectiveTravelDays;
  if (arrivalDay > tournament.dayOfSeason) return false;
  const cost = travelCost(effectiveTravelDays);
  if (gameState.treasury < cost) return false;
  return true;
}

export function getEffectiveTravelDays(tournament: Tournament): number {
  const knight = gameState.roster[0];
  const bonus = horseTravelBonus(knight);
  return Math.max(1, tournament.travelDays - bonus);
}

export function travelToTournament(tournament: Tournament) {
  if (!canTravelTo(tournament)) return;

  const knight = gameState.roster[0];
  const effectiveDays = getEffectiveTravelDays(tournament);
  const cost = travelCost(effectiveDays);

  gameState.treasury -= cost;

  // Advance days during travel (handles upkeep, healing, events)
  const daysBefore = gameState.currentDay;
  gameState.currentDay = tournament.dayOfSeason;

  gameState.activeTournament = tournament;
  gameState.currentOpponent = tournament.opponent;

  gameState.household.activityLog.push({
    day: daysBefore,
    text: `Traveled to ${tournament.name} (${effectiveDays} days, ${cost} marks).`,
    type: "travel",
  });

  checkMissedTournaments();

  // Recover stamina during travel (+5/day) and fatigue (+3/day)
  knight.stamina = Math.min(knight.maxStamina, knight.stamina + effectiveDays * 5);
  knight.fatigue = Math.max(0, knight.fatigue - effectiveDays * 3);

  switchView("tiltyard");
}

export function onJoustComplete() {
  const tournament = gameState.activeTournament;

  if (tournament) {
    const knight = gameState.roster[0];
    const playerWon = joustResult!.winner === knight;
    const isDraw = joustResult!.isDraw;

    // Equipment degradation
    const aHit = joustResult!.aHit; // player's hit (what they dealt)
    const bHit = joustResult!.bHit; // opponent's hit (what player received)
    const broken = degradeAfterJoust(knight, bHit.type, aHit.type);

    // Injury check from hit received
    const protection = knight.equipment.armor?.effects.protection ?? 0;
    if (knight.injury) {
      // Jousting while injured worsens it
      worsenInjury(knight);
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `${knight.name}'s injury worsened from jousting!`,
        type: "injury",
      });
    } else {
      const newInjury = injuryFromHit(bHit, protection);
      if (newInjury) {
        knight.injury = newInjury;
        gameState.household.activityLog.push({
          day: gameState.currentDay,
          text: `${knight.name} suffered a ${newInjury.type} during the joust!`,
          type: "injury",
        });
      }
    }

    // Broken equipment log
    for (const name of broken) {
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `${name} broke during the joust!`,
        type: "event",
      });
    }

    if (playerWon) {
      tournament.result = "win";
      gameState.treasury += tournament.prizePurse;
      gameState.seasonWinnings += tournament.prizePurse;
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `Victory at ${tournament.name}! Won ${tournament.prizePurse} marks.`,
        type: "tournament",
      });
    } else if (isDraw) {
      tournament.result = "draw";
      const halfPrize = Math.floor(tournament.prizePurse / 2);
      gameState.treasury += halfPrize;
      gameState.seasonWinnings += halfPrize;
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `Draw at ${tournament.name}. Received ${halfPrize} marks.`,
        type: "tournament",
      });
    } else {
      tournament.result = "loss";
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `Defeated at ${tournament.name}.`,
        type: "tournament",
      });
    }

    tournament.status = "attended";
    gameState.renown += tournament.prestige;
    gameState.seasonRenown += tournament.prestige;
    gameState.round++;

    // Travel back home
    const returnDays = getEffectiveTravelDays(tournament);
    gameState.currentDay = tournament.dayOfSeason + 1 + returnDays;

    // Recover during return travel
    knight.stamina = Math.min(knight.maxStamina, knight.stamina + returnDays * 5);
    knight.fatigue = Math.max(0, knight.fatigue - returnDays * 3);

    checkMissedTournaments();
    gameState.activeTournament = null;

    if (isSeasonOver(gameState)) {
      showSeasonSummary();
    } else {
      switchView("household");
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

  const knight = gameState.roster[0];
  document.getElementById("sum-knights")!.innerHTML =
    `<div class="summary-knight-row">${knight.name} &mdash; ${knight.wins}W ${knight.losses}L ${knight.draws}D &middot; REP ${knight.reputation}</div>`;

  gameState.currentView = "summary";
  hideAllViews();
  document.getElementById("season-summary")!.classList.add("visible");
}

export function beginNewSeason() {
  gameState.seasonNumber++;
  gameState.currentDay = 1;
  gameState.seasonWinnings = 0;
  gameState.seasonRenown = 0;
  gameState.lastEventDay = 0;
  gameState.pendingEvent = null;
  gameState.tournaments = generateTournaments();

  const knight = gameState.roster[0];
  knight.stamina = knight.maxStamina;
  knight.fatigue = 0;
  // Injury carries over between seasons

  gameState.activeTournament = null;

  document.getElementById("season-summary")!.classList.remove("visible");
  switchView("household");
  renderUI();
}

function hideAllViews() {
  document.getElementById("map-view")!.classList.remove("visible");
  document.getElementById("household-view")!.classList.remove("visible");
  document.getElementById("shop-view")!.classList.remove("visible");
  renderer.domElement.style.display = "none";
  document.getElementById("joust-btn")!.style.display = "none";
  document.getElementById("opponent-section")!.style.display = "none";
  document.getElementById("tournament-detail")!.classList.remove("visible");
}

export function switchView(target: "household" | "map" | "tiltyard" | "shop") {
  const fade = document.getElementById("view-fade")!;

  fade.classList.add("active");

  setTimeout(() => {
    hideAllViews();

    if (target === "household") {
      gameState.currentView = "household";
      document.getElementById("household-view")!.classList.add("visible");
      renderHousehold();
    } else if (target === "map") {
      gameState.currentView = "map";
      document.getElementById("map-view")!.classList.add("visible");
      renderMap();
    } else if (target === "shop") {
      gameState.currentView = "shop";
      document.getElementById("shop-view")!.classList.add("visible");
      renderShop();
    } else if (target === "tiltyard") {
      gameState.currentView = "tiltyard";
      renderer.domElement.style.display = "block";
      document.getElementById("joust-btn")!.style.display = "block";
      document.getElementById("opponent-section")!.style.display = "block";

      const sel = gameState.roster[0];
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
