import React, { useEffect } from 'react';
import { buildMapSVG } from '@/map';
import { gameState } from '@/state';
import { romanNumeral } from '@/data';
import { canTravelTo } from '@/season';

interface MapViewProps {
  onBack: () => void;
  onTravel: (tournamentId: number) => void;
}

export function MapView({ onBack, onTravel }: MapViewProps) {
  useEffect(() => {
    buildMapSVG();
  }, []);

  // Wire up imperative DOM event listeners for the map
  useEffect(() => {
    function handleTravel() {
      const detail = document.getElementById("tournament-detail")!;
      const tId = parseInt(detail.dataset.tournamentId!);
      if (!isNaN(tId)) {
        const tournament = gameState.tournaments.find(t => t.id === tId);
        if (tournament && canTravelTo(tournament)) {
          detail.classList.remove("visible");
          onTravel(tId);
        }
      }
    }

    function handleClose() {
      document.getElementById("tournament-detail")!.classList.remove("visible");
    }

    function handleMapClick(e: Event) {
      if ((e.target as Element).closest(".tournament-marker")) return;
      document.getElementById("tournament-detail")?.classList.remove("visible");
    }

    const travelBtn = document.getElementById("travel-btn");
    const closeBtn = document.getElementById("close-detail-btn");
    const mapContainer = document.getElementById("map-svg-container");

    travelBtn?.addEventListener("click", handleTravel);
    closeBtn?.addEventListener("click", handleClose);
    mapContainer?.addEventListener("click", handleMapClick);

    return () => {
      travelBtn?.removeEventListener("click", handleTravel);
      closeBtn?.removeEventListener("click", handleClose);
      mapContainer?.removeEventListener("click", handleMapClick);
    };
  }, [onTravel]);

  const pct = ((gameState.currentDay / 180) * 100).toFixed(1);

  return (
    <div className="h-full relative">
      <div className="map-parchment h-full">
        {/* Calendar overlay */}
        <div className="map-calendar">
          <div className="season-title font-heading">
            Season {romanNumeral(gameState.seasonNumber)} — Spring to Autumn
          </div>
          <div className="day-display">
            Day <span>{gameState.currentDay}</span> of 180
          </div>
          <div className="treasury-display">
            Treasury: <span>{gameState.treasury}</span> marks
          </div>
          <div className="season-bar">
            <div className="season-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Back button */}
        <button className="map-back-btn" onClick={onBack}>
          ← Back to Household
        </button>

        {/* SVG container */}
        <div className="map-svg-container" id="map-svg-container" />

        {/* Tooltip */}
        <div className="map-tooltip" id="map-tooltip">
          <div className="tt-name" />
          <div className="tt-day" />
        </div>

        {/* Tournament detail panel */}
        <div id="tournament-detail">
          <button id="close-detail-btn">×</button>
          <div className="td-name" id="td-name" />
          <div className="td-row"><span className="td-label">Date</span><span className="td-value" id="td-date" /></div>
          <div className="td-row"><span className="td-label">Travel</span><span className="td-value" id="td-travel" /></div>
          <div className="td-row"><span className="td-label">Total days away</span><span className="td-value" id="td-total-days" /></div>
          <div className="td-row"><span className="td-label">Travel cost</span><span className="td-value" id="td-cost" /></div>
          <div className="td-row"><span className="td-label">Prize purse</span><span className="td-value" id="td-prize" /></div>
          <div className="td-row"><span className="td-label">Prestige</span><span className="td-stars" id="td-prestige" /></div>
          <div className="td-opponent" id="td-opponent-section">
            <div className="td-label" style={{ marginBottom: 4 }}>Champion defending</div>
            <div className="opp-name" id="td-opp-name" />
            <div className="opp-stats" id="td-opp-stats" />
          </div>
          <div id="td-status" />
          <button id="travel-btn">Travel Here</button>
          <div className="td-travel-info" id="td-travel-info" />
        </div>
      </div>
    </div>
  );
}
