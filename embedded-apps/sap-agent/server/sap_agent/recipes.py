"""Prompts for the steps the agent does by discovery (batch input). Each tells the model how to proceed, how to prove it
worked, and when to stop and hand over a checklist instead of guessing."""
from __future__ import annotations
import json

COMMON = """Rules for this task:
- Call sap_ping first. Work only through the tools.
- Use sap_dynpro_inspect to read the REAL screens (program, screen number, field names) of every transaction you drive.
  Never guess a screen number or field name.
- Before any sap_bdc_run, call sap_bdc_validate with the same steps (values may differ). Fix every unknown field first.
- After running, prove the result with the read-back named below. If the read-back fails after two honest attempts,
  stop, call sap_manual_checklist with the same specification, and report exactly what a human must do. Do not loop.
- Never release a transport and never delete anything.
"""


def gateway(spec: dict) -> str:
    return f"""Register and activate this OData service on the system.
Model provider class {spec['mpc']}, data provider class {spec['dpc']}.
Technical model name {spec['model']} version {spec.get('version', 1)}, technical service name {spec['service']} version {spec.get('version', 1)}, package {spec.get('package', 'ZEMAMI')}.
Steps: /IWBEP/REG_MODEL, then /IWBEP/REG_SERVICE, then /IWFND/MAINT_SERVICE (Add Service, system alias {spec.get('alias', 'LOCAL')}, this service).
Read-back: sap_odata_get /sap/opu/odata/sap/{spec['service']}/$metadata must answer 200 and contain the entity sets {spec.get('expect', [])}.
{COMMON}"""


def role(spec: dict) -> str:
    return f"""Create the PFCG role {spec['name']} ({spec.get('description', '')}) with this specification:
{json.dumps({k: spec[k] for k in ('tcodes', 'auth_objects') if k in spec}, indent=1)}
Drive PFCG by batch input: create single role, add the transactions on the menu, maintain the authorization objects with these field values, generate the profile.
Read-back: sap_read_table AGR_DEFINE where agr_name = '{spec['name']}' returns a row.
{COMMON}"""


def release_strategy(spec: dict) -> str:
    return f"""Create a purchase order release strategy: {json.dumps(spec, indent=1)}
Use the classification and release customizing transactions (OMGQ, OMGSCK) by batch input after reading their screens.
Read-back: sap_read_table T16FS where frggr = '{spec.get('group', '01')}' returns the strategy.
{COMMON}"""


def rfc(spec: dict) -> str:
    return f"""Create the ABAP-connection RFC destination {spec['name']} to this same system for the technical user {spec.get('user', 'ZEMAMI_TECH')} in SM59 (batch input).
Never write a password into the audit trail or into your messages: take it from the task arguments only if given; otherwise stop and ask for a human to store the logon.
{COMMON}"""


def vendor(spec: dict) -> str:
    return f"""Create the test vendor {json.dumps(spec)} with XK01 by batch input. Test vendors only (name starts with ZTEST).
Read-back: sap_read_table LFA1 where name1 = '{spec.get('name1', '')}' returns the vendor number.
{COMMON}"""


RECIPES = {"gateway": gateway, "role": role, "release_strategy": release_strategy, "rfc": rfc, "vendor": vendor}
