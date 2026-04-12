export interface PRNG {
  next(): number;
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
  pick<T>(array: readonly T[]): T;
  chance(probability: number): boolean;
}

export function createPRNG(seed: number): PRNG {
  let s = seed | 0;
  function mulberry32(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next: mulberry32,
    nextInt(min: number, max: number): number {
      return Math.floor(mulberry32() * (max - min + 1)) + min;
    },
    nextFloat(min: number, max: number): number {
      return mulberry32() * (max - min) + min;
    },
    pick<T>(array: readonly T[]): T {
      return array[Math.floor(mulberry32() * array.length)];
    },
    chance(probability: number): boolean {
      return mulberry32() < probability;
    },
  };
}
