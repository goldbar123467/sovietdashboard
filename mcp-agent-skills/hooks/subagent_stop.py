#!/usr/bin/env python3
"""Hook: SubagentStop — notifies dashboard when a subagent terminates."""

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
        "hook_event": "SubagentStop",
        "timestamp": payload.get("timestamp"),
    }
    post_event(event)


if __name__ == "__main__":
    main()
