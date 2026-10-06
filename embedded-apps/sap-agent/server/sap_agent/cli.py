from __future__ import annotations
import argparse
import json
import sys

from .adt import AdtClient
from .agent import Agent
from .audit import Audit
from .config import Config
from .deploy import Deployer, Manifest
from .guard import Guard
from .sapx import SapxClient
from .tools import ToolBox


def _approve(action: str, detail: str) -> bool:
    print(f"\nAPPROVAL NEEDED: {action}\n{detail[:800]}")
    return input("Approve? type 'yes': ").strip().lower() == "yes"


def build(cfg: Config):
    audit = Audit(cfg.audit_file, actor=cfg.user or "agent")
    guard = Guard(cfg, _approve)
    adt = AdtClient(cfg.host, cfg.client, cfg.user, cfg.password, cfg.verify_ssl)
    sapx = SapxClient(cfg.host, cfg.client, cfg.user, cfg.password, cfg.handler_path, cfg.verify_ssl)
    return audit, guard, adt, sapx


def doctor(cfg: Config) -> int:
    audit, guard, adt, sapx = build(cfg)
    ok = True
    print(f"Checking {cfg.host} client {cfg.client} as {cfg.user}")
    try:
        disc = adt.discovery()
        need = {"classes": "/sap/bc/adt/oo/classes", "interfaces": "/sap/bc/adt/oo/interfaces", "programs": "/sap/bc/adt/programs/programs",
                "packages": "/sap/bc/adt/packages", "activation": "/sap/bc/adt/activation", "check runs": "/sap/bc/adt/checkruns",
                "transports": "/sap/bc/adt/cts/transportrequests", "ABAP Unit": "/sap/bc/adt/abapunit/testruns"}
        for label, href in need.items():
            found = any(h.startswith(href) for h in disc)
            print(f"  ADT {label:12s} {'yes' if found else 'MISSING'}")
            ok &= found
    except Exception as e:
        print(f"  ADT discovery failed: {e}\n  -> activate /sap/bc/adt in SICF, check the user's S_ADT_RES authorisation")
        return 1
    try:
        info = sapx.call("ping")
        guard.check_system(info.get("sid", ""))
        print(f"  Task handler  yes: system {info.get('sid')}, release {info.get('release')}, user {info.get('user')}, ABAP {info.get('abap', '?')}")
    except Exception as e:
        print(f"  Task handler  MISSING or refused: {e}\n  -> run: sap-agent bootstrap   (then create the ICF node, see abap_bootstrap/README.md)")
        ok = False
    print("Ready." if ok else "Not ready: fix the items above.")
    return 0 if ok else 2


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="sap-agent")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor")
    b = sub.add_parser("bootstrap"); b.add_argument("--manifest", default="abap_bootstrap/manifest.yaml")
    d = sub.add_parser("deploy"); d.add_argument("manifest"); d.add_argument("--only"); d.add_argument("--dry-run", action="store_true")
    d.add_argument("--keep-going", action="store_true"); d.add_argument("--repair", action="store_true", help="let the AI agent fix failing steps")
    d.add_argument("--agent", action="store_true", help="let the AI agent run steps of type agent")
    r = sub.add_parser("run"); r.add_argument("task"); r.add_argument("--context", help="file with extra project context")
    sub.add_parser("capabilities", help="what can be automated, assisted or must stay manual")
    i = sub.add_parser("inspect"); i.add_argument("program"); i.add_argument("dynpro")
    rl = sub.add_parser("release"); rl.add_argument("request")
    args = p.parse_args(argv)
    cfg = Config.from_env()
    if args.cmd == "doctor":
        return doctor(cfg)
    if args.cmd == "capabilities":
        from .capabilities import REGISTRY
        for k, v in REGISTRY.items():
            print(f"{v['tier']} {v['maturity']:9s} {k:26s} {v['how']}")
        return 0
    audit, guard, adt, sapx = build(cfg)
    if args.cmd in ("deploy", "bootstrap"):
        m = Manifest.load(args.manifest)
        repair = None
        if getattr(args, "repair", False):
            import anthropic
            ag = Agent(anthropic.Anthropic(), cfg.model, ToolBox(guard, adt, sapx, audit, _approve), audit, cfg.max_steps)
            repair = lambda step, err: ag.run(f"Deployment step '{step}' failed with: {err}\nFind the cause in the ABAP source or setup and fix it with the tools. Do not release anything.", print).stopped == "end_turn"
        runner = None
        if getattr(args, "agent", False) or repair:
            import anthropic
            ag2 = Agent(anthropic.Anthropic(), cfg.model, ToolBox(guard, adt, sapx, audit, _approve), audit, cfg.max_steps)
            runner = lambda prompt: ag2.run(prompt, print).stopped == "end_turn"
        res = Deployer(m, guard, adt, sapx, audit, repair, agent_runner=runner).run(getattr(args, "only", None), getattr(args, "dry_run", False), getattr(args, "keep_going", False))
        bad = [x for x in res if not x.ok]
        if any(x.manual for x in res):
            todo = Deployer.todo_markdown(res)
            open("MANUAL_TODO.md", "w", encoding="utf-8").write(todo)
            print(f"\n{sum(1 for x in res if x.manual)} step(s) need a human: see MANUAL_TODO.md")
        print(json.dumps([{"id": x.id, "ok": x.ok} for x in res]))
        return 1 if bad else 0
    if args.cmd == "run":
        import anthropic
        ctx = open(args.context, encoding="utf-8").read() if args.context else ""
        ag = Agent(anthropic.Anthropic(), cfg.model, ToolBox(guard, adt, sapx, audit, _approve), audit, cfg.max_steps, ctx)
        out = ag.run(args.task, print)
        print("\n=== result (" + out.stopped + ", " + str(out.steps) + " steps) ===\n" + out.final_text)
        return 0 if out.stopped == "end_turn" else 1
    if args.cmd == "inspect":
        print(json.dumps(sapx.call("dynpro_inspect", {"program": args.program, "dynpro": args.dynpro}), indent=2))
        return 0
    if args.cmd == "release":
        guard.check_release(args.request)
        adt.release_transport(args.request)
        print("released", args.request)
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
