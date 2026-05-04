# Command Board Tracking

## Finished

- Stretched the app to the command board and web tab only.
- Removed the old side visual panels from the primary layout.
- Moved Agent Comms into the command board so operator messages go to Queen and replies land in Command Output.
- Removed Codex One-Shot and Apple Music controls.
- Added Codex CLI controls for version, login status, MCP servers, and feature flags.
- Added Text OpenClaw as a separate OpenClaw control.
- Routed Text OpenClaw to the latest direct OpenClaw session with a bounded timeout.
- Repaired local OpenClaw gateway device scope so CLI calls are write-capable.
- Added local web proxy fallback for ordinary sites and YouTube embed conversion for videos.
- Kept Soviet anthem playback for successful prompt-style completions.
- Switched agent turns to per-agent git worktrees.

## Verified

- `npm test -w dashboard/server`
- `npm run build`
- Dashboard API exposes 9 safe command controls.
- Text OpenClaw returns `OK` through the dashboard endpoint.
- Codex Version button updates Command Output in the browser.
- YouTube loads through `/embed/` instead of refusing to connect.
- `https://example.com` loads through `/api/browser/proxy`.

## Next Workflow Items

- Add automated GitHub PR creation after Queen aggregates worker outputs.
- Add explicit per-agent worktree cleanup controls.
- Add richer browser navigation controls if the iframe/proxy model is not enough for a target site.
