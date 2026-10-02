# DDIC objects (SE11)

Rule: create each S structure first. Each table is `MANDT` + `.INCLUDE` of its S structure, so the function
modules can use MOVE-CORRESPONDING and the Node.js client sends exactly the structure fields.

## Data elements
| Name | Type | Meaning |
| --- | --- | --- |
| ZAUC_AUCID | CHAR 20 | Auction id, for example AUC-MG2XYZ |
| ZAUC_RATE | DEC 15,4 | Rate or amount |
| ZAUC_MS | DEC 15,0 | Duration in milliseconds |
| ZAUC_FLAG | CHAR 1 | X = yes, blank = no |

## Structures
**ZAUC_S_MATERIAL**: MATNR CHAR40, MAKTX MAKTX, MTART MTART, MEINS CHAR3

**ZAUC_S_LIFNR**: LIFNR LIFNR

**ZAUC_S_VENDOR**: LIFNR LIFNR, NAME1 NAME1_GP, EMAIL AD_SMTPADR

**ZAUC_S_HDR**: AUCID ZAUC_AUCID, TITLE CHAR120, MATNR CHAR40, MATDESC CHAR80, MTART MTART, MEINS CHAR3, UNIT_TXT CHAR30,
CEILING ZAUC_RATE, DECREMENT ZAUC_RATE, THRESHOLD ZAUC_RATE, SHOW_LOWEST ZAUC_FLAG, MUST_BEAT ZAUC_FLAG, STATUS CHAR10, ENDS_AT TIMESTAMPL,
PAUSED_LEFT ZAUC_MS, EXTENSIONS INT4, MAX_EXT INT4, WINDOW_S INT4, EXTEND_S INT4, WINNER LIFNR, AWARD_REASON CHAR255,
DEMO ZAUC_FLAG, CREATED_BY SYUNAME, CREATED_AT TIMESTAMPL, CHANGED_AT TIMESTAMPL

**ZAUC_S_VEND**: AUCID ZAUC_AUCID, VID CHAR10, LIFNR LIFNR, ALIAS CHAR20, NAME CHAR60, EMAIL AD_SMTPADR, OUT ZAUC_FLAG

**ZAUC_S_BID**: AUCID ZAUC_AUCID, BIDNO INT4, LIFNR LIFNR, AMOUNT ZAUC_RATE, BID_TS TIMESTAMPL, VOID ZAUC_FLAG,
OVER_CAP ZAUC_FLAG (set by SAP when a bid is above the threshold; the platform never sends such a bid)

**ZAUC_S_LOG**: AUCID ZAUC_AUCID, LOGNO INT4, LOG_TS TIMESTAMPL, TEXT CHAR255

**ZAUC_S_MAIL**: AUCID ZAUC_AUCID, MAILID CHAR20, GROUPN CHAR30, LIFNR LIFNR, TO_NAME CHAR80, TO_ADDR AD_SMTPADR,
SUBJECT CHAR255, BODY STRING, SENT_TS TIMESTAMPL

**ZAUC_S_DOC**: AUCID ZAUC_AUCID, KIND CHAR10, STATUS CHAR1 (S = created, U = outcome unknown), DOCNO CHAR10,
MSG CHAR255, TS TIMESTAMPL

**ZAUC_S_INFOREC**: LIFNR LIFNR, MATNR CHAR40, INFO_CAT CHAR1, EKORG EKORG, EKGRP EKGRP, WERKS WERKS_D, NETPR ZAUC_RATE,
WAERS WAERS, PEINH PEINH, BPRME CHAR3, VALID_FROM DATS, VALID_TO DATS, PLIFZ PLIFZ, MWSKZ MWSKZ, INCO1 INCO1,
ZTERM DZTERM, MINBM ZAUC_RATE, AUC_REF ZAUC_AUCID

**ZAUC_S_CONTRACT**: CTYPE CHAR2, LIFNR LIFNR, EKORG EKORG, EKGRP EKGRP, WAERS WAERS, KDATB DATS, KDATE DATS, ZTERM DZTERM,
INCO1 INCO1, MATNR CHAR40, TXZ01 TXZ01, WERKS WERKS_D, MEINS CHAR3, KTMNG ZAUC_RATE, TARGET_VAL ZAUC_RATE,
NETPR ZAUC_RATE, PEINH PEINH, MWSKZ MWSKZ, AUC_REF ZAUC_AUCID

## Tables (delivery class A, data class APPL1, size category 1, buffering off)
| Table | Key | Content |
| --- | --- | --- |
| ZAUC_HDR | MANDT, AUCID | One row per auction. THRESHOLD = highest bid a vendor may place; CEILING = reference rate for savings |
| ZAUC_VEND | MANDT, AUCID, VID | Invited vendors and their alias for this auction |
| ZAUC_BID | MANDT, AUCID, BIDNO | Every bid, never deleted; VOID = X when an admin voids it |
| ZAUC_LOG | MANDT, AUCID, LOGNO | Audit log |
| ZAUC_MAIL | MANDT, AUCID, MAILID | Mails sent |
| ZAUC_SAPDOC | MANDT, AUCID, KIND | Info record / contract created, or "outcome unknown" |

Each table = field MANDT (MANDT) as first key field + `.INCLUDE` of the matching S structure
(ZAUC_S_HDR, ZAUC_S_VEND, ZAUC_S_BID, ZAUC_S_LOG, ZAUC_S_MAIL, ZAUC_S_DOC).

## Lock object
EZAUC_AUC on table ZAUC_HDR, lock mode E (write), lock argument AUCID. SE11 generates ENQUEUE_EZAUC_AUC and DEQUEUE_EZAUC_AUC.

## Anonymity note
These tables hold real vendor numbers next to aliases. Restrict display of ZAUC_VEND and ZAUC_BID in SAP
(authorization group on the tables) to Procurement admins and Internal Audit. Vendors never get SAP access:
the Node.js server builds the alias-only views.
