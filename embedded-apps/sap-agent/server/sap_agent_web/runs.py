"""Runs: one agent task, manifest deployment or doctor check at a time (a single DEV system, a single
guard state). Each run has an append-only event list the browser follows, and may pause for a human
approval that an admin gives in the browser (typed confirmation). History is kept on disk."""
from __future__ import annotations
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

ACTIVE = {"queued", "running", "waiting_approval"}


def readable(msg: str) -> str:
    """SAP error pages come back as HTML (ICF logon/404 pages): keep the text, drop the markup."""
    if "<html" in msg.lower() or "<!doctype" in msg.lower():
        import re
        msg = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", msg, flags=re.I)
        msg = re.sub(r"<[^>]+>", " ", msg)
        msg = re.sub(r"\s+", " ", msg).strip()
    return msg[:2000]


@dataclass
class Approval:
    id: str
    action: str
    detail: str
    requested_at: float
    decided: Optional[bool] = None
    decided_by: str = ""
    event: threading.Event = field(default_factory=threading.Event)


@dataclass
class Run:
    id: str
    kind: str                       # task | deploy | bootstrap | doctor
    owner: str
    params: dict
    created: float
    status: str = "queued"          # queued | running | waiting_approval | done | failed | stopped | cancelled
    finished: float = 0.0
    events: list[dict] = field(default_factory=list)
    result: dict = field(default_factory=dict)
    cancel_requested: bool = False
    approvals: dict[str, Approval] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def emit(self, type_: str, **data):
        with self.lock:
            self.events.append({"seq": len(self.events) + 1, "ts": time.time(), "type": type_, **data})

    def summary(self) -> dict:
        title = self.params.get("task") or self.params.get("manifest") or self.kind
        return {"id": self.id, "kind": self.kind, "owner": self.owner, "title": str(title)[:200], "status": self.status,
                "created": self.created * 1000, "finished": self.finished * 1000 if self.finished else None,
                "events": len(self.events), "pendingApproval": self.pending_approval()}

    def pending_approval(self) -> Optional[dict]:
        for a in self.approvals.values():
            if a.decided is None:
                return {"id": a.id, "action": a.action, "detail": a.detail, "requestedAt": a.requested_at * 1000}
        return None

    def to_json(self) -> dict:
        return {**self.summary(), "params": self.params, "result": self.result, "eventList": self.events}


class RunManager:
    def __init__(self, runs_dir: str, approval_timeout_s: int = 900):
        self.dir = runs_dir
        os.makedirs(self.dir, exist_ok=True)
        self.timeout = approval_timeout_s
        self.runs: dict[str, Run] = {}
        self.lock = threading.Lock()
        self._load_history()

    # --- history -------------------------------------------------------------------------------
    def _path(self, rid: str) -> str:
        return os.path.join(self.dir, f"{rid}.json")

    def _load_history(self):
        for f in sorted(os.listdir(self.dir))[-200:]:
            if not f.endswith(".json"):
                continue
            try:
                d = json.load(open(os.path.join(self.dir, f), encoding="utf-8"))
                r = Run(d["id"], d["kind"], d["owner"], d.get("params", {}), d["created"] / 1000, d["status"],
                        (d.get("finished") or 0) / 1000, d.get("eventList", []), d.get("result", {}))
                if r.status in ACTIVE:          # the server restarted while it ran
                    r.status = "stopped"
                    r.emit("error", message="The server restarted while this run was active.")
                self.runs[r.id] = r
            except Exception:  # noqa: BLE001
                continue

    def save(self, run: Run):
        tmp = self._path(run.id) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(run.to_json(), f, ensure_ascii=False)
        os.replace(tmp, self._path(run.id))

    # --- lifecycle -----------------------------------------------------------------------------
    def active(self) -> Optional[Run]:
        return next((r for r in self.runs.values() if r.status in ACTIVE), None)

    def start(self, kind: str, owner: str, params: dict, work: Callable[[Run, Callable[[str, str], bool]], dict]) -> Run:
        with self.lock:
            busy = self.active()
            if busy:
                raise RuntimeError(f"Another run is active ({busy.kind} by {busy.owner}). One run at a time on the SAP development system.")
            run = Run(uuid.uuid4().hex[:12], kind, owner, params, time.time())
            self.runs[run.id] = run
        run.emit("started", kind=kind, owner=owner, params=params)

        def approve(action: str, detail: str) -> bool:
            return self._ask(run, action, detail)

        def target():
            run.status = "running"
            try:
                run.result = work(run, approve) or {}
                run.status = run.result.pop("_status", "done")
            except Exception as e:  # noqa: BLE001
                cancelled = e.__class__.__name__ == "RunCancelled" or run.cancel_requested
                run.status = "cancelled" if cancelled else "failed"
                run.emit("error", message=readable(str(e)))
            finally:
                run.finished = time.time()
                run.emit("finished", status=run.status)
                self.save(run)

        threading.Thread(target=target, name=f"run-{run.id}", daemon=True).start()
        return run

    def _ask(self, run: Run, action: str, detail: str) -> bool:
        a = Approval(uuid.uuid4().hex[:8], action, str(detail)[:4000], time.time())
        run.approvals[a.id] = a
        prev = run.status
        run.status = "waiting_approval"
        run.emit("approval_requested", approvalId=a.id, action=action, detail=a.detail)
        self.save(run)
        got = a.event.wait(self.timeout)
        if not got or run.cancel_requested:
            a.decided = False
            a.decided_by = "timeout" if not got else "cancelled"
        run.status = prev if prev != "waiting_approval" else "running"
        run.emit("approval_decided", approvalId=a.id, approved=bool(a.decided), by=a.decided_by)
        return bool(a.decided)

    def decide(self, run: Run, approval_id: str, approved: bool, by: str):
        a = run.approvals.get(approval_id)
        if not a or a.decided is not None:
            raise KeyError("No such pending approval.")
        a.decided, a.decided_by = approved, by
        a.event.set()

    def cancel(self, run: Run, by: str):
        run.cancel_requested = True
        run.emit("cancel_requested", by=by)
        for a in run.approvals.values():
            if a.decided is None:
                a.decided, a.decided_by = False, "cancelled"
                a.event.set()

    def list(self) -> list[dict]:
        return [r.summary() for r in sorted(self.runs.values(), key=lambda r: r.created, reverse=True)]

    def get(self, rid: str) -> Run:
        r = self.runs.get(rid)
        if not r:
            raise KeyError("No such run.")
        return r
