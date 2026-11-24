CLASS zcl_capex_doc DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_head,
             doctype    TYPE zcapex_de_doctype,
             docid      TYPE zcapex_de_docid,
             werks      TYPE werks_d,
             capextype  TYPE zcapex_de_cpxtype,
             amount     TYPE zcapex_de_amount,
             waers      TYPE waers,
             status     TYPE zcapex_de_status,
             curr_level TYPE zcapex_de_role,
             created_by TYPE xubname,
             budgetid   TYPE zcapex_de_budgetid,
             title      TYPE zcapex_de_title,
           END OF ty_head.

    CLASS-METHODS read
      IMPORTING iv_doctype     TYPE zcapex_de_doctype
                iv_docid       TYPE csequence
      RETURNING VALUE(rs_head) TYPE ty_head
      RAISING   zcx_capex_error.
    "! Plant of a document (buffered); blank when the document does not exist.
    CLASS-METHODS werks_of
      IMPORTING iv_doctype      TYPE zcapex_de_doctype
                iv_docid        TYPE csequence
      RETURNING VALUE(rv_werks) TYPE werks_d.
    "! Header status cache writer. QUOTA shows PENDING while in approval (UnitQuota screen).
    CLASS-METHODS update_status
      IMPORTING iv_doctype    TYPE zcapex_de_doctype
                iv_docid      TYPE csequence
                iv_status     TYPE zcapex_de_status
                iv_curr_level TYPE csequence OPTIONAL.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_werks,
             doctype TYPE zcapex_de_doctype,
             docid   TYPE zcapex_de_docid,
             werks   TYPE werks_d,
           END OF ty_werks.
    CLASS-DATA gt_werks TYPE HASHED TABLE OF ty_werks WITH UNIQUE KEY doctype docid.
ENDCLASS.



CLASS ZCL_CAPEX_DOC IMPLEMENTATION.


  METHOD read.
    DATA lv_docid TYPE zcapex_de_docid.
    DATA lv_found TYPE abap_bool.
    lv_docid = iv_docid.

    CASE iv_doctype.
      WHEN 'BUD'.
        SELECT SINGLE werks, capextype, amt_approved AS amount, waers, status, curr_level,
                      created_by, budgetid, title
          FROM zcapex_budget INTO CORRESPONDING FIELDS OF @rs_head
          WHERE budgetid = @lv_docid.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN 'CPE'.
        SELECT SINGLE werks, capextype, amount, waers, status, curr_level,
                      created_by, budgetid, title
          FROM zcapex_cpe INTO CORRESPONDING FIELDS OF @rs_head
          WHERE cpeid = @lv_docid.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN 'IC'.
        SELECT SINGLE werks, total_cost AS amount, waers, status, curr_level, created_by, title
          FROM zcapex_ic INTO CORRESPONDING FIELDS OF @rs_head
          WHERE icid = @lv_docid.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN 'QUOTA'.
        SELECT SINGLE werks, amount, waers, status, curr_level, created_by, title
          FROM zcapex_quota INTO CORRESPONDING FIELDS OF @rs_head
          WHERE quotaid = @lv_docid.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN 'CWIP'.
        SELECT SINGLE werks, amount, waers, status, created_by, budgetid, title
          FROM zcapex_cwip INTO CORRESPONDING FIELDS OF @rs_head
          WHERE cwipid = @lv_docid.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN 'PO'.
        DATA(lv_ebeln) = CONV ebeln( lv_docid ).
        SELECT SINGLE werks, amount, waers, status, title
          FROM zcapex_po INTO CORRESPONDING FIELDS OF @rs_head
          WHERE ebeln = @lv_ebeln.
        lv_found = xsdbool( sy-subrc = 0 ).
      WHEN OTHERS.
        lv_found = abap_false.
    ENDCASE.

    IF lv_found = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = iv_doctype iv_2 = lv_docid ).
    ENDIF.
    rs_head-doctype = iv_doctype.
    rs_head-docid   = lv_docid.
  ENDMETHOD.


  METHOD update_status.
    DATA: lv_table TYPE tabname,
          lv_key   TYPE fieldname,
          lv_level TYPE zcapex_de_role.

    DATA(lv_status) = iv_status.
    IF iv_doctype = 'QUOTA' AND lv_status = 'IN_APPROVAL'.
      lv_status = 'PENDING'.
    ENDIF.

    CASE iv_doctype.
      WHEN 'BUD'.   lv_table = 'ZCAPEX_BUDGET'. lv_key = 'BUDGETID'.
      WHEN 'CPE'.   lv_table = 'ZCAPEX_CPE'.    lv_key = 'CPEID'.
      WHEN 'IC'.    lv_table = 'ZCAPEX_IC'.     lv_key = 'ICID'.
      WHEN 'QUOTA'. lv_table = 'ZCAPEX_QUOTA'.  lv_key = 'QUOTAID'.
      WHEN 'CWIP'.  lv_table = 'ZCAPEX_CWIP'.   lv_key = 'CWIPID'.
      WHEN OTHERS.  RETURN.
    ENDCASE.

    DATA(lv_set) = |STATUS = { cl_abap_dyn_prg=>quote( CONV string( lv_status ) ) }| &&
                   |, CHANGED_BY = { cl_abap_dyn_prg=>quote( CONV string( zcl_capex_auth=>effective_user( ) ) ) }| &&
                   |, CHANGED_ON = { cl_abap_dyn_prg=>quote( CONV string( sy-datum ) ) }| &&
                   |, CHANGED_AT = { cl_abap_dyn_prg=>quote( CONV string( sy-uzeit ) ) }|.
    IF iv_curr_level IS SUPPLIED AND iv_doctype <> 'CWIP'.
      lv_level = iv_curr_level.
      lv_set = |{ lv_set }, CURR_LEVEL = { cl_abap_dyn_prg=>quote( CONV string( lv_level ) ) }|.
    ENDIF.
    DATA(lv_where) = |{ lv_key } = { cl_abap_dyn_prg=>quote( CONV string( iv_docid ) ) }|.

    UPDATE (lv_table) SET (lv_set) WHERE (lv_where).
  ENDMETHOD.


  METHOD werks_of.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    READ TABLE gt_werks INTO DATA(ls_w) WITH TABLE KEY doctype = iv_doctype docid = lv_docid.
    IF sy-subrc = 0.
      rv_werks = ls_w-werks.
      RETURN.
    ENDIF.
    TRY.
        rv_werks = read( iv_doctype = iv_doctype iv_docid = lv_docid )-werks.
      CATCH zcx_capex_error.
        CLEAR rv_werks.
    ENDTRY.
    INSERT VALUE #( doctype = iv_doctype docid = lv_docid werks = rv_werks ) INTO TABLE gt_werks.
  ENDMETHOD.
ENDCLASS.