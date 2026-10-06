"""ABAP Development Tools (ADT) REST client. ADT is what Eclipse uses; it creates, edits, checks and activates
repository objects and manages transports. Endpoints and media types follow the ADT discovery document, which is
read once, so release differences are handled by the system itself where possible.
"""
from __future__ import annotations
import re
import xml.etree.ElementTree as ET
from typing import Optional
from xml.sax.saxutils import escape, quoteattr

NS = {
    "adtcore": "http://www.sap.com/adt/core",
    "atom": "http://www.w3.org/2005/Atom",
    "app": "http://www.w3.org/2007/app",
    "chkrun": "http://www.sap.com/adt/checkrun",
    "tm": "http://www.sap.com/cts/adt/tm",
    "aunit": "http://www.sap.com/adt/aunit",
    "asx": "http://www.sap.com/abapxml",
    "chkl": "http://www.sap.com/abapxml/checklist",
}

KIND_URI = {
    "class": "/sap/bc/adt/oo/classes",
    "interface": "/sap/bc/adt/oo/interfaces",
    "program": "/sap/bc/adt/programs/programs",
    "package": "/sap/bc/adt/packages",
}
KIND_TYPE = {"class": "CLAS/OC", "interface": "INTF/OI", "program": "PROG/P", "package": "DEVC/K"}

DEFAULT_CTYPE = {
    "class": "application/vnd.sap.adt.oo.classes.v2+xml",
    "interface": "application/vnd.sap.adt.oo.interfaces.v2+xml",
    "program": "application/vnd.sap.adt.programs.programs.v2+xml",
    "package": "application/vnd.sap.adt.packages.v1+xml",
}


class AdtError(Exception):
    def __init__(self, msg: str, status: int | None = None, body: str = ""):
        super().__init__(msg)
        self.status, self.body = status, body


def object_uri(kind: str, name: str) -> str:
    return f"{KIND_URI[kind]}/{name.lower().replace('/', '%2f')}"


# ------------------------------------------------------------------------------------------ XML builders
def create_xml(kind: str, name: str, description: str, package: str, user: str, extra: Optional[dict] = None) -> str:
    n, d, p, u = quoteattr(name.upper()), quoteattr(description[:60]), quoteattr(package.upper()), quoteattr(user.upper())
    head = f'<?xml version="1.0" encoding="UTF-8"?>\n'
    common = f'adtcore:description={d} adtcore:language="EN" adtcore:name={n} adtcore:type="{KIND_TYPE[kind]}" adtcore:masterLanguage="EN" adtcore:responsible={u}'
    pkgref = f'<adtcore:packageRef adtcore:name={p}/>'
    if kind == "class":
        return head + (f'<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="{NS["adtcore"]}" {common} '
                       f'class:final="true" class:visibility="public">{pkgref}</class:abapClass>')
    if kind == "interface":
        return head + (f'<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="{NS["adtcore"]}" {common}>{pkgref}</intf:abapInterface>')
    if kind == "program":
        return head + (f'<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="{NS["adtcore"]}" {common} '
                       f'program:programType="executableProgram">{pkgref}</program:abapProgram>')
    if kind == "package":
        e = extra or {}
        sc, tl = quoteattr(e.get("software_component", "HOME")), quoteattr(e.get("transport_layer", ""))
        sup = quoteattr(e.get("super_package", ""))
        return head + (f'<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="{NS["adtcore"]}" '
                       f'adtcore:description={d} adtcore:language="EN" adtcore:name={n} adtcore:type="DEVC/K" adtcore:masterLanguage="EN" adtcore:responsible={u}>'
                       f'<pak:attributes pak:packageType="development"/><pak:superPackage adtcore:name={sup}/>'
                       f'<pak:transport><pak:softwareComponent pak:name={sc}/><pak:transportLayer pak:name={tl}/></pak:transport></pak:package>')
    raise AdtError(f"unsupported kind {kind}")


def object_refs_xml(uris_names: list[tuple[str, str]]) -> str:
    refs = "".join(f'<adtcore:objectReference adtcore:uri={quoteattr(u)} adtcore:name={quoteattr(n.upper())}/>' for u, n in uris_names)
    return f'<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="{NS["adtcore"]}">{refs}</adtcore:objectReferences>'


def checkrun_xml(uris: list[str], version: str = "inactive") -> str:
    objs = "".join(f'<chkrun:checkObject adtcore:uri={quoteattr(u)} chkrun:version="{version}"/>' for u in uris)
    return (f'<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="{NS["chkrun"]}" xmlns:adtcore="{NS["adtcore"]}">{objs}</chkrun:checkObjectList>')


def transport_xml(description: str, user: str, target: str = "") -> str:
    return (f'<?xml version="1.0" encoding="UTF-8"?><tm:root xmlns:tm="{NS["tm"]}" tm:useraction="newrequest">'
            f'<tm:request tm:desc={quoteattr(description[:60])} tm:type="K" tm:target={quoteattr(target)} tm:cts_project="">'
            f'<tm:task tm:owner={quoteattr(user.upper())}/></tm:request></tm:root>')


def legacy_transport_xml(description: str, package: str) -> str:
    """Body for POST /sap/bc/adt/cts/transports (pre-7.51 releases); the response is text/plain ending in the request number."""
    from xml.sax.saxutils import escape
    pkg = package.upper()
    return ('<?xml version="1.0" encoding="ASCII"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>'
            f'<OPERATION>I</OPERATION><DEVCLASS>{escape(pkg)}</DEVCLASS><REQUEST_TEXT>{escape(description[:60])}</REQUEST_TEXT>'
            f'<REF>/sap/bc/adt/packages/{escape(pkg.lower())}</REF></DATA></asx:values></asx:abap>')


def unit_xml(uris: list[str]) -> str:
    refs = "".join(f'<adtcore:objectReference adtcore:uri={quoteattr(u)}/>' for u in uris)
    return ('<?xml version="1.0" encoding="UTF-8"?><aunit:runConfiguration xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">'
            '<external><coverage active="false"/></external><options><uriType value="semantic"/>'
            '<testDeterminationStrategy sameProgram="true" assignedTests="false" appendAssignedTestsPreview="true"/>'
            '<testRiskLevels harmless="true" dangerous="true" critical="true"/><testDurations short="true" medium="true" long="true"/></options>'
            f'<adtcore:objectSets><objectSet kind="inclusive"><adtcore:objectReferences>{refs}</adtcore:objectReferences></objectSet></adtcore:objectSets></aunit:runConfiguration>')


# ------------------------------------------------------------------------------------------ parsers
def parse_lock_handle(body: str) -> str:
    m = re.search(r"<LOCK_HANDLE>([^<]+)</LOCK_HANDLE>", body)
    if not m:
        raise AdtError("no lock handle in response", body=body[:500])
    return m.group(1)


def parse_messages(body: str) -> list[dict]:
    """Messages from activation and check runs (both formats)."""
    out: list[dict] = []
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return [{"type": "E", "text": body[:300]}] if body.strip() else []
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag == "msg":      # activation: <msg objDescr=.. type="E" line=".." ...><shortText><txt>..</txt></shortText></msg>
            txt = "".join(t.text or "" for t in el.iter() if t.tag.split("}")[-1] == "txt")
            out.append({"type": el.get("type", "E"), "line": el.get("line"), "object": el.get("objDescr"), "text": txt})
        elif tag == "checkMessage":   # checkruns
            out.append({"type": el.get("{%s}type" % NS["chkrun"]) or el.get("type", "E"), "uri": el.get("{%s}uri" % NS["chkrun"]) or el.get("uri"),
                        "text": el.get("{%s}shortText" % NS["chkrun"]) or el.get("shortText", "")})
    return out


def has_errors(msgs: list[dict]) -> bool:
    return any(m.get("type", "").upper() in ("E", "A", "X") for m in msgs)


def parse_search(body: str) -> list[dict]:
    out = []
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return out
    for el in root.iter():
        if el.tag.endswith("objectReference"):
            out.append({"name": el.get("{%s}name" % NS["adtcore"]), "type": el.get("{%s}type" % NS["adtcore"]),
                        "uri": el.get("{%s}uri" % NS["adtcore"]), "package": el.get("{%s}packageName" % NS["adtcore"])})
    return out


def parse_unit(body: str) -> dict:
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return {"ok": False, "raw": body[:300], "failures": []}
    fails, total = [], 0
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag == "testMethod":
            total += 1
        if tag == "alert" and el.get("kind") in ("failedAssertion", "exception", "warning"):
            title = "".join(t.text or "" for t in el.iter() if t.tag.split("}")[-1] == "title")
            fails.append({"kind": el.get("kind"), "severity": el.get("severity"), "title": title})
    return {"ok": not any(f["kind"] != "warning" for f in fails), "tests": total, "failures": fails}


def parse_request_number(body: str) -> str:
    m = re.search(r'tm:number="([A-Z0-9]{3}K\d{6})"', body) or re.search(r"/([A-Z0-9]{3}K\d{6})", body)
    if not m:
        raise AdtError("no transport number in response", body=body[:500])
    return m.group(1)


def parse_package(body: str) -> Optional[str]:
    """Package an object lives in, from its ADT metadata."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return None
    for el in root.iter():
        if el.tag.endswith("packageRef"):
            return el.get("{%s}name" % NS["adtcore"])
    return None


def parse_discovery(body: str) -> dict[str, list[str]]:
    """collection href -> accepted media types"""
    out: dict[str, list[str]] = {}
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return out
    for coll in root.iter("{%s}collection" % NS["app"]):
        href = coll.get("href", "")
        out[href] = [a.text for a in coll.findall("app:accept", NS) if a.text]
    return out


# ------------------------------------------------------------------------------------------ client
class AdtClient:
    def __init__(self, base: str, client: str, user: str, password: str, verify: bool = True, session=None):
        import requests
        self.base, self.sap_client, self.user = base.rstrip("/"), client, user
        self.s = session or requests.Session()
        if session is None:
            self.s.auth = (user, password)
            self.s.verify = verify
        self.s.headers.update({"X-sap-adt-sessiontype": "stateful", "Accept-Language": "en"})
        self._csrf: str = ""
        self._disc: dict[str, list[str]] = {}

    # --- plumbing ---
    def _url(self, path: str) -> str:
        sep = "&" if "?" in path else "?"
        return f"{self.base}{path}{sep}sap-client={self.sap_client}"

    def _req(self, method: str, path: str, *, data=None, headers=None, ok=(200, 201, 204), retry=True):
        h = {"x-csrf-token": self._csrf or "fetch"}
        h.update(headers or {})
        r = self.s.request(method, self._url(path), data=data.encode("utf-8") if isinstance(data, str) else data, headers=h)
        tok = r.headers.get("x-csrf-token")
        if tok and tok.lower() != "required":
            self._csrf = tok
        if r.status_code == 403 and retry and "csrf" in (r.headers.get("x-csrf-token", "") + r.text).lower():
            self._fetch_csrf()
            return self._req(method, path, data=data, headers=headers, ok=ok, retry=False)
        if r.status_code not in ok:
            raise AdtError(f"{method} {path} -> {r.status_code}", r.status_code, r.text[:1500])
        return r

    def _fetch_csrf(self):
        self._req("GET", "/sap/bc/adt/discovery", headers={"x-csrf-token": "fetch", "Accept": "application/atomsvc+xml"})

    def discovery(self) -> dict[str, list[str]]:
        if not self._disc:
            r = self._req("GET", "/sap/bc/adt/discovery", headers={"x-csrf-token": "fetch", "Accept": "application/atomsvc+xml"})
            self._disc = parse_discovery(r.text)
        return self._disc

    def ctype(self, kind: str) -> str:
        """Media type the system accepts for creating this kind (from discovery), with a safe default."""
        accepts = self.discovery().get(KIND_URI[kind], [])
        preferred = [a for a in accepts if a.endswith("+xml") and "vnd.sap.adt" in a]
        return (preferred or [DEFAULT_CTYPE[kind]])[-1]

    # --- repository ---
    def search(self, query: str, max_results: int = 50) -> list[dict]:
        r = self._req("GET", f"/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query={query}&maxResults={max_results}",
                      headers={"Accept": "application/xml"})
        return parse_search(r.text)

    def exists(self, kind: str, name: str) -> bool:
        try:
            self._req("GET", object_uri(kind, name), headers={"Accept": "application/xml"})
            return True
        except AdtError as e:
            if e.status == 404:
                return False
            raise

    def package_of(self, kind: str, name: str) -> Optional[str]:
        """Package of an existing object, or None when it does not exist. This is the ownership check that replaces name prefixes."""
        try:
            r = self._req("GET", object_uri(kind, name), headers={"Accept": "application/xml"})
        except AdtError as e:
            if e.status == 404:
                return None
            raise
        return parse_package(r.text) or "(unknown)"

    def package_exists(self, name: str) -> bool:
        """Older releases (e.g. 7.50) have no ADT package resource, so a 404 there proves nothing: fall back to the repository search."""
        if self.package_of("package", name) is not None:
            return True
        try:
            hits = self.search(f"{name.upper()}&objectType=DEVC/K", 10)
        except AdtError:
            return False
        return any((h.get("name") or "").upper() == name.upper() and (h.get("type") or "").startswith("DEVC") for h in hits)

    def read_source(self, kind: str, name: str) -> str:
        return self._req("GET", object_uri(kind, name) + "/source/main", headers={"Accept": "text/plain"}).text

    def create(self, kind: str, name: str, description: str, package: str, transport: str = "", extra: Optional[dict] = None):
        q = f"?corrNr={transport}" if transport else ""
        body = create_xml(kind, name, description, package, self.user, extra)
        self._req("POST", KIND_URI[kind] + q, data=body, headers={"Content-Type": self.ctype(kind), "Accept": "*/*"})

    def lock(self, kind: str, name: str) -> str:
        r = self._req("POST", object_uri(kind, name) + "?_action=LOCK&accessMode=MODIFY",
                      headers={"Accept": "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result"})
        return parse_lock_handle(r.text)

    def unlock(self, kind: str, name: str, handle: str):
        self._req("POST", object_uri(kind, name) + f"?_action=UNLOCK&lockHandle={handle}", ok=(200, 204))

    def write_source(self, kind: str, name: str, source: str, transport: str = ""):
        h = self.lock(kind, name)
        try:
            q = f"?lockHandle={h}" + (f"&corrNr={transport}" if transport else "")
            self._req("PUT", object_uri(kind, name) + "/source/main" + q, data=source,
                      headers={"Content-Type": "text/plain; charset=utf-8", "Accept": "text/plain"})
        finally:
            self.unlock(kind, name, h)

    def create_test_include(self, class_name: str, transport: str = ""):
        """Local test class include ('testclasses') of a global class, for ABAP Unit."""
        lock = self.lock("class", class_name)
        try:
            q = f"?lockHandle={lock}" + (f"&corrNr={transport}" if transport else "")
            body = ('<?xml version="1.0" encoding="UTF-8"?><class:abapClassInclude xmlns:class="http://www.sap.com/adt/oo/classes" '
                    f'xmlns:adtcore="{NS["adtcore"]}" adtcore:name="{class_name.upper()}" class:includeType="testclasses"/>')
            self._req("POST", object_uri("class", class_name) + "/includes" + q, data=body,
                      headers={"Content-Type": "application/vnd.sap.adt.oo.classes.include.v1+xml", "Accept": "*/*"}, ok=(200, 201, 204, 409))
        finally:
            self.unlock("class", class_name, lock)

    def write_test_include(self, class_name: str, source: str, transport: str = ""):
        self.create_test_include(class_name, transport)
        lock = self.lock("class", class_name)
        try:
            q = f"?lockHandle={lock}" + (f"&corrNr={transport}" if transport else "")
            self._req("PUT", object_uri("class", class_name) + "/includes/testclasses" + q, data=source,
                      headers={"Content-Type": "text/plain; charset=utf-8", "Accept": "text/plain"})
        finally:
            self.unlock("class", class_name, lock)

    # --- checks ---
    def syntax_check(self, kind: str, name: str) -> list[dict]:
        uri = object_uri(kind, name)
        r = self._req("POST", "/sap/bc/adt/checkruns?reporters=abapCheckRun", data=checkrun_xml([uri]),
                      headers={"Content-Type": "application/vnd.sap.adt.checkobjects+xml", "Accept": "application/vnd.sap.adt.checkmessages+xml"})
        return parse_messages(r.text)

    def activate(self, objects: list[tuple[str, str]]) -> list[dict]:
        """Mass activation: dependencies between the listed objects are resolved by SAP."""
        refs = [(object_uri(k, n), n) for k, n in objects]
        r = self._req("POST", "/sap/bc/adt/activation?method=activate&preauditRequested=true", data=object_refs_xml(refs),
                      headers={"Content-Type": "application/xml", "Accept": "application/xml"})
        return parse_messages(r.text)

    def run_unit_tests(self, objects: list[tuple[str, str]]) -> dict:
        r = self._req("POST", "/sap/bc/adt/abapunit/testruns", data=unit_xml([object_uri(k, n) for k, n in objects]),
                      headers={"Content-Type": "application/vnd.sap.adt.abapunit.testruns.config.v4+xml", "Accept": "application/vnd.sap.adt.abapunit.testruns.result.v1+xml"})
        return parse_unit(r.text)

    # --- transports ---
    def create_transport(self, description: str, target: str = "", package: str = "") -> str:
        try:
            r = self._req("POST", "/sap/bc/adt/cts/transportrequests", data=transport_xml(description, self.user, target),
                          headers={"Content-Type": "application/vnd.sap.adt.transportorganizer.v1+xml", "Accept": "application/vnd.sap.adt.transportorganizer.v1+xml"})
            return parse_request_number(r.text)
        except AdtError as e:
            # 7.50 answers 400 "user action is not supported" (no tm:useraction); its Eclipse uses the older CTS resource.
            if e.status not in (400, 404, 405, 415) or not package:
                raise
        r = self._req("POST", "/sap/bc/adt/cts/transports", data=legacy_transport_xml(description, package),
                      headers={"Content-Type": "application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.CreateCorrectionRequest", "Accept": "text/plain"})
        return parse_request_number(r.text)

    def release_transport(self, request: str):
        self._req("POST", f"/sap/bc/adt/cts/transportrequests/{request}/newreleasejobs", headers={"Accept": "application/vnd.sap.adt.transportorganizer.v1+xml"})

    # --- gateway test ---
    def odata_get(self, path: str) -> tuple[int, str]:
        r = self.s.request("GET", self._url(path), headers={"Accept": "application/json"})
        return r.status_code, r.text[:6000]
