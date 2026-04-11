import './style.css';

// Side-effect imports: these modules build scene geometry on load
import './scene/tiltyard';

// Module imports
import { preloadModels } from './scene/loader';
import { renderer, camera, controls, clock, scene } from './scene/setup';
import { placeKnights, knightAModel, knightBModel } from './scene/knight3d';
import { animateIdle } from './scene/knightAnim';
import { gameState } from './state';
import { joustState, updateJoustAnimation, setOnJoustComplete } from './animation';
import { onJoustComplete, beginNewSeason, canTravelTo, travelToTournament } from './season';
import { startMiniGame, updateMiniGame, isMiniGameActive, setOnMiniGameComplete } from './minigame';
import { renderUI } from './ui';
import { renderMap } from './map';
import { setupDebug } from './debug';

// ═══════════════════════════════════════════════════════════
// Wire the onJoustComplete callback (breaks circular dep)
// ═══════════════════════════════════════════════════════════
setOnJoustComplete(onJoustComplete);

// Wire minigame completion → season system
setOnMiniGameComplete((result) => {
  const sel = gameState.roster.find(k => k.id === gameState.selectedKnightId)!;
  const playerWon = result.winner === sel;
  const tournamentName = gameState.activeTournament ? gameState.activeTournament.name : "Practice";
  gameState.matchLog.push({
    round: gameState.round,
    narrative: `[${tournamentName}] ${result.narrative}`,
    isDraw: result.isDraw,
    playerWon: !result.isDraw && playerWon,
    isMissed: false,
  });

  onJoustComplete();
  (document.getElementById("joust-btn") as HTMLButtonElement).disabled = false;
  renderUI();
});

// ═══════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════

// Joust button → enters first-person minigame
document.getElementById("joust-btn")!.addEventListener("click", () => {
  if (joustState !== "idle") return;
  if (isMiniGameActive()) return;
  if (gameState.currentView !== "tiltyard") return;

  const sel = gameState.roster.find(k => k.id === gameState.selectedKnightId);
  if (!sel) return;

  if (sel.stamina <= 0) {
    alert("This knight is too exhausted to joust!");
    return;
  }

  const opp = gameState.currentOpponent!;
  placeKnights(sel, opp);

  startMiniGame(sel, opp);
  (document.getElementById("joust-btn") as HTMLButtonElement).disabled = true;
  renderUI();
});

// Travel button
document.getElementById("travel-btn")!.addEventListener("click", () => {
  const detail = document.getElementById("tournament-detail")!;
  const tId = parseInt(detail.dataset.tournamentId!);
  const tournament = gameState.tournaments.find(t => t.id === tId);
  if (tournament && canTravelTo(tournament)) {
    detail.classList.remove("visible");
    travelToTournament(tournament);
  }
});

// Close detail panel
document.getElementById("close-detail-btn")!.addEventListener("click", () => {
  document.getElementById("tournament-detail")!.classList.remove("visible");
});

// New season button
document.getElementById("new-season-btn")!.addEventListener("click", () => {
  beginNewSeason();
});

// Click on map background closes detail
document.getElementById("map-svg-container")!.addEventListener("click", (e) => {
  if ((e.target as Element).closest(".tournament-marker")) return;
  document.getElementById("tournament-detail")!.classList.remove("visible");
});

// ═══════════════════════════════════════════════════════════
// Resize
// ═══════════════════════════════════════════════════════════
window.addEventListener("resize", () => {
  const w = window.innerWidth - 320;
  camera.aspect = w / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(w, window.innerHeight);
  if (gameState.currentView === "map") {
    renderMap();
  }
});

// ═══════════════════════════════════════════════════════════
// Main Loop
// ═══════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (isMiniGameActive()) {
    updateMiniGame(delta);
    renderer.render(scene, camera);
    return;
  }

  if (joustState !== "idle") {
    updateJoustAnimation(delta);
  } else if (gameState.currentView === "tiltyard") {
    // Idle breathing animation when not jousting
    const t = clock.elapsedTime;
    if (knightAModel) animateIdle(knightAModel, t);
    if (knightBModel) animateIdle(knightBModel, t);
  }

  if (gameState.currentView === "tiltyard") {
    controls.update();
    renderer.render(scene, camera);
  }
}

// ═══════════════════════════════════════════════════════════
// Initial state: start in map view
// ═══════════════════════════════════════════════════════════
renderer.domElement.style.display = "none";
document.getElementById("joust-btn")!.style.display = "none";
document.getElementById("opponent-section")!.style.display = "none";

(async () => {
  await preloadModels();
  renderUI();
  renderMap();
  setupDebug();
  animate();
})();
