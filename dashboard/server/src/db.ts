import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { HookEvent } from "./types.js";

interface EventRow extends HookEvent {
  id: number;
}

interface EventStoreFile {
  nextId: number;
  events: EventRow[];
}

const DB_PATH = resolve(process.env.DB_PATH || "tovarish-events.json");
const MAX_EVENTS = 5_000;

let store: EventStoreFile = loadStore();

function loadStore(): EventStoreFile {
  try {
    if (!existsSync(DB_PATH)) return { nextId: 1, events: [] };
    const parsed = JSON.parse(readFileSync(DB_PATH, "utf8"));
    if (!parsed || !Array.isArray(parsed.events)) return { nextId: 1, events: [] };
    return {
      nextId: Number(parsed.nextId) || parsed.events.length + 1,
      events: parsed.events,
    };
  } catch {
    return { nextId: 1, events: [] };
  }
}

function persist() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

export function addEvent(ev: HookEvent): void {
  store.events.push({ ...ev, id: store.nextId++ });
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(-MAX_EVENTS);
  }
  persist();
}

export function recentEvents(limit = 50): HookEvent[] {
  return store.events.slice(-limit).reverse();
}

export function eventsSince(since: string): HookEvent[] {
  return store.events.filter((event) => event.timestamp > since);
}

export function allEvents(): HookEvent[] {
  return [...store.events];
}
