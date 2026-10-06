"""Web layer: sign-in, admin-only access, run lifecycle with live events, typed approvals, cancel,
one run at a time, deploy limited to bundled manifests. The SAP side and the model are the same fakes the
engine tests use, so nothing here reaches SAP or the Anthropic API."""
import importlib
import os
import sys
import time

import jwt
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from tests.conftest import FakeAdt, FakeSapx  # noqa: E402
from tests.test_deploy_and_tools import FakeLLM, resp, tool  # noqa: E402

HUB_SECRET, SESSION_SECRET = "hub-secret", "session-secret"


@pytest.fixture
def web(tmp_path, monkeypatch):
    env = {
        "HUB_AUTH_JWT_SECRET": HUB_SECRET, "SESSION_SECRET": SESSION_SECRET, "HUB_ACCESS_API_BASE": "http://access.test/api",
        "RUNS_DIR": str(tmp_path / "runs"), "SAP_HOST": "https://sap.test", "SAP_USER": "ZSRC_AGENT", "SAP_PASSWORD": "pw",
        "SAP_ALLOWED_SIDS": "DEV", "SAP_ALLOWED_PACKAGES": "ZSRC", "SAP_APPROVAL": "prompt", "AUDIT_FILE": str(tmp_path / "audit.jsonl"),
        "ANTHROPIC_API_KEY": "test", "APPROVAL_TIMEOUT_S": "20",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import sap_agent_web.app as appmod
    appmod = importlib.reload(appmod)
    from fastapi.testclient import TestClient

    from sap_agent.audit import Audit
    from sap_agent.guard import Guard
    fakes = {"adt": FakeAdt(), "sapx": FakeSapx(), "script": []}

    def fake_build(cfg, actor, approve):
        return Audit(cfg.audit_file, actor=actor), Guard(cfg, approve), fakes["adt"], fakes["sapx"]

    def fake_agent(cfg, run, tb, audit, ctx=""):
        from sap_agent.agent import Agent
        return Agent(FakeLLM(fakes["script"]), "m", tb, audit, 10, ctx)

    monkeypatch.setattr(appmod, "build", fake_build)
    monkeypatch.setattr(appmod, "_agent", fake_agent)

    roles = {"admin@emamigroup.com": "Admin", "user@emamigroup.com": "User"}

    class R:
        def __init__(self, email):
            self.email = email

        def json(self):
            role = roles.get(self.email)
            return {"apps": [{"appId": "sap-agent", "role": role}] if role else []}

    monkeypatch.setattr(appmod.auth.requests, "get", lambda url, params, timeout: R(params["email"]))
    return TestClient(appmod.app), appmod, fakes


def hub(email, **extra):
    return jwt.encode({"email": email, "exp": int(time.time()) + 600, **extra}, HUB_SECRET, algorithm="HS256")


def login(client, email="admin@emamigroup.com"):
    r = client.post("/api/session", json={"hubToken": hub(email)})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def wait(client, h, rid, until=("done", "failed", "stopped", "cancelled"), timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/api/runs/{rid}", headers=h).json()
        if r["status"] in until:
            return r
        time.sleep(0.05)
    raise AssertionError(f"run stuck in {r['status']}")


def test_only_admins_get_a_session(web):
    client, _, _ = web
    assert client.post("/api/session", json={"hubToken": hub("user@emamigroup.com")}).status_code == 403
    assert client.post("/api/session", json={"hubToken": hub("nobody@emamigroup.com")}).status_code == 403
    bad = jwt.encode({"email": "admin@emamigroup.com"}, "wrong-secret", algorithm="HS256")
    assert client.post("/api/session", json={"hubToken": bad}).status_code == 401
    assert client.get("/api/config").status_code == 401
    h = login(client)
    cfg = client.get("/api/config", headers=h).json()
    assert cfg["user"] == "admin@emamigroup.com"
    assert cfg["engine"]["passwordSet"] is True and "password" not in cfg["engine"]


def test_task_run_streams_model_text_and_tool_calls(web):
    client, _, fakes = web
    fakes["script"] = [
        resp([{"type": "text", "text": "plan"}, tool("1", "sap_ping")], "tool_use"),
        resp([tool("2", "sap_write_source", kind="class", name="ZCL_X", source="CLASS zcl_x.", package="ZSRC")], "tool_use"),
        resp([{"type": "text", "text": "done: created ZCL_X"}], "end_turn")]
    h = login(client)
    rid = client.post("/api/runs", headers=h, json={"kind": "task", "task": "Create class ZCL_X in ZSRC"}).json()["id"]
    r = wait(client, h, rid)
    assert r["status"] == "done", r
    types = [e["type"] for e in r["eventList"]]
    assert types[0] == "started" and types[-1] == "finished"
    assert {"say", "tool_call", "tool_result"} <= set(types)
    assert r["result"]["finalText"] == "done: created ZCL_X"
    assert ("write", "class", "ZCL_X") in fakes["adt"].calls
    # the audit log names the person behind the run
    audit = open(os.environ["AUDIT_FILE"], encoding="utf-8").read()
    assert "admin@emamigroup.com (as ZSRC_AGENT)" in audit


def test_approval_waits_for_a_typed_yes(web):
    client, _, fakes = web
    fakes["script"] = [
        resp([tool("1", "request_human_approval", action="create user", detail="EMAMI_TEST")], "tool_use"),
        resp([{"type": "text", "text": "ok"}], "end_turn")]
    h = login(client)
    rid = client.post("/api/runs", headers=h, json={"kind": "task", "task": "Create a test user please"}).json()["id"]
    r = wait(client, h, rid, until=("waiting_approval",))
    ap = r["pendingApproval"]
    assert ap["action"] == "create user"
    assert client.post(f"/api/runs/{rid}/approvals/{ap['id']}", headers=h, json={"approve": True, "confirm": "ok"}).status_code == 400
    assert client.post(f"/api/runs/{rid}/approvals/{ap['id']}", headers=h, json={"approve": True, "confirm": "yes"}).status_code == 200
    r = wait(client, h, rid)
    assert r["status"] == "done"
    decided = [e for e in r["eventList"] if e["type"] == "approval_decided"][0]
    assert decided["approved"] is True and decided["by"] == "admin@emamigroup.com"


def test_one_run_at_a_time_and_cancel(web):
    client, _, fakes = web
    fakes["script"] = [
        resp([tool("1", "request_human_approval", action="x", detail="y")], "tool_use"),
        resp([tool("2", "sap_ping")], "tool_use"),
        resp([{"type": "text", "text": "never"}], "end_turn")]
    h = login(client)
    rid = client.post("/api/runs", headers=h, json={"kind": "task", "task": "Something that needs approval"}).json()["id"]
    wait(client, h, rid, until=("waiting_approval",))
    busy = client.post("/api/runs", headers=h, json={"kind": "doctor"})
    assert busy.status_code == 409
    assert client.post(f"/api/runs/{rid}/cancel", headers=h).status_code == 200
    r = wait(client, h, rid)
    assert r["status"] == "cancelled"


def test_deploy_only_bundled_manifests_and_dry_run(web):
    client, appmod, _ = web
    h = login(client)
    ms = client.get("/api/manifests", headers=h).json()["manifests"]
    assert any(m["path"].endswith("emami_sourcing/manifest.yaml") for m in ms)
    assert client.post("/api/runs", headers=h, json={"kind": "deploy", "manifest": "../../../etc/passwd"}).status_code == 400
    path = [m["path"] for m in ms if m["path"].endswith("emami_sourcing/manifest.yaml")][0]
    rid = client.post("/api/runs", headers=h, json={"kind": "deploy", "manifest": path, "dryRun": True}).json()["id"]
    r = wait(client, h, rid)
    assert r["status"] == "done", r
    assert r["result"]["steps"] and all(s["skipped"] for s in r["result"]["steps"])
    assert any(e["type"] == "log" and "[dry-run]" in e["text"] for e in r["eventList"])


def test_doctor_reports_missing_credentials(web, monkeypatch):
    client, _, _ = web
    monkeypatch.setenv("SAP_PASSWORD", "")
    h = login(client)
    rid = client.post("/api/runs", headers=h, json={"kind": "doctor"}).json()["id"]
    r = wait(client, h, rid)
    assert r["status"] == "failed"
    assert any(e["type"] == "check" and not e["ok"] for e in r["eventList"])
