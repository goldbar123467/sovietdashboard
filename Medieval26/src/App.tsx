import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, notify } from '@/store';
import { gameState } from '@/state';
import { simulateJoust } from '@/simulation';
import { joustState, startJoust, updateJoustAnimation, setOnJoustComplete, joustResult as getJoustResult } from '@/animation';
import { renderer, camera, controls, clock, scene } from '@/scene/setup';
import { placeKnights } from '@/scene/knight3d';
import { buildMapSVG } from '@/map';
import { rand } from '@/data';
import { trainKnight, applyTraining, canTrain } from '@/systems/training';
import { advanceDay, isSeasonOver } from '@/systems/calendar';
import { isBankrupt, travelCost } from '@/systems/economy';
import { buyEquipment, sellEquipmentSlot, degradeAfterJoust } from '@/systems/equipment';
import { trainingInjury, injuryFromHit, worsenInjury } from '@/systems/injury';
import { checkMissedTournaments, canTravelTo, getEffectiveTravelDays } from '@/season';
import { generateTournaments } from '@/data';
import type { TrainingFocus } from '@/systems/training';
import type { EquipmentSlot, GameView } from '@/types';

import { SidePanel } from '@/components/SidePanel';
import { HouseholdView } from '@/views/HouseholdView';
import { ShopView } from '@/views/ShopView';
import { MapView } from '@/views/MapView';
import { TiltyardView } from '@/views/TiltyardView';
import { EventDialog } from '@/components/EventDialog';
import { SeasonSummary } from '@/components/SeasonSummary';
import { GameOver } from '@/components/GameOver';

// Side-effect: import tiltyard geometry
import '@/scene/tiltyard';

export default function App() {
  // Subscribe to game state changes
  const version = useSyncExternalStore(subscribe, getSnapshot);

  // Local UI state
  const [transitioning, setTransitioning] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [joustActive, setJoustActive] = useState(false);
  const animFrameRef = useRef<number>(0);

  // Initialize: hide Three.js canvas, set up animation loop and joust callback
  useEffect(() => {
    // Hide the Three.js canvas initially (it's appended to body by scene/setup.ts)
    renderer.domElement.style.display = 'none';

    setOnJoustComplete(() => {
      handleJoustComplete();
    });

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (joustState !== "idle") {
        updateJoustAnimation(delta);
      }
      if (gameState.currentView === "tiltyard") {
        controls.update();
        renderer.render(scene, camera);
      }
    }
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    function onResize() {
      if (gameState.currentView === "tiltyard") {
        const canvas = renderer.domElement;
        const parent = canvas.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          camera.aspect = rect.width / rect.height;
          camera.updateProjectionMatrix();
          renderer.setSize(rect.width, rect.height);
        }
      }
      if (gameState.currentView === "map") {
        buildMapSVG();
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ─── Action Handlers ───────────────────────────────

  const checkGameEnd = useCallback(() => {
    if (isSeasonOver(gameState)) {
      // Mark all remaining as missed
      for (const t of gameState.tournaments) {
        if (t.status === "upcoming") t.status = "missed";
      }
      setShowSummary(true);
      return true;
    }
    if (isBankrupt(gameState)) {
      setShowGameOver(true);
      return true;
    }
    return false;
  }, []);

  const handleTrain = useCallback((focus: TrainingFocus) => {
    const knight = gameState.roster[0];
    if (!canTrain(knight)) return;

    const result = trainKnight(knight, focus);
    applyTraining(knight, result);
    gameState.household.activityLog.push({
      day: gameState.currentDay,
      text: result.narrative,
      type: "training",
    });

    if (result.injuryRisk) {
      knight.injury = trainingInjury();
      gameState.household.activityLog.push({
        day: gameState.currentDay,
        text: `${knight.name} strained himself during training! Bruised.`,
        type: "injury",
      });
    }

    const dayResult = advanceDay(gameState);
    if (!checkGameEnd() && dayResult.eventTriggered && gameState.pendingEvent) {
      setShowEvent(true);
    }
    notify();
  }, [checkGameEnd]);

  const handleRest = useCallback(() => {
    const knight = gameState.roster[0];
    const staminaGain = Math.min(knight.maxStamina - knight.stamina, 10 + Math.floor(rand() * 6));
    const fatigueReduction = 15;

    knight.stamina = Math.min(knight.maxStamina, knight.stamina + staminaGain);
    knight.fatigue = Math.max(0, knight.fatigue - fatigueReduction);

    gameState.household.activityLog.push({
      day: gameState.currentDay,
      text: `Rested. Stamina +${staminaGain}, fatigue -${Math.min(fatigueReduction, knight.fatigue + fatigueReduction)}.`,
      type: "rest",
    });

    const dayResult = advanceDay(gameState);
    if (!checkGameEnd() && dayResult.eventTriggered && gameState.pendingEvent) {
      setShowEvent(true);
    }
    notify();
  }, [checkGameEnd]);

  const switchView = useCallback((target: GameView) => {
    setTransitioning(true);
    setTimeout(() => {
      gameState.currentView = target;

      if (target === "tiltyard") {
        const sel = gameState.roster[0];
        if (sel && gameState.currentOpponent) {
          placeKnights(sel, gameState.currentOpponent);
        }
        camera.position.set(14, 9, 20);
        controls.target.set(0, 1, 0);
        controls.update();
      }

      notify();
      setTimeout(() => setTransitioning(false), 100);
    }, 400);
  }, []);

  const handleSwitchView = useCallback((view: "shop" | "map") => {
    switchView(view);
  }, [switchView]);

  const handleBuy = useCallback((itemName: string) => {
    const knight = gameState.roster[0];
    const error = buyEquipment(gameState, knight, itemName);
    if (error) return;
    gameState.household.activityLog.push({
      day: gameState.currentDay,
      text: `Bought ${itemName}.`,
      type: "purchase",
    });
    notify();
  }, []);

  const handleSell = useCallback((slot: EquipmentSlot) => {
    const knight = gameState.roster[0];
    const itemName = knight.equipment[slot]?.name ?? "item";
    const error = sellEquipmentSlot(gameState, knight, slot);
    if (error) return;
    gameState.household.activityLog.push({
      day: gameState.currentDay,
      text: `Sold ${itemName}.`,
      type: "purchase",
    });
    notify();
  }, []);

  const handleJoust = useCallback(() => {
    if (joustState !== "idle") return;
    if (gameState.currentView !== "tiltyard") return;

    const sel = gameState.roster[0];
    if (!sel || sel.stamina <= 0) return;

    const opp = gameState.currentOpponent!;
    placeKnights(sel, opp);

    const result = simulateJoust(sel, opp);
    const playerWon = result.winner === sel;
    const tournamentName = gameState.activeTournament ? gameState.activeTournament.name : "Practice";

    gameState.matchLog.push({
      round: gameState.round,
      narrative: `[${tournamentName}] ${result.narrative}`,
      isDraw: result.isDraw,
      playerWon: !result.isDraw && playerWon,
      isMissed: false,
    });

    setJoustActive(true);
    startJoust(result);
    notify();
  }, []);

  const handleJoustComplete = useCallback(() => {
    const tournament = gameState.activeTournament;
    const result = getJoustResult;

    if (tournament && result) {
      const knight = gameState.roster[0];
      const playerWon = result.winner === knight;
      const isDraw = result.isDraw;

      // Equipment degradation
      const aHit = result.aHit;
      const bHit = result.bHit;
      const broken = degradeAfterJoust(knight, bHit.type, aHit.type);

      // Injury check
      const protection = knight.equipment.armor?.effects.protection ?? 0;
      if (knight.injury) {
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

      // Travel back
      const returnDays = getEffectiveTravelDays(tournament);
      gameState.currentDay = tournament.dayOfSeason + 1 + returnDays;

      const k = gameState.roster[0];
      k.stamina = Math.min(k.maxStamina, k.stamina + returnDays * 5);
      k.fatigue = Math.max(0, k.fatigue - returnDays * 3);

      checkMissedTournaments();
      gameState.activeTournament = null;

      if (isSeasonOver(gameState)) {
        for (const t of gameState.tournaments) {
          if (t.status === "upcoming") t.status = "missed";
        }
        setShowSummary(true);
      } else {
        switchView("household");
      }
    } else {
      gameState.round++;
    }

    setJoustActive(false);
    notify();
  }, [switchView]);

  const handleEventChoice = useCallback((choiceIndex: number) => {
    const event = gameState.pendingEvent;
    if (!event) return;

    const narrative = event.choices[choiceIndex].effect(gameState);
    gameState.household.activityLog.push({
      day: gameState.currentDay,
      text: narrative,
      type: "event",
    });
    gameState.pendingEvent = null;
    setShowEvent(false);
    notify();
  }, []);

  const handleNewSeason = useCallback(() => {
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
    gameState.activeTournament = null;
    gameState.currentView = "household";

    setShowSummary(false);
    notify();
  }, []);

  const handleMapTravel = useCallback((tournamentId: number) => {
    const tournament = gameState.tournaments.find(t => t.id === tournamentId);
    if (!tournament || !canTravelTo(tournament)) return;

    const knight = gameState.roster[0];
    const effectiveDays = getEffectiveTravelDays(tournament);
    const cost = travelCost(effectiveDays);

    gameState.treasury -= cost;
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
    knight.stamina = Math.min(knight.maxStamina, knight.stamina + effectiveDays * 5);
    knight.fatigue = Math.max(0, knight.fatigue - effectiveDays * 3);

    switchView("tiltyard");
  }, [switchView]);

  // Determine current view
  const view = gameState.currentView;
  const showJoustBtn = view === "tiltyard";

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-deep">
      {/* Side Panel */}
      <SidePanel
        onJoust={handleJoust}
        joustDisabled={joustActive || joustState !== "idle"}
        showJoust={showJoustBtn}
      />

      {/* Main Content Area */}
      <div className="absolute top-0 left-[320px] right-0 bottom-0">
        {/* View Fade Transition */}
        <div
          className={`fixed top-0 left-[320px] right-0 bottom-0 bg-bg-deep z-50 transition-opacity duration-400 ${
            transitioning ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Views */}
        {view === "household" && (
          <HouseholdView
            onTrain={handleTrain}
            onRest={handleRest}
            onSwitchView={handleSwitchView}
          />
        )}

        {view === "shop" && (
          <ShopView
            onBuy={handleBuy}
            onSell={handleSell}
            onClose={() => switchView("household")}
          />
        )}

        {view === "map" && (
          <MapView onBack={() => switchView("household")} onTravel={handleMapTravel} />
        )}

        {view === "tiltyard" && (
          <TiltyardView />
        )}
      </div>

      {/* Dialogs */}
      <EventDialog
        event={showEvent ? gameState.pendingEvent : null}
        onChoice={handleEventChoice}
      />
      <SeasonSummary
        open={showSummary}
        onNewSeason={handleNewSeason}
      />
      <GameOver open={showGameOver} />
    </div>
  );
}
