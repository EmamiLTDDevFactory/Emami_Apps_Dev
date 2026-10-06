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
        "RUNS_DIR": str(tmp_path / "runs"), "SAP_HOST": "https://sap.test", "SAP_USER": "", "SAP_PASSWORD": "",
        "SAP_ALLOWED_SIDS": "EDS", "SAP_ALLOWED_PACKAGES": "ZEMAMI", "SAP_APPROVAL": "prompt", "AUDIT_FILE": str(tmp_path / "audit.jsonl"),
        "APPROVAL_TIMEOUT_S": "20",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import sap_agent_web.app as appmod
    appmod = importlib.reload(appmod)
    from fastapi.testclient import TestClient

    from sap_agent.audit import Audit
    from sap_agent.guard import Guard
    fakes = {"adt": FakeAdt(), "sapx": FakeSapx(sid="EDS"), "script": []}

    def fake_build(cfg, actor, approve):
        return Audit(cfg.audit_file, actor=actor), Guard(cfg, approve), fakes["adt"], fakes["sapx"]

    def fake_agent(cfg, run, tb, audit, ctx="", api_key=""):
        from sap_agent.agent import Agent
        assert api_key == "sk-ant-good"
        fakes["sap_user_seen"] = cfg.user
        return Agent(FakeLLM(fakes["script"]), "m", tb, audit, 10, ctx)

    monkeypatch.setattr(appmod, "build", fake_build)
    monkeypatch.setattr(appmod, "_agent", fake_agent)
    # SAP login check: the system id page and ADT discovery; the Anthropic key check.
    fakes["sid"] = "EDS"
    monkeypatch.setattr(appmod, "_sap_system_id", lambda cfg: fakes["sid"])
    from sap_agent import adt as adtmod

    def discovery(self):
        if self.s.auth[1] == "bad":
            raise adtmod.AdtError("unauthorized", 401, "")
        return {}

    monkeypatch.setattr(adtmod.AdtClient, "discovery", discovery)
    import anthropic

    class FakeAnthropic:
        def __init__(self, api_key=None, **kw):
            self.key = api_key
            self.models = self

        def list(self, limit=1):
            if self.key != "sk-ant-good":
                e = Exception("unauthorized")
                e.status_code = 401
                raise e
            return []

    monkeypatch.setattr(anthropic, "Anthropic", FakeAnthropic)

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


def login(client, email="admin@emamigroup.com", sap=True, key="sk-ant-good"):
    r = client.post("/api/session", json={"hubToken": hub(email)})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if sap:
        s = client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "secret-pw", "anthropicKey": key})
        assert s.status_code == 200, s.text
    return h


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
    assert cfg["sap"] == {"user": "JDOE", "sid": "EDS", "client": ""} and cfg["anthropicKeySet"] is True
    assert "secret-pw" not in str(cfg) and "sk-ant-good" not in str(cfg)


def test_task_run_streams_model_text_and_tool_calls(web):
    client, _, fakes = web
    fakes["script"] = [
        resp([{"type": "text", "text": "plan"}, tool("1", "sap_ping")], "tool_use"),
        resp([tool("2", "sap_write_source", kind="class", name="ZCL_X", source="CLASS zcl_x.", package="ZEMAMI")], "tool_use"),
        resp([{"type": "text", "text": "done: created ZCL_X"}], "end_turn")]
    h = login(client)
    rid = client.post("/api/runs", headers=h, json={"kind": "task", "task": "Create class ZCL_X in ZEMAMI"}).json()["id"]
    r = wait(client, h, rid)
    assert r["status"] == "done", r
    types = [e["type"] for e in r["eventList"]]
    assert types[0] == "started" and types[-1] == "finished"
    assert {"say", "tool_call", "tool_result"} <= set(types)
    assert r["result"]["finalText"] == "done: created ZCL_X"
    assert ("write", "class", "ZCL_X") in fakes["adt"].calls
    # the audit log names the person behind the run
    audit = open(os.environ["AUDIT_FILE"], encoding="utf-8").read()
    assert "admin@emamigroup.com (as JDOE)" in audit
    assert fakes["sap_user_seen"] == "JDOE"
    assert "secret-pw" not in audit and "sk-ant-good" not in audit


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


def test_sap_login_is_required_and_checked(web):
    client, appmod, fakes = web
    h = login(client, sap=False)
    assert client.post("/api/runs", headers=h, json={"kind": "doctor"}).status_code == 428
    bad = client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "bad"})
    assert bad.status_code == 401 and "rejected" in bad.json()["detail"]
    badkey = client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "pw", "anthropicKey": "sk-wrong"})
    assert badkey.status_code == 401 and "Anthropic" in badkey.json()["detail"]
    fakes["sid"] = "NWP"
    wrong = client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "pw"})
    assert wrong.status_code == 403 and "not an allowed development system" in wrong.json()["detail"]
    fakes["sid"] = "EDS"
    assert client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "pw", "sapClient": "1x"}).status_code == 422
    ok = client.post("/api/sap/login", headers=h, json={"sapUser": "jdoe", "sapPassword": "pw", "sapClient": "200"})
    assert ok.status_code == 200 and ok.json() == {"sapUser": "JDOE", "sid": "EDS", "client": "200", "anthropicKeySet": False}
    # SAP only (no key): deploy works, the agent does not
    assert client.post("/api/runs", headers=h, json={"kind": "task", "task": "Create class ZCL_X in ZEMAMI"}).status_code == 428
    rid = client.post("/api/runs", headers=h, json={"kind": "doctor"}).json()["id"]
    wait(client, h, rid)
    # sign out of SAP drops the credentials
    assert client.post("/api/sap/logout", headers=h).status_code == 200
    assert client.get("/api/config", headers=h).json()["sap"] is None
    assert client.post("/api/runs", headers=h, json={"kind": "doctor"}).status_code == 428


def test_credentials_never_show_in_repr():
    from sap_agent_web.vault import Creds
    c = Creds("JDOE", "secret-pw", "sk-ant-good", "EDS", 0)
    assert "secret-pw" not in repr(c) and "sk-ant-good" not in repr(c)
