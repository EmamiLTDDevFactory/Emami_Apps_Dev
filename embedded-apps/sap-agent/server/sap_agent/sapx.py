"""Client for the SAP-side task handler (ZCL_SRC_AGENT_TASKS).
Anything ADT cannot do on ECC (DDIC tables, lock objects, number ranges, text IDs, batch input, running reports) goes here.

Two ways to reach it:
  - SapxClient: HTTP POST to the ICF node (ZCL_SRC_AGENT_HTTP at /sap/zsrc_agent/tasks) - needs SICF;
  - AdtRunnerClient: through ADT only (no SICF) - each request is written into ZCL_SRC_AGENT_RUN, a global
    test class, which is run with ABAP Unit; the answer comes back as numbered test messages.
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
_CHUNK = 100


def _abap_literal(text: str, width: int = 100) -> str:
    """A string expression for any text: backquote literals of <= width chars (doubled backquotes) joined with &&."""
    parts = [text[i:i + width] for i in range(0, len(text), width)] or [""]
    return "\n        && ".join("`" + p.replace("`", "``") + "`" for p in parts)


def runner_test_source(payload: str, size: int = _CHUNK, nonce: str = "boot") -> str:
    """The whole source of ZCL_SRC_AGENT_RUN for one request: a global test class (no local test include, which 7.50
    only runs when the class is flagged for it) whose test method calls the handler and returns the answer as messages."""
    return (
        "CLASS zcl_src_agent_run DEFINITION PUBLIC FINAL CREATE PUBLIC FOR TESTING DURATION LONG RISK LEVEL HARMLESS.\n"
        "  PRIVATE SECTION.\n"
        "    \" Rewritten by the SAP agent for every handler call (no SICF node needed): the test method calls\n"
        "    \" ZCL_SRC_AGENT_TASKS=>HANDLE and returns its answer base64 in numbered test messages.\n"
        "    METHODS go FOR TESTING.\n"
        "ENDCLASS.\n\n"
        "CLASS zcl_src_agent_run IMPLEMENTATION.\n"
        "  METHOD go.\n"
        f"    DATA(lv_json) = {_abap_literal(payload)}.\n"
        "    DATA(lv_out) = cl_http_utility=>encode_base64( zcl_src_agent_tasks=>handle( lv_json ) ).\n"
        "    COMMIT WORK.\n"
        "    DATA(lv_len) = strlen( lv_out ).\n"
        f"    DATA(lv_count) = ( lv_len + {size - 1} ) DIV {size}.\n"
        "    DATA(lv_off) = 0.\n"
        "    DATA(lv_no) = 0.\n"
        "    WHILE lv_off < lv_len.\n"
        f"      DATA(lv_n) = nmin( val1 = {size} val2 = lv_len - lv_off ).\n"
        "      lv_no = lv_no + 1.\n"
        f"      DATA(lv_msg) = |ZSRC {nonce} {{ lv_no }} {{ lv_count }} {{ substring( val = lv_out off = lv_off len = lv_n ) }}|.\n"
        "      cl_abap_unit_assert=>fail( msg = lv_msg quit = if_aunit_constants=>no ).\n"
        "      lv_off = lv_off + lv_n.\n"
        "    ENDWHILE.\n"
        "  ENDMETHOD.\n"
        "ENDCLASS.\n")


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
            stale.add(m.group(1) or "-")       # an older version of the class ran: this is not our request's answer
        elif m:
            chunks[int(m.group(2))], total = m.group(4), int(m.group(3))
        elif title and "is not abstract" not in title:   # 7.50 warns about every non-abstract global test class
            other.append(title)
    if not chunks and stale:
        raise SapxError(f"SAP ran an older version of the runner (request {', '.join(sorted(stale))}, not {nonce}): the rewritten class was not activated")
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
    """Task handler over ADT (no ICF node): write the request into ZCL_SRC_AGENT_RUN (a global test class), activate, run ABAP Unit."""

    def __init__(self, adt, runner: str = RUNNER_CLASS):
        self.adt, self.runner = adt, runner.upper()
        self.path = f"ADT / ABAP Unit of {self.runner}"
        self.trace: list[str] = []
        self._include_cleared = False

    def _write(self, source: str):
        from .adt import object_uri, parse_lock_handle
        uri = object_uri("class", self.runner)
        r = self.adt._req("POST", uri + "?_action=LOCK&accessMode=MODIFY",
                          headers={"Accept": "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result"})
        handle = parse_lock_handle(r.text)
        m = re.search(r"<CORRNR>([^<]*)</CORRNR>", r.text)
        corr = f"&corrNr={m.group(1)}" if m and m.group(1) else ""
        try:
            if not self._include_cleared:
                # an earlier version used the local test include; empty it so it cannot break the class pool
                if self.adt._req("GET", f"{uri}/includes/testclasses", headers={"Accept": "text/plain"}, ok=(200, 404)).status_code == 200:
                    r = self.adt._req("PUT", f"{uri}/includes/testclasses?lockHandle={handle}{corr}", data='" not used - see the class definition\n',
                                      headers={"Content-Type": "text/plain; charset=utf-8", "Accept": "text/plain"}, ok=(200, 204, 400, 404, 500))
                    self.trace.append(f"old include emptied {r.status_code}")
                self._include_cleared = True
            r = self.adt._req("PUT", f"{uri}/source/main?lockHandle={handle}{corr}", data=source,
                              headers={"Content-Type": "text/plain; charset=utf-8", "Accept": "text/plain"})
            self.trace.append(f"write {r.status_code} corr={corr[8:] or '-'}")
        finally:
            self.adt.unlock("class", self.runner, handle)

    def call(self, task: str, args: dict | None = None) -> dict:
        from .adt import object_uri, unit_xml, has_errors, AdtError
        import uuid
        payload = json.dumps({"task": task, "args": args or {}}, ensure_ascii=False)
        nonce = uuid.uuid4().hex[:10]
        try:
            self.trace = []
            self._write(runner_test_source(payload, nonce=nonce))
            msgs = self._activate()
            if has_errors(msgs):
                raise SapxError("handler request did not activate: " + "; ".join(m.get("text", "") for m in msgs if m.get("type", "").upper() in ("E", "A", "X"))[:500])
            r = self.adt._req("POST", "/sap/bc/adt/abapunit/testruns", data=unit_xml([object_uri("class", self.runner)]),
                              headers={"Content-Type": "application/*", "Accept": "application/*"})
        except AdtError as e:
            raise SapxError(f"{e} {e.body[:300]}")
        try:
            j = parse_runner_result(r.text, nonce=nonce)
        except SapxError as e:
            raise SapxError(f"{e} [{'; '.join(self.trace)}]")
        if not j.get("ok"):
            raise SapxError(j.get("error", "unknown handler error"))
        return j.get("result", {})

    def _activate(self) -> list[dict]:
        """Activates the rewritten class. No pre-audit: with it 7.50 can answer 200 with a list of inactive objects and activate nothing."""
        from .adt import object_uri, object_refs_xml, parse_messages
        uri = object_uri("class", self.runner)
        refs = [(uri, self.runner)]
        r = self.adt._req("POST", "/sap/bc/adt/activation?method=activate&preauditRequested=false", data=object_refs_xml(refs),
                          headers={"Content-Type": "application/xml", "Accept": "application/xml"})
        msgs = parse_messages(r.text)
        self.trace.append(f"activate {r.status_code}" + "".join(f" | {m.get('type')}: {(m.get('text') or '')[:160]}" for m in msgs[:3])
                          + (f" body={r.text[:400]}" if r.text.strip() and not msgs else ""))
        return msgs

    def node_alive(self) -> bool:
        """True when the runner class exists (the bootstrap installed it)."""
        try:
            return self.adt.package_of("class", self.runner) is not None
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
