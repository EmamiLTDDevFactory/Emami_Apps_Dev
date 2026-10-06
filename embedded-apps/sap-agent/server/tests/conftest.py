import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pytest
from sap_agent.config import Config
from sap_agent.guard import Guard
from sap_agent.audit import Audit


class FakeAdt:
    user = "AGENT"

    def __init__(self):
        self.calls, self.sources = [], {}
        # (kind, NAME) -> package. Preloaded with SAP standard objects, so ownership checks have something to protect.
        self.pkg = {("class", "CL_ABAP_TSTMP"): "SABP_UTILS", ("class", "CL_STANDARD"): "SABP", ("class", "CL_BAD"): "SABP",
                    ("program", "SAPMM06E"): "MEPO", ("interface", "IF_HTTP_EXTENSION"): "SIHTTP"}
        self.activation_errors, self.csrf = False, ""

    @property
    def objects(self):
        return set(self.pkg)

    def package_of(self, kind, name):
        return self.pkg.get((kind, name.upper()))

    def package_exists(self, name):
        return self.package_of("package", name) is not None

    def exists(self, kind, name):
        return (kind, name.upper()) in self.pkg

    def create(self, kind, name, description, package, transport="", extra=None, auto_transport=False):
        self.calls.append(("create", kind, name.upper(), package, transport))
        self.pkg[(kind, name.upper())] = package.upper()

    def write_source(self, kind, name, source, transport="", package=""):
        self.calls.append(("write", kind, name.upper()))
        self.sources[(kind, name.upper())] = source
        return transport

    def read_source(self, kind, name):
        return self.sources.get((kind, name.upper()), "REPORT x.")

    def activate(self, objs):
        self.calls.append(("activate", [n for _, n in objs]))
        return [{"type": "E", "text": "boom"}] if self.activation_errors else []

    def syntax_check(self, kind, name):
        return []

    def run_unit_tests(self, objs):
        return {"ok": True, "tests": 3, "failures": []}

    def create_transport(self, description, target="", package=""):
        self.calls.append(("transport", description))
        return "DEVK900001"

    def release_transport(self, r):
        self.calls.append(("release", r))

    def search(self, q, n=50):
        return []

    def odata_get(self, path):
        return 200, "<EntitySet Name='RfqSet'/><EntitySet Name='AuctionSet'/><EntitySet Name='AuctionRoomSet'/><FunctionImport Name='PlaceBid'/>"

    def write_test_include(self, class_name, source, transport=""):
        self.calls.append(("test_include", class_name.upper()))


class FakeSapx:
    def node_alive(self):
        return self.alive

    def __init__(self, sid="DEV"):
        self.sid, self.calls, self.unknown_fields, self.rows, self.alive = sid, [], [], {}, True

    def call(self, task, args=None):
        self.calls.append((task, args))
        if task == "ping":
            return {"sid": self.sid, "client": "100", "release": "740", "user": "AGENT"}
        if task == "bdc_validate":
            return {"valid": not self.unknown_fields, "unknown": self.unknown_fields}
        if task == "read_table":
            return self.rows.get(args.get("table"), [])
        return {"done": task}


@pytest.fixture
def cfg(tmp_path):
    return Config(host="https://x", user="AGENT", allowed_sids=["DEV"], allowed_packages=["ZSRC"], approval="deny", audit_file=str(tmp_path / "audit.jsonl"),
                  bdc_tcodes=["ME41", "SE11"], index_tables=["EKKO", "EKPO"])   # configured lists; anything else asks a human (denied here)


@pytest.fixture
def parts(cfg):
    return Guard(cfg), FakeAdt(), FakeSapx(), Audit(cfg.audit_file)
