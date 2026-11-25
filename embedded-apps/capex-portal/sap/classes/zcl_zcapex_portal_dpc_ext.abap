class ZCL_ZCAPEX_PORTAL_DPC_EXT definition
  public
  inheriting from ZCL_ZCAPEX_PORTAL_DPC
  create public .

public section.

  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_ENTITY
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~UPDATE_ENTITY
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~DELETE_ENTITY
    redefinition .

  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_STREAM
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~EXECUTE_ACTION
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_STREAM
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_ENTITYSET
    redefinition .
  methods /IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_ENTITY
    redefinition .
protected section.

  methods APPROVALINBOXSET_GET_ENTITYSET
    redefinition .
  methods APPROVALSTEPSET_GET_ENTITYSET
    redefinition .
  methods AUDITLOGSET_GET_ENTITYSET
    redefinition .
  methods BUDGETCASHFLOWSE_GET_ENTITYSET
    redefinition .
  methods BUDGETSET_CREATE_ENTITY
    redefinition .
  methods BUDGETSET_GET_ENTITY
    redefinition .
  methods BUDGETSET_GET_ENTITYSET
    redefinition .
  methods BUDGETSET_UPDATE_ENTITY
    redefinition .
  methods CONFIGSET_GET_ENTITYSET
    redefinition .
  methods CPECASHFLOWSET_GET_ENTITYSET
    redefinition .
  methods CPESET_CREATE_ENTITY
    redefinition .
  methods CPESET_GET_ENTITY
    redefinition .
  methods CPESET_GET_ENTITYSET
    redefinition .
  methods CPESET_UPDATE_ENTITY
    redefinition .
  methods CURRENTUSERSET_GET_ENTITY
    redefinition .
  methods CURRENTUSERSET_GET_ENTITYSET
    redefinition .
  methods CWIPAGEINGSET_GET_ENTITYSET
    redefinition .
  methods CWIPSET_GET_ENTITY
    redefinition .
  methods CWIPSET_GET_ENTITYSET
    redefinition .
  methods DASHBOARDKPISET_GET_ENTITY
    redefinition .
  methods DASHBOARDKPISET_GET_ENTITYSET
    redefinition .
  methods DASHCATEGORYSET_GET_ENTITYSET
    redefinition .
  methods DASHTRENDSET_GET_ENTITYSET
    redefinition .
  methods DOACHAINSET_GET_ENTITYSET
    redefinition .
  methods DOARULESET_GET_ENTITY
    redefinition .
  methods DOARULESET_GET_ENTITYSET
    redefinition .
  methods DOCUMENTSET_DELETE_ENTITY
    redefinition .
  methods DOCUMENTSET_GET_ENTITY
    redefinition .
  methods DOCUMENTSET_GET_ENTITYSET
    redefinition .
  methods GRNSET_GET_ENTITYSET
    redefinition .
  methods INSTALLCERTSET_CREATE_ENTITY
    redefinition .
  methods INSTALLCERTSET_GET_ENTITY
    redefinition .
  methods INSTALLCERTSET_GET_ENTITYSET
    redefinition .
  methods INSTALLCERTSET_UPDATE_ENTITY
    redefinition .
  methods NOTIFICATION1SET_GET_ENTITYSET
    redefinition .
  methods PURCHASEORDERSET_GET_ENTITY
    redefinition .
  methods PURCHASEORDERSET_GET_ENTITYSET
    redefinition .
  methods QUOTAITEMSET_GET_ENTITY
    redefinition .
  methods QUOTAITEMSET_GET_ENTITYSET
    redefinition .
  methods QUOTASUMMARYSET_GET_ENTITYSET
    redefinition .
  methods USERPLANTSET_GET_ENTITYSET
    redefinition .
  methods VALUEHELPSET_GET_ENTITYSET
    redefinition .
  methods VENDORSET_GET_ENTITYSET
    redefinition .
  methods VENDSET_GET_ENTITYSET
    redefinition .
  methods DOCUMENTSET_CREATE_ENTITY
    redefinition .
private section.

  methods STORE_DOCUMENT
    importing
      !IS_DOC type ZCAPEX_DOC
      !IV_CONTENT type XSTRING
      !IV_MIME type STRING
    returning
      value(RS_DOC) type ZCAPEX_DOC
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION
      /IWBEP/CX_MGW_TECH_EXCEPTION .

  methods CAPTURE_IDENTITY .

  types:
    BEGIN OF ty_vis,
      doctype TYPE zcapex_de_doctype,
      docid   TYPE zcapex_de_docid,
      visible TYPE abap_bool,
    END OF ty_vis .
  types:
    tt_vis TYPE HASHED TABLE OF ty_vis WITH UNIQUE KEY doctype docid .

  data MT_PARAM type /IWBEP/T_MGW_NAME_VALUE_PAIR .
  data MT_VIS type TT_VIS .

  methods P
    importing
      !IV_NAME type STRING
    returning
      value(RV_VALUE) type STRING .
  methods KEY_VALUE
    importing
      !IT_KEY_TAB type /IWBEP/T_MGW_NAME_VALUE_PAIR
      !IV_NAME type STRING
    returning
      value(RV_VALUE) type STRING .
  methods FILTER_VALUE
    importing
      !IO_TECH type ref to /IWBEP/IF_MGW_REQ_ENTITYSET
      !IV_PROPERTY type STRING
    returning
      value(RV_VALUE) type STRING .
  methods FISCAL_FROM_REQUEST
    importing
      !IT_KEY_TAB type /IWBEP/T_MGW_NAME_VALUE_PAIR
      !IO_TECH type ref to /IWBEP/IF_MGW_REQ_ENTITYSET optional
    returning
      value(RV_FISCAL) type GJAHR .
  methods FINISH_LIST
    importing
      !IO_TECH type ref to /IWBEP/IF_MGW_REQ_ENTITYSET
      !IS_PAGING type /IWBEP/S_MGW_PAGING
    exporting
      !ES_RESPONSE_CONTEXT type /IWBEP/IF_MGW_APPL_SRV_RUNTIME=>TY_S_MGW_RESPONSE_CONTEXT
    changing
      !CT_DATA type STANDARD TABLE .
  methods ADMIN_ALLOWED
    returning
      value(RV_OK) type ABAP_BOOL .
  methods ADMIN_READ
    importing
      !IV_KIND type CSEQUENCE
    returning
      value(RV_JSON) type STRING
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION .
  methods ADMIN_SAVE
    importing
      !IV_KIND type CSEQUENCE
      !IV_JSON type STRING
    returning
      value(RV_MSG) type STRING
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION .
  methods RAISE_BUSI
    importing
      !IV_TEXT type CSEQUENCE
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION .
  methods RAISE_NOT_FOUND
    importing
      !IV_ENTITY type STRING
    raising
      /IWBEP/CX_MGW_BUSI_EXCEPTION .
  methods DOC_VISIBLE
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
    returning
      value(RV_VISIBLE) type ABAP_BOOL .
  methods MAP_BUDGET
    importing
      !IS_DB type ZCAPEX_BUDGET
    returning
      value(RS_OUT) type ZCAPEX_S_BUDGET .
  methods MAP_CPE
    importing
      !IS_DB type ZCAPEX_CPE
    returning
      value(RS_OUT) type ZCAPEX_S_CPE .
  methods MAP_CWIP
    importing
      !IS_DB type ZCAPEX_CWIP
    returning
      value(RS_OUT) type ZCAPEX_S_CWIP .
  methods MAP_PO
    importing
      !IS_DB type ZCAPEX_PO
    returning
      value(RS_OUT) type ZCAPEX_S_PO .
  methods MAP_IC
    importing
      !IS_DB type ZCAPEX_IC
    returning
      value(RS_OUT) type ZCAPEX_S_IC .
  methods MAP_QUOTA
    importing
      !IS_DB type ZCAPEX_QUOTA
    returning
      value(RS_OUT) type ZCAPEX_S_QUOTA .
  methods MAP_DOC
    importing
      !IS_DB type ZCAPEX_DOC
    returning
      value(RS_OUT) type ZCAPEX_S_DOC .
  methods READ_BUDGET_DEEP
    importing
      !IV_BUDGETID type ZCAPEX_DE_BUDGETID
    returning
      value(RS_OUT) type ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_BUDGET_DEEP .
  methods READ_CPE_DEEP
    importing
      !IV_CPEID type ZCAPEX_DE_CPEID
    returning
      value(RS_OUT) type ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_CPE_DEEP .
  methods ACT
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_DECISION type ZCAPEX_DE_DECISION
      !IV_COMMENT type CSEQUENCE optional
      !IV_ROLLOUT type ABAP_BOOL optional
    returning
      value(RS_RES) type ZCAPEX_S_ACTRES
    raising
      ZCX_CAPEX_ERROR .
  methods RESULT
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_MESSAGE type CSEQUENCE optional
    returning
      value(RS_RES) type ZCAPEX_S_ACTRES
    raising
      ZCX_CAPEX_ERROR .
  methods BUILD_KPI
    importing
      !IV_FISCAL type GJAHR
    returning
      value(RS_KPI) type ZCAPEX_S_DASHKPI .
ENDCLASS.



CLASS ZCL_ZCAPEX_PORTAL_DPC_EXT IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
    capture_identity( ).
    DATA: ls_budget   TYPE zcl_zcapex_portal_mpc_ext=>ts_budget_deep,
          ls_cpe      TYPE zcl_zcapex_portal_mpc_ext=>ts_cpe_deep,
          lv_budgetid TYPE zcapex_de_budgetid.

    CASE iv_entity_set_name.
      WHEN 'BudgetSet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_budget ).
        TRY.
            IF ls_budget-budgetid IS INITIAL.
              lv_budgetid = zcl_capex_buddoc=>create( is_budget    = CORRESPONDING #( ls_budget )
                                                      it_cashflows = ls_budget-budgettocashflows
                                                      it_items     = ls_budget-budgettoitems ).
            ELSE.
              " Re-save of an existing DRAFT: header, cash flows and items replaced by what was sent.
              zcl_capex_buddoc=>update( is_budget           = CORRESPONDING #( ls_budget )
                                        it_cashflows        = ls_budget-budgettocashflows
                                        it_items            = ls_budget-budgettoitems
                                        iv_replace_children = abap_true ).
              lv_budgetid = ls_budget-budgetid.
            ENDIF.
          CATCH zcx_capex_error INTO DATA(lx_bud).
            raise_busi( lx_bud->get_text( ) ).
        ENDTRY.
        ls_budget = read_budget_deep( lv_budgetid ).
        copy_data_to_ref( EXPORTING is_data = ls_budget CHANGING cr_data = er_deep_entity ).

      WHEN 'CPESet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_cpe ).
        TRY.
            IF ls_cpe-cpeid IS INITIAL.
              DATA(lv_cpeid) = zcl_capex_cpe=>create( is_cpe       = CORRESPONDING #( ls_cpe )
                                                      it_vendors   = ls_cpe-cpetovendors
                                                      it_cashflows = ls_cpe-cpetocashflows ).
            ELSE.
              " Re-save of an existing DRAFT/BLOCKED CPE: no new CPE number is drawn. Header is updated,
              " vendors and cash flows are replaced by what was sent (same rules as zcl_capex_cpe=>create).
              lv_cpeid = ls_cpe-cpeid.
              SELECT SINGLE werks, status, waers FROM zcapex_cpe INTO @DATA(ls_old) WHERE cpeid = @lv_cpeid.
              IF sy-subrc <> 0.
                zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = lv_cpeid ).
              ENDIF.
              zcl_capex_auth=>check_plant( ls_old-werks ).
              IF ls_old-status <> 'DRAFT' AND ls_old-status <> 'BLOCKED'.
                zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                                        iv_1 = 'CPE' iv_2 = lv_cpeid iv_3 = ls_old-status ).
              ENDIF.

              DATA: lt_ven TYPE zcl_capex_cpe=>tt_ven,
                    lt_cf  TYPE STANDARD TABLE OF zcapex_cpecf WITH DEFAULT KEY,
                    lv_yr  TYPE zcapex_de_yearnr,
                    lv_sel TYPE zcapex_de_venseq.

              LOOP AT ls_cpe-cpetovendors INTO DATA(ls_vin).
                IF ls_vin-vendorname IS INITIAL AND ls_vin-quote_amt <= 0.
                  CONTINUE.
                ENDIF.
                DATA(ls_ven) = CORRESPONDING zcapex_cpeven( ls_vin ).
                ls_ven-cpeid = lv_cpeid.
                ls_ven-waers = ls_old-waers.
                IF ls_ven-vendorseq IS INITIAL.
                  ls_ven-vendorseq = |V{ lines( lt_ven ) + 1 }|.
                ENDIF.
                IF ls_ven-lifnr IS NOT INITIAL.
                  ls_ven-lifnr = |{ ls_ven-lifnr ALPHA = IN }|.
                ENDIF.
                APPEND ls_ven TO lt_ven.
              ENDLOOP.
              " L1..Ln by quote, lowest first (same as zcl_capex_cpe=>rank_vendors, which is not public)
              DATA(lt_sorted) = lt_ven.
              DELETE lt_sorted WHERE quote_amt <= 0.
              SORT lt_sorted BY quote_amt ASCENDING.
              LOOP AT lt_ven ASSIGNING FIELD-SYMBOL(<ls_rk>).
                CLEAR <ls_rk>-ranking.
              ENDLOOP.
              LOOP AT lt_sorted INTO DATA(ls_sorted).
                DATA(lv_rank) = sy-tabix.
                READ TABLE lt_ven ASSIGNING <ls_rk> WITH KEY vendorseq = ls_sorted-vendorseq.
                IF sy-subrc = 0.
                  <ls_rk>-ranking = |L{ lv_rank }|.
                ENDIF.
              ENDLOOP.
              lv_sel = ls_cpe-sel_vendor.
              IF lv_sel IS INITIAL.
                READ TABLE lt_ven INTO DATA(ls_selected) WITH KEY selected = abap_true.
                IF sy-subrc = 0.
                  lv_sel = ls_selected-vendorseq.
                ENDIF.
              ENDIF.
              LOOP AT lt_ven ASSIGNING FIELD-SYMBOL(<ls_ven>).
                <ls_ven>-selected = xsdbool( <ls_ven>-vendorseq = lv_sel ).
              ENDLOOP.

              LOOP AT ls_cpe-cpetocashflows INTO DATA(ls_cfin).
                lv_yr = COND #( WHEN ls_cfin-yearnr IS INITIAL THEN lv_yr + 1 ELSE ls_cfin-yearnr ).
                APPEND VALUE #( cpeid = lv_cpeid yearnr = lv_yr amount = ls_cfin-amount waers = ls_old-waers ) TO lt_cf.
              ENDLOOP.
              SORT lt_cf BY yearnr.
              DELETE ADJACENT DUPLICATES FROM lt_cf COMPARING yearnr.

              " children first: update( ) recalculates IRR/NPV from the stored cash flows
              DELETE FROM zcapex_cpeven WHERE cpeid = @lv_cpeid.
              DELETE FROM zcapex_cpecf  WHERE cpeid = @lv_cpeid.
              IF lt_ven IS NOT INITIAL.
                INSERT zcapex_cpeven FROM TABLE @lt_ven.
              ENDIF.
              IF lt_cf IS NOT INITIAL.
                INSERT zcapex_cpecf FROM TABLE @lt_cf.
              ENDIF.
              UPDATE zcapex_cpe SET sel_vendor = @lv_sel WHERE cpeid = @lv_cpeid.

              zcl_capex_cpe=>update( CORRESPONDING #( ls_cpe ) ).
            ENDIF.
          CATCH zcx_capex_error INTO DATA(lx_cpe).
            raise_busi( lx_cpe->get_text( ) ).
        ENDTRY.
        ls_cpe = read_cpe_deep( lv_cpeid ).
        copy_data_to_ref( EXPORTING is_data = ls_cpe CHANGING cr_data = er_deep_entity ).

      WHEN OTHERS.
        raise_busi( |Deep insert is not supported for { iv_entity_set_name }| ).
    ENDCASE.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_stream.
    capture_identity( ).
    DATA: ls_doc  TYPE zcapex_doc,
          lt_slug TYPE STANDARD TABLE OF string WITH EMPTY KEY.

    IF iv_entity_set_name <> 'DocumentSet'.
      raise_busi( |Upload is not supported for { iv_entity_set_name }| ).
    ENDIF.

    " SLUG = DocType|DocId|Category|FileName|Title|Note  (each part URL-encoded by the app)
    SPLIT iv_slug AT '|' INTO TABLE lt_slug.
    DO 6 - lines( lt_slug ) TIMES. APPEND `` TO lt_slug. ENDDO.
    LOOP AT lt_slug ASSIGNING FIELD-SYMBOL(<lv_part>).
      <lv_part> = cl_http_utility=>unescape_url( <lv_part> ).
    ENDLOOP.
    ls_doc-doctype   = to_upper( lt_slug[ 1 ] ).
    ls_doc-docid     = lt_slug[ 2 ].
    ls_doc-category  = to_upper( lt_slug[ 3 ] ).
    ls_doc-filename  = lt_slug[ 4 ].
    ls_doc-doc_title = lt_slug[ 5 ].
    ls_doc-note      = lt_slug[ 6 ].
    IF ls_doc-doctype IS INITIAL OR ls_doc-docid IS INITIAL OR ls_doc-filename IS INITIAL.
      raise_busi( 'The slug header must be DocType|DocId|Category|FileName|Title|Note' ).
    ENDIF.
    ls_doc = store_document( is_doc     = ls_doc
                             iv_content = is_media_resource-value
                             iv_mime    = CONV #( is_media_resource-mime_type ) ).

    DATA(ls_out) = map_doc( ls_doc ).
    copy_data_to_ref( EXPORTING is_data = ls_out CHANGING cr_data = er_entity ).

  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    capture_identity( ).
    DATA: ls_res TYPE zcapex_s_actres,
          ls_chk TYPE zcapex_s_budchk,
          ls_met TYPE zcapex_s_metrics.

    mt_param = it_parameter.
    DATA(lv_comment) = p( `Comment` ).

    TRY.
        CASE iv_action_name.

            " ---------------------------------------------------------------- submit
          WHEN 'SubmitDocument'.
            DATA(lv_type) = to_upper( p( `DocType` ) ).
            CASE lv_type.
              WHEN 'BUD'.
                ls_res = zcl_capex_buddoc=>submit( CONV #( p( `DocId` ) ) ).
              WHEN 'CPE'.
                ls_res = zcl_capex_cpe=>submit( iv_cpeid = CONV #( p( `DocId` ) ) ).
              WHEN OTHERS.
                raise_busi( |SubmitDocument does not support document type { lv_type }| ).
            ENDCASE.

          WHEN 'SubmitCPE'.
            IF p( `CpeId` ) IS INITIAL.
              raise_busi( 'Create the CPE first (POST /CPESet), then call SubmitCPE with its CpeId' ).
            ENDIF.
            ls_res = zcl_capex_cpe=>submit( iv_cpeid         = CONV #( p( `CpeId` ) )
                                            iv_pool_budgetid = CONV #( p( `PoolBudgetId` ) )
                                            iv_pool_amount   = zcl_capex_util=>to_amount( p( `PoolAmount` ) ) ).

            " ---------------------------------------------------------------- evaluation
          WHEN 'SaveEvaluation'.
            zcl_capex_cpe=>save_evaluation( iv_cpeid     = CONV #( p( `CpeId` ) )
                                            iv_compliant = p( `TechCompliant` )
                                            iv_remark    = p( `TechRemark` )
                                            iv_vendorseq = p( `VendorSeq` )
                                            iv_justif    = p( `Justification` ) ).
            ls_res = result( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_message = 'Evaluation saved.' ).

          WHEN 'SubmitEvaluation'.
            ls_res = zcl_capex_cpe=>submit_evaluation( iv_cpeid     = CONV #( p( `CpeId` ) )
                                                       iv_compliant = p( `TechCompliant` )
                                                       iv_remark    = p( `TechRemark` )
                                                       iv_vendorseq = p( `VendorSeq` )
                                                       iv_justif    = p( `Justification` ) ).

          WHEN 'ReturnCPE'.
            ls_res = zcl_capex_cpe=>return_cpe( iv_cpeid = CONV #( p( `CpeId` ) ) iv_comment = lv_comment ).

            " ---------------------------------------------------------------- CPE decisions
          WHEN 'ApproveCPE'.
            ls_res = act( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_decision = 'A'
                          iv_comment = COND string( WHEN lv_comment IS INITIAL THEN `Approved.` ELSE lv_comment ) ).
          WHEN 'RejectCPE'.
            ls_res = act( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_decision = 'R' iv_comment = lv_comment ).
          WHEN 'HoldCPE'.
            ls_res = act( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_decision = 'H' iv_comment = lv_comment ).
          WHEN 'ResumeCPE'.
            ls_res = act( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_decision = 'U' iv_comment = lv_comment ).
          WHEN 'RolloutCPE'.
            " Capex rollout: approved at this level and flagged; continues through the remaining levels.
            ls_res = act( iv_doctype = 'CPE' iv_docid = p( `CpeId` ) iv_decision = 'A' iv_rollout = abap_true
                          iv_comment = |ROLLOUT: { COND string( WHEN lv_comment IS INITIAL
                                                                THEN `Marked for capex rollout.` ELSE lv_comment ) }| ).

          WHEN 'BulkApprove'.
            DATA: lt_fail TYPE string_table,
                  lv_ok   TYPE i.
            SPLIT p( `CpeIds` ) AT ',' INTO TABLE DATA(lt_ids).
            LOOP AT lt_ids INTO DATA(lv_cpe).
              CONDENSE lv_cpe.
              IF lv_cpe IS INITIAL.
                CONTINUE.
              ENDIF.
              TRY.
                  act( iv_doctype = 'CPE' iv_docid = lv_cpe iv_decision = 'A'
                       iv_comment = COND string( WHEN lv_comment IS INITIAL THEN `Bulk approved` ELSE lv_comment ) ).
                  lv_ok = lv_ok + 1.
                CATCH zcx_capex_error INTO DATA(lx_bulk).
                  APPEND |{ lv_cpe }: { lx_bulk->get_text( ) }| TO lt_fail.
              ENDTRY.
            ENDLOOP.
            ls_res-success = xsdbool( lt_fail IS INITIAL ).
            ls_res-doctype = 'CPE'.
            ls_res-message = |{ lv_ok } CPE(s) approved and routed to the next level.| &&
                              COND string( WHEN lt_fail IS NOT INITIAL
                                           THEN | Not approved: { concat_lines_of( table = lt_fail sep = `; ` ) }| ).

            " ---------------------------------------------------------------- generic (budget, quota)
          WHEN 'ApproveDocument'.
            ls_res = act( iv_doctype = CONV #( to_upper( p( `DocType` ) ) ) iv_docid = p( `DocId` )
                          iv_decision = 'A' iv_comment = lv_comment ).
          WHEN 'RejectDocument'.
            ls_res = act( iv_doctype = CONV #( to_upper( p( `DocType` ) ) ) iv_docid = p( `DocId` )
                          iv_decision = 'R' iv_comment = lv_comment ).
          WHEN 'SendBackDocument'.
            ls_res = act( iv_doctype = CONV #( to_upper( p( `DocType` ) ) ) iv_docid = p( `DocId` )
                          iv_decision = 'B' iv_comment = lv_comment ).

            " ---------------------------------------------------------------- CWIP / PO
          WHEN 'CreateCWIP'.
            DATA(ls_in) = VALUE zcl_capex_sap=>ty_cwip_input(
                            cpeid         = p( `CpeId` )
                            anlkl         = p( `AssetClass` )
                            kostl         = p( `CostCenter` )
                            pspnr         = p( `WbsElement` )
                            payment_terms = p( `PaymentTerms` )
                            timeframe_wks = CONV #( p( `TimeframeWeeks` ) )
                            exec_process = p( `ExecProcess` )
                            prctr         = p( `ProfitCenter` )
                            remarks       = p( `Remarks` ) ).
            IF ls_in-kostl IS NOT INITIAL. ls_in-kostl = |{ ls_in-kostl ALPHA = IN }|. ENDIF.
            IF ls_in-prctr IS NOT INITIAL. ls_in-prctr = |{ ls_in-prctr ALPHA = IN }|. ENDIF.
            zcl_capex_sap=>push_cwip( EXPORTING is_input = ls_in
                                      IMPORTING ev_cwipid = DATA(lv_cwipid)
                                                ev_ebeln = DATA(lv_ebeln) ).
            ls_res = result( iv_doctype = 'CPE' iv_docid = ls_in-cpeid
                             iv_message = |Pushed to SAP. CWIP { lv_cwipid } - Purchase Order { lv_ebeln }.| ).
            ls_res-sap_object = lv_ebeln.

          WHEN 'ConfirmPO'.
            DATA(lv_po) = CONV ebeln( p( `PoId` ) ).
            lv_po = |{ lv_po ALPHA = IN }|.
            zcl_capex_sap=>confirm_po( lv_po ).
            ls_res = VALUE #( success = abap_true doctype = 'PO' docid = lv_po status = 'APPROVED'
                              sap_object = lv_po message = |PO { lv_po } confirmed.| ).

            " ---------------------------------------------------------------- capitalisation
          WHEN 'CapitalizeAsset'.
            " Amount is ignored on purpose: the capital cost is always recomputed server-side.
            ls_res = zcl_capex_ic=>capitalize( CONV #( p( `IcId` ) ) ).

            " ---------------------------------------------------------------- unit quota
          WHEN 'SubmitQuotaCapex'.
            ls_res = zcl_capex_quota=>submit( iv_werks = CONV #( p( `Plant` ) )
                                              iv_title = p( `Title` )
                                              iv_amount = zcl_capex_util=>to_amount( p( `Amount` ) )
                                              iv_justif = p( `Justification` ) ).
          WHEN 'ApproveQuota'.
            ls_res = zcl_capex_quota=>decide( iv_quotaid = CONV #( p( `QuotaId` ) ) iv_decision = 'A'
                                              iv_comment = lv_comment ).
          WHEN 'RejectQuota'.
            ls_res = zcl_capex_quota=>decide( iv_quotaid = CONV #( p( `QuotaId` ) ) iv_decision = 'R'
                                              iv_comment = lv_comment ).

            " ---------------------------------------------------------------- notifications
          WHEN 'MarkNotificationsRead'.
            DATA(lv_nid) = CONV zcapex_de_logid( p( `NotifId` ) ).
            IF lv_nid IS INITIAL.
              UPDATE zcapex_notlog SET is_read = @abap_true, read_on = @sy-datum
                WHERE recipient = @( zcl_capex_auth=>effective_user( ) ) AND is_read = @abap_false.
            ELSE.
              UPDATE zcapex_notlog SET is_read = @abap_true, read_on = @sy-datum
                WHERE recipient = @( zcl_capex_auth=>effective_user( ) ) AND notifid = @lv_nid.
            ENDIF.
            ls_res = VALUE #( success = abap_true message = |{ sy-dbcnt } notification(s) marked as read| ).

          WHEN 'AdminSave'.
            ls_res-success = abap_true.
            ls_res-message = admin_save( iv_kind = p( `Kind` ) iv_json = p( `Json` ) ).

          WHEN 'RemoveDocument'.
            " POST form of DocumentSet DELETE (the proxy drops DELETE): same visibility and status rules.
            documentset_delete_entity(
              EXPORTING iv_entity_name     = `Document`
                        iv_entity_set_name = `DocumentSet`
                        iv_source_name     = `DocumentSet`
                        it_navigation_path = VALUE #( )
                        it_key_tab         = VALUE #( ( name = `Doctype` value = to_upper( p( `Doctype` ) ) )
                                                  ( name = `Docid`   value = p( `Docid` ) )
                                                  ( name = `Docseq`  value = p( `Docseq` ) ) ) ).
            ls_res = result( iv_doctype = CONV #( to_upper( p( `Doctype` ) ) ) iv_docid = p( `Docid` )
                             iv_message = 'Attachment removed.' ).

            " ---------------------------------------------------------------- read-only answers (GET)
          WHEN 'CheckBudget'.
            ls_chk-budgetid = p( `BudgetId` ).
            ls_chk-requested = zcl_capex_util=>to_amount( p( `Amount` ) ).
            ls_chk-waers      = 'INR'.
            TRY.
                DATA(ls_pos) = zcl_capex_budget=>position( ls_chk-budgetid ).
                zcl_capex_auth=>check_plant( zcl_capex_doc=>werks_of( iv_doctype = 'BUD' iv_docid = ls_chk-budgetid ) ).
                ls_chk-approved = ls_pos-approved.
                ls_chk-committed = ls_pos-committed.
                ls_chk-spent     = ls_pos-spent.
                ls_chk-available = ls_pos-available.
                ls_chk-shortfall = COND #( WHEN ls_chk-requested > ls_pos-available
                                           THEN ls_chk-requested - ls_pos-available ELSE 0 ).
                ls_chk-allowed   = xsdbool( ls_pos-status = 'APPROVED' AND ls_chk-requested <= ls_pos-available ).
                ls_chk-message   = COND #( WHEN ls_chk-allowed = abap_true
                                           THEN |{ zcl_capex_util=>lakhs( ls_chk-requested ) } is within the available | &&
                                                |{ zcl_capex_util=>lakhs( ls_pos-available ) }.|
                                           ELSE |Requested { zcl_capex_util=>lakhs( ls_chk-requested ) } exceeds available | &&
                                                |{ zcl_capex_util=>lakhs( ls_pos-available ) }. Shortfall | &&
                                                |{ zcl_capex_util=>lakhs( ls_chk-shortfall ) }.| ).
              CATCH zcx_capex_error INTO DATA(lx_chk).
                " A failed pre-flight is a normal answer, not an error: the screen disables Submit.
                ls_chk-allowed = abap_false.
                ls_chk-message = lx_chk->get_text( ).
            ENDTRY.
            copy_data_to_ref( EXPORTING is_data = ls_chk CHANGING cr_data = er_data ).
            RETURN.

          WHEN 'CalculateMetrics'.
            ls_met = zcl_capex_metrics=>calculate(
                       iv_investment = zcl_capex_util=>to_amount( p( `Investment` ) )
                       it_cashflows = zcl_capex_metrics=>parse_csv( p( `CashFlows` ) )
                       iv_hurdle     = CONV #( zcl_capex_util=>to_amount( p( `HurdleRate` ) ) ) ).
            copy_data_to_ref( EXPORTING is_data = ls_met CHANGING cr_data = er_data ).
            RETURN.

          WHEN OTHERS.
            raise_busi( |Unknown function import { iv_action_name }| ).
        ENDCASE.

      CATCH zcx_capex_error INTO DATA(lx_error).
        " One translation point: every business rule reaches the app as readable text.
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.

    copy_data_to_ref( EXPORTING is_data = ls_res CHANGING cr_data = er_data ).

  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    capture_identity( ).
    IF iv_entity_set_name <> 'BudgetItemSet'.
      super->/iwbep/if_mgw_appl_srv_runtime~get_entity(
        EXPORTING iv_entity_name          = iv_entity_name
                  iv_entity_set_name      = iv_entity_set_name
                  iv_source_name          = iv_source_name
                  it_key_tab              = it_key_tab
                  it_navigation_path      = it_navigation_path
                  io_tech_request_context = io_tech_request_context
        IMPORTING er_entity               = er_entity
                  es_response_context     = es_response_context ).
      RETURN.
    ENDIF.

    DATA: ls_item   TYPE zcl_zcapex_portal_mpc_ext=>ts_budget_item,
          lv_itemno TYPE zcapex_de_itemno.
    DATA(lv_budgetid) = key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ).
    lv_itemno = key_value( it_key_tab = it_key_tab iv_name = `Itemno` ).
    IF doc_visible( iv_doctype = 'BUD' iv_docid = lv_budgetid ) = abap_false.
      raise_not_found( `BudgetItem` ).
    ENDIF.
    SELECT SINGLE * FROM zcapex_buditm INTO CORRESPONDING FIELDS OF @ls_item
      WHERE budgetid = @lv_budgetid AND itemno = @lv_itemno.
    IF sy-subrc <> 0.
      raise_not_found( `BudgetItem` ).
    ENDIF.
    copy_data_to_ref( EXPORTING is_data = ls_item CHANGING cr_data = er_entity ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    capture_identity( ).
    IF iv_entity_set_name = 'AdminDataSet'.
      " Maintenance read: $filter=Kind eq 'USERS' | 'DOA' -> one row whose Json is the list (camelCase).
      DATA lt_adm TYPE STANDARD TABLE OF zcl_zcapex_portal_mpc_ext=>ts_admin_data WITH EMPTY KEY.
      DATA(lv_kind) = to_upper( CONV string( filter_value( io_tech = io_tech_request_context iv_property = `KIND` ) ) ).
      APPEND VALUE #( kind = lv_kind json = admin_read( lv_kind ) ) TO lt_adm.
      copy_data_to_ref( EXPORTING is_data = lt_adm CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'DocXferSet'.
      " Emami Apps download: $filter=Doctype eq 'CPE' and Docid eq '..' and Docseq eq '0001' -> one row with Content as base64.
      DATA lt_xfer TYPE STANDARD TABLE OF zcl_zcapex_portal_mpc_ext=>ts_doc_xfer WITH EMPTY KEY.
      DATA(lv_xt) = CONV zcapex_de_doctype( filter_value( io_tech = io_tech_request_context iv_property = `DOCTYPE` ) ).
      DATA(lv_xi) = CONV zcapex_de_docid( filter_value( io_tech = io_tech_request_context iv_property = `DOCID` ) ).
      DATA(lv_xs) = CONV zcapex_de_docseq( filter_value( io_tech = io_tech_request_context iv_property = `DOCSEQ` ) ).
      IF lv_xt IS NOT INITIAL AND lv_xi IS NOT INITIAL AND lv_xs IS NOT INITIAL
         AND doc_visible( iv_doctype = lv_xt iv_docid = lv_xi ) = abap_true.
        SELECT SINGLE category, filename, doc_title, note, mimetype, filepath, content
          FROM zcapex_doc INTO @DATA(ls_xd)
          WHERE doctype = @lv_xt AND docid = @lv_xi AND docseq = @lv_xs.
        IF sy-subrc = 0.
          TRY.
              DATA(lv_xbin) = COND xstring( WHEN ls_xd-filepath IS NOT INITIAL
                                            THEN zcl_capex_file=>read( ls_xd-filepath )
                                            ELSE ls_xd-content ).
            CATCH zcx_capex_error INTO DATA(lx_xerr).
              raise_busi( lx_xerr->get_text( ) ).
          ENDTRY.
          APPEND VALUE #( doctype = lv_xt docid = lv_xi docseq = lv_xs category = ls_xd-category
                          filename = ls_xd-filename doc_title = ls_xd-doc_title note = ls_xd-note
                          mimetype = ls_xd-mimetype
                          content = cl_http_utility=>encode_x_base64( lv_xbin ) ) TO lt_xfer.
        ENDIF.
      ENDIF.
      copy_data_to_ref( EXPORTING is_data = lt_xfer CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    " BudgetItemSet is modelled in MPC_EXT, so it has no generated <SET>_GET_ENTITYSET; every other set is unchanged.
    IF iv_entity_set_name <> 'BudgetItemSet'.
      super->/iwbep/if_mgw_appl_srv_runtime~get_entityset(
        EXPORTING iv_entity_name           = iv_entity_name
                  iv_entity_set_name       = iv_entity_set_name
                  iv_source_name           = iv_source_name
                  it_filter_select_options = it_filter_select_options
                  it_order                 = it_order
                  is_paging                = is_paging
                  it_navigation_path       = it_navigation_path
                  it_key_tab               = it_key_tab
                  iv_filter_string         = iv_filter_string
                  iv_search_string         = iv_search_string
                  io_tech_request_context  = io_tech_request_context
        IMPORTING er_entityset             = er_entityset
                  es_response_context      = es_response_context ).
      RETURN.
    ENDIF.

    DATA lt_items TYPE zcl_zcapex_portal_mpc_ext=>tt_budget_item.
    " Budget('..')/BudgetToItems and $expand pass the budget key; otherwise $filter=Budgetid eq '..'
    DATA(lv_budgetid) = key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ).
    IF lv_budgetid IS INITIAL AND io_tech_request_context IS BOUND.
      lv_budgetid = filter_value( io_tech = io_tech_request_context iv_property = `BUDGETID` ).
    ENDIF.

    IF lv_budgetid IS NOT INITIAL.
      IF doc_visible( iv_doctype = 'BUD' iv_docid = lv_budgetid ) = abap_true.
        lt_items = zcl_capex_buddoc=>read_items( CONV #( lv_budgetid ) ).
      ENDIF.
    ELSE.
      SELECT * FROM zcapex_buditm INTO CORRESPONDING FIELDS OF TABLE @lt_items ORDER BY budgetid, itemno.
      LOOP AT lt_items INTO DATA(ls_item).
        IF doc_visible( iv_doctype = 'BUD' iv_docid = ls_item-budgetid ) = abap_false.
          DELETE lt_items.
        ENDIF.
      ENDLOOP.
    ENDIF.

    IF io_tech_request_context IS BOUND.
      finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                   IMPORTING es_response_context = es_response_context
                   CHANGING  ct_data = lt_items ).
    ENDIF.
    copy_data_to_ref( EXPORTING is_data = lt_items CHANGING cr_data = er_entityset ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_stream.
    capture_identity( ).
    DATA: ls_stream  TYPE /iwbep/if_mgw_appl_types=>ty_s_media_resource,
          lv_doctype TYPE zcapex_de_doctype,
          lv_docid   TYPE zcapex_de_docid,
          lv_seq     TYPE zcapex_de_docseq.

    lv_doctype = key_value( it_key_tab = it_key_tab iv_name = `Doctype` ).
    lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Docid` ).
    lv_seq     = key_value( it_key_tab = it_key_tab iv_name = `Docseq` ).

    SELECT SINGLE filename, mimetype, filepath, content FROM zcapex_doc INTO @DATA(ls_doc)
      WHERE doctype = @lv_doctype AND docid = @lv_docid AND docseq = @lv_seq.
    IF sy-subrc <> 0 OR doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
      raise_not_found( `Document` ).
    ENDIF.

    TRY.
        " Rows written before Revision 3 still carry the binary in CONTENT.
        ls_stream-value = COND #( WHEN ls_doc-filepath IS NOT INITIAL
                                  THEN zcl_capex_file=>read( ls_doc-filepath )
                                  ELSE ls_doc-content ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    ls_stream-mime_type = ls_doc-mimetype.
    set_header( VALUE ihttpnvp( name  = 'Content-Disposition'
                                value = |inline; filename="{ escape( val = CONV string( ls_doc-filename )
                                                                     format = cl_abap_format=>e_url ) }"| ) ).
    copy_data_to_ref( EXPORTING is_data = ls_stream CHANGING cr_data = er_stream ).
  ENDMETHOD.


  method ACT.
    DATA(lv_status) = zcl_capex_wf=>act( iv_doctype = iv_doctype
                                       iv_docid    = iv_docid
                                       iv_decision = iv_decision
                                       iv_comments = iv_comment
                                       iv_rollout = iv_rollout ).
  rs_res = result( iv_doctype = iv_doctype
                   iv_docid   = iv_docid
                   iv_message = SWITCH string( lv_status
                                  WHEN 'APPROVED'    THEN |{ iv_docid } fully approved.|
                                  WHEN 'IN_APPROVAL' THEN |{ iv_docid } routed to the next level.|
                                  WHEN 'REJECTED'    THEN |{ iv_docid } rejected.|
                                  WHEN 'HOLD'        THEN |{ iv_docid } placed on hold.|
                                  WHEN 'DRAFT'       THEN |{ iv_docid } sent back to the initiator.|
                                  ELSE                    |{ iv_docid } { lv_status }| ) ).
  endmethod.


  method APPROVALINBOXSET_GET_ENTITYSET.
 " Reads the log, not the CPE header. Returns only steps the caller may act on
  " (admins and initiators see every open step, as the app's ApprovalInbox does).
  DATA ls_out TYPE zcapex_s_inbox.

  DATA(ls_user) = zcl_capex_auth=>get_user( ).
  DATA(lv_all) = xsdbool( ls_user-is_admin = abap_true
                           OR ls_user-role = zcl_capex_config=>get( 'INITIATOR_ROLE' ) ).
  DATA(lv_big) = zcl_capex_config=>get_amount( 'THREE_QUOTE_LIMIT' ).

  SELECT w~docid, w~role, w~approver, w~status AS step_status, w~reached_on, w~due_on,
         c~budgetid, c~title, c~werks, c~capextype, c~category, c~amount, c~waers,
         c~created_by, c~created_on, c~submitted_on
    FROM zcapex_wflog AS w INNER JOIN zcapex_cpe AS c ON c~cpeid = w~docid
    INTO TABLE @DATA(lt_rows)
    WHERE w~doctype = 'CPE'
      AND w~is_current = @abap_true
      AND ( w~status = 'PENDING' OR w~status = 'HOLD' ).

  LOOP AT lt_rows INTO DATA(ls_row).
    IF zcl_capex_auth=>can_see_plant( iv_werks = ls_row-werks ) = abap_false.
      CONTINUE.
    ENDIF.
    IF lv_all = abap_false AND ls_row-approver <> zcl_capex_auth=>effective_user( ) AND ls_row-role <> ls_user-role.
      CONTINUE.
    ENDIF.
    CLEAR ls_out.
    ls_out-cpeid             = ls_row-docid.
    ls_out-doctype           = 'CPE'.
    ls_out-budgetid          = ls_row-budgetid.
    ls_out-title             = ls_row-title.
    ls_out-werks             = ls_row-werks.
    ls_out-plant_name        = zcl_capex_util=>plant_name( ls_row-werks ).
    ls_out-capextype         = ls_row-capextype.
    ls_out-category          = ls_row-category.
    ls_out-amount            = ls_row-amount.
    ls_out-waers             = ls_row-waers.
    ls_out-status            = COND #( WHEN ls_row-step_status = 'HOLD' THEN 'HOLD' ELSE 'IN_APPROVAL' ).
    ls_out-curr_level        = ls_row-role.
    ls_out-submitted_by      = ls_row-created_by.
    ls_out-submitted_by_name = zcl_capex_util=>user_name( ls_row-created_by ).
    ls_out-submitted_on      = COND #( WHEN ls_row-submitted_on IS INITIAL THEN ls_row-created_on
                                       ELSE ls_row-submitted_on ).
    ls_out-reached_on        = ls_row-reached_on.
    ls_out-due_on            = ls_row-due_on.
    ls_out-days_pending      = sy-datum - ls_row-reached_on.
    ls_out-sla_state         = zcl_capex_util=>sla_state( ls_out-days_pending ).
    " Priority follows SLA and size, so it can never contradict DaysPending.
    ls_out-priority = COND #( WHEN ls_out-sla_state = 'Error' OR ls_row-amount > 5 * lv_big THEN 'High'
                              WHEN ls_out-sla_state = 'Warning' OR ls_row-amount > lv_big THEN 'Medium'
                              ELSE 'Low' ).
    APPEND ls_out TO et_entityset.
  ENDLOOP.

  SORT et_entityset BY days_pending DESCENDING.
  finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
               IMPORTING es_response_context = es_response_context
               CHANGING ct_data = et_entityset ).

  endmethod.


  METHOD approvalstepset_get_entityset.
    DATA: lv_doctype TYPE zcapex_de_doctype,
          lv_docid   TYPE zcapex_de_docid,
          lt_log     TYPE zcapex_tt_wflog.

    IF iv_source_name = 'CPE'.                       " CPESet('...')/CPEToApprovalSteps
      lv_doctype = 'CPE'.
      lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ).
    ELSE.
      lv_doctype = filter_value( io_tech = io_tech_request_context iv_property = `DOCTYPE` ).
      lv_docid   = filter_value( io_tech = io_tech_request_context iv_property = `DOCID` ).
    ENDIF.
    IF lv_doctype IS INITIAL.
      lv_doctype = 'CPE'.
    ENDIF.

    IF lv_docid IS NOT INITIAL.
      IF doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
        RETURN.
      ENDIF.
      lt_log = zcl_capex_wf=>get_steps( iv_doctype = lv_doctype iv_docid = lv_docid ).
    ELSE.
      " Every document of this type, current cycle only (Component.js builds approval>/history).
      SELECT doctype, docid, MAX( cyclenr ) AS cyclenr FROM zcapex_wflog
        INTO TABLE @DATA(lt_max)
        WHERE doctype = @lv_doctype
        GROUP BY doctype, docid.
      IF lt_max IS NOT INITIAL.
        " FIX: FOR ALL ENTRIES is not allowed with the STRING column COMMENTS.
        "      Read by doctype, then keep only the current (highest) cycle per document.
        SORT lt_max BY docid.
        SELECT * FROM zcapex_wflog INTO TABLE @lt_log
          WHERE doctype = @lv_doctype.
        LOOP AT lt_log INTO DATA(ls_chk).
          READ TABLE lt_max INTO DATA(ls_max) WITH KEY docid = ls_chk-docid BINARY SEARCH.
          IF sy-subrc <> 0 OR ls_chk-cyclenr <> ls_max-cyclenr.
            DELETE lt_log.
          ENDIF.
        ENDLOOP.
      ENDIF.
    ENDIF.

    SORT lt_log BY docid levelnr.
    LOOP AT lt_log INTO DATA(ls_log).
      IF doc_visible( iv_doctype = ls_log-doctype iv_docid = ls_log-docid ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = CORRESPONDING zcapex_s_appstep( ls_log ).
      " ACTUAL_APPR is filled once somebody acts - that makes a delegated approval visible.
      ls_out-approver_name = zcl_capex_util=>user_name(
                               COND xubname( WHEN ls_log-actual_appr IS NOT INITIAL THEN ls_log-actual_appr
                                             ELSE ls_log-approver ) ).
      IF ls_out-approver_name IS INITIAL.
        ls_out-approver_name = ls_log-role.
      ENDIF.
      APPEND ls_out TO et_entityset.
    ENDLOOP.

    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD auditlogset_get_entityset.
    DATA lt_db TYPE STANDARD TABLE OF zcapex_audlog.
    DATA(lv_doctype) = CONV zcapex_de_doctype( filter_value( io_tech = io_tech_request_context iv_property = `DOCTYPE` ) ).
    DATA(lv_docid)   = CONV zcapex_de_docid( filter_value( io_tech = io_tech_request_context iv_property = `DOCID` ) ).

    IF lv_docid IS NOT INITIAL.
      SELECT * FROM zcapex_audlog INTO TABLE @lt_db
        WHERE docid = @lv_docid ORDER BY log_ts DESCENDING.
    ELSEIF lv_doctype IS NOT INITIAL.
      SELECT * FROM zcapex_audlog INTO TABLE @lt_db UP TO 5000 ROWS
        WHERE doctype = @lv_doctype ORDER BY log_ts DESCENDING.
    ELSE.
      " The audit trail grows without limit: cap the scan and always page.
      SELECT * FROM zcapex_audlog INTO TABLE @lt_db UP TO 5000 ROWS ORDER BY log_ts DESCENDING.
    ENDIF.

    LOOP AT lt_db INTO DATA(ls_db).
      IF ls_db-docid IS NOT INITIAL AND doc_visible( iv_doctype = ls_db-doctype iv_docid = ls_db-docid ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = CORRESPONDING zcapex_s_audit( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD budgetcashflowse_get_entityset.
    DATA lv_id TYPE zcapex_de_budgetid.
    " Reached as BudgetSet('...')/BudgetToCashFlows or $expand: the parent key is in IT_KEY_TAB.
    lv_id = key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ).
    IF lv_id IS INITIAL.
      lv_id = filter_value( io_tech = io_tech_request_context iv_property = `BUDGETID` ).
    ENDIF.
    IF lv_id IS INITIAL.
      RETURN.   " never return every cash flow of every budget
    ENDIF.
    IF doc_visible( iv_doctype = 'BUD' iv_docid = lv_id ) = abap_false.
      RETURN.
    ENDIF.
    SELECT budgetid, yearnr, amount, waers FROM zcapex_budcf
      INTO CORRESPONDING FIELDS OF TABLE @et_entityset
      WHERE budgetid = @lv_id ORDER BY yearnr.
  ENDMETHOD.


  METHOD budgetset_create_entity.
    DATA ls_in TYPE zcapex_s_budget.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    TRY.
        DATA(lv_id) = zcl_capex_buddoc=>create( is_budget = ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @lv_id.
    er_entity = map_budget( ls_db ).
  ENDMETHOD.


  METHOD budgetset_get_entity.
    DATA lv_id TYPE zcapex_de_budgetid.
    IF iv_source_name = 'CPE'.                       " CPESet('...')/CPEToBudget
      DATA(lv_cpeid) = CONV zcapex_de_cpeid( key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ) ).
      SELECT SINGLE budgetid FROM zcapex_cpe INTO @lv_id WHERE cpeid = @lv_cpeid.
    ELSE.
      lv_id = key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ).
    ENDIF.

    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @lv_id.
    IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = map_budget( ls_db ).
  ENDMETHOD.


  METHOD budgetset_get_entityset.
    DATA lt_db TYPE STANDARD TABLE OF zcapex_budget.
    DATA(lv_fy) = CONV gjahr( filter_value( io_tech = io_tech_request_context iv_property = `FISCALYEAR` ) ).
    IF lv_fy IS INITIAL.
      SELECT * FROM zcapex_budget INTO TABLE @lt_db ORDER BY budgetid DESCENDING.
    ELSE.
      SELECT * FROM zcapex_budget INTO TABLE @lt_db WHERE fiscalyear = @lv_fy ORDER BY budgetid DESCENDING.
    ENDIF.

    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = map_budget( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.

    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD budgetset_update_entity.
    DATA ls_in TYPE zcapex_s_budget.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    ls_in-budgetid = key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ).
    TRY.
        zcl_capex_buddoc=>update( ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @ls_in-budgetid.
    er_entity = map_budget( ls_db ).
  ENDMETHOD.


  method BUILD_KPI.
      DATA: lv_cycle_sum TYPE i,
        lv_cycle_cnt TYPE i,
        lv_age_sum   TYPE i.

  DATA(lv_from)   = zcl_capex_util=>fiscal_year_start( iv_fiscal ).
  DATA(lv_to)     = zcl_capex_util=>fiscal_year_end( iv_fiscal ).
  DATA(lv_breach) = zcl_capex_config=>get_int( 'SLA_BREACH_DAYS' ).
  rs_kpi-fiscalyear        = iv_fiscal.
  rs_kpi-waers             = 'INR'.
  rs_kpi-cycle_time_before = zcl_capex_config=>get_int( 'CYCLE_TIME_BASELINE' ).

  " Budget position
  SELECT werks, amt_approved, amt_committed, amt_spent FROM zcapex_budget INTO TABLE @DATA(lt_bud)
    WHERE fiscalyear = @iv_fiscal AND status = 'APPROVED'.
  LOOP AT lt_bud INTO DATA(ls_bud).
    CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_bud-werks ) = abap_true.
    rs_kpi-total_budget = rs_kpi-total_budget + ls_bud-amt_approved.
    rs_kpi-committed    = rs_kpi-committed + ls_bud-amt_committed.
    rs_kpi-spent        = rs_kpi-spent + ls_bud-amt_spent.
  ENDLOOP.
  rs_kpi-available = rs_kpi-total_budget - rs_kpi-committed - rs_kpi-spent.

  " Approved CPE value, cycle time, negotiation savings
  SELECT cpeid, werks, status, amount, sel_vendor, submitted_on, approved_on FROM zcapex_cpe
    INTO TABLE @DATA(lt_cpe) WHERE fiscalyear = @iv_fiscal AND status = 'APPROVED'.
  LOOP AT lt_cpe INTO DATA(ls_cpe).
    CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_cpe-werks ) = abap_true.
    rs_kpi-approved_cpe = rs_kpi-approved_cpe + ls_cpe-amount.
    IF ls_cpe-approved_on IS NOT INITIAL AND ls_cpe-submitted_on IS NOT INITIAL.
      lv_cycle_sum = lv_cycle_sum + ( ls_cpe-approved_on - ls_cpe-submitted_on ).
      lv_cycle_cnt = lv_cycle_cnt + 1.
    ENDIF.
    DATA(lv_saving) = zcl_capex_cpe=>saving_vs_l1( iv_cpeid = ls_cpe-cpeid iv_sel_vendor = ls_cpe-sel_vendor ).
    IF lv_saving > 0.
      rs_kpi-savings_ytd = rs_kpi-savings_ytd + lv_saving.
    ENDIF.
  ENDLOOP.
  IF lv_cycle_cnt > 0.
    rs_kpi-cycle_time_days = lv_cycle_sum / lv_cycle_cnt.
  ENDIF.

  " Pending approvals and SLA breaches (from the log, not the header)
  SELECT w~reached_on, c~werks, c~amount
    FROM zcapex_wflog AS w INNER JOIN zcapex_cpe AS c ON c~cpeid = w~docid
    INTO TABLE @DATA(lt_pend)
    WHERE w~doctype = 'CPE' AND w~status = 'PENDING' AND w~is_current = @abap_true.
  LOOP AT lt_pend INTO DATA(ls_pend).
    CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_pend-werks ) = abap_true.
    rs_kpi-pending_count = rs_kpi-pending_count + 1.
    rs_kpi-pending_value = rs_kpi-pending_value + ls_pend-amount.
    IF sy-datum - ls_pend-reached_on > lv_breach.
      rs_kpi-sla_breach_count = rs_kpi-sla_breach_count + 1.
    ENDIF.
  ENDLOOP.

  " Capitalised in this FY
  SELECT werks, equip_cost, freight_cost, install_cost FROM zcapex_ic INTO TABLE @DATA(lt_ic)
    WHERE status = 'CAPITALIZED' AND capitalized_on BETWEEN @lv_from AND @lv_to.
  LOOP AT lt_ic INTO DATA(ls_ic).
    CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_ic-werks ) = abap_true.
    rs_kpi-capitalized = rs_kpi-capitalized + ls_ic-equip_cost + ls_ic-freight_cost + ls_ic-install_cost.
  ENDLOOP.

  " Open CWIP
  SELECT werks, amount, created_on FROM zcapex_cwip INTO TABLE @DATA(lt_cw) WHERE status <> 'CAPITALIZED'.
  LOOP AT lt_cw INTO DATA(ls_cw).
    CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_cw-werks ) = abap_true.
    rs_kpi-cwip_pending = rs_kpi-cwip_pending + ls_cw-amount.
    rs_kpi-cwip_assets = rs_kpi-cwip_assets + 1.
    lv_age_sum          = lv_age_sum + ( sy-datum - ls_cw-created_on ).
  ENDLOOP.
  IF rs_kpi-cwip_assets > 0.
    rs_kpi-cwip_avg_age = lv_age_sum / rs_kpi-cwip_assets.
  ENDIF.
  endmethod.


  METHOD configset_get_entityset.
    " Read-only, whitelisted: SLA and quota limits drive screens, but may never be set by a client.
    SELECT param, value FROM zcapex_config INTO TABLE @DATA(lt_cfg) ORDER BY param.
    LOOP AT lt_cfg INTO DATA(ls_cfg).
      CHECK zcl_capex_config=>is_exposed( ls_cfg-param ) = abap_true.
      APPEND VALUE #( param = ls_cfg-param value = ls_cfg-value ) TO et_entityset.
    ENDLOOP.
  ENDMETHOD.


  method CPECASHFLOWSET_GET_ENTITYSET.
  DATA(lv_id) = CONV zcapex_de_cpeid( key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ) ).
  IF lv_id IS INITIAL.
    lv_id = filter_value( io_tech = io_tech_request_context iv_property = `CPEID` ).
  ENDIF.
  IF lv_id IS INITIAL OR doc_visible( iv_doctype = 'CPE' iv_docid = lv_id ) = abap_false.
    RETURN.
  ENDIF.
  SELECT cpeid, yearnr, amount, waers FROM zcapex_cpecf
    INTO CORRESPONDING FIELDS OF TABLE @et_entityset
    WHERE cpeid = @lv_id ORDER BY yearnr.
  endmethod.


  METHOD cpeset_create_entity.
*     Flat create (no vendors). The app uses the deep insert below.
    DATA ls_in TYPE zcapex_s_cpe.
*    DATA ls_in TYPE zcl_zcapex_portal_mpc=>ts_cpe.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    TRY.
        DATA(lv_id) = zcl_capex_cpe=>create( is_cpe = ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_db) WHERE cpeid = @lv_id.
    er_entity = map_cpe( ls_db ).
  ENDMETHOD.


  METHOD cpeset_get_entity.
    DATA(lv_id) = CONV zcapex_de_cpeid( key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ) ).
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_db) WHERE cpeid = @lv_id.
    IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    " Technical evaluation is visible only to the Unit Technical* step holder(s) of the DOA chain.
    IF ls_db-status = 'UNDER_EVALUATION' AND ls_db-created_by <> zcl_capex_auth=>effective_user( ) AND zcl_capex_auth=>is_admin( ) = abap_false.
      DATA(lv_role_me) = zcl_capex_auth=>get_user( )-role.
      SELECT COUNT(*) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
        WHERE d~doctype = 'CPE'
          AND ( d~capextype = @ls_db-capextype OR d~capextype = '*' )
          AND d~amount_from <= @ls_db-amount
          AND ( d~amount_to >= @ls_db-amount OR d~amount_to = 0 )
          AND d~active = @abap_true
          AND d~valid_from <= @sy-datum
          AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
          AND c~role LIKE 'Unit Technical%'
          AND ( c~approver = @( zcl_capex_auth=>effective_user( ) ) OR c~role = @lv_role_me )
          INTO @DATA(lv_n_eval).
      IF lv_n_eval = 0.
        raise_not_found( iv_entity_name ).
      ENDIF.
    ENDIF.
    er_entity = map_cpe( ls_db ).
  ENDMETHOD.


  method CPESET_GET_ENTITYSET.
 DATA lt_db TYPE STANDARD TABLE OF zcapex_cpe.

  IF iv_source_name = 'Budget'.                    " BudgetSet('...')/BudgetToCPEs
    DATA(lv_bud) = CONV zcapex_de_budgetid( key_value( it_key_tab = it_key_tab iv_name = `Budgetid` ) ).
    SELECT * FROM zcapex_cpe INTO TABLE @lt_db WHERE budgetid = @lv_bud ORDER BY cpeid DESCENDING.
  ELSE.
    DATA(lv_fy) = CONV gjahr( filter_value( io_tech = io_tech_request_context iv_property = `FISCALYEAR` ) ).
    IF lv_fy IS INITIAL.
      SELECT * FROM zcapex_cpe INTO TABLE @lt_db ORDER BY cpeid DESCENDING.
    ELSE.
      SELECT * FROM zcapex_cpe INTO TABLE @lt_db WHERE fiscalyear = @lv_fy ORDER BY cpeid DESCENDING.
    ENDIF.
  ENDIF.

  LOOP AT lt_db INTO DATA(ls_db).
    IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      CONTINUE.
    ENDIF.
    " Technical evaluation is visible only to the Unit Technical* step holder(s) of the DOA chain.
    IF ls_db-status = 'UNDER_EVALUATION' AND ls_db-created_by <> zcl_capex_auth=>effective_user( ) AND zcl_capex_auth=>is_admin( ) = abap_false.
      DATA(lv_role_me) = zcl_capex_auth=>get_user( )-role.
      SELECT COUNT(*) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
        WHERE d~doctype = 'CPE'
          AND ( d~capextype = @ls_db-capextype OR d~capextype = '*' )
          AND d~amount_from <= @ls_db-amount
          AND ( d~amount_to >= @ls_db-amount OR d~amount_to = 0 )
          AND d~active = @abap_true
          AND d~valid_from <= @sy-datum
          AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
          AND c~role LIKE 'Unit Technical%'
          AND ( c~approver = @( zcl_capex_auth=>effective_user( ) ) OR c~role = @lv_role_me )
          INTO @DATA(lv_n_eval).
      IF lv_n_eval = 0.
        CONTINUE.
      ENDIF.
    ENDIF.
    " Status derived per row - a list must not be where a stale cache first shows.
    DATA(ls_out) = map_cpe( ls_db ).
    APPEND ls_out TO et_entityset.
  ENDLOOP.

  finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
               IMPORTING es_response_context = es_response_context
               CHANGING ct_data = et_entityset ).
  endmethod.


  METHOD cpeset_update_entity.
    DATA ls_in TYPE zcapex_s_cpe.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    ls_in-cpeid = key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ).
    TRY.
        zcl_capex_cpe=>update( ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_db) WHERE cpeid = @ls_in-cpeid.
    er_entity = map_cpe( ls_db ).
  ENDMETHOD.


  METHOD currentuserset_get_entity.
    DATA(lv_id) = key_value( it_key_tab = it_key_tab iv_name = `Userid` ).
    IF lv_id IS NOT INITIAL AND lv_id <> zcl_capex_auth=>effective_user( ).
      raise_not_found( iv_entity_name ).
    ENDIF.
    DATA(ls_user) = zcl_capex_auth=>get_user( ).
    er_entity = CORRESPONDING #( ls_user ).
    er_entity-userid     = zcl_capex_auth=>effective_user( ).
    er_entity-fullname   = COND #( WHEN ls_user-fullname IS INITIAL THEN zcl_capex_util=>user_name( zcl_capex_auth=>effective_user( ) )
                                    ELSE ls_user-fullname ).
    er_entity-fiscalyear = zcl_capex_util=>current_fiscal_year( ).
  ENDMETHOD.


  METHOD currentuserset_get_entityset.
    " Exactly one row: the caller. ZCAPEX_USER as a whole is never exposed (it is a privilege map).
    DATA(ls_user) = zcl_capex_auth=>get_user( ).
    DATA(ls_out) = CORRESPONDING zcapex_s_user( ls_user ).
    ls_out-userid     = zcl_capex_auth=>effective_user( ).
    ls_out-fullname   = COND #( WHEN ls_user-fullname IS INITIAL THEN zcl_capex_util=>user_name( zcl_capex_auth=>effective_user( ) )
                                ELSE ls_user-fullname ).
    ls_out-fiscalyear = zcl_capex_util=>current_fiscal_year( ).
    APPEND ls_out TO et_entityset.
  ENDMETHOD.


  METHOD cwipageingset_get_entityset.
    " No table of its own: open CWIP, with age, bucket, IC status and risk (Capitalization screen).
    DATA ls_out TYPE zcapex_s_cwipage.
    DATA(lv_overdue) = zcl_capex_config=>get_int( 'CWIP_OVERDUE_DAYS' ).

    SELECT * FROM zcapex_cwip INTO TABLE @DATA(lt_db) WHERE status <> 'CAPITALIZED'.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      CLEAR ls_out.
      MOVE-CORRESPONDING ls_db TO ls_out.
      ls_out-plant_name    = zcl_capex_util=>plant_name( ls_db-werks ).
      ls_out-age_days      = sy-datum - ls_db-created_on.
      ls_out-ageing_bucket = COND #( WHEN ls_out-age_days <= 30 THEN '0-30'
                                     WHEN ls_out-age_days <= 90 THEN '31-90'
                                     WHEN ls_out-age_days <= 180 THEN '91-180'
                                     ELSE                             '180+' ).
      SELECT SINGLE icid, status FROM zcapex_ic INTO ( @ls_out-icid, @ls_out-ic_status )
        WHERE cpeid = @ls_db-cpeid.
      IF sy-subrc <> 0.
        ls_out-ic_status = 'NOT_STARTED'.
      ENDIF.
      ls_out-risk = COND #( WHEN ls_out-age_days > lv_overdue THEN 'Error'
                            WHEN ls_out-age_days > 30         THEN 'Warning'
                            ELSE                                   'None' ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    SORT et_entityset BY age_days DESCENDING.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).

  ENDMETHOD.


  method CWIPSET_GET_ENTITY.
 DATA ls_db TYPE zcapex_cwip.
  IF iv_source_name = 'CPE'.                       " CPESet('...')/CPEToCWIP
    DATA(lv_cpeid) = CONV zcapex_de_cpeid( key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ) ).
    SELECT SINGLE * FROM zcapex_cwip INTO @ls_db WHERE cpeid = @lv_cpeid.
  ELSE.
    DATA(lv_id) = CONV zcapex_de_cwipid( key_value( it_key_tab = it_key_tab iv_name = `Cwipid` ) ).
    SELECT SINGLE * FROM zcapex_cwip INTO @ls_db WHERE cwipid = @lv_id.
  ENDIF.
  IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
    raise_not_found( iv_entity_name ).
  ENDIF.
  er_entity = map_cwip( ls_db ).
  endmethod.


  METHOD cwipset_get_entityset.
    SELECT * FROM zcapex_cwip INTO TABLE @DATA(lt_db) ORDER BY cwipid DESCENDING.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = map_cwip( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  method DASHBOARDKPISET_GET_ENTITY.
 er_entity = build_kpi( fiscal_from_request( it_key_tab = it_key_tab ) ).
  endmethod.


  METHOD dashboardkpiset_get_entityset.
    DATA(ls_kpi) = build_kpi( fiscal_from_request( it_key_tab = it_key_tab io_tech = io_tech_request_context ) ).
    APPEND ls_kpi TO et_entityset.
  ENDMETHOD.


  METHOD dashcategoryset_get_entityset.
    DATA lt_out TYPE SORTED TABLE OF zcapex_s_dashcat WITH UNIQUE KEY category.
    DATA(lv_fy) = fiscal_from_request( it_key_tab = it_key_tab io_tech = io_tech_request_context ).

    SELECT category, werks, amt_approved, amt_committed, amt_spent FROM zcapex_budget
      INTO TABLE @DATA(lt_bud) WHERE fiscalyear = @lv_fy AND status = 'APPROVED'.
    LOOP AT lt_bud INTO DATA(ls_bud).
      CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_bud-werks ) = abap_true.
      READ TABLE lt_out ASSIGNING FIELD-SYMBOL(<ls_cat>) WITH TABLE KEY category = ls_bud-category.
      IF sy-subrc <> 0.
        INSERT VALUE #( fiscalyear = lv_fy category = ls_bud-category waers = 'INR'
                        category_text = zcl_capex_util=>vh_text( iv_domain = 'CATEGORY' iv_key = ls_bud-category ) )
          INTO TABLE lt_out ASSIGNING <ls_cat>.
      ENDIF.
      <ls_cat>-approved = <ls_cat>-approved + ls_bud-amt_approved.
      <ls_cat>-committed = <ls_cat>-committed + ls_bud-amt_committed.
      <ls_cat>-spent     = <ls_cat>-spent + ls_bud-amt_spent.
    ENDLOOP.
    et_entityset = lt_out.
  ENDMETHOD.


  METHOD dashtrendset_get_entityset.
    DATA lt_out TYPE SORTED TABLE OF zcapex_s_dashtrd WITH UNIQUE KEY period.
    DATA(lt_names) = VALUE string_table( ( `Jan` ) ( `Feb` ) ( `Mar` ) ( `Apr` ) ( `May` ) ( `Jun` )
                                         ( `Jul` ) ( `Aug` ) ( `Sep` ) ( `Oct` ) ( `Nov` ) ( `Dec` ) ).
    DATA(lv_fy)   = fiscal_from_request( it_key_tab = it_key_tab io_tech = io_tech_request_context ).
    DATA(lv_from) = zcl_capex_util=>fiscal_year_start( lv_fy ).
    DATA(lv_to)   = zcl_capex_util=>fiscal_year_end( lv_fy ).

    " April .. March
    DO 12 TIMES.
      DATA(lv_month) = 3 + sy-index.
      DATA(lv_year) = CONV i( lv_fy ).
      IF lv_month > 12.
        lv_month = lv_month - 12.
        lv_year = lv_year + 1.
      ENDIF.
      INSERT VALUE #( fiscalyear = lv_fy
                      period     = |{ lv_year }{ lv_month WIDTH = 2 ALIGN = RIGHT PAD = '0' }|
                      month_text = |{ lt_names[ lv_month ] } { lv_year }|
                      waers      = 'INR' ) INTO TABLE lt_out.
    ENDDO.

    " Committed: CPE value by submission month
    SELECT werks, amount, submitted_on FROM zcapex_cpe INTO TABLE @DATA(lt_cpe)
      WHERE submitted_on BETWEEN @lv_from AND @lv_to
        AND status <> 'REJECTED' AND status <> 'DRAFT' AND status <> 'BLOCKED'.
    LOOP AT lt_cpe INTO DATA(ls_cpe).
      CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_cpe-werks ) = abap_true.
      READ TABLE lt_out ASSIGNING FIELD-SYMBOL(<ls_m>) WITH TABLE KEY period = ls_cpe-submitted_on(6).
      IF sy-subrc = 0.
        <ls_m>-committed = <ls_m>-committed + ls_cpe-amount.
      ENDIF.
    ENDLOOP.

    " Spent: GRN value by posting month
    SELECT werks, value, posted_on FROM zcapex_grn INTO TABLE @DATA(lt_grn)
      WHERE posted_on BETWEEN @lv_from AND @lv_to.
    LOOP AT lt_grn INTO DATA(ls_grn).
      CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_grn-werks ) = abap_true.
      READ TABLE lt_out ASSIGNING <ls_m> WITH TABLE KEY period = ls_grn-posted_on(6).
      IF sy-subrc = 0.
        <ls_m>-spent = <ls_m>-spent + ls_grn-value.
      ENDIF.
    ENDLOOP.

    et_entityset = lt_out.

  ENDMETHOD.


  method DOACHAINSET_GET_ENTITYSET.
  DATA lt_db TYPE STANDARD TABLE OF zcapex_doachn.
  " Reached as DoaRuleSet?$expand=DoaRuleToChain (Component.js) - parent key in IT_KEY_TAB.
  DATA(lv_id) = CONV zcapex_de_doaid( key_value( it_key_tab = it_key_tab iv_name = `Doaid` ) ).
  IF lv_id IS INITIAL.
    lv_id = filter_value( io_tech = io_tech_request_context iv_property = `DOAID` ).
  ENDIF.
  IF lv_id IS INITIAL.
    SELECT * FROM zcapex_doachn INTO TABLE @lt_db ORDER BY doaid, seqnr.
  ELSE.
    SELECT * FROM zcapex_doachn INTO TABLE @lt_db WHERE doaid = @lv_id ORDER BY seqnr.
  ENDIF.
  LOOP AT lt_db INTO DATA(ls_db).
    DATA(ls_out) = CORRESPONDING zcapex_s_doachain( ls_db ).
    ls_out-approver_name = zcl_capex_util=>user_name( ls_db-approver ).
    APPEND ls_out TO et_entityset.
  ENDLOOP.
  endmethod.


  METHOD doaruleset_get_entity.
    DATA(lv_id) = CONV zcapex_de_doaid( key_value( it_key_tab = it_key_tab iv_name = `Doaid` ) ).
    SELECT SINGLE * FROM zcapex_doa INTO @DATA(ls_db) WHERE doaid = @lv_id.
    IF sy-subrc <> 0.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = CORRESPONDING #( ls_db ).
    er_entity-capextype_text = zcl_capex_util=>vh_text( iv_domain = 'CAPEXTYPE' iv_key = ls_db-capextype ).
  ENDMETHOD.


  METHOD doaruleset_get_entityset.
    SELECT * FROM zcapex_doa INTO TABLE @DATA(lt_db) ORDER BY doaid.
    LOOP AT lt_db INTO DATA(ls_db).
      DATA(ls_out) = CORRESPONDING zcapex_s_doarule( ls_db ).
      ls_out-capextype_text = zcl_capex_util=>vh_text( iv_domain = 'CAPEXTYPE' iv_key = ls_db-capextype ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  method DOCUMENTSET_CREATE_ENTITY.
**TRY.
*SUPER->DOCUMENTSET_CREATE_ENTITY(
*  EXPORTING
*    IV_ENTITY_NAME          =
*    IV_ENTITY_SET_NAME      =
*    IV_SOURCE_NAME          =
*    IT_KEY_TAB              =
**    io_tech_request_context =
*    IT_NAVIGATION_PATH      =
**    io_data_provider        =
**  IMPORTING
**    er_entity               =
*       ).
** CATCH /iwbep/cx_mgw_busi_exception .
** CATCH /iwbep/cx_mgw_tech_exception .
**ENDTRY.
  endmethod.


  method DOCUMENTSET_DELETE_ENTITY.
 DATA: lv_doctype TYPE zcapex_de_doctype,
        lv_docid   TYPE zcapex_de_docid,
        lv_seq     TYPE zcapex_de_docseq.
  lv_doctype = key_value( it_key_tab = it_key_tab iv_name = `Doctype` ).
  lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Docid` ).
  lv_seq     = key_value( it_key_tab = it_key_tab iv_name = `Docseq` ).

  IF doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
    raise_not_found( iv_entity_name ).
  ENDIF.
  TRY.
      DATA(ls_head) = zcl_capex_doc=>read( iv_doctype = lv_doctype iv_docid = lv_docid ).
    CATCH zcx_capex_error INTO DATA(lx_error).
      raise_busi( lx_error->get_text( ) ).
  ENDTRY.
  " An approver signed off on the documents that were attached; removing one later would
  " quietly change what was approved.
  IF NOT ( ls_head-status = 'DRAFT' OR ls_head-status = 'BLOCKED'
         OR ls_head-status = 'UNDER_EVALUATION' OR ( lv_doctype = 'IC' AND ls_head-status = 'PENDING' ) ).
    raise_busi( |Attachments cannot be removed once { lv_docid } is { ls_head-status }| ).
  ENDIF.

  SELECT SINGLE filename FROM zcapex_doc INTO @DATA(lv_file)
    WHERE doctype = @lv_doctype AND docid = @lv_docid AND docseq = @lv_seq.
  DELETE FROM zcapex_doc WHERE doctype = @lv_doctype AND docid = @lv_docid AND docseq = @lv_seq.
  zcl_capex_log=>audit( iv_doctype = lv_doctype iv_docid = lv_docid
                        iv_action = 'Attachment removed' iv_comment = lv_file ).
  endmethod.


  METHOD documentset_get_entity.
*    DATA: lv_doctype TYPE zcapex_de_doctype,
*          lv_docid   TYPE zcapex_de_docid,
*          lv_seq     TYPE zcapex_de_docseq,
*          ls_doc     TYPE zcapex_doc.
*    lv_doctype = key_value( it_key_tab = it_key_tab iv_name = `Doctype` ).
*    lv_docid    = key_value( it_key_tab = it_key_tab iv_name = `Docid` ).
*    lv_seq      = key_value( it_key_tab = it_key_tab iv_name = `Docseq` ).
*    SELECT SINGLE doctype, docid, docseq, filename, category, mimetype, filesize, uploaded_by, uploaded_on
*      FROM zcapex_doc INTO CORRESPONDING FIELDS OF @ls_doc
*      WHERE doctype = @lv_doctype AND docid = @lv_docid AND docseq = @lv_seq.
*    IF sy-subrc <> 0 OR doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
*      raise_not_found( iv_entity_name ).
*    ENDIF.
*    er_entity = map_doc( ls_doc ).

*    DATA: lv_doctype TYPE zcapex_doc-doctype,
*          lv_docid   TYPE zcapex_doc-docid,
*          lv_docseq  TYPE zcapex_doc-docseq,
*          ls_doc     TYPE zcapex_doc,
*          lv_kb      TYPE p LENGTH 10 DECIMALS 1.
*
*    LOOP AT it_key_tab INTO DATA(ls_key).
*      CASE ls_key-name.
*        WHEN 'Doctype'. lv_doctype = ls_key-value.
*        WHEN 'Docid'.   lv_docid   = ls_key-value.
*        WHEN 'Docseq'.  lv_docseq  = ls_key-value.
*      ENDCASE.
*    ENDLOOP.
*
*    SELECT SINGLE * FROM zcapex_doc INTO ls_doc
*      WHERE doctype = lv_doctype
*        AND docid   = lv_docid
*        AND docseq  = lv_docseq.
*    IF sy-subrc <> 0.
*      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
*        EXPORTING
*          textid            = /iwbep/cx_mgw_busi_exception=>business_error
*          message_unlimited = |Document { lv_docseq } not found|.
*    ENDIF.
*
*    " copy all fields with matching names
*    MOVE-CORRESPONDING ls_doc TO er_entity.
*
*    " category text (inline)
*    er_entity-category_text = SWITCH #( ls_doc-category
*      WHEN 'RFQ1' THEN 'RFQ - Vendor 1'
*      WHEN 'RFQ2' THEN 'RFQ - Vendor 2'
*      WHEN 'RFQ3' THEN 'RFQ - Vendor 3'
*      WHEN 'QUOTE1' THEN 'Quotation - Vendor 1'
*      WHEN 'QUOTE2' THEN 'Quotation - Vendor 2'
*      WHEN 'QUOTE3' THEN 'Quotation - Vendor 3'
*      WHEN 'TCC' THEN 'Technical Comparison'
*      WHEN 'NEGOTIATION' THEN 'Negotiation'
*      WHEN 'JUSTIFICATION' THEN 'Justification'
*      WHEN 'AMT_REV' THEN 'Amount Revision'
*      ELSE 'Additional Document' ).
*
*    " size text (inline)
*    lv_kb = ls_doc-filesize / 1024.
*    er_entity-size_text = COND #( WHEN ls_doc-filesize >= 1048576
*                                  THEN |{ lv_kb / 1024 DECIMALS = 1 } MB|
*                                  ELSE |{ lv_kb DECIMALS = 0 } KB| ).
*
*    " uploaded by name (inline)
*    SELECT SINGLE bname FROM user_addr INTO er_entity-uploaded_by_name
*      WHERE bname = ls_doc-uploaded_by.
*    IF sy-subrc <> 0.
*      er_entity-uploaded_by_name = ls_doc-uploaded_by.
*    ENDIF.
    DATA: lv_doctype TYPE zcapex_de_doctype,
          lv_docid   TYPE zcapex_de_docid,
          lv_seq     TYPE zcapex_de_docseq,
          ls_doc     TYPE zcapex_doc.
    lv_doctype = key_value( it_key_tab = it_key_tab iv_name = `Doctype` ).
    lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Docid` ).
    lv_seq     = key_value( it_key_tab = it_key_tab iv_name = `Docseq` ).
    SELECT SINGLE doctype, docid, docseq, filename, category, mimetype, filesize,
                  doc_title, note, uploaded_by, uploaded_on, uploaded_at
      FROM zcapex_doc INTO CORRESPONDING FIELDS OF @ls_doc
      WHERE doctype = @lv_doctype AND docid = @lv_docid AND docseq = @lv_seq.
    IF sy-subrc <> 0 OR doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = map_doc( ls_doc ).

  ENDMETHOD.


  METHOD documentset_get_entityset.
*    DATA: lv_doctype TYPE zcapex_de_doctype,
*          lv_docid   TYPE zcapex_de_docid,
*          lt_doc     TYPE STANDARD TABLE OF zcapex_doc.
*
*    CASE iv_source_name.
*      WHEN 'CPE'.                                    " CPESet('...')/CPEToDocuments
*        lv_doctype = 'CPE'.
*        lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ).
*      WHEN 'InstallCert'.                            " InstallCertSet('...')/InstallCertToPhotos
*        lv_doctype = 'IC'.
*        lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Icid` ).
*      WHEN OTHERS.                                   " DocumentSet?$filter=Doctype eq 'BUD' and Docid eq '...'
*        lv_doctype = filter_value( io_tech = io_tech_request_context iv_property = `DOCTYPE` ).
*        lv_docid   = filter_value( io_tech = io_tech_request_context iv_property = `DOCID` ).
*    ENDCASE.
*    IF lv_docid IS INITIAL OR doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
*      RETURN.
*    ENDIF.
*
*    " CONTENT is deliberately not selected: a list must not drag binaries over the wire.
*    SELECT doctype, docid, docseq, filename, category, mimetype, filesize, uploaded_by, uploaded_on
*      FROM zcapex_doc INTO CORRESPONDING FIELDS OF TABLE @lt_doc
*      WHERE doctype = @lv_doctype AND docid = @lv_docid
*      ORDER BY docseq.
*    LOOP AT lt_doc INTO DATA(ls_doc).
*      DATA(ls_out) = map_doc( ls_doc ).
*      APPEND ls_out TO et_entityset.
*    ENDLOOP.

*    DATA: lv_doctype TYPE zcapex_doc-doctype,
*          lv_docid   TYPE zcapex_doc-docid,
*          lt_doc     TYPE STANDARD TABLE OF zcapex_doc,
*          ls_entity  LIKE LINE OF et_entityset,
*          lv_kb      TYPE p LENGTH 10 DECIMALS 1.
*
*    " 1) Navigation: /CPESet('id')/CPEToDocuments  or  /BudgetSet('id')/BudgetToDocuments
*    DATA(lv_source) = io_tech_request_context->get_source_entity_type_name( ).
*    LOOP AT it_key_tab INTO DATA(ls_key).
*      CASE ls_key-name.
*        WHEN 'CpeId'.    lv_doctype = 'CPE'. lv_docid = ls_key-value.
*        WHEN 'BudgetId'. lv_doctype = 'BUD'. lv_docid = ls_key-value.
*      ENDCASE.
*    ENDLOOP.
*
*    " 2) Direct call with $filter (Doctype / Docid)
*    LOOP AT it_filter_select_options INTO DATA(ls_filter).
*      READ TABLE ls_filter-select_options INTO DATA(ls_so) INDEX 1.
*      CHECK sy-subrc = 0.
*      CASE ls_filter-property.
*        WHEN 'Doctype'. lv_doctype = ls_so-low.
*        WHEN 'Docid'.   lv_docid   = ls_so-low.
*      ENDCASE.
*    ENDLOOP.
*
*    IF lv_doctype IS INITIAL OR lv_docid IS INITIAL.
*      RETURN.   " never list all documents of all CPEs
*    ENDIF.
*
*    SELECT * FROM zcapex_doc INTO TABLE lt_doc
*      WHERE doctype = lv_doctype AND docid = lv_docid
*      ORDER BY docseq.
*
*    LOOP AT lt_doc INTO DATA(ls_doc).
*      CLEAR ls_entity.
*      MOVE-CORRESPONDING ls_doc TO ls_entity.
*
*      ls_entity-category_text = SWITCH #( ls_doc-category
*        WHEN 'RFQ1' THEN 'RFQ - Vendor 1'
*        WHEN 'RFQ2' THEN 'RFQ - Vendor 2'
*        WHEN 'RFQ3' THEN 'RFQ - Vendor 3'
*        WHEN 'QUOTE1' THEN 'Quotation - Vendor 1'
*        WHEN 'QUOTE2' THEN 'Quotation - Vendor 2'
*        WHEN 'QUOTE3' THEN 'Quotation - Vendor 3'
*        WHEN 'TCC' THEN 'Technical Comparison'
*        WHEN 'NEGOTIATION' THEN 'Negotiation'
*        WHEN 'JUSTIFICATION' THEN 'Justification'
*        WHEN 'AMT_REV' THEN 'Amount Revision'
*        ELSE 'Additional Document' ).
*
*      lv_kb = ls_doc-filesize / 1024.
*      ls_entity-size_text = COND #( WHEN ls_doc-filesize >= 1048576
*                                    THEN |{ lv_kb / 1024 DECIMALS = 1 } MB|
*                                    ELSE |{ lv_kb DECIMALS = 0 } KB| ).
*
*      SELECT SINGLE bname FROM user_addr INTO ls_entity-uploaded_by_name
*        WHERE bname = ls_doc-uploaded_by.
*      IF sy-subrc <> 0.
*        ls_entity-uploaded_by_name = ls_doc-uploaded_by.
*      ENDIF.
*
*      APPEND ls_entity TO et_entityset.
*    ENDLOOP.

    DATA: lv_doctype TYPE zcapex_doc-doctype,
          lv_docid   TYPE zcapex_doc-docid,
          lt_doc     TYPE STANDARD TABLE OF zcapex_doc.

    CASE iv_source_name.
      WHEN 'CPE'.                                    " CPESet('...')/CPEToDocuments
        lv_doctype = 'CPE'.
        lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ).
      WHEN 'InstallCert'.                            " InstallCertSet('...')/InstallCertToPhotos
        lv_doctype = 'IC'.
        lv_docid   = key_value( it_key_tab = it_key_tab iv_name = `Icid` ).
      WHEN OTHERS.                                   " DocumentSet?$filter=Doctype eq 'BUD' and Docid eq '...'
        lv_doctype = filter_value( io_tech = io_tech_request_context iv_property = `DOCTYPE` ).
        lv_docid   = filter_value( io_tech = io_tech_request_context iv_property = `DOCID` ).
    ENDCASE.
    IF lv_docid IS INITIAL OR doc_visible( iv_doctype = lv_doctype iv_docid = lv_docid ) = abap_false.
      RETURN.
    ENDIF.

    " CONTENT is deliberately not selected: a list must not drag binaries over the wire.
    SELECT doctype, docid, docseq, filename, category, mimetype, filesize,
           doc_title, note, uploaded_by, uploaded_on, uploaded_at
      FROM zcapex_doc INTO CORRESPONDING FIELDS OF TABLE @lt_doc
      WHERE doctype = @lv_doctype AND docid = @lv_docid
      ORDER BY docseq.
    LOOP AT lt_doc INTO DATA(ls_doc).
      APPEND map_doc( ls_doc ) TO et_entityset.
    ENDLOOP.

  ENDMETHOD.


  METHOD doc_visible.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    READ TABLE mt_vis INTO DATA(ls_vis) WITH TABLE KEY doctype = iv_doctype docid = lv_docid.
    IF sy-subrc = 0.
      rv_visible = ls_vis-visible.
      RETURN.
    ENDIF.
    CASE iv_doctype.
      WHEN 'BUD' OR 'CPE' OR 'IC' OR 'QUOTA' OR 'CWIP' OR 'PO'.
        DATA(lv_werks) = zcl_capex_doc=>werks_of( iv_doctype = iv_doctype iv_docid = lv_docid ).
        rv_visible = xsdbool( lv_werks IS NOT INITIAL
                              AND zcl_capex_auth=>can_see_plant( iv_werks = lv_werks ) = abap_true ).
      WHEN OTHERS.
        rv_visible = abap_true.
    ENDCASE.
    " A CPE under technical evaluation (and its vendors, attachments, steps) is hidden from everyone
    " except the initiator, an admin and the Unit Technical* step holder(s) of its DOA chain.
    IF rv_visible = abap_true AND iv_doctype = 'CPE'.
      SELECT SINGLE status, created_by, capextype, amount FROM zcapex_cpe INTO @DATA(ls_cpe_v) WHERE cpeid = @lv_docid.
      IF sy-subrc = 0 AND ls_cpe_v-status = 'UNDER_EVALUATION' AND ls_cpe_v-created_by <> zcl_capex_auth=>effective_user( )
         AND zcl_capex_auth=>is_admin( ) = abap_false.
        DATA(lv_role_me) = zcl_capex_auth=>get_user( )-role.
        SELECT COUNT(*) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
          WHERE d~doctype = 'CPE'
            AND ( d~capextype = @ls_cpe_v-capextype OR d~capextype = '*' )
            AND d~amount_from <= @ls_cpe_v-amount
            AND ( d~amount_to >= @ls_cpe_v-amount OR d~amount_to = 0 )
            AND d~active = @abap_true
            AND d~valid_from <= @sy-datum
            AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
            AND c~role LIKE 'Unit Technical%'
            AND ( c~approver = @( zcl_capex_auth=>effective_user( ) ) OR c~role = @lv_role_me )
          INTO @DATA(lv_n_eval).
        IF lv_n_eval = 0.
          rv_visible = abap_false.
        ENDIF.
      ENDIF.
    ENDIF.
    INSERT VALUE #( doctype = iv_doctype docid = lv_docid visible = rv_visible ) INTO TABLE mt_vis.
  ENDMETHOD.


  METHOD filter_value.
    " Technical (ABAP) property names, e.g. 'DOCID'. Only a single EQ value is read.
    DATA(lt_so) = io_tech->get_filter( )->get_filter_select_options( ).
    READ TABLE lt_so INTO DATA(ls_so) WITH KEY property = iv_property.
    IF sy-subrc = 0.
      READ TABLE ls_so-select_options INTO DATA(ls_opt) INDEX 1.
      IF sy-subrc = 0 AND ls_opt-option = 'EQ'.
        rv_value = ls_opt-low.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD finish_list.
    " $filter, then $inlinecount, then $top/$skip - always after the plant check.
    /iwbep/cl_mgw_data_util=>filtering(
      EXPORTING it_select_options = io_tech->get_filter( )->get_filter_select_options( )
      CHANGING ct_data            = ct_data ).
    IF io_tech->has_inlinecount( ) = abap_true.
      es_response_context-inlinecount = lines( ct_data ).
    ENDIF.
    /iwbep/cl_mgw_data_util=>paging(
      EXPORTING is_paging = is_paging
      CHANGING ct_data    = ct_data ).
  ENDMETHOD.


  METHOD fiscal_from_request.
    " Accepts "2026" or the app's "FY2026".
    DATA(lv_raw) = key_value( it_key_tab = it_key_tab iv_name = `Fiscalyear` ).
    IF lv_raw IS INITIAL AND io_tech IS BOUND.
      lv_raw = filter_value( io_tech = io_tech iv_property = `FISCALYEAR` ).
    ENDIF.
    REPLACE ALL OCCURRENCES OF REGEX '[^0-9]' IN lv_raw WITH ''.
    IF strlen( lv_raw ) = 4.
      rv_fiscal = lv_raw.
    ELSE.
      rv_fiscal = zcl_capex_util=>current_fiscal_year( ).
    ENDIF.
  ENDMETHOD.


  METHOD grnset_get_entityset.
    DATA lt_db TYPE STANDARD TABLE OF zcapex_grn.
    DATA lv_ebeln TYPE ebeln.
    IF iv_source_name = 'PurchaseOrder'.             " PurchaseOrderSet('...')/PurchaseOrderToGRNs
      lv_ebeln = key_value( it_key_tab = it_key_tab iv_name = `Ebeln` ).
    ELSE.
      lv_ebeln = filter_value( io_tech = io_tech_request_context iv_property = `EBELN` ).
    ENDIF.
    IF lv_ebeln IS INITIAL.
      SELECT * FROM zcapex_grn INTO TABLE @lt_db ORDER BY posted_on DESCENDING.
    ELSE.
      lv_ebeln = |{ lv_ebeln ALPHA = IN }|.
      SELECT * FROM zcapex_grn INTO TABLE @lt_db WHERE ebeln = @lv_ebeln ORDER BY mblnr, mjahr, zeile.
    ENDIF.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = CORRESPONDING zcapex_s_grn( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).

  ENDMETHOD.


  METHOD installcertset_create_entity.
    DATA ls_in TYPE zcapex_s_ic.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    TRY.
        DATA(lv_id) = zcl_capex_ic=>create( ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_ic INTO @DATA(ls_db) WHERE icid = @lv_id.
    er_entity = map_ic( ls_db ).
  ENDMETHOD.


  METHOD installcertset_get_entity.
    DATA(lv_id) = CONV zcapex_de_icid( key_value( it_key_tab = it_key_tab iv_name = `Icid` ) ).
    SELECT SINGLE * FROM zcapex_ic INTO @DATA(ls_db) WHERE icid = @lv_id.
    IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = map_ic( ls_db ).
  ENDMETHOD.


  METHOD installcertset_get_entityset.
    SELECT * FROM zcapex_ic INTO TABLE @DATA(lt_db) ORDER BY icid DESCENDING.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = map_ic( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD installcertset_update_entity.
    DATA ls_in TYPE zcapex_s_ic.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_in ).
    ls_in-icid = key_value( it_key_tab = it_key_tab iv_name = `Icid` ).
    TRY.
        zcl_capex_ic=>update( ls_in ).
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.
    SELECT SINGLE * FROM zcapex_ic INTO @DATA(ls_db) WHERE icid = @ls_in-icid.
    er_entity = map_ic( ls_db ).
  ENDMETHOD.


  METHOD key_value.
    READ TABLE it_key_tab INTO DATA(ls_key) WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rv_value = ls_key-value.
    ENDIF.
  ENDMETHOD.


  METHOD map_budget.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name        = zcl_capex_util=>plant_name( is_db-werks ).
    rs_out-category_text     = zcl_capex_util=>vh_text( iv_domain = 'CATEGORY' iv_key = is_db-category ).
    rs_out-amt_available     = is_db-amt_approved - is_db-amt_committed - is_db-amt_spent.
    rs_out-submitted_by_name = zcl_capex_util=>user_name( is_db-submitted_by ).
    zcl_capex_wf=>derive_status( EXPORTING iv_doctype        = 'BUD'
                                            iv_docid         = is_db-budgetid
                                            iv_header_status = is_db-status
                                 IMPORTING ev_status         = rs_out-status
                                            ev_current_level = rs_out-curr_level
                                            ev_days_pending = rs_out-days_pending ).
    IF rs_out-curr_level IS INITIAL.
      rs_out-curr_level = is_db-curr_level.
    ENDIF.
  ENDMETHOD.


  METHOD map_cpe.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name      = zcl_capex_util=>plant_name( is_db-werks ).
    rs_out-category_text   = zcl_capex_util=>vh_text( iv_domain = 'CATEGORY' iv_key = is_db-category ).
    rs_out-created_by_name = zcl_capex_util=>user_name( is_db-created_by ).
    SELECT SINGLE title FROM zcapex_budget INTO @rs_out-budget_title WHERE budgetid = @is_db-budgetid.
    zcl_capex_wf=>derive_status( EXPORTING iv_doctype        = 'CPE'
                                            iv_docid         = is_db-cpeid
                                            iv_header_status = is_db-status
                                 IMPORTING ev_status         = rs_out-status
                                            ev_current_level = rs_out-curr_level
                                            ev_days_pending = rs_out-days_pending ).
    IF rs_out-curr_level IS INITIAL.
      rs_out-curr_level = is_db-curr_level.
    ENDIF.
    rs_out-sla_state    = COND #( WHEN rs_out-status = 'IN_APPROVAL'
                                  THEN zcl_capex_util=>sla_state( rs_out-days_pending )
                                  ELSE 'Success' ).
    rs_out-saving_vs_l1 = zcl_capex_cpe=>saving_vs_l1( iv_cpeid = is_db-cpeid iv_sel_vendor = is_db-sel_vendor ).
    " PR number from the CWIP (shown beside the PO). A PR whose items are all deleted is not shown.
    SELECT SINGLE banfn FROM zcapex_cwip INTO @rs_out-banfn WHERE cpeid = @is_db-cpeid AND banfn <> @space.
    IF rs_out-banfn IS NOT INITIAL.
      SELECT COUNT(*) FROM eban INTO @DATA(lv_pr_open) WHERE banfn = @rs_out-banfn AND loekz = @space.
      IF lv_pr_open = 0.
        SELECT COUNT(*) FROM eban INTO @DATA(lv_pr_any) WHERE banfn = @rs_out-banfn.
        IF lv_pr_any > 0.
          CLEAR rs_out-banfn.
        ENDIF.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD map_cwip.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name = zcl_capex_util=>plant_name( is_db-werks ).
  ENDMETHOD.


  METHOD map_doc.

    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-size_text        = zcl_capex_util=>size_text( is_db-filesize ).
    rs_out-uploaded_by_name = zcl_capex_util=>user_name( is_db-uploaded_by ).

  ENDMETHOD.


  METHOD map_ic.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name = zcl_capex_util=>plant_name( is_db-werks ).
    " Never trust a stored or client total: recompute on every read.
    rs_out-total_cost = is_db-equip_cost + is_db-freight_cost + is_db-install_cost.
    rs_out-photo_count = zcl_capex_ic=>photo_count( is_db-icid ).
  ENDMETHOD.


  METHOD map_po.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name = zcl_capex_util=>plant_name( is_db-werks ).
  ENDMETHOD.


  METHOD map_quota.
    MOVE-CORRESPONDING is_db TO rs_out.
    rs_out-plant_name       = zcl_capex_util=>plant_name( is_db-werks ).
    rs_out-created_by_name = zcl_capex_util=>user_name( is_db-created_by ).
    rs_out-approved_by_name = zcl_capex_util=>user_name( is_db-approved_by ).
    zcl_capex_wf=>derive_status( EXPORTING iv_doctype       = 'QUOTA'
                                           iv_docid         = is_db-quotaid
                                           iv_header_status = is_db-status
                                 IMPORTING ev_status        = rs_out-status
                                           ev_current_level = rs_out-curr_level ).
  ENDMETHOD.


  METHOD notification1set_get_entityset.
    " Always the caller's own - never filtered by a client-supplied user.
    SELECT * FROM zcapex_notlog
      WHERE recipient = @( zcl_capex_auth=>effective_user( ) )
      ORDER BY sent_ts DESCENDING
      INTO TABLE @DATA(lt_db).
    LOOP AT lt_db INTO DATA(ls_db).
      DATA(ls_out) = CORRESPONDING zcapex_s_notif( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD p.
    READ TABLE mt_param INTO DATA(ls_param) WITH KEY name = iv_name.
    IF sy-subrc = 0.
      rv_value = ls_param-value.
    ENDIF.
  ENDMETHOD.


  METHOD purchaseorderset_get_entity.
    DATA(lv_ebeln) = CONV ebeln( key_value( it_key_tab = it_key_tab iv_name = `Ebeln` ) ).
    lv_ebeln = |{ lv_ebeln ALPHA = IN }|.
    SELECT SINGLE * FROM zcapex_po INTO @DATA(ls_db) WHERE ebeln = @lv_ebeln.
    IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = map_po( ls_db ).
  ENDMETHOD.


  METHOD purchaseorderset_get_entityset.
    DATA lt_db TYPE STANDARD TABLE OF zcapex_po.
    IF iv_source_name = 'CWIP'.                      " CWIPSet('...')/CWIPToPOs
      DATA(lv_cwipid) = CONV zcapex_de_cwipid( key_value( it_key_tab = it_key_tab iv_name = `Cwipid` ) ).
      SELECT * FROM zcapex_po INTO TABLE @lt_db WHERE cwipid = @lv_cwipid ORDER BY issued_on DESCENDING.
    ELSE.
      SELECT * FROM zcapex_po INTO TABLE @lt_db ORDER BY issued_on DESCENDING.
    ENDIF.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = map_po( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).

  ENDMETHOD.


  METHOD quotaitemset_get_entity.
    DATA(lv_id) = CONV zcapex_de_quotaid( key_value( it_key_tab = it_key_tab iv_name = `Quotaid` ) ).
    SELECT SINGLE * FROM zcapex_quota INTO @DATA(ls_db) WHERE quotaid = @lv_id.
    IF sy-subrc <> 0 OR zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
      raise_not_found( iv_entity_name ).
    ENDIF.
    er_entity = map_quota( ls_db ).
  ENDMETHOD.


  METHOD quotaitemset_get_entityset.
    SELECT * FROM zcapex_quota INTO TABLE @DATA(lt_db) ORDER BY quotaid DESCENDING.
    LOOP AT lt_db INTO DATA(ls_db).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_db-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(ls_out) = map_quota( ls_db ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    finish_list( EXPORTING io_tech = io_tech_request_context is_paging = is_paging
                 IMPORTING es_response_context = es_response_context
                 CHANGING ct_data = et_entityset ).
  ENDMETHOD.


  METHOD quotasummaryset_get_entityset.
    " Aggregated at read time, never stored - otherwise the roll-up and the items can disagree.
    DATA lt_out TYPE SORTED TABLE OF zcapex_s_quotasum WITH UNIQUE KEY werks.
    DATA(lv_fy)     = fiscal_from_request( it_key_tab = it_key_tab io_tech = io_tech_request_context ).
    DATA(lv_cap)    = zcl_capex_config=>get_amount( 'QUOTA_YEAR_CAP' ).
    DATA(lv_single) = zcl_capex_config=>get_amount( 'QUOTA_SINGLE_CAP' ).

    SELECT werks, status, amount FROM zcapex_quota INTO TABLE @DATA(lt_q) WHERE fiscalyear = @lv_fy.
    LOOP AT lt_q INTO DATA(ls_q).
      IF zcl_capex_auth=>can_see_plant( iv_werks = ls_q-werks ) = abap_false.
        CONTINUE.
      ENDIF.
      READ TABLE lt_out ASSIGNING FIELD-SYMBOL(<ls_sum>) WITH TABLE KEY werks = ls_q-werks.
      IF sy-subrc <> 0.
        INSERT VALUE #( werks = ls_q-werks fiscalyear = lv_fy
                        plant_name = zcl_capex_util=>plant_name( ls_q-werks )
                        yearcap = lv_cap singlecap = lv_single waers = 'INR' )
          INTO TABLE lt_out ASSIGNING <ls_sum>.
      ENDIF.
      CASE ls_q-status.
        WHEN 'APPROVED'.
          <ls_sum>-used      = <ls_sum>-used + ls_q-amount.
          <ls_sum>-itemcount = <ls_sum>-itemcount + 1.
        WHEN 'PENDING'.
          <ls_sum>-reserved = <ls_sum>-reserved + ls_q-amount.
      ENDCASE.
    ENDLOOP.
    LOOP AT lt_out ASSIGNING <ls_sum>.
      <ls_sum>-remaining = nmax( val1 = 0 val2 = <ls_sum>-yearcap - <ls_sum>-used - <ls_sum>-reserved ).
    ENDLOOP.
    et_entityset = lt_out.
  ENDMETHOD.


  METHOD raise_busi.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        textid            = /iwbep/cx_mgw_busi_exception=>business_error
        message_unlimited = CONV string( iv_text ).
  ENDMETHOD.


  METHOD raise_not_found.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        textid      = /iwbep/cx_mgw_busi_exception=>resource_not_found
        entity_type = iv_entity.
  ENDMETHOD.


  METHOD read_budget_deep.
    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @iv_budgetid.
    DATA(ls_flat) = map_budget( ls_db ).
    MOVE-CORRESPONDING ls_flat TO rs_out.
    SELECT budgetid, yearnr, amount, waers FROM zcapex_budcf
      INTO CORRESPONDING FIELDS OF TABLE @rs_out-budgettocashflows
      WHERE budgetid = @iv_budgetid ORDER BY yearnr.
    rs_out-budgettoitems = zcl_capex_buddoc=>read_items( iv_budgetid ).
  ENDMETHOD.


  METHOD read_cpe_deep.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_db) WHERE cpeid = @iv_cpeid.
    DATA(ls_flat) = map_cpe( ls_db ).
    MOVE-CORRESPONDING ls_flat TO rs_out.
    SELECT * FROM zcapex_cpeven INTO CORRESPONDING FIELDS OF TABLE @rs_out-cpetovendors
      WHERE cpeid = @iv_cpeid ORDER BY vendorseq.
    SELECT cpeid, yearnr, amount, waers FROM zcapex_cpecf
      INTO CORRESPONDING FIELDS OF TABLE @rs_out-cpetocashflows
      WHERE cpeid = @iv_cpeid ORDER BY yearnr.
  ENDMETHOD.


  METHOD result.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    DATA(ls_head) = zcl_capex_doc=>read( iv_doctype = iv_doctype iv_docid = lv_docid ).
    rs_res-success = abap_true.
    rs_res-doctype = iv_doctype.
    rs_res-docid   = lv_docid.
    rs_res-message = iv_message.
    zcl_capex_wf=>derive_status( EXPORTING iv_doctype       = iv_doctype
                                           iv_docid         = lv_docid
                                           iv_header_status = ls_head-status
                                 IMPORTING ev_status        = rs_res-status
                                           ev_current_level = rs_res-curr_level ).
  ENDMETHOD.


  METHOD userplantset_get_entityset.
    DATA ls_out TYPE zcapex_s_usrplt.
    " Own plants only; global users get an empty list, which the app reads as "all plants".
    DATA(lv_id) = key_value( it_key_tab = it_key_tab iv_name = `Userid` ).
    IF lv_id IS NOT INITIAL AND lv_id <> zcl_capex_auth=>effective_user( ).
      RETURN.
    ENDIF.
    DATA(lt_werks) = zcl_capex_auth=>plants_of( ).
    LOOP AT lt_werks INTO DATA(lv_werks).
      ls_out-userid     = zcl_capex_auth=>effective_user( ).
      ls_out-werks      = lv_werks.
      ls_out-plant_name = zcl_capex_util=>plant_name( lv_werks ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
  ENDMETHOD.


  METHOD valuehelpset_get_entityset.
    " One call can load every drop-down: /ValueHelpSet (all) or ?$filter=Domain eq 'CATEGORY'
    DATA: lt_vh   TYPE STANDARD TABLE OF zcapex_s_valhelp,
          ls_out  TYPE zcapex_s_valhelp,
          lv_sort TYPE zcapex_de_sort.
    DATA(lv_dom) = CONV zcapex_de_vhdom( key_value( it_key_tab = it_key_tab iv_name = `Domain` ) ).
    IF lv_dom IS INITIAL.
      lv_dom = filter_value( io_tech = io_tech_request_context iv_property = `DOMAIN` ).
    ENDIF.

    IF lv_dom IS INITIAL OR lv_dom = 'PLANT'.
      " Plants come from T001W - never copied into a Z table - cut to what this user may see.
      SELECT werks, name1 FROM t001w INTO TABLE @DATA(lt_plants) ORDER BY werks.
      LOOP AT lt_plants INTO DATA(ls_plant).
        CHECK zcl_capex_auth=>can_see_plant( iv_werks = ls_plant-werks ) = abap_true.
        CLEAR ls_out.
        ls_out-domain    = 'PLANT'.
        ls_out-keyval    = ls_plant-werks.
        ls_out-textval   = ls_plant-name1.
        lv_sort = lv_sort + 1.
        ls_out-sortorder = lv_sort.
        APPEND ls_out TO et_entityset.
      ENDLOOP.
    ENDIF.

    IF lv_dom <> 'PLANT'.
      IF lv_dom IS INITIAL.
        SELECT zdomain AS domain, keyval, textval, sortorder FROM zcapex_vh INTO CORRESPONDING FIELDS OF TABLE @lt_vh
           WHERE active = @abap_true ORDER BY domain, sortorder.
      ELSE.
        SELECT zdomain AS domain, keyval, textval, sortorder FROM zcapex_vh INTO CORRESPONDING FIELDS OF TABLE @lt_vh
           WHERE active = @abap_true AND zdomain = @lv_dom ORDER BY sortorder.
      ENDIF.
      APPEND LINES OF lt_vh TO et_entityset.
    ENDIF.

  ENDMETHOD.


  METHOD vendorset_get_entityset.
    DATA(lv_id) = CONV zcapex_de_cpeid( key_value( it_key_tab = it_key_tab iv_name = `Cpeid` ) ).
    IF lv_id IS INITIAL.
      lv_id = filter_value( io_tech = io_tech_request_context iv_property = `CPEID` ).
    ENDIF.
    IF lv_id IS INITIAL OR doc_visible( iv_doctype = 'CPE' iv_docid = lv_id ) = abap_false.
      RETURN.
    ENDIF.
    SELECT * FROM zcapex_cpeven INTO CORRESPONDING FIELDS OF TABLE @et_entityset
      WHERE cpeid = @lv_id ORDER BY vendorseq.
  ENDMETHOD.


  method VENDSET_GET_ENTITYSET.

        DATA : ls_filter TYPE /iwbep/s_mgw_select_option,
           lv_name  TYPE name1.

*    READ TABLE it_filter_select_options INTO ls_filter
*    WITH KEY property = 'Name1'.
*    IF sy-subrc = 0.
*      READ TABLE ls_filter-select_options INTO DATA(ls_option) INDEX 1.
*      lv_name = ls_option-low.
*    ENDIF.

    SELECT lifnr
           NAME1
      FROM lfa1
      INTO CORRESPONDING FIELDS OF TABLE et_entityset
      where name1 ne space
      ORDER BY lifnr.

  endmethod.

  METHOD admin_allowed.
    rv_ok = xsdbool( zcl_capex_auth=>proxy_admin( ) = abap_true OR zcl_capex_auth=>is_admin( ) = abap_true ).
  ENDMETHOD.


  METHOD admin_read.
    IF admin_allowed( ) = abap_false.
      raise_busi( 'Maintenance is only for CAPEX Portal administrators.' ).
    ENDIF.
    CASE to_upper( iv_kind ).
      WHEN 'USERS'.
        DATA lt_users TYPE zcl_zcapex_portal_mpc_ext=>tt_adm_user.
        SELECT userid, fullname, email, role, unit, is_admin, is_global, active
          FROM zcapex_user INTO CORRESPONDING FIELDS OF TABLE @lt_users ORDER BY userid.
        SELECT userid, werks FROM zcapex_usrplt INTO TABLE @DATA(lt_plt) ORDER BY userid, werks.
        LOOP AT lt_users ASSIGNING FIELD-SYMBOL(<ls_u>).
          LOOP AT lt_plt INTO DATA(ls_p) WHERE userid = <ls_u>-userid.
            APPEND ls_p-werks TO <ls_u>-plants.
          ENDLOOP.
        ENDLOOP.
        rv_json = /ui2/cl_json=>serialize( data = lt_users compress = abap_true
                                           pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      WHEN 'DOA'.
        DATA lt_doa TYPE zcl_zcapex_portal_mpc_ext=>tt_adm_doa.
        SELECT doaid, capextype, doctype, amount_from, amount_to, waers, range_text, active, valid_from, valid_to
          FROM zcapex_doa INTO CORRESPONDING FIELDS OF TABLE @lt_doa ORDER BY doaid.
        SELECT doaid, seqnr, role, approver, sla_days, mandatory, eval_req
          FROM zcapex_doachn INTO TABLE @DATA(lt_chn) ORDER BY doaid, seqnr.
        LOOP AT lt_doa ASSIGNING FIELD-SYMBOL(<ls_d>).
          LOOP AT lt_chn INTO DATA(ls_c) WHERE doaid = <ls_d>-doaid.
            APPEND CORRESPONDING #( ls_c ) TO <ls_d>-chain.
          ENDLOOP.
        ENDLOOP.
        rv_json = /ui2/cl_json=>serialize( data = lt_doa compress = abap_true
                                           pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
      WHEN OTHERS.
        raise_busi( |Unknown maintenance list { iv_kind }.| ).
    ENDCASE.
  ENDMETHOD.


  METHOD admin_save.
    IF admin_allowed( ) = abap_false.
      raise_busi( 'Maintenance is only for CAPEX Portal administrators.' ).
    ENDIF.
    DATA(lv_who) = COND string( WHEN zcl_capex_auth=>proxy_email( ) IS NOT INITIAL
                                THEN zcl_capex_auth=>proxy_email( ) ELSE CONV string( sy-uname ) ).

    CASE to_upper( iv_kind ).

      WHEN 'USER'.
        DATA ls_u TYPE zcl_zcapex_portal_mpc_ext=>ts_adm_user.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-camel_case
                                   CHANGING data = ls_u ).
        ls_u-userid = to_upper( condense( ls_u-userid ) ).
        ls_u-email  = condense( ls_u-email ).
        IF ls_u-userid IS INITIAL OR ls_u-fullname IS INITIAL OR ls_u-email IS INITIAL OR ls_u-role IS INITIAL.
          raise_busi( 'User ID, name, e-mail and role are required.' ).
        ENDIF.
        DATA(lv_mail) = condense( CONV string( ls_u-email ) ).
        IF lv_mail NS '@' OR lv_mail CS ` `.
          raise_busi( 'Enter a valid e-mail address.' ).
        ENDIF.
        ls_u-is_admin  = COND #( WHEN ls_u-is_admin  = 'X' THEN 'X' ELSE ' ' ).
        ls_u-is_global = COND #( WHEN ls_u-is_global = 'X' THEN 'X' ELSE ' ' ).
        ls_u-active    = COND #( WHEN ls_u-active    = 'X' THEN 'X' ELSE ' ' ).
        " A login must match exactly ONE active user (zcl_capex_auth=>effective_user).
        IF ls_u-active = 'X'.
          SELECT userid, email FROM zcapex_user INTO TABLE @DATA(lt_all) WHERE active = 'X'.
          LOOP AT lt_all INTO DATA(ls_o) WHERE userid <> ls_u-userid.
            IF to_upper( condense( CONV string( ls_o-email ) ) ) = to_upper( CONV string( ls_u-email ) ).
              raise_busi( |E-mail { ls_u-email } already belongs to the active user { ls_o-userid }.| ).
            ENDIF.
          ENDLOOP.
        ENDIF.
        DATA ls_dbu TYPE zcapex_user.
        MOVE-CORRESPONDING ls_u TO ls_dbu.
        MODIFY zcapex_user FROM @ls_dbu.
        DELETE FROM zcapex_usrplt WHERE userid = @ls_u-userid.
        DATA ls_dbp TYPE zcapex_usrplt.
        LOOP AT ls_u-plants INTO DATA(lv_w).
          IF lv_w IS INITIAL.
            CONTINUE.
          ENDIF.
          ls_dbp-userid = ls_u-userid.
          ls_dbp-werks  = to_upper( lv_w ).
          INSERT zcapex_usrplt FROM @ls_dbp.
        ENDLOOP.
        COMMIT WORK.
        zcl_capex_log=>audit( iv_doctype = 'ADMIN' iv_docid = ls_u-userid iv_action = 'CAPEX user maintained'
                              iv_comment = |{ lv_who }: role { ls_u-role }, active { ls_u-active }, admin { ls_u-is_admin }, plants { lines( ls_u-plants ) }| ).
        rv_msg = |User { ls_u-userid } saved.|.

      WHEN 'DOA'.
        DATA ls_d TYPE zcl_zcapex_portal_mpc_ext=>ts_adm_doa.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-camel_case
                                   CHANGING data = ls_d ).
        ls_d-doaid = to_upper( condense( ls_d-doaid ) ).
        IF ls_d-doaid IS INITIAL.
          " New rule: next free D<n>.
          SELECT doaid FROM zcapex_doa INTO TABLE @DATA(lt_ids).
          DATA(lv_max) = 0.
          LOOP AT lt_ids INTO DATA(lv_id).
            DATA(lv_num) = substring( val = lv_id-doaid off = 1 ).
            IF lv_id-doaid(1) = 'D' AND lv_num CO '0123456789 '.
              lv_max = nmax( val1 = lv_max val2 = CONV i( lv_num ) ).
            ENDIF.
          ENDLOOP.
          ls_d-doaid = |D{ lv_max + 1 }|.
        ENDIF.
        IF ls_d-capextype IS INITIAL.
          raise_busi( 'CAPEX type is required (use * for all types).' ).
        ENDIF.
        ls_d-active = COND #( WHEN ls_d-active = 'X' THEN 'X' ELSE ' ' ).
        " The approval engine matches a rule on the document type exactly (CPE or BUD), so a blank one never applies.
        ls_d-doctype = to_upper( condense( ls_d-doctype ) ).
        IF ls_d-active = 'X' AND ls_d-doctype <> 'CPE' AND ls_d-doctype <> 'BUD'.
          raise_busi( 'Document type must be CPE or BUD for an active rule.' ).
        ENDIF.
        IF ls_d-waers IS INITIAL.
          ls_d-waers = 'INR'.
        ENDIF.
        IF ls_d-amount_from < 0 OR ls_d-amount_to < ls_d-amount_from.
          raise_busi( 'The upper amount must be at least the lower amount.' ).
        ENDIF.
        IF ls_d-valid_to IS NOT INITIAL AND ls_d-valid_to < ls_d-valid_from.
          raise_busi( 'Valid to cannot be before valid from.' ).
        ENDIF.
        IF ls_d-chain IS INITIAL.
          raise_busi( 'Add at least one approval step.' ).
        ENDIF.
        " Two active rules of the same CAPEX type + document type must not cover the same amount.
        IF ls_d-active = 'X'.
          SELECT doaid, amount_from, amount_to, valid_from, valid_to FROM zcapex_doa INTO TABLE @DATA(lt_oth)
            WHERE active = 'X' AND capextype = @ls_d-capextype AND doctype = @ls_d-doctype.
          LOOP AT lt_oth INTO DATA(ls_x) WHERE doaid <> ls_d-doaid.
            DATA(lv_dates) = xsdbool( ( ls_x-valid_to IS INITIAL OR ls_x-valid_to >= ls_d-valid_from )
                                  AND ( ls_d-valid_to IS INITIAL OR ls_d-valid_to >= ls_x-valid_from ) ).
            IF lv_dates = abap_true AND ls_d-amount_from <= ls_x-amount_to AND ls_x-amount_from <= ls_d-amount_to.
              raise_busi( |Rule { ls_x-doaid } already covers part of this amount range for the same CAPEX type and document type.| ).
            ENDIF.
          ENDLOOP.
        ENDIF.
        DATA lt_dbc TYPE STANDARD TABLE OF zcapex_doachn WITH DEFAULT KEY.
        DATA(lv_seq) = 0.
        LOOP AT ls_d-chain INTO DATA(ls_ch).
          IF ls_ch-role IS INITIAL.
            raise_busi( 'Every approval step needs a role.' ).
          ENDIF.
          lv_seq = lv_seq + 1.
          APPEND VALUE #( doaid = ls_d-doaid seqnr = lv_seq role = ls_ch-role approver = to_upper( ls_ch-approver )
                          sla_days = nmax( val1 = 0 val2 = ls_ch-sla_days )
                          mandatory = COND #( WHEN ls_ch-mandatory = 'X' THEN 'X' ELSE ' ' )
                          eval_req  = COND #( WHEN ls_ch-eval_req  = 'X' THEN 'X' ELSE ' ' ) ) TO lt_dbc.
        ENDLOOP.
        DATA ls_dbd TYPE zcapex_doa.
        MOVE-CORRESPONDING ls_d TO ls_dbd.
        ls_dbd-range_text = COND #( WHEN ls_d-range_text IS NOT INITIAL THEN ls_d-range_text ELSE |{ ls_d-amount_from DECIMALS = 0 } - { ls_d-amount_to DECIMALS = 0 }| ).
        MODIFY zcapex_doa FROM @ls_dbd.
        DELETE FROM zcapex_doachn WHERE doaid = @ls_d-doaid.
        INSERT zcapex_doachn FROM TABLE @lt_dbc.
        COMMIT WORK.
        zcl_capex_log=>audit( iv_doctype = 'ADMIN' iv_docid = ls_d-doaid iv_action = 'DOA rule maintained'
                              iv_comment = |{ lv_who }: { ls_d-capextype }/{ ls_d-doctype } { ls_d-amount_from DECIMALS = 0 }-{ ls_d-amount_to DECIMALS = 0 }, { lines( lt_dbc ) } steps, active { ls_d-active }| ).
        rv_msg = |DOA rule { ls_d-doaid } saved.|.

      WHEN 'CONFIG'.
        TYPES: BEGIN OF ty_cfg, param TYPE zcapex_config-param, value TYPE zcapex_config-value, END OF ty_cfg.
        DATA ls_cfg TYPE ty_cfg.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-camel_case
                                   CHANGING data = ls_cfg ).
        ls_cfg-param = to_upper( condense( ls_cfg-param ) ).
        ls_cfg-value = condense( ls_cfg-value ).
        " Only the settings the Admin Console shows. Never PROXY_* or the other technical parameters.
        DATA(lv_ok) = xsdbool( ls_cfg-param = 'SLA_WARN_DAYS' OR ls_cfg-param = 'SLA_BREACH_DAYS'
                            OR ls_cfg-param = 'SLA_AUTO_ESCALATE' OR ls_cfg-param = 'QUOTA_YEAR_CAP'
                            OR ls_cfg-param = 'QUOTA_SINGLE_CAP' OR ls_cfg-param CP 'QUOTA_YEAR_CAP_+*' ).
        IF lv_ok = abap_false.
          raise_busi( |Setting { ls_cfg-param } cannot be changed here.| ).
        ENDIF.
        IF ls_cfg-param = 'SLA_AUTO_ESCALATE'.
          ls_cfg-value = COND #( WHEN to_upper( ls_cfg-value ) = 'X' THEN 'X' ELSE '' ).
        ELSEIF ls_cfg-value IS INITIAL OR condense( CONV string( ls_cfg-value ) ) CN '0123456789.'.
          raise_busi( |{ ls_cfg-param } must be a number.| ).
        ENDIF.
        SELECT SINGLE * FROM zcapex_config INTO @DATA(ls_old) WHERE param = @ls_cfg-param.
        DATA ls_dbc TYPE zcapex_config.
        IF sy-subrc = 0.
          ls_dbc = ls_old.
        ELSE.
          ls_dbc-param = ls_cfg-param.
        ENDIF.
        ls_dbc-value = ls_cfg-value.
        MODIFY zcapex_config FROM @ls_dbc.
        COMMIT WORK.
        zcl_capex_log=>audit( iv_doctype = 'ADMIN' iv_docid = ls_cfg-param iv_action = 'CAPEX setting changed'
                              iv_comment = |{ lv_who }: { ls_old-value } -> { ls_cfg-value }| ).
        rv_msg = |Setting { ls_cfg-param } saved.|.

      WHEN OTHERS.
        raise_busi( |Unknown maintenance action { iv_kind }.| ).
    ENDCASE.
  ENDMETHOD.


  METHOD capture_identity.
    DATA: lv_email TYPE string,
          lv_key   TYPE string,
          lv_admin TYPE string.
    IF mr_request_details IS BOUND.
      " The custom query options may sit in any of these tables depending on the request kind.
      DATA(lt_all) = mr_request_details->*-parameters.
      APPEND LINES OF mr_request_details->*-uri_parameters TO lt_all.
      APPEND LINES OF mr_request_details->*-technical_request-parameters TO lt_all.
      APPEND LINES OF mr_request_details->*-technical_request-action_parameters TO lt_all.
      LOOP AT lt_all ASSIGNING FIELD-SYMBOL(<ls_prm>).
        CASE to_lower( <ls_prm>-name ).
          WHEN 'zcpxmail'. lv_email = <ls_prm>-value.
          WHEN 'zcpxkey'.  lv_key   = <ls_prm>-value.
          WHEN 'zcpxadm'.  lv_admin = <ls_prm>-value.
        ENDCASE.
      ENDLOOP.
      " Custom (non-system) URI query options are kept in this table.
      LOOP AT mr_request_details->*-t_uri_query_parameter ASSIGNING FIELD-SYMBOL(<ls_qry>).
        CASE to_lower( <ls_qry>-name ).
          " Query values are kept percent-encoded by the framework (amit%40x.com): decode them.
          WHEN 'zcpxmail'. lv_email = cl_http_utility=>unescape_url( <ls_qry>-value ).
          WHEN 'zcpxkey'.  lv_key   = cl_http_utility=>unescape_url( <ls_qry>-value ).
          WHEN 'zcpxadm'.  lv_admin = cl_http_utility=>unescape_url( <ls_qry>-value ).
        ENDCASE.
      ENDLOOP.
    ENDIF.
    zcl_capex_auth=>set_proxy_identity( iv_email = lv_email iv_key = lv_key iv_admin = lv_admin ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    capture_identity( ).
    IF iv_entity_set_name = 'DocXferSet'.
      " Emami Apps upload: the file travels as base64 text in a normal JSON entity (the proxy drops raw bodies and Slug).
      DATA ls_x TYPE zcl_zcapex_portal_mpc_ext=>ts_doc_xfer.
      io_data_provider->read_entry_data( IMPORTING es_data = ls_x ).
      IF ls_x-content IS INITIAL.
        raise_busi( 'The file content is missing' ).
      ENDIF.
      DATA lv_bin TYPE xstring.
      TRY.
          lv_bin = cl_http_utility=>decode_x_base64( condense( ls_x-content ) ).
        CATCH cx_root.
          raise_busi( 'The file content is not valid base64' ).
      ENDTRY.
      IF ls_x-doctype IS INITIAL OR ls_x-docid IS INITIAL OR ls_x-filename IS INITIAL.
        raise_busi( 'Doctype, Docid and Filename are required' ).
      ENDIF.
      DATA(ls_new) = VALUE zcapex_doc( doctype   = to_upper( ls_x-doctype )
                                       docid     = ls_x-docid
                                       category  = to_upper( ls_x-category )
                                       filename  = ls_x-filename
                                       doc_title = ls_x-doc_title
                                       note      = ls_x-note ).
      DATA(ls_saved) = store_document( is_doc = ls_new iv_content = lv_bin iv_mime = CONV #( ls_x-mimetype ) ).
      ls_x-doctype = ls_saved-doctype.
      ls_x-docseq  = ls_saved-docseq.
      CLEAR ls_x-content.
      copy_data_to_ref( EXPORTING is_data = ls_x CHANGING cr_data = er_entity ).
      RETURN.
    ENDIF.
    super->/iwbep/if_mgw_appl_srv_runtime~create_entity(
      EXPORTING
        iv_entity_name = iv_entity_name
        iv_entity_set_name = iv_entity_set_name
        iv_source_name = iv_source_name
        io_data_provider = io_data_provider
        it_key_tab = it_key_tab
        it_navigation_path = it_navigation_path
        io_tech_request_context = io_tech_request_context
      IMPORTING
        er_entity = er_entity ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~update_entity.
    capture_identity( ).
    super->/iwbep/if_mgw_appl_srv_runtime~update_entity(
      EXPORTING
        iv_entity_name = iv_entity_name
        iv_entity_set_name = iv_entity_set_name
        iv_source_name = iv_source_name
        io_data_provider = io_data_provider
        it_key_tab = it_key_tab
        it_navigation_path = it_navigation_path
        io_tech_request_context = io_tech_request_context
      IMPORTING
        er_entity = er_entity ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    capture_identity( ).
    super->/iwbep/if_mgw_appl_srv_runtime~delete_entity(
      EXPORTING
        iv_entity_name = iv_entity_name
        iv_entity_set_name = iv_entity_set_name
        iv_source_name = iv_source_name
        it_key_tab = it_key_tab
        it_navigation_path = it_navigation_path
        io_tech_request_context = io_tech_request_context ).
  ENDMETHOD.

  METHOD store_document.
    " Shared by the Fiori upload (create_stream, raw body + Slug) and the Emami Apps upload (DocXferSet, base64 in JSON).
    " The rules are exactly the ones create_stream always had; only the way the bytes arrive differs.
    rs_doc = is_doc.
    IF doc_visible( iv_doctype = rs_doc-doctype iv_docid = rs_doc-docid ) = abap_false.
      raise_busi( |{ rs_doc-docid } not found| ).
    ENDIF.

    TRY.
        DATA(ls_head) = zcl_capex_doc=>read( iv_doctype = rs_doc-doctype iv_docid = rs_doc-docid ).
        " Uploads only while the document can still change - same rule as DELETE.
        " AMT_REV is the exception: the admin attaches it to an approved CPE (section 7.4).
        IF rs_doc-category <> 'AMT_REV'
           AND NOT ( ls_head-status = 'DRAFT' OR ls_head-status = 'BLOCKED'
                  OR ls_head-status = 'UNDER_EVALUATION'
                  OR ( rs_doc-doctype = 'IC' AND ls_head-status = 'PENDING' ) ).
          raise_busi( |Attachments cannot be added once { rs_doc-docid } is { ls_head-status }| ).
        ENDIF.
        IF rs_doc-category = 'AMT_REV' AND zcl_capex_auth=>is_admin( ) = abap_false.
          raise_busi( 'Only an administrator can attach an amount-revision document' ).
        ENDIF.

        zcl_capex_file=>check_upload( iv_filename = rs_doc-filename
                                      iv_size     = xstrlen( iv_content ) ).

        " One file per fixed slot: a new RFQ1 replaces the old RFQ1 (GEN and AMT_REV accumulate).
        IF NOT ( rs_doc-category CP 'GEN*' OR rs_doc-category = 'AMT_REV' ).
          SELECT SINGLE docseq, filepath FROM zcapex_doc INTO @DATA(ls_old)
            WHERE doctype = @rs_doc-doctype AND docid = @rs_doc-docid AND category = @rs_doc-category.
          IF sy-subrc = 0.
            zcl_capex_file=>delete( ls_old-filepath ).
            DELETE FROM zcapex_doc WHERE doctype = @rs_doc-doctype AND docid = @rs_doc-docid
                                     AND docseq = @ls_old-docseq.
          ENDIF.
        ENDIF.

        SELECT MAX( docseq ) FROM zcapex_doc INTO @DATA(lv_seq)
          WHERE doctype = @rs_doc-doctype AND docid = @rs_doc-docid.
        rs_doc-docseq      = lv_seq + 1.
        rs_doc-mimetype    = iv_mime.
        rs_doc-filesize    = xstrlen( iv_content ).
        rs_doc-filepath    = zcl_capex_file=>build_path( iv_doctype  = rs_doc-doctype
                                                         iv_docid    = rs_doc-docid
                                                         iv_docseq   = rs_doc-docseq
                                                         iv_filename = rs_doc-filename ).
        rs_doc-uploaded_by = zcl_capex_auth=>effective_user( ).
        rs_doc-uploaded_on = sy-datum.
        rs_doc-uploaded_at = sy-uzeit.

        " File first, row second: a failed write leaves no row pointing at nothing.
        zcl_capex_file=>write( iv_path = rs_doc-filepath iv_content = iv_content ).
        INSERT zcapex_doc FROM @rs_doc.
        IF sy-subrc <> 0.
          zcl_capex_file=>delete( rs_doc-filepath ).
          zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = rs_doc-docid ).
        ENDIF.
      CATCH zcx_capex_error INTO DATA(lx_error).
        raise_busi( lx_error->get_text( ) ).
    ENDTRY.

    zcl_capex_log=>audit( iv_doctype = rs_doc-doctype iv_docid = rs_doc-docid
                          iv_action  = |Attachment added ({ rs_doc-category })|
                          iv_comment = rs_doc-filename ).

  ENDMETHOD.

ENDCLASS.
