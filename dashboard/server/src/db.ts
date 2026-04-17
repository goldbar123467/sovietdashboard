import { Database } from "bun:sqlite";
import type { HookEvent } from "./types";

const DB_PATH = process.env.DB_PATH || "tovarish.db";

const db = new Database(DB_PATH, { create: true });

// WAL mode for concurrent reads during writes
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    agent_id   TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    agent_id    TEXT,
    hook_event  TEXT NOT NULL,
    tool_name   TEXT,
    tool_input  TEXT,
    tool_output TEXT,
    timestamp   TEXT NOT NULL,
    duration_ms INTEGER,
    error       TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)
`);

// ---------- Queries ----------

const insertSession = db.prepare(
  `INSERT OR IGNORE INTO sessions (session_id, agent_id) VALUES (?, ?)`
);

const insertEvent = db.prepare(`
  INSERT INTO events (session_id, agent_id, hook_event, tool_name, tool_input, tool_output, timestamp, duration_ms, error)
  VALUES ($session_id, $agent_id, $hook_event, $tool_name, $tool_input, $tool_output, $timestamp, $duration_ms, $error)
`);

const selectRecent = db.prepare(`
  SELECT * FROM events ORDER BY id DESC LIMIT ?
`);

const selectSince = db.prepare(`
  SELECT * FROM events WHERE timestamp > ? ORDER BY id ASC
`);

/** Persist a hook event, auto-creating its session row. */
export function addEvent(ev: HookEvent): void {
  insertSession.run(ev.session_id, ev.agent_id ?? null);
  insertEvent.run({
    $session_id: ev.session_id,
    $agent_id: ev.agent_id ?? null,
    $hook_event: ev.hook_event,
    $tool_name: ev.tool_name ?? null,
    $tool_input: ev.tool_input ?? null,
    $tool_output: ev.tool_output ?? null,
    $timestamp: ev.timestamp,
    $duration_ms: ev.duration_ms ?? null,
    $error: ev.error ?? null,
  });
}

/** Return the N most recent events (newest first). */
export function recentEvents(limit = 50): HookEvent[] {
  return selectRecent.all(limit) as HookEvent[];
}

/** Return all events with timestamp strictly after `since` (oldest first). */
export function eventsSince(since: string): HookEvent[] {
  return selectSince.all(since) as HookEvent[];
}

export default db;
