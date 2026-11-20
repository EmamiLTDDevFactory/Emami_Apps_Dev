CLASS zcl_mdm_crs_core DEFINITION PUBLIC FINAL CREATE PUBLIC.
  "! CRS product grouping (replaces Web Dynpro ZCRS_PRODUCT_GROUP): CRS product > CRS product group > CRS SKU group.
  "! Same contract as ZCL_MDM_PH_CORE: validate / initiate / approve / reject, errors as ZCX_MDM_PH.
  PUBLIC SECTION.
    CONSTANTS:
      c_app_id        TYPE /inowits/wf_app_id VALUE 'CR',
      c_text_prefix   TYPE string             VALUE 'CRS Group Creation Req',
      c_mode_initiate TYPE char1              VALUE 'I',
      c_mode_approve  TYPE char1              VALUE 'A'.

    TYPES:
      BEGIN OF ty_request,
        transaction_id TYPE zmdm_cr_create-transaction_id,
        wi_id          TYPE zmdm_cr_create-wi_id,
        crs_prod       TYPE zmdm_cr_create-crsprd,
        crs_prod_desc  TYPE zmdm_cr_create-crsprd_desc,
        prd_grp        TYPE zmdm_cr_create-prd_grp,
        prd_grp_desc   TYPE zmdm_cr_create-prd_grp_desc,
        sku_grp        TYPE zmdm_cr_create-sku_grp,
        sku_grp_desc   TYPE zmdm_cr_create-sku_grp_desc,
        bus_vert       TYPE zmdm_cr_create-bus_vert,
        sku_size       TYPE zmdm_cr_create-zskusize,
        unit           TYPE zmdm_cr_create-meins,
        comments       TYPE zmdm_cr_create-comments,
        fl_name        TYPE zmdm_cr_create-fl_name,
        fl_type        TYPE zmdm_cr_create-fl_type,
        fl_data        TYPE xstring,
        step           TYPE c LENGTH 1,
        initiator      TYPE zmdm_cr_create-ernam,
        created_on     TYPE zmdm_cr_create-erdat,
        created_at     TYPE zmdm_cr_create-ertim,
        message        TYPE c LENGTH 255,
      END OF ty_request,
      tt_request TYPE STANDARD TABLE OF ty_request WITH EMPTY KEY,

      BEGIN OF ty_value,
        level    TYPE c LENGTH 1,
        code     TYPE c LENGTH 10,
        text     TYPE c LENGTH 40,
        crs_prod TYPE c LENGTH 10,
        prd_grp  TYPE c LENGTH 3,
        sku_size TYPE zcrs_sku_grp-zskusize,
        unit     TYPE zcrs_sku_grp-meins,
      END OF ty_value,
      tt_value TYPE STANDARD TABLE OF ty_value WITH EMPTY KEY,

      BEGIN OF ty_vertical,
        code TYPE c LENGTH 2,
        text TYPE c LENGTH 60,
      END OF ty_vertical,
      tt_vertical TYPE STANDARD TABLE OF ty_vertical WITH EMPTY KEY,

      BEGIN OF ty_work_item,
        wi_id          TYPE swwwihead-wi_id,
        transaction_id TYPE zmdm_cr_create-transaction_id,
        mode           TYPE c LENGTH 1,
        text           TYPE c LENGTH 255,
        status         TYPE swwwihead-wi_stat,
        initiator      TYPE zmdm_cr_create-ernam,
        created_on     TYPE swwwihead-wi_cd,
      END OF ty_work_item,
      tt_work_item TYPE STANDARD TABLE OF ty_work_item WITH EMPTY KEY.

    "! Level 1 = CRS product, 2 = group (needs iv_prod), 3 = SKU group (needs iv_prod + iv_group)
    CLASS-METHODS get_values
      IMPORTING iv_level         TYPE i
                iv_prod          TYPE clike OPTIONAL
                iv_group         TYPE clike OPTIONAL
                iv_code          TYPE clike OPTIONAL
                iv_text          TYPE clike OPTIONAL
                iv_max           TYPE i DEFAULT 500
      RETURNING VALUE(rt_values) TYPE tt_value.

    CLASS-METHODS get_verticals
      RETURNING VALUE(rt_values) TYPE tt_vertical.

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

    CLASS-METHODS reject
      IMPORTING iv_wi_id TYPE swwwihead-wi_id
      RAISING   zcx_mdm_ph.

    "! Next free number below a parent: numeric maximum + 1 (the old screen compared as text and always gave 001)
    CLASS-METHODS next_code
      IMPORTING iv_level       TYPE i
                iv_prod        TYPE clike OPTIONAL
                iv_group       TYPE clike OPTIONAL
      RETURNING VALUE(rv_code) TYPE string.

  PRIVATE SECTION.
    TYPES tt_recipient TYPE STANDARD TABLE OF somlrec90 WITH EMPTY KEY.

    CLASS-METHODS add_msg
      IMPORTING iv_text   TYPE string
                iv_field  TYPE string OPTIONAL
                iv_type   TYPE bapi_mtype DEFAULT 'E'
      CHANGING  ct_return TYPE bapiret2_t.
    CLASS-METHODS raise_if_errors
      IMPORTING it_return TYPE bapiret2_t
      RAISING   zcx_mdm_ph.
    CLASS-METHODS check_authority
      IMPORTING iv_prod TYPE clike iv_group TYPE clike
      RAISING   zcx_mdm_ph.
    CLASS-METHODS read_work_item
      IMPORTING iv_wi_id     TYPE swwwihead-wi_id
      EXPORTING es_head      TYPE swwwihead
                ev_top_wi_id TYPE swwwihead-top_wi_id
      RAISING   zcx_mdm_ph.
    CLASS-METHODS lock_codegen RAISING zcx_mdm_ph.
    CLASS-METHODS unlock_codegen.
    CLASS-METHODS file_path
      IMPORTING iv_name        TYPE clike
      RETURNING VALUE(rv_path) TYPE string.
    CLASS-METHODS recipients
      IMPORTING iv_vertical          TYPE clike
                iv_initiator_mail    TYPE string
                it_wf_mails          TYPE /inowits/m_mail_id_tt
                iv_with_list         TYPE abap_bool
      RETURNING VALUE(rt_recipients) TYPE tt_recipient.
    CLASS-METHODS send_mail
      IMPORTING iv_subject    TYPE string
                it_lines      TYPE soli_tab
                it_recipients TYPE tt_recipient.
    CLASS-METHODS start_workflow
      IMPORTING is_request     TYPE ty_request
                iv_trans       TYPE /inowits/transid
                iv_simulate    TYPE abap_bool OPTIONAL
      EXPORTING ev_wi_id       TYPE swr_struct-workitemid
                ev_init_mail   TYPE string
                et_mail_ids    TYPE /inowits/m_mail_id_tt
                et_message     TYPE /inowits/wf_msg_tt.
ENDCLASS.



CLASS zcl_mdm_crs_core IMPLEMENTATION.


  METHOD add_msg.
    APPEND VALUE #( type = iv_type message = iv_text field = iv_field ) TO ct_return.
  ENDMETHOD.


  METHOD raise_if_errors.
    IF line_exists( it_return[ type = 'E' ] ) OR line_exists( it_return[ type = 'A' ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph EXPORTING it_return = it_return.
    ENDIF.
  ENDMETHOD.


  METHOD file_path.
    DATA(lv_dir) = SWITCH string( sy-sysid
                     WHEN 'EDS' THEN `/sftproot/CRS_GRP/EDS/`
                     WHEN 'EQS' THEN `/sftproot/CRS_GRP/EQS/`
                     WHEN 'EPR' THEN `/sftproot/CRS_GRP/EPR/`
                     ELSE `/sftproot/CRS_GRP/EDS/` ).
    rv_path = |{ lv_dir }_{ iv_name }|.
    CONDENSE rv_path.
  ENDMETHOD.


  METHOD get_verticals.
    SELECT zbusiness, zdesc FROM zbus_grp ORDER BY zbusiness INTO TABLE @DATA(lt_bv).
    LOOP AT lt_bv ASSIGNING FIELD-SYMBOL(<b>).
      APPEND VALUE #( code = <b>-zbusiness text = <b>-zdesc ) TO rt_values.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_values.
    DATA lv_raw  TYPE c LENGTH 40.
    DATA lv_code TYPE c LENGTH 10.
    DATA lv_text TYPE c LENGTH 42.
    lv_raw = to_upper( CONV string( iv_text ) ).
    lv_text = |%{ lv_raw }%|.
    lv_code = to_upper( CONV string( iv_code ) ).
    DATA(lv_prod) = CONV zcrsprd( iv_prod ).
    DATA(lv_group) = CONV zprd_grp( iv_group ).
    CASE iv_level.
      WHEN 1.
        SELECT crsprd, vtext FROM zcrs_prd
          WHERE ( @lv_code = '' OR crsprd = @lv_code )
            AND ( @lv_raw = '' OR vtext LIKE @lv_text )
          ORDER BY crsprd
          INTO TABLE @DATA(lt_prd) UP TO @iv_max ROWS.
        LOOP AT lt_prd ASSIGNING FIELD-SYMBOL(<p>).
          APPEND VALUE #( level = '1' code = <p>-crsprd text = <p>-vtext crs_prod = <p>-crsprd ) TO rt_values.
        ENDLOOP.
      WHEN 2.
        SELECT crsprd, prd_grp, vtext FROM zcrs_prd_grp
          WHERE crsprd = @lv_prod
            AND ( @lv_code = '' OR prd_grp = @lv_code )
            AND ( @lv_raw = '' OR vtext LIKE @lv_text )
          ORDER BY prd_grp
          INTO TABLE @DATA(lt_grp) UP TO @iv_max ROWS.
        LOOP AT lt_grp ASSIGNING FIELD-SYMBOL(<g>).
          APPEND VALUE #( level = '2' code = <g>-prd_grp text = <g>-vtext crs_prod = <g>-crsprd
                          prd_grp = <g>-prd_grp ) TO rt_values.
        ENDLOOP.
      WHEN 3.
        SELECT crsprd, prd_grp, sku_grp, vtext, zskusize, meins FROM zcrs_sku_grp
          WHERE crsprd = @lv_prod AND prd_grp = @lv_group
            AND ( @lv_code = '' OR sku_grp = @lv_code )
            AND ( @lv_raw = '' OR vtext LIKE @lv_text )
          ORDER BY sku_grp
          INTO TABLE @DATA(lt_sku) UP TO @iv_max ROWS.
        LOOP AT lt_sku ASSIGNING FIELD-SYMBOL(<s>).
          APPEND VALUE #( level = '3' code = <s>-sku_grp text = <s>-vtext crs_prod = <s>-crsprd
                          prd_grp = <s>-prd_grp sku_size = <s>-zskusize unit = <s>-meins ) TO rt_values.
        ENDLOOP.
    ENDCASE.
  ENDMETHOD.


  METHOD get_requests.
    DATA lt_rows TYPE STANDARD TABLE OF zmdm_cr_create WITH EMPTY KEY.
    DATA lv_trans_raw TYPE c LENGTH 12.
    DATA lv_wi_raw TYPE c LENGTH 12.
    DATA lv_ini TYPE c LENGTH 12.
    lv_trans_raw = iv_transaction_id.
    lv_wi_raw = iv_wi_id.
    lv_ini = iv_initiator.
    DATA(lv_trans) = CONV zmdm_cr_create-transaction_id( |{ lv_trans_raw ALPHA = IN }| ).
    DATA(lv_wi) = CONV zmdm_cr_create-wi_id( |{ lv_wi_raw ALPHA = IN }| ).
    SELECT * FROM zmdm_cr_create
      WHERE ( @lv_trans_raw = '' OR transaction_id = @lv_trans )
        AND ( @lv_wi_raw = '' OR wi_id = @lv_wi )
        AND ( @lv_ini = '' OR ernam = @lv_ini )
      ORDER BY transaction_id DESCENDING
      INTO TABLE @lt_rows UP TO @iv_max ROWS.
    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      APPEND VALUE #(
        transaction_id = <r>-transaction_id wi_id = <r>-wi_id
        crs_prod = <r>-crsprd crs_prod_desc = <r>-crsprd_desc
        prd_grp = <r>-prd_grp prd_grp_desc = <r>-prd_grp_desc
        sku_grp = <r>-sku_grp sku_grp_desc = <r>-sku_grp_desc
        bus_vert = <r>-bus_vert sku_size = <r>-zskusize unit = <r>-meins
        comments = <r>-comments fl_name = <r>-fl_name fl_type = <r>-fl_type
        step = COND #( WHEN <r>-approver_ind = 'X' THEN 'C' ELSE 'A' )
        initiator = <r>-ernam created_on = <r>-erdat created_at = <r>-ertim ) TO rt_requests.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_inbox.
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
    LOOP AT lt_worklist ASSIGNING FIELD-SYMBOL(<w>).
      CHECK <w>-wi_text CP |{ c_text_prefix }*|.
      SELECT SINGLE top_wi_id FROM swwwihead WHERE wi_id = @<w>-wi_id INTO @DATA(lv_top).
      DATA(ls_cr) = VALUE zmdm_cr_create( ).
      SELECT SINGLE transaction_id, ernam FROM zmdm_cr_create WHERE wi_id = @lv_top
        INTO CORRESPONDING FIELDS OF @ls_cr.
      CHECK sy-subrc = 0.
      APPEND VALUE #( wi_id = <w>-wi_id transaction_id = ls_cr-transaction_id mode = c_mode_approve
                      text = <w>-wi_text status = <w>-wi_stat initiator = ls_cr-ernam
                      created_on = <w>-wi_cd ) TO rt_items.
    ENDLOOP.
    SORT rt_items BY wi_id DESCENDING.
  ENDMETHOD.


  METHOD next_code.
    DATA lv_max TYPE decfloat34.
    DATA(lv_prod_in) = CONV zcrsprd( iv_prod ).
    DATA(lv_group_in) = CONV zprd_grp( iv_group ).
    CASE iv_level.
      WHEN 1.
        SELECT crsprd, vtext FROM zcrs_prd INTO TABLE @DATA(lt_p).
        LOOP AT lt_p ASSIGNING FIELD-SYMBOL(<p>).
          IF <p>-crsprd CO '0123456789 '.
            DATA(lv_n) = CONV decfloat34( <p>-crsprd ).
            " only the nine digit series counts; a stray ten digit code must not push the counter
            IF strlen( condense( CONV string( <p>-crsprd ) ) ) = 9 AND lv_n > lv_max. lv_max = lv_n. ENDIF.
          ENDIF.
        ENDLOOP.
        rv_code = |{ CONV i( lv_max + 1 ) WIDTH = 9 ALIGN = RIGHT PAD = `0` }|.
      WHEN 2.
        DATA(lv_prod) = lv_prod_in.
        SELECT prd_grp, vtext FROM zcrs_prd_grp WHERE crsprd = @lv_prod INTO TABLE @DATA(lt_g).
        LOOP AT lt_g ASSIGNING FIELD-SYMBOL(<g>).
          IF <g>-prd_grp CO '0123456789 '.
            lv_n = <g>-prd_grp.
            IF lv_n > lv_max. lv_max = lv_n. ENDIF.
          ENDIF.
        ENDLOOP.
        " groups are 2 digits until 99, then 3 digits (existing data has both)
        rv_code = COND #( WHEN lv_max + 1 <= 99 THEN |{ CONV i( lv_max + 1 ) WIDTH = 2 ALIGN = RIGHT PAD = `0` }|
                          ELSE |{ CONV i( lv_max + 1 ) WIDTH = 3 ALIGN = RIGHT PAD = `0` }| ).
      WHEN 3.
        lv_prod = lv_prod_in.
        DATA(lv_group) = lv_group_in.
        SELECT sku_grp, vtext FROM zcrs_sku_grp WHERE crsprd = @lv_prod AND prd_grp = @lv_group
          INTO TABLE @DATA(lt_s).
        LOOP AT lt_s ASSIGNING FIELD-SYMBOL(<s>).
          IF <s>-sku_grp CO '0123456789 '.
            lv_n = <s>-sku_grp.
            IF lv_n > lv_max. lv_max = lv_n. ENDIF.
          ENDIF.
        ENDLOOP.
        rv_code = |{ CONV i( lv_max + 1 ) WIDTH = 3 ALIGN = RIGHT PAD = `0` }|.
    ENDCASE.
  ENDMETHOD.


  METHOD validate.
    DATA lt_return TYPE bapiret2_t.

    cs_request-crs_prod_desc = to_upper( cs_request-crs_prod_desc ).
    cs_request-prd_grp_desc  = to_upper( cs_request-prd_grp_desc ).
    cs_request-sku_grp_desc  = to_upper( cs_request-sku_grp_desc ).
    cs_request-prd_grp = |{ cs_request-prd_grp }|.

    " business vertical
    DATA(lt_vert) = get_verticals( ).
    IF cs_request-bus_vert IS INITIAL.
      add_msg( EXPORTING iv_text = 'Business Vertical not maintained' iv_field = 'BusVert' CHANGING ct_return = lt_return ).
    ELSEIF NOT line_exists( lt_vert[ code = cs_request-bus_vert ] ).
      add_msg( EXPORTING iv_text = |Business Vertical { cs_request-bus_vert } is not valid| iv_field = 'BusVert'
               CHANGING ct_return = lt_return ).
    ENDIF.

    " a new parent cannot have existing children
    IF cs_request-crs_prod IS INITIAL AND ( cs_request-prd_grp IS NOT INITIAL OR cs_request-sku_grp IS NOT INITIAL ).
      add_msg( EXPORTING iv_text = 'Leave the CRS group and SKU group codes blank when the CRS product is new'
               iv_field = 'CrsProd' CHANGING ct_return = lt_return ).
    ELSEIF cs_request-prd_grp IS INITIAL AND cs_request-sku_grp IS NOT INITIAL.
      add_msg( EXPORTING iv_text = 'Leave the SKU group code blank when the CRS group is new'
               iv_field = 'PrdGrp' CHANGING ct_return = lt_return ).
    ENDIF.

    " level 1: CRS product
    IF cs_request-crs_prod IS INITIAL AND cs_request-crs_prod_desc IS INITIAL.
      add_msg( EXPORTING iv_text = 'CRS product: code and description cannot both be blank' iv_field = 'CrsProd'
               CHANGING ct_return = lt_return ).
    ELSEIF cs_request-crs_prod IS NOT INITIAL.
      SELECT SINGLE vtext FROM zcrs_prd WHERE crsprd = @cs_request-crs_prod INTO @DATA(lv_ptext).
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_text = 'CRS product does not exist' iv_field = 'CrsProd' CHANGING ct_return = lt_return ).
      ELSEIF cs_request-crs_prod_desc IS INITIAL.
        cs_request-crs_prod_desc = lv_ptext.
      ELSEIF cs_request-crs_prod_desc <> lv_ptext.
        add_msg( EXPORTING iv_text = |CRS product description mismatch (it is "{ lv_ptext }")| iv_field = 'CrsProdDesc'
                 CHANGING ct_return = lt_return ).
      ENDIF.
    ELSE.
      SELECT SINGLE crsprd FROM zcrs_prd WHERE vtext = @cs_request-crs_prod_desc INTO @DATA(lv_pdup).
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_text = |CRS product description already exists as { lv_pdup } - use that code|
                 iv_field = 'CrsProdDesc' CHANGING ct_return = lt_return ).
      ENDIF.
    ENDIF.

    " level 2: CRS group (only checked when the product is known)
    IF cs_request-prd_grp IS INITIAL AND cs_request-prd_grp_desc IS INITIAL.
      add_msg( EXPORTING iv_text = 'CRS group: code and description cannot both be blank' iv_field = 'PrdGrp'
               CHANGING ct_return = lt_return ).
    ELSEIF cs_request-prd_grp IS NOT INITIAL AND cs_request-crs_prod IS NOT INITIAL.
      SELECT SINGLE vtext FROM zcrs_prd_grp
        WHERE crsprd = @cs_request-crs_prod AND prd_grp = @cs_request-prd_grp INTO @DATA(lv_gtext).
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_text = 'CRS group does not exist' iv_field = 'PrdGrp' CHANGING ct_return = lt_return ).
      ELSEIF cs_request-prd_grp_desc IS INITIAL.
        cs_request-prd_grp_desc = lv_gtext.
      ELSEIF cs_request-prd_grp_desc <> lv_gtext.
        add_msg( EXPORTING iv_text = |CRS group description mismatch (it is "{ lv_gtext }")| iv_field = 'PrdGrpDesc'
                 CHANGING ct_return = lt_return ).
      ENDIF.
    ELSEIF cs_request-prd_grp IS INITIAL AND cs_request-crs_prod IS NOT INITIAL.
      SELECT SINGLE prd_grp FROM zcrs_prd_grp
        WHERE crsprd = @cs_request-crs_prod AND vtext = @cs_request-prd_grp_desc INTO @DATA(lv_gdup).
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_text = |CRS group description already exists as { lv_gdup } in this product - use that code|
                 iv_field = 'PrdGrpDesc' CHANGING ct_return = lt_return ).
      ENDIF.
    ENDIF.

    " level 3: CRS SKU group
    IF cs_request-sku_grp IS INITIAL AND cs_request-sku_grp_desc IS INITIAL.
      add_msg( EXPORTING iv_text = 'CRS SKU group: code and description cannot both be blank' iv_field = 'SkuGrp'
               CHANGING ct_return = lt_return ).
    ELSEIF cs_request-sku_grp IS NOT INITIAL AND cs_request-prd_grp IS NOT INITIAL AND cs_request-crs_prod IS NOT INITIAL.
      SELECT SINGLE vtext FROM zcrs_sku_grp
        WHERE crsprd = @cs_request-crs_prod AND prd_grp = @cs_request-prd_grp AND sku_grp = @cs_request-sku_grp
        INTO @DATA(lv_stext).
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_text = 'CRS SKU group does not exist' iv_field = 'SkuGrp' CHANGING ct_return = lt_return ).
      ELSEIF cs_request-sku_grp_desc IS INITIAL.
        cs_request-sku_grp_desc = lv_stext.
      ELSEIF cs_request-sku_grp_desc <> lv_stext.
        add_msg( EXPORTING iv_text = |CRS SKU group description mismatch (it is "{ lv_stext }")| iv_field = 'SkuGrpDesc'
                 CHANGING ct_return = lt_return ).
      ENDIF.
    ELSEIF cs_request-sku_grp IS INITIAL AND cs_request-prd_grp IS NOT INITIAL AND cs_request-crs_prod IS NOT INITIAL.
      SELECT SINGLE sku_grp FROM zcrs_sku_grp
        WHERE crsprd = @cs_request-crs_prod AND prd_grp = @cs_request-prd_grp AND vtext = @cs_request-sku_grp_desc
        INTO @DATA(lv_sdup).
      IF sy-subrc = 0.
        add_msg( EXPORTING iv_text = |CRS SKU group description already exists as { lv_sdup } in this group - use that code|
                 iv_field = 'SkuGrpDesc' CHANGING ct_return = lt_return ).
      ENDIF.
    ENDIF.

    " unit of measure
    IF cs_request-unit IS NOT INITIAL.
      SELECT SINGLE msehi FROM t006 WHERE msehi = @cs_request-unit INTO @DATA(lv_unit).
      IF sy-subrc <> 0.
        add_msg( EXPORTING iv_text = |Unit { cs_request-unit } does not exist| iv_field = 'Unit' CHANGING ct_return = lt_return ).
      ENDIF.
    ENDIF.

    " the initiator must attach the supporting document
    IF iv_mode = c_mode_initiate AND ( cs_request-fl_name IS INITIAL OR cs_request-fl_data IS INITIAL ).
      add_msg( EXPORTING iv_text = 'Please upload file to proceed' iv_field = 'FlName' CHANGING ct_return = lt_return ).
    ENDIF.

    raise_if_errors( lt_return ).
  ENDMETHOD.


  METHOD check_authority.
    " Same rule as the old screen: '*', else CRS product*, else CRS product + group*
    DATA lv_prdha TYPE c LENGTH 18.
    DO 3 TIMES.
      lv_prdha = SWITCH #( sy-index WHEN 1 THEN '*'
                                    WHEN 2 THEN |{ iv_prod }*|
                                    ELSE |{ iv_prod }{ iv_group }*| ).
      AUTHORITY-CHECK OBJECT 'ZMDM_MAT' ID 'PRDHA' FIELD lv_prdha.
      IF sy-subrc = 0.
        RETURN.
      ENDIF.
    ENDDO.
    RAISE EXCEPTION TYPE zcx_mdm_ph
      EXPORTING
        it_return = VALUE #( ( type = 'E'
        message = 'You are not authorized to initiate CRS product creation request for this CRS group' ) ).
  ENDMETHOD.


  METHOD start_workflow.
    DATA(lv_text) = |{ c_text_prefix } from { sy-uname } with ref to Transcation ID { |{ iv_trans ALPHA = OUT }| }|.
    DATA(lv_field) = CONV /inowits/wf_gen_field( '' ).
    DATA lv_assign TYPE char1.
    DATA lv_next TYPE char1.
    DO 2 TIMES.
      CLEAR et_message.
      IF iv_simulate = abap_true.
        /inowits/cl_wf=>start(
          EXPORTING iv_app_id = c_app_id iv_gen_type = CONV #( is_request-bus_vert )
                    iv_gen_field = lv_field iv_trans_id = iv_trans iv_workitem_text = lv_text
                    iv_simulate = 'X' assign_costcenter = lv_assign
          IMPORTING ev_workitem_id = ev_wi_id et_message = et_message ).
      ELSE.
        /inowits/cl_wf=>start(
          EXPORTING iv_app_id = c_app_id iv_gen_type = CONV #( is_request-bus_vert )
                    iv_gen_field = lv_field iv_trans_id = iv_trans iv_workitem_text = lv_text
                    assign_costcenter = lv_assign
          IMPORTING ev_workitem_id = ev_wi_id et_message = et_message
                    ev_initiator_mail_id = ev_init_mail et_mail_id = et_mail_ids
                    ev_is_next_lvl = lv_next ).
      ENDIF.
      " the agent is usually maintained for gen_field '*', try that when the specific one fails
      IF line_exists( et_message[ msg_type = 'E' ] ) AND lv_field IS INITIAL.
        lv_field = '*'.
      ELSE.
        EXIT.
      ENDIF.
    ENDDO.
  ENDMETHOD.


  METHOD initiate.
    DATA lt_mail_ids TYPE /inowits/m_mail_id_tt.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lv_init_mail TYPE string.
    DATA lv_wi TYPE swr_struct-workitemid.
    DATA lv_trans TYPE /inowits/transid.

    validate( EXPORTING iv_mode = c_mode_initiate CHANGING cs_request = cs_request ).
    check_authority( iv_prod = cs_request-crs_prod iv_group = cs_request-prd_grp ).

    " the file goes to the same application server directory as before
    DATA(lv_path) = file_path( cs_request-fl_name ).
    OPEN DATASET lv_path FOR OUTPUT IN BINARY MODE.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = |The attachment could not be stored on the server ({ lv_path })| ) ).
    ENDIF.
    TRANSFER cs_request-fl_data TO lv_path.
    CLOSE DATASET lv_path.

    CALL FUNCTION '/INOWITS/M_TRANSID_GENERATE'
      EXPORTING
        iv_app_id   = c_app_id
        iv_draft    = '0'
      IMPORTING
        ev_trans_id = lv_trans.
    DATA(lv_trans_c) = |{ lv_trans ALPHA = OUT }|.

    start_workflow( EXPORTING is_request = cs_request iv_trans = lv_trans
                    IMPORTING ev_wi_id = lv_wi ev_init_mail = lv_init_mail
                              et_mail_ids = lt_mail_ids et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.

    DATA(ls_row) = VALUE zmdm_cr_create(
      transaction_id = lv_trans wi_id = lv_wi
      crsprd = cs_request-crs_prod crsprd_desc = cs_request-crs_prod_desc
      prd_grp = cs_request-prd_grp prd_grp_desc = cs_request-prd_grp_desc
      sku_grp = cs_request-sku_grp sku_grp_desc = cs_request-sku_grp_desc
      comments = cs_request-comments bus_vert = cs_request-bus_vert
      zskusize = cs_request-sku_size meins = cs_request-unit
      fl_name = cs_request-fl_name fl_type = cs_request-fl_type
      initiator_ind = 'X'
      erdat = sy-datum ernam = sy-uname ertim = sy-timlo ).
    MODIFY zmdm_cr_create FROM ls_row.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #(
          ( type = 'E' message = |The request was started (work item { lv_wi }) but could not be saved - contact MDM support| ) ).
    ENDIF.
    COMMIT WORK AND WAIT.

    send_mail(
      iv_subject = |CRS Group Creation req. ref.to Trans id { lv_trans_c }|
      it_lines = VALUE #( ( line = 'Dear Sir/Madam,' )
        ( line = |CRS Group creation request has been raised with trans id { lv_trans_c } and it is waiting at reviewer/approver process| )
        ( line = 'Regards,' ) ( line = 'SAP.' ) ( line = 'Note:' )
        ( line = 'This is an auto-generated mail. Please do not reply.' ) )
      it_recipients = recipients( iv_vertical = cs_request-bus_vert iv_initiator_mail = lv_init_mail
                                  it_wf_mails = lt_mail_ids iv_with_list = abap_false ) ).

    CLEAR cs_request-fl_data.
    cs_request-transaction_id = lv_trans.
    cs_request-wi_id = lv_wi.
    cs_request-initiator = sy-uname.
    cs_request-created_on = sy-datum.
    cs_request-created_at = sy-timlo.
    cs_request-step = 'A'.
    cs_request-message = |CRS Group Creation Request has been raised successfully. Reference Transaction ID is { lv_trans_c }|.
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
          it_return = VALUE #( ( type = 'E' message = |Work item { iv_wi_id ALPHA = OUT } is not in your inbox| ) ).
    ENDIF.
    SELECT SINGLE * FROM swwwihead WHERE wi_id = @iv_wi_id INTO @es_head.
    IF sy-subrc <> 0 OR es_head-wi_stat NOT IN VALUE rseloption( sign = 'I' option = 'EQ'
         ( low = 'READY' ) ( low = 'SELECTED' ) ( low = 'STARTED' ) ).
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = 'The work item is no longer open' ) ).
    ENDIF.
    IF NOT es_head-wi_text CP |{ c_text_prefix }*|.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = 'This work item is not a CRS group request' ) ).
    ENDIF.
    ev_top_wi_id = es_head-top_wi_id.
  ENDMETHOD.


  METHOD lock_codegen.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = 'ZCRS_PRD'
        varkey         = 'CODEGEN'
        _scope         = '2'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = 'Another approval is generating codes - try again in a moment' ) ).
    ENDIF.
  ENDMETHOD.


  METHOD unlock_codegen.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING
        mode_rstable = 'E'
        tabname      = 'ZCRS_PRD'
        varkey       = 'CODEGEN'.
  ENDMETHOD.


  METHOD approve.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA lt_mail_ids TYPE /inowits/m_mail_id_tt.
    DATA lv_init_mail TYPE string.
    DATA lv_next_lvl TYPE char1.
    DATA lt_prd TYPE STANDARD TABLE OF zcrs_prd WITH EMPTY KEY.
    DATA lt_grp TYPE STANDARD TABLE OF zcrs_prd_grp WITH EMPTY KEY.
    DATA lt_sku TYPE STANDARD TABLE OF zcrs_sku_grp WITH EMPTY KEY.

    read_work_item( EXPORTING iv_wi_id = iv_wi_id IMPORTING ev_top_wi_id = DATA(lv_top) ).
    SELECT SINGLE * FROM zmdm_cr_create WHERE wi_id = @lv_top INTO @DATA(ls_cr).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = |No request found for work item { iv_wi_id ALPHA = OUT }| ) ).
    ENDIF.
    IF ls_cr-approver_ind = 'X'.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( ( type = 'E' message = 'This request has already been approved' ) ).
    ENDIF.

    " the approver works on what the initiator asked for; descriptions and codes are re-checked now
    cs_request-crs_prod = ls_cr-crsprd.   cs_request-crs_prod_desc = ls_cr-crsprd_desc.
    cs_request-prd_grp = ls_cr-prd_grp.   cs_request-prd_grp_desc = ls_cr-prd_grp_desc.
    cs_request-sku_grp = ls_cr-sku_grp.   cs_request-sku_grp_desc = ls_cr-sku_grp_desc.
    cs_request-bus_vert = ls_cr-bus_vert.
    IF cs_request-sku_size IS INITIAL. cs_request-sku_size = ls_cr-zskusize. ENDIF.
    IF cs_request-unit IS INITIAL. cs_request-unit = ls_cr-meins. ENDIF.
    IF cs_request-comments IS INITIAL. cs_request-comments = ls_cr-comments. ENDIF.
    validate( EXPORTING iv_mode = c_mode_approve CHANGING cs_request = cs_request ).

    lock_codegen( ).
    TRY.
        " 1. fill blank levels with the next free code (parent first)
        DATA(lv_prod) = cs_request-crs_prod.
        IF lv_prod IS INITIAL.
          lv_prod = CONV #( next_code( 1 ) ).
          APPEND VALUE #( crsprd = lv_prod vtext = cs_request-crs_prod_desc ) TO lt_prd.
        ENDIF.
        DATA(lv_group) = cs_request-prd_grp.
        IF lv_group IS INITIAL.
          lv_group = CONV #( next_code( iv_level = 2 iv_prod = lv_prod ) ).
          APPEND VALUE #( crsprd = lv_prod prd_grp = lv_group vtext = cs_request-prd_grp_desc ) TO lt_grp.
        ENDIF.
        DATA(lv_sku) = cs_request-sku_grp.
        IF lv_sku IS INITIAL.
          lv_sku = CONV #( next_code( iv_level = 3 iv_prod = lv_prod iv_group = lv_group ) ).
          APPEND VALUE #( crsprd = lv_prod prd_grp = lv_group sku_grp = lv_sku vtext = cs_request-sku_grp_desc
                          zskusize = cs_request-sku_size meins = cs_request-unit ) TO lt_sku.
        ENDIF.

        " 2. complete the work item (acting user = SY-UNAME)
        DATA(lv_trans_c) = |{ ls_cr-transaction_id ALPHA = OUT }|.
        /inowits/cl_wf=>complete(
          EXPORTING iv_workitem_id = iv_wi_id
                    iv_workitem_text = |{ c_text_prefix } from { sy-uname } with ref to Transcation ID { lv_trans_c }|
          IMPORTING et_message = lt_msg ev_initiator_mail_id = lv_init_mail
                    et_mail_id = lt_mail_ids ev_is_next_lvl = lv_next_lvl ).
        IF line_exists( lt_msg[ msg_type = 'E' ] ).
          ROLLBACK WORK.
          RAISE EXCEPTION TYPE zcx_mdm_ph
            EXPORTING
              it_return = VALUE #( FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
        ENDIF.

        " 3. write: request row, then the master rows (existing rows are never overwritten)
        ls_cr-crsprd = lv_prod.  ls_cr-prd_grp = lv_group.  ls_cr-sku_grp = lv_sku.
        ls_cr-crsprd_desc = cs_request-crs_prod_desc.
        ls_cr-prd_grp_desc = cs_request-prd_grp_desc.
        ls_cr-sku_grp_desc = cs_request-sku_grp_desc.
        ls_cr-zskusize = cs_request-sku_size.  ls_cr-meins = cs_request-unit.
        ls_cr-comments = cs_request-comments.
        ls_cr-approver_ind = 'X'.
        MODIFY zmdm_cr_create FROM ls_cr.
        IF lt_prd IS NOT INITIAL.
          INSERT zcrs_prd FROM TABLE lt_prd ACCEPTING DUPLICATE KEYS.
        ENDIF.
        IF lt_grp IS NOT INITIAL.
          INSERT zcrs_prd_grp FROM TABLE lt_grp ACCEPTING DUPLICATE KEYS.
        ENDIF.
        IF lt_sku IS NOT INITIAL.
          INSERT zcrs_sku_grp FROM TABLE lt_sku ACCEPTING DUPLICATE KEYS.
        ENDIF.
        COMMIT WORK AND WAIT.
      CLEANUP.
        unlock_codegen( ).
    ENDTRY.
    unlock_codegen( ).

    send_mail(
      iv_subject = |CRS Group creation req. ref.to Trans id { lv_trans_c }|
      it_lines = VALUE #( ( line = 'Dear Sir/Madam,' )
        ( line = |New CRS Group Creation successfully created against transaction id { lv_trans_c }| )
        ( line = 'Item details are as below :-' )
        ( line = |CRS product { lv_prod } { cs_request-crs_prod_desc }| )
        ( line = |CRS group { lv_group } { cs_request-prd_grp_desc }| )
        ( line = |CRS SKU group { lv_sku } { cs_request-sku_grp_desc }| )
        ( line = 'Regards,' ) ( line = 'MDM' ) ( line = 'Note:' )
        ( line = 'This is an auto-generated mail. Please do not reply.' ) )
      it_recipients = recipients( iv_vertical = cs_request-bus_vert iv_initiator_mail = lv_init_mail
                                  it_wf_mails = lt_mail_ids iv_with_list = abap_true ) ).

    cs_request-crs_prod = lv_prod.
    cs_request-prd_grp = lv_group.
    cs_request-sku_grp = lv_sku.
    cs_request-transaction_id = ls_cr-transaction_id.
    cs_request-wi_id = ls_cr-wi_id.
    cs_request-fl_name = ls_cr-fl_name.
    cs_request-fl_type = ls_cr-fl_type.
    CLEAR cs_request-fl_data.
    cs_request-initiator = ls_cr-ernam.
    cs_request-created_on = ls_cr-erdat.
    cs_request-created_at = ls_cr-ertim.
    cs_request-step = 'C'.
    cs_request-message = |CRS group created: { lv_prod }/{ lv_group }/{ lv_sku }. Reference Transaction ID is { lv_trans_c }|.
  ENDMETHOD.


  METHOD reject.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    read_work_item( EXPORTING iv_wi_id = iv_wi_id ).
    /inowits/cl_wf=>reject( EXPORTING iv_workitem_id = iv_wi_id IMPORTING et_message = lt_msg ).
    IF line_exists( lt_msg[ msg_type = 'E' ] ).
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_mdm_ph
        EXPORTING
          it_return = VALUE #( FOR m IN lt_msg WHERE ( msg_type = 'E' ) ( type = 'E' message = m-line ) ).
    ENDIF.
    COMMIT WORK AND WAIT.
  ENDMETHOD.


  METHOD recipients.
    DATA(lv_type) = CONV /inowits/wf_gen_type( iv_vertical ).
    DATA lt_mail TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    IF iv_initiator_mail IS NOT INITIAL.
      APPEND iv_initiator_mail TO lt_mail.
    ENDIF.
    LOOP AT it_wf_mails ASSIGNING FIELD-SYMBOL(<m>).
      APPEND CONV string( <m> ) TO lt_mail.
    ENDLOOP.

    SELECT agent FROM /inowits/wf_role
      WHERE app_id = @c_app_id AND gen_type = @lv_type AND gen_field = '*'
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
    ENDIF.

    IF iv_with_list = abap_true.
      SELECT mail FROM /inowits/f_mail
        WHERE app_id = @c_app_id AND gen_type = @lv_type AND gen_field = '*'
        INTO TABLE @DATA(lt_dl).
      LOOP AT lt_dl ASSIGNING FIELD-SYMBOL(<d>).
        APPEND CONV string( <d>-mail ) TO lt_mail.
      ENDLOOP.
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
ENDCLASS.
