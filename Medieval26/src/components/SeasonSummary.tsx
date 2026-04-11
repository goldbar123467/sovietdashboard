import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trophy, Star, Coins, Scroll } from 'lucide-react';
import { gameState } from '@/state';
import { romanNumeral } from '@/data';

interface SeasonSummaryProps {
  open: boolean;
  onNewSeason: () => void;
}

export function SeasonSummary({ open, onNewSeason }: SeasonSummaryProps) {
  const attended = gameState.tournaments.filter(t => t.status === "attended").length;
  const missed = gameState.tournaments.filter(t => t.status === "missed").length;
  const wins = gameState.tournaments.filter(t => t.result === "win").length;
  const losses = gameState.tournaments.filter(t => t.result === "loss").length;
  const draws = gameState.tournaments.filter(t => t.result === "draw").length;
  const knight = gameState.roster[0];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-6 h-6 text-gold-accent animate-glow" />
          </div>
          <DialogTitle className="text-xl">
            Season {romanNumeral(gameState.seasonNumber)} Complete
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <SummaryRow icon={<Scroll className="w-4 h-4" />} label="Tournaments attended" value={`${attended} of 6`} />
          <SummaryRow icon={<Scroll className="w-4 h-4 text-stat-low" />} label="Tournaments missed" value={String(missed)} negative />
          <SummaryRow
            icon={<Trophy className="w-4 h-4" />}
            label="Record"
            value={`${wins}W / ${losses}L / ${draws}D`}
          />
          <SummaryRow icon={<Coins className="w-4 h-4 text-gold-accent" />} label="Total winnings" value={`${gameState.seasonWinnings} marks`} />
          <SummaryRow icon={<Star className="w-4 h-4 text-gold-accent" />} label="Renown earned" value={String(gameState.seasonRenown)} />
          <SummaryRow icon={<Coins className="w-4 h-4" />} label="Treasury" value={`${gameState.treasury} marks`} />
        </div>

        <Separator ornate className="my-2" />

        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] text-gold-dim/60 font-heading mb-2">
            Knight Standing
          </div>
          <div className="text-sm font-mono text-gold-dim">
            {knight.name} — {knight.wins}W {knight.losses}L {knight.draws}D · REP {knight.reputation}
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button className="w-full text-base py-3" onClick={onNewSeason}>
            Begin Next Season
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ icon, label, value, negative }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-border-subtle/30">
      <span className="flex items-center gap-2 text-gold-dim">
        {icon}
        {label}
      </span>
      <span className={`font-mono font-semibold ${negative ? 'text-stat-low' : 'text-gold-accent'}`}>
        {value}
      </span>
    </div>
  );
}
