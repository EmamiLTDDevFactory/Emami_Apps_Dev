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
    assert "zcl_src_agent_run=>run" in src and "it``s" in src
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
