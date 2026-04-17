export interface Agent {
  name: string;
  model: string;
  role: string;
  registeredAt: string;
}

export interface Message {
  id: number;
  from: string;
  to: string;
  body: string;
  timestamp: string;
}

export interface FileReservation {
  path: string;
  agent: string;
  expiresAt: number;
  reason: string;
}

// ── In-memory state ──────────────────────────────────────────────────────────

const agents = new Map<string, Agent>();
const messages: Message[] = [];
let nextId = 1;
const reservations = new Map<string, FileReservation>(); // keyed by path

// ── Agents ───────────────────────────────────────────────────────────────────

export function registerAgent(name: string, model: string, role: string): Agent {
  const agent: Agent = { name, model, role, registeredAt: new Date().toISOString() };
  agents.set(name, agent);
  return agent;
}

export function listAgents(): Agent[] {
  return Array.from(agents.values());
}

// ── Messages ─────────────────────────────────────────────────────────────────

/** to="*" means broadcast to all agents. */
export function sendMessage(from: string, to: string, body: string): Message {
  const msg: Message = {
    id: nextId++,
    from,
    to,
    body,
    timestamp: new Date().toISOString(),
  };
  messages.push(msg);
  return msg;
}

/**
 * Returns messages addressed to agentName or broadcast ("*").
 * If since is provided, only messages with id > since are returned.
 */
export function fetchMessages(agentName: string, since?: number): Message[] {
  return messages.filter(
    (m) =>
      (m.to === agentName || m.to === "*") &&
      (since === undefined || m.id > since)
  );
}

/** Returns all stored messages (for dashboard / narrator). */
export function getAllMessages(): Message[] {
  return [...messages];
}

// ── File reservations ─────────────────────────────────────────────────────────

function pruneExpired(): void {
  const now = Date.now();
  for (const [path, res] of reservations) {
    if (res.expiresAt <= now) reservations.delete(path);
  }
}

export interface ReserveResult {
  reserved: string[];
  conflicts: Array<{ path: string; heldBy: string; expiresAt: string }>;
}

/**
 * Attempts to reserve all paths for agent.
 * - Paths already held by the same agent are renewed.
 * - Paths held by a different (non-expired) agent are reported as conflicts and
 *   not reserved.
 */
export function reserveFiles(
  agent: string,
  paths: string[],
  ttlMs: number,
  reason: string
): ReserveResult {
  pruneExpired();

  const reserved: string[] = [];
  const conflicts: ReserveResult["conflicts"] = [];
  const expiresAt = Date.now() + ttlMs;

  for (const path of paths) {
    const existing = reservations.get(path);
    if (existing && existing.agent !== agent) {
      conflicts.push({
        path,
        heldBy: existing.agent,
        expiresAt: new Date(existing.expiresAt).toISOString(),
      });
    } else {
      reservations.set(path, { path, agent, expiresAt, reason });
      reserved.push(path);
    }
  }

  return { reserved, conflicts };
}

/**
 * Releases reservations held by agent.
 * If paths is provided, only those paths are released; otherwise all for agent.
 * Returns the count of released entries.
 */
export function releaseFiles(agent: string, paths?: string[]): number {
  pruneExpired();

  let released = 0;
  const targets = paths ?? Array.from(reservations.keys());

  for (const path of targets) {
    const res = reservations.get(path);
    if (res && res.agent === agent) {
      reservations.delete(path);
      released++;
    }
  }

  return released;
}
