import base64
import time

import jwt
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("HUB_AUTH_JWT_SECRET", "hubsecret")
    monkeypatch.setenv("VISION_ANTHROPIC_API_KEY", "sk-ant-test")
    from sap_agent_web import app as appmod, vision
    vision._hits.clear()
    return TestClient(appmod.app), vision


def hub(email="gate.user@emamigroup.com", secret="hubsecret"):
    return {"Authorization": "Bearer " + jwt.encode({"email": email, "exp": int(time.time()) + 600}, secret, algorithm="HS256")}


IMG = base64.b64encode(b"\xff\xd8\xff fake jpeg").decode()


def fake_reads(monkeypatch, vision, readings):
    it = iter(readings)
    monkeypatch.setattr(vision, "_read_once", lambda *a: next(it))
    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", lambda **k: object())


def test_two_agreeing_readings(client, monkeypatch):
    c, vision = client
    fake_reads(monkeypatch, vision, [{"plate": "WB 25 F 4521", "confidence": "high", "source": "rear plate"},
                                     {"plate": "WB25F4521", "confidence": "high", "source": "rear plate"}])
    r = c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub())
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["plate"] == "WB25F4521" and j["confidence"] == "high" and j["valid"] and j["agreed"]


def test_disagreement_is_low_and_offers_both(client, monkeypatch):
    c, vision = client
    fake_reads(monkeypatch, vision, [{"plate": "MH12AB1234", "confidence": "high", "source": "front plate"},
                                     {"plate": "MH12A81234", "confidence": "medium", "source": "front plate"}])
    j = c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub()).json()
    assert j["confidence"] == "low" and not j["agreed"] and "MH12A81234" in j["candidates"]


def test_bharat_series_and_bad_format(client, monkeypatch):
    c, vision = client
    fake_reads(monkeypatch, vision, [{"plate": "22BH1234AA", "confidence": "high", "source": "rear plate"}] * 2
               + [{"plate": "XX1", "confidence": "high", "source": "other"}] * 2)
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub()).json()["valid"]
    j = c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub()).json()
    assert not j["valid"] and j["confidence"] == "low" and "format" in j["notes"]


def test_needs_a_hub_session_and_a_key(client, monkeypatch):
    c, vision = client
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}).status_code == 401
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub(secret="other")).status_code == 401
    monkeypatch.delenv("VISION_ANTHROPIC_API_KEY")
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub()).status_code == 428


def test_key_typed_in_the_app_is_used_and_checked(client, monkeypatch):
    c, vision = client
    monkeypatch.delenv("VISION_ANTHROPIC_API_KEY")
    used = []
    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", lambda **k: used.append(k["api_key"]) or object())
    monkeypatch.setattr(vision, "_read_once", lambda *a: {"plate": "WB25F4521", "confidence": "high", "source": "rear plate"})
    h = {**hub(), "X-Anthropic-Key": "sk-ant-api03-" + "x" * 40}
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=h).json()["plate"] == "WB25F4521"
    assert used == ["sk-ant-api03-" + "x" * 40]
    bad = {**hub(), "X-Anthropic-Key": "hello"}
    assert c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=bad).status_code == 400


def test_rejects_non_images_and_rate_limits(client, monkeypatch):
    c, vision = client
    assert c.post("/api/vision/vehicle-number", json={"image": IMG, "mediaType": "application/pdf"}, headers=hub()).status_code == 400
    assert c.post("/api/vision/vehicle-number", json={"image": "not base64!!"}, headers=hub()).status_code == 400
    fake_reads(monkeypatch, vision, [{"plate": "OD02K9911", "confidence": "high", "source": "rear plate"}] * 200)
    codes = [c.post("/api/vision/vehicle-number", json={"image": IMG}, headers=hub("a@b.c")).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429
