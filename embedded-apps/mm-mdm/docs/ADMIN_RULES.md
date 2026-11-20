# Admin: Rules maintenance (rebuild of /INOWITS/MDM_CONFIG)

Live on SAP EDS (client 900) as `ZCL_MM_MDM_ADM_RULES` (source: `docs/sap-eds/ZCL_MM_MDM_ADM_RULES.abap`), called through the generic
`AdminCall` entity of `ZMM_MDM_SRV_SRV` and the hub route `POST /api/me/mm-mdm-admin/RULES/<op>`.
Screen: `/admin/rules` (`components/admin/RulesScreen.tsx`, `components/admin/rules/*`, client `lib/admin/rulesApi.ts`, CSS block `/* admin: rules */`).

## What it does
1. **Default value rules** (RULE_AP screens, RULE_H rule sets, RULE_I rules), like MAINTAIN_RULES: choose application, screen, then create / rename / delete rule sets and edit their rules (Input rows = conditions, Output rows = defaulted value), check duplicates, delete with confirmation.
2. **Try the rules** (runtime op `Evaluate`): screen values in, defaults out, using the first-matching-rule logic of POPULATE. This is the op the request app can call.
3. **Field control** (`/INOWITS/MDM_MCN`): per material type and version a grid of Visible / Required / Display only per field. The highest version is live, so a change is **published as a new version** (copy of the live version plus the changes). The newest version can be removed again (rollback).
4. Department overrides (`MM_FELD`) and user departments (`USR_DEP`) are shown read only.

Tables written: `/INOWITS/RULE_H`, `/INOWITS/RULE_I` (rule ops), `/INOWITS/MDM_MCN` (PublishField / DeleteFieldVersion only). Read: RULE_AP, MM_FELD, USR_DEP, MDM_CCN/VCN, DD04T/DD04L/DD07, T134T.
No new Z table, no change of other classes. **No change log was written** (see gaps).

## Ops (payload JSON; the hub adds `actor` and `isAdmin`). Result is the `data` part; failure = `{ok:false,messages:[{severity,code,message,target}]}`
| Op | Payload | Result | Write |
|---|---|---|---|
| Apps | - | apps[] {app,text,screenCount,setCount} (all 31 codes of domain /INOWITS/RULE_APP) | |
| Screens | app | screens[] {fgroup,app,screen,screenDesc,setCount} | |
| Sets | fgroup | sets[] {ruleSetId,description,filterValue,ruleCount,itemCount,outputField,...} | |
| GetSet | ruleSetId | header + items[] {ruleId,datele,value,condition,ftype,dateleDesc,ptype,isDefault} | |
| SaveSet | [ruleSetId], app?, fgroup, description, filterValue | ruleSetId, created, message. No id = NEW set, id = MAX+1 under a lock; existing only description/filter change | yes |
| DeleteSet | ruleSetId | itemsDeleted, message (RULE_I then RULE_H, one commit) | yes |
| SaveRules | ruleSetId, items[] | rules, items, message. Replaces all items of the set in one LUW under the lock | yes |
| DeleteRule | ruleSetId, ruleId | itemsDeleted, message | yes |
| Validate | ruleSetId, [items], [ruleId] | duplicates[] (candidate rule vs other rule + its rows), message | |
| FieldHelp | app, screen, q | fields[] {datele,text,source CONFIG/DICT} | |
| Evaluate | app (default M), [screen], values[{field,value}] | setsEvaluated, results[] {field,value,ruleSetId,ruleId,ruleSetDesc,overridable,marker:'R',conflict} | |
| FieldTypes | - | types[] {mtart,text,activeVersion,versions[]} | |
| FieldViews | mtart, [vrsn] | views[] with counts (blank view = "(general)") | |
| FieldRows | mtart, [vrsn], view | rows[] {cnt,field,text,visible,required,displayOnly,col,heading} | |
| PublishField | mtart, changes[{cnt,visible,required,displayOnly}] | previousVersion, newVersion, rowsCopied, rowsChanged | yes |
| DeleteFieldVersion | mtart, vrsn | only the highest version and only if an older one remains | yes |
| Overrides | - | overrides[] (MM_FELD), userDepartments[] (USR_DEP) | |

Every write op refuses unless `isAdmin` is true and an actor is present (`NOT_ADMIN`). Lock: `ENQUEUE_E_TABLE` on `/INOWITS/RULE_H` (all rule writes) and `/INOWITS/MDM_MCN` + client + type (publish); released at commit and explicitly.

## Validations (literal texts from the old app, unchanged)
Please enter a Screen / Please enter a valid screen / Please enter a valid Application / Please enter a Rule Set Description / Please select a Valid Rule Set / Please select a Rule Set / Please select a valid Rule Set / Please select a Rule / Please select a Valid Rule / Priority Type should Be Same for all Rule ID / Please enter atleast one output for Rule - NNN / Duplicate entry found / Please enter the field name. Success texts: Rule Set created successfully, Rule created successfully, Rule Set deleted successfully, Rule deleted successfully, Rule Validated, No Duplicates.
Added checks (old app accepted anything, or truncated silently): rule id must be 1-999, field name max 30, value max 40, description max 100, Type I/R, Condition AND/OR/blank, Priority H/M/L/blank, at least one row on save, filter max 10, set cannot move to another screen.

## Differences from the old app (bugs deliberately not copied)
* **Rule set ids**: only NEW sets get MAX+1 (under a lock); existing sets keep their id (the old save loop could renumber existing sets). Verified live (below).
* **Save is atomic and locked**: DELETE + INSERT of the set's items in one LUW with ROLLBACK on error; the old one was unlocked and could lose a set between DELETE and INSERT.
* Every application code of the domain is accepted (the old screen rejected PV, BM, RR, FLC, CM).
* Screen is chosen from a list (old: typed the screen number).
* Rule delete inside a set is local until Save (one commit); only the last rule of a stored set is deleted in SAP immediately.
* Duplicate detector also requires the **same output field** (the old one flagged every two unconditional rules as duplicates), and it checks the unsaved rows.
* Priority is one setting per set (the old app forced all rows equal anyway).
* Not rebuilt on purpose: V_USER_RULES (0 live UNAME rules, copy handler empty), SM30 maintenance of RULE_AP / MM_FELD / USR_DEP (read only here).
* Evaluate with no `screen` checks the rules of **all screens** of the application, as the old engine does (it loads all rule items of the app and applies them on the key-data screen); a screen filter is optional. Only exact-match AND logic (material semantics, OR is ignored). Outputs not flagged Default are never applied; sets without inputs apply their first output; `conflict` is true when two sets give one field different values.

## Test evidence (EDS, direct AdminCall; throw-away data only)
* Reads: Apps counts match the spec (M 56 sets, C 10, V 10, P 3, B 1, PR 1); Sets for screen 045 lists 001/002/092/093; GetSet 092 returns the 87 rows; FieldTypes shows FERT with versions 000/001 (active 001).
* Evaluate MTART=FERT, WERKS=UB01 -> VKORG 0000 (set 092 rule 001), PRCTR UB01 (set 088), MBRSH F (unconditional); consistent with RULE_I SQL.
* Write round trip with throw-away sets 105 and 106 on screen 045: created (ids MAX+1 = 105, 106), rename kept the id, 7 validation messages reproduced, save of 4 rules/8 items, GetSet read-back, Evaluate: FERT+ZZ01 -> A (rule 001), FERT+other -> B (rule 002), ROH -> nothing (output not Default), no values -> nothing; duplicate check found rule 005 = rule 002; editing set 106 did not change 105 or any other id; DeleteRule, DeleteSet both worked. SQL afterwards: RULE_H 81 rows / max id 104, RULE_I 1347 rows, no `ZZ%` rows - identical to before.
* Non-admin write refused (NOT_ADMIN) for SaveSet and PublishField.
* Field control round trip on type SCRP (not used by production requests, but it is a live type): PublishField changed 1 flag -> version 001 (663 rows copied), FieldRows showed the new value, removing version 000 was refused (not highest), DeleteFieldVersion 001 worked, only the only-version delete was refused. SQL afterwards: SCRP has only version 000 with 663 rows. Heading rows and no-change publishes are refused.
* Through the hub (dev API with the DEV token): Sets, SaveSet and DeleteSet worked (a throw-away set 105 was created and deleted again, SQL verified).
* `npx tsc --noEmit` clean. The screen itself was not rendered in a browser (build/test not run on purpose).

## Gaps and uncertainties
* **No change log.** RULE_*, MDM_MCN have no logging in SAP; a Z log table was not created (not strictly needed). Rule edits are not recoverable except by re-entering. For MDM_MCN the versioning is the history. Recommendation: switch on table logging (DD09L) for RULE_H/RULE_I in SE11 if audit is required.
* `Evaluate` is only exposed through the Admin-gated hub route; the request app needs a non-admin route/op before it can call it. Field names are the old Web Dynpro attribute names (MTART, WERKS, WERKS_D, ...), the request app needs its own mapping.
* HD=X meaning visible is inferred (confirmed by the old value help and the data). FERT's live version 001 keeps all 754 fields in the blank ("general") view; that is the data as found.
* Other old consumers read MDM_MCN of "any version" for one check (STEUC required): a published version does not change that check.
* FieldHelp for apps other than M/C/V only offers dictionary data elements (as the old OVS gave an empty list). Data elements are not validated (as before).
* Not browser-tested; layout at phone width is by CSS only. The old "Goto User Specific Rule" link and help-document link are not rebuilt.
* PRD (NWP) has not been touched; the class lives on EDS under transport EDSK9B0EAU.
