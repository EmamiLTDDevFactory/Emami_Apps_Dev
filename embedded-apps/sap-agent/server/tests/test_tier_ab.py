import json, os
import pytest
from sap_agent import checklists, capabilities
from sap_agent.deploy import Deployer, Manifest
from sap_agent.guard import Guard, PolicyError
from sap_agent.tools import ToolBox

HERE = os.path.dirname(__file__)
EMAMI = os.path.join(HERE, "..", "projects", "emami_sourcing", "manifest.yaml")


# ---------------------------------------------------------------- policy for the new tasks
def test_any_user_and_role_name_except_protected_and_standard(parts):
    g = parts[0]
    for u, roles in (("ZSRC_BUYER1", ["Z_SRC_BUYER"]), ("EMAMI_BUYER", ["EMAMI_ROLE"]), ("JSMITH", []), ("buyer01", ["ANY_ROLE_NAME"])):
        g.check_task("user_create", {"user": u, "roles": roles, "password": "Initial#2026"})
    for bad in ({"user": "DDIC", "roles": []}, {"user": "SAP_BASIS", "roles": []}, {"user": "SAPSYS", "roles": []}, {"user": "", "roles": []},
                {"user": "X1", "roles": ["SAP_ALL"]}, {"user": "X1", "roles": ["SAP_NEW"]}, {"user": "X1", "roles": ["S_A.SYSTEM"]},
                {"user": "X1", "roles": ["Z_ROLE"], "password": "short"}):
        with pytest.raises(PolicyError):
            g.check_task("user_create", bad)


def test_optional_user_and_role_patterns(cfg):
    cfg.user_patterns, cfg.role_patterns = ["EMAMI_.*"], ["EMAMI_.*"]
    g = Guard(cfg)
    g.check_task("user_create", {"user": "EMAMI_B1", "roles": ["EMAMI_BUYER"]})
    with pytest.raises(PolicyError):
        g.check_task("user_create", {"user": "OTHER_B1", "roles": []})
    with pytest.raises(PolicyError):
        g.check_task("user_create", {"user": "EMAMI_B1", "roles": ["OTHER_ROLE"]})


def test_testdata_any_material_name(parts):
    g = parts[0]
    g.check_task("testdata_material", {"material": "RM0001"})          # the handler refuses if it already exists
    g.check_task("testdata_material", {"material": "FILM_40"})
    g.check_task("testdata_requisition", {"material": "ztest_film"})
    with pytest.raises(PolicyError):
        g.check_task("testdata_material", {"material": "bad name"})


def test_index_only_on_listed_tables(parts):
    g = parts[0]
    g.check_task("ddic_objects", {"package": "ZSRC", "items": [{"kind": "INDX", "name": "Z01", "table": "EKKO"}]})
    g.check_task("ddic_objects", {"package": "ZSRC", "items": [{"kind": "INDX", "name": "A01", "table": "EKPO"}]})    # any index id
    with pytest.raises(PolicyError):
        g.check_task("ddic_objects", {"package": "ZSRC", "items": [{"kind": "INDX", "name": "Z01", "table": "BSEG"}]})
    g.check_task("ddic_objects", {"package": "ZSRC", "items": [{"kind": "DOMA", "name": "MY_DOMAIN"}]})      # any name; the handler checks ownership


def test_job_text_pool_report_names_are_free(parts):
    g = parts[0]
    g.check_task("job_schedule", {"job": "RFQ_TIMER", "report": "RFQ_TICK"})
    g.check_task("text_pool", {"program": "MY_PROGRAM"})
    g.check_task("run_report", {"report": "MY_REPORT"})
    with pytest.raises(PolicyError):
        g.check_task("job_schedule", {"job": "bad job", "report": "X"})


def test_message_class_name_is_free(parts):
    parts[0].check_task("message_class", {"package": "ZSRC", "classes": [{"arbgb": "M3"}]})
    parts[0].check_task("message_class", {"package": "ZSRC", "classes": [{"arbgb": "EMAMI"}]})
    with pytest.raises(PolicyError):
        parts[0].check_task("message_class", {"package": "OTHER", "classes": [{"arbgb": "EMAMI"}]})


# ---------------------------------------------------------------- batch input must be validated first
STEPS = [{"program": "SAPMM06E", "dynpro": "0200", "fields": {"EKKO-EKORG": "1000"}, "okcode": "/00"}]


def test_bdc_needs_validation_with_same_fields(parts):
    g, adt, sapx, audit = parts
    tb = ToolBox(g, adt, sapx, audit)
    assert json.loads(tb.call("sap_bdc_run", {"tcode": "ME41", "steps": json.loads(json.dumps(STEPS))}))["error"] == "policy"
    out = json.loads(tb.call("sap_bdc_validate", {"tcode": "ME41", "steps": json.loads(json.dumps(STEPS))}))
    assert out["valid"]
    ok = json.loads(tb.call("sap_bdc_run", {"tcode": "ME41", "steps": json.loads(json.dumps(STEPS))}))
    assert "error" not in ok
    other = json.loads(json.dumps(STEPS)); other[0]["fields"]["EKKO-EKGRP"] = "P01"        # a field that was never validated
    assert json.loads(tb.call("sap_bdc_run", {"tcode": "ME41", "steps": other}))["error"] == "policy"


def test_bdc_unknown_field_blocks_run(parts):
    g, adt, sapx, audit = parts
    sapx.unknown_fields = [{"program": "SAPMM06E", "dynpro": "0200", "field": "EKKO-NOPE"}]
    tb = ToolBox(g, adt, sapx, audit)
    assert not json.loads(tb.call("sap_bdc_validate", {"tcode": "ME41", "steps": json.loads(json.dumps(STEPS))}))["valid"]
    assert json.loads(tb.call("sap_bdc_run", {"tcode": "ME41", "steps": json.loads(json.dumps(STEPS))}))["error"] == "policy"


def test_bdc_validation_can_be_turned_off(cfg, parts):
    cfg.bdc_require_validation = False
    g = Guard(cfg)
    g.check_task("bdc_run", {"tcode": "ME41", "steps": STEPS})


# ---------------------------------------------------------------- checklists and registry
def test_role_checklist_names_the_proof():
    t = checklists.checklist("role", {"name": "Z_SRC_BUYER", "description": "Buyer", "tcodes": ["ME41"],
                                      "auth_objects": [{"object": "M_ANFR_EKG", "fields": {"EKGRP": ["P01"], "ACTVT": ["01", "02"]}}]})
    assert "Z_SRC_BUYER" in t and "M_ANFR_EKG" in t and "AGR_DEFINE" in t and "P01" in t


@pytest.mark.parametrize("kind", ["role", "release_strategy", "icf", "rfc", "gateway", "segw"])
def test_every_checklist_renders(kind):
    spec = {"name": "X", "service": "ZSRC_SRV", "path": "/sap/zsrc_agent/tasks", "codes": [{"code": "01"}]}
    assert len(checklists.checklist(kind, spec)) > 40


def test_unknown_checklist_kind():
    with pytest.raises(ValueError):
        checklists.checklist("nuclear", {})


def test_registry_marks_hard_things_honestly():
    r = capabilities.REGISTRY
    assert r["segw_project"]["maturity"] == "manual" and r["icf_node"]["maturity"] == "manual"
    assert r["role"]["maturity"] == "assisted" and r["ddic_tables"]["maturity"] == "automated"
    assert r["transport_release_qas_prd"]["tier"] == "C"
    for k, v in r.items():
        if v["maturity"] == "manual" and v["tier"] != "C":
            assert v.get("fallback"), k          # every non-trivial manual item has a generated checklist


# ---------------------------------------------------------------- deploy: manual items are reported, not failed
def mini(tmp_path, steps_yaml):
    p = tmp_path / "m.yaml"
    p.write_text("project: t\npackage: {name: ZSRC}\nsteps:\n" + steps_yaml)
    return Manifest.load(str(p))


def test_icf_alive_is_ok_and_dead_is_a_todo(parts, tmp_path):
    g, adt, sapx, audit = parts
    m = mini(tmp_path, "  - {id: icf, type: icf, path: /sap/zsrc_agent/tasks}\n")
    assert Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0].ok
    sapx.alive = False
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0]
    assert r.ok and r.manual and "SICF" in r.todo


def test_role_exists_is_skipped_missing_without_llm_is_todo(parts, tmp_path):
    g, adt, sapx, audit = parts
    m = mini(tmp_path, "  - {id: r, type: role, name: Z_SRC_BUYER, tcodes: [ME41]}\n")
    sapx.rows["AGR_DEFINE"] = [{"agr_name": "Z_SRC_BUYER"}]
    assert Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0].detail == {"exists": True}
    sapx.rows["AGR_DEFINE"] = []
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0]
    assert r.manual and "PFCG" in r.todo


def test_role_created_by_agent_is_proved_by_readback(parts, tmp_path):
    g, adt, sapx, audit = parts
    m = mini(tmp_path, "  - {id: r, type: role, name: Z_SRC_BUYER, tcodes: [ME41]}\n")
    sapx.rows["AGR_DEFINE"] = []

    def runner(prompt):
        assert "Z_SRC_BUYER" in prompt and "sap_bdc_validate" in prompt and "sap_dynpro_inspect" in prompt
        sapx.rows["AGR_DEFINE"] = [{"agr_name": "Z_SRC_BUYER"}]      # the agent "created" it
        return True
    r = Deployer(m, g, adt, sapx, audit, agent_runner=runner, log=lambda s: None).run()[0]
    assert r.ok and not r.manual and r.detail == {"created_by_agent": True}


def test_agent_claims_success_but_readback_disagrees(parts, tmp_path):
    g, adt, sapx, audit = parts
    m = mini(tmp_path, "  - {id: r, type: role, name: Z_SRC_BUYER}\n")
    sapx.rows["AGR_DEFINE"] = []
    r = Deployer(m, g, adt, sapx, audit, agent_runner=lambda p: True, log=lambda s: None).run()[0]
    assert r.manual and "read-back" in r.detail["reason"]       # a model's word is never the proof


def test_user_step_without_password_env_is_a_todo(parts, tmp_path, monkeypatch):
    g, adt, sapx, audit = parts
    monkeypatch.delenv("SRC_PWD_T", raising=False)
    m = mini(tmp_path, "  - {id: u, type: user, user: ZSRC_T1, password_env: SRC_PWD_T, roles: [Z_SRC_BUYER]}\n")
    assert Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0].manual
    monkeypatch.setenv("SRC_PWD_T", "Initial#2026")
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[0]
    assert r.ok and ("user_create", ) == (sapx.calls[-1][0], )
    assert "Initial#2026" not in json.dumps(r.detail)


def test_todo_markdown(parts, tmp_path):
    g, adt, sapx, audit = parts
    sapx.alive = False
    m = mini(tmp_path, "  - {id: icf, type: icf, path: /sap/zsrc_agent/tasks}\n")
    res = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()
    md = Deployer.todo_markdown(res)
    assert "icf" in md and "SICF" in md
    assert "Nothing" in Deployer.todo_markdown([])


def test_test_include_registers_class_for_activation(parts, tmp_path):
    g, adt, sapx, audit = parts
    (tmp_path / "t.abap").write_text("CLASS ltc DEFINITION FOR TESTING. ENDCLASS.")
    adt.pkg[("class", "ZCL_A")] = "ZSRC"                     # the class must already exist, in an allowed package
    m = mini(tmp_path, "  - {id: s, type: note}\n  - {id: ti, type: test_include, class: ZCL_A, file: t.abap, group: s}\n")
    d = Deployer(m, g, adt, sapx, audit, log=lambda s: None)
    d.adt.write_test_include = lambda *a, **k: adt.calls.append(("test_include", a[0]))
    r = d.run()
    assert r[-1].ok and ("test_include", "ZCL_A") in adt.calls and ("class", "ZCL_A") in d.ctx["groups"]["s"]


def test_test_include_on_a_standard_class_is_refused(parts, tmp_path):
    g, adt, sapx, audit = parts
    (tmp_path / "t.abap").write_text("x")
    m = mini(tmp_path, "  - {id: ti, type: test_include, class: CL_STANDARD, file: t.abap}\n")
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[-1]
    assert not r.ok and "outside the allowed packages" in json.dumps(r.detail) and not [c for c in adt.calls if c[0] == "test_include"]


def test_sources_step_refuses_to_overwrite_a_foreign_object(parts, tmp_path):
    g, adt, sapx, audit = parts
    (tmp_path / "a.abap").write_text("CLASS cl_abap_tstmp. ENDCLASS.")
    m = mini(tmp_path, "  - id: src\n    type: sources\n    base: .\n    files: [{kind: class, name: CL_ABAP_TSTMP, file: a.abap}]\n")
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[-1]
    assert not r.ok and not [c for c in adt.calls if c[0] in ("create", "write")]


def test_sources_step_accepts_any_new_names(parts, tmp_path):
    g, adt, sapx, audit = parts
    (tmp_path / "a.abap").write_text("x")
    m = mini(tmp_path, "  - id: src\n    type: sources\n    base: .\n    files: [{kind: class, name: EMAMI_RFQ_SRV, file: a.abap}, {kind: program, name: RFQ_REPORT, file: a.abap}]\n")
    r = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run()[-1]
    assert r.ok and ("create", "class", "EMAMI_RFQ_SRV", "ZSRC", "") in adt.calls


def test_emami_manifest_with_tiers_loads_and_orders():
    m = Manifest.load(EMAMI)
    ids = [s["id"] for s in m.data["steps"]]
    types = {s["id"]: s["type"] for s in m.data["steps"]}
    assert ids.index("act") < ids.index("util_tests") < ids.index("act_tests") < ids.index("run_tests")
    assert ids.index("test_material") < ids.index("test_pr")
    assert types["reg_odata"] == "gateway" and types["role_buyer"] == "role" and types["icf_check"] == "icf"
    assert ids.index("reg_odata") < ids.index("rfq_writer") < ids.index("verify")


def test_dry_run_of_emami_touches_nothing(parts):
    g, adt, sapx, audit = parts
    m = Manifest.load(EMAMI)
    res = Deployer(m, g, adt, sapx, audit, log=lambda s: None).run(dry_run=True)
    assert len(res) == len(m.data["steps"]) and adt.calls == [] and [c for c in sapx.calls if c[0] != "ping"] == []
