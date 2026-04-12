/* ------------------------------------------------------------------ */
/*  Pizza dialogue lines — the pizza in the box talks to you           */
/* ------------------------------------------------------------------ */

export type TriggerType =
  | 'delivery'
  | 'wipeout'
  | 'shroom'
  | 'nearDelivery'
  | 'idle';

export interface PizzaLine {
  text: string;
  triggers: TriggerType[];
  /** true = gives wrong directional advice at high trip intensity */
  lying?: boolean;
}

export const PIZZA_LINES: PizzaLine[] = [
  /* ---- Regular lines (11) ---- */
  { text: "You missed the turn. Again.", triggers: ['nearDelivery'] },
  { text: "I'm getting cold in here.", triggers: ['idle'] },
  { text: "That's my cheese on the pavement now.", triggers: ['wipeout'] },
  { text: "Nice driving. Really. Wow.", triggers: ['wipeout'] },
  { text: "Faster. They tipped in advance.", triggers: ['idle'] },
  { text: "You smell that? That's me. Losing value.", triggers: ['idle'] },
  { text: "Almost there. I can feel it.", triggers: ['nearDelivery'] },
  { text: "Fun fact: I was supposed to be a calzone.", triggers: ['delivery'] },
  { text: "Another one bites the crust.", triggers: ['delivery'] },
  { text: "Ooh, shiny. Very professional.", triggers: ['shroom'] },
  { text: "Great, now we're BOTH a little weird.", triggers: ['shroom'] },

  /* ---- Lying lines (4) — wrong directional advice at high trip ---- */
  { text: "Take a left here. Trust me.", triggers: ['nearDelivery'], lying: true },
  { text: "Pretty sure it's back the way we came.", triggers: ['nearDelivery'], lying: true },
  { text: "Go straight. Definitely straight.", triggers: ['nearDelivery'], lying: true },
  { text: "I'd turn around if I were you.", triggers: ['nearDelivery'], lying: true },
];
