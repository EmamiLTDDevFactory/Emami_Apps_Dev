import pytest
from sap_agent.guard import Guard, PolicyError


def test_any_valid_name_is_allowed(parts):
    """No prefix rule: the user may choose any name. Protection comes from ownership (next test), not from the name."""
    g = parts[0]
    for ok in ("zcl_src_util", "EZSRC_AUC", "CL_MY_CLASS", "EMAMI_RFQ", "ZRFQ", "A", "/EMAMI/CL_X", "Z_SRC_BUYER"):
        g.check_name(ok)
    for bad in ("ZCL SRC", "../ZX", "", "A" * 41, "X;DROP", "Z*", "name with space"):
        with pytest.raises(PolicyError):
            g.check_name(bad)


def test_optional_name_patterns(cfg):
    cfg.name_patterns = ["EMAMI_.*"]
    g = Guard(cfg)
    g.check_name("emami_rfq")
    with pytest.raises(PolicyError):
        g.check_name("ZCL_OTHER")


def test_ownership_protects_standard_objects_whatever_the_name(parts):
    g = parts[0]
    g.check_owner("ZNEW", None)                      # new object: fine
    g.check_owner("ZCL_MINE", "ZSRC")                # already in an allowed package: fine
    for pkg in ("SABP", "MEPO", "$TMP", "ZOTHER", "(unknown)"):
        with pytest.raises(PolicyError):
            g.check_owner("CL_ABAP_TSTMP", pkg)
    with pytest.raises(PolicyError):                 # even a Z-named object is protected when it belongs to someone else
        g.check_owner("ZCL_FOREIGN", "ZTEAM_B")


def test_package_allowlist(parts):
    g = parts[0]
    assert g.check_package("zsrc") == "ZSRC"
    with pytest.raises(PolicyError):
        g.check_package("ZOTHER")


def test_system_allowlist(parts):
    g = parts[0]
    g.check_system("DEV")
    with pytest.raises(PolicyError):
        g.check_system("PRD")


def test_read_only_blocks_writes(cfg):
    cfg.read_only = True
    g = Guard(cfg)
    g.check_task("ping", {})
    with pytest.raises(PolicyError):
        g.check_task("ddic_tables", {"tables": [{"name": "ZX"}]})
    with pytest.raises(PolicyError):
        g.check_write("anything")


def test_bdc_and_report_and_tables(parts):
    g = parts[0]
    g.check_bdc("ME41")
    with pytest.raises(PolicyError):
        g.check_bdc("SE38")
    with pytest.raises(PolicyError):
        g.check_bdc("SU01")
    g.check_report("ZSRC_AUC_TICK")
    g.check_report("MY_REPORT")            # any name; the handler runs it only if it lives in the agent's packages
    g.check_table_read("EKKO")
    g.check_table_read("MY_OWN_TABLE")      # any name: the handler decides (allow-list or the agent's own packages)
    for secret in ("USR02", "usr02", "RFCDES", "SECSTORE"):
        with pytest.raises(PolicyError):
            g.check_table_read(secret)         # password hashes, RFC passwords


def test_odata_path_scope(parts):
    g = parts[0]
    g.check_odata_path("/sap/opu/odata/sap/ZSRC_SRV/$metadata")
    for bad in ("/sap/bc/adt/discovery", "/sap/opu/odata/../bc/x"):
        with pytest.raises(PolicyError):
            g.check_odata_path(bad)


def test_release_is_blocked_by_default(cfg):
    g = Guard(cfg)
    with pytest.raises(PolicyError):
        g.check_release("DEVK900001")
    cfg.allow_release = True
    with pytest.raises(PolicyError):                    # enabled, but approval = deny
        Guard(cfg).check_release("DEVK900001")
    assert Guard(cfg, lambda a, d: True) is not None
    cfg.approval = "prompt"
    Guard(cfg, lambda a, d: True).check_release("DEVK900001")


def test_ddic_task_checks_syntax_and_package(parts):
    g = parts[0]
    g.check_task("ddic_tables", {"package": "ZSRC", "tables": [{"name": "ZSRC_AUC"}]})
    g.check_task("ddic_tables", {"package": "ZSRC", "tables": [{"name": "EMAMI_AUCTION"}]})      # any name
    with pytest.raises(PolicyError):
        g.check_task("ddic_tables", {"package": "OTHER", "tables": [{"name": "ZX"}]})
    with pytest.raises(PolicyError):
        g.check_task("ddic_tables", {"package": "ZSRC", "tables": [{"name": "bad name"}]})
