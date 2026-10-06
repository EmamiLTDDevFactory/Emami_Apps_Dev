"""Policy layer. Every tool call passes through here before it touches SAP."""
from __future__ import annotations
import re
from typing import Callable, Optional
from .config import Config

VALID_NAME = re.compile(r"^(?:/[A-Z0-9_]{1,10}/)?[A-Z0-9_][A-Z0-9_]{0,29}$")        # any ABAP object name, optionally in a namespace
READ_TASKS = {"ping", "ddic_read", "dynpro_inspect", "read_table", "search", "read_source", "syntax_check", "odata_get", "bdc_validate", "capabilities", "checklist", "node_check"}
DESTRUCTIVE = {"release_transport", "delete_object"}
KINDS = {"class", "interface", "program", "package"}


class PolicyError(Exception):
    pass


class Guard:
    def __init__(self, cfg: Config, approve: Optional[Callable[[str, str], bool]] = None):
        self.cfg = cfg
        self._approve = approve

    # --- names and scope -------------------------------------------------------------------------
    def check_name(self, name: str) -> str:
        """Syntax only, plus the optional regexes you configured. There is deliberately no prefix rule:
        standard objects are protected by check_owner (package ownership), not by what the name looks like."""
        n = (name or "").upper()
        if not VALID_NAME.match(n) or len(n) > 40:
            raise PolicyError(f"'{name}' is not a valid ABAP object name (letters, digits, underscore, optional /NAMESPACE/ prefix, max 30)")
        if self.cfg.name_patterns and not any(re.fullmatch(p, n) for p in self.cfg.name_patterns):
            raise PolicyError(f"'{name}' does not match the name patterns you configured: {self.cfg.name_patterns}")
        return n

    def check_owner(self, name: str, current_package: Optional[str]):
        """An object may be created (it does not exist yet) or changed (it already lives in an allowed package).
        Anything that exists in another package, SAP standard objects included, is refused whatever its name is."""
        if current_package is None:
            return
        if current_package.upper() not in self.cfg.allowed_packages:
            raise PolicyError(f"'{name}' already exists in package '{current_package}', outside the allowed packages {self.cfg.allowed_packages}. "
                              "The agent never changes objects it does not own (this is what protects SAP standard objects).")

    def check_package(self, pkg: str) -> str:
        p = (pkg or "").upper()
        if p not in self.cfg.allowed_packages:
            raise PolicyError(f"package '{pkg}' is not in SAP_ALLOWED_PACKAGES {self.cfg.allowed_packages}")
        return p

    def check_system(self, sid: str):
        if self.cfg.allowed_sids and sid.upper() not in self.cfg.allowed_sids:
            raise PolicyError(f"system id '{sid}' is not allowed (SAP_ALLOWED_SIDS={self.cfg.allowed_sids}). The agent runs on development systems only.")

    # --- per tool ---------------------------------------------------------------------------------
    def check_write(self, what: str):
        if self.cfg.read_only:
            raise PolicyError(f"read-only mode: '{what}' is a write")

    def check_source(self, kind: str, name: str, package: str | None = None):
        if kind not in KINDS:
            raise PolicyError(f"unsupported object kind '{kind}'")
        self.check_name(name)
        if package:
            self.check_package(package)

    def check_bdc(self, tcode: str):
        if tcode.upper() not in self.cfg.bdc_tcodes:
            raise PolicyError(f"transaction '{tcode}' is not allowed for batch input. Allowed: {self.cfg.bdc_tcodes}")

    def check_table_read(self, table: str):
        """Secrets are never readable. Everything else is decided by the handler: tables on its allow-list, or tables that
        live in the agent's own packages (whatever their names)."""
        t = self.check_name(table)
        if t in [x.upper() for x in self.cfg.table_read_denylist]:
            raise PolicyError(f"table '{table}' holds secrets and is never readable")

    def check_report(self, report: str):
        self.check_name(report)

    def check_odata_path(self, path: str):
        if not path.startswith("/sap/opu/odata/") or ".." in path:
            raise PolicyError("odata_get only reaches /sap/opu/odata/")

    def check_task(self, task: str, args: dict):
        if task in READ_TASKS:
            return
        self.check_write(task)
        if task == "ddic_objects":
            for it in args.get("items", []) or []:
                self.check_name(it["name"])
                if it.get("kind") == "INDX":
                    if (it.get("table") or "").upper() not in self.cfg.index_tables:
                        raise PolicyError(f"customer indexes only on {self.cfg.index_tables}, not '{it.get('table')}'")
            if args.get("package"):
                self.check_package(args["package"])
        elif task == "message_class":
            for c in args.get("classes", []) or []:
                self.check_name(c["arbgb"])
            if args.get("package"):
                self.check_package(args["package"])
        elif task == "text_pool":
            self.check_name(args["program"])
        elif task == "job_schedule":
            self.check_name(args["job"])
            self.check_name(args["report"])
        elif task == "user_create":
            import fnmatch
            u = (args.get("user") or "").upper()
            if not u or any(fnmatch.fnmatch(u, p.upper()) for p in self.cfg.protected_users):
                raise PolicyError(f"user '{u}' is protected or empty")
            if self.cfg.user_patterns and not any(re.fullmatch(p, u) for p in self.cfg.user_patterns):
                raise PolicyError(f"user '{u}' does not match the user patterns you configured: {self.cfg.user_patterns}")
            for r in args.get("roles", []) or []:
                if any(re.fullmatch(p, r.upper()) for p in self.cfg.role_denylist):
                    raise PolicyError(f"role '{r}' is a SAP standard or powerful role ({self.cfg.role_denylist}); the agent never assigns it")
                if self.cfg.role_patterns and not any(re.fullmatch(p, r.upper()) for p in self.cfg.role_patterns):
                    raise PolicyError(f"role '{r}' does not match the role patterns you configured: {self.cfg.role_patterns}")
            if len(args.get("password") or "") and len(args["password"]) < 8:
                raise PolicyError("initial password shorter than 8 characters")
        elif task in ("testdata_material", "testdata_requisition"):
            # any material name. The handler refuses to create a material that already exists, so master data is never changed.
            self.check_name(args.get("material", ""))
        elif task in ("ddic_tables", "lock_object", "number_range", "text_ids", "stvarv", "transport_add"):
            for t in args.get("tables", []) or []:
                self.check_name(t["name"])
            if args.get("name"):
                self.check_name(args["name"])
            if args.get("package"):
                self.check_package(args["package"])
        elif task == "bdc_run":
            self.check_bdc(args["tcode"])
            self.require_validated(args)
        elif task == "run_report":
            self.check_report(args["report"])
        elif task in DESTRUCTIVE:
            self.require_approval(task, str(args))

    # --- approval ---------------------------------------------------------------------------------
    def require_approval(self, action: str, detail: str):
        mode = self.cfg.approval
        if mode == "auto":
            return
        if mode == "prompt" and self._approve and self._approve(action, detail):
            return
        raise PolicyError(f"'{action}' needs human approval and none was given")

    def check_release(self, request: str):
        if not self.cfg.allow_release:
            raise PolicyError("releasing transports is disabled (SAP_ALLOW_RELEASE=false). A human releases transports.")
        self.require_approval("release_transport", request)

    # --- batch input must be validated against the real screens before it runs ---------------------
    def require_validated(self, args: dict):
        """A step list is validated by the handler (bdc_validate) before bdc_run; ToolBox records the fingerprint."""
        if getattr(self, "_validated", None) is None:
            self._validated = set()
        fp = self.fingerprint(args)
        if self.cfg.bdc_require_validation and fp not in self._validated:
            raise PolicyError("run sap_bdc_validate with exactly these steps first (no unvalidated batch input)")

    @staticmethod
    def fingerprint(args: dict) -> str:
        import hashlib, json
        steps = [{"p": (s.get("program") or "").upper(), "d": s.get("dynpro"), "f": sorted((f["n"] if isinstance(f, dict) else f) for f in (s.get("fields") or []))} for s in args.get("steps", [])]
        return hashlib.sha1(json.dumps([args.get("tcode", "").upper(), steps], sort_keys=True).encode()).hexdigest()

    def mark_validated(self, args: dict):
        if getattr(self, "_validated", None) is None:
            self._validated = set()
        self._validated.add(self.fingerprint(args))
