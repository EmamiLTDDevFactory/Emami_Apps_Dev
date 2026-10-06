"""Builds the unchanged sap_agent engine objects for one run, exactly as sap_agent.cli does, but with
web hooks: approvals come from the browser, progress goes to the run's event stream, and the audit log
names the person who started the run."""
from __future__ import annotations
import json
from typing import Any, Callable

from sap_agent.adt import AdtClient
from sap_agent.audit import Audit
from sap_agent.config import Config
from sap_agent.guard import Guard
from sap_agent.sapx import SapxClient
from sap_agent.tools import TOOLS, ToolBox
from sap_agent.audit import _mask  # same masking the audit log uses

TOOL_NAMES = {t["name"] for t in TOOLS}


class RunCancelled(Exception):
    pass


def public_config(cfg: Config) -> dict:
    """Engine settings without secrets, for the UI."""
    return {
        "host": cfg.host, "client": cfg.client, "user": cfg.user, "passwordSet": bool(cfg.password),
        "allowedSids": cfg.allowed_sids, "allowedPackages": cfg.allowed_packages, "readOnly": cfg.read_only,
        "allowRelease": cfg.allow_release, "approval": cfg.approval, "model": cfg.model, "maxSteps": cfg.max_steps,
        "handlerPath": cfg.handler_path, "bdcTcodes": cfg.bdc_tcodes, "indexTables": cfg.index_tables,
    }


def build(cfg: Config, actor: str, approve: Callable[[str, str], bool]):
    audit = Audit(cfg.audit_file, actor=actor)
    guard = Guard(cfg, approve)
    adt = AdtClient(cfg.host, cfg.client, cfg.user, cfg.password, cfg.verify_ssl)
    sapx = SapxClient(cfg.host, cfg.client, cfg.user, cfg.password, cfg.handler_path, cfg.verify_ssl)
    return audit, guard, adt, sapx


class WatchedToolBox:
    """Wraps the engine's ToolBox: emits each tool call and its result to the run, and stops the agent
    between calls when the run was cancelled. The guard inside ToolBox still decides what is allowed."""

    def __init__(self, tb: ToolBox, emit: Callable[..., None], cancelled: Callable[[], bool]):
        self.tb, self.emit, self.cancelled = tb, emit, cancelled

    def call(self, name: str, args: dict) -> str:
        if self.cancelled():
            raise RunCancelled("cancelled by the user")
        self.emit("tool_call", name=name, args=_mask(args))
        out = self.tb.call(name, args)
        failed = '"error"' in out[:40] or '"errors": true' in out[:80]
        try:
            parsed: Any = json.loads(out)
        except ValueError:
            parsed = out
        self.emit("tool_result", name=name, ok=not failed, result=_mask(parsed) if isinstance(parsed, (dict, list)) else str(parsed)[:4000])
        return out


def doctor(cfg: Config, adt: AdtClient, sapx: SapxClient, guard: Guard) -> dict:
    """Same checks as `sap-agent doctor`, returned as data."""
    checks: list[dict] = []
    need = {"classes": "/sap/bc/adt/oo/classes", "interfaces": "/sap/bc/adt/oo/interfaces", "programs": "/sap/bc/adt/programs/programs",
            "packages": "/sap/bc/adt/packages", "activation": "/sap/bc/adt/activation", "check runs": "/sap/bc/adt/checkruns",
            "transports": "/sap/bc/adt/cts/transportrequests", "ABAP Unit": "/sap/bc/adt/abapunit/testruns"}
    if not cfg.host or not cfg.user or not cfg.password:
        return {"ready": False, "checks": [{"name": "SAP connection settings", "ok": False, "detail": "SAP_HOST must be set on the server and you must be signed in to SAP."}]}
    try:
        disc = adt.discovery()
        for label, href in need.items():
            found = any(h.startswith(href) for h in disc)
            checks.append({"name": f"ADT {label}", "ok": found, "detail": href if found else f"{href} missing: activate /sap/bc/adt in SICF, check S_ADT_RES"})
    except Exception as e:  # noqa: BLE001
        checks.append({"name": "ADT discovery", "ok": False, "detail": f"{e} - activate /sap/bc/adt in SICF, check the user's S_ADT_RES authorisation"})
    try:
        info = sapx.call("ping")
        guard.check_system(info.get("sid", ""))
        checks.append({"name": "Task handler", "ok": True, "detail": f"system {info.get('sid')}, release {info.get('release')}, user {info.get('user')}, ABAP {info.get('abap', '?')}"})
    except Exception as e:  # noqa: BLE001
        checks.append({"name": "Task handler", "ok": False, "detail": f"{e} - run the bootstrap, then create the SICF node {cfg.handler_path} (handler ZCL_SRC_AGENT_HTTP)"})
    return {"ready": all(c["ok"] for c in checks), "checks": checks}
