"! Model provider of OData service ZLIFE_INS_SRV (code based, no SEGW project). Entity structures live in ZCL_LIFE_INS_TY. Generated from gen/spec.py.
CLASS zcl_zlife_ins_mpc DEFINITION PUBLIC INHERITING FROM /iwbep/cl_mgw_abs_model CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS gc_schema_namespace TYPE string VALUE 'ZLIFE_INS_SRV'.
    METHODS define REDEFINITION.
    METHODS get_last_modified REDEFINITION.
  PROTECTED SECTION.
    METHODS define_entities RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_associations RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_actions RAISING /iwbep/cx_mgw_med_exception.
ENDCLASS.

CLASS zcl_zlife_ins_mpc IMPLEMENTATION.
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

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Profile' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'User' iv_abap_fieldname = 'USER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 12 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Role' iv_abap_fieldname = 'ROLE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ActiveYear' iv_abap_fieldname = 'ACTIVEYEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_PROFILE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'ProfileSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

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
    lo_property = lo_entity_type->create_property( iv_property_name = 'FirstName' iv_abap_fieldname = 'FIRSTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LastName' iv_abap_fieldname = 'LASTNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Dob' iv_abap_fieldname = 'DOB' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Age' iv_abap_fieldname = 'AGE' ).
    lo_property->set_type_edm_int32( ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gender' iv_abap_fieldname = 'GENDER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompanyCode' iv_abap_fieldname = 'COMPANYCODE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompanyName' iv_abap_fieldname = 'COMPANYNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Department' iv_abap_fieldname = 'DEPARTMENT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OrgUnit' iv_abap_fieldname = 'ORGUNIT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Designation' iv_abap_fieldname = 'DESIGNATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Location' iv_abap_fieldname = 'LOCATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocationText' iv_abap_fieldname = 'LOCATIONTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompanyMail' iv_abap_fieldname = 'COMPANYMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LimitText' iv_abap_fieldname = 'LIMITTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_EMPLOYEE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'EmployeeSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'SumOption' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Slno' iv_abap_fieldname = 'SLNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumText' iv_abap_fieldname = 'SUMTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumAmount' iv_abap_fieldname = 'SUMAMOUNT' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Premium' iv_abap_fieldname = 'PREMIUM' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gst' iv_abap_fieldname = 'GST' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Total' iv_abap_fieldname = 'TOTAL' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_SUMOPTION' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'SumOptionSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Policy' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Reqno' iv_abap_fieldname = 'REQNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Year' iv_abap_fieldname = 'YEAR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmployeeName' iv_abap_fieldname = 'EMPLOYEENAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Designation' iv_abap_fieldname = 'DESIGNATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'OrgUnit' iv_abap_fieldname = 'ORGUNIT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'LocationText' iv_abap_fieldname = 'LOCATIONTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CompanyMail' iv_abap_fieldname = 'COMPANYMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PersonalMail' iv_abap_fieldname = 'PERSONALMAIL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Contact' iv_abap_fieldname = 'CONTACT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 30 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SumText' iv_abap_fieldname = 'SUMTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Premium' iv_abap_fieldname = 'PREMIUM' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gst' iv_abap_fieldname = 'GST' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Total' iv_abap_fieldname = 'TOTAL' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CreatedBy' iv_abap_fieldname = 'CREATEDBY' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 12 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ReqDate' iv_abap_fieldname = 'REQDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'AllRows' iv_abap_fieldname = 'ALLROWS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_POLICY' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PolicySet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Nominee' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Reqno' iv_abap_fieldname = 'REQNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'SlNo' iv_abap_fieldname = 'SLNO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name' iv_abap_fieldname = 'NAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 80 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Relation' iv_abap_fieldname = 'RELATION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PerShare' iv_abap_fieldname = 'PERSHARE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_NOMINEE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'NomineeSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'LimitUpload' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Count' iv_abap_fieldname = 'COUNT' ).
    lo_property->set_type_edm_int32( ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_LIMITUPLOAD' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'LimitUploadSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'LimitRow' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EmpId' iv_abap_fieldname = 'EMPID' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 8 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Limit' iv_abap_fieldname = 'LIMIT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_LIMITROW' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'LimitRowSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Command' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Email' iv_abap_fieldname = 'EMAIL' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 241 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Action' iv_abap_fieldname = 'ACTION' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Reqnos' iv_abap_fieldname = 'REQNOS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1000 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Ok' iv_abap_fieldname = 'OK' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Message' iv_abap_fieldname = 'MESSAGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 255 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_LIFE_INS_TY=>TS_COMMAND' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'CommandSet' ).
    lo_entity_set->set_creatable( abap_true ).
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

    lo_association = model->create_association( iv_association_name = 'Policy_Nominees' iv_left_type = 'Policy' iv_right_type = 'Nominee' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_ref_constraint = lo_association->create_ref_constraint( ).
    lo_ref_constraint->add_property( iv_principal_property = 'Reqno' iv_dependent_property = 'Reqno' ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'Policy_Nominees_AssocSet' iv_left_entity_set_name = 'PolicySet' iv_right_entity_set_name = 'NomineeSet' iv_association_name = 'Policy_Nominees' ).
    lo_entity_type = model->get_entity_type( 'Policy' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Nominees' iv_association_name = 'Policy_Nominees' iv_abap_fieldname = 'NOMINEES' ).

    lo_association = model->create_association( iv_association_name = 'LimitUpload_Rows' iv_left_type = 'LimitUpload' iv_right_type = 'LimitRow' iv_left_card = '1' iv_right_card = 'M' iv_def_assoc_set = abap_false ).
    lo_ref_constraint = lo_association->create_ref_constraint( ).
    lo_ref_constraint->add_property( iv_principal_property = 'Email' iv_dependent_property = 'Email' ).
    lo_assoc_set = model->create_association_set( iv_association_set_name = 'LimitUpload_Rows_AssocSet' iv_left_entity_set_name = 'LimitUploadSet' iv_right_entity_set_name = 'LimitRowSet' iv_association_name = 'LimitUpload_Rows' ).
    lo_entity_type = model->get_entity_type( 'LimitUpload' ).
    lo_nav = lo_entity_type->create_navigation_property( iv_property_name = 'Rows' iv_association_name = 'LimitUpload_Rows' iv_abap_fieldname = 'ROWS' ).


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

  ENDMETHOD.
ENDCLASS.
