"""Exact human steps for what cannot be automated, generated from the same spec the agent would have used.
Written to MANUAL_TODO.md after a deploy so nothing is forgotten, and each item names the check that proves it is done."""
from __future__ import annotations


def role_checklist(spec: dict) -> str:
    name = spec["name"]
    lines = [f"### PFCG role {name}: {spec.get('description', '')}",
             f"1. PFCG, enter role `{name}`, choose Single role, Create.",
             f"2. Description: {spec.get('description', name)}."]
    tc = spec.get("tcodes", [])
    if tc:
        lines.append("3. Menu tab, add transactions: " + ", ".join(f"`{t}`" for t in tc) + ".")
    lines.append("4. Authorizations tab, Change authorization data. Add or maintain these objects:")
    for ob in spec.get("auth_objects", []):
        fields = "; ".join(f"`{f}` = {', '.join(v) if isinstance(v, list) else v}" for f, v in ob.get("fields", {}).items())
        lines.append(f"   - `{ob['object']}`: {fields}")
    lines += ["5. Generate the profile (Generate button), save, then User tab: assign users " + ", ".join(spec.get("users", [])) + " (or leave for the admin).",
              f"6. Proof: the agent runs `sap_read_table AGR_DEFINE where agr_name = '{name}'` and finds one row."]
    return "\n".join(lines)


def release_strategy_checklist(spec: dict) -> str:
    g = spec.get("group", "01")
    return "\n".join([
        f"### Purchase order release strategy {spec.get('strategy', 'Z1')} (group {g})",
        "1. SPRO, Materials Management, Purchasing, Purchase Order, Release Procedure for Purchase Orders.",
        f"2. Release groups (OMGQ step 1): create group `{g}`, class `{spec.get('class', 'ZEMAMI_PO_REL')}`, class type 032.",
        "3. Release codes: " + ", ".join(f"`{c['code']}` ({c.get('text', '')})" for c in spec.get("codes", [])) + ".",
        "4. Release indicators and status (OMGSCK) as per your approval policy.",
        f"5. Release strategy `{spec.get('strategy', 'Z1')}`: prerequisites codes in order, status, and classification (CL24N) with characteristic CEKKO-GNETW from {spec.get('from_value', '5,000,000')} (the award value above which a manager must approve).",
        "6. Proof: `sap_read_table T16FS where frggr = '" + g + "'` finds the strategy, and a test PO above the limit shows EKKO-FRGRL = X."])


def icf_checklist(spec: dict) -> str:
    path = spec.get("path", "/sap/zsrc_agent/tasks")
    parts = path.strip("/").split("/")          # ['sap', 'zsrc_agent', 'tasks']
    parent, leaf = (parts[-2], parts[-1]) if len(parts) >= 2 else ("zsrc_agent", parts[-1])
    return "\n".join([
        f"### ICF node {path}",
        "1. SICF, hierarchy type SERVICE, execute.",
        f"2. Open /default_host/sap, create sub-element `{parent}` (type Service), then under it `{leaf}`.",
        f"3. On the Handler List tab enter `{spec.get('handler', 'ZCL_SRC_AGENT_HTTP')}`.",
        "4. Logon Data tab: standard (the agent user logs on with user and password). Activate the service (context menu, Activate Service).",
        f"5. Proof: the agent calls GET {path} and receives {{\"ok\":true}}."])


def rfc_checklist(spec: dict) -> str:
    d = spec.get("name", "ZEMAMI_TECH")
    return "\n".join([
        f"### RFC destination {d} (type 3, same system)",
        f"1. SM59, create ABAP connection `{d}`, target host this application server, system number as in SMMS.",
        f"2. Logon: the technical user `{spec.get('user', 'ZEMAMI_TECH')}`, stored password or trusted-system logon.",
        "3. Connection Test and Remote Logon must both succeed.",
        "4. Proof: the agent calls the writer function through the destination (for example a remote-enabled Z function module) and gets a result."])


def segw_alternatives(spec: dict) -> str:
    return "\n".join([
        "### SEGW project cannot be created by any API",
        "Options, in the order the agent prefers:",
        "1. **Code-based model** (what the Emami project uses): classes ZCL_*_MPC (model) and ZCL_*_DPC (data provider), registered in /IWBEP/REG_MODEL and /IWBEP/REG_SERVICE. Fully automatable.",
        "2. **Create the SEGW project by hand once**, transport it, and let the agent write the DPC_EXT code against it.",
        "3. Import an existing OData metadata file in SEGW (Data Model from File) and let the agent finish the classes."])


def gateway_checklist(spec: dict) -> str:
    return "\n".join([
        f"### OData service {spec.get('service', 'ZEMAMI_SRV')}",
        f"1. /IWBEP/REG_MODEL: technical model name `{spec.get('model', 'ZEMAMI_MDL')}`, version {spec.get('version', 1)}, model provider class `{spec.get('mpc', 'ZCL_EMAMI_MPC')}`.",
        f"2. /IWBEP/REG_SERVICE: technical service name `{spec.get('service', 'ZEMAMI_SRV')}`, version {spec.get('version', 1)}, data provider class `{spec.get('dpc', 'ZCL_EMAMI_DPC')}`, model `{spec.get('model', 'ZEMAMI_MDL')}`.",
        f"3. /IWFND/MAINT_SERVICE: Add Service, system alias `{spec.get('alias', 'LOCAL')}`, select `{spec.get('service', 'ZEMAMI_SRV')}`, assign the package, Add.",
        f"4. Proof: GET /sap/opu/odata/sap/{spec.get('service', 'ZEMAMI_SRV')}/$metadata answers 200."])


CHECKLISTS = {"gateway": gateway_checklist, "role": role_checklist, "release_strategy": release_strategy_checklist, "icf": icf_checklist,
              "rfc": rfc_checklist, "segw": segw_alternatives}


def checklist(kind: str, spec: dict) -> str:
    if kind not in CHECKLISTS:
        raise ValueError(f"no checklist for {kind}; known: {sorted(CHECKLISTS)}")
    return CHECKLISTS[kind](spec)
