import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  registerAgent,
  listAgents,
  sendMessage,
  fetchMessages,
  reserveFiles,
  releaseFiles,
} from "./store.js";

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

export function registerTools(server: McpServer): void {
  // 1. register_agent
  server.tool(
    "register_agent",
    "Register an agent with a name, model, and role.",
    {
      name: z.string().describe("Unique agent name, e.g. 'rome-ui-dev'"),
      model: z.string().describe("Model tier: 'opus', 'sonnet', or 'haiku'"),
      role: z.string().describe("Agent role, e.g. 'coder', 'tester', 'reviewer'"),
    },
    ({ name, model, role }) => ok(registerAgent(name, model, role))
  );

  // 2. send_message
  server.tool(
    "send_message",
    "Send a message from one agent to another. Use to='*' for broadcast.",
    {
      from: z.string().describe("Sender agent name"),
      to: z.string().describe("Recipient agent name, or '*' to broadcast to all"),
      body: z.string().describe("Message body text"),
    },
    ({ from, to, body }) => ok(sendMessage(from, to, body))
  );

  // 3. fetch_messages
  server.tool(
    "fetch_messages",
    "Fetch messages for an agent. Optionally provide since_id to get only newer messages.",
    {
      agent_name: z.string().describe("Name of the agent fetching its inbox"),
      since_id: z
        .number()
        .optional()
        .describe("Return only messages with id greater than this value"),
    },
    ({ agent_name, since_id }) => ok(fetchMessages(agent_name, since_id))
  );

  // 4. reserve_files
  server.tool(
    "reserve_files",
    "Reserve file paths for exclusive editing. Returns reserved paths and any conflicts.",
    {
      agent: z.string().describe("Name of the agent claiming the reservation"),
      paths: z.array(z.string()).describe("List of file paths to reserve"),
      ttl_minutes: z
        .number()
        .default(30)
        .describe("How long to hold the reservation, in minutes (default 30)"),
      reason: z
        .string()
        .default("editing")
        .describe("Short reason for the reservation, e.g. 'refactoring auth module'"),
    },
    ({ agent, paths, ttl_minutes, reason }) =>
      ok(reserveFiles(agent, paths, ttl_minutes * 60 * 1000, reason))
  );

  // 5. release_files
  server.tool(
    "release_files",
    "Release file reservations held by an agent. Omit paths to release all.",
    {
      agent: z.string().describe("Name of the agent releasing reservations"),
      paths: z
        .array(z.string())
        .optional()
        .describe("Specific paths to release; omit to release all for this agent"),
    },
    ({ agent, paths }) => ok({ released: releaseFiles(agent, paths) })
  );

  // 6. list_agents
  server.tool(
    "list_agents",
    "List all registered agents.",
    {},
    () => ok(listAgents())
  );
}
