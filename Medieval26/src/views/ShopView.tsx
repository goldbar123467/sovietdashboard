import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Sword, Shield, Sparkles, ShoppingBag } from 'lucide-react';
import { gameState } from '@/state';
import { EQUIPMENT_CATALOG } from '@/data';
import { sellPrice } from '@/systems/economy';
import type { EquipmentSlot, EquipmentTemplate } from '@/types';

const SLOT_ORDER: EquipmentSlot[] = ["lance", "armor", "horse", "shield"];
const SLOT_LABELS: Record<EquipmentSlot, string> = {
  lance: "Lances", armor: "Armor", horse: "Horses", shield: "Shields"
};
const SLOT_ICONS: Record<EquipmentSlot, React.ReactNode> = {
  lance: <Sword className="w-4 h-4" />,
  armor: <Shield className="w-4 h-4" />,
  horse: <Sparkles className="w-4 h-4" />,
  shield: <Shield className="w-4 h-4" />,
};

function templateEffects(t: EquipmentTemplate): string {
  const parts: string[] = [];
  const e = t.effects;
  if (e.skillBonus && e.skillBonus > 0) parts.push(`SKL+${e.skillBonus}`);
  if (e.skillBonus && e.skillBonus < 0) parts.push(`SKL${e.skillBonus}`);
  if (e.strengthBonus) parts.push(`STR+${e.strengthBonus}`);
  if (e.staminaBonus) parts.push(`STA+${e.staminaBonus}`);
  if (e.staminaCost) parts.push(`STA-${e.staminaCost}`);
  if (e.protection) parts.push(`PROT+${e.protection}`);
  if (e.blockBonus) parts.push(`BLK+${e.blockBonus}%`);
  if (e.travelBonus) parts.push(`Travel-${e.travelBonus}d`);
  if (parts.length === 0) parts.push("No bonuses");
  return parts.join(" · ");
}

interface ShopViewProps {
  onBuy: (itemName: string) => void;
  onSell: (slot: EquipmentSlot) => void;
  onClose: () => void;
}

export function ShopView({ onBuy, onSell, onClose }: ShopViewProps) {
  const knight = gameState.roster[0];

  return (
    <div className="parchment-bg h-full overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-6 py-8 space-y-6 animate-fade-in">

        {/* Header */}
        <div className="text-center space-y-2 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
          <div className="flex items-center justify-center gap-3">
            <Separator ornate className="w-12" />
            <h2 className="font-heading text-xl tracking-[0.2em] text-gold-bright uppercase">
              The Merchant
            </h2>
            <Separator ornate className="w-12" />
          </div>
          <p className="text-sm text-gold-dim italic">"What'll it be, my lord?"</p>
          <div className="flex items-center justify-center gap-2 text-sm">
            <ShoppingBag className="w-4 h-4 text-gold-accent" />
            <span className="text-gold-dim">Treasury:</span>
            <span className="text-gold-accent font-semibold font-mono">{gameState.treasury}</span>
            <span className="text-gold-dim">marks</span>
          </div>
        </div>

        {/* Equipment Categories */}
        {SLOT_ORDER.map(slot => {
          const items = EQUIPMENT_CATALOG.filter(t => t.type === slot);
          const equipped = knight.equipment[slot];

          return (
            <Card key={slot}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="text-gold-accent">{SLOT_ICONS[slot]}</span>
                  {SLOT_LABELS[slot]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map(item => {
                  const isEquipped = equipped?.name === item.name;
                  const canBuy = gameState.treasury >= item.cost ||
                    (!isEquipped && equipped ? gameState.treasury + sellPrice(equipped.cost) >= item.cost : false);

                  return (
                    <div
                      key={item.name}
                      className={`flex flex-wrap items-center gap-3 p-3 rounded-md border transition-all ${
                        isEquipped
                          ? 'border-gold-accent/50 bg-gold-accent/8'
                          : !canBuy
                            ? 'border-border-subtle/50 bg-bg-deep/20 opacity-50'
                            : 'border-border-subtle/50 bg-bg-deep/30 hover:border-border-base'
                      }`}
                    >
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gold-bright font-medium">{item.name}</span>
                          <span className="text-xs text-gold-accent font-mono">{item.cost}m</span>
                          <span className="text-[10px] text-gold-accent/50">{'★'.repeat(item.tier)}</span>
                        </div>
                        <div className="text-[11px] font-mono text-gold-dim/70 mt-0.5">
                          {templateEffects(item)}
                        </div>
                        <div className="text-[10px] font-mono text-gold-dim/50 mt-0.5">
                          Durability: {item.type === "horse" ? "∞" : item.maxDurability}
                        </div>
                      </div>
                      {isEquipped ? (
                        <Badge variant="gold" className="text-[10px]">Equipped</Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!canBuy}
                          onClick={() => onBuy(item.name)}
                        >
                          Buy
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* Sell equipped item */}
                {equipped && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gold-dim italic">
                        Equipped: {equipped.name}
                        {equipped.type !== "horse" ? ` (${equipped.durability}/${equipped.maxDurability} dur)` : ''}
                      </span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onSell(slot)}
                      >
                        Sell for {sellPrice(equipped.cost)}m
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
