# SAP backend code: Gateway service ZMM_MDM_SRV

All ABAP of the replacement for `/INOWITS/MM_CREATE_PROC`: types, exception, naming, staging access, request service, workflow wrapper, field control, validator, poster, functions, value helps, the Gateway classes (DPC and MPC extensions) and unit tests, with the model (`segw/`).

**State: written without access to a SAP system. Nothing has been compiled, activated or run.** Expect syntax corrections, mostly where the code uses data elements and function module parameters taken from the existing code and from the dictionary extracts, not from the system. Start with the checklist at the end.

## Objects (package ZMM_MDM) and what each one does

| Object | Type | Purpose | State |
| --- | --- | --- | --- |
| `ZIF_MM_MDM_TYPES` | interface | Shared types and constants: messages, start input, routing keys, allowed actions, status values | Complete |
| `ZCX_MM_MDM` | exception class | Carries all messages of a failed operation | Complete |
| `ZCL_MM_MDM_NAMING` | class | Entity and set to staging table and keys, name conversion, ID padding, tables of a draft delete | Complete |
| `ZCL_MM_MDM_STAGING` | class | Generic read, merge, delete and copy for the 19 staging entities | Complete |
| `ZCL_MM_MDM_FIELD_CONTROL` | class | `GetFieldControl`: `MDM_MCN` latest version, `MM_FELD` override by department and level | Complete; HD reading to test |
| `ZCL_MM_MDM_REQUEST_SVC` | class | Header, ID under lock, start request, routing keys, allowed actions, list, delete draft | Complete; authorization check to add |
| `ZCL_MM_MDM_WORKFLOW` | class | Submit, approve, send back, reject, forward through `/INOWITS/CL_WF` as the real user | Complete; mail sending and forward type to confirm |
| `ZCL_MM_MDM_VALIDATOR` | class | Validator framework, generic mandatory check, header, weights and numbers | Framework and 3 groups; the other groups come from the catalogue |
| `ZCL_MM_MDM_POSTER` | class | Final posting in the order of `STND_UPDATE` | Outline with steps |
| `ZCL_MM_MDM_FUNCTIONS` | class | Description builder, HSN ranking, duplicate check (first version) | Complete; phonetic key to add |
| `ZCL_MM_MDM_VALUEHELP` | class | Standard lists, description hierarchy, domain fixed values | 10 standard lists, hierarchy, domains; OVS lists and check tables to add |
| `ZCL_ZMM_MDM_SRV_DPC_EXT` | class | Gateway data provider: all entity sets and function imports | Complete |
| `ZCL_ZMM_MDM_SRV_MPC_EXT` | class | Model extension (conversion exits) | Skeleton |
| `ZCL_MM_MDM_TEST` | test class | Unit tests for naming, keys, description, copy | Complete |

## Create in this order

1. Package `ZMM_MDM` and a transport.
2. `ZIF_MM_MDM_TYPES`, `ZCX_MM_MDM`, `ZCL_MM_MDM_NAMING`, `ZCL_MM_MDM_STAGING` (they depend on nothing else). Run `ZCL_MM_MDM_TEST` here.
3. `ZCL_MM_MDM_FIELD_CONTROL`, `ZCL_MM_MDM_FUNCTIONS`, `ZCL_MM_MDM_VALUEHELP`.
4. `ZCL_MM_MDM_REQUEST_SVC` and `ZCL_MM_MDM_WORKFLOW` (they refer to each other's static methods: create both with empty bodies first if the editor complains, then fill them in).
5. `ZCL_MM_MDM_VALIDATOR`, `ZCL_MM_MDM_POSTER`.
6. SEGW project `ZMM_MDM_SRV`: import `segw/metadata.xml`, generate. This creates `ZCL_ZMM_MDM_SRV_MPC`, `_MPC_EXT`, `_DPC`, `_DPC_EXT` and registers the service.
7. Paste `ZCL_ZMM_MDM_SRV_DPC_EXT` and `ZCL_ZMM_MDM_SRV_MPC_EXT` over the generated extension classes.
8. Activate the service (`/IWFND/MAINT_SERVICE`), test in `/IWFND/GW_CLIENT`: `GetSession`, `RequestSet`, `GetFieldControl?MaterialType='FERT'&Level='L0'`.

## What to check first (likely compile corrections)

- Data element and type names used in signatures: `/INOWITS/WF_LEVEL`, `/INOWITS/WF_GEN_FIELD4`, `/INOWITS/TRANSID`, `/INOWITS/WF_MSG_TT`, `/INOWITS/M_AGENT_TT`, `/INOWITS/M_MAIL_ID_TT`, `/INOWITS/WF_CONTAINER_TT`, `/INOWITS/SWR_MESSAG_TT`.
- Field names of the tables read in `ZCL_MM_MDM_REQUEST_SVC`: `/INOWITS/WF_CONS` (`MTART`, `RQ_MATKL`, `RQ_BUSINESS`), `MM_MARA` (`MATKL`, `ZBUSINESS`, `ZZBRAND_CODE`), `/INOWITS/M_TRANS` (`USER_ID`, `TOP_WI_ID`, `OBJ_VALUE`, `DUPLICATE`).
- Parameters of `/INOWITS/M_TRANSID_GENERATE` (taken from its source) and `ENQUEUE_E_TABLE`.
- Generated type names in the MPC class: `TS_<ENTITY>`, `TT_<ENTITY>`, `TS_MESSAGE`, `TS_STARTRESULT` and so on.
- `ADD_MESSAGE_TEXT_ONLY` parameters of the message container in `raise_messages`.

## Behavior decisions built in

- **Validate** rolls the change set back itself after validating, so it never stores data.
- **Submit** runs the validator first; any error stops everything and returns all messages together. Then: workflow simulation, start, complete the initiator step (as the old `SUBMIT` does). After send back it calls `RE_SUBMIT`.
- **Approve** at a level that is not the last calls `MAT_COMPLETE`. At the last level it posts first, then calls `COMPLETE`.
- **Routing keys**: plant and brand code are passed at create submit only, as today. Change and send back are not part of this package.
- **Delete draft** clears 28 tables, not the 18 that the old screen clears (the extra ones are listed in `ZCL_MM_MDM_NAMING=>DELETE_TABLES`); to confirm.
- **ID generation** runs under a table lock and commits before the lock is released. Also put the lock inside `/INOWITS/M_TRANSID_GENERATE`, so the old app cannot draw the same number during the parallel run.
- The workflow class commits by itself; it is always the last step of an action.

## Not in this package

Mail sending after workflow actions (`SEND_APPR_MAIL`, `APPR_MAIL`), attachments and comments, the check-table value helps and the 29 OVS lists, the validator groups beyond the first three, the posting steps, change and extension flows, the authorization check of the start screen. Each has a row in `MM_logic_coverage_matrix.xlsx`.
