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
        transaction_id   TYPE zmdm_ph_create-transaction_id,
        wi_id            TYPE zmdm_ph_create-wi_id,
        banner           TYPE zmdm_ph_create-banner,
        banner_desc      TYPE zmdm_ph_create-banner_desc,
        brand            TYPE zmdm_ph_create-barnd,
        brand_desc       TYPE zmdm_ph_create-brand_desc,
        product          TYPE zmdm_ph_create-product,
        product_desc     TYPE zmdm_ph_create-product_desc,
        sku              TYPE zmdm_ph_create-sku,
        sku_desc         TYPE zmdm_ph_create-sku_desc,
        variant          TYPE zmdm_ph_create-variant,
        variant_desc     TYPE zmdm_ph_create-variant_desc,
        scheme           TYPE zmdm_ph_create-scheme,
        scheme_desc      TYPE zmdm_ph_create-scheme_desc,
        hierarchy        TYPE c LENGTH 18,
        cost_center      TYPE kostl,
        cost_center_desc TYPE cskt-ltext,
        step             TYPE c LENGTH 1,
        initiator        TYPE zmdm_ph_create-ernam,
        created_on       TYPE zmdm_ph_create-erdat,
        created_at       TYPE zmdm_ph_create-ertim,
        message          TYPE c LENGTH 255,
      END OF ty_request,
      tt_request TYPE STANDARD TABLE OF ty_request WITH EMPTY KEY,

      BEGIN OF ty_level_value,
        level  TYPE c LENGTH 1,
        code   TYPE c LENGTH 4,
        text   TYPE c LENGTH 40,
        prodh  TYPE c LENGTH 18,
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
      IMPORTING iv_level         TYPE i
                iv_code          TYPE clike OPTIONAL
                iv_text          TYPE clike OPTIONAL
                iv_parent        TYPE clike OPTIONAL
                iv_max           TYPE i DEFAULT 500
      RETURNING VALUE(rt_values) TYPE tt_level_value.

    CLASS-METHODS get_cost_centers
      IMPORTING iv_kostl         TYPE clike OPTIONAL
                iv_text          TYPE clike OPTIONAL
                iv_max           TYPE i DEFAULT 500
      RETURNING VALUE(rt_values) TYPE tt_cost_center.

    CLASS-METHODS get_requests
      IMPORTING iv_initiator       TYPE clike OPTIONAL
                iv_transaction_id  TYPE clike OPTIONAL
                iv_wi_id           TYPE clike OPTIONAL
                iv_max             TYPE i DEFAULT 100
      RETURNING VALUE(rt_requests) TYPE tt_request.

    CLASS-METHODS get_inbox
      RETURNING VALUE(rt_items) TYPE tt_work_item
      RAISING   zcx_mdm_ph.

    CLASS-METHODS validate
      IMPORTING iv_mode    TYPE char1
      CHANGING  cs_request TYPE ty_request
      RAISING   zcx_mdm_ph.

    CLASS-METHODS initiate
      CHANGING cs_request TYPE ty_request
      RAISING  zcx_mdm_ph.

    CLASS-METHODS approve
      IMPORTING iv_wi_id   TYPE swwwihead-wi_id
      CHANGING  cs_request TYPE ty_request
      RAISING   zcx_mdm_ph.

    CLASS-METHODS assign_cost_center
      IMPORTING iv_wi_id       TYPE swwwihead-wi_id
                iv_cost_center TYPE clike
      CHANGING  cs_request     TYPE ty_request
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
      END OF ty_level_def,
      tt_recipient TYPE STANDARD TABLE OF somlrec90 WITH EMPTY KEY.
    CLASS-DATA gt_levels TYPE STANDARD TABLE OF ty_level_def WITH EMPTY KEY.

    CLASS-METHODS add_msg
      IMPORTING iv_text   TYPE string
                iv_field  TYPE string OPTIONAL
                iv_type   TYPE bapi_mtype DEFAULT 'E'
      CHANGING  ct_return TYPE bapiret2_t.
    CLASS-METHODS raise_if_errors
      IMPORTING it_return TYPE bapiret2_t
      RAISING   zcx_mdm_ph.
    CLASS-METHODS hierarchy_of
      IMPORTING is_request          TYPE ty_request
      RETURNING VALUE(rv_hierarchy) TYPE string.
    CLASS-METHODS check_authority
      IMPORTING iv_banner TYPE clike iv_brand TYPE clike
      RAISING   zcx_mdm_ph.
    CLASS-METHODS read_work_item
      IMPORTING iv_wi_id     TYPE swwwihead-wi_id
                iv_mode      TYPE char1
      EXPORTING es_head      TYPE swwwihead
                ev_top_wi_id TYPE swwwihead-top_wi_id
      RAISING   zcx_mdm_ph.
    CLASS-METHODS lock_codegen RAISING zcx_mdm_ph.
    CLASS-METHODS unlock_codegen.
    CLASS-METHODS next_code
      IMPORTING iv_level       TYPE i
      RETURNING VALUE(rv_code) TYPE string
      RAISING   zcx_mdm_ph.
    CLASS-METHODS need_cost_center
      IMPORTING is_request     TYPE ty_request
      RETURNING VALUE(rv_need) TYPE abap_bool.
    CLASS-METHODS resolve_gen_field
      IMPORTING iv_banner TYPE clike iv_brand TYPE clike iv_cost_flag TYPE char1
      RETURNING VALUE(rv_gen_field) TYPE /inowits/wf_gen_field
      RAISING   zcx_mdm_ph.
    CLASS-METHODS recipients
      IMPORTING iv_banner            TYPE clike
                iv_brand             TYPE clike
                iv_initiator_mail    TYPE string
                it_wf_mails          TYPE /inowits/m_mail_id_tt
                iv_with_list         TYPE abap_bool
      RETURNING VALUE(rt_recipients) TYPE tt_recipient.
    CLASS-METHODS send_mail
      IMPORTING iv_subject    TYPE string
                it_lines      TYPE soli_tab
                it_recipients TYPE tt_recipient.
ENDCLASS.



CLASS ZCL_MDM_PH_CORE IMPLEMENTATION.


  METHOD add_msg.
    APPEND VALUE #( type = iv_type message = iv_text field = iv_field ) TO ct_return.
  ENDMETHOD.


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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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
          RAISE EXCEPTION TYPE zcx_mdm_ph
            EXPORTING
              it_return = VALUE #(
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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
    RAISE EXCEPTION TYPE zcx_mdm_ph
      EXPORTING
        it_return = VALUE #( ( type = 'E'
        message = 'You are not authorized to initiate product hierarchy creation request for this banner/brand' ) ).
  ENDMETHOD.


  METHOD class_constructor.
    gt_levels = VALUE #(
      ( level = 1 code_fld = 'BANNER'  desc_fld = 'BANNER_DESC'  title = 'Banner'  len = 2 )
      ( level = 2 code_fld = 'BRAND'   desc_fld = 'BRAND_DESC'   title = 'Brand'   len = 4 )
      ( level = 3 code_fld = 'PRODUCT' desc_fld = 'PRODUCT_DESC' title = 'Product' len = 4 )
      ( level = 4 code_fld = 'SKU'     desc_fld = 'SKU_DESC'     title = 'SKU'     len = 3 )
      ( level = 5 code_fld = 'VARIANT' desc_fld = 'VARIANT_DESC' title = 'Variant' len = 3 )
      ( level = 6 code_fld = 'SCHEME'  desc_fld = 'SCHEME_DESC'  title = 'Scheme'  len = 2 ) ).
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


  METHOD get_inbox.
    " Worklist of the logged-on user (SAP_WAPI_CREATE_WORKLIST) filtered to the two PH tasks.
    DATA lt_worklist TYPE STANDARD TABLE OF swr_wihdr.
    CALL FUNCTION 'SAP_WAPI_CREATE_WORKLIST'
      EXPORTING
        user     = sy-uname
      TABLES
        worklist = lt_worklist
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
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


  METHOD get_level_values.
    DATA lv_code      TYPE c LENGTH 4.
    DATA lv_parent    TYPE c LENGTH 18.
    DATA lv_text      TYPE c LENGTH 40.
    DATA lv_prodh_like TYPE string.

    " Copy the generic (CLIKE) inputs into typed fields before using them in expressions
    lv_code   = iv_code.
    lv_parent = iv_parent.
    lv_text   = iv_text.
    REPLACE ALL OCCURRENCES OF '*' IN lv_text WITH '%'.
    lv_prodh_like = |{ lv_parent }%|.

    SELECT stufe, prodha, vtexta, prodh
      FROM t179
      WHERE stufe = @iv_level
        AND ( @lv_code = '' OR prodha = @lv_code )
        AND ( @lv_text = '' OR vtexta LIKE @lv_text )
        AND ( @lv_parent = '' OR prodh LIKE @lv_prodh_like )
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
    IF lv_parent IS INITIAL.
      SORT rt_values BY code text.
      DELETE ADJACENT DUPLICATES FROM rt_values COMPARING code text.
    ENDIF.
  ENDMETHOD.


  METHOD get_requests.
    DATA lv_initiator      TYPE zmdm_ph_create-ernam.
    DATA lv_transaction_id TYPE zmdm_ph_create-transaction_id.
    DATA lv_wi_id          TYPE zmdm_ph_create-wi_id.

    " Copy the generic (CLIKE) inputs into typed fields before using them in SQL
    lv_initiator      = iv_initiator.
    lv_transaction_id = iv_transaction_id.
    lv_wi_id          = iv_wi_id.

    SELECT * FROM zmdm_ph_create
      WHERE ( @lv_initiator = '' OR ernam = @lv_initiator )
        AND ( @lv_transaction_id = '' OR transaction_id = @lv_transaction_id )
        AND ( @lv_wi_id = '' OR wi_id = @lv_wi_id )
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

      " Step: D when no work item is open, A / C from the open work item
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


  METHOD hierarchy_of.
    LOOP AT gt_levels ASSIGNING FIELD-SYMBOL(<l>).
      ASSIGN COMPONENT <l>-code_fld OF STRUCTURE is_request TO FIELD-SYMBOL(<code>).
      rv_hierarchy = rv_hierarchy && <code>.
    ENDLOOP.
  ENDMETHOD.


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
      EXPORTING
        iv_app_id   = c_app_id
        iv_draft    = '0'
      IMPORTING
        ev_trans_id = lv_trans.
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
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


  METHOD lock_codegen.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = 'ZMDM_PH_CREATE'
        varkey         = 'CODEGEN'
        _scope         = '2'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = 'Another approval is generating codes – try again in a moment' ) ).
    ENDIF.
  ENDMETHOD.


  METHOD need_cost_center.
    DATA(lv_key) = |{ is_request-banner }{ is_request-brand }{ is_request-product }|.
    SELECT SINGLE kostl FROM zprod_hierarchy WHERE prodha = @lv_key INTO @DATA(lv_kostl).
    rv_need = xsdbool( sy-subrc <> 0 OR lv_kostl IS INITIAL ).
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
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = |No free { ls_lvl-title } code left (highest { lv_max })| ) ).
    ENDIF.
    rv_code = |{ lv_next WIDTH = ls_lvl-len ALIGN = RIGHT PAD = `0` }|.
  ENDMETHOD.


  METHOD raise_if_errors.
    IF line_exists( it_return[ type = 'E' ] ) OR line_exists( it_return[ type = 'A' ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = it_return.
    ENDIF.
  ENDMETHOD.


  METHOD read_work_item.
    DATA lt_worklist TYPE STANDARD TABLE OF swr_wihdr.
    CALL FUNCTION 'SAP_WAPI_CREATE_WORKLIST'
      EXPORTING
        user     = sy-uname
      TABLES
        worklist = lt_worklist
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0 OR NOT line_exists( lt_worklist[ wi_id = iv_wi_id ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = |Work item { iv_wi_id ALPHA = OUT } is not in your inbox| ) ).
    ENDIF.
    SELECT SINGLE * FROM swwwihead WHERE wi_id = @iv_wi_id INTO @es_head.
    IF sy-subrc <> 0 OR es_head-wi_stat NOT IN VALUE rseloption( sign = 'I' option = 'EQ'
         ( low = 'READY' ) ( low = 'SELECTED' ) ( low = 'STARTED' ) ).
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = 'The work item is no longer open' ) ).
    ENDIF.
    DATA(lv_is_cost) = xsdbool( es_head-wi_text CP |{ c_text_cost }*| ).
    IF ( iv_mode = c_mode_cost AND lv_is_cost = abap_false )
    OR ( iv_mode = c_mode_approve AND ( lv_is_cost = abap_true OR es_head-wi_rh_task <> c_task_approve ) ).
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = 'This work item is not for this action' ) ).
    ENDIF.
    ev_top_wi_id = es_head-top_wi_id.
  ENDMETHOD.


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


  METHOD reject.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_approve ).
    /inowits/cl_wf=>reject( EXPORTING iv_workitem_id = iv_wi_id IMPORTING et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


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
        RAISE EXCEPTION TYPE zcx_mdm_ph
          EXPORTING
            it_return = VALUE #(
            ( type = 'E' message = lt_msg[ msg_type = 'E' ]-line ) ).
      ENDIF.
    ENDDO.
  ENDMETHOD.


  METHOD send_back.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    read_work_item( EXPORTING iv_wi_id = iv_wi_id iv_mode = c_mode_approve ).
    /inowits/cl_wf=>sendback( EXPORTING iv_workitem_id = iv_wi_id IMPORTING et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD send_mail.
    CHECK it_recipients IS NOT INITIAL.

    DATA ls_doc   TYPE sodocchgi1.
    DATA lt_pack  TYPE STANDARD TABLE OF sopcklsti1 WITH EMPTY KEY.
    DATA lt_rec   TYPE STANDARD TABLE OF somlrec90  WITH EMPTY KEY.
    DATA lt_txt   TYPE soli_tab.
    DATA ls_pack  TYPE sopcklsti1.

    ls_doc-obj_name   = 'MAILALEART'.
    ls_doc-obj_langu  = sy-langu.
    ls_doc-obj_descr  = iv_subject.
    ls_doc-sensitivty = 'F'.

    ls_pack-transf_bin  = space.
    ls_pack-head_start  = 1.
    ls_pack-head_num    = 0.
    ls_pack-body_start  = 1.
    ls_pack-body_num    = lines( it_lines ).
    ls_pack-doc_type    = 'RAW'.
    APPEND ls_pack TO lt_pack.

    lt_rec = it_recipients.
    lt_txt = it_lines.

    CALL FUNCTION 'SO_NEW_DOCUMENT_ATT_SEND_API1'
      EXPORTING
        document_data = ls_doc
        put_in_outbox = 'X'
        commit_work   = 'X'
      TABLES
        packing_list  = lt_pack
        contents_txt  = lt_txt
        receivers     = lt_rec
      EXCEPTIONS
        OTHERS        = 8.
    IF sy-subrc = 0.
      SUBMIT rsconn01 WITH mode = 'INT' AND RETURN.
    ENDIF.
    " A mail problem never undoes the business transaction.
  ENDMETHOD.


  METHOD unlock_codegen.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING
        mode_rstable = 'E'
        tabname      = 'ZMDM_PH_CREATE'
        varkey       = 'CODEGEN'.
  ENDMETHOD.


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
        IF CONV string( <code> ) CN '0123456789'.
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
ENDCLASS.