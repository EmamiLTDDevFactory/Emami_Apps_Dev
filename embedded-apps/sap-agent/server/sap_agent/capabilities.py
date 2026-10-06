"""What the agent can and cannot build. The model reads this registry (tool sap_capabilities) so it never attempts the
impossible and always knows the fallback.

maturity:
  automated  a standard API does it; verify by reading back
  assisted   done with batch input after reading the real screens; always validated first and verified after
  manual     no safe programmatic route on ECC: the agent produces a checklist and verifies the result when the human is done
"""
from __future__ import annotations

REGISTRY: dict[str, dict] = {
    # ---------------------------------------------------------------- Tier A
    "ddic_tables":      {"tier": "A", "maturity": "automated", "how": "DDIF_TABL_PUT/ACTIVATE", "verify": "sap_ddic_read"},
    "ddic_objects":     {"tier": "A", "maturity": "automated", "how": "DDIF_DOMA/DTEL/TTYP/INDX_PUT and ACTIVATE (domains, data elements, table types, indexes)", "verify": "sap_ddic_read"},
    "search_help_view": {"tier": "A", "maturity": "assisted", "how": "DDIF_SHLP_PUT / DDIF_VIEW_PUT are not wired yet: batch input on SE11 after dynpro inspection"},
    "lock_object":      {"tier": "A", "maturity": "automated", "how": "DDIF_ENQU_PUT/ACTIVATE", "verify": "sap_ddic_read"},
    "number_range":     {"tier": "A", "maturity": "automated", "how": "NUMBER_RANGE_OBJECT_UPDATE and INTERVAL_UPDATE", "verify": "sap_read_table NRIV"},
    "message_class":    {"tier": "A", "maturity": "automated", "how": "T100A and T100 with TADIR entry"},
    "text_ids":         {"tier": "A", "maturity": "automated", "how": "TTXID and TTXIT", "verify": "sap_read_table TTXID"},
    "stvarv":           {"tier": "A", "maturity": "automated", "how": "TVARVC", "verify": "sap_read_table TVARVC"},
    "text_pool":        {"tier": "A", "maturity": "automated", "how": "INSERT TEXTPOOL (text symbols, selection texts, title)"},
    "test_include":     {"tier": "A", "maturity": "automated", "how": "ADT class include 'testclasses' (ABAP Unit)", "verify": "sap_run_unit_tests"},
    "job_schedule":     {"tier": "A", "maturity": "automated", "how": "JOB_OPEN, JOB_SUBMIT, JOB_CLOSE", "verify": "sap_read_table TBTCO"},
    "user_create":      {"tier": "A", "maturity": "automated", "how": "BAPI_USER_CREATE1 and BAPI_USER_ACTGROUPS_ASSIGN; any name except protected users; standard roles (SAP_*, S_A.*) never assigned", "verify": "sap_read_table USR21"},
    "testdata_material": {"tier": "A", "maturity": "automated", "how": "BAPI_MATERIAL_SAVEDATA; new materials only, any name; an existing material is never changed"},
    "testdata_requisition": {"tier": "A", "maturity": "automated", "how": "BAPI_REQUISITION_CREATE; creates a new document, changes no master data"},
    "testdata_vendor":  {"tier": "A", "maturity": "assisted", "how": "no standard BAPI in ECC: batch input on XK01 after dynpro inspection"},
    # ---------------------------------------------------------------- Tier B
    "gateway_service":  {"tier": "B", "maturity": "assisted", "how": "batch input on /IWBEP/REG_MODEL, /IWBEP/REG_SERVICE, /IWFND/MAINT_SERVICE; verify with $metadata", "verify": "sap_odata_get"},
    "role":             {"tier": "B", "maturity": "assisted", "how": "batch input on PFCG, then read AGR_DEFINE; if it fails, a PFCG checklist is produced", "verify": "sap_read_table AGR_DEFINE", "fallback": "role_checklist"},
    "release_strategy": {"tier": "B", "maturity": "assisted", "how": "classification BAPIs plus batch input on OMGQ/OMGSCK; verify T16FG/T16FS", "verify": "sap_read_table T16FS", "fallback": "release_strategy_checklist"},
    "rfc_destination":  {"tier": "B", "maturity": "assisted", "how": "batch input on SM59", "verify": "sap_run_report", "fallback": "rfc_checklist"},
    "icf_node":         {"tier": "B", "maturity": "manual", "how": "no stable API on ECC; the agent checks the node by HTTP and gives the exact steps", "verify": "HTTP GET of the node", "fallback": "icf_checklist"},
    "segw_project":     {"tier": "B", "maturity": "manual", "how": "no API exists. The agent builds the code-based OData model (ZCL_*_MPC and ZCL_*_DPC) instead, and registers it", "fallback": "segw_alternatives"},
    # ---------------------------------------------------------------- never
    "transport_release_qas_prd": {"tier": "C", "maturity": "manual", "how": "a human releases and imports transports"},
    "sso_trust_certificates":    {"tier": "C", "maturity": "manual", "how": "security team: STRUST, SAML, OAuth"},
    "stms_routes_profiles":      {"tier": "C", "maturity": "manual", "how": "basis team"},
}


def summary() -> dict:
    out: dict[str, list] = {"automated": [], "assisted": [], "manual": []}
    for k, v in REGISTRY.items():
        out[v["maturity"]].append(k)
    return out
