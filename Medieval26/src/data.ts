import type { ColorSet, Knight, Tournament, EquipmentTemplate, Equipment, EquipmentSlot } from './types';

// ═══════════════════════════════════════════════════════════
// PRNG
// ═══════════════════════════════════════════════════════════
export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 42;
export const rand = mulberry32(SEED);

// ═══════════════════════════════════════════════════════════
// DATA TABLES
// ═══════════════════════════════════════════════════════════
export const FIRST_NAMES = [
  "Aldric", "Baldwin", "Conrad", "Dietrich", "Edmund",
  "Fulk", "Godfrey", "Hugh", "Ivo", "Jocelyn",
  "Lothar", "Milo", "Odo", "Percival", "Reynard",
  "Tancred", "Ulric", "Warin",
];

export const EPITHETS = [
  "the Bold", "of Anjou", "Ironarm", "the Red",
  "de Montfort", "Blackshield", "the Younger", "of Kent",
  "Strongbow", "the Pious", "Greycloak", "de Lusignan",
  "Halfhelm", "the Brave", "of Flanders", "Stormlance",
];

export const HERALDIC_COLORS: ColorSet[] = [
  { primary: 0x1565c0, accent: 0x42a5f5, css: "#1565c0" },
  { primary: 0x1b5e20, accent: 0x66bb6a, css: "#1b5e20" },
  { primary: 0x4a148c, accent: 0x9c27b0, css: "#4a148c" },
  { primary: 0x0d47a1, accent: 0x64b5f6, css: "#0d47a1" },
  { primary: 0x33691e, accent: 0x8bc34a, css: "#33691e" },
  { primary: 0x4e342e, accent: 0x8d6e63, css: "#4e342e" },
];

export const OPPONENT_COLORS: ColorSet[] = [
  { primary: 0xb71c1c, accent: 0xef5350, css: "#b71c1c" },
  { primary: 0x880e4f, accent: 0xe91e63, css: "#880e4f" },
  { primary: 0x5d4037, accent: 0xa1887f, css: "#5d4037" },
  { primary: 0x6d4c00, accent: 0xffa000, css: "#6d4c00" },
  { primary: 0x1a237e, accent: 0x5c6bc0, css: "#1a237e" },
  { primary: 0x004d40, accent: 0x26a69a, css: "#004d40" },
];

export const TOURNAMENT_TEMPLATES = [
  { name: "Tournament at Winchester", mapX: 71.7, mapY: 87.4, travelDays: 3, prizePurse: 30, prestige: 3 },
  { name: "Joust at Kenilworth",     mapX: 70.5, mapY: 77.7, travelDays: 2, prizePurse: 20, prestige: 2 },
  { name: "Grand Tourney at Smithfield", mapX: 77.5, mapY: 83.6, travelDays: 4, prizePurse: 60, prestige: 5 },
  { name: "Tourney at York",         mapX: 72.9, mapY: 64.7, travelDays: 5, prizePurse: 40, prestige: 4 },
  { name: "Joust at Hereford",       mapX: 64.8, mapY: 79.1, travelDays: 3, prizePurse: 25, prestige: 2 },
  { name: "Tournament at Lincoln",   mapX: 76.5, mapY: 71.1, travelDays: 4, prizePurse: 35, prestige: 3 },
];

export const HQ_MAP = { x: 67.5, y: 74.5 };

// ═══════════════════════════════════════════════════════════
// EQUIPMENT CATALOG
// ═══════════════════════════════════════════════════════════
export const EQUIPMENT_CATALOG: EquipmentTemplate[] = [
  // Lances
  { name: "Ash Lance",      type: "lance", tier: 1, cost: 5,   maxDurability: 3,  effects: { skillBonus: 0, strengthBonus: 0 } },
  { name: "Oak Lance",      type: "lance", tier: 2, cost: 12,  maxDurability: 6,  effects: { skillBonus: 3, strengthBonus: 2 } },
  { name: "Ironwood Lance", type: "lance", tier: 3, cost: 30,  maxDurability: 10, effects: { skillBonus: 6, strengthBonus: 5 } },
  // Armor
  { name: "Leather Hauberk", type: "armor", tier: 1, cost: 8,  maxDurability: 8,  effects: { protection: 0, staminaCost: 2 } },
  { name: "Chain Mail",      type: "armor", tier: 2, cost: 25, maxDurability: 15, effects: { protection: 1, skillBonus: -2, staminaCost: 5 } },
  { name: "Plate Armor",     type: "armor", tier: 3, cost: 60, maxDurability: 25, effects: { protection: 2, skillBonus: -4, staminaCost: 10 } },
  // Horses (no durability — they don't break)
  { name: "Rouncey",  type: "horse", tier: 1, cost: 15,  maxDurability: 9999, effects: { staminaBonus: 0 } },
  { name: "Courser",  type: "horse", tier: 2, cost: 40,  maxDurability: 9999, effects: { staminaBonus: 10, travelBonus: 1 } },
  { name: "Destrier", type: "horse", tier: 3, cost: 100, maxDurability: 9999, effects: { staminaBonus: 20, travelBonus: 1 } },
  // Shields
  { name: "Wooden Shield",     type: "shield", tier: 1, cost: 4,  maxDurability: 4,  effects: { blockBonus: 0 } },
  { name: "Iron-Bound Shield", type: "shield", tier: 2, cost: 15, maxDurability: 10, effects: { blockBonus: 10 } },
  { name: "Tournament Shield", type: "shield", tier: 3, cost: 35, maxDurability: 18, effects: { blockBonus: 20 } },
];

let equipIdCounter = 0;

export function createEquipment(template: EquipmentTemplate): Equipment {
  return {
    id: `eq-${equipIdCounter++}`,
    name: template.name,
    type: template.type,
    tier: template.tier,
    cost: template.cost,
    durability: template.maxDurability,
    maxDurability: template.maxDurability,
    effects: { ...template.effects },
  };
}

export function getTemplate(name: string): EquipmentTemplate {
  return EQUIPMENT_CATALOG.find(t => t.name === name)!;
}

export function getCatalogByType(type: EquipmentSlot): EquipmentTemplate[] {
  return EQUIPMENT_CATALOG.filter(t => t.type === type);
}

// Starter gear for Phase 1
export function createStarterGear(): Knight["equipment"] {
  return {
    lance: createEquipment(getTemplate("Ash Lance")),
    armor: createEquipment(getTemplate("Leather Hauberk")),
    horse: createEquipment(getTemplate("Rouncey")),
    shield: createEquipment(getTemplate("Wooden Shield")),
  };
}

// ═══════════════════════════════════════════════════════════
// KNIGHT FACTORY
// ═══════════════════════════════════════════════════════════
let knightIdCounter = 0;

export function generateKnight(colorSet: ColorSet, withGear = false): Knight {
  const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
  const epithet = EPITHETS[Math.floor(rand() * EPITHETS.length)];
  return {
    id: knightIdCounter++,
    name: `Sir ${first} ${epithet}`,
    skill: Math.floor(rand() * 35) + 45,
    strength: Math.floor(rand() * 35) + 45,
    reputation: Math.floor(rand() * 20) + 20,
    stamina: 100,
    maxStamina: 100,
    fatigue: 0,
    injury: null,
    wins: 0,
    losses: 0,
    draws: 0,
    equipment: withGear ? createStarterGear() : {
      lance: null, armor: null, horse: null, shield: null,
    },
    primary: colorSet.primary,
    accent: colorSet.accent,
    css: colorSet.css,
  };
}

// Generate an opponent knight (always has tier-appropriate gear)
export function generateOpponentKnight(colorSet: ColorSet, prestige: number): Knight {
  const knight = generateKnight(colorSet);
  // Opponents get gear based on tournament prestige
  const lanceTier = prestige >= 4 ? 3 : prestige >= 3 ? 2 : 1;
  const armorTier = prestige >= 5 ? 3 : prestige >= 3 ? 2 : 1;
  const lances = getCatalogByType("lance");
  const armors = getCatalogByType("armor");
  const shields = getCatalogByType("shield");
  const horses = getCatalogByType("horse");
  knight.equipment = {
    lance: createEquipment(lances.find(l => l.tier === lanceTier) ?? lances[0]),
    armor: createEquipment(armors.find(a => a.tier === Math.min(armorTier, 2)) ?? armors[0]),
    horse: createEquipment(horses[0]),
    shield: createEquipment(shields.find(s => s.tier === Math.min(lanceTier, 2)) ?? shields[0]),
  };
  return knight;
}

// ═══════════════════════════════════════════════════════════
// TOURNAMENT FACTORY
// ═══════════════════════════════════════════════════════════
export function generateTournaments(): Tournament[] {
  const fixedDays = [18, 42, 72, 108, 138, 165];
  const tournaments: Tournament[] = [];
  for (let i = 0; i < TOURNAMENT_TEMPLATES.length; i++) {
    const t = TOURNAMENT_TEMPLATES[i];
    tournaments.push({
      id: i,
      name: t.name,
      mapX: t.mapX,
      mapY: t.mapY,
      dayOfSeason: fixedDays[i],
      travelDays: t.travelDays,
      prizePurse: t.prizePurse,
      prestige: t.prestige,
      opponent: generateOpponentKnight(OPPONENT_COLORS[i % OPPONENT_COLORS.length], t.prestige),
      status: "upcoming",
      result: null,
    });
  }
  return tournaments;
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
export function romanNumeral(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let r = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  }
  return r;
}
