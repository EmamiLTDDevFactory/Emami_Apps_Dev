"! Model provider of OData service ZMEDICLAIM_SRV (code based, no SEGW project). Entity structures live in ZCL_MEDI_BL.
CLASS zcl_zmediclaim_mpc DEFINITION
  PUBLIC
  INHERITING FROM /iwbep/cl_mgw_abs_model
  CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS gc_schema_namespace TYPE string VALUE 'ZMEDICLAIM_SRV'.
    METHODS define REDEFINITION.
    METHODS get_last_modified REDEFINITION.
  PROTECTED SECTION.
    METHODS define_entities RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_associations RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_actions RAISING /iwbep/cx_mgw_med_exception.
ENDCLASS.

CLASS zcl_zmediclaim_mpc IMPLEMENTATION.
  METHOD define.
    model->set_schema_namespace( gc_schema_namespace ).
    define_entities( ).
    define_associations( ).
    define_actions( ).
  ENDMETHOD.

  METHOD get_last_modified.
    CONSTANTS lc_gen_date_time TYPE timestamp VALUE '20261120120000'.
    rv_last_modified = super->get_last_modified( ).
    IF rv_last_modified < lc_gen_date_time.
      rv_last_modified = lc_gen_date_time.
    ENDIF.
  ENDMETHOD.

  METHOD define_entities.
    DATA: lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_property    TYPE REF TO /iwbep/if_mgw_odata_property,
          lo_entity_set  TYPE REF TO /iwbep/if_mgw_odata_entity_set.

    " ---- entity type Context / set ContextSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Context' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'UserId' iv_abap_fieldname = 'USERID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FullName' iv_abap_fieldname = 'FULLNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'YearText' iv_abap_fieldname = 'YEARTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 9 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CutOffDate' iv_abap_fieldname = 'CUTOFFDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'InsurerMail' iv_abap_fieldname = 'INSURERMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeCalcDate' iv_abap_fieldname = 'AGECALCDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'IsAuthUser' iv_abap_fieldname = 'ISAUTHUSER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'IsHrAdmin' iv_abap_fieldname = 'ISHRADMIN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'WindowOpen' iv_abap_fieldname = 'WINDOWOPEN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'MyReqNo' iv_abap_fieldname = 'MYREQNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'MyCanChange' iv_abap_fieldname = 'MYCANCHANGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_CONTEXT' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'ContextSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type SumInsured / set SumInsuredSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'SumInsured' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumInsured' iv_abap_fieldname = 'SUMINSURED' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpAllowed' iv_abap_fieldname = 'TOPUPALLOWED' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_SUMINSURED' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'SumInsuredSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type TopUp / set TopUpSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'TopUp' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpAmount' iv_abap_fieldname = 'TOPUPAMOUNT' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Premium' iv_abap_fieldname = 'PREMIUM' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_TOPUP' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'TopUpSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type Employee / set EmployeeSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Employee' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'IsSapEmployee' iv_abap_fieldname = 'ISSAPEMPLOYEE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Eligible' iv_abap_fieldname = 'ELIGIBLE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Reason' iv_abap_fieldname = 'REASON' ).
    lo_property->set_type_edm_string( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompCode' iv_abap_fieldname = 'COMPCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompText' iv_abap_fieldname = 'COMPTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dept' iv_abap_fieldname = 'DEPT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OuText' iv_abap_fieldname = 'OUTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Design' iv_abap_fieldname = 'DESIGN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'DesignText' iv_abap_fieldname = 'DESIGNTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Location' iv_abap_fieldname = 'LOCATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocText' iv_abap_fieldname = 'LOCTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 15 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FirstName' iv_abap_fieldname = 'FIRSTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LastName' iv_abap_fieldname = 'LASTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dob' iv_abap_fieldname = 'DOB' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeInYears' iv_abap_fieldname = 'AGEINYEARS' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'GenderText' iv_abap_fieldname = 'GENDERTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CorpEmail' iv_abap_fieldname = 'CORPEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PersonalEmail' iv_abap_fieldname = 'PERSONALEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Contact' iv_abap_fieldname = 'CONTACT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CtcAbove5L' iv_abap_fieldname = 'CTCABOVE5L' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CtcCode' iv_abap_fieldname = 'CTCCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ExistingReqNo' iv_abap_fieldname = 'EXISTINGREQNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PrevYearReqNo' iv_abap_fieldname = 'PREVYEARREQNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_EMPLOYEE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'EmployeeSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type Policy / set PolicySet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Policy' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ReqNo' iv_abap_fieldname = 'REQNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ReqDate' iv_abap_fieldname = 'REQDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CreatedBy' iv_abap_fieldname = 'CREATEDBY' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompCode' iv_abap_fieldname = 'COMPCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CodeTxt' iv_abap_fieldname = 'CODETXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dept' iv_abap_fieldname = 'DEPT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OuText' iv_abap_fieldname = 'OUTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Design' iv_abap_fieldname = 'DESIGN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'DesignTxt' iv_abap_fieldname = 'DESIGNTXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FirstName' iv_abap_fieldname = 'FIRSTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LastName' iv_abap_fieldname = 'LASTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FullName' iv_abap_fieldname = 'FULLNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dob' iv_abap_fieldname = 'DOB' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeInYrs' iv_abap_fieldname = 'AGEINYRS' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'GenText' iv_abap_fieldname = 'GENTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Location' iv_abap_fieldname = 'LOCATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocTxt' iv_abap_fieldname = 'LOCTXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 15 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CorpEmail' iv_abap_fieldname = 'CORPEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PersonalEmail' iv_abap_fieldname = 'PERSONALEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Contact' iv_abap_fieldname = 'CONTACT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumBase' iv_abap_fieldname = 'SUMBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PreBase' iv_abap_fieldname = 'PREBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpYes' iv_abap_fieldname = 'TOPUPYES' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpPolicy' iv_abap_fieldname = 'TOPUPPOLICY' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpPre' iv_abap_fieldname = 'TOPUPPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TotalPre' iv_abap_fieldname = 'TOTALPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpShare' iv_abap_fieldname = 'EMPSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Married' iv_abap_fieldname = 'MARRIED' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'NoEmpIdSap' iv_abap_fieldname = 'NOEMPIDSAP' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'NoEmpIdCtc' iv_abap_fieldname = 'NOEMPIDCTC' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'DelFlag' iv_abap_fieldname = 'DELFLAG' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmployerShare' iv_abap_fieldname = 'EMPLOYERSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CanChange' iv_abap_fieldname = 'CANCHANGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_POLICY' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PolicySet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_true ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type Member / set PolicyMemberSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Member' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ReqNo' iv_abap_fieldname = 'REQNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SlNo' iv_abap_fieldname = 'SLNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name' iv_abap_fieldname = 'NAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dob' iv_abap_fieldname = 'DOB' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Relation' iv_abap_fieldname = 'RELATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'RelationText' iv_abap_fieldname = 'RELATIONTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeInYrs' iv_abap_fieldname = 'AGEINYRS' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PreAmt' iv_abap_fieldname = 'PREAMT' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ActPre' iv_abap_fieldname = 'ACTPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumBase' iv_abap_fieldname = 'SUMBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CrtDate' iv_abap_fieldname = 'CRTDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'IsNew' iv_abap_fieldname = 'ISNEW' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_MEMBER' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PolicyMemberSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type Quote / set QuoteSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Quote' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'QuoteId' iv_abap_fieldname = 'QUOTEID' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 32 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumInsured' iv_abap_fieldname = 'SUMINSURED' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpAmount' iv_abap_fieldname = 'TOPUPAMOUNT' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CtcCode' iv_abap_fieldname = 'CTCCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PreBase' iv_abap_fieldname = 'PREBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpPre' iv_abap_fieldname = 'TOPUPPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TotalPre' iv_abap_fieldname = 'TOTALPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpShare' iv_abap_fieldname = 'EMPSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmployerShare' iv_abap_fieldname = 'EMPLOYERSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Messages' iv_abap_fieldname = 'MESSAGES' ).
    lo_property->set_type_edm_string( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompCode' iv_abap_fieldname = 'COMPCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OuText' iv_abap_fieldname = 'OUTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'DesignTxt' iv_abap_fieldname = 'DESIGNTXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocTxt' iv_abap_fieldname = 'LOCTXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 15 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeInYrs' iv_abap_fieldname = 'AGEINYRS' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'NoEmpIdSap' iv_abap_fieldname = 'NOEMPIDSAP' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'NoEmpIdCtc' iv_abap_fieldname = 'NOEMPIDCTC' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FirstName' iv_abap_fieldname = 'FIRSTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LastName' iv_abap_fieldname = 'LASTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_QUOTE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'QuoteSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type BlockedEmployee / set BlockedEmployeeSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'BlockedEmployee' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name' iv_abap_fieldname = 'NAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_BLOCKEDEMPLOYEE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'BlockedEmployeeSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_true ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- entity type PolicyReport / set PolicyReportSet
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'PolicyReport' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ReqNo' iv_abap_fieldname = 'REQNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SlNo' iv_abap_fieldname = 'SLNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompText' iv_abap_fieldname = 'COMPTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocText' iv_abap_fieldname = 'LOCTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 15 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OuText' iv_abap_fieldname = 'OUTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'DesignText' iv_abap_fieldname = 'DESIGNTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 25 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CtcAbove5L' iv_abap_fieldname = 'CTCABOVE5L' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CorpEmail' iv_abap_fieldname = 'CORPEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PersonalEmail' iv_abap_fieldname = 'PERSONALEMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Contact' iv_abap_fieldname = 'CONTACT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FamilyNo' iv_abap_fieldname = 'FAMILYNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name' iv_abap_fieldname = 'NAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dob' iv_abap_fieldname = 'DOB' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AgeInYrs' iv_abap_fieldname = 'AGEINYRS' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Relation' iv_abap_fieldname = 'RELATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumBase' iv_abap_fieldname = 'SUMBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PreBase' iv_abap_fieldname = 'PREBASE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpYesNo' iv_abap_fieldname = 'TOPUPYESNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpPolicy' iv_abap_fieldname = 'TOPUPPOLICY' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TopUpPre' iv_abap_fieldname = 'TOPUPPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TotalPre' iv_abap_fieldname = 'TOTALPRE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PreAmt' iv_abap_fieldname = 'PREAMT' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpShare' iv_abap_fieldname = 'EMPSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmployerShare' iv_abap_fieldname = 'EMPLOYERSHARE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CrtDate' iv_abap_fieldname = 'CRTDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'NewInd' iv_abap_fieldname = 'NEWIND' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_MEDI_BL=>TS_POLICYREPORT' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PolicyReportSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    " ---- maintenance entities MaintRow / MaintCmd (zcl_ins_maint)
    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'MaintRow' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Table' iv_abap_fieldname = 'TAB' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Key1' iv_abap_fieldname = 'KEY1' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Key2' iv_abap_fieldname = 'KEY2' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Key3' iv_abap_fieldname = 'KEY3' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Val1' iv_abap_fieldname = 'VAL1' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Val2' iv_abap_fieldname = 'VAL2' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Val3' iv_abap_fieldname = 'VAL3' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Val4' iv_abap_fieldname = 'VAL4' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Val5' iv_abap_fieldname = 'VAL5' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 60 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_INS_MAINT=>TS_ROW' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'MaintRowSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'MaintCmd' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Table' iv_abap_fieldname = 'TAB' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ToYear' iv_abap_fieldname = 'TOYEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Action' iv_abap_fieldname = 'ACTION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Ok' iv_abap_fieldname = 'OK' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Message' iv_abap_fieldname = 'MESSAGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 255 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Count' iv_abap_fieldname = 'COUNT' ).
    lo_property->set_type_edm_int32( ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_INS_MAINT=>TS_CMD' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'MaintCmdSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

  ENDMETHOD.

  METHOD define_associations.
    DATA: lo_association TYPE REF TO /iwbep/if_mgw_odata_assoc,
          lo_ref_constraint TYPE REF TO /iwbep/if_mgw_odata_ref_constr,
          lo_assoc_set TYPE REF TO /iwbep/if_mgw_odata_assoc_set,
          lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_nav TYPE REF TO /iwbep/if_mgw_odata_nav_prop.

    lo_association = model->create_association( iv_association_name = 'Employee_PrevMembers' iv_left_type = 'Employee' iv_right_type = 'Member' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'Employee_PrevMembers_AssocSet' iv_left_entity_set_name = 'EmployeeSet' iv_right_entity_set_name = 'PolicyMemberSet' iv_association_name = 'Employee_PrevMembers' ).
    lo_entity_type = model->get_entity_type( 'Employee' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'PrevMembers' iv_association_name = 'Employee_PrevMembers' iv_abap_fieldname = 'PREVMEMBERS' ).

    lo_association = model->create_association( iv_association_name = 'Policy_Members' iv_left_type = 'Policy' iv_right_type = 'Member' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_ref_constraint = lo_association->create_ref_constraint( ).
    lo_ref_constraint->add_property( iv_principal_property = 'ReqNo' iv_dependent_property = 'ReqNo' ).
    lo_ref_constraint->add_property( iv_principal_property = 'Email' iv_dependent_property = 'Email' ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'Policy_Members_AssocSet' iv_left_entity_set_name = 'PolicySet' iv_right_entity_set_name = 'PolicyMemberSet' iv_association_name = 'Policy_Members' ).
    lo_entity_type = model->get_entity_type( 'Policy' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Members' iv_association_name = 'Policy_Members' iv_abap_fieldname = 'MEMBERS' ).

    lo_association = model->create_association( iv_association_name = 'Quote_Members' iv_left_type = 'Quote' iv_right_type = 'Member' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'Quote_Members_AssocSet' iv_left_entity_set_name = 'QuoteSet' iv_right_entity_set_name = 'PolicyMemberSet' iv_association_name = 'Quote_Members' ).
    lo_entity_type = model->get_entity_type( 'Quote' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Members' iv_association_name = 'Quote_Members' iv_abap_fieldname = 'MEMBERS' ).

    lo_association = model->create_association( iv_association_name = 'MaintCmd_Rows' iv_left_type = 'MaintCmd' iv_right_type = 'MaintRow' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_ref_constraint = lo_association->create_ref_constraint( ).
    lo_ref_constraint->add_property( iv_principal_property = 'Email' iv_dependent_property = 'Email' ).
    lo_ref_constraint->add_property( iv_principal_property = 'Table' iv_dependent_property = 'Table' ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'MaintCmd_Rows_AssocSet' iv_left_entity_set_name = 'MaintCmdSet' iv_right_entity_set_name = 'MaintRowSet' iv_association_name = 'MaintCmd_Rows' ).
    lo_entity_type = model->get_entity_type( 'MaintCmd' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Rows' iv_association_name = 'MaintCmd_Rows' iv_abap_fieldname = 'ROWS' ).
  ENDMETHOD.

  METHOD define_actions.
    DATA: lo_action TYPE REF TO /iwbep/if_mgw_odata_action,
          lo_parameter TYPE REF TO /iwbep/if_mgw_odata_parameter.

    lo_action = model->create_action( 'RemoveBlockedEmployee' ).
    lo_action->set_return_entity_type( 'BlockedEmployee' ).
    lo_action->set_return_entity_set( 'BlockedEmployeeSet' ).
    lo_action->set_return_multiplicity( '1' ).
    lo_action->set_http_method( 'POST' ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 8 ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 241 ).

    lo_action = model->create_action( 'DeletePolicy' ).
    lo_action->set_return_entity_type( 'Policy' ).
    lo_action->set_return_entity_set( 'PolicySet' ).
    lo_action->set_return_multiplicity( '1' ).
    lo_action->set_http_method( 'POST' ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'ReqNo' iv_abap_fieldname = 'REQNO' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 10 ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 241 ).

    lo_action = model->create_action( 'SetCutOff' ).
    lo_action->set_return_entity_type( 'Context' ).
    lo_action->set_return_entity_set( 'ContextSet' ).
    lo_action->set_return_multiplicity( '1' ).
    lo_action->set_http_method( 'POST' ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'CutOffDate' iv_abap_fieldname = 'CUTOFFDATE' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_datetime( ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'InsurerMail' iv_abap_fieldname = 'INSURERMAIL' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 241 ).
    lo_parameter = lo_action->create_input_parameter( iv_parameter_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_parameter->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_parameter->set_maxlength( iv_max_length = 241 ).
  ENDMETHOD.
ENDCLASS.
