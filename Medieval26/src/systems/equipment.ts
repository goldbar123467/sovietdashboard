import type { Knight, Equipment, EquipmentSlot, GameState } from '../types';
import { createEquipment, getTemplate, getCatalogByType, EQUIPMENT_CATALOG } from '../data';
import { sellPrice, canAfford, spend, earn } from './economy';

export function buyEquipment(state: GameState, knight: Knight, templateName: string): string | null {
  const template = getTemplate(templateName);
  if (!template) return "Item not found.";
  if (!canAfford(state, template.cost)) return "Cannot afford this item.";

  // Auto-sell existing item in the same slot
  const existing = knight.equipment[template.type];
  if (existing) {
    const refund = sellPrice(existing.cost);
    earn(state, refund);
  }

  spend(state, template.cost);
  knight.equipment[template.type] = createEquipment(template);
  return null; // success
}

export function sellEquipmentSlot(state: GameState, knight: Knight, slot: EquipmentSlot): string | null {
  const item = knight.equipment[slot];
  if (!item) return "Nothing equipped in that slot.";

  const refund = sellPrice(item.cost);
  earn(state, refund);
  knight.equipment[slot] = null;
  return null;
}

// Degrade all equipped gear after a joust
export function degradeAfterJoust(knight: Knight, hitTaken: "miss" | "glance" | "solid" | "shatter", hitGiven: "miss" | "glance" | "solid" | "shatter"): string[] {
  const broken: string[] = [];

  // Lance: -1 per joust, -2 extra on shatter given
  if (knight.equipment.lance) {
    knight.equipment.lance.durability -= 1;
    if (hitGiven === "shatter") knight.equipment.lance.durability -= 2;
    if (knight.equipment.lance.durability <= 0) {
      broken.push(knight.equipment.lance.name);
      knight.equipment.lance = null;
    }
  }

  // Armor: -1 per joust, -2 extra on shatter taken
  if (knight.equipment.armor) {
    knight.equipment.armor.durability -= 1;
    if (hitTaken === "shatter") knight.equipment.armor.durability -= 2;
    if (knight.equipment.armor.durability <= 0) {
      broken.push(knight.equipment.armor.name);
      knight.equipment.armor = null;
    }
  }

  // Shield: -1 per joust
  if (knight.equipment.shield) {
    knight.equipment.shield.durability -= 1;
    if (knight.equipment.shield.durability <= 0) {
      broken.push(knight.equipment.shield.name);
      knight.equipment.shield = null;
    }
  }

  // Horse: no degradation

  return broken;
}

// Calculate effective joust stats with equipment bonuses
export function effectiveStats(knight: Knight): { skill: number; strength: number; stamina: number; blockChance: number; protection: number } {
  const { lance, armor, horse, shield } = knight.equipment;

  const skill = knight.skill
    + (lance?.effects.skillBonus ?? 0)
    + (armor?.effects.skillBonus ?? 0);

  const strength = knight.strength
    + (lance?.effects.strengthBonus ?? 0);

  const stamina = knight.stamina
    + (horse?.effects.staminaBonus ?? 0)
    - (armor?.effects.staminaCost ?? 0);

  const BASE_BLOCK = 10;
  const blockChance = BASE_BLOCK + (shield?.effects.blockBonus ?? 0);

  const protection = armor?.effects.protection ?? 0;

  return {
    skill: Math.max(0, skill),
    strength: Math.max(0, strength),
    stamina: Math.max(0, stamina),
    blockChance,
    protection,
  };
}

// Get travel day bonus from horse
export function horseTravelBonus(knight: Knight): number {
  return knight.equipment.horse?.effects.travelBonus ?? 0;
}

export function getShopItems(type?: EquipmentSlot) {
  if (type) return getCatalogByType(type);
  return EQUIPMENT_CATALOG;
}

export function equipmentSummary(item: Equipment): string {
  const parts: string[] = [];
  const e = item.effects;
  if (e.skillBonus && e.skillBonus > 0) parts.push(`SKL+${e.skillBonus}`);
  if (e.skillBonus && e.skillBonus < 0) parts.push(`SKL${e.skillBonus}`);
  if (e.strengthBonus) parts.push(`STR+${e.strengthBonus}`);
  if (e.staminaBonus) parts.push(`STA+${e.staminaBonus}`);
  if (e.staminaCost) parts.push(`STA-${e.staminaCost}`);
  if (e.protection) parts.push(`PROT+${e.protection}`);
  if (e.blockBonus) parts.push(`BLK+${e.blockBonus}%`);
  if (e.travelBonus) parts.push(`Travel-${e.travelBonus}d`);
  return parts.join("  ");
}
