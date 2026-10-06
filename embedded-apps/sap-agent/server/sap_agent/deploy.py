"""Deterministic deployment from a manifest. No LLM is needed for a normal run. If a step fails and a repair callback is
given (the agent), the callback may fix the cause, and the step is retried once."""
from __future__ import annotations
import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import yaml

from .adt import AdtClient, AdtError, has_errors
from .audit import Audit
from .checklists import checklist
from .recipes import RECIPES
from .guard import Guard
from .sapx import SapxClient

STEP_TYPES = {"package", "transport", "ddic_tables", "lock_object", "number_range", "text_ids", "stvarv", "sources", "activate",
              "unit_tests", "run_report", "verify_odata", "bdc", "note", "agent",
              # Tier A (automated)
              "ddic_objects", "message_class", "text_pool", "test_include", "job", "user", "testdata",
              # Tier B (assisted by the agent, verified, with a manual fallback)
              "gateway", "role", "release_strategy", "rfc", "icf"}


@dataclass
class StepResult:
    id: str
    type: str
    ok: bool
    detail: Any = None
    skipped: bool = False
    manual: bool = False        # done as far as the agent can; a human must finish or confirm
    todo: str = ""              # the exact steps for the human (markdown)


@dataclass
class Manifest:
    path: str
    data: dict

    @classmethod
    def load(cls, path: str) -> "Manifest":
        with open(path, encoding="utf-8") as f:
            d = yaml.safe_load(f)
        m = cls(os.path.abspath(path), d)
        m.validate()
        return m

    @property
    def base(self) -> str:
        return os.path.dirname(self.path)

    def validate(self):
        ids = set()
        for s in self.data.get("steps", []):
            if s.get("type") not in STEP_TYPES:
                raise ValueError(f"step {s.get('id')}: unknown type {s.get('type')}")
            if s["id"] in ids:
                raise ValueError(f"duplicate step id {s['id']}")
            ids.add(s["id"])
            if s["type"] == "activate" and s.get("group") not in ids:
                raise ValueError(f"step {s['id']}: group '{s.get('group')}' must be an earlier 'sources' step")
        if "package" not in self.data:
            raise ValueError("manifest needs a 'package' block")

    def file(self, rel: str) -> str:
        return os.path.normpath(os.path.join(self.base, rel))


class Deployer:
    def __init__(self, manifest: Manifest, guard: Guard, adt: AdtClient, sapx: SapxClient, audit: Audit,
                 repair: Optional[Callable[[str, str], bool]] = None, log: Callable[[str], None] = print,
                 agent_runner: Optional[Callable[[str], bool]] = None):
        self.m, self.g, self.adt, self.x, self.audit, self.repair, self.log = manifest, guard, adt, sapx, audit, repair, log
        self.agent_runner = agent_runner
        self.ctx: dict[str, Any] = {"groups": {}, "request": manifest.data.get("transport", {}).get("request", "")}

    def run(self, only: str | None = None, dry_run: bool = False, keep_going: bool = False) -> list[StepResult]:
        info = self.x.call("ping")
        self.g.check_system(info.get("sid", ""))
        self.log(f"system {info.get('sid')} client {info.get('client')} release {info.get('release')}")
        results: list[StepResult] = []
        for step in self.m.data["steps"]:
            if only and step["id"] != only and step["type"] != "transport":
                continue
            if dry_run:
                results.append(StepResult(step["id"], step["type"], True, "dry run", skipped=True))
                self.log(f"[dry-run] {step['id']} ({step['type']})")
                continue
            res = self._run_step(step)
            if not res.ok and self.repair:
                self.log(f"step {step['id']} failed, asking the agent to repair")
                if self.repair(step["id"], json.dumps(res.detail)[:3000]):
                    res = self._run_step(step)
            results.append(res)
            self.log(f"{'TODO' if res.manual else ('OK  ' if res.ok else 'FAIL')} {step['id']} ({step['type']})")
            self.audit.log("deploy_step", id=step["id"], type=step["type"], ok=res.ok)
            if not res.ok and not keep_going:
                break
        return results

    # ------------------------------------------------------------------------------------------
    def _run_step(self, s: dict) -> StepResult:
        try:
            fn = getattr(self, "_do_" + s["type"])
            detail = fn(s)
            if isinstance(detail, dict) and detail.get("manual"):
                return StepResult(s["id"], s["type"], True, detail, manual=True, todo=detail.get("todo", ""))
            ok = not (isinstance(detail, dict) and detail.get("errors"))
            return StepResult(s["id"], s["type"], ok, detail)
        except Exception as e:
            return StepResult(s["id"], s["type"], False, {"error": str(e), "body": getattr(e, "body", "")[:800]})

    def _pkg(self) -> str:
        return self.g.check_package(self.m.data["package"]["name"])

    def _do_package(self, s):
        p = self.m.data["package"]
        name = self._pkg()
        if self.adt.package_exists(name):
            return {"exists": name}
        self.g.check_write("package")
        try:
            self.adt.create("package", name, p.get("description", name), name, self.ctx["request"],
                            {"software_component": p.get("software_component", "HOME"), "transport_layer": p.get("transport_layer", ""),
                             "super_package": p.get("super_package", "")})
        except AdtError as e:
            if e.status != 404:
                raise
            # No ADT package resource on this release (7.50): the package is assumed to exist (create it in SE21 otherwise);
            # the first object created in it fails clearly if it does not.
            return {"exists": name, "unverified": True, "note": f"this SAP release cannot read or create packages over ADT; {name} must already exist (SE21)"}
        return {"created": name}

    def _do_transport(self, s):
        if self.ctx["request"]:
            return {"request": self.ctx["request"], "reused": True}
        self.g.check_write("transport")
        self.ctx["request"] = self.adt.create_transport(s.get("description", self.m.data.get("project", "agent")), package=self._pkg())
        return {"request": self.ctx["request"]}

    def _task(self, task: str, args: dict):
        self.g.check_task(task, args)
        args.setdefault("request", self.ctx["request"])
        args.setdefault("package", self._pkg())
        return self.x.call(task, args)

    def _do_ddic_tables(self, s):
        with open(self.m.file(s["spec"]), encoding="utf-8") as f:
            spec = json.load(f)
        return self._task("ddic_tables", {"tables": spec["tables"]})

    def _do_lock_object(self, s):
        return self._task("lock_object", {k: s[k] for k in ("name", "table", "fields")})

    def _do_number_range(self, s):
        return self._task("number_range", {k: v for k, v in s.items() if k in ("name", "length", "from_no", "to_no")})

    def _do_text_ids(self, s):
        return self._task("text_ids", {"items": s["items"]})

    def _do_stvarv(self, s):
        return self._task("stvarv", {"items": s["items"]})

    def _do_sources(self, s):
        base = self.m.file(s.get("base", "."))
        done, pkg = [], self._pkg()
        for f in s["files"]:
            kind, name = f["kind"], self.g.check_name(f["name"])
            self.g.check_source(kind, name, pkg)
            owner = self.adt.package_of(kind, name)
            self.g.check_owner(name, owner)
            with open(os.path.join(base, f["file"]), encoding="utf-8") as fh:
                src = fh.read()
            if owner is None:
                self.adt.create(kind, name, f.get("description", name), pkg, self.ctx["request"])
            self.adt.write_source(kind, name, src, self.ctx["request"])
            done.append((kind, name))
        self.ctx["groups"][s["id"]] = done
        return {"written": [n for _, n in done]}

    def _do_activate(self, s):
        objs = self.ctx["groups"].get(s["group"]) or []
        if not objs:
            return {"errors": True, "error": f"group {s['group']} has no objects (was the sources step run?)"}
        msgs = self.adt.activate(objs)
        return {"errors": has_errors(msgs), "messages": msgs[:40], "activated": [n for _, n in objs]}

    def _do_unit_tests(self, s):
        r = self.adt.run_unit_tests([(o["kind"], o["name"]) for o in s["objects"]])
        return {"errors": not r.get("ok", False), **r}

    def _do_run_report(self, s):
        return self._task("run_report", {"report": s["report"], "params": s.get("params", {})})

    def _do_bdc(self, s):
        return self._task("bdc_run", {"tcode": s["tcode"], "steps": s["steps"], "mode": s.get("mode", "N")})

    def _do_verify_odata(self, s):
        status, body = self.adt.odata_get(s["path"])
        missing = [t for t in s.get("expect", []) if t not in body]
        return {"errors": status != 200 or bool(missing), "status": status, "missing": missing}

    def _do_note(self, s):
        return {"note": s.get("text", "")}

    def _do_agent(self, s):
        """A step that needs discovery on the live system (screens, registrations): the LLM agent does it with its tools."""
        if not self.agent_runner:
            return {"skipped": True, "reason": "no LLM agent configured; run deploy with --agent", "prompt": s["prompt"]}
        ok = self.agent_runner(s["prompt"])
        return {"errors": not ok, "agent_finished": ok}

    # ------------------------------------------------------------------ Tier A
    def _do_ddic_objects(self, s):
        return self._task("ddic_objects", {"items": s["items"]})

    def _do_message_class(self, s):
        return self._task("message_class", {"classes": s["classes"]})

    def _do_text_pool(self, s):
        return self.x.call("text_pool", {"program": self.g.check_name(s["program"]), "texts": s["texts"]}) if self._ok_write("text_pool") else {}

    def _ok_write(self, what):
        self.g.check_write(what)
        return True

    def _do_test_include(self, s):
        name = self.g.check_name(s["class"])
        self.g.check_write("test_include")
        self.g.check_owner(name, self.adt.package_of("class", name) or "(missing)")
        with open(self.m.file(s["file"]), encoding="utf-8") as f:
            src = f.read()
        self.adt.write_test_include(name, src, self.ctx["request"])
        if s.get("group"):                                  # activate the class again together with its group
            grp = self.ctx["groups"].setdefault(s["group"], [])
            if ("class", name) not in grp:
                grp.append(("class", name))
        return {"written": name}

    def _do_job(self, s):
        self.g.check_task("job_schedule", s)
        return self.x.call("job_schedule", {k: s[k] for k in ("job", "report", "variant", "period_min") if k in s})

    def _do_user(self, s):
        pw = os.environ.get(s.get("password_env", ""), "")
        if not pw:
            return {"manual": True, "todo": f"### User {s['user']}\n1. Set the environment variable `{s.get('password_env', 'SRC_PWD_...')}` to an initial password and run this step again, or create the user in SU01 with roles {', '.join(s['roles'])}.\n2. Proof: `sap_read_table USR21 where bname = '{s['user']}'`."}
        args = {"user": s["user"], "password": pw, "user_type": s.get("user_type", "A"), "first_name": s.get("first_name", ""),
                "last_name": s.get("last_name", s["user"]), "email": s.get("email", ""), "roles": s.get("roles", [])}
        self.g.check_task("user_create", args)
        return self.x.call("user_create", args)

    def _do_testdata(self, s):
        kind = s["kind"]
        if kind == "vendor":
            return self._assisted("vendor", s, verify=None, checklist_kind=None)
        task = "testdata_material" if kind == "material" else "testdata_requisition"
        self.g.check_task(task, s["spec"])
        return self.x.call(task, s["spec"])

    # ------------------------------------------------------------------ Tier B
    def _read_back(self, table: str, where: str) -> bool:
        try:
            rows = self.x.call("read_table", {"table": table, "where": where, "max": 1})
            return bool(rows)
        except Exception:
            return False

    def _assisted(self, kind: str, spec: dict, verify, checklist_kind):
        """Attempt with the AI agent; prove by read-back; if that is not possible or fails, hand a checklist to a human."""
        tail = checklist(checklist_kind, spec) if checklist_kind else f"Do `{kind}` by hand, then re-run this step."
        if verify and verify():
            return {"exists": True}
        if not self.agent_runner:
            return {"manual": True, "todo": tail, "reason": "no LLM agent configured (run deploy with --agent)"}
        ok = self.agent_runner(RECIPES[kind](spec))
        if verify:
            if verify():
                return {"created_by_agent": True}
            return {"manual": True, "todo": tail, "reason": "agent finished but the read-back did not find the object"}
        return {"manual": True, "todo": tail, "reason": "created by the agent; no automatic read-back exists, a human confirms" if ok else "agent could not finish"}

    def _do_gateway(self, s):
        def verify():
            status, body = self.adt.odata_get(f"/sap/opu/odata/sap/{s['service']}/$metadata")
            return status == 200 and all(e in body for e in s.get("expect", []))
        spec = {**s, "package": self._pkg()}
        return self._assisted("gateway", spec, verify, "gateway")

    def _do_role(self, s):
        return self._assisted("role", s, lambda: self._read_back("AGR_DEFINE", f"AGR_NAME = '{s['name'].upper()}'"), "role")

    def _do_release_strategy(self, s):
        return self._assisted("release_strategy", s, lambda: self._read_back("T16FS", f"FRGGR = '{s.get('group', '01')}'"), "release_strategy")

    def _do_rfc(self, s):
        return self._assisted("rfc", s, None, "rfc")

    def _do_icf(self, s):
        if self.x.node_alive():
            return {"alive": True}
        return {"manual": True, "todo": checklist("icf", s), "reason": "ICF node does not answer"}

    @staticmethod
    def todo_markdown(results: list["StepResult"]) -> str:
        items = [r for r in results if r.manual]
        if not items:
            return "# Manual to-do\n\nNothing: every step was completed by the agent.\n"
        out = ["# Manual to-do", "", "The agent did everything it could. A human must finish these. After each one, re-run `sap-agent deploy ... --only <step id>` to prove it.", ""]
        for r in items:
            out += [f"## Step `{r.id}` ({r.type})", "", r.todo or "(see audit log)", ""]
        return "\n".join(out)
