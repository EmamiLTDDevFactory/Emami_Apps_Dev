CLASS zcl_zcapex_portal_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zcapex_portal_mpc
  CREATE PUBLIC .

  PUBLIC SECTION.

*  types :
*        BEGIN OF ty_cpe_deep.
*        INCLUDE TYPE ZCL_ZCAPEX_PORTAL_MPC_EXT=>ts_cpe.
*        TYPES : CPETOVENDORS TYPE TABLE OF ts_vendor WITH DEFAULT KEY,
*      END OF ty_cpe_deep .

    " Budget line items (sub-budgets) - modelled in code, not in the SEGW project (see define_budget_item)
    TYPES ts_budget_item TYPE zcapex_s_buditm.
    TYPES tt_budget_item TYPE STANDARD TABLE OF ts_budget_item WITH DEFAULT KEY.

    " Deep insert: POST /BudgetSet with "BudgetToCashFlows": [ ... ], "BudgetToItems": [ ... ]
    TYPES: BEGIN OF ts_budget_deep.
             INCLUDE TYPE zcapex_s_budget.
             TYPES:   budgettocashflows TYPE zcapex_tt_budcf,
             budgettoitems     TYPE tt_budget_item,
           END OF ts_budget_deep.
    " Deep insert: POST /CPESet with "CPEToVendors": [ ... ], "CPEToCashFlows": [ ... ]
    TYPES: BEGIN OF ts_cpe_deep.
             INCLUDE TYPE zcapex_s_cpe.
             TYPES:   cpetovendors   TYPE zcapex_tt_vendor,
             cpetocashflows TYPE zcapex_tt_cpecf,
           END OF ts_cpe_deep.

    " Document transfer for the Emami Apps (file as base64 text in a JSON entity; create = upload, filtered read = download).
    TYPES: BEGIN OF ts_doc_xfer,
             doctype   TYPE c LENGTH 15,
             docid     TYPE c LENGTH 15,
             docseq    TYPE c LENGTH 4,
             category  TYPE c LENGTH 20,
             filename  TYPE c LENGTH 255,
             doc_title TYPE c LENGTH 120,
             note      TYPE c LENGTH 255,
             mimetype  TYPE c LENGTH 100,
             content   TYPE string,
           END OF ts_doc_xfer.

    TYPES: BEGIN OF ts_remove_doc,
             doctype TYPE c LENGTH 15,
             docid   TYPE c LENGTH 15,
             docseq  TYPE c LENGTH 4,
           END OF ts_remove_doc.

    METHODS get_last_modified
        REDEFINITION .
    METHODS define
        REDEFINITION .
  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS define_doc_xfer
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS xprop
      IMPORTING io_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ
                iv_name TYPE string iv_len TYPE i
                iv_key  TYPE abap_bool DEFAULT abap_false
      RAISING   /iwbep/cx_mgw_med_exception.
    METHODS define_budget_item
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_remove_document
      RAISING /iwbep/cx_mgw_med_exception.
ENDCLASS.



CLASS ZCL_ZCAPEX_PORTAL_MPC_EXT IMPLEMENTATION.


  METHOD define.
    super->define( ).
*  DATA : lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ.
*
*  lo_entity_type = model->get_entity_type( iv_entity_name = 'CPE' ).
*  lo_entity_type->bind_structure( iv_structure_name = 'ZCL_ZCAPEX_PORTAL_MPC_EXT=>TY_CPE_DEEP' ).

    " Must run before the Budget deep structure is bound (it adds BudgetToItems to Budget).
    define_budget_item( ).

    DATA(lo_budget) = model->get_entity_type( iv_entity_name = 'Budget' ).
    lo_budget->bind_structure( iv_structure_name = 'ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_BUDGET_DEEP' ).
    DATA(lo_cpe) = model->get_entity_type( iv_entity_name = 'CPE' ).
    lo_cpe->bind_structure( iv_structure_name = 'ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_CPE_DEEP' ).
    " Media entity: the MIME type property is the stream's content type.
    DATA(lo_doc)  = model->get_entity_type( iv_entity_name = 'Document' ).
    DATA(lo_mime) = lo_doc->get_property( iv_property_name = 'Mimetype' ).
    lo_mime->set_as_content_type( ).

    define_doc_xfer( ).
    define_remove_document( ).

    " A step that has not been reached yet has no ReachedOn date. The generated property is mandatory,
    " so the gateway failed the whole read (HTTP 500) for any CPE still in approval or on hold.
    model->get_entity_type( iv_entity_name = 'ApprovalStep' )->get_property( iv_property_name = 'ReachedOn' )->set_nullable( abap_true ).

  ENDMETHOD.


  METHOD define_remove_document.
    " Additive function import: the Azure proxy drops HTTP DELETE, so Emami Apps removes an attachment with a POST.
    " Same rules as DocumentSet DELETE (DPC DOCUMENTSET_DELETE_ENTITY); Fiori is not affected.
    DATA(lo_action) = model->create_action( 'RemoveDocument' ).
    lo_action->set_return_complex_type( 'ActionResult' ).
    lo_action->set_http_method( 'POST' ).
    lo_action->set_return_multiplicity( '1' ).
    DATA(lo_par) = lo_action->create_input_parameter( iv_parameter_name = 'Doctype' iv_abap_fieldname = 'DOCTYPE' ).
    lo_par->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_par->set_maxlength( iv_max_length = 15 ).
    lo_par = lo_action->create_input_parameter( iv_parameter_name = 'Docid' iv_abap_fieldname = 'DOCID' ).
    lo_par->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_par->set_maxlength( iv_max_length = 15 ).
    lo_par = lo_action->create_input_parameter( iv_parameter_name = 'Docseq' iv_abap_fieldname = 'DOCSEQ' ).
    lo_par->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_par->set_maxlength( iv_max_length = 4 ).
    lo_action->bind_input_structure( iv_structure_name = 'ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_REMOVE_DOC' ).
  ENDMETHOD.


  METHOD define_doc_xfer.
    DATA(lo_t) = model->create_entity_type( iv_entity_type_name = 'DocXfer' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZCAPEX_PORTAL_MPC_EXT=>TS_DOC_XFER' ).
    DATA(lo_s) = lo_t->create_entity_set( 'DocXferSet' ).
    lo_s->set_creatable( abap_true ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_false ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    xprop( io_type = lo_t iv_name = 'Doctype' iv_len = 15 iv_key = abap_true ).
    xprop( io_type = lo_t iv_name = 'Docid' iv_len = 15 iv_key = abap_true ).
    xprop( io_type = lo_t iv_name = 'Docseq' iv_len = 4 iv_key = abap_true ).
    xprop( io_type = lo_t iv_name = 'Category' iv_len = 20 ).
    xprop( io_type = lo_t iv_name = 'Filename' iv_len = 255 ).
    xprop( io_type = lo_t iv_name = 'DocTitle' iv_len = 120 ).
    xprop( io_type = lo_t iv_name = 'Note' iv_len = 255 ).
    xprop( io_type = lo_t iv_name = 'Mimetype' iv_len = 100 ).
    DATA(lo_pc) = lo_t->create_property( iv_property_name = 'Content' iv_abap_fieldname = 'CONTENT' ).
    lo_pc->set_type_edm_string( ).
    lo_pc->set_creatable( abap_true ).  lo_pc->set_updatable( abap_false ).  lo_pc->set_nullable( abap_true ).
    lo_pc->set_filterable( abap_false ).  lo_pc->set_sortable( abap_false ).
  ENDMETHOD.


  METHOD xprop.
    DATA(lo_p) = io_type->create_property( iv_property_name = CONV #( iv_name ) iv_abap_fieldname = CONV #( COND string( WHEN iv_name = 'DocTitle' THEN 'DOC_TITLE' ELSE to_upper( iv_name ) ) ) ).
    IF iv_key = abap_true.
      lo_p->set_is_key( ).
    ENDIF.
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
    lo_p->set_creatable( abap_true ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_true ).
    lo_p->set_nullable( COND #( WHEN iv_key = abap_true THEN abap_false ELSE abap_true ) ).
    lo_p->set_filterable( abap_true ).
  ENDMETHOD.


  METHOD define_budget_item.
    " BudgetItem entity type + BudgetItemSet now come from SEGW (base MPC).
    " Only the association / navigation property are added here.

    DATA(lo_assoc) = model->create_association( iv_association_name = 'Budget_Item'
                                                iv_left_type        = 'Budget'
                                                iv_right_type       = 'BudgetItem'
                                                iv_left_card        = '1'
                                                iv_right_card       = 'N'
                                                iv_def_assoc_set    = abap_false ).
    lo_assoc->create_ref_constraint( )->add_property( iv_principal_property = 'Budgetid'
                                                      iv_dependent_property = 'Budgetid' ).
    model->create_association_set( iv_association_set_name  = 'Budget_ItemSet'
                                   iv_left_entity_set_name  = 'BudgetSet'
                                   iv_right_entity_set_name = 'BudgetItemSet'
                                   iv_association_name      = 'Budget_Item' ).

    model->get_entity_type( iv_entity_name = 'Budget' )->create_navigation_property(
        iv_property_name    = 'BudgetToItems'
        iv_abap_fieldname   = 'BUDGETTOITEMS'
        iv_association_name = 'Budget_Item' ).
  ENDMETHOD.


  METHOD get_last_modified.
    " Bump whenever the model in this class changes, so Gateway refreshes its metadata cache.
    CONSTANTS lc_model_changed TYPE timestamp VALUE '20261125170000'.
    rv_last_modified = super->get_last_modified( ).
    IF rv_last_modified LT lc_model_changed.
      rv_last_modified = lc_model_changed.
    ENDIF.
  ENDMETHOD.
ENDCLASS.