"""Client for the SAP-side task handler (ZCL_SRC_AGENT_TASKS).
Anything ADT cannot do on ECC (DDIC tables, lock objects, number ranges, text IDs, batch input, running reports) goes here.

Two ways to reach it:
  - SapxClient: HTTP POST to the ICF node (ZCL_SRC_AGENT_HTTP at /sap/zsrc_agent/tasks) - needs SICF;
  - AdtRunnerClient: through ADT only (no SICF) - each request is saved, inactive, into program ZSRC_AGENT_REQ
    and the fixed global test class ZCL_SRC_AGENT_RUN is run with ABAP Unit; it reads the request and answers
    in numbered test messages.
make_sapx() picks one from SAP_HANDLER_MODE (adt | http)."""
from __future__ import annotations
import base64
import json
import re
import xml.etree.ElementTree as ET


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


RUNNER_CLASS = "ZCL_SRC_AGENT_RUN"
REQUEST_PROGRAM = "ZSRC_AGENT_REQ"
_CHUNK = 100
_LINE = 200


def runner_class_source(size: int = _CHUNK) -> str:
    """ZCL_SRC_AGENT_RUN: a global test class, installed and activated once by the bootstrap and never changed.
    Its test reads the request from the INACTIVE source of ZSRC_AGENT_REQ (READ REPORT ... STATE 'I'), so a call
    needs no activation (EDS 7.50 ignores activations sent for this class), and answers in numbered test messages."""
    return (
        "CLASS zcl_src_agent_run DEFINITION PUBLIC FINAL CREATE PUBLIC FOR TESTING DURATION LONG RISK LEVEL HARMLESS.\n"
        "  PRIVATE SECTION.\n"
        "    \" The SAP agent's runner (no SICF node): the agent saves each request, base64, into the inactive source of\n"
        "    \" program ZSRC_AGENT_REQ and runs this test; the answer of ZCL_SRC_AGENT_TASKS=>HANDLE comes back base64\n"
        "    \" in numbered test messages tagged with the request id. Do not change; ZSRC_AGENT_REQ is never activated.\n"
        "    METHODS go FOR TESTING.\n"
        "ENDCLASS.\n\n"
        "CLASS zcl_src_agent_run IMPLEMENTATION.\n"
        "  METHOD go.\n"
        "    DATA lt_src TYPE string_table.\n"
        "    DATA(lv_prog) = CONV syrepid( 'ZSRC_AGENT_REQ' ).\n"
        "    READ REPORT lv_prog INTO lt_src STATE 'I'.\n"
        "    IF sy-subrc <> 0.\n"
        "      READ REPORT lv_prog INTO lt_src.\n"
        "    ENDIF.\n"
        "    DATA(lv_id) = `none`.\n"
        "    DATA(lv_req) = ``.\n"
        "    LOOP AT lt_src INTO DATA(lv_line).\n"
        "      IF strlen( lv_line ) > 3 AND substring( val = lv_line len = 3 ) = '*I:'.\n"
        "        lv_id = condense( substring( val = lv_line off = 3 ) ).\n"
        "      ELSEIF strlen( lv_line ) > 3 AND substring( val = lv_line len = 3 ) = '*J:'.\n"
        "        lv_req = lv_req && condense( substring( val = lv_line off = 3 ) ).\n"
        "      ENDIF.\n"
        "    ENDLOOP.\n"
        "    DATA(lv_out) = cl_http_utility=>encode_base64( zcl_src_agent_tasks=>handle( cl_http_utility=>decode_base64( lv_req ) ) ).\n"
        "    COMMIT WORK.\n"
        "    DATA(lv_len) = strlen( lv_out ).\n"
        f"    DATA(lv_count) = ( lv_len + {size - 1} ) DIV {size}.\n"
        "    DATA(lv_off) = 0.\n"
        "    DATA(lv_no) = 0.\n"
        "    WHILE lv_off < lv_len.\n"
        f"      DATA(lv_n) = nmin( val1 = {size} val2 = lv_len - lv_off ).\n"
        "      lv_no = lv_no + 1.\n"
        "      DATA(lv_msg) = |ZSRC { lv_id } { lv_no } { lv_count } { substring( val = lv_out off = lv_off len = lv_n ) }|.\n"
        "      cl_abap_unit_assert=>fail( msg = lv_msg quit = if_aunit_constants=>no ).\n"
        "      lv_off = lv_off + lv_n.\n"
        "    ENDWHILE.\n"
        "  ENDMETHOD.\n"
        "ENDCLASS.\n")


def request_source(payload: str, nonce: str = "boot") -> str:
    """ZSRC_AGENT_REQ for one request: comment lines only (request id, then the request base64 in slices)."""
    b64 = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    lines = ["REPORT zsrc_agent_req.",
             "* Request for the SAP agent, read by ZCL_SRC_AGENT_RUN from this INACTIVE version. Do not activate or edit.",
             f"*I:{nonce}"]
    lines += [f"*J:{b64[i:i + _LINE]}" for i in range(0, len(b64), _LINE)]
    return "\n".join(lines) + "\n"


def parse_runner_result(body: str, size: int = _CHUNK, nonce: str = "") -> dict:
    """Reassembles the handler's JSON answer from the ABAP Unit alerts; anything else in the run becomes the error."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise SapxError(f"ABAP Unit returned no XML: {body[:300]}")
    chunks: dict[int, str] = {}
    total, other, stale = 0, [], set()
    for el in root.iter():
        if el.tag.split("}")[-1] != "alert":
            continue
        title = "".join(t.text or "" for t in el.iter() if t.tag.split("}")[-1] == "title").strip()
        # 7.50 wraps the message: "Critical Assertion Error: 'ZSRC 1 2 eyJ...'"
        m = re.search(r"ZSRC (?:([A-Za-z0-9]+) )?(\d+) (\d+) ([A-Za-z0-9+/=]*)", title)
        if m and nonce and m.group(1) != nonce:
            stale.add(m.group(1) or "-")       # not this request's answer (the request was not saved, or another call's ran)
        elif m:
            chunks[int(m.group(2))], total = m.group(4), int(m.group(3))
        elif title and "is not abstract" not in title:   # 7.50 warns about every non-abstract global test class
            other.append(title)
    if not chunks and stale:
        raise SapxError(f"the runner answered another request ({', '.join(sorted(stale))}, not {nonce}): this request was not saved into ZSRC_AGENT_REQ, or the runner is still the old version - run the bootstrap once")
    if not chunks:
        raise SapxError("handler run gave no answer" + (f": {'; '.join(other)[:500]}" if other else " (no ABAP Unit result - is ZCL_SRC_AGENT_RUN active?)"))
    if set(chunks) != set(range(1, total + 1)) or any(len(chunks[i]) != size for i in range(1, total)):
        raise SapxError(f"handler answer arrived incomplete ({len(chunks)}/{total} parts) - the test messages are being cut")
    raw = base64.b64decode("".join(chunks[i] for i in range(1, total + 1))).decode("utf-8")
    try:
        return json.loads(raw)
    except ValueError:
        raise SapxError(f"handler returned non-JSON: {raw[:300]}")


class AdtRunnerClient:
    """Task handler over ADT (no ICF node): save the request into ZSRC_AGENT_REQ (inactive, never activated) and run
    the ABAP Unit test of ZCL_SRC_AGENT_RUN, which reads it, calls ZCL_SRC_AGENT_TASKS=>HANDLE and answers."""

    def __init__(self, adt, runner: str = RUNNER_CLASS, program: str = REQUEST_PROGRAM):
        self.adt, self.runner, self.program = adt, runner.upper(), program.upper()
        self.path = f"ADT / ABAP Unit of {self.runner}"
        self.trace: list[str] = []

    def _write(self, source: str):
        from .adt import object_uri, parse_lock_handle
        uri = object_uri("program", self.program)
        r = self.adt._req("POST", uri + "?_action=LOCK&accessMode=MODIFY",
                          headers={"Accept": "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result"})
        handle = parse_lock_handle(r.text)
        m = re.search(r"<CORRNR>([^<]*)</CORRNR>", r.text)
        corr = f"&corrNr={m.group(1)}" if m and m.group(1) else ""
        try:
            r = self.adt._req("PUT", f"{uri}/source/main?lockHandle={handle}{corr}", data=source,
                              headers={"Content-Type": "text/plain; charset=utf-8", "Accept": "text/plain"})
            self.trace.append(f"request saved {r.status_code} corr={corr[8:] or '-'}")
        finally:
            self.adt.unlock("program", self.program, handle)

    def _has(self, nonce: str, version: str = "inactive"):
        """Whether that version of the request program carries this request's id (None when it cannot be read)."""
        from .adt import object_uri
        try:
            r = self.adt._req("GET", f"{object_uri('program', self.program)}/source/main?version={version}", headers={"Accept": "text/plain"}, ok=(200, 404))
        except Exception as e:  # noqa: BLE001
            return f"? {str(e)[:80]}"
        return None if r.status_code == 404 else (f"*I:{nonce}" in r.text)

    def call(self, task: str, args: dict | None = None) -> dict:
        from .adt import object_uri, unit_xml, AdtError
        import uuid
        payload = json.dumps({"task": task, "args": args or {}}, ensure_ascii=False)
        nonce = uuid.uuid4().hex[:10]
        self.trace = []
        try:
            self._write(request_source(payload, nonce))
            self.trace.append(f"saved has id: {self._has(nonce)}")
            r = self.adt._req("POST", "/sap/bc/adt/abapunit/testruns", data=unit_xml([object_uri("class", self.runner)]),
                              headers={"Content-Type": "application/*", "Accept": "application/*"})
        except AdtError as e:
            raise SapxError(f"{e} {e.body[:300]} [{'; '.join(self.trace)}]")
        try:
            j = parse_runner_result(r.text, nonce=nonce)
        except SapxError as e:
            raise SapxError(f"{e} [{'; '.join(self.trace)}]")
        if not j.get("ok"):
            raise SapxError(j.get("error", "unknown handler error"))
        return j.get("result", {})

    def node_alive(self) -> bool:
        """True when the bootstrap installed both the runner class and the request program."""
        try:
            return self.adt.package_of("class", self.runner) is not None and self.adt.package_of("program", self.program) is not None
        except Exception:
            return False


def make_sapx(cfg, user: str = "", password: str = "", client: str = "", adt=None):
    """The task-handler client for this config: ADT runner (default, no SICF) or the ICF node (SAP_HANDLER_MODE=http)."""
    user, password, client = user or cfg.user, password or cfg.password, client or cfg.client
    if getattr(cfg, "handler_mode", "adt") == "http":
        return SapxClient(cfg.host, client, user, password, cfg.handler_path, cfg.verify_ssl)
    if adt is None:
        from .adt import AdtClient
        adt = AdtClient(cfg.host, client, user, password, cfg.verify_ssl)
    return AdtRunnerClient(adt)
