#!/usr/bin/env python3
"""Hook: SessionEnd — notifies dashboard when a Claude Code session ends and triggers anthem."""

import json
import sys
import urllib.request

API_URL = "http://localhost:4981/api/events"


def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            API_URL,
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
        "hook_event": "SessionEnd",
        "timestamp": payload.get("timestamp"),
    }
    post_event(event)

    # Trigger anthem playback on session end
    post_event({"type": "anthem"})


if __name__ == "__main__":
    main()
