import type { ColorSet, Knight, Tournament } from './types';

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
  { name: "Tournament at Winchester", mapX: 47, mapY: 72, travelDays: 3, prizePurse: 30, prestige: 3 },
  { name: "Joust at Kenilworth",     mapX: 46, mapY: 50, travelDays: 2, prizePurse: 20, prestige: 2 },
  { name: "Grand Tourney at Smithfield", mapX: 56, mapY: 64, travelDays: 4, prizePurse: 60, prestige: 5 },
  { name: "Tourney at York",         mapX: 48, mapY: 32, travelDays: 5, prizePurse: 40, prestige: 4 },
  { name: "Joust at Hereford",       mapX: 37, mapY: 54, travelDays: 3, prizePurse: 25, prestige: 2 },
  { name: "Tournament at Lincoln",   mapX: 52, mapY: 40, travelDays: 4, prizePurse: 35, prestige: 3 },
];

export const HQ_MAP = { x: 46, y: 52 };

// ═══════════════════════════════════════════════════════════
// KNIGHT FACTORY
// ═══════════════════════════════════════════════════════════
let knightIdCounter = 0;

export function generateKnight(colorSet: ColorSet): Knight {
  const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
  const epithet = EPITHETS[Math.floor(rand() * EPITHETS.length)];
  return {
    id: knightIdCounter++,
    name: `Sir ${first} ${epithet}`,
    skill: Math.floor(rand() * 35) + 45,
    strength: Math.floor(rand() * 35) + 45,
    reputation: Math.floor(rand() * 20) + 20,
    stamina: 100,
    wins: 0,
    losses: 0,
    draws: 0,
    primary: colorSet.primary,
    accent: colorSet.accent,
    css: colorSet.css,
  };
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
      opponent: generateKnight(OPPONENT_COLORS[i % OPPONENT_COLORS.length]),
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
