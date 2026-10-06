from __future__ import annotations
import os
from dataclasses import dataclass, field


def _list(v: str) -> list[str]:
    return [x.strip().upper() for x in (v or "").split(",") if x.strip()]


def _regexes(v: str) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


def _bool(v: str | None, default=False) -> bool:
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Config:
    host: str = ""
    client: str = "100"
    user: str = ""
    password: str = ""
    verify_ssl: bool = True
    allowed_sids: list[str] = field(default_factory=list)
    allowed_packages: list[str] = field(default_factory=lambda: ["ZEMAMI"])
    read_only: bool = False
    allow_release: bool = False
    approval: str = "prompt"          # prompt | deny | auto
    model: str = "claude-sonnet-5-5"
    max_steps: int = 60
    audit_file: str = "./audit.jsonl"
    handler_path: str = "/sap/zsrc_agent/tasks"
    handler_mode: str = "adt"         # adt: through ABAP Unit of ZCL_SRC_AGENT_RUN (no SICF) | http: the ICF node handler_path
    bdc_require_validation: bool = True       # batch input must pass bdc_validate first
    index_tables: list[str] = field(default_factory=list)   # customer indexes on these tables need no approval; others ask a human
    # --- naming: NO prefix rules by default. Any valid ABAP name is allowed. What protects SAP standard objects is ownership:
    # the agent only creates objects in allowed_packages and refuses to change an existing object that lives elsewhere.
    # Add regexes here only if YOU want to restrict names (for example your own namespace).
    name_patterns: list[str] = field(default_factory=list)
    user_patterns: list[str] = field(default_factory=list)
    role_patterns: list[str] = field(default_factory=list)
    protected_users: list[str] = field(default_factory=lambda: ["DDIC", "SAPSYS", "TMSADM", "EARLYWATCH", "SAPCPIC", "SAP*"])
    role_denylist: list[str] = field(default_factory=lambda: [r"SAP_.*", r"S_A\..*"])      # standard authorization roles are never assigned
    table_read_denylist: list[str] = field(default_factory=lambda: ["USR02", "USH02", "USH04", "USRPWDHISTORY", "RFCDES", "SECSTORE", "USR40"])
    # batch input on these transactions runs without asking; any other one asks a human (basis/user admin is refused by the handler)
    bdc_tcodes: list[str] = field(default_factory=lambda: [
        "/IWBEP/REG_MODEL", "/IWBEP/REG_SERVICE", "/IWFND/MAINT_SERVICE", "SNRO", "SE11", "SE75", "SM59"])
    read_tables: list[str] = field(default_factory=lambda: [
        "TVARVC", "T001", "T001W", "T024", "T024E", "T134", "T023", "TTXID", "TTXOB", "EKKO", "EKPO", "EKET", "EBAN",
        "LFA1", "ADR6", "AGR_USERS", "CVERS", "TADIR", "DD02L", "DD03L", "TRDIR",
        "AGR_DEFINE", "T16FG", "T16FS", "TBTCO", "USR21", "ICFSERVICE"])

    @classmethod
    def from_env(cls) -> "Config":
        e = os.environ
        return cls(
            host=e.get("SAP_HOST", "").rstrip("/"), client=e.get("SAP_CLIENT", "100"), user=e.get("SAP_USER", ""),
            password=e.get("SAP_PASSWORD", ""), verify_ssl=_bool(e.get("SAP_VERIFY_SSL"), True),
            allowed_sids=_list(e.get("SAP_ALLOWED_SIDS", "")), allowed_packages=_list(e.get("SAP_ALLOWED_PACKAGES", "ZEMAMI")),
            read_only=_bool(e.get("SAP_READ_ONLY")), allow_release=_bool(e.get("SAP_ALLOW_RELEASE")),
            approval=e.get("SAP_APPROVAL", "prompt"), model=e.get("AGENT_MODEL", "claude-sonnet-5-5"),
            max_steps=int(e.get("AGENT_MAX_STEPS", "60")), handler_mode=(e.get("SAP_HANDLER_MODE") or "adt").lower(), audit_file=e.get("AUDIT_FILE", "./audit.jsonl"),
            name_patterns=_regexes(e.get("SAP_NAME_PATTERNS", "")), user_patterns=_regexes(e.get("SAP_USER_PATTERNS", "")),
            role_patterns=_regexes(e.get("SAP_ROLE_PATTERNS", "")),
            **({"bdc_tcodes": _list(e["SAP_BDC_TCODES"])} if e.get("SAP_BDC_TCODES") else {}),
            **({"index_tables": _list(e["SAP_INDEX_TABLES"])} if e.get("SAP_INDEX_TABLES") else {}),
            **({"role_denylist": _regexes(e["SAP_ROLE_DENYLIST"])} if e.get("SAP_ROLE_DENYLIST") else {}))
