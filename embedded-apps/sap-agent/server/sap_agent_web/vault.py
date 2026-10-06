"""Per-session credentials typed in by the person: their SAP user / password for the development system
and their Anthropic API key. Kept ONLY in this process's memory, keyed by the session id, dropped on SAP
sign-out, at session expiry, or when the server restarts. Never written to disk, never logged, never
returned to the browser."""
from __future__ import annotations
import threading
import time
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Creds:
    sap_user: str
    sap_password: str
    anthropic_key: str
    sid: str
    expires: float
    client: str = ""

    def __repr__(self) -> str:  # never leak secrets through logs or tracebacks
        return f"Creds(sap_user={self.sap_user!r}, sid={self.sid!r}, anthropic={'set' if self.anthropic_key else 'none'})"


class Vault:
    def __init__(self):
        self._d: dict[str, Creds] = {}
        self._lock = threading.Lock()

    def put(self, session_id: str, c: Creds):
        with self._lock:
            self._purge()
            self._d[session_id] = c

    def get(self, session_id: str) -> Optional[Creds]:
        with self._lock:
            c = self._d.get(session_id)
            if c and c.expires < time.time():
                del self._d[session_id]
                return None
            return c

    def drop(self, session_id: str):
        with self._lock:
            self._d.pop(session_id, None)

    def _purge(self):
        now = time.time()
        for k in [k for k, v in self._d.items() if v.expires < now]:
            del self._d[k]
