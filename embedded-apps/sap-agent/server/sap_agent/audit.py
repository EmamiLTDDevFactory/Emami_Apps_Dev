from __future__ import annotations
import hashlib
import json
import time

SECRET_KEYS = {"password", "authorization", "token", "x-csrf-token"}


def _mask(o):
    if isinstance(o, dict):
        return {k: ("***" if k.lower() in SECRET_KEYS else _mask(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [_mask(x) for x in o]
    if isinstance(o, str) and len(o) > 400:
        return o[:200] + f"...[{len(o)} chars, sha1 {hashlib.sha1(o.encode()).hexdigest()[:10]}]"
    return o


class Audit:
    """Append-only JSON lines: every tool call, its arguments and its outcome."""

    def __init__(self, path: str, actor: str = "agent"):
        self.path, self.actor = path, actor

    def log(self, event: str, **data):
        rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "actor": self.actor, "event": event, **_mask(data)}
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
