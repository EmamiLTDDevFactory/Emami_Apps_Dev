# sap-agent: build SAP ABAP projects end to end with an AI agent

> In this repo: the engine behind the **SAP Agent** embedded app (`embedded-apps/sap-agent`). `sap_agent/` is unchanged;
> `sap_agent_web/` adds the admin-only web API (see `../README.md`). The CLI below still works.

The agent creates, changes, checks, tests and activates ABAP objects on a SAP ECC **development** system, runs the
customizing steps around them, proves each result by reading it back, and repairs its own errors. Nobody edits in SE24, SE11 or SE80.

| Mode | Command | Needs the LLM | Use for |
|---|---|---|---|
| Deploy | `sap-agent deploy projects/emami_sourcing/manifest.yaml` | No | A known project: package, tables, lock object, number ranges, texts, classes, activation, unit tests, jobs, test data |
| Agent | `sap-agent run "<task in words>"` | Yes | Any new ABAP task: write a class, fix a dump, add a field, build a report, test a service |
| Hybrid | `sap-agent deploy ... --agent --repair` | Yes, only when needed | Assisted steps (roles, release strategy, service registration) and automatic repair of a failing step |
| Capabilities | `sap-agent capabilities` | No | The live list of what is automated, assisted or manual |

## How it reaches SAP

```
 sap-agent (Python, your laptop or CI)
   |-- ADT REST  /sap/bc/adt/...        classes, interfaces, programs, packages, test includes, syntax check,
   |                                    activation, ABAP Unit, transports, search      (what Eclipse uses)
   |-- Task handler /sap/zsrc_agent/tasks   DDIC objects, lock objects, number ranges, text IDs, STVARV, message classes,
   |       ZCL_SRC_AGENT_HTTP             text pools, jobs, users, test data, dynpro inspection and validation,
   |                                      batch input, run Z reports, read allowed tables
   |-- Gateway  /sap/opu/odata/...      test the service that was just built
   +-- Claude API                       plans, writes ABAP, reads SAP error messages, fixes
```

ADT cannot create DDIC objects, number ranges, text IDs or run batch input on ECC 7.40, so the small handler class does.
It is installed by the agent itself through ADT.

## One-time setup (about 15 minutes, once per system)

1. **User and roles** (admin): a technical user `ZSRC_AGENT` with a role `Z_SRC_AGENT`. The role needs `S_DEVELOP`
   (create and change, restricted to package ZSRC and object types CLAS, INTF, PROG, DEVC), `S_ADT_RES`, `S_CTS_ADMI` /
   `S_TRANSPRT` for create and change of requests (no release), and `S_TCODE` for the batch input transactions.
   No authorisation on production or business data beyond display of the tables the handler may read.
2. **ADT**: activate the ICF service `/sap/bc/adt` (SICF). Check `https://host/sap/bc/adt/discovery` answers.
3. `cp .env.example .env`, fill host, client, user and password, `SAP_ALLOWED_SIDS=<your dev system id>`, `ANTHROPIC_API_KEY`.
4. `pip install -e .` then `sap-agent bootstrap`. This creates package ZSRC, a transport and the two handler classes through ADT.
5. **The only manual step**: in SICF create the node `/sap/zsrc_agent/tasks` with handler list `ZCL_SRC_AGENT_HTTP`
   (2 minutes; there is no stable API for it on ECC). In STVARV add two select-options: `ZSRC_AGENT_SIDS` with your system id and
   `ZSRC_AGENT_PACKAGES` with the package(s) the agent may work in (for example ZSRC). Optional: parameter `ZSRC_AGENT_ROLE` if your agent role
   is not called `Z_SRC_AGENT`. Assign that role to the agent user.
6. `sap-agent doctor`. It checks every ADT endpoint family and the handler, and prints what is missing.

## Build the whole Emami back end

```
sap-agent deploy projects/emami_sourcing/manifest.yaml --dry-run      # shows the plan, touches nothing
sap-agent deploy projects/emami_sourcing/manifest.yaml --agent --repair
```

In order: package, transport, the two custom tables, lock object, number ranges, text IDs; 13 ABAP objects written and mass-activated;
a customer index on EKKO; the auction timer job; ABAP Unit tests for `ZCL_SRC_UTIL` written, activated and run; GST tax-code parameters;
test material, requisition and vendor; test user; PFCG roles; PO release strategy; RFC destination `ZSRC_TECH`; a check of the SICF node;
OData service registration; correction of the ME41/ME47 batch input from the real screens; final `$metadata` check.
Every failing step is handed to the agent with the SAP message and retried once. Whatever the agent cannot finish lands in `MANUAL_TODO.md`.

## Any other task

```
sap-agent run "Add a method get_open_rfq_count to ZCL_SRC_RFQ_SRV that counts RFQs with status open, with an ABAP Unit test"
sap-agent run "ST22 shows a dump in ZCL_SRC_AUC_SRV->place_bid when two vendors bid in the same millisecond. Find and fix it" --context sap/docs/01_PLAN.md
sap-agent run "Create report ZSRC_RFQ_AGING that lists open RFQs older than 30 days, with a selection screen for plant and text elements"
```

The agent searches, reads the source, writes the change, syntax-checks, activates the related objects together, runs ABAP Unit,
reads each error and fixes it. It stops after the same failing call three times, or after `AGENT_MAX_STEPS`.

## What the agent can build: three levels

| Level | Meaning | Examples |
|---|---|---|
| **automated** | A standard API does it, and the agent proves it by reading it back | tables, domains, data elements, table types, customer indexes on EKKO and EKPO, lock objects, number ranges, message classes, text IDs, STVARV, program texts, ABAP Unit test classes, background jobs, users with roles, test materials and requisitions, classes, interfaces, programs |
| **assisted** | The AI reads the real screens, validates the batch input against them, runs it, and proves the result by read-back. If it cannot prove it, a checklist for a human is produced | OData service registration, PFCG roles, release strategy, RFC destination, test vendors |
| **manual** | No safe programmatic route on ECC. The agent checks the state and writes exact steps | the SICF node, SEGW projects, SSO and certificates, STMS, releasing transports to QA or production |

How the assisted path works, and why it is safer than "the model clicks around":
1. `sap_dynpro_inspect` reads the real screen definition (no guessed screen numbers or field names).
2. `sap_bdc_validate` checks every field of the planned batch input against those screens. The guard **refuses `sap_bdc_run`**
   unless the same fields were validated first.
3. `sap_bdc_run` returns the system messages, each tagged with the screen it came from, so a failure points at the cause.
4. The step is only "done" when a **read-back** from SAP finds the object (`AGR_DEFINE`, `T16FS`, `$metadata`, ...).
   A model saying it succeeded is never the proof. If the read-back fails, the step becomes a manual to-do with a generated checklist.

After every deploy the agent writes `MANUAL_TODO.md` with the exact steps for each item it could not finish. After a human does
one, `sap-agent deploy <manifest> --only <step id>` proves it.

**Names.** You choose every name. If an object with that name already exists in another package, for example a SAP standard class, the agent refuses and says why; it never decides by looking at the first letters.

**Why SEGW is not on the automated list.** Gateway projects have no API. The agent builds the code-based OData model
(classes ZCL_*_MPC and ZCL_*_DPC) and registers it. That is fully automatable and gives the same service.

## Safety, enforced in code (not by the prompt)

| Rail | Where |
|---|---|
| Only the system ids you list; refuses to start on any other (so never production) | `guard.check_system`, and again in the SAP handler |
| **No name prefix rules.** Any valid ABAP name is allowed, for objects, users, roles, jobs, message classes, indexes, test data | `guard.check_name` checks syntax only |
| **Ownership instead of prefixes.** The agent creates objects only in the packages you list, and refuses to change any object that already exists in another package, whatever its name. This is what protects SAP standard objects | `guard.check_owner` with `adt.package_of`; handler `check_object` against TADIR and `ZSRC_AGENT_PACKAGES` |
| Reports, jobs and program texts only for programs that live in the agent's packages | handler `program_allowed` |
| Tables: secrets (`USR02`, `RFCDES`, `SECSTORE`, ...) never readable; others only from the allow-list or the agent's own packages | `guard`, handler |
| Users: any name except protected ones (`DDIC`, `SAP*`, `SAPSYS`, `TMSADM`, ...); standard roles (`SAP_*`, `S_A.*`) never assigned; existing users never overwritten; initial password at least 8 characters, masked in the audit log | `guard`, handler |
| Test materials: any name, but an existing material is never changed | handler |
| Existing text IDs and STVARV parameters are never overwritten unless the request says so (and a human approves) | handler |
| Customer indexes only on tables in `index_tables` (EKKO, EKPO) | `guard`, handler |
| Optional: your own name, user or role regexes (`SAP_NAME_PATTERNS`, `SAP_USER_PATTERNS`, `SAP_ROLE_PATTERNS`) if you want to restrict names | `config` |
| Batch input only for listed transactions, and only after `sap_bdc_validate` on the same fields | `guard.require_validated` |
| Releasing transports is off by default and always needs a typed human approval | `guard.check_release` |
| Table reads only from a list, WHERE clause filtered, no sub-selects | `guard`, handler |
| Read-only mode | `SAP_READ_ONLY=true` |
| The SAP user needs role `Z_SRC_AGENT`; the handler checks it on every call | handler `guard` |
| Every tool call and result is written to `audit.jsonl` with secrets masked | `audit.py` |
| Hard step limit and stuck detection | `agent.py` |

The model cannot override these: they run before a tool touches SAP.

## What is still outside the agent

1. **Once per system**: the SICF node, the agent user and its role, and the STVARV entries that name your system and packages (see setup). The agent then *checks* the node and tells you if it is missing.
2. **Transports to QA and production are released by a human.** The agent builds in DEV and stops.
3. **SSO, certificates, network, STMS routes, profile parameters**: security and basis teams.
4. **Assisted steps need a review the first time.** Batch input on PFCG, OMGQ and SM59 differs by release and by customizing.
   Treat the first run on each system as supervised.
5. **Written without a SAP system.** ADT media types, several function module parameters in the handler (`DDIF_*`, `NUMBER_RANGE_*`,
   `TR_OBJECT_INSERT`, `RPY_DYNPRO_READ`, `JOB_*`, `BAPI_USER_*`, `BAPI_MATERIAL_SAVEDATA`) and the batch input flows come from
   memory. `sap-agent doctor` and the `--repair` loop exist for this, but the first run needs someone watching.
6. **An AI that writes to SAP is a risk.** Use only a development client you can restore, with the narrow role above, and read
   `audit.jsonl` and the transport before moving anything on.

## Layout

```
sap_agent/   config, guard (policy), audit, adt (ADT client), sapx (handler client), tools (tool schemas and dispatch),
             agent (LLM loop), deploy (manifest runner), cli, capabilities (automated, assisted or manual),
             checklists (generated human steps), recipes (prompts for assisted steps)
abap_bootstrap/   ZCL_SRC_AGENT_HTTP, ZCL_SRC_AGENT_TASKS, manifest.yaml (installs them)
projects/emami_sourcing/   manifest.yaml, ddic/tables.json, abap_tests/
tests/       78 tests: policy, ADT XML, deploy order and failure handling, tools, agent loop with a scripted model,
             Tier A and B steps, the validation gate, manual to-do generation, read-back proof
```

Run the tests: `pip install -e ".[dev]" && pytest`.

## Adding a project

Copy `projects/emami_sourcing/manifest.yaml`, change the package and file list. Step types: `package`, `transport`,
`ddic_tables`, `lock_object`, `number_range`, `text_ids`, `stvarv`, `sources`, `activate`, `unit_tests`, `run_report`, `bdc`,
`verify_odata`, `agent` (a prompt for the AI agent), `note`; Tier A: `ddic_objects`, `message_class`, `text_pool`,
`test_include`, `job`, `user`, `testdata`; Tier B: `gateway`, `role`, `release_strategy`, `rfc`, `icf`.
