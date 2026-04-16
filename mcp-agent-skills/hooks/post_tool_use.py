#!/usr/bin/env python3
"""Hook: PostToolUse — forwards tool usage events to the dashboard server."""

import json
import sys
import urllib.request


def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass  # Never block Claude Code


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    event = {
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "PostToolUse",
        "tool_name": payload.get("tool_name"),
        "tool_input": json.dumps(payload.get("tool_input", {}))[:500],
        "tool_output": json.dumps(payload.get("tool_output", {}))[:500],
        "timestamp": payload.get("timestamp"),
        "duration_ms": payload.get("duration_ms"),
        "error": payload.get("error"),
    }
    post_event(event)


if __name__ == "__main__":
    main()
