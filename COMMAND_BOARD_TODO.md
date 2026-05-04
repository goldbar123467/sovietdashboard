# Command Board Tracking

## Finished

- Stretched the app to the command board and web tab only.
- Removed the old side visual panels from the primary layout.
- Moved Agent Comms into the command board so operator messages go directly to Codex CLI and replies land in Command Output.
- Removed Codex One-Shot and Apple Music controls.
- Removed the Web Tab from the app shell; browsing is out of scope for this board now.
- Removed Queen/subagent routing from Agent Comms; prompts now go directly to the local Codex CLI.
- Added Codex session tracking for active thread id, current run, recent CLI session metadata, token totals, tool calls, failures, and average turn time.
- Added Codex CLI controls for version, login status, MCP servers, and feature flags.
- Added Text OpenClaw as a separate OpenClaw control.
- Routed Text OpenClaw to the latest direct OpenClaw session with a bounded timeout.
- Repaired local OpenClaw gateway device scope so CLI calls are write-capable.
- Kept Soviet anthem playback for successful prompt-style completions.

## Verified

- `npm test -w dashboard/server`
- `npm run build`
- Dashboard API exposes safe command controls.
- Text OpenClaw returns `OK` through the dashboard endpoint.
- Codex Version button updates Command Output in the browser.

## Next Workflow Items

- Add a persisted local run ledger if the in-memory Codex turn totals need to survive server restarts.
- Add a compact diff/test status strip once the board starts running longer coding sessions.
