import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sword, Shield, Dumbbell, Moon, ShoppingBag, Map,
  Heart, Zap, Star, Trophy, AlertTriangle, Sparkles
} from 'lucide-react';
import { gameState } from '@/state';
import { canTrain } from '@/systems/training';
import { nextTournament } from '@/systems/calendar';
import { injuryLabel } from '@/systems/injury';
import type { Equipment, Knight, LogEntry } from '@/types';

function statVariant(val: number): "good" | "mid" | "low" {
  if (val >= 70) return "good";
  if (val >= 50) return "mid";
  return "low";
}

function StatBar({ label, value, max, icon }: { label: string; value: number; max: number; icon: React.ReactNode }) {
  const v = statVariant(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-gold-dim uppercase tracking-wider font-heading">
          {icon}{label}
        </span>
        <Badge variant={v}>{value}{max !== 100 ? `/${max}` : ''}</Badge>
      </div>
      <Progress value={value} max={max} variant={v} />
    </div>
  );
}

function EquipmentSlotDisplay({ label, item, icon }: { label: string; item: Equipment | null; icon: React.ReactNode }) {
  if (!item) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-bg-deep/30 border border-border-subtle/50">
        <span className="text-gold-dim/40">{icon}</span>
        <span className="text-xs text-gold-dim/40 italic font-mono uppercase tracking-wider">{label}: Empty</span>
      </div>
    );
  }
  const isLowDur = item.type !== "horse" && item.durability <= 2;
  const durText = item.type === "horse" ? null : `${item.durability}/${item.maxDurability}`;
  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-md border transition-colors ${
      isLowDur
        ? 'bg-stat-low/8 border-stat-low/30'
        : 'bg-bg-deep/30 border-border-subtle/50 hover:border-border-base'
    }`}>
      <span className="text-gold-accent">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gold-bright font-medium truncate">{item.name}</span>
          {item.tier > 1 && (
            <span className="text-[10px] text-gold-accent/60">{'★'.repeat(item.tier)}</span>
          )}
        </div>
        {durText && (
          <div className="text-[10px] font-mono text-gold-dim/60 mt-0.5">
            DUR {durText}
            {isLowDur && <span className="text-stat-low ml-1 animate-flicker">LOW</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function LogTypeIcon({ type }: { type: string }) {
  const cls = "w-3 h-3";
  switch (type) {
    case "training": return <Dumbbell className={`${cls} text-stat-good`} />;
    case "purchase": return <ShoppingBag className={`${cls} text-gold-accent`} />;
    case "tournament": return <Trophy className={`${cls} text-gold-bright`} />;
    case "injury": return <AlertTriangle className={`${cls} text-stat-low`} />;
    case "rest": return <Moon className={`${cls} text-info`} />;
    case "event": return <Sparkles className={`${cls} text-stat-mid`} />;
    case "travel": return <Map className={`${cls} text-gold-dim`} />;
    default: return null;
  }
}

interface HouseholdViewProps {
  onTrain: (focus: "skill" | "strength" | "stamina") => void;
  onRest: () => void;
  onSwitchView: (view: "shop" | "map") => void;
}

export function HouseholdView({ onTrain, onRest, onSwitchView }: HouseholdViewProps) {
  const knight = gameState.roster[0];
  const next = nextTournament(gameState);
  const canTrainNow = canTrain(knight);

  return (
    <div className="parchment-bg h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-6 py-8 space-y-6 animate-fade-in">

        {/* House Title */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Separator ornate className="w-16" />
            <h2 className="font-heading text-2xl tracking-[0.25em] text-gold-bright uppercase text-shimmer">
              {gameState.household.name}
            </h2>
            <Separator ornate className="w-16" />
          </div>
          <p className="text-sm text-gold-dim font-mono">
            Day {gameState.currentDay} / 180 &middot; Season {gameState.seasonNumber} &middot;{' '}
            <span className="text-gold-accent font-semibold">{gameState.treasury}</span> marks
          </p>
        </div>

        {/* Knight Status Card */}
        <Card className="gothic-arch overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full border-2 border-gold-accent/50 shadow-[0_0_12px_rgba(212,168,67,0.2)]"
                style={{ background: `radial-gradient(circle at 35% 35%, ${knight.css}dd, ${knight.css}88)` }}
              />
              <div>
                <CardTitle className="text-base">{knight.name}</CardTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="gold" className="text-[10px]">
                    {knight.wins}W {knight.losses}L {knight.draws}D
                  </Badge>
                  {knight.injury && (
                    <Badge variant="danger" className="text-[10px] animate-flicker">
                      {injuryLabel(knight.injury)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2.5">
              <StatBar
                label="Skill"
                value={knight.skill}
                max={100}
                icon={<Sword className="w-3 h-3" />}
              />
              <StatBar
                label="Strength"
                value={knight.strength}
                max={100}
                icon={<Dumbbell className="w-3 h-3" />}
              />
              <StatBar
                label="Stamina"
                value={knight.stamina}
                max={knight.maxStamina}
                icon={<Heart className="w-3 h-3" />}
              />
            </div>
            <Separator ornate />
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <Star className="w-3 h-3 text-gold-accent" />
                <span className="text-gold-dim">REP</span>
                <span className="text-gold-base">{knight.reputation}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-stat-mid" />
                <span className="text-gold-dim">FAT</span>
                <Badge variant={knight.fatigue > 70 ? "low" : knight.fatigue > 40 ? "mid" : "good"}>
                  {knight.fatigue}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3 h-3 text-gold-accent" />
                <span className="text-gold-dim">RENOWN</span>
                <span className="text-gold-accent">{gameState.renown}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Equipment Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-gold-accent" />
              Armory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <EquipmentSlotDisplay label="Lance" item={knight.equipment.lance} icon={<Sword className="w-4 h-4" />} />
              <EquipmentSlotDisplay label="Armor" item={knight.equipment.armor} icon={<Shield className="w-4 h-4" />} />
              <EquipmentSlotDisplay label="Horse" item={knight.equipment.horse} icon={<Sparkles className="w-4 h-4" />} />
              <EquipmentSlotDisplay label="Shield" item={knight.equipment.shield} icon={<Shield className="w-4 h-4" />} />
            </div>
          </CardContent>
        </Card>

        {/* Actions Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold-accent" />
              Daily Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                disabled={!canTrainNow}
                onClick={() => onTrain("skill")}
              >
                <Sword className="w-5 h-5 text-gold-accent" />
                <span className="text-[10px]">Train Skill</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                disabled={!canTrainNow}
                onClick={() => onTrain("strength")}
              >
                <Dumbbell className="w-5 h-5 text-gold-accent" />
                <span className="text-[10px]">Train Strength</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                disabled={!canTrainNow}
                onClick={() => onTrain("stamina")}
              >
                <Heart className="w-5 h-5 text-gold-accent" />
                <span className="text-[10px]">Train Endurance</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                onClick={onRest}
              >
                <Moon className="w-5 h-5 text-info" />
                <span className="text-[10px]">Rest</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                onClick={() => onSwitchView("shop")}
              >
                <ShoppingBag className="w-5 h-5 text-gold-accent" />
                <span className="text-[10px]">Shop</span>
              </Button>
              <Button
                variant="secondary"
                className="flex-col h-auto py-4 gap-1"
                onClick={() => onSwitchView("map")}
              >
                <Map className="w-5 h-5 text-gold-accent" />
                <span className="text-[10px]">Map</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Next Tournament */}
        {next && (
          <Card className="border-stat-good/20 bg-gradient-to-br from-stat-good/5 to-transparent">
            <CardContent className="pt-4 pb-4">
              <div className="text-center space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-stat-good/70 font-heading">
                  Next Tournament
                </div>
                <div className="font-heading text-base text-gold-bright tracking-wider">
                  {next.name}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-gold-dim">
                  <span>{next.dayOfSeason - gameState.currentDay} days away</span>
                  <span className="text-border-base">&middot;</span>
                  <span>{next.travelDays} day travel</span>
                  <span className="text-border-base">&middot;</span>
                  <span className="text-gold-accent">{next.prizePurse}m prize</span>
                </div>
                <div className="text-gold-accent text-xs">
                  {'★'.repeat(next.prestige)}{'☆'.repeat(5 - next.prestige)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!next && (
          <Card className="border-border-subtle bg-bg-deep/30">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-sm text-gold-dim italic">No tournaments remaining this season</p>
            </CardContent>
          </Card>
        )}

        {/* Activity Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="text-gold-accent">&#x1D56B;</span>
              Chronicle
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[200px]">
              <div className="px-5 pb-4">
                {gameState.household.activityLog.length === 0 ? (
                  <p className="text-xs text-gold-dim/40 italic text-center py-6">
                    The chronicle awaits your first deed...
                  </p>
                ) : (
                  <div className="space-y-0">
                    {gameState.household.activityLog.slice(-20).reverse().map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 py-2 border-b border-border-subtle/40 last:border-0 animate-fade-in"
                      >
                        <LogTypeIcon type={entry.type} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono text-gold-dim/50 mr-2">
                            Day {entry.day}
                          </span>
                          <span className={`text-xs ${logTextColor(entry.type)}`}>
                            {entry.text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function logTextColor(type: string): string {
  switch (type) {
    case "training": return "text-stat-good/80";
    case "purchase": return "text-gold-accent/80";
    case "tournament": return "text-gold-bright font-medium";
    case "injury": return "text-stat-low/80";
    case "rest": return "text-info/80";
    case "event": return "text-stat-mid/80";
    case "travel": return "text-gold-dim";
    default: return "text-gold-dim";
  }
}
