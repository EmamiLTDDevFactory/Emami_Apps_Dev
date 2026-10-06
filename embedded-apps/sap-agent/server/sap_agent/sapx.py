"""Client for the SAP-side task handler (ZCL_SRC_AGENT_HTTP at /sap/zsrc_agent/tasks).
Anything ADT cannot do on ECC (DDIC tables, lock objects, number ranges, text IDs, batch input, running reports) goes here."""
from __future__ import annotations
import json


class SapxError(Exception):
    pass


class SapxClient:
    def __init__(self, base: str, client: str, user: str, password: str, path: str, verify: bool = True, session=None):
        import requests
        self.base, self.client, self.path = base.rstrip("/"), client, path
        self.s = session or requests.Session()
        if session is None:
            self.s.auth = (user, password)
            self.s.verify = verify
        self._csrf = ""

    def call(self, task: str, args: dict | None = None) -> dict:
        url = f"{self.base}{self.path}?sap-client={self.client}"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self._csrf:
            headers["x-csrf-token"] = self._csrf
        r = self.s.post(url, data=json.dumps({"task": task, "args": args or {}}), headers=headers)
        if r.status_code == 403 and "csrf" in r.headers.get("x-csrf-token", "").lower():
            f = self.s.get(url, headers={"x-csrf-token": "fetch"})
            self._csrf = f.headers.get("x-csrf-token", "")
            headers["x-csrf-token"] = self._csrf
            r = self.s.post(url, data=json.dumps({"task": task, "args": args or {}}), headers=headers)
        if r.status_code != 200:
            raise SapxError(f"handler HTTP {r.status_code}: {r.text[:500]}")
        try:
            j = r.json()
        except ValueError:
            raise SapxError(f"handler returned non-JSON: {r.text[:300]}")
        if not j.get("ok"):
            raise SapxError(j.get("error", "unknown handler error"))
        return j.get("result", {})

    def node_alive(self) -> bool:
        """True when the ICF node answers (GET returns {"ok": true}). This is the check for the one step ECC cannot automate."""
        try:
            r = self.s.get(f"{self.base}{self.path}?sap-client={self.client}", headers={"Accept": "application/json"})
            return r.status_code == 200 and '"ok"' in r.text
        except Exception:
            return False
