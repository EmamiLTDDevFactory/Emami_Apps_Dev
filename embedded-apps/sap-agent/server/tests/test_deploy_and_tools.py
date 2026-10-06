import json, os
import pytest
from sap_agent.deploy import Deployer, Manifest
from sap_agent.tools import ToolBox
from sap_agent.agent import Agent

HERE = os.path.dirname(__file__)
MANIFEST = os.path.join(HERE, "..", "projects", "emami_sourcing", "manifest.yaml")


def test_manifest_loads_and_is_ordered():
    m = Manifest.load(MANIFEST)
    ids = [s["id"] for s in m.data["steps"]]
    assert ids.index("pkg") < ids.index("tr") < ids.index("ddic") < ids.index("src") < ids.index("act") < ids.index("reg_odata") < ids.index("verify")
    srcs = next(s for s in m.data["steps"] if s["id"] == "src")["files"]
    assert len(srcs) == 13
    names = [f["name"] for f in srcs]
    assert names.index("ZCL_SRC_UTIL") < names.index("ZCL_SRC_RFQ_SRV") < names.index("ZCL_SRC_DPC")


def test_manifest_source_files_exist():
    m = Manifest.load(MANIFEST)
    s = next(x for x in m.data["steps"] if x["id"] == "src")
    base = m.file(s["base"])
    if not os.path.isdir(base):
        pytest.skip("run inside the emami-sourcing project to check source files")
    for f in s["files"]:
        assert os.path.exists(os.path.join(base, f["file"])), f["file"]


def test_manifest_rejects_bad_group(tmp_path):
    p = tmp_path / "m.yaml"
    p.write_text("package: {name: ZSRC}\nsteps:\n  - {id: a, type: activate, group: nope}\n")
    with pytest.raises(ValueError):
        Manifest.load(str(p))


def test_manifest_rejects_unknown_type_and_duplicates(tmp_path):
    p = tmp_path / "m.yaml"
    p.write_text("package: {name: ZSRC}\nsteps:\n  - {id: a, type: format_disk}\n")
    with pytest.raises(ValueError):
        Manifest.load(str(p))
    p.write_text("package: {name: ZSRC}\nsteps:\n  - {id: a, type: note}\n  - {id: a, type: note}\n")
    with pytest.raises(ValueError):
        Manifest.load(str(p))


def small_manifest(tmp_path, extra=""):
    (tmp_path / "zcl_a.clas.abap").write_text("CLASS zcl_a DEFINITION PUBLIC. ENDCLASS.")
    p = tmp_path / "m.yaml"
    p.write_text(f"""project: t
package: {{name: ZSRC, description: x}}
steps:
  - {{id: pkg, type: package}}
  - {{id: tr, type: transport, description: t}}
  - id: src
    type: sources
    base: .
    files: [{{kind: class, name: ZCL_A, file: zcl_a.clas.abap}}]
  - {{id: act, type: activate, group: src}}
{extra}""")
    return Manifest.load(str(p))


def test_deploy_runs_steps_in_order(parts, tmp_path):
    g, adt, sapx, audit = parts
    res = Deployer(small_manifest(tmp_path), g, adt, sapx, audit, log=lambda s: None).run()
    assert all(r.ok for r in res)
    kinds = [c[0] for c in adt.calls]
    assert kinds == ["create", "transport", "create", "write", "activate"] or kinds[:2] == ["create", "transport"]
    assert ("activate", ["ZCL_A"]) in adt.calls
    # request number from the transport step is used for the object
    assert ("create", "class", "ZCL_A", "ZSRC", "DEVK900001") in adt.calls


def test_deploy_stops_on_activation_error_and_reports(parts, tmp_path):
    g, adt, sapx, audit = parts
    adt.activation_errors = True
    res = Deployer(small_manifest(tmp_path), g, adt, sapx, audit, log=lambda s: None).run()
    assert not res[-1].ok and res[-1].id == "act"


def test_deploy_refuses_wrong_system(parts, tmp_path):
    g, adt, sapx, audit = parts
    sapx.sid = "PRD"
    from sap_agent.guard import PolicyError
    with pytest.raises(PolicyError):
        Deployer(small_manifest(tmp_path), g, adt, sapx, audit, log=lambda s: None).run()
    assert adt.calls == []                              # nothing was touched


def test_dry_run_touches_nothing(parts, tmp_path):
    g, adt, sapx, audit = parts
    res = Deployer(small_manifest(tmp_path), g, adt, sapx, audit, log=lambda s: None).run(dry_run=True)
    assert adt.calls == [] and all(r.skipped for r in res)


def test_repair_callback_retries_once(parts, tmp_path):
    g, adt, sapx, audit = parts
    adt.activation_errors = True
    seen = []

    def repair(step, err):
        seen.append(step)
        adt.activation_errors = False            # the "agent" fixed it
        return True
    res = Deployer(small_manifest(tmp_path), g, adt, sapx, audit, repair=repair, log=lambda s: None).run()
    assert seen == ["act"] and res[-1].ok


def test_agent_step_skipped_without_llm(parts, tmp_path):
    g, adt, sapx, audit = parts
    m = small_manifest(tmp_path, "  - {id: a1, type: agent, prompt: do it}\n")
    res = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()
    assert res[-1].id == "a1" and res[-1].detail.get("skipped")


# ----------------------------------------------------------------------------------- tools
def test_toolbox_protects_existing_standard_objects_and_wrong_system(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    out = json.loads(tb.call("sap_write_source", {"kind": "class", "name": "CL_ABAP_TSTMP", "source": "x", "package": "ZSRC"}))
    assert out["error"] == "policy" and "outside the allowed packages" in out["message"]
    assert not [c for c in adt.calls if c[0] in ("create", "write")]
    # reading standard code is fine (the agent learns from it)
    assert "source" in json.loads(tb.call("sap_read_source", {"kind": "class", "name": "CL_ABAP_TSTMP"}))
    sapx.sid = "QAS"
    tb2 = ToolBox(g, adt, sapx, audit)
    out = json.loads(tb2.call("sap_search", {"query": "Z*"}))
    assert out["error"] == "policy"


@pytest.mark.parametrize("name", ["zcl_new", "EMAMI_RFQ_SERVICE", "CL_MY_OWN_CLASS", "RFQ_SRV"])
def test_toolbox_any_new_name_is_created_then_written(parts, name):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    out = json.loads(tb.call("sap_write_source", {"kind": "class", "name": name, "source": "CLASS x.", "package": "ZSRC", "description": "d"}))
    assert out["written"] == name.upper()
    assert [c[0] for c in adt.calls] == ["create", "write"]
    # a second write updates the same object, no second create
    tb.call("sap_write_source", {"kind": "class", "name": name, "source": "CLASS x2.", "package": "ZSRC"})
    assert [c[0] for c in adt.calls] == ["create", "write", "write"]


def test_toolbox_wrong_package_is_refused(parts):
    g, adt, sapx, audit = parts
    out = json.loads(ToolBox(g, adt, sapx, audit).call("sap_write_source", {"kind": "class", "name": "MY_CLASS", "source": "x", "package": "SOMEWHERE"}))
    assert out["error"] == "policy"


def test_toolbox_activate_only_owned_objects(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    tb.call("sap_write_source", {"kind": "class", "name": "MY_CLASS", "source": "x", "package": "ZSRC"})
    ok = json.loads(tb.call("sap_activate", {"objects": [{"kind": "class", "name": "MY_CLASS"}]}))
    assert "error" not in ok
    bad = json.loads(tb.call("sap_activate", {"objects": [{"kind": "class", "name": "CL_STANDARD"}]}))
    assert bad["error"] == "policy"
    missing = json.loads(tb.call("sap_activate", {"objects": [{"kind": "class", "name": "NOT_THERE"}]}))
    assert missing["error"] == "policy"


def test_toolbox_normalises_bdc_fields_and_blocks_tcodes(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    steps = [{"program": "SAPMM06E", "dynpro": "0200", "fields": {"EKKO-EKORG": "1000"}, "okcode": "/00"}]
    assert json.loads(tb.call("sap_bdc_run", {"tcode": "ME41", "steps": steps}))["error"] == "policy"      # not validated yet
    tb.call("sap_bdc_validate", {"tcode": "ME41", "steps": [dict(s, fields=dict(s["fields"])) for s in steps]})
    tb.call("sap_bdc_run", {"tcode": "ME41", "steps": steps})
    task, args = sapx.calls[-1]
    assert task == "bdc_run" and args["steps"][0]["fields"] == [{"n": "EKKO-EKORG", "v": "1000"}]
    out = json.loads(tb.call("sap_bdc_run", {"tcode": "SU01", "steps": []}))
    assert out["error"] == "policy"


def test_toolbox_table_read_limits(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    tb.call("sap_read_table", {"table": "EKKO", "max": 99999})
    assert sapx.calls[-1][1]["max"] == 200
    assert json.loads(tb.call("sap_read_table", {"table": "USR02"}))["error"] == "policy"
    tb.call("sap_read_table", {"table": "MY_CUSTOM_TABLE"})            # any name passes the guard; the handler decides


def test_release_tool_blocked(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    assert json.loads(tb.call("sap_release_transport", {"request": "DEVK900001"}))["error"] == "policy"
    assert ("release", "DEVK900001") not in adt.calls


def test_audit_log_masks_and_records(parts, cfg):
    g, adt, sapx, audit = parts
    ToolBox(g, adt, sapx, audit).call("sap_search", {"query": "Z*"})
    audit.log("x", password="secret", args={"token": "t"})
    lines = open(cfg.audit_file).read().splitlines()
    assert any('"tool": "sap_search"' in l for l in lines)
    assert "secret" not in open(cfg.audit_file).read()


# ----------------------------------------------------------------------------------- agent loop with a scripted model
class Block(dict):
    pass


class FakeLLM:
    def __init__(self, script):
        self.script, self.i, self.messages = script, 0, self

    def create(self, **kw):
        r = self.script[min(self.i, len(self.script) - 1)]
        self.i += 1
        return r


def tool(tid, tname, /, **args):
    return {"type": "tool_use", "id": tid, "name": tname, "input": args}


def resp(content, stop):
    return {"content": content, "stop_reason": stop}


def test_agent_loop_runs_tools_and_finishes(parts):
    g, adt, sapx, audit = parts
    llm = FakeLLM([
        resp([{"type": "text", "text": "plan"}, tool("1", "sap_ping")], "tool_use"),
        resp([tool("2", "sap_write_source", kind="class", name="ZCL_X", source="CLASS zcl_x.", package="ZSRC")], "tool_use"),
        resp([tool("3", "sap_activate", objects=[{"kind": "class", "name": "ZCL_X"}])], "tool_use"),
        resp([{"type": "text", "text": "done: created ZCL_X"}], "end_turn")])
    out = Agent(llm, "m", ToolBox(g, adt, sapx, audit), audit, max_steps=10).run("create class ZCL_X")
    assert out.stopped == "end_turn" and "ZCL_X" in out.final_text and out.steps == 4
    assert ("activate", ["ZCL_X"]) in adt.calls


def test_agent_policy_error_goes_back_to_the_model(parts):
    g, adt, sapx, audit = parts
    llm = FakeLLM([
        resp([tool("1", "sap_write_source", kind="class", name="CL_STANDARD", source="x", package="ZSRC")], "tool_use"),
        resp([{"type": "text", "text": "I cannot touch standard objects"}], "end_turn")])
    ag = Agent(llm, "m", ToolBox(g, adt, sapx, audit), audit, max_steps=5)
    out = ag.run("change a standard class")
    assert out.stopped == "end_turn"
    tr = [m for m in out.transcript if m["role"] == "user" and isinstance(m["content"], list)]
    assert "policy" in tr[0]["content"][0]["content"]
    assert not [c for c in adt.calls if c[0] in ("create", "write")]


def test_agent_stops_when_stuck(parts):
    g, adt, sapx, audit = parts
    llm = FakeLLM([resp([tool("1", "sap_write_source", kind="class", name="CL_BAD", source="x", package="ZSRC")], "tool_use")])
    out = Agent(llm, "m", ToolBox(g, adt, sapx, audit), audit, max_steps=20).run("loop forever")
    assert out.stopped == "stuck" and out.steps == 3


def test_agent_step_limit(parts):
    g, adt, sapx, audit = parts
    llm = FakeLLM([resp([tool("1", "sap_ping")], "tool_use")])
    out = Agent(llm, "m", ToolBox(g, adt, sapx, audit), audit, max_steps=4).run("ping forever")
    assert out.stopped == "max_steps" and out.steps == 4
