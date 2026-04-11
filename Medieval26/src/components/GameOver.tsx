import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skull } from 'lucide-react';
import { gameState } from '@/state';

interface GameOverProps {
  open: boolean;
}

export function GameOver({ open }: GameOverProps) {
  const knight = gameState.roster[0];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm border-danger/50"
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Skull className="w-6 h-6 text-stat-low" />
          </div>
          <DialogTitle className="text-stat-low">The Legend Ends</DialogTitle>
          <DialogDescription className="pt-2">
            Your household has fallen into ruin. With no coin and no equipment,
            the road ahead has closed.
          </DialogDescription>
        </DialogHeader>

        <Separator ornate className="my-2" />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gold-dim">Knight</span>
            <span className="text-gold-base">{knight.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gold-dim">Record</span>
            <span className="text-gold-base">{knight.wins}W {knight.losses}L {knight.draws}D</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gold-dim">Survived</span>
            <span className="text-gold-base">
              {gameState.seasonNumber} season{gameState.seasonNumber > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gold-dim">Renown</span>
            <span className="text-gold-accent">{gameState.renown}</span>
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button className="w-full text-base py-3" onClick={() => location.reload()}>
            Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
