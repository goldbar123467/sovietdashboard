import { gameState } from '../state';
import { EQUIPMENT_CATALOG } from '../data';
import { sellPrice } from '../systems/economy';
import { equipmentSummary } from '../systems/equipment';
import type { EquipmentSlot, Equipment, EquipmentTemplate } from '../types';

const SLOT_ORDER: EquipmentSlot[] = ["lance", "armor", "horse", "shield"];
const SLOT_LABELS: Record<EquipmentSlot, string> = {
  lance: "Lances",
  armor: "Armor",
  horse: "Horses",
  shield: "Shields",
};

export function renderShop(): void {
  const container = document.getElementById("shop-view")!;
  const knight = gameState.roster[0];

  let html = `
    <div class="shop-layout">
      <div class="shop-header">
        <h2>The Merchant</h2>
        <div class="shop-flavor">"What'll it be, my lord?"</div>
        <div class="shop-treasury">Treasury: <span class="gold">${gameState.treasury}</span> marks</div>
        <button id="shop-close-btn" class="shop-close">&times; Close</button>
      </div>
      <div class="shop-content">
  `;

  for (const slot of SLOT_ORDER) {
    const items = EQUIPMENT_CATALOG.filter(t => t.type === slot);
    const equipped = knight.equipment[slot];

    html += `<div class="shop-category">
      <div class="shop-cat-label">${SLOT_LABELS[slot]}</div>`;

    for (const item of items) {
      const isEquipped = equipped?.name === item.name;
      const canBuy = gameState.treasury >= item.cost || (isEquipped ? false : equipped ? gameState.treasury + sellPrice(equipped.cost) >= item.cost : false);
      const effectsText = templateEffects(item);

      html += `<div class="shop-item ${isEquipped ? 'equipped' : ''} ${!canBuy && !isEquipped ? 'unaffordable' : ''}">
        <div class="shop-item-header">
          <span class="shop-item-name">${item.name}</span>
          <span class="shop-item-cost">${item.cost} marks</span>
        </div>
        <div class="shop-item-effects">${effectsText}</div>
        <div class="shop-item-dur">Durability: ${item.type === "horse" ? "&infin;" : item.maxDurability}</div>
        ${isEquipped
          ? '<span class="shop-equipped-badge">Equipped</span>'
          : `<button class="shop-buy-btn" data-item="${item.name}" ${!canBuy ? 'disabled' : ''}>Buy</button>`
        }
      </div>`;
    }

    // Show currently equipped item with sell option
    if (equipped) {
      const refund = sellPrice(equipped.cost);
      const durText = equipped.type === "horse" ? "" : ` (${equipped.durability}/${equipped.maxDurability} dur)`;
      html += `<div class="shop-equipped-section">
        <span class="shop-equipped-label">Equipped: ${equipped.name}${durText}</span>
        <button class="shop-sell-btn" data-slot="${slot}">Sell for ${refund}m</button>
      </div>`;
    }

    html += `</div>`;
  }

  html += `</div></div>`;
  container.innerHTML = html;
}

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
  return parts.join(" &middot; ");
}
