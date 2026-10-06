import xml.etree.ElementTree as ET
import pytest
from sap_agent import adt


@pytest.mark.parametrize("kind", ["class", "interface", "program", "package"])
def test_create_xml_is_wellformed_and_escaped(kind):
    x = adt.create_xml(kind, "ZSRC_X", 'Desc with "quotes" & <angle>', "ZSRC", "agent")
    root = ET.fromstring(x)
    assert root.get("{http://www.sap.com/adt/core}name") == "ZSRC_X"
    assert root.get("{http://www.sap.com/adt/core}type") == adt.KIND_TYPE[kind]
    assert 'quotes' in root.get("{http://www.sap.com/adt/core}description")


def test_description_is_cut_to_60():
    x = adt.create_xml("class", "ZX", "d" * 200, "ZSRC", "u")
    assert len(ET.fromstring(x).get("{http://www.sap.com/adt/core}description")) == 60


def test_object_uri():
    assert adt.object_uri("class", "ZCL_SRC_UTIL") == "/sap/bc/adt/oo/classes/zcl_src_util"
    assert adt.object_uri("program", "ZSRC_AUC_TICK") == "/sap/bc/adt/programs/programs/zsrc_auc_tick"


def test_activation_and_check_xml():
    r = ET.fromstring(adt.object_refs_xml([("/sap/bc/adt/oo/classes/zcl_a", "zcl_a"), ("/sap/bc/adt/oo/classes/zcl_b", "ZCL_B")]))
    assert len(list(r)) == 2
    c = ET.fromstring(adt.checkrun_xml(["/sap/bc/adt/oo/classes/zcl_a"]))
    assert c[0].get("{http://www.sap.com/adt/checkrun}version") == "inactive"
    ET.fromstring(adt.transport_xml("desc & more", "agent"))
    ET.fromstring(adt.unit_xml(["/sap/bc/adt/oo/classes/zcl_a"]))


def test_lock_handle_parse():
    assert adt.parse_lock_handle("<asx:abap><asx:values><DATA><LOCK_HANDLE>ABC123</LOCK_HANDLE></DATA></asx:values></asx:abap>") == "ABC123"
    with pytest.raises(adt.AdtError):
        adt.parse_lock_handle("<x/>")


def test_activation_messages_and_errors():
    body = '<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><msg type="E" line="12" objDescr="Class ZCL_A"><shortText><txt>Field X is unknown</txt></shortText></msg><msg type="W" line="3"><shortText><txt>warn</txt></shortText></msg></chkl:messages>'
    m = adt.parse_messages(body)
    assert len(m) == 2 and m[0]["line"] == "12" and "unknown" in m[0]["text"]
    assert adt.has_errors(m)
    assert not adt.has_errors([m[1]])
    assert adt.parse_messages("") == []


def test_transport_number():
    assert adt.parse_request_number('<tm:request tm:number="DEVK900123"/>') == "DEVK900123"
    assert adt.parse_request_number('<link href="/sap/bc/adt/cts/transportrequests/DEVK900124"/>') == "DEVK900124"
    with pytest.raises(adt.AdtError):
        adt.parse_request_number("nothing")


def test_discovery():
    d = '<app:service xmlns:app="http://www.w3.org/2007/app"><app:workspace><app:collection href="/sap/bc/adt/oo/classes"><app:accept>application/vnd.sap.adt.oo.classes.v4+xml</app:accept></app:collection></app:workspace></app:service>'
    assert adt.parse_discovery(d) == {"/sap/bc/adt/oo/classes": ["application/vnd.sap.adt.oo.classes.v4+xml"]}


def test_unit_result():
    ok = '<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"><program><testClasses><testClass><testMethods><testMethod name="a"/><testMethod name="b"/></testMethods></testClass></testClasses></program></aunit:runResult>'
    assert adt.parse_unit(ok) == {"ok": True, "tests": 2, "failures": []}
    bad = ok.replace("</testMethods>", '</testMethods><alerts><alert kind="failedAssertion" severity="critical"><title>expected 1 got 2</title></alert></alerts>')
    r = adt.parse_unit(bad)
    assert not r["ok"] and r["failures"][0]["title"] == "expected 1 got 2"


def test_package_of_parsing():
    x = '<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZCL_X"><adtcore:packageRef adtcore:name="ZSRC"/></class:abapClass>'
    assert adt.parse_package(x) == "ZSRC"
    assert adt.parse_package("<x/>") is None
    assert adt.parse_package("not xml") is None


def test_transport_falls_back_to_the_750_cts_resource():
    from sap_agent.adt import AdtClient, AdtError

    class R:
        def __init__(self, code, text):
            self.status_code, self.text, self.headers = code, text, {}

    class S:
        headers = {}
        def __init__(self):
            self.calls = []
        def request(self, method, url, data=None, headers=None):
            self.calls.append((url, headers.get("Content-Type", ""), data))
            if "/cts/transportrequests" in url:
                return R(400, "<exc:exception>user action is not supported</exc:exception>")
            return R(200, "/com.sap.cts/object_record/EDSK9B0DQL")

    s = S()
    c = AdtClient("https://sap", "", "IT_FCOMMON", "", session=s)
    assert c.create_transport("SAP agent bootstrap", package="zemami") == "EDSK9B0DQL"
    url, ctype, body = s.calls[-1]
    assert "/sap/bc/adt/cts/transports?" in url and "CreateCorrectionRequest" in ctype
    assert b"<DEVCLASS>ZEMAMI</DEVCLASS>" in body and b"SAP agent bootstrap" in body
    try:
        AdtClient("https://sap", "", "U", "", session=S()).create_transport("x")
        assert False, "without a package there is no fallback"
    except AdtError as e:
        assert e.status == 400


def test_runner_round_trip_without_sicf():
    import base64, json
    from sap_agent.sapx import runner_test_source, parse_runner_result, SapxError
    payload = json.dumps({"task": "ping", "args": {"q": "it`s " + "x" * 250}})
    src = runner_test_source(payload)
    assert "FOR TESTING" in src and "zcl_src_agent_tasks=>handle" in src and "it``s" in src
    assert all(len(line) < 255 for line in src.splitlines())
    answer = base64.b64encode(json.dumps({"ok": True, "result": {"sid": "EDS", "t": "é" * 80}}).encode()).decode()
    parts = [answer[i:i + 100] for i in range(0, len(answer), 100)]
    alerts = "".join(f'<alert kind="failedAssertion" severity="critical"><title>ZSRC {i} {len(parts)} {p}</title></alert>' for i, p in enumerate(parts, 1))
    body = f'<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"><program><testClasses><testClass><testMethods><testMethod><alerts>{alerts}</alerts></testMethod></testMethods></testClass></testClasses></program></aunit:runResult>'
    assert parse_runner_result(body)["result"]["sid"] == "EDS"
    with pytest.raises(SapxError, match="incomplete"):
        parse_runner_result(body.replace(f"<title>ZSRC 1 ", "<title>ZSRC 9 ", 1))
    with pytest.raises(SapxError, match="Runtime error"):
        parse_runner_result('<r><alert kind="exception"><title>Runtime error CX_SY_NO_HANDLER</title></alert></r>')


def test_runner_client_writes_the_main_source_and_reads_the_answer():
    import base64, json
    from sap_agent.sapx import AdtRunnerClient

    class R:
        def __init__(self, code=200, text=""):
            self.status_code, self.text = code, text

    class FakeAdt:
        def __init__(self):
            self.calls = []
        def _req(self, method, path, data=None, headers=None, ok=(200,)):
            self.calls.append((method, path.split("?")[0], data))
            if "_action=LOCK" in path:
                return R(200, "<LOCK_HANDLE>H1</LOCK_HANDLE><CORRNR>EDSK9B0DQN</CORRNR>")
            if method == "GET" and path.endswith("/includes/testclasses"):
                return R(200, "old")
            if method == "GET" and "/source/main" in path:
                puts = [d for m, p, d in self.calls if m == "PUT" and p.endswith("/source/main")]
                return R(200, puts[-1] if puts else "")
            if path.startswith("/sap/bc/adt/abapunit/testruns"):
                import re as _re
                src = [d for m, p, d in self.calls if m == "PUT" and p.endswith("/source/main")][-1]
                nonce = _re.search(r"\|ZSRC (\w+) ", src).group(1)
                ans = base64.b64encode(json.dumps({"ok": True, "result": {"sid": "EDS"}}).encode()).decode()
                return R(200, f"<r><alert kind='failedAssertion'><title>Critical Assertion Error: 'ZSRC {nonce} 1 1 {ans}'</title></alert></r>")
            return R(200, "<r/>")
        def unlock(self, kind, name, handle):
            self.calls.append(("UNLOCK", name, handle))

    adt = FakeAdt()
    c = AdtRunnerClient(adt)
    assert c.call("ping") == {"sid": "EDS"}
    puts = [(p, d) for m, p, d in adt.calls if m == "PUT"]
    assert len(puts) == 1 and puts[0][0].endswith("/zcl_src_agent_run/source/main") and "FOR TESTING" in puts[0][1]
    assert any(t.startswith("active after") for t in c.trace)


def test_runner_waits_for_a_late_activation(monkeypatch):
    """EDS switches the active version a moment after the activation call returns."""
    import base64, json, re as _re, time
    from sap_agent.sapx import AdtRunnerClient
    monkeypatch.setattr(time, "sleep", lambda s: None)

    class R:
        def __init__(self, code=200, text=""):
            self.status_code, self.text = code, text

    class LateAdt:
        def __init__(self):
            self.saved, self.active, self.reads = "", "boot", 0
        def _req(self, method, path, data=None, headers=None, ok=(200,)):
            if "_action=LOCK" in path:
                return R(200, "<LOCK_HANDLE>H</LOCK_HANDLE><CORRNR>EDSK9B0DQN</CORRNR>")
            if method == "PUT":
                self.saved = data
                return R(200)
            if method == "GET" and "version=active" in path:
                self.reads += 1
                if self.reads >= 3:          # becomes active on the third look
                    self.active = self.saved
                return R(200, self.active)
            if method == "GET":
                return R(200, self.saved)
            if path.startswith("/sap/bc/adt/abapunit"):
                nonce = _re.search(r"\|ZSRC (\w+) ", self.active).group(1)
                ans = base64.b64encode(json.dumps({"ok": True, "result": {"n": nonce}}).encode()).decode()
                return R(200, f"<r><alert><title>Critical Assertion Error: 'ZSRC {nonce} 1 1 {ans}'</title></alert></r>")
            return R(200, "")
        def unlock(self, *a):
            pass

    c = AdtRunnerClient(LateAdt())
    assert c.call("ddic_read", {"name": "EKKO"})["n"] != "boot"


def test_runner_result_as_eds_750_sends_it():
    from sap_agent.sapx import parse_runner_result
    body = ("<r><alert kind='warning'><title>The global test class [ZCL_SRC_AGENT_RUN] is not abstract</title></alert>"
            "<alert kind='failedAssertion'><title>Critical Assertion Error: 'ZSRC 1 2 eyJvayI6dHJ1ZSwicmVzdWx0Ijp7InNpZCI6IkVEUyIsImNsaWVudCI6IjkwMCIsInJlbGVhc2UiOiI3NTAiLCJ1c2VyIjoiSVRf'</title></alert>"
            "<alert kind='failedAssertion'><title>Critical Assertion Error: 'ZSRC 2 2 RkNPTU1PTiIsImFiYXAiOiI3NTAifX0='</title></alert></r>")
    assert parse_runner_result(body) == {"ok": True, "result": {"sid": "EDS", "client": "900", "release": "750", "user": "IT_FCOMMON", "abap": "750"}}


def test_runner_reports_a_stale_class_instead_of_its_answer():
    from sap_agent.sapx import parse_runner_result, SapxError
    body = "<r><alert kind='failedAssertion'><title>Critical Assertion Error: 'ZSRC boot 1 1 eyJvayI6dHJ1ZX0='</title></alert></r>"
    with pytest.raises(SapxError, match="older version"):
        parse_runner_result(body, nonce="abc123")
