import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import type { GameEvent } from '@/types';
import { gameState } from '@/state';

interface EventDialogProps {
  event: GameEvent | null;
  onChoice: (choiceIndex: number) => void;
}

export function EventDialog({ event, onChoice }: EventDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={!!event} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-gold-accent animate-glow" />
          </div>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription className="pt-2 leading-relaxed">
            {event.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-4">
          {event.choices.map((choice, i) => (
            <Button
              key={i}
              variant="secondary"
              className="w-full justify-center py-3 text-sm"
              onClick={() => onChoice(i)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
