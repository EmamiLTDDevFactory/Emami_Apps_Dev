# ZMDM_PH – Product Hierarchy: SAP backend for the mm-mdm portal

Replaces the Web Dynpro ABAP component `ZMDM_PRODUCT_HIERARCHYF_F` (application of the same name, package `ZEMAMI`,
"MDM product hierarchy application", last changed 2023-03-16 on EDS) with an OData service the
`mm-mdm` portal calls (screen `app/master/hierarchy`, t-code chip `ZMDM_PH`).

Status of this document: **specification and ABAP source for the ABAP/Basis team to create**.
Nothing was created or changed on any SAP system. The ABAP below was written against the extracted Web Dynpro
source and the signatures of `/INOWITS/CL_WF`, but it has **not been compiled**; expect small syntax and type
fixes when it is pasted into ADT/SE24 (section 11 lists what to check first).

---

## 1. What the Web Dynpro component does today

Extracted from EDS through ADT (component controller, views MAIN and SUCCESS, window `ZMDM_PRODUCT_HIERARC`). The component has no
assistance class. Search helps come from seven `WDR_OVS` usages (cost centre, banner, brand, product, SKU, variant, scheme).

### 1.1 Data

| Object | Used for |
| --- | --- |
| `T179` / `T179T` | Product hierarchy master (`STUFE` 1–6). `PRODH` = path (banner … current level), `PRODHA` = this level's own code, `VTEXTA`/`BEZEI` and `T179T-VTEXT` = text (language `E`). |
| `ZMDM_PH_CREATE` | One row per request: `TRANSACTION_ID`, `WI_ID` (top work item), `BANNER`, `BARND` (sic), `PRODUCT`, `SKU`, `VARIANT`, `SCHEME` with `*_DESC`, `ERDAT`, `ERNAM`, `ERTIM`. |
| `ZPROD_HIERARCHY` | Product → cost centre mapping: `PRODHA`, `ZSALESBRAND` (product text), `KOSTL`, `KTEXT`, `LEVEL1/2/3`. |
| `/INOWITS/WF_ROLE`, `/INOWITS/F_MAIL` | Workflow agents and the distribution list for application `PH`. |
| `CSKS` / `CSKT` | Cost centres (search help takes `KOSTL LIKE 'BEH%'`, valid on today's date). |
| `SWWWIHEAD` | Work items (top work item, status, task, text). |
| `/INOWITS/CL_WF` | Workflow API: `START` (incl. simulate), `COMPLETE`, `REJECT`, `SENDBACK`. |

Real code lengths (confirmed on EDS, `T179`): **Banner 2, Brand 4, Product 4, SKU 3, Variant 3, Scheme 2 = 18**, e.g.
`22 0596 1501 224 343 01` → `220596150122434301`.

### 1.2 The three jobs the one screen does

| # | Job | Triggered by | Result |
| --- | --- | --- | --- |
| **I** | **Initiate** a creation request | No work item (`LV_WID` empty) | Validates, checks authorisation `ZMDM_MAT`, simulates and starts workflow `PH` (task `TS90000122`), generates the transaction id, writes `ZMDM_PH_CREATE`, mails initiator, agents. |
| **A** | **Approve and create** | Work item of task `TS90000124` ("Product Hierarchy Creation Req from … Transcation ID …") | Completes the work item, **assigns the next free code to every blank level**, writes `T179`/`T179T`, updates `ZMDM_PH_CREATE`, mails the result and asks for a cost centre. |
| **C** | **Assign cost centre** | Work item of task `TS90000122` with text "Product Hierarchy & Costcenter assignment Req …" | Validates the cost centre, completes the work item, writes `ZPROD_HIERARCHY`, mails. |

Workflow trace of a real request (top work item 1059133, transaction 26690): Creation Req (initiator, completed) → "Reviewer Block" →
"Approver Process" → "Product Hierarchy & Costcenter assignment" (ready).

### 1.3 Rules (kept)

1. Each of the six levels needs a code **or** a description. A code must exist in `T179` for that `STUFE`; a blank code with a description means "create a new node".
2. Description is auto-filled from `T179` when a code is entered without one.
3. Initiate needs authorisation object `ZMDM_MAT`, field `PRDHA`, tried as `*`, then `<banner>*`, then `<banner><brand>*`.
4. Workflow routing key = banner (`gen_type`) and brand (`gen_field`). Agents of `/INOWITS/WF_ROLE` (app `PH`, active, valid today) for banner+brand, else for banner+`*`; the real start uses whichever passed the simulation.
5. `assign_costcenter = 'X'` unless `ZPROD_HIERARCHY` already holds a cost centre for banner+brand+product.
6. New codes = highest numeric code of that level + 1, never 9999/999/99, and for products also not 9991–9998 (reserved).
7. Cost centre: must start with `BEH`, exist in `CSKT`, have a description. Stored as `KOSTL = costcentre+3(7)`.
8. Mail goes through `SO_NEW_DOCUMENT_ATT_SEND_API1` + `RSCONN01`; recipients are the initiator, mails returned by `CL_WF`, the workflow agents' addresses (`USR21`→`ADR6`) and, for approve/cost centre, the `/INOWITS/F_MAIL` list (brand-specific, else `*`).

### 1.4 Findings in the old component (and what this design does about them)

| # | Finding in `ZMDM_PRODUCT_HIERARCHYF_F` | In the new service |
| --- | --- | --- |
| F1 | The whole initiate/approve logic sits inside `IF banner IS NOT INITIAL AND brand IS NOT INITIAL`. With a blank banner or brand the button **silently does nothing**. Banner and brand are also the workflow routing key, so they can never be new. | **Banner and brand must exist** (clear error). Only product, SKU, variant and scheme can be new. The mock screen currently allows a new banner/brand – must change. |
| F2 | Errors returned by `/INOWITS/CL_WF=>START` after the real start (`ET_MESSAGE` type E) are ignored: no message, no write. | Raised as an error to the caller. |
| F3 | `MODIFY T179/T179T` **overwrites** the text of an existing node when the approver types a different description for an existing code (renames master data). | Existing nodes are never overwritten; only missing path nodes are inserted. A different text is reported as a warning. |
| F4 | Approve step overwrites `ERNAM/ERDAT/ERTIM` of `ZMDM_PH_CREATE` with the approver. | The initiator's values are preserved. |
| F5 | Next code = `MAX(PRODHA)+1` read from `T179` with a text `MAX`; a non-numeric code makes it dump and two approvers at once get the same code; no overflow check (99 → 00). | Numeric max in ABAP over numeric codes only, enqueue lock around code generation, overflow and reserved-range check. |
| F6 | Many `SELECT … FOR ALL ENTRIES` run without checking for an empty driver table (selects everything). | Guarded. |
| F7 | Messages for blank code+description are attached to the banner element for every level. | One message per level and field. |
| F8 | No check that the cost-centre length is 10 before `+3(7)`; `CSKS` validity is only enforced by the F4. | Length 10 and `CSKS-DATBI >= today` enforced. |
| F9 | An existing 18-character hierarchy can be requested again (nothing new to create). | Rejected with a clear message. |
| F10 | The user does not need to be an agent of the work item the app is opened for beyond what `CL_WF` checks. | Work item must be in the caller's worklist, in the right task and status. |

`ZPROD_HIERARCHY-PRODHA` – open item: the screen takes `PRODHA` and `ZSALESBRAND` from a context node (`FINAL_PRODUCT`) that is filled by the
host that opens the component, not inside it. Old rows look like `800450013` (banner 2 + brand 4 + product 3). This design writes
**banner + brand + product (10 characters)** and the product description. Please compare with one row written by the current
application before go-live.

---

## 2. Target architecture

```
mm-mdm (Next.js static export)
   └─ hub backend route  /ph/*  (adds the user's SAP credentials)
        └─ SAP Gateway  ZMDM_PH_SRV  (OData V2, SEGW project)
             └─ ZCL_ZMDM_PH_DPC_EXT   thin: maps entities ⇄ structures, converts errors
                  └─ ZCL_MDM_PH_CORE   all rules (this document, section 6)
                       ├─ /INOWITS/CL_WF   (unchanged)
                       └─ T179, T179T, ZMDM_PH_CREATE, ZPROD_HIERARCHY, SWWWIHEAD
```

**Identity (decision needed).** `/INOWITS/CL_WF=>COMPLETE` reads `SY-UNAME` as the acting user; `START` only accepts an override
(`IV_UNAME`). The authority check also runs for `SY-UNAME`. Therefore the service **must run as the real SAP user**
(Basic auth with the user's own SAP account, as the SAP Agent does, or SSO/principal propagation). A shared technical user would
record every approval under that user and bypass `ZMDM_MAT`. The core class does not accept a user parameter for this reason.

**Gateway limits seen in the portal README.** The gateway on NGD passes only GET, POST and PUT. This design uses **GET and POST only**
(POST function imports for every write), and each write is one call.

---

## 3. OData service `ZMDM_PH_SRV` (SEGW project `ZMDM_PH`)

### 3.1 Entity types

**`LevelValue`** – search help for one level. Key `Level`, `Prodh`.

| Property | Edm type | Notes |
| --- | --- | --- |
| `Level` | String(1) | `1`..`6` (banner … scheme) |
| `Code` | String(4) | `T179-PRODHA` |
| `Text` | String(40) | `T179-VTEXTA` |
| `Prodh` | String(18) | `T179-PRODH` (path) |
| `Parent` | String(18) | path of the parent node (empty for banner) |

Entity set `LevelValueSet`, GET list. Filters: `Level` (required), `Code` (exact), `Text` (`*` wildcard), `Parent` (path prefix; optional, narrows to children).

**`CostCenter`** – key `Kostl`. `Kostl` String(10), `Text` String(40). `CostCenterSet`, GET list, filters `Kostl`, `Text`. Only `BEH*`, valid today (same as the old F4).

**`Request`** – key `TransactionId` (String(10)). One hierarchy request.

| Property | Edm type | Notes |
| --- | --- | --- |
| `TransactionId` | String(10) | `ZMDM_PH_CREATE-TRANSACTION_ID` (numc 10) |
| `WiId` | String(12) | top work item |
| `Banner`, `BannerDesc` | String(2), String(40) | |
| `Brand`, `BrandDesc` | String(4), String(40) | |
| `Product`, `ProductDesc` | String(4), String(40) | |
| `Sku`, `SkuDesc` | String(3), String(40) | |
| `Variant`, `VariantDesc` | String(3), String(40) | |
| `Scheme`, `SchemeDesc` | String(2), String(40) | |
| `Hierarchy` | String(18) | computed: concatenation of the six codes (blank for unassigned) |
| `CostCenter`, `CostCenterDesc` | String(10), String(40) | filled after step C |
| `Step` | String(1) | `I` raised, `A` waiting approval, `C` waiting cost centre, `D` done |
| `Initiator` | String(12) | `ERNAM` |
| `CreatedOn` | DateTime | `ERDAT` |
| `CreatedAt` | Time | `ERTIM` |
| `Message` | String(255) | result text of a write (empty on reads) |

`RequestSet`: GET list (`$filter` on `Initiator`, `Step`, `TransactionId`; newest first; supports `$top`), GET single, **POST = Initiate** (job I).

**`WorkItem`** – the caller's open tasks. Key `WiId` (String(12)).

| Property | Edm type | Notes |
| --- | --- | --- |
| `WiId` | String(12) | |
| `TransactionId` | String(10) | |
| `Mode` | String(1) | `A` approve and create, `C` assign cost centre |
| `Text` | String(255) | work item text |
| `Status` | String(12) | `READY`, `SELECTED`, `STARTED` |
| `Initiator` | String(12) | |
| `CreatedOn` | DateTime | |

`WorkItemSet`: GET list for the logged-on user. Navigation `ToRequest` → `Request`.

### 3.2 Function imports (all HTTP POST, return `Request`)

| Name | Parameters | Job |
| --- | --- | --- |
| `Validate` | `Mode` (`I`/`A`), `Banner … SchemeDesc` (12) | Runs every check and the description auto-fill without writing anything. The portal calls it on every change of a level and before Submit. |
| `Approve` | `WiId`, `Banner … SchemeDesc` (12) | Job A. Returns the request with the assigned codes and `Hierarchy`. |
| `AssignCostCenter` | `WiId`, `CostCenter` | Job C. |
| `RejectRequest` *(optional)* | `WiId` | `CL_WF=>REJECT`. Not part of the Web Dynpro; included because approvers cannot act from the portal otherwise. |
| `SendBackRequest` *(optional)* | `WiId` | `CL_WF=>SENDBACK`. Same remark. |

Function-import parameters travel in the query string for OData V2 POST; the longest call (Approve) is about 700 characters.

### 3.3 Errors

Every rule failure is raised as `/IWBEP/CX_MGW_BUSI_EXCEPTION` with a message container, so the portal receives a standard OData error
whose `innererror.errordetails[]` hold one entry per problem (`code` = field name such as `Banner`, `message` = text,
`severity` = `error`/`warning`). Warnings of a successful call are returned in the `Message` property.

---

## 4. Authorisations and set-up

| Item | Who / what |
| --- | --- |
| Authorisation object `ZMDM_MAT`, field `PRDHA` | Initiators: `*`, `<banner>*` or `<banner><brand>*` (as today). |
| `S_SERVICE` for `ZMDM_PH_SRV` | Every portal user (Gateway activation, `/IWFND/MAINT_SERVICE`). |
| `S_TCODE`/workflow | Same as today for the work-item tasks. |
| `S_TABU_DIS`/`S_TABU_NAM` | The service writes `T179`, `T179T`, `ZMDM_PH_CREATE`, `ZPROD_HIERARCHY` **as the user**. Approvers (job A) and cost-centre owners (job C) need change access to them – same as Web Dynpro today. |
| Lock | Function `ENQUEUE_E_TABLE` on `ZMDM_PH_CREATE`, var key `CODEGEN` (no new lock object). |
| Constants | Task ids `TS90000124` / `TS90000122` and application id `PH` are constants in `ZCL_MDM_PH_CORE` (section 6.2). |

---

## 5. ABAP – exception class `ZCX_MDM_PH`

```abap
CLASS zcx_mdm_ph DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
  PUBLIC SECTION.
    DATA mt_return TYPE bapiret2_t READ-ONLY.
    METHODS constructor
      IMPORTING it_return TYPE bapiret2_t OPTIONAL
                previous  LIKE previous   OPTIONAL.
    CLASS-METHODS from_text
      IMPORTING iv_text TYPE string
                iv_field TYPE string OPTIONAL
                iv_type TYPE bapi_mtype DEFAULT 'E'
      RETURNING VALUE(ro_exc) TYPE REF TO zcx_mdm_ph.
ENDCLASS.

CLASS zcx_mdm_ph IMPLEMENTATION.
  METHOD constructor.
    super->constructor( previous = previous ).
    mt_return = it_return.
  ENDMETHOD.

  METHOD from_text.
    DATA(lt_return) = VALUE bapiret2_t( ( type = iv_type message = iv_text field = iv_field ) ).
    ro_exc = NEW #( it_return = lt_return ).
  ENDMETHOD.
ENDCLASS.
```

---

## 6. ABAP – business class `ZCL_MDM_PH_CORE`

### 6.1 Definition

```abap
CLASS zcl_mdm_ph_core DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS:
      c_app_id        TYPE /inowits/wf_app_id VALUE 'PH',
      c_task_approve  TYPE sww_task           VALUE 'TS90000124',
      c_task_cost     TYPE sww_task           VALUE 'TS90000122',
      c_text_cost     TYPE string             VALUE 'Product Hierarchy & Costcenter',
      c_mode_initiate TYPE char1              VALUE 'I',
      c_mode_approve  TYPE char1              VALUE 'A',
      c_mode_cost     TYPE char1              VALUE 'C'.

    TYPES:
      BEGIN OF ty_request,
        transaction_id  TYPE zmdm_ph_create-transaction_id,
        wi_id           TYPE zmdm_ph_create-wi_id,
        banner          TYPE zmdm_ph_create-banner,
        banner_desc     TYPE zmdm_ph_create-banner_desc,
        brand           TYPE zmdm_ph_create-barnd,
        brand_desc      TYPE zmdm_ph_create-brand_desc,
        product         TYPE zmdm_ph_create-product,
        product_desc    TYPE zmdm_ph_create-product_desc,
        sku             TYPE zmdm_ph_create-sku,
        sku_desc        TYPE zmdm_ph_create-sku_desc,
        variant         TYPE zmdm_ph_create-variant,
        variant_desc    TYPE zmdm_ph_create-variant_desc,
        scheme          TYPE zmdm_ph_create-scheme,
        scheme_desc     TYPE zmdm_ph_create-scheme_desc,
        hierarchy       TYPE c LENGTH 18,
        cost_center     TYPE kostl,
        cost_center_desc TYPE cskt-ltext,
        step            TYPE c LENGTH 1,
        initiator       TYPE zmdm_ph_create-ernam,
        created_on      TYPE zmdm_ph_create-erdat,
        created_at      TYPE zmdm_ph_create-ertim,
        message         TYPE c LENGTH 255,
      END OF ty_request,
      tt_request TYPE STANDARD TABLE OF ty_request WITH EMPTY KEY,

      BEGIN OF ty_level_value,
        level TYPE c LENGTH 1,
        code  TYPE c LENGTH 4,
        text  TYPE c LENGTH 40,
        prodh TYPE c LENGTH 18,
        parent TYPE c LENGTH 18,
      END OF ty_level_value,
      tt_level_value TYPE STANDARD TABLE OF ty_level_value WITH EMPTY KEY,

      BEGIN OF ty_cost_center,
        kostl TYPE kostl,
        text  TYPE cskt-ltext,
      END OF ty_cost_center,
      tt_cost_center TYPE STANDARD TABLE OF ty_cost_center WITH EMPTY KEY,

      BEGIN OF ty_work_item,
        wi_id          TYPE swwwihead-wi_id,
        transaction_id TYPE zmdm_ph_create-transaction_id,
        mode           TYPE c LENGTH 1,
        text           TYPE c LENGTH 255,
        status         TYPE swwwihead-wi_stat,
        initiator      TYPE zmdm_ph_create-ernam,
        created_on     TYPE swwwihead-wi_cd,
      END OF ty_work_item,
      tt_work_item TYPE STANDARD TABLE OF ty_work_item WITH EMPTY KEY.

    CLASS-METHODS class_constructor.

    CLASS-METHODS get_level_values
      IMPORTING iv_level TYPE i
                iv_code  TYPE clike OPTIONAL
                iv_text  TYPE clike OPTIONAL
                iv_parent TYPE clike OPTIONAL
                iv_max   TYPE i DEFAULT 500
      RETURNING VALUE(rt_values) TYPE tt_level_value.

    CLASS-METHODS get_cost_centers
      IMPORTING iv_kostl TYPE clike OPTIONAL
                iv_text  TYPE clike OPTIONAL
                iv_max   TYPE i DEFAULT 500
      RETURNING VALUE(rt_values) TYPE tt_cost_center.

    CLASS-METHODS get_requests
      IMPORTING iv_initiator TYPE clike OPTIONAL
                iv_transaction_id TYPE clike OPTIONAL
                iv_wi_id TYPE clike OPTIONAL
                iv_max   TYPE i DEFAULT 100
      RETURNING VALUE(rt_requests) TYPE tt_request.

    CLASS-METHODS get_inbox
      RETURNING VALUE(rt_items) TYPE tt_work_item
      RAISING   zcx_mdm_ph.

    CLASS-METHODS validate
      IMPORTING iv_mode TYPE char1
      CHANGING  cs_request TYPE ty_request
      RAISING   zcx_mdm_ph.

    CLASS-METHODS initiate
      CHANGING cs_request TYPE ty_request
      RAISING  zcx_mdm_ph.

    CLASS-METHODS approve
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
      CHANGING  cs_request TYPE ty_request
      RAISING   zcx_mdm_ph.

    CLASS-METHODS assign_cost_center
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
                iv_cost_center TYPE clike
      CHANGING  cs_request TYPE ty_request
      RAISING   zcx_mdm_ph.

    CLASS-METHODS reject
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
      RAISING   zcx_mdm_ph.

    CLASS-METHODS send_back
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
      RAISING   zcx_mdm_ph.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_level_def,
        level    TYPE i,
        code_fld TYPE string,
        desc_fld TYPE string,
        title    TYPE string,
        len      TYPE i,
      END OF ty_level_def.
    CLASS-DATA gt_levels TYPE STANDARD TABLE OF ty_level_def WITH EMPTY KEY.

    CLASS-METHODS add_msg
      IMPORTING iv_text TYPE string
                iv_field TYPE string OPTIONAL
                iv_type TYPE bapi_mtype DEFAULT 'E'
      CHANGING  ct_return TYPE bapiret2_t.
    CLASS-METHODS raise_if_errors
      IMPORTING it_return TYPE bapiret2_t
      RAISING   zcx_mdm_ph.
    CLASS-METHODS hierarchy_of
      IMPORTING is_request TYPE ty_request
      RETURNING VALUE(rv_hierarchy) TYPE string.
    CLASS-METHODS check_authority
      IMPORTING iv_banner TYPE clike iv_brand TYPE clike
      RAISING   zcx_mdm_ph.
    CLASS-METHODS read_work_item
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
                iv_mode  TYPE char1
      EXPORTING es_head  TYPE swwwihead
                ev_top_wi_id TYPE swwwihead-top_wi_id
      RAISING   zcx_mdm_ph.
    CLASS-METHODS lock_codegen RAISING zcx_mdm_ph.
    CLASS-METHODS unlock_codegen.
    CLASS-METHODS next_code
      IMPORTING iv_level TYPE i
      RETURNING VALUE(rv_code) TYPE string
      RAISING   zcx_mdm_ph.
    CLASS-METHODS need_cost_center
      IMPORTING is_request TYPE ty_request
      RETURNING VALUE(rv_need) TYPE abap_bool.
    CLASS-METHODS resolve_gen_field
      IMPORTING iv_banner TYPE clike iv_brand TYPE clike iv_cost_flag TYPE char1
      RETURNING VALUE(rv_gen_field) TYPE /inowits/wf_gen_field
      RAISING   zcx_mdm_ph.
    CLASS-METHODS recipients
      IMPORTING iv_banner TYPE clike iv_brand TYPE clike
                iv_initiator_mail TYPE string
                it_wf_mails TYPE /inowits/m_mail_id_tt
                iv_with_list TYPE abap_bool
      RETURNING VALUE(rt_recipients) TYPE STANDARD TABLE OF somlrec90 WITH EMPTY KEY.
    CLASS-METHODS send_mail
      IMPORTING iv_subject TYPE string
                it_lines   TYPE soli_tab
                it_recipients TYPE STANDARD TABLE.
ENDCLASS.
```

### 6.2 Implementation

```abap
CLASS zcl_mdm_ph_core IMPLEMENTATION.

  METHOD class_constructor.
    gt_levels = VALUE #(
      ( level = 1 code_fld = 'BANNER'  desc_fld = 'BANNER_DESC'  title = 'Banner'  len = 2 )
      ( level = 2 code_fld = 'BRAND'   desc_fld = 'BRAND_DESC'   title = 'Brand'   len = 4 )
      ( level = 3 code_fld = 'PRODUCT' desc_fld = 'PRODUCT_DESC' title = 'Product' len = 4 )
      ( level = 4 code_fld = 'SKU'     desc_fld = 'SKU_DESC'     title = 'SKU'     len = 3 )
      ( level = 5 code_fld = 'VARIANT' desc_fld = 'VARIANT_DESC' title = 'Variant' len = 3 )
      ( level = 6 code_fld = 'SCHEME'  desc_fld = 'SCHEME_DESC'  title = 'Scheme'  len = 2 ) ).
  ENDMETHOD.

  METHOD add_msg.
    APPEND VALUE #( type = iv_type message = iv_text field = iv_field ) TO ct_return.
  ENDMETHOD.

  METHOD raise_if_errors.
    IF line_exists( it_return[ type = 'E' ] ) OR line_exists( it_return[ type = 'A' ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = it_return.
    ENDIF.
  ENDMETHOD.

  METHOD hierarchy_of.
    LOOP AT gt_levels ASSIGNING FIELD-SYMBOL(<l>).
      ASSIGN COMPONENT <l>-code_fld OF STRUCTURE is_request TO FIELD-SYMBOL(<code>).
      rv_hierarchy = rv_hierarchy && <code>.
    ENDLOOP.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Search helps (replace the seven WDR_OVS usages)
*---------------------------------------------------------------------*
  METHOD get_level_values.
    DATA lv_text TYPE c LENGTH 40.
    DATA lv_prodh_like TYPE string.
    lv_text = iv_text.
    REPLACE ALL OCCURRENCES OF '*' IN lv_text WITH '%'.
    lv_prodh_like = |{ iv_parent }%|.

    SELECT stufe, prodha, vtexta, prodh
      FROM t179
      WHERE stufe = @iv_level
        AND ( @iv_code = '' OR prodha = @iv_code )
        AND ( @lv_text = '' OR vtexta LIKE @lv_text )
        AND ( @iv_parent = '' OR prodh LIKE @lv_prodh_like )
      ORDER BY prodha, vtexta
      INTO TABLE @DATA(lt_t179)
      UP TO @iv_max ROWS.

    LOOP AT lt_t179 ASSIGNING FIELD-SYMBOL(<r>).
      DATA(lv_len) = strlen( condense( CONV string( <r>-prodh ) ) ) - strlen( condense( CONV string( <r>-prodha ) ) ).
      APPEND VALUE #(
        level  = |{ <r>-stufe }|
        code   = <r>-prodha
        text   = <r>-vtexta
        prodh  = <r>-prodh
        parent = COND #( WHEN lv_len > 0 THEN substring( val = <r>-prodh len = lv_len ) ELSE `` )
      ) TO rt_values.
    ENDLOOP.
    " The old OVS removed duplicates on code + text; the same code can sit under several parents.
    IF iv_parent IS INITIAL.
      SORT rt_values BY code text.
      DELETE ADJACENT DUPLICATES FROM rt_values COMPARING code text.
    ENDIF.
  ENDMETHOD.

  METHOD get_cost_centers.
    DATA lv_text TYPE c LENGTH 40.
    DATA lv_kostl TYPE kostl.
    lv_text = iv_text.
    REPLACE ALL OCCURRENCES OF '*' IN lv_text WITH '%'.
    lv_kostl = iv_kostl.
    REPLACE ALL OCCURRENCES OF '*' IN lv_kostl WITH '%'.

    SELECT DISTINCT a~kostl, b~ltext
      FROM csks AS a INNER JOIN cskt AS b ON b~kostl = a~kostl
                                         AND b~spras = @sy-langu
      WHERE a~kostl LIKE 'BEH%'
        AND ( @lv_kostl = '' OR a~kostl LIKE @lv_kostl )
        AND ( @lv_text = '' OR b~ltext LIKE @lv_text )
        AND a~datbi >= @sy-datum
      ORDER BY a~kostl
      INTO TABLE @DATA(lt_cc)
      UP TO @iv_max ROWS.
    rt_values = CORRESPONDING #( lt_cc MAPPING text = ltext ).
  ENDMETHOD.

*---------------------------------------------------------------------*
* Read side
*---------------------------------------------------------------------*
  METHOD get_requests.
    SELECT * FROM zmdm_ph_create
      WHERE ( @iv_initiator = '' OR ernam = @iv_initiator )
        AND ( @iv_transaction_id = '' OR transaction_id = @iv_transaction_id )
        AND ( @iv_wi_id = '' OR wi_id = @iv_wi_id )
      ORDER BY erdat DESCENDING, ertim DESCENDING
      INTO TABLE @DATA(lt_rows)
      UP TO @iv_max ROWS.

    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      DATA(ls_req) = VALUE ty_request(
        transaction_id = <r>-transaction_id wi_id = <r>-wi_id
        banner = <r>-banner banner_desc = <r>-banner_desc
        brand = <r>-barnd brand_desc = <r>-brand_desc
        product = <r>-product product_desc = <r>-product_desc
        sku = <r>-sku sku_desc = <r>-sku_desc
        variant = <r>-variant variant_desc = <r>-variant_desc
        scheme = <r>-scheme scheme_desc = <r>-scheme_desc
        initiator = <r>-ernam created_on = <r>-erdat created_at = <r>-ertim ).
      ls_req-hierarchy = hierarchy_of( ls_req ).

      " Step: D when a cost-centre row exists or no work item is open, A / C from the open work item
      SELECT wi_id, wi_rh_task, wi_text FROM swwwihead
        WHERE top_wi_id = @<r>-wi_id AND wi_type = 'W'
          AND wi_stat IN ('READY','SELECTED','STARTED')
        INTO TABLE @DATA(lt_open).
      IF lt_open IS INITIAL.
        ls_req-step = 'D'.
      ELSE.
        DATA(ls_open) = lt_open[ 1 ].
        ls_req-step = COND #( WHEN ls_open-wi_text CP |{ c_text_cost }*| THEN 'C' ELSE 'A' ).
      ENDIF.
      IF ls_req-product IS NOT INITIAL AND ls_req-banner IS NOT INITIAL AND ls_req-brand IS NOT INITIAL.
        SELECT SINGLE kostl, ktext FROM zprod_hierarchy
          WHERE prodha = @( ls_req-banner && ls_req-brand && ls_req-product )
          INTO ( @ls_req-cost_center, @ls_req-cost_center_desc ).
      ENDIF.
      APPEND ls_req TO rt_requests.
      CLEAR: ls_req, lt_open.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_inbox.
    " Worklist of the logged-on user (SAP_WAPI_CREATE_WORKLIST) filtered to the two PH tasks.
    DATA lt_worklist TYPE STANDARD TABLE OF swr_wihdr.
    CALL FUNCTION 'SAP_WAPI_CREATE_WORKLIST'
      EXPORTING
        user          = sy-uname
      TABLES
        worklist      = lt_worklist
      EXCEPTIONS
        OTHERS        = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING
        it_return = VALUE #( ( type = 'E' message = 'Work list could not be read' ) ).
    ENDIF.

    LOOP AT lt_worklist ASSIGNING FIELD-SYMBOL(<w>)
         WHERE wi_rh_task = c_task_approve OR wi_rh_task = c_task_cost.
      CHECK <w>-wi_text CP 'Product Hierarchy*'.
      DATA(lv_mode) = COND char1( WHEN <w>-wi_text CP |{ c_text_cost }*| THEN c_mode_cost
                                  WHEN <w>-wi_rh_task = c_task_approve THEN c_mode_approve ).
      CHECK lv_mode IS NOT INITIAL.
      SELECT SINGLE top_wi_id, wi_aagent FROM swwwihead WHERE wi_id = @<w>-wi_id
        INTO @DATA(ls_top).
      DATA(ls_ph) = VALUE zmdm_ph_create( ).
      SELECT SINGLE transaction_id, ernam FROM zmdm_ph_create WHERE wi_id = @ls_top-top_wi_id
        INTO CORRESPONDING FIELDS OF @ls_ph.
      APPEND VALUE #( wi_id = <w>-wi_id transaction_id = ls_ph-transaction_id mode = lv_mode
                      text = <w>-wi_text status = <w>-wi_stat initiator = ls_ph-ernam
                      created_on = <w>-wi_cd ) TO rt_items.
    ENDLOOP.
    SORT rt_items BY wi_id DESCENDING.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Validate (ONACTIONINITIATE -> VALIDATE of the component controller)
*---------------------------------------------------------------------*
  METHOD validate.
    DATA lt_return TYPE bapiret2_t.

    IF iv_mode = c_mode_cost.
      " kept for symmetry: cost centre checks live in assign_cost_center
      RETURN.
    ENDIF.

    LOOP AT gt_levels ASSIGNING FIELD-SYMBOL(<l>).
      ASSIGN COMPONENT <l>-code_fld OF STRUCTURE cs_request TO FIELD-SYMBOL(<code>).
      ASSIGN COMPONENT <l>-desc_fld OF STRUCTURE cs_request TO FIELD-SYMBOL(<desc>).
      DATA(lv_field) = |{ to_mixed( val = <l>-code_fld sep = `_` ) }|.
      <code> = condense( <code> ).
      <desc> = condense( <desc> ).

      IF <code> IS INITIAL AND <desc> IS INITIAL.
        add_msg( EXPORTING iv_text = |{ <l>-title }: code and description cannot both be blank|
                           iv_field = lv_field CHANGING ct_return = lt_return ).
        CONTINUE.
      ENDIF.

      IF <code> IS NOT INITIAL.
        IF <code> CN '0123456789'.
          add_msg( EXPORTING iv_text = |{ <l>-title }: only digits are allowed|
                             iv_field = lv_field CHANGING ct_return = lt_return ).
          CONTINUE.
        ENDIF.
        IF strlen( <code> ) > <l>-len.
          add_msg( EXPORTING iv_text = |{ <l>-title }: at most { <l>-len } digits|
                             iv_field = lv_field CHANGING ct_return = lt_return ).
          CONTINUE.
        ENDIF.
        <code> = |{ <code> WIDTH = <l>-len ALIGN = RIGHT PAD = `0` }|.
        SELECT SINGLE vtexta FROM t179
          WHERE stufe = @<l>-level AND prodha = @<code>
          INTO @DATA(lv_text).
        IF sy-subrc <> 0.
          add_msg( EXPORTING iv_text = |{ <l>-title } { <code> } does not exist|
                             iv_field = lv_field CHANGING ct_return = lt_return ).
        ELSEIF <desc> IS INITIAL.
          <desc> = lv_text.
        ENDIF.
      ELSEIF <l>-level <= 2.
        " F1: banner and brand are the workflow routing key, they can never be new
        add_msg( EXPORTING iv_text = |{ <l>-title } must be an existing code – choose it from the search help|
                           iv_field = lv_field CHANGING ct_return = lt_return ).
      ENDIF.
    ENDLOOP.

    " F9: nothing new to create
    IF lt_return IS INITIAL
       AND cs_request-product IS NOT INITIAL AND cs_request-sku IS NOT INITIAL
       AND cs_request-variant IS NOT INITIAL AND cs_request-scheme IS NOT INITIAL.
      DATA(lv_path) = hierarchy_of( cs_request ).
      SELECT SINGLE prodh FROM t179 WHERE stufe = 6 AND prodh = @lv_path INTO @DATA(lv_exists).
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_text = |Product hierarchy { lv_path } already exists|
                           iv_field = 'Scheme' CHANGING ct_return = lt_return ).
      ENDIF.
    ENDIF.

    cs_request-hierarchy = hierarchy_of( cs_request ).
    raise_if_errors( lt_return ).
  ENDMETHOD.

*---------------------------------------------------------------------*
* Authority (ZMDM_MAT / PRDHA): '*', '<banner>*', '<banner><brand>*'
*---------------------------------------------------------------------*
  METHOD check_authority.
    DATA lv_prdha TYPE c LENGTH 18.
    DO 3 TIMES.
      lv_prdha = SWITCH #( sy-index WHEN 1 THEN '*'
                                    WHEN 2 THEN |{ iv_banner }*|
                                    ELSE |{ iv_banner }{ iv_brand }*| ).
      AUTHORITY-CHECK OBJECT 'ZMDM_MAT' ID 'PRDHA' FIELD lv_prdha.
      IF sy-subrc = 0.
        RETURN.
      ENDIF.
    ENDDO.
    RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #( ( type = 'E'
      message = 'You are not authorized to initiate product hierarchy creation request for this banner/brand' ) ).
  ENDMETHOD.

*---------------------------------------------------------------------*
* Cost-centre flag (assign_costcenter of CL_WF=>START)
*---------------------------------------------------------------------*
  METHOD need_cost_center.
    DATA(lv_key) = |{ is_request-banner }{ is_request-brand }{ is_request-product }|.
    SELECT SINGLE kostl FROM zprod_hierarchy WHERE prodha = @lv_key INTO @DATA(lv_kostl).
    rv_need = xsdbool( sy-subrc <> 0 OR lv_kostl IS INITIAL ).
  ENDMETHOD.

*---------------------------------------------------------------------*
* Brand specific agents first, else banner + '*'
*---------------------------------------------------------------------*
  METHOD resolve_gen_field.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lv_wi TYPE swr_struct-workitemid.
    DATA lv_gen_type TYPE /inowits/wf_gen_type.
    lv_gen_type = iv_banner.
    rv_gen_field = iv_brand.

    DO 2 TIMES.
      CLEAR lt_msg.
      /inowits/cl_wf=>start(
        EXPORTING iv_app_id = c_app_id iv_gen_type = lv_gen_type iv_gen_field = rv_gen_field
                  iv_simulate = 'X' assign_costcenter = iv_cost_flag
        IMPORTING ev_workitem_id = lv_wi et_message = lt_msg ).
      IF NOT line_exists( lt_msg[ msg_type = 'E' ] ).
        RETURN.
      ENDIF.
      IF sy-index = 1.
        rv_gen_field = '*'.                  " fall back to the banner-wide agents
      ELSE.
        RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
          ( type = 'E' message = lt_msg[ msg_type = 'E' ]-line ) ).
      ENDIF.
    ENDDO.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Work item must be in the caller's worklist, of the right kind and open
*---------------------------------------------------------------------*
  METHOD read_work_item.
    DATA lt_worklist TYPE STANDARD TABLE OF swr_wihdr.
    CALL FUNCTION 'SAP_WAPI_CREATE_WORKLIST'
      EXPORTING user = sy-uname
      TABLES worklist = lt_worklist
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0 OR NOT line_exists( lt_worklist[ wi_id = iv_wi_id ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = |Work item { iv_wi_id ALPHA = OUT } is not in your inbox| ) ).
    ENDIF.
    SELECT SINGLE * FROM swwwihead WHERE wi_id = @iv_wi_id INTO @es_head.
    IF sy-subrc <> 0 OR es_head-wi_stat NOT IN VALUE rseloption( sign = 'I' option = 'EQ'
         ( low = 'READY' ) ( low = 'SELECTED' ) ( low = 'STARTED' ) ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = 'The work item is no longer open' ) ).
    ENDIF.
    DATA(lv_is_cost) = xsdbool( es_head-wi_text CP |{ c_text_cost }*| ).
    IF ( iv_mode = c_mode_cost AND lv_is_cost = abap_false )
    OR ( iv_mode = c_mode_approve AND ( lv_is_cost = abap_true OR es_head-wi_rh_task <> c_task_approve ) ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = 'This work item is not for this action' ) ).
    ENDIF.
    ev_top_wi_id = es_head-top_wi_id.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Code generation lock (F5)
*---------------------------------------------------------------------*
  METHOD lock_codegen.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = 'ZMDM_PH_CREATE' varkey = 'CODEGEN'
                _scope = '2'
      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = 'Another approval is generating codes – try again in a moment' ) ).
    ENDIF.
  ENDMETHOD.

  METHOD unlock_codegen.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = 'ZMDM_PH_CREATE' varkey = 'CODEGEN'.
  ENDMETHOD.

  METHOD next_code.
    " Highest numeric code of the level + 1; reserved ranges are skipped (9999/999/99, products 9991-9998).
    DATA lv_max TYPE i.
    DATA lv_num TYPE i.
    DATA(ls_lvl) = gt_levels[ level = iv_level ].
    SELECT prodha FROM t179 WHERE stufe = @iv_level INTO TABLE @DATA(lt_codes).
    LOOP AT lt_codes ASSIGNING FIELD-SYMBOL(<c>).
      DATA(lv_c) = condense( CONV string( <c>-prodha ) ).
      CHECK lv_c IS NOT INITIAL AND lv_c CO '0123456789'.
      lv_num = lv_c.
      IF lv_c = repeat( val = `9` occ = ls_lvl-len ) OR lv_c = repeat( val = `9` occ = 3 )
         OR lv_c = repeat( val = `9` occ = 2 ).
        CONTINUE.
      ENDIF.
      IF iv_level = 3 AND lv_num BETWEEN 9991 AND 9998.
        CONTINUE.
      ENDIF.
      lv_max = nmax( val1 = lv_max val2 = lv_num ).
    ENDLOOP.
    DATA(lv_next) = lv_max + 1.
    DATA(lv_limit) = COND i( WHEN iv_level = 3 THEN 9990 ELSE ipow( base = 10 exp = ls_lvl-len ) - 2 ).
    IF lv_next > lv_limit.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = |No free { ls_lvl-title } code left (highest { lv_max })| ) ).
    ENDIF.
    rv_code = |{ lv_next WIDTH = ls_lvl-len ALIGN = RIGHT PAD = `0` }|.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Recipients and mail (as in the old component, duplicates removed)
*---------------------------------------------------------------------*
  METHOD recipients.
    DATA(lv_type) = CONV /inowits/wf_gen_type( iv_banner ).
    DATA(lv_field) = CONV /inowits/wf_gen_field( iv_brand ).
    DATA lt_mail TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    IF iv_initiator_mail IS NOT INITIAL.
      APPEND iv_initiator_mail TO lt_mail.
    ENDIF.
    LOOP AT it_wf_mails ASSIGNING FIELD-SYMBOL(<m>).
      APPEND CONV string( <m> ) TO lt_mail.
    ENDLOOP.

    " Workflow agents: brand specific, else banner + '*'
    DO 2 TIMES.
      SELECT agent FROM /inowits/wf_role
        WHERE app_id = @c_app_id AND gen_type = @lv_type
          AND gen_field = @( COND #( WHEN sy-index = 1 THEN lv_field ELSE '*' ) )
          AND active = 'X' AND start_date <= @sy-datum AND end_date >= @sy-datum
        INTO TABLE @DATA(lt_agent).
      IF lt_agent IS NOT INITIAL.
        SELECT bname, persnumber, addrnumber FROM usr21
          FOR ALL ENTRIES IN @lt_agent WHERE bname = @lt_agent-agent
          INTO TABLE @DATA(lt_usr21).
        IF lt_usr21 IS NOT INITIAL.
          SELECT smtp_addr FROM adr6
            FOR ALL ENTRIES IN @lt_usr21
            WHERE addrnumber = @lt_usr21-addrnumber AND persnumber = @lt_usr21-persnumber
            INTO TABLE @DATA(lt_wfmail).
          LOOP AT lt_wfmail ASSIGNING FIELD-SYMBOL(<w>).
            APPEND CONV string( <w>-smtp_addr ) TO lt_mail.
          ENDLOOP.
        ENDIF.
        EXIT.
      ENDIF.
    ENDDO.

    IF iv_with_list = abap_true.
      DO 2 TIMES.
        SELECT mail FROM /inowits/f_mail
          WHERE app_id = @c_app_id AND gen_type = @lv_type
            AND gen_field = @( COND #( WHEN sy-index = 1 THEN lv_field ELSE '*' ) )
          INTO TABLE @DATA(lt_dl).
        IF lt_dl IS NOT INITIAL.
          LOOP AT lt_dl ASSIGNING FIELD-SYMBOL(<d>).
            APPEND CONV string( <d>-mail ) TO lt_mail.
          ENDLOOP.
          EXIT.
        ENDIF.
      ENDDO.
    ENDIF.

    SORT lt_mail.
    DELETE ADJACENT DUPLICATES FROM lt_mail.
    DELETE lt_mail WHERE table_line IS INITIAL.
    LOOP AT lt_mail ASSIGNING FIELD-SYMBOL(<r>).
      APPEND VALUE somlrec90( rec_type = 'U' com_type = 'INT' receiver = <r> ) TO rt_recipients.
    ENDLOOP.
  ENDMETHOD.

  METHOD send_mail.
    CHECK it_recipients IS NOT INITIAL.
    DATA(ls_doc) = VALUE sodocchgi1( obj_name = 'MAILALEART' obj_langu = sy-langu
                                     obj_descr = iv_subject sensitivty = 'F' ).
    DATA(lt_pack) = VALUE STANDARD TABLE OF sopcklsti1 WITH EMPTY KEY(
      ( transf_bin = space head_start = 1 head_num = 0 body_start = 1
        body_num = lines( it_lines ) doc_type = 'RAW' ) ).
    DATA(lt_rec) = CORRESPONDING STANDARD TABLE OF somlrec90( it_recipients ).
    DATA(lt_txt) = it_lines.
    CALL FUNCTION 'SO_NEW_DOCUMENT_ATT_SEND_API1'
      EXPORTING document_data = ls_doc put_in_outbox = 'X' commit_work = 'X'
      TABLES packing_list = lt_pack contents_txt = lt_txt receivers = lt_rec
      EXCEPTIONS OTHERS = 8.
    IF sy-subrc = 0.
      SUBMIT rsconn01 WITH mode = 'INT' AND RETURN.
    ENDIF.
    " A mail problem never undoes the business transaction.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Job I – Initiate
*---------------------------------------------------------------------*
  METHOD initiate.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lt_mail_ids TYPE /inowits/m_mail_id_tt.
    DATA lv_init_mail TYPE string.
    DATA lv_next_lvl TYPE char1.
    DATA lv_wi TYPE swr_struct-workitemid.
    DATA lv_trans TYPE /inowits/transid.

    validate( EXPORTING iv_mode = c_mode_initiate CHANGING cs_request = cs_request ).
    check_authority( iv_banner = cs_request-banner iv_brand = cs_request-brand ).

    DATA(lv_cost_flag) = CONV char1( COND #( WHEN need_cost_center( cs_request ) = abap_true THEN 'X' ) ).
    DATA(lv_gen_field) = resolve_gen_field( iv_banner = cs_request-banner iv_brand = cs_request-brand
                                            iv_cost_flag = lv_cost_flag ).

    CALL FUNCTION '/INOWITS/M_TRANSID_GENERATE'
      EXPORTING iv_app_id = c_app_id iv_draft = '0'
      IMPORTING ev_trans_id = lv_trans.
    DATA(lv_trans_c) = |{ lv_trans ALPHA = OUT }|.

    /inowits/cl_wf=>start(
      EXPORTING iv_app_id = c_app_id iv_gen_type = CONV #( cs_request-banner )
                iv_gen_field = lv_gen_field iv_trans_id = lv_trans
                iv_workitem_text = |Product Hierarchy Creation Req from { sy-uname } with ref to Transcation ID { lv_trans_c }|
                assign_costcenter = lv_cost_flag
      IMPORTING ev_workitem_id = lv_wi et_message = lt_msg
                ev_initiator_mail_id = lv_init_mail et_mail_id = lt_mail_ids
                ev_is_next_lvl = lv_next_lvl ).
    " F2: errors of the real start are reported, nothing is written
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.

    DATA(ls_row) = VALUE zmdm_ph_create(
      transaction_id = lv_trans wi_id = lv_wi
      banner = cs_request-banner banner_desc = cs_request-banner_desc
      barnd = cs_request-brand brand_desc = cs_request-brand_desc
      product = cs_request-product product_desc = cs_request-product_desc
      sku = cs_request-sku sku_desc = cs_request-sku_desc
      variant = cs_request-variant variant_desc = cs_request-variant_desc
      scheme = cs_request-scheme scheme_desc = cs_request-scheme_desc
      erdat = sy-datum ernam = sy-uname ertim = sy-timlo ).
    MODIFY zmdm_ph_create FROM ls_row.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = |The request was started (work item { lv_wi }) but could not be saved – contact MDM support| ) ).
    ENDIF.
    COMMIT WORK AND WAIT.

    send_mail(
      iv_subject = |Prd.Hier.creation req. ref.to Trans id { lv_trans_c }|
      it_lines = VALUE #( ( line = 'Dear Sir/Madam,' )
        ( line = |Product Hierarchy creation request has been raised with trans id { lv_trans_c } and it is waiting at reviewer/approver process| )
        ( line = 'Regards,' ) ( line = 'SAP.' ) ( line = 'Note:' )
        ( line = 'This is an auto-generated mail. Please do not reply.' ) )
      it_recipients = recipients( iv_banner = cs_request-banner iv_brand = cs_request-brand
                                  iv_initiator_mail = lv_init_mail it_wf_mails = lt_mail_ids
                                  iv_with_list = abap_false ) ).

    cs_request-transaction_id = lv_trans.
    cs_request-wi_id = lv_wi.
    cs_request-initiator = sy-uname.
    cs_request-created_on = sy-datum.
    cs_request-created_at = sy-timlo.
    cs_request-step = 'A'.
    cs_request-message = |Product Hierarchy Creation Request has been raised successfully. Reference Transaction ID is { lv_trans_c }|.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Job A – Approve and create
*---------------------------------------------------------------------*
  METHOD approve.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lt_mail_ids TYPE /inowits/m_mail_id_tt.
    DATA lv_init_mail TYPE string.
    DATA lv_next_lvl TYPE char1.
    DATA lt_t179 TYPE STANDARD TABLE OF t179 WITH EMPTY KEY.
    DATA lt_t179t TYPE STANDARD TABLE OF t179t WITH EMPTY KEY.
    DATA lt_return TYPE bapiret2_t.

    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_approve
                    IMPORTING ev_top_wi_id = DATA(lv_top) ).
    SELECT SINGLE * FROM zmdm_ph_create WHERE wi_id = @lv_top INTO @DATA(ls_ph).
    IF sy-subrc <> 0.                           " F: old code did nothing here
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = |No request found for work item { iv_wi_id ALPHA = OUT }| ) ).
    ENDIF.

    validate( EXPORTING iv_mode = c_mode_approve CHANGING cs_request = cs_request ).

    lock_codegen( ).
    TRY.
        " 1. fill blank levels with the next free code
        LOOP AT gt_levels ASSIGNING FIELD-SYMBOL(<l>).
          ASSIGN COMPONENT <l>-code_fld OF STRUCTURE cs_request TO FIELD-SYMBOL(<code>).
          IF <code> IS INITIAL.
            <code> = next_code( <l>-level ).
          ENDIF.
        ENDLOOP.

        " 2. rows for the path; existing nodes are never overwritten (F3)
        DATA(lv_path) = ``.
        LOOP AT gt_levels ASSIGNING <l>.
          ASSIGN COMPONENT <l>-code_fld OF STRUCTURE cs_request TO <code>.
          ASSIGN COMPONENT <l>-desc_fld OF STRUCTURE cs_request TO FIELD-SYMBOL(<desc>).
          lv_path = lv_path && <code>.
          SELECT SINGLE vtexta FROM t179 WHERE stufe = @<l>-level AND prodh = @lv_path
            INTO @DATA(lv_old).
          IF sy-subrc = 0.
            IF lv_old <> <desc>.
              add_msg( EXPORTING iv_text = |{ <l>-title } { <code> } already exists as "{ lv_old }" – kept|
                                 iv_type = 'W' CHANGING ct_return = lt_return ).
            ENDIF.
            CONTINUE.
          ENDIF.
          APPEND VALUE t179( prodh = lv_path stufe = <l>-level prodha = <code>
                             vtexta = <desc> bezei = <desc> ) TO lt_t179.
          APPEND VALUE t179t( spras = 'E' prodh = lv_path vtext = <desc> ) TO lt_t179t.
        ENDLOOP.

        " 3. complete the work item (acting user = SY-UNAME)
        DATA(lv_trans_c) = |{ ls_ph-transaction_id ALPHA = OUT }|.
        /inowits/cl_wf=>complete(
          EXPORTING iv_workitem_id = iv_wi_id
                    iv_workitem_text = |Product Hierarchy & Costcenter assignment Req from { sy-uname } with ref to Transcation ID { lv_trans_c }|
          IMPORTING et_message = lt_msg ev_initiator_mail_id = lv_init_mail
                    et_mail_id = lt_mail_ids ev_is_next_lvl = lv_next_lvl ).
        IF line_exists( lt_msg[ msg_type = 'E' ] ).
          ROLLBACK WORK.
          RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
            FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
        ENDIF.

        " 4. write; the initiator's creation data stays (F4)
        ls_ph-banner = cs_request-banner.   ls_ph-banner_desc = cs_request-banner_desc.
        ls_ph-barnd = cs_request-brand.     ls_ph-brand_desc = cs_request-brand_desc.
        ls_ph-product = cs_request-product. ls_ph-product_desc = cs_request-product_desc.
        ls_ph-sku = cs_request-sku.         ls_ph-sku_desc = cs_request-sku_desc.
        ls_ph-variant = cs_request-variant. ls_ph-variant_desc = cs_request-variant_desc.
        ls_ph-scheme = cs_request-scheme.   ls_ph-scheme_desc = cs_request-scheme_desc.
        MODIFY zmdm_ph_create FROM ls_ph.
        IF lt_t179 IS NOT INITIAL.
          INSERT t179 FROM TABLE lt_t179 ACCEPTING DUPLICATE KEYS.
          INSERT t179t FROM TABLE lt_t179t ACCEPTING DUPLICATE KEYS.
        ENDIF.
        COMMIT WORK AND WAIT.
      CLEANUP.
        unlock_codegen( ).
    ENDTRY.
    unlock_codegen( ).

    DATA(lv_full) = hierarchy_of( cs_request ).
    send_mail(
      iv_subject = |Prd.Hier.creation req. ref.to Trans id { lv_trans_c }|
      it_lines = VALUE #( ( line = 'Dear Sir/Madam,' )
        ( line = |New Product Hierarchy successfully created, please assign Brand Cost Centre by using the MDM portal against transaction id { lv_trans_c }.| )
        ( line = |Product Hierarchy: { lv_full }| )
        ( line = |Product: { cs_request-banner }{ cs_request-brand }{ cs_request-product } { cs_request-product_desc }| )
        ( line = 'Regards,' ) ( line = 'MDM' ) ( line = 'Note:' )
        ( line = 'This is an auto-generated mail. Please do not reply.' ) )
      it_recipients = recipients( iv_banner = cs_request-banner iv_brand = cs_request-brand
                                  iv_initiator_mail = lv_init_mail it_wf_mails = lt_mail_ids
                                  iv_with_list = abap_true ) ).

    cs_request-transaction_id = ls_ph-transaction_id.
    cs_request-wi_id = ls_ph-wi_id.
    cs_request-hierarchy = lv_full.
    cs_request-initiator = ls_ph-ernam.
    cs_request-created_on = ls_ph-erdat.
    cs_request-created_at = ls_ph-ertim.
    cs_request-step = 'C'.
    cs_request-message = |Product Hierarchy created successfully. Reference Transaction ID is { lv_trans_c }|.
    IF lt_return IS NOT INITIAL.
      cs_request-message = |{ cs_request-message } ({ lt_return[ 1 ]-message })|.
    ENDIF.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Job C – Assign cost centre
*---------------------------------------------------------------------*
  METHOD assign_cost_center.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lt_mail_ids TYPE /inowits/m_mail_id_tt.
    DATA lv_init_mail TYPE string.
    DATA lv_next_lvl TYPE char1.
    DATA lt_return TYPE bapiret2_t.

    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_cost
                    IMPORTING ev_top_wi_id = DATA(lv_top) ).
    SELECT SINGLE * FROM zmdm_ph_create WHERE wi_id = @lv_top INTO @DATA(ls_ph).
    IF sy-subrc <> 0 OR ls_ph-product IS INITIAL.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = 'The product hierarchy of this request has not been created yet' ) ).
    ENDIF.

    DATA(lv_kostl) = CONV kostl( condense( iv_cost_center ) ).
    TRANSLATE lv_kostl TO UPPER CASE.
    IF lv_kostl IS INITIAL.
      add_msg( EXPORTING iv_text = 'Provide Costcenter' iv_field = 'CostCenter' CHANGING ct_return = lt_return ).
    ELSEIF strlen( lv_kostl ) <> 10 OR lv_kostl(3) <> 'BEH'.          " F8
      add_msg( EXPORTING iv_text = 'Costcenter should have 10 characters and start with BEH'
                         iv_field = 'CostCenter' CHANGING ct_return = lt_return ).
    ELSE.
      SELECT SINGLE ltext FROM cskt WHERE kostl = @lv_kostl AND spras = @sy-langu INTO @DATA(lv_ctext).
      IF sy-subrc <> 0.
        SELECT SINGLE ltext FROM cskt WHERE kostl = @lv_kostl AND spras = 'E' INTO @lv_ctext.
      ENDIF.
      IF sy-subrc <> 0 OR lv_ctext IS INITIAL.
        add_msg( EXPORTING iv_text = 'Invalid Costcenter. Choose from search help'
                           iv_field = 'CostCenter' CHANGING ct_return = lt_return ).
      ELSE.
        SELECT SINGLE kostl FROM csks WHERE kostl = @lv_kostl AND datbi >= @sy-datum INTO @DATA(lv_valid).
        IF sy-subrc <> 0.
          add_msg( EXPORTING iv_text = 'Costcenter is not valid today'
                             iv_field = 'CostCenter' CHANGING ct_return = lt_return ).
        ENDIF.
      ENDIF.
    ENDIF.
    raise_if_errors( lt_return ).

    DATA(lv_trans_c) = |{ ls_ph-transaction_id ALPHA = OUT }|.
    /inowits/cl_wf=>complete(
      EXPORTING iv_workitem_id = iv_wi_id
                iv_workitem_text = |Product Hierarchy costcenter assignment req from { sy-uname } with ref to Transcation ID { lv_trans_c }|
      IMPORTING et_message = lt_msg ev_initiator_mail_id = lv_init_mail
                et_mail_id = lt_mail_ids ev_is_next_lvl = lv_next_lvl ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.

    " OPEN ITEM: PRODHA / ZSALESBRAND of the old component come from the host (FINAL_PRODUCT node).
    " Written here as banner+brand+product and the product description – verify with a real row.
    DATA(ls_map) = VALUE zprod_hierarchy(
      prodha = |{ ls_ph-banner }{ ls_ph-barnd }{ ls_ph-product }|
      zsalesbrand = ls_ph-product_desc
      kostl = lv_kostl+3(7)
      ktext = lv_ctext
      level1 = ls_ph-banner level2 = ls_ph-barnd level3 = ls_ph-product ).
    MODIFY zprod_hierarchy FROM ls_map.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        ( type = 'E' message = 'The cost centre could not be saved – contact MDM support' ) ).
    ENDIF.
    COMMIT WORK AND WAIT.

    send_mail(
      iv_subject = |Prd.Hier. Costcenter asgnmnt req. ref.to Trans id { lv_trans_c }|
      it_lines = VALUE #( ( line = 'Dear Sir/Madam,' )
        ( line = |Product { ls_ph-banner }{ ls_ph-barnd }{ ls_ph-product } & costcenter { lv_kostl } successfully assigned against trans id { lv_trans_c }| )
        ( line = 'Regards,' ) ( line = 'SAP.' ) ( line = 'Note:' )
        ( line = 'This is an auto-generated mail. Please do not reply.' ) )
      it_recipients = recipients( iv_banner = ls_ph-banner iv_brand = ls_ph-barnd
                                  iv_initiator_mail = lv_init_mail it_wf_mails = lt_mail_ids
                                  iv_with_list = abap_true ) ).

    cs_request-transaction_id = ls_ph-transaction_id.
    cs_request-wi_id = ls_ph-wi_id.
    cs_request-cost_center = lv_kostl.
    cs_request-cost_center_desc = lv_ctext.
    cs_request-step = 'D'.
    cs_request-message = |Product Hierarchy & costcenter successfully assigned. Reference Transaction ID is { lv_trans_c }|.
  ENDMETHOD.

*---------------------------------------------------------------------*
* Optional – reject / send back (not in the Web Dynpro)
*---------------------------------------------------------------------*
  METHOD reject.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_approve ).
    /inowits/cl_wf=>reject( EXPORTING iv_workitem_id = iv_wi_id IMPORTING et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.
    COMMIT WORK AND WAIT.
  ENDMETHOD.

  METHOD send_back.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_approve ).
    /inowits/cl_wf=>sendback( EXPORTING iv_workitem_id = iv_wi_id IMPORTING et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = VALUE #(
        FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.
    COMMIT WORK AND WAIT.
  ENDMETHOD.

ENDCLASS.
```

---

## 7. SEGW project `ZMDM_PH`

1. SEGW → create project `ZMDM_PH` (Standard), package `ZEMAMI`.
2. Entity types and sets exactly as in section 3.1 (import by "Create → Data Model → Import → DDIC structure" is **not** used; the properties are
   defined by hand so the OData names stay CamelCase).
   * `LevelValue` – keys `Level`, `Prodh` – set `LevelValueSet` – *Creatable/Updatable/Deletable off*.
   * `CostCenter` – key `Kostl` – set `CostCenterSet` – read only.
   * `Request` – key `TransactionId` – set `RequestSet` – *Creatable on*, others off.
   * `WorkItem` – key `WiId` – set `WorkItemSet` – read only.
3. Navigation: association `WorkItem_Request` (`WorkItem.TransactionId` ↔ `Request.TransactionId`, 1:1), navigation property `ToRequest`.
4. Function imports (section 3.2), HTTP method POST, return type `Request`, cardinality 1. Parameter types as in 3.2, `Mode` String(1).
5. Generate runtime objects → `ZCL_ZMDM_PH_MPC`, `ZCL_ZMDM_PH_MPC_EXT`, `ZCL_ZMDM_PH_DPC`, `ZCL_ZMDM_PH_DPC_EXT`, model `ZMDM_PH_MDL`, service `ZMDM_PH_SRV`.
6. Register and activate: `/IWFND/MAINT_SERVICE` (`ZMDM_PH_SRV`, alias `LOCAL`), SICF node active; assign the portal users `S_SERVICE`.

---

## 8. ABAP – `ZCL_ZMDM_PH_DPC_EXT` (redefine these methods)

```abap
CLASS zcl_zmdm_ph_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zmdm_ph_dpc CREATE PUBLIC.
  PROTECTED SECTION.
    METHODS levelvalueset_get_entityset REDEFINITION.
    METHODS costcenterset_get_entityset REDEFINITION.
    METHODS requestset_get_entityset    REDEFINITION.
    METHODS requestset_get_entity       REDEFINITION.
    METHODS requestset_create_entity    REDEFINITION.
    METHODS workitemset_get_entityset   REDEFINITION.
    METHODS workitemset_get_entity      REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
  PRIVATE SECTION.
    METHODS raise_busi
      IMPORTING ix TYPE REF TO zcx_mdm_ph
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS param
      IMPORTING it_params TYPE /iwbep/t_mgw_name_value_pair iv_name TYPE string
      RETURNING VALUE(rv_value) TYPE string.
    METHODS to_request
      IMPORTING it_params TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_request) TYPE zcl_mdm_ph_core=>ty_request.
    METHODS filter_value
      IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_prop TYPE string
      RETURNING VALUE(rv_value) TYPE string.
ENDCLASS.

CLASS zcl_zmdm_ph_dpc_ext IMPLEMENTATION.

  METHOD raise_busi.
    DATA(lo_msg) = mo_context->get_message_container( ).
    LOOP AT ix->mt_return ASSIGNING FIELD-SYMBOL(<r>).
      lo_msg->add_message_text_only(
        iv_msg_type = <r>-type iv_msg_text = CONV #( <r>-message )
        iv_error_category = /iwbep/if_message_container=>gcs_error_category-processing
        iv_add_to_response_header = abap_false
        iv_message_target = CONV #( <r>-field ) ).
    ENDLOOP.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING message_container = lo_msg.
  ENDMETHOD.

  METHOD filter_value.
    READ TABLE it_filter ASSIGNING FIELD-SYMBOL(<f>) WITH KEY property = iv_prop.
    IF sy-subrc = 0 AND <f>-select_options IS NOT INITIAL.
      rv_value = <f>-select_options[ 1 ]-low.
    ENDIF.
  ENDMETHOD.

  METHOD param.
    rv_value = VALUE #( it_params[ name = iv_name ]-value DEFAULT `` ).
  ENDMETHOD.

  METHOD to_request.
    rs_request = VALUE #(
      banner = param( it_params = it_params iv_name = 'Banner' )
      banner_desc = param( it_params = it_params iv_name = 'BannerDesc' )
      brand = param( it_params = it_params iv_name = 'Brand' )
      brand_desc = param( it_params = it_params iv_name = 'BrandDesc' )
      product = param( it_params = it_params iv_name = 'Product' )
      product_desc = param( it_params = it_params iv_name = 'ProductDesc' )
      sku = param( it_params = it_params iv_name = 'Sku' )
      sku_desc = param( it_params = it_params iv_name = 'SkuDesc' )
      variant = param( it_params = it_params iv_name = 'Variant' )
      variant_desc = param( it_params = it_params iv_name = 'VariantDesc' )
      scheme = param( it_params = it_params iv_name = 'Scheme' )
      scheme_desc = param( it_params = it_params iv_name = 'SchemeDesc' ) ).
  ENDMETHOD.

  METHOD levelvalueset_get_entityset.
    DATA(lv_level) = filter_value( it_filter = it_filter_select_options iv_prop = 'Level' ).
    IF lv_level NOT BETWEEN '1' AND '6'.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception EXPORTING
        textid = /iwbep/cx_mgw_busi_exception=>business_error
        message_unlimited = 'Filter Level (1-6) is required'.
    ENDIF.
    DATA(lt_vals) = zcl_mdm_ph_core=>get_level_values(
      iv_level  = CONV i( lv_level )
      iv_code   = filter_value( it_filter = it_filter_select_options iv_prop = 'Code' )
      iv_text   = filter_value( it_filter = it_filter_select_options iv_prop = 'Text' )
      iv_parent = filter_value( it_filter = it_filter_select_options iv_prop = 'Parent' )
      iv_max    = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 500 ) ).
    et_entityset = CORRESPONDING #( lt_vals ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.

  METHOD costcenterset_get_entityset.
    et_entityset = CORRESPONDING #( zcl_mdm_ph_core=>get_cost_centers(
      iv_kostl = filter_value( it_filter = it_filter_select_options iv_prop = 'Kostl' )
      iv_text  = filter_value( it_filter = it_filter_select_options iv_prop = 'Text' )
      iv_max   = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 500 ) ) ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.

  METHOD requestset_get_entityset.
    DATA(lt_req) = zcl_mdm_ph_core=>get_requests(
      iv_initiator      = filter_value( it_filter = it_filter_select_options iv_prop = 'Initiator' )
      iv_transaction_id = filter_value( it_filter = it_filter_select_options iv_prop = 'TransactionId' )
      iv_wi_id          = filter_value( it_filter = it_filter_select_options iv_prop = 'WiId' )
      iv_max            = COND #( WHEN is_paging-top > 0 THEN is_paging-top + is_paging-skip ELSE 100 ) ).
    DATA(lv_step) = filter_value( it_filter = it_filter_select_options iv_prop = 'Step' ).
    IF lv_step IS NOT INITIAL.
      DELETE lt_req WHERE step <> lv_step.
    ENDIF.
    et_entityset = CORRESPONDING #( lt_req ).
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.
  ENDMETHOD.

  METHOD requestset_get_entity.
    DATA(lv_id) = VALUE string( it_key_tab[ name = 'TransactionId' ]-value OPTIONAL ).
    DATA(lt_req) = zcl_mdm_ph_core=>get_requests( iv_transaction_id = lv_id iv_max = 1 ).
    IF lt_req IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception EXPORTING
        textid = /iwbep/cx_mgw_busi_exception=>resource_not_found entity_type = iv_entity_name.
    ENDIF.
    er_entity = CORRESPONDING #( lt_req[ 1 ] ).
  ENDMETHOD.

  METHOD requestset_create_entity.            " job I – Initiate
    DATA ls_in TYPE zcl_mdm_ph_core=>ty_request.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    TRY.
        zcl_mdm_ph_core=>initiate( CHANGING cs_request = ls_in ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    er_entity = CORRESPONDING #( ls_in ).
  ENDMETHOD.

  METHOD workitemset_get_entityset.
    TRY.
        DATA(lt_items) = zcl_mdm_ph_core=>get_inbox( ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    et_entityset = CORRESPONDING #( lt_items ).
  ENDMETHOD.

  METHOD workitemset_get_entity.
    TRY.
        DATA(lt_items) = zcl_mdm_ph_core=>get_inbox( ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    DATA(lv_wi) = VALUE string( it_key_tab[ name = 'WiId' ]-value OPTIONAL ).
    READ TABLE lt_items INTO DATA(ls_item) WITH KEY wi_id = lv_wi.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception EXPORTING
        textid = /iwbep/cx_mgw_busi_exception=>resource_not_found entity_type = iv_entity_name.
    ENDIF.
    er_entity = CORRESPONDING #( ls_item ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    DATA(ls_req) = to_request( it_parameter ).
    TRY.
        CASE iv_action_name.
          WHEN 'Validate'.
            zcl_mdm_ph_core=>validate( EXPORTING iv_mode = CONV #( param( it_params = it_parameter iv_name = 'Mode' ) )
                                       CHANGING cs_request = ls_req ).
          WHEN 'Approve'.
            zcl_mdm_ph_core=>approve( EXPORTING iv_wi_id = CONV #( param( it_params = it_parameter iv_name = 'WiId' ) )
                                      CHANGING cs_request = ls_req ).
          WHEN 'AssignCostCenter'.
            zcl_mdm_ph_core=>assign_cost_center(
              EXPORTING iv_wi_id = CONV #( param( it_params = it_parameter iv_name = 'WiId' ) )
                        iv_cost_center = param( it_params = it_parameter iv_name = 'CostCenter' )
              CHANGING cs_request = ls_req ).
          WHEN 'RejectRequest'.
            zcl_mdm_ph_core=>reject( CONV #( param( it_params = it_parameter iv_name = 'WiId' ) ) ).
            ls_req-message = 'Request rejected'.
          WHEN 'SendBackRequest'.
            zcl_mdm_ph_core=>send_back( CONV #( param( it_params = it_parameter iv_name = 'WiId' ) ) ).
            ls_req-message = 'Request sent back'.
          WHEN OTHERS.
            RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception.
        ENDCASE.
      CATCH zcx_mdm_ph INTO DATA(lx).
        raise_busi( lx ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = CORRESPONDING zcl_zmdm_ph_mpc=>ts_request( ls_req )
                      CHANGING cr_data = er_data ).
  ENDMETHOD.

ENDCLASS.
```

Notes on the DPC:
* `copy_data_to_ref` and the typing `zcl_zmdm_ph_mpc=>ts_request` are generated by SEGW; the name follows your entity type name.
* `Validate` fills `Hierarchy` and the auto-filled descriptions; it returns errors as `errordetails`, so the portal shows the same messages as the old screen.
* `RequestSet` create reads the posted JSON into the same structure, so property names in section 3.1 must match `ty_request` after SEGW's CamelCase mapping (`BannerDesc` ↔ `BANNER_DESC`, `CostCenterDesc` ↔ `COST_CENTER_DESC`).

---

## 9. Contract the portal will use (JSON examples)

```http
GET  /sap/opu/odata/sap/ZMDM_PH_SRV/LevelValueSet?$filter=Level eq '3' and Parent eq '220596'&$top=50
GET  /sap/opu/odata/sap/ZMDM_PH_SRV/CostCenterSet?$filter=Text eq 'GLOW*'
GET  /sap/opu/odata/sap/ZMDM_PH_SRV/WorkItemSet
GET  /sap/opu/odata/sap/ZMDM_PH_SRV/RequestSet?$filter=Initiator eq 'MDM_USER1'&$top=6
POST /sap/opu/odata/sap/ZMDM_PH_SRV/Validate?Mode='I'&Banner='22'&BannerDesc=''&Brand='0596'&…
POST /sap/opu/odata/sap/ZMDM_PH_SRV/RequestSet            {"Banner":"22","Brand":"0596","Product":"","ProductDesc":"Rasnadi Churna", …}
POST /sap/opu/odata/sap/ZMDM_PH_SRV/Approve?WiId='000001046412'&Banner='22'&…
POST /sap/opu/odata/sap/ZMDM_PH_SRV/AssignCostCenter?WiId='000001059137'&CostCenter='BEH0000123'
```

Error example (Approve with an unknown SKU):

```json
{ "error": { "code": "/IWBEP/CM_MGW_RT/022", "message": { "value": "SKU 999 does not exist" },
  "innererror": { "errordetails": [ { "code": "Sku", "message": "SKU 999 does not exist", "severity": "error", "target": "Sku" } ] } } }
```

## 10. How this connects to the existing `mm-mdm` screen

`app/master/hierarchy` (`components/setup/HierarchyCrs.tsx`, data layer `lib/setupData.ts`) is a working demo of this app. The following
change when the service is live (none of it is done yet):

| In the demo | In the live version |
| --- | --- |
| 6 levels of **3 digits** (`PH_SEGMENT = 3`, `PH_LENGTH = 18`; README assumption 8) | Lengths **2 / 4 / 4 / 3 / 3 / 2** (`PH_LENGTH` stays 18). |
| Any level can be a **new typed code** | Banner and brand: existing only (F4). Product, SKU, variant, scheme: leave the code **empty and type a description**; the code is assigned when the approver confirms. The "Use next free code" button goes away. |
| `createHierarchy` stores the nodes in `localStorage` at once | `POST RequestSet` raises the request; the hierarchy exists only after step A. The "Recently created" list reads `RequestSet?$filter=Initiator eq <me>`. |
| No approver / cost-centre screen | Two new tabs next to *Product Hierarchy Creation* and *CRS Product Grouping*: **My tasks** (`WorkItemSet`) and **Task** (approve & create, or assign cost centre, with the request prefilled from `ToRequest`). |
| `getHierarchyOptions(level, path)` mock | `LevelValueSet?$filter=Level eq 'n' and Parent eq '<path>'`. |
| Cost centre field missing | `CostCenterSet` F4 (BEH*, valid). |
| Live switch | `lib/setupData.ts` keeps its function names; bodies call the hub backend route that forwards to `ZMDM_PH_SRV` (same way `lib/service.ts` is to be swapped for `ZMM_MDM_SRV`). The demo mode stays for the e2e tests. |
| CRS Product Grouping | **Out of scope** of this document: it is not part of the Web Dynpro component. Its backend (the "CRS Z-table") is still unspecified. |

---

## 11. Checks before the first activation (ABAP / Basis)

1. Paste classes in this order: `ZCX_MDM_PH`, `ZCL_MDM_PH_CORE`; activate. Likely first fixes: `SAP_WAPI_CREATE_WORKLIST` parameter names
   (verify in SE37 – `USER`, table `WORKLIST` of `SWR_WIHDR`), the data element names `SWW_TASK` and `SWR_WIHDR` field names (`WI_ID`, `WI_RH_TASK`, `WI_TEXT`,
   `WI_STAT`, `WI_CD`), `T179`-`PRODHA` / `VTEXTA` / `BEZEI` (custom fields in the old code, used as written there), and the `CP` pattern on `wi_text`.
2. `ZMDM_PH_CREATE` key: the old code uses `MODIFY` with the full row. If `WI_ID` is part of the key nothing changes; if not, the approve step updates the same
   row as before.
3. `SUBMIT rsconn01` and `SO_NEW_DOCUMENT_ATT_SEND_API1` need `S_OC_SEND` for the user; mail failures are swallowed by design.
4. Build the SEGW project, generate, register the service on the front-end server.

### Test cases (EDS first, a test banner/brand with a test agent)

| # | Steps | Expect |
| --- | --- | --- |
| 1 | `Validate` with a blank banner | error "Banner must be an existing code" |
| 2 | `Validate` with brand `0596` code but blank description | description filled from `T179` |
| 3 | `POST RequestSet` with existing banner/brand, new product + SKU + variant + scheme (descriptions only) | new transaction id, work item for the agent, mail to the initiator and the agents, `ZMDM_PH_CREATE` row |
| 4 | Same user, banner without `ZMDM_MAT` | authorisation error |
| 5 | `GET WorkItemSet` as the agent | the item with `Mode = A` |
| 6 | `Approve` | codes assigned (highest + 1 per level), 4 new `T179` rows and `T179T` texts, work item `C` created, mail |
| 7 | `Approve` twice at the same time (two sessions) | second one gets the lock message or the next free code, never the same code |
| 8 | `Approve` for an existing node with a different description | node unchanged, warning in `Message` |
| 9 | `AssignCostCenter` with `ABC0000001`, 9-char code, invalid code | errors on `CostCenter` |
| 10 | `AssignCostCenter` with a valid `BEH…` | `ZPROD_HIERARCHY` row, step `D`, mail |
| 11 | Open another user's work item id | "not in your inbox" |
| 12 | Product level at 9990 | "No free Product code left" |

## 12. Open questions for the SAP team

1. `ZPROD_HIERARCHY-PRODHA` content (section 1.4) – what the current application writes (the context node is filled by the host).
2. Are `TS90000124` (approve) and `TS90000122` (cost centre) the only tasks of workflow `PH`, and is a reviewer step ever a separate task? (Seen on EDS: reviewer block `TS90000124`, approver process, cost-centre `TS90000122`.)
3. Reject and send back: use the standard UWL, or expose them through the portal (the two optional function imports)?
4. Which authentication reaches the SAP service as the real user (Basic with the user's password, SSO, principal propagation)?
5. Are writes to `T179`/`T179T` allowed in the target client (customising protection) – they are written by the current Web Dynpro, so assumed yes.
