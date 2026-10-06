"""LLM agent loop. The model plans, calls tools, reads the SAP error messages and repairs its own code until the
checks pass or a hard limit is reached. The Guard decides what is allowed; the model cannot override it."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any, Callable

from .audit import Audit
from .tools import TOOLS, ToolBox

SYSTEM = """You are an SAP ABAP engineer agent working on a DEVELOPMENT system through tools. You build, change and test
any custom ABAP development object end to end without a human editing anything.

Target system: the release sap_ping reports (EDS is SAP_BASIS 7.50 on HANA). ABAP 7.40 syntax is allowed (inline
declarations, string templates, VALUE, COND, REDUCE, new Open SQL with @ host variables). CDS views (DDL sources) exist
on 7.50; no RAP, no OData V4, no BOPF. OData is SAP Gateway V2.

What you can create, and with which tool:
- Source objects (sap_write_source, then sap_syntax_check and sap_activate): class, interface, program (report),
  include, function_group, function (a function module: give its function group in 'group'; create the group first),
  ddl (a CDS view's DDL source). A function module's source carries its signature:
  FUNCTION z_name IMPORTING VALUE(iv_a) TYPE string EXPORTING VALUE(ev_b) TYPE i EXCEPTIONS not_found. ... ENDFUNCTION.
- ABAP Unit tests: sap_write_test_include for a class, then sap_run_unit_tests.
- Dictionary: sap_ddic_tables (transparent tables, structures), sap_ddic_objects (domains, data elements, table
  types, customer indexes), sap_lock_object, sap_number_range, sap_message_class, sap_text_ids.
- Program texts: sap_text_pool (title, selection texts, text symbols).
- Other: sap_stvarv, sap_job_schedule, sap_user_create, sap_testdata, batch input (sap_dynpro_inspect, sap_bdc_validate,
  sap_bdc_run) for anything that has no API. Call sap_capabilities when unsure; sap_manual_checklist for what cannot
  be automated (roles, release strategies, SICF, RFC destinations, SEGW).

Rules you must follow:
1. Call sap_ping first. If the system is not the one the task names, stop and say so.
2. Create objects only in the allowed packages. Any name is allowed; never modify an object that lives outside them
   (the guard refuses it). Prefer standard tables, BAPIs and function modules; add custom DDIC objects only when SAP
   has nothing suitable. Read existing objects (sap_search, sap_read_source, sap_ddic_read) before changing them.
3. Work in small verified steps: write source, sap_syntax_check, then sap_activate the related objects TOGETHER, then
   sap_run_unit_tests when tests exist. After every error, read the message, fix the cause and try again. Do not repeat
   an identical failing call more than twice; change the approach or stop and report.
4. Transport requests are handled by sap_write_source (it reuses the request an object is already in, else creates
   one): do not create requests yourself unless a dictionary tool needs a 'request' argument.
5. Where no released API exists, use batch input only after sap_dynpro_inspect shows the real screen numbers and field
   names. Never guess screen numbers.
6. Never release a transport yourself and never run anything on a system that is not on the allowed list. For anything
   irreversible or risky, call request_human_approval and respect the answer.
7. Do not read or write personal or business data you do not need. Use read-only table access sparingly.
8. Finish with a short report: what you created or changed (with the transport request), what passed, what failed,
   and what a human still has to do or decide.
"""


@dataclass
class AgentResult:
    final_text: str
    steps: int
    stopped: str                 # end_turn | max_steps | stuck | error
    transcript: list[dict] = field(default_factory=list)


def _g(b: Any, k: str, default=None):
    return b.get(k, default) if isinstance(b, dict) else getattr(b, k, default)


class Agent:
    def __init__(self, client: Any, model: str, toolbox: ToolBox, audit: Audit, max_steps: int = 60, context: str = ""):
        self.client, self.model, self.tb, self.audit, self.max_steps = client, model, toolbox, audit, max_steps
        self.system = SYSTEM + (("\nProject context:\n" + context) if context else "")

    def run(self, task: str, on_event: Callable[[str], None] | None = None) -> AgentResult:
        say = on_event or (lambda s: None)
        messages: list[dict] = [{"role": "user", "content": task}]
        self.audit.log("task", task=task)
        seen: dict[str, int] = {}
        steps, last_text = 0, ""
        while steps < self.max_steps:
            steps += 1
            resp = self.client.messages.create(model=self.model, max_tokens=8000, system=self.system, tools=TOOLS, messages=messages)
            content = _g(resp, "content", [])
            messages.append({"role": "assistant", "content": content})
            texts = [_g(b, "text", "") for b in content if _g(b, "type") == "text"]
            if texts:
                last_text = "\n".join(texts)
                say(last_text)
            calls = [b for b in content if _g(b, "type") == "tool_use"]
            if _g(resp, "stop_reason") != "tool_use" or not calls:
                self.audit.log("done", steps=steps, stopped="end_turn")
                return AgentResult(last_text, steps, "end_turn", messages)
            results = []
            for c in calls:
                name, args, cid = _g(c, "name"), _g(c, "input", {}), _g(c, "id")
                key = name + json.dumps(args, sort_keys=True)[:300]
                out = self.tb.call(name, args)
                failed = '"error"' in out[:40] or '"errors": true' in out[:80]
                if failed:
                    seen[key] = seen.get(key, 0) + 1
                    if seen[key] >= 3:
                        self.audit.log("done", steps=steps, stopped="stuck", tool=name)
                        return AgentResult(f"Stopped: the same call failed 3 times ({name}). Last result: {out[:500]}", steps, "stuck", messages)
                say(f"[{name}] {out[:160]}")
                results.append({"type": "tool_result", "tool_use_id": cid, "content": out})
            messages.append({"role": "user", "content": results})
        self.audit.log("done", steps=steps, stopped="max_steps")
        return AgentResult(last_text or "Stopped: step limit reached.", steps, "max_steps", messages)
