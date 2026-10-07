"""HTTP API of sap-agent for the Emami Apps embedded UI.

    uvicorn sap_agent_web.app:app --host 127.0.0.1 --port 4130      (run from server/, .env next to it)

Admin-only (Manage Access role "Admin" on app id sap-agent). The engine (sap_agent) is used unchanged; its
guard runs before any tool touches SAP, every call is written to the audit log, and risky actions wait
for a typed approval in the browser.
"""
from __future__ import annotations
import asyncio
import json
import os
import re
import time
from collections import deque
from typing import Optional

import yaml
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .settings import HERE, WebSettings


def _load_dotenv(path: str):
    """Minimal .env loader (KEY=VALUE lines); real environment variables win."""
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if m and not line.lstrip().startswith("#") and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip("'\"")


_load_dotenv(os.path.join(HERE, ".env"))

from sap_agent.capabilities import REGISTRY  # noqa: E402
from sap_agent.config import Config  # noqa: E402
from sap_agent.deploy import Deployer, Manifest  # noqa: E402
from sap_agent.tools import ToolBox  # noqa: E402

from . import auth  # noqa: E402
from .engine import TOOL_NAMES, RunCancelled, WatchedToolBox, build, doctor, public_config  # noqa: E402
from .runs import Run, RunManager  # noqa: E402
from .vault import Creds, Vault  # noqa: E402

S = WebSettings.from_env()
RUNS = RunManager(S.runs_dir, S.approval_timeout_s)
VAULT = Vault()
STEP_LINE = re.compile(r"^(OK  |FAIL|TODO) (\S+) \(([\w]+)\)$")

app = FastAPI(title="sap-agent", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=S.allowed_origins, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Anthropic-Key"], max_age=600)

from .vision import router as vision_router  # noqa: E402  - vehicle number from a photo (Gate Entry); any hub user
app.include_router(vision_router)


@app.exception_handler(auth.AuthError)
async def _auth_error(_: Request, e: auth.AuthError):
    return JSONResponse({"error": str(e)}, status_code=e.status)


def admin(authorization: str = Header(default=""), token: str = Query(default="")) -> auth.SessionUser:
    m = re.match(r"^Bearer\s+(.+)$", authorization or "", re.I)
    return auth.verify_session(S, m.group(1) if m else token)


def creds_of(user: auth.SessionUser) -> Optional[Creds]:
    return VAULT.get(user.session_id) if user.session_id else None


# ---- session ---------------------------------------------------------------------------------------
class HubLogin(BaseModel):
    hubToken: str = ""


class DevLogin(BaseModel):
    email: str = ""


@app.get("/api/health")
def health():
    return {"ok": True, "devLogin": S.allow_dev_login}


@app.post("/api/session")
def session(body: HubLogin):
    return auth.login_with_hub_token(S, body.hubToken)


@app.post("/api/session/dev")
def session_dev(body: DevLogin):
    return auth.dev_login(S, body.email)


# ---- SAP + Anthropic sign-in (typed in by the person, kept in memory only) ------------------------------
class SapLogin(BaseModel):
    sapUser: str = Field(min_length=1, max_length=40)
    sapPassword: str = Field(min_length=1, max_length=200)
    anthropicKey: str = Field(default="", max_length=300)
    sapClient: str = Field(default="", pattern=r"^(\d{3})?$")


def _sap_system_id(cfg: Config) -> str:
    """System id from the unauthenticated /sap/public/info page (RFCSYSID)."""
    import requests
    try:
        r = requests.get(f"{cfg.host}/sap/public/info", verify=cfg.verify_ssl, timeout=20)
        m = re.search(r"<RFCSYSID>\s*([A-Z0-9]{3})\s*</RFCSYSID>", r.text)
        return m.group(1) if m else ""
    except Exception:  # noqa: BLE001
        return ""


@app.post("/api/sap/login")
def sap_login(body: SapLogin, user: auth.SessionUser = Depends(admin)):
    from sap_agent.adt import AdtClient, AdtError
    from sap_agent.guard import Guard, PolicyError
    cfg = Config.from_env()
    if not cfg.host:
        raise HTTPException(503, "SAP_HOST is not configured on the server.")
    sap_user = body.sapUser.strip().upper()
    if body.sapClient:
        cfg.client = body.sapClient
    sid = _sap_system_id(cfg)
    try:
        Guard(cfg).check_system(sid or "?")
    except PolicyError:
        raise HTTPException(403, f"{cfg.host} is system {sid or 'unknown'}, not an allowed development system ({', '.join(cfg.allowed_sids)}).")
    try:
        AdtClient(cfg.host, cfg.client, sap_user, body.sapPassword, cfg.verify_ssl).discovery()
    except AdtError as e:
        if getattr(e, "status", None) in (401, 403):
            raise HTTPException(401, f"SAP {sid} rejected user {sap_user} or the password (HTTP {e.status}).")
        raise HTTPException(502, f"SAP {sid} answered with an error: {str(e)[:200]}")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Could not reach SAP at {cfg.host}: {e.__class__.__name__}")
    key = body.anthropicKey.strip()
    if key:
        try:
            import anthropic
            anthropic.Anthropic(api_key=key).models.list(limit=1)
        except Exception as e:  # noqa: BLE001
            status = getattr(e, "status_code", None)
            raise HTTPException(401 if status in (401, 403) else 502, "Anthropic rejected the API key." if status in (401, 403) else f"Could not check the Anthropic key ({e.__class__.__name__}).")
    VAULT.put(user.session_id, Creds(sap_user, body.sapPassword, key, sid, user.expires, cfg.client))
    run_audit = _engine_cfg()
    from sap_agent.audit import Audit
    Audit(run_audit.audit_file, actor=f"{user} (as {sap_user})").log("sap_login", sid=sid, anthropic=bool(key))
    return {"sapUser": sap_user, "sid": sid, "client": cfg.client, "anthropicKeySet": bool(key)}


@app.get("/api/sap/handler")
def sap_handler(user: auth.SessionUser = Depends(admin)):
    """Is the agent's SAP-side task handler (the SICF node) answering for this person? Without it
    sap_ping fails and the agent stops before doing anything; only the bootstrap can run."""
    c = creds_of(user)
    if not c:
        raise HTTPException(428, "Sign in to SAP with your user ID and password first.")
    cfg = Config.from_env()
    from sap_agent.sapx import make_sapx
    x = make_sapx(cfg, c.sap_user, c.sap_password, c.client or cfg.client)
    alive = x.node_alive()
    info: dict = {}
    if alive:
        try:
            info = x.call("ping")
        except Exception as e:  # noqa: BLE001  (node answers but refuses: role / STVARV)
            info = {"error": str(e)[:300]}
    return {"alive": alive, "mode": cfg.handler_mode, "path": x.path, "sid": c.sid, "user": c.sap_user, "ping": info}


@app.post("/api/sap/logout")
def sap_logout(user: auth.SessionUser = Depends(admin)):
    VAULT.drop(user.session_id)
    return {"ok": True}


# ---- configuration, health, capabilities -----------------------------------------------------------
@app.get("/api/config")
def config(user: auth.SessionUser = Depends(admin)):
    cfg = Config.from_env()
    c = creds_of(user)
    if c:
        cfg.user, cfg.password = c.sap_user, "set"
    return {
        "user": str(user), "engine": public_config(cfg),
        "sap": {"user": c.sap_user, "sid": c.sid, "client": c.client} if c else None,
        "anthropicKeySet": bool(c and c.anthropic_key),
        "active": (a.summary() if (a := RUNS.active()) else None),
    }


@app.get("/api/capabilities")
def capabilities(_: str = Depends(admin)):
    return {"capabilities": [{"key": k, **v} for k, v in REGISTRY.items()]}


def _manifests() -> list[dict]:
    out = []
    for root, _dirs, files in os.walk(S.projects_dir):
        for f in files:
            if f in ("manifest.yaml", "manifest.yml"):
                p = os.path.join(root, f)
                try:
                    d = yaml.safe_load(open(p, encoding="utf-8")) or {}
                    out.append({"path": os.path.relpath(p, HERE), "name": d.get("name") or os.path.basename(root), "package": (d.get("package") or {}).get("name"),
                                "steps": [{"id": s.get("id"), "type": s.get("type"), "title": s.get("title") or s.get("description") or ""} for s in d.get("steps", [])]})
                except Exception as e:  # noqa: BLE001
                    out.append({"path": os.path.relpath(p, HERE), "name": os.path.basename(root), "error": str(e), "steps": []})
    return sorted(out, key=lambda m: m["path"])


@app.get("/api/manifests")
def manifests(_: str = Depends(admin)):
    return {"manifests": _manifests(), "bootstrap": os.path.relpath(S.bootstrap_manifest, HERE)}


@app.get("/api/audit")
def audit_tail(limit: int = Query(200, ge=1, le=2000), _: str = Depends(admin)):
    path = Config.from_env().audit_file
    path = path if os.path.isabs(path) else os.path.join(HERE, path)
    if not os.path.exists(path):
        return {"entries": []}
    with open(path, encoding="utf-8") as f:
        lines = deque(f, maxlen=limit)
    entries = []
    for l in lines:
        try:
            entries.append(json.loads(l))
        except ValueError:
            continue
    return {"entries": list(reversed(entries))}


# ---- runs ------------------------------------------------------------------------------------------
class RunRequest(BaseModel):
    kind: str = Field(pattern="^(task|deploy|bootstrap|doctor)$")
    task: str = ""
    context: str = ""
    manifest: str = ""
    only: str = ""
    dryRun: bool = False
    keepGoing: bool = False
    repair: bool = False
    agent: bool = False
    transport: str = Field(default="", pattern="^([A-Za-z0-9]{3}[Kk][A-Za-z0-9]{6})?$")


def _engine_cfg() -> Config:
    cfg = Config.from_env()
    if not os.path.isabs(cfg.audit_file):
        cfg.audit_file = os.path.join(HERE, cfg.audit_file)
    return cfg


def _agent(cfg: Config, run: Run, tb: WatchedToolBox, audit, ctx: str = "", api_key: str = ""):
    if not api_key:
        raise RuntimeError("Enter your Anthropic API key (SAP sign-in) to run the agent.")
    import anthropic
    from sap_agent.agent import Agent
    return Agent(anthropic.Anthropic(api_key=api_key), cfg.model, tb, audit, cfg.max_steps, ctx)


def _say(run: Run):
    def say(s: str):
        # Tool lines ("[sap_x] ...") are already emitted with full detail by WatchedToolBox.
        m = re.match(r"^\[([a-z_]+)\] ", s)
        if m and m.group(1) in TOOL_NAMES:
            return
        run.emit("say", text=s)
    return say


def _resolve_manifest(rel: str, bootstrap: bool) -> str:
    if bootstrap:
        return S.bootstrap_manifest
    p = os.path.realpath(os.path.join(HERE, rel))
    if not p.startswith(os.path.realpath(S.projects_dir) + os.sep) or not os.path.exists(p):
        raise HTTPException(400, "Unknown manifest: only manifests under server/projects/ can be deployed.")
    return p


def _bootstrap(cfg: Config, m, guard, adt, sapx, audit, run: Run, body: "RunRequest") -> dict:
    """The bootstrap installs the task handler, so it cannot start with Deployer.run's handler ping
    (404 until the bootstrap is done). Same steps, same guard and audit, but the system is identified
    from /sap/public/info instead."""
    from sap_agent.deploy import StepResult
    sid = _sap_system_id(cfg)
    guard.check_system(sid or "?")
    run.emit("log", text=f"system {sid} (from /sap/public/info) client {cfg.client or 'default'} - bootstrap does not need the task handler")
    dep = Deployer(m, guard, adt, sapx, audit, None, log=lambda t: run.emit("log", text=t))
    if body.transport:
        dep.ctx["request"] = body.transport.upper()
    results = []
    for step in m.data["steps"]:
        if run.cancel_requested:
            raise RunCancelled("cancelled by the user")
        if body.dryRun:
            results.append(StepResult(step["id"], step["type"], True, "dry run", skipped=True))
            run.emit("log", text=f"[dry-run] {step['id']} ({step['type']})")
            continue
        res = dep._run_step(step)
        results.append(res)
        run.emit("step", id=step["id"], type=step["type"], status="manual" if res.manual else ("ok" if res.ok else "failed"))
        if not res.ok:
            run.emit("log", text=json.dumps(res.detail, default=str)[:3000])
        audit.log("deploy_step", id=step["id"], type=step["type"], ok=res.ok)
        if not res.ok and not body.keepGoing:
            break
    steps = [{"id": x.id, "type": x.type, "ok": x.ok, "skipped": x.skipped, "manual": x.manual, "detail": x.detail if isinstance(x.detail, (dict, list, str)) else str(x.detail)} for x in results]
    notes = [s.get("text", "") for s in m.data["steps"] if s.get("type") == "note"]
    return {"steps": steps, "todo": "\n\n".join(notes), "_status": "failed" if any(not x.ok for x in results) else "done"}


@app.post("/api/runs")
def start_run(body: RunRequest, user: auth.SessionUser = Depends(admin)):
    email = str(user)
    if body.kind == "task" and len(body.task.strip()) < 10:
        raise HTTPException(400, "Describe the task in a sentence or more.")
    creds = creds_of(user)
    if not creds:
        raise HTTPException(428, "Sign in to SAP with your user ID and password first.")
    needs_model = body.kind == "task" or body.repair or body.agent
    if needs_model and not creds.anthropic_key:
        raise HTTPException(428, "Enter your Anthropic API key to run the agent.")
    if body.kind in ("task", "deploy") and not body.dryRun:
        # Tasks and manifest deploys need the agent's task handler on SAP; without it the agent
        # stops at sap_ping. Refuse early instead of spending model calls. The bootstrap installs it.
        from sap_agent.sapx import make_sapx
        ecfg = Config.from_env()
        hx = make_sapx(ecfg, creds.sap_user, creds.sap_password, creds.client or ecfg.client)
        if not hx.node_alive():
            setup = ", then the SICF node" if ecfg.handler_mode == "http" else ""
            raise HTTPException(409, f"The agent's SAP handler ({hx.path}) is not installed on {creds.sid} yet. Run the one-time setup first (Deploy -> Bootstrap with dry run off{setup}).")
    manifest = _resolve_manifest(body.manifest, body.kind == "bootstrap") if body.kind in ("deploy", "bootstrap") else ""
    params = {k: v for k, v in body.model_dump().items() if v not in ("", False)}

    def work(run: Run, approve) -> dict:
        cfg = _engine_cfg()
        cfg.user, cfg.password = creds.sap_user, creds.sap_password  # this person's own SAP login
        if creds.client:
            cfg.client = creds.client
        actor = f"{email} (as {creds.sap_user})"
        audit, guard, adt, sapx = build(cfg, actor, approve)
        cancelled = lambda: run.cancel_requested  # noqa: E731
        audit.log("web_run", run=run.id, kind=body.kind, by=email)
        if body.kind == "doctor":
            d = doctor(cfg, adt, sapx, guard)
            for c in d["checks"]:
                run.emit("check", **c)
            return {**d, "_status": "done" if d["ready"] else "failed"}

        tb = WatchedToolBox(ToolBox(guard, adt, sapx, audit, approve), run.emit, cancelled)
        if body.kind == "task":
            out = _agent(cfg, run, tb, audit, body.context, creds.anthropic_key).run(body.task, _say(run))
            return {"finalText": out.final_text, "steps": out.steps, "stopped": out.stopped, "_status": "done" if out.stopped == "end_turn" else "stopped"}

        m = Manifest.load(manifest)
        if body.kind == "bootstrap":
            return _bootstrap(cfg, m, guard, adt, sapx, audit, run, body)

        def log(s: str):
            if cancelled():
                raise RunCancelled("cancelled by the user")
            mm = STEP_LINE.match(s.strip())
            if mm:
                run.emit("step", id=mm.group(2), type=mm.group(3), status={"OK  ": "ok", "FAIL": "failed", "TODO": "manual"}[mm.group(1)])
            else:
                run.emit("log", text=s)

        repair = runner = None
        if body.repair or body.agent:
            ag = _agent(cfg, run, tb, audit, api_key=creds.anthropic_key)
            if body.repair:
                repair = lambda step, err: ag.run(f"Deployment step '{step}' failed with: {err}\nFind the cause in the ABAP source or setup and fix it with the tools. Do not release anything.", _say(run)).stopped == "end_turn"  # noqa: E731
            runner = lambda prompt: ag.run(prompt, _say(run)).stopped == "end_turn"  # noqa: E731
        dep = Deployer(m, guard, adt, sapx, audit, repair, log=log, agent_runner=runner)
        if body.transport:
            dep.ctx["request"] = body.transport.upper()
        res = dep.run(body.only or None, body.dryRun, body.keepGoing)
        steps = [{"id": x.id, "type": x.type, "ok": x.ok, "skipped": x.skipped, "manual": x.manual, "detail": x.detail if isinstance(x.detail, (dict, list, str)) else str(x.detail)} for x in res]
        todo = Deployer.todo_markdown(res) if any(x.manual for x in res) else ""
        bad = [x for x in res if not x.ok]
        return {"steps": steps, "todo": todo, "_status": "failed" if bad else "done"}

    try:
        run = RUNS.start(body.kind, email, params, work)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return run.summary()


@app.get("/api/runs")
def list_runs(_: str = Depends(admin)):
    return {"runs": RUNS.list()}


def _run(rid: str) -> Run:
    try:
        return RUNS.get(rid)
    except KeyError:
        raise HTTPException(404, "No such run.")


@app.get("/api/runs/{rid}")
def get_run(rid: str, after: int = 0, _: str = Depends(admin)):
    r = _run(rid)
    return {**r.summary(), "params": r.params, "result": r.result, "eventList": r.events[after:]}


class Decision(BaseModel):
    approve: bool
    confirm: str = ""


@app.post("/api/runs/{rid}/approvals/{aid}")
def decide(rid: str, aid: str, body: Decision, email: auth.SessionUser = Depends(admin)):
    if body.approve and body.confirm.strip().lower() != "yes":
        raise HTTPException(400, "Type yes to approve.")
    r = _run(rid)
    try:
        RUNS.decide(r, aid, body.approve, str(email))
    except KeyError as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@app.post("/api/runs/{rid}/cancel")
def cancel(rid: str, email: auth.SessionUser = Depends(admin)):
    r = _run(rid)
    if r.status not in ("queued", "running", "waiting_approval"):
        raise HTTPException(409, "The run is not active.")
    RUNS.cancel(r, str(email))
    return {"ok": True}


@app.get("/api/runs/{rid}/stream")
async def stream(rid: str, request: Request, after: int = 0, _: str = Depends(admin)):
    """Server-sent events: every run event after `after`, then `finished`. EventSource cannot send
    headers, so the session token comes as ?token=."""
    r = _run(rid)

    async def gen():
        sent, last_beat = after, time.time()
        while True:
            if await request.is_disconnected():
                return
            new = r.events[sent:]
            for e in new:
                yield f"id: {e['seq']}\ndata: {json.dumps(e, default=str)}\n\n"
            sent += len(new)
            if r.status not in ("queued", "running", "waiting_approval") and sent >= len(r.events):
                return
            if time.time() - last_beat > 15:
                yield ": keep-alive\n\n"
                last_beat = time.time()
            await asyncio.sleep(0.4)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
