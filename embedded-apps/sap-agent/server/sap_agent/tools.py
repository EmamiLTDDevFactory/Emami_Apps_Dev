"""Tools the agent can call. Each one goes through the Guard, is written to the audit log, and returns JSON text."""
from __future__ import annotations
import json
import traceback
from typing import Any, Callable

from .adt import AdtClient, AdtError, has_errors
from .capabilities import REGISTRY
from .checklists import checklist
from .audit import Audit
from .guard import Guard, PolicyError
from .sapx import SapxClient, SapxError

KIND = {"type": "string", "enum": ["class", "interface", "program", "package"]}

TOOLS: list[dict] = [
    {"name": "sap_ping", "description": "System id, client, release and the user the agent runs as. Call first.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "sap_search", "description": "Search repository objects by name pattern, for example ZCL_SRC*.", "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
    {"name": "sap_read_source", "description": "Read the source of a class, interface or program.", "input_schema": {"type": "object", "properties": {"kind": KIND, "name": {"type": "string"}}, "required": ["kind", "name"]}},
    {"name": "sap_write_source", "description": "Create the object if missing, then replace its full source. Does not activate. The transport request is handled for you: an object already in a request is saved there, otherwise the given one is used, otherwise one is created - so do not call sap_transport_create first; the result says which request was used. Any name is allowed, but an existing object outside the allowed packages is never changed.",
     "input_schema": {"type": "object", "properties": {"kind": KIND, "name": {"type": "string"}, "source": {"type": "string"}, "package": {"type": "string"},
                                                      "description": {"type": "string"}, "transport": {"type": "string"}}, "required": ["kind", "name", "source", "package"]}},
    {"name": "sap_syntax_check", "description": "Syntax check the inactive version of an object. Returns messages with line numbers.", "input_schema": {"type": "object", "properties": {"kind": KIND, "name": {"type": "string"}}, "required": ["kind", "name"]}},
    {"name": "sap_activate", "description": "Mass-activate objects together so mutual dependencies resolve. Returns messages; errors mean not active.",
     "input_schema": {"type": "object", "properties": {"objects": {"type": "array", "items": {"type": "object", "properties": {"kind": KIND, "name": {"type": "string"}}, "required": ["kind", "name"]}}}, "required": ["objects"]}},
    {"name": "sap_run_unit_tests", "description": "Run ABAP Unit tests of the given classes or programs.", "input_schema": {"type": "object", "properties": {"objects": {"type": "array", "items": {"type": "object", "properties": {"kind": KIND, "name": {"type": "string"}}, "required": ["kind", "name"]}}}, "required": ["objects"]}},
    {"name": "sap_transport_create", "description": "Create a workbench transport request and return its number.", "input_schema": {"type": "object", "properties": {"description": {"type": "string"}, "package": {"type": "string", "description": "package the request is for (default: the first allowed package)"}}, "required": ["description"]}},
    {"name": "sap_ddic_tables", "description": "Create and activate transparent tables or structures from a field list. Field: {n: name, t: CHAR|DEC|INT4|INT2|DATS|STRG|R:<data element>, l: length, d: decimals, k: 'X' for key}.",
     "input_schema": {"type": "object", "properties": {"package": {"type": "string"}, "request": {"type": "string"}, "tables": {"type": "array", "items": {"type": "object", "properties": {
         "name": {"type": "string"}, "text": {"type": "string"}, "kind": {"type": "string", "enum": ["TRANSP", "INTTAB"]}, "fields": {"type": "array", "items": {"type": "object"}}}, "required": ["name", "kind", "fields"]}}}, "required": ["package", "tables"]}},
    {"name": "sap_ddic_read", "description": "Read a table or structure definition.", "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "sap_lock_object", "description": "Create an enqueue (lock) object on a table with the given key fields.", "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "table": {"type": "string"}, "fields": {"type": "array", "items": {"type": "string"}}, "package": {"type": "string"}, "request": {"type": "string"}}, "required": ["name", "table", "fields", "package"]}},
    {"name": "sap_number_range", "description": "Create a number range object with one internal interval.", "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "length": {"type": "integer"}, "package": {"type": "string"}, "request": {"type": "string"}, "from_no": {"type": "string"}, "to_no": {"type": "string"}}, "required": ["name", "package"]}},
    {"name": "sap_text_ids", "description": "Create text IDs (SE75) for a text object, for example EKKO or EKPO.", "input_schema": {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"object": {"type": "string"}, "id": {"type": "string"}, "text": {"type": "string"}}, "required": ["object", "id"]}}, "request": {"type": "string"}}, "required": ["items"]}},
    {"name": "sap_stvarv", "description": "Set STVARV parameters (table TVARVC, type P).", "input_schema": {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "value": {"type": "string"}}, "required": ["name", "value"]}}}, "required": ["items"]}},
    {"name": "sap_dynpro_inspect", "description": "Read the screen definition of a dynpro (field names, types, positions, flow logic) so a batch input can be built without recording.", "input_schema": {"type": "object", "properties": {"program": {"type": "string"}, "dynpro": {"type": "string"}}, "required": ["program", "dynpro"]}},
    {"name": "sap_bdc_run", "description": "Run a batch input for an allowed transaction. steps: [{program, dynpro, fields: {NAME: value}, okcode}]. Returns the system messages.",
     "input_schema": {"type": "object", "properties": {"tcode": {"type": "string"}, "mode": {"type": "string", "enum": ["N", "E", "A"]}, "steps": {"type": "array", "items": {"type": "object"}}}, "required": ["tcode", "steps"]}},
    {"name": "sap_run_report", "description": "Run a Z report in the foreground and return its list output.", "input_schema": {"type": "object", "properties": {"report": {"type": "string"}, "params": {"type": "object"}}, "required": ["report"]}},
    {"name": "sap_read_table", "description": "Read up to 200 rows of an allowed table with a simple WHERE clause.", "input_schema": {"type": "object", "properties": {"table": {"type": "string"}, "where": {"type": "string"}, "max": {"type": "integer"}}, "required": ["table"]}},
    {"name": "sap_odata_get", "description": "GET an OData path under /sap/opu/odata/ to test a service, for example /sap/opu/odata/sap/ZSRC_SRV/$metadata.", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "sap_capabilities", "description": "What the agent can create and how (automated, assisted by batch input, or manual). Read this before attempting roles, release strategies, SICF nodes, RFC destinations or SEGW.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "sap_ddic_objects", "description": "Create and activate domains (DOMA), data elements (DTEL), table types (TTYP) or customer indexes (INDX) on EKKO or EKPO. item: {kind, name, text, datatype, len, dec, domain, rowtype, table, fields}.",
     "input_schema": {"type": "object", "properties": {"package": {"type": "string"}, "request": {"type": "string"}, "items": {"type": "array", "items": {"type": "object"}}}, "required": ["package", "items"]}},
    {"name": "sap_message_class", "description": "Create message classes with texts. class: {arbgb, text, texts: [{nr, text}]}.", "input_schema": {"type": "object", "properties": {"package": {"type": "string"}, "request": {"type": "string"}, "classes": {"type": "array", "items": {"type": "object"}}}, "required": ["package", "classes"]}},
    {"name": "sap_text_pool", "description": "Set text symbols (id I), selection texts (id S) and title (id R) of a Z program. texts: [{id, key, entry, length}]. Activate the program afterwards.", "input_schema": {"type": "object", "properties": {"program": {"type": "string"}, "texts": {"type": "array", "items": {"type": "object"}}}, "required": ["program", "texts"]}},
    {"name": "sap_write_test_include", "description": "Write the ABAP Unit local test classes of a global class (include testclasses). Activate the class afterwards, then run sap_run_unit_tests.", "input_schema": {"type": "object", "properties": {"class_name": {"type": "string"}, "source": {"type": "string"}, "transport": {"type": "string"}}, "required": ["class_name", "source"]}},
    {"name": "sap_job_schedule", "description": "Schedule a Z report as a periodic background job (every period_min minutes).", "input_schema": {"type": "object", "properties": {"job": {"type": "string"}, "report": {"type": "string"}, "variant": {"type": "string"}, "period_min": {"type": "integer"}}, "required": ["job", "report"]}},
    {"name": "sap_user_create", "description": "Create a SAP user (any name except protected ones like DDIC or SAP*) with roles. Standard roles (SAP_*, S_A.*) are never assigned. Never put a real person's password here; prefer SSO.", "input_schema": {"type": "object", "properties": {"user": {"type": "string"}, "password": {"type": "string"}, "user_type": {"type": "string"}, "first_name": {"type": "string"}, "last_name": {"type": "string"}, "email": {"type": "string"}, "roles": {"type": "array", "items": {"type": "string"}}}, "required": ["user", "roles"]}},
    {"name": "sap_testdata", "description": "Create test data: kind material (any name; refused if the material already exists) or requisition. Existing master data is never changed.", "input_schema": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["material", "requisition"]}, "spec": {"type": "object"}}, "required": ["kind", "spec"]}},
    {"name": "sap_bdc_validate", "description": "Check every field of a batch input against the real screens. Required before sap_bdc_run with the same steps.", "input_schema": {"type": "object", "properties": {"tcode": {"type": "string"}, "steps": {"type": "array", "items": {"type": "object"}}}, "required": ["tcode", "steps"]}},
    {"name": "sap_icf_check", "description": "Is the agent's ICF node alive? (the one step ECC cannot automate)", "input_schema": {"type": "object", "properties": {}}},
    {"name": "sap_manual_checklist", "description": "Produce exact human steps for something that cannot be automated: kind role | release_strategy | icf | rfc | gateway | segw, with the specification.", "input_schema": {"type": "object", "properties": {"kind": {"type": "string"}, "spec": {"type": "object"}}, "required": ["kind", "spec"]}},
    {"name": "sap_release_transport", "description": "Release a transport request. Disabled unless a human enabled it; always needs approval.", "input_schema": {"type": "object", "properties": {"request": {"type": "string"}}, "required": ["request"]}},
    {"name": "request_human_approval", "description": "Ask the human operator to approve a risky or irreversible action. Returns approved true or false.", "input_schema": {"type": "object", "properties": {"action": {"type": "string"}, "detail": {"type": "string"}}, "required": ["action", "detail"]}},
]


class ToolBox:
    def __init__(self, guard: Guard, adt: AdtClient, sapx: SapxClient, audit: Audit, approve: Callable[[str, str], bool] | None = None):
        self.g, self.adt, self.x, self.audit, self._approve = guard, adt, sapx, audit, approve
        self._sid_ok = False

    @staticmethod
    def _norm_steps(a: dict):
        for st in a.get("steps", []):             # accept {NAME: value} or [{n, v}]
            f = st.get("fields", [])
            if isinstance(f, dict):
                st["fields"] = [{"n": k, "v": str(v)} for k, v in f.items()]

    # ------------------------------------------------------------------------------------------
    def call(self, name: str, args: dict) -> str:
        try:
            result = self._dispatch(name, args or {})
            self.audit.log("tool", tool=name, args=args, ok=True)
            return json.dumps(result, ensure_ascii=False)[:12000]
        except PolicyError as e:
            self.audit.log("tool", tool=name, args=args, ok=False, policy=str(e))
            return json.dumps({"error": "policy", "message": str(e)})
        except (AdtError, SapxError) as e:
            body = getattr(e, "body", "")
            self.audit.log("tool", tool=name, args=args, ok=False, error=str(e), body=body[:300])
            return json.dumps({"error": "sap", "message": str(e), "detail": body[:1200]})
        except Exception as e:      # never let a tool crash the loop
            self.audit.log("tool", tool=name, args=args, ok=False, error=repr(e), trace=traceback.format_exc()[-400:])
            return json.dumps({"error": "internal", "message": repr(e)})

    def _check_sid(self):
        if self._sid_ok:
            return
        info = self.x.call("ping")
        self.g.check_system(info.get("sid", ""))
        self._sid_ok = True

    def _dispatch(self, name: str, a: dict) -> Any:
        g, adt, x = self.g, self.adt, self.x
        if name == "request_human_approval":
            ok = bool(self._approve and self._approve(a["action"], a["detail"])) or g.cfg.approval == "auto"
            self.audit.log("approval", action=a["action"], approved=ok)
            return {"approved": ok}
        if name != "sap_ping":
            self._check_sid()
        if name == "sap_ping":
            info = x.call("ping")
            g.check_system(info.get("sid", ""))
            return info
        if name == "sap_search":
            return adt.search(a["query"])
        if name == "sap_read_source":
            g.check_name(a["name"])                       # reading is allowed for any object (also standard code, to learn from it)
            return {"source": adt.read_source(a["kind"], a["name"])}
        if name == "sap_write_source":
            g.check_write(name)
            g.check_source(a["kind"], a["name"], a.get("package"))
            owner = adt.package_of(a["kind"], a["name"])
            g.check_owner(a["name"], owner)                # new, or already in an allowed package; never anything else
            # the request is resolved by the ADT layer: the one the object is already in, else the given one, else a new one
            pkg = (owner or a.get("package") or "").upper()
            tr = a.get("transport", "")
            if owner is None:
                tr = adt.create(a["kind"], a["name"], a.get("description") or a["name"], a["package"], tr, auto_transport=True) or tr
            used = adt.write_source(a["kind"], a["name"], a["source"], tr, package=pkg)
            return {"written": a["name"].upper(), "chars": len(a["source"]), "transport": used or "(local / none needed)"}
        if name == "sap_syntax_check":
            g.check_source(a["kind"], a["name"])
            msgs = adt.syntax_check(a["kind"], a["name"])
            return {"errors": has_errors(msgs), "messages": msgs}
        if name == "sap_activate":
            g.check_write(name)
            objs = [(o["kind"], g.check_name(o["name"])) for o in a["objects"]]
            for k, n in objs:
                owner = adt.package_of(k, n)
                if owner is None:
                    raise PolicyError(f"{n} does not exist")
                g.check_owner(n, owner)
            msgs = adt.activate(objs)
            return {"errors": has_errors(msgs), "messages": msgs}
        if name == "sap_run_unit_tests":
            objs = [(o["kind"], g.check_name(o["name"])) for o in a["objects"]]
            return adt.run_unit_tests(objs)
        if name == "sap_transport_create":
            g.check_write(name)
            pkg = (a.get("package") or (g.cfg.allowed_packages or [""])[0]).upper()
            return {"request": adt.create_transport(a["description"], package=pkg)}
        if name in ("sap_ddic_tables", "sap_lock_object", "sap_number_range", "sap_text_ids", "sap_stvarv"):
            task = {"sap_ddic_tables": "ddic_tables", "sap_lock_object": "lock_object", "sap_number_range": "number_range", "sap_text_ids": "text_ids", "sap_stvarv": "stvarv"}[name]
            g.check_task(task, a)
            return x.call(task, a)
        if name == "sap_ddic_read":
            g.check_name(a["name"])
            return x.call("ddic_read", a)
        if name == "sap_dynpro_inspect":
            return x.call("dynpro_inspect", a)
        if name == "sap_bdc_validate":
            g.check_bdc(a["tcode"])
            self._norm_steps(a)
            res = x.call("bdc_validate", {"steps": a["steps"]})
            if res.get("valid"):
                g.mark_validated(a)
            return res
        if name == "sap_bdc_run":
            g.check_task("bdc_run", a)           # includes: must have been validated
            self._norm_steps(a)
            return x.call("bdc_run", a)
        if name == "sap_capabilities":
            return REGISTRY
        if name == "sap_icf_check":
            return {"alive": x.node_alive()}
        if name == "sap_manual_checklist":
            return {"markdown": checklist(a["kind"], a["spec"])}
        if name == "sap_ddic_objects":
            g.check_task("ddic_objects", a)
            return x.call("ddic_objects", a)
        if name == "sap_message_class":
            g.check_task("message_class", a)
            return x.call("message_class", a)
        if name == "sap_text_pool":
            g.check_task("text_pool", a)
            return x.call("text_pool", a)
        if name == "sap_write_test_include":
            g.check_write(name)
            g.check_name(a["class_name"])
            g.check_owner(a["class_name"], adt.package_of("class", a["class_name"]) or "(missing)")
            adt.write_test_include(a["class_name"], a["source"], a.get("transport", ""))
            return {"written": a["class_name"].upper(), "note": "activate the class, then sap_run_unit_tests"}
        if name == "sap_job_schedule":
            g.check_task("job_schedule", a)
            return x.call("job_schedule", a)
        if name == "sap_user_create":
            g.check_task("user_create", a)
            return x.call("user_create", a)
        if name == "sap_testdata":
            task = "testdata_material" if a["kind"] == "material" else "testdata_requisition"
            g.check_task(task, a["spec"])
            return x.call(task, a["spec"])
        if name == "sap_run_report":
            g.check_task("run_report", a)
            p = a.get("params", {})
            if isinstance(p, dict):
                a["params"] = [{"n": k, "v": str(v)} for k, v in p.items()]
            return x.call("run_report", a)
        if name == "sap_read_table":
            g.check_table_read(a["table"])
            a["max"] = min(int(a.get("max", 50)), 200)
            return x.call("read_table", a)
        if name == "sap_odata_get":
            g.check_odata_path(a["path"])
            status, body = adt.odata_get(a["path"])
            return {"status": status, "body": body}
        if name == "sap_release_transport":
            g.check_release(a["request"])
            adt.release_transport(a["request"])
            return {"released": a["request"]}
        raise PolicyError(f"unknown tool {name}")
