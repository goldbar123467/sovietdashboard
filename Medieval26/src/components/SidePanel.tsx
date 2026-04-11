import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sword, Shield, Crown, Scroll } from 'lucide-react';
import { gameState } from '@/state';
import { injuryLabel } from '@/systems/injury';

function statVariant(val: number): "good" | "mid" | "low" {
  if (val >= 70) return "good";
  if (val >= 50) return "mid";
  return "low";
}

interface SidePanelProps {
  onJoust: () => void;
  joustDisabled: boolean;
  showJoust: boolean;
}

export function SidePanel({ onJoust, joustDisabled, showJoust }: SidePanelProps) {
  const knight = gameState.roster[0];
  const opp = gameState.currentOpponent;
  const showOpp = gameState.currentView === "tiltyard" && opp;

  return (
    <div className="fixed top-0 left-0 w-[320px] h-screen bg-gradient-to-b from-bg-base to-bg-deep border-r-2 border-border-base z-10 flex flex-col select-none">

      {/* Header */}
      <div className="px-4 py-4 bg-gradient-to-br from-bg-elevated to-bg-base border-b border-border-base text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Crown className="w-4 h-4 text-gold-accent" />
          <h1 className="font-heading text-sm tracking-[0.2em] text-gold-bright uppercase">
            House of the {gameState.household.name}
          </h1>
        </div>
        <div className="text-xs font-mono text-gold-dim">
          Season <span className="text-gold-accent">{gameState.seasonNumber}</span>
          {' · '}Day <span className="text-gold-accent">{gameState.currentDay}</span> / 180
          {' · '}
          <span className="text-gold-accent">{gameState.treasury}</span> marks
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-1">

          {/* Section: Your Knight */}
          <div className="px-3 pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold-dim/60 font-heading flex items-center gap-1.5">
              <Sword className="w-3 h-3" /> Your Knight
            </div>
          </div>

          {/* Knight Card */}
          <div className="mx-3 p-3 rounded-md bg-gold-accent/6 border-l-[3px] border-gold-accent/60">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-6 h-6 rounded-full border border-gold-accent/40"
                style={{ background: knight.css }}
              />
              <span className="text-sm text-gold-bright font-medium">{knight.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-gold-dim">
              <div>SKL <Badge variant={statVariant(knight.skill)} className="text-[10px] px-1 py-0">{knight.skill}</Badge></div>
              <div>STR <Badge variant={statVariant(knight.strength)} className="text-[10px] px-1 py-0">{knight.strength}</Badge></div>
              <div>STA <Badge variant={statVariant(knight.stamina)} className="text-[10px] px-1 py-0">{knight.stamina}</Badge></div>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-gold-dim">
              <span>REP <span className="text-gold-base">{knight.reputation}</span></span>
              <span>FAT <Badge variant={knight.fatigue > 70 ? "low" : knight.fatigue > 40 ? "mid" : "good"} className="text-[10px] px-1 py-0">{knight.fatigue}</Badge></span>
              <span className="text-gold-dim/50">{knight.wins}W {knight.losses}L {knight.draws}D</span>
            </div>
            {knight.injury && (
              <div className="mt-1 text-[11px] text-stat-low italic animate-flicker">
                {injuryLabel(knight.injury)}
              </div>
            )}
          </div>

          {/* Opponent Section (only in tiltyard) */}
          {showOpp && opp && (
            <>
              <div className="px-3 pt-3 pb-1">
                <div className="text-[10px] uppercase tracking-[0.2em] text-danger/60 font-heading flex items-center gap-1.5">
                  <Shield className="w-3 h-3" /> Opponent
                </div>
              </div>
              <div className="mx-3 p-3 rounded-md bg-danger/6 border-l-[3px] border-danger/60">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-6 h-6 rounded-full border border-danger/40"
                    style={{ background: opp.css }}
                  />
                  <span className="text-sm text-danger-text font-medium">{opp.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-gold-dim/70">
                  <div>SKL <span className="text-danger-text/80">{opp.skill}</span></div>
                  <div>STR <span className="text-danger-text/80">{opp.strength}</span></div>
                  <div>STA <span className="text-danger-text/80">{opp.stamina}</span></div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-gold-dim/60">
                  <span>REP <span className="text-danger-text/60">{opp.reputation}</span></span>
                  <span className="text-gold-dim/40">{opp.wins}W {opp.losses}L {opp.draws}D</span>
                </div>
              </div>
            </>
          )}

          {/* Joust Button */}
          {showJoust && (
            <div className="px-3 pt-3">
              <Button
                className="w-full text-base py-3"
                disabled={joustDisabled}
                onClick={onJoust}
              >
                ⚔ Joust!
              </Button>
            </div>
          )}

          {/* Match Log */}
          <div className="px-3 pt-4 pb-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold-dim/60 font-heading flex items-center gap-1.5">
              <Scroll className="w-3 h-3" /> Match Log
            </div>
          </div>

          <div className="mx-3 mb-4">
            {gameState.matchLog.length === 0 ? (
              <p className="text-[11px] text-gold-dim/30 italic text-center py-3">No jousts yet</p>
            ) : (
              <div className="space-y-0">
                {gameState.matchLog.slice(-8).reverse().map((entry, i) => (
                  <div key={i} className="py-1.5 border-b border-border-subtle/30 last:border-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {entry.isMissed ? (
                        <span className="text-gold-dim/50 italic font-mono">MISSED</span>
                      ) : (
                        <>
                          <span className="text-gold-dim/40 font-mono">R{entry.round}</span>
                          <span className={`font-bold font-mono ${
                            entry.isDraw ? 'text-stat-mid' :
                            entry.playerWon ? 'text-stat-good' : 'text-stat-low'
                          }`}>
                            {entry.isDraw ? 'DRAW' : entry.playerWon ? 'WIN' : 'LOSS'}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-gold-dim/50 leading-tight mt-0.5">
                      {entry.narrative}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </ScrollArea>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border-subtle text-center">
        <span className="text-[9px] text-gold-dim/30">Drag to rotate · Scroll to zoom</span>
      </div>
    </div>
  );
}
