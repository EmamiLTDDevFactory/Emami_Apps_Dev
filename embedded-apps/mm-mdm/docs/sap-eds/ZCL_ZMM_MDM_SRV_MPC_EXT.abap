"! Model provider extension. The model comes from the import in SEGW; this class adds what was built afterwards:
"! change (MX) and extension (ME) of an existing material: the search of posted materials, the scope of one material,
"! and the actions that start a change or an extension request.
CLASS zcl_zmm_mdm_srv_mpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zmm_mdm_srv_mpc CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES:
      BEGIN OF ts_postedmaterial,
        matnr TYPE c LENGTH 18,
        maktx TYPE c LENGTH 40,
        mtart TYPE c LENGTH 4,
        matkl TYPE c LENGTH 9,
        meins TYPE c LENGTH 3,
        busy  TYPE c LENGTH 1,
      END OF ts_postedmaterial,
      tt_postedmaterial TYPE STANDARD TABLE OF ts_postedmaterial WITH EMPTY KEY,
      BEGIN OF ts_changescope,
        matnr     TYPE c LENGTH 18,
        kind      TYPE c LENGTH 1,
        werks     TYPE c LENGTH 4,
        lgort     TYPE c LENGTH 4,
        vkorg     TYPE c LENGTH 4,
        vtweg     TYPE c LENGTH 2,
        werkstxt  TYPE c LENGTH 30,
        lgorttxt  TYPE c LENGTH 16,
        vkorgtxt  TYPE c LENGTH 20,
        vtwegtxt  TYPE c LENGTH 20,
      END OF ts_changescope,
      tt_changescope TYPE STANDARD TABLE OF ts_changescope WITH EMPTY KEY,
      BEGIN OF ts_attachment,
        transid    TYPE c LENGTH 10,
        attachid   TYPE c LENGTH 10,
        filename   TYPE c LENGTH 255,
        mimetype   TYPE c LENGTH 30,
        doctype    TYPE c LENGTH 50,
        size       TYPE c LENGTH 12,
        uploadedby TYPE c LENGTH 12,
        uploadedat TYPE c LENGTH 19,
        lvl        TYPE c LENGTH 10,
      END OF ts_attachment,
      tt_attachment TYPE STANDARD TABLE OF ts_attachment WITH EMPTY KEY,
      BEGIN OF ts_attachmentfile,
        transid  TYPE c LENGTH 10,
        attachid TYPE c LENGTH 10,
        filename TYPE c LENGTH 255,
        mimetype TYPE c LENGTH 100,
        doctype  TYPE c LENGTH 50,
        content  TYPE string,
      END OF ts_attachmentfile,
      tt_attachmentfile TYPE STANDARD TABLE OF ts_attachmentfile WITH EMPTY KEY,
      BEGIN OF ts_admincall,
        area    TYPE c LENGTH 20,
        op      TYPE c LENGTH 40,
        actor   TYPE c LENGTH 241,
        payload TYPE string,
        result  TYPE string,
      END OF ts_admincall,
      tt_admincall TYPE STANDARD TABLE OF ts_admincall WITH EMPTY KEY,
      BEGIN OF ts_comment,
        transid   TYPE c LENGTH 10,
        commentid TYPE c LENGTH 10,
        text      TYPE c LENGTH 1000,
        userid    TYPE c LENGTH 12,
        createdat TYPE c LENGTH 19,
        lvl       TYPE c LENGTH 10,
      END OF ts_comment,
      tt_comment TYPE STANDARD TABLE OF ts_comment WITH EMPTY KEY,
      BEGIN OF ts_startchange,
        matnr               TYPE c LENGTH 18,
        plant               TYPE c LENGTH 4,
        storagelocation     TYPE c LENGTH 4,
        salesorg            TYPE c LENGTH 4,
        distributionchannel TYPE c LENGTH 2,
      END OF ts_startchange,
      BEGIN OF ts_startextension,
        matnr                     TYPE c LENGTH 18,
        exttype                   TYPE c LENGTH 1,
        plant                     TYPE c LENGTH 4,
        storagelocation           TYPE c LENGTH 4,
        salesorg                  TYPE c LENGTH 4,
        distributionchannel       TYPE c LENGTH 2,
        valuationtype             TYPE c LENGTH 10,
        sourceplant               TYPE c LENGTH 4,
        sourcesalesorg            TYPE c LENGTH 4,
        sourcedistributionchannel TYPE c LENGTH 2,
      END OF ts_startextension.

    METHODS define REDEFINITION.

  PRIVATE SECTION.
    METHODS prop
      IMPORTING io_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ
                iv_name TYPE string iv_len TYPE i
                iv_key  TYPE abap_bool DEFAULT abap_false.
    METHODS param
      IMPORTING io_action TYPE REF TO /iwbep/if_mgw_odata_action iv_name TYPE string iv_len TYPE i.
ENDCLASS.



CLASS ZCL_ZMM_MDM_SRV_MPC_EXT IMPLEMENTATION.


  METHOD define.
    super->define( ).

    DATA(lo_t) = model->create_entity_type( iv_entity_type_name = 'PostedMaterial' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_POSTEDMATERIAL' ).
    DATA(lo_s) = lo_t->create_entity_set( 'PostedMaterialSet' ).
    lo_s->set_creatable( abap_false ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_true ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'Matnr' iv_len = 18 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Maktx' iv_len = 40 ).
    prop( io_type = lo_t iv_name = 'Mtart' iv_len = 4 ).
    prop( io_type = lo_t iv_name = 'Matkl' iv_len = 9 ).
    prop( io_type = lo_t iv_name = 'Meins' iv_len = 3 ).
    prop( io_type = lo_t iv_name = 'Busy' iv_len = 1 ).

    lo_t = model->create_entity_type( iv_entity_type_name = 'ChangeScope' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_CHANGESCOPE' ).
    lo_s = lo_t->create_entity_set( 'ChangeScopeSet' ).
    lo_s->set_creatable( abap_false ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_true ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'Matnr' iv_len = 18 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Kind' iv_len = 1 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Werks' iv_len = 4 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Lgort' iv_len = 4 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Vkorg' iv_len = 4 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Vtweg' iv_len = 2 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'WerksTxt' iv_len = 30 ).
    prop( io_type = lo_t iv_name = 'LgortTxt' iv_len = 16 ).
    prop( io_type = lo_t iv_name = 'VkorgTxt' iv_len = 20 ).
    prop( io_type = lo_t iv_name = 'VtwegTxt' iv_len = 20 ).

    lo_t = model->create_entity_type( iv_entity_type_name = 'Attachment' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_ATTACHMENT' ).
    lo_t->set_is_media( ).
    lo_s = lo_t->create_entity_set( 'AttachmentSet' ).
    lo_s->set_creatable( abap_true ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_true ).
    lo_s->set_pageable( abap_true ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'TransId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'AttachId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'FileName' iv_len = 255 ).
    prop( io_type = lo_t iv_name = 'MimeType' iv_len = 30 ).
    lo_t->get_property( 'MimeType' )->set_as_content_type( ).
    prop( io_type = lo_t iv_name = 'DocType' iv_len = 50 ).
    prop( io_type = lo_t iv_name = 'Size' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'UploadedBy' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'UploadedAt' iv_len = 19 ).
    prop( io_type = lo_t iv_name = 'Lvl' iv_len = 10 ).

    lo_t = model->create_entity_type( iv_entity_type_name = 'Comment' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_COMMENT' ).
    lo_s = lo_t->create_entity_set( 'CommentSet' ).
    lo_s->set_creatable( abap_true ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_true ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'TransId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'CommentId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Text' iv_len = 1000 ).
    prop( io_type = lo_t iv_name = 'UserId' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'CreatedAt' iv_len = 19 ).
    prop( io_type = lo_t iv_name = 'Lvl' iv_len = 10 ).

    DATA(lo_a) = model->create_action( 'StartChange' ).
    lo_a->set_return_complex_type( 'StartResult' ).
    lo_a->set_http_method( 'POST' ).
    lo_a->set_return_multiplicity( '1' ).
    param( io_action = lo_a iv_name = 'Matnr' iv_len = 18 ).
    param( io_action = lo_a iv_name = 'Plant' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'StorageLocation' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'SalesOrg' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'DistributionChannel' iv_len = 2 ).
    lo_a->bind_input_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_STARTCHANGE' ).

    lo_a = model->create_action( 'StartExtension' ).
    lo_a->set_return_complex_type( 'StartResult' ).
    lo_a->set_http_method( 'POST' ).
    lo_a->set_return_multiplicity( '1' ).
    param( io_action = lo_a iv_name = 'Matnr' iv_len = 18 ).
    param( io_action = lo_a iv_name = 'ExtType' iv_len = 1 ).
    param( io_action = lo_a iv_name = 'Plant' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'StorageLocation' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'SalesOrg' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'DistributionChannel' iv_len = 2 ).
    param( io_action = lo_a iv_name = 'ValuationType' iv_len = 10 ).
    param( io_action = lo_a iv_name = 'SourcePlant' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'SourceSalesOrg' iv_len = 4 ).
    param( io_action = lo_a iv_name = 'SourceDistributionChannel' iv_len = 2 ).
    lo_a->bind_input_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_STARTEXTENSION' ).

    "Removing an attachment: the Gateway in front passes no DELETE, so it is a function import.
    lo_a = model->create_action( 'DeleteAttachment' ).
    lo_a->set_return_complex_type( 'ServiceMessage' ).
    lo_a->set_http_method( 'POST' ).
    lo_a->set_return_multiplicity( 'M' ).
    param( io_action = lo_a iv_name = 'TransId' iv_len = 10 ).
    param( io_action = lo_a iv_name = 'AttachId' iv_len = 10 ).

    "File content as base64 text in an ordinary entity (create = upload, filtered read = download): the proxy in front of the Gateway
    "passes JSON entities but drops raw request bodies, the Slug header and $value.
    lo_t = model->create_entity_type( iv_entity_type_name = 'AttachmentFile' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_ATTACHMENTFILE' ).
    lo_s = lo_t->create_entity_set( 'AttachmentFileSet' ).
    lo_s->set_creatable( abap_true ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_false ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'TransId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'AttachId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'FileName' iv_len = 255 ).
    prop( io_type = lo_t iv_name = 'MimeType' iv_len = 100 ).
    prop( io_type = lo_t iv_name = 'DocType' iv_len = 50 ).
    DATA(lo_pc) = lo_t->create_property( iv_property_name = 'Content' iv_abap_fieldname = 'CONTENT' ).
    lo_pc->set_type_edm_string( ).
    lo_pc->set_creatable( abap_true ).  lo_pc->set_updatable( abap_false ).  lo_pc->set_nullable( abap_true ).
    lo_pc->set_filterable( abap_false ).  lo_pc->set_sortable( abap_false ).

    "Generic call of the admin screens (rules, workflow maintenance, worklist, dashboard): JSON in Payload, JSON out in Result (create = call).
    lo_t = model->create_entity_type( iv_entity_type_name = 'AdminCall' iv_def_entity_set = abap_false ).
    lo_t->bind_structure( iv_structure_name = 'ZCL_ZMM_MDM_SRV_MPC_EXT=>TS_ADMINCALL' ).
    lo_s = lo_t->create_entity_set( 'AdminCallSet' ).
    lo_s->set_creatable( abap_true ).  lo_s->set_updatable( abap_false ).  lo_s->set_deletable( abap_false ).
    lo_s->set_pageable( abap_false ).  lo_s->set_addressable( abap_true ).  lo_s->set_has_ftxt_search( abap_false ).
    lo_s->set_subscribable( abap_false ).  lo_s->set_filter_required( abap_false ).
    prop( io_type = lo_t iv_name = 'Area' iv_len = 20 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Op' iv_len = 40 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Actor' iv_len = 241 ).
    DATA(lo_pp) = lo_t->create_property( iv_property_name = 'Payload' iv_abap_fieldname = 'PAYLOAD' ).
    lo_pp->set_type_edm_string( ).  lo_pp->set_creatable( abap_true ).  lo_pp->set_updatable( abap_false ).  lo_pp->set_nullable( abap_true ).
    lo_pp->set_filterable( abap_false ).  lo_pp->set_sortable( abap_false ).
    DATA(lo_pr) = lo_t->create_property( iv_property_name = 'Result' iv_abap_fieldname = 'RESULT' ).
    lo_pr->set_type_edm_string( ).  lo_pr->set_creatable( abap_true ).  lo_pr->set_updatable( abap_false ).  lo_pr->set_nullable( abap_true ).
    lo_pr->set_filterable( abap_false ).  lo_pr->set_sortable( abap_false ).

    "Upload path RequestSet(TransId,AppId)/Attachments: the request number travels in the path, which the proxy in front of the
    "Gateway keeps (it drops the Slug header and the query string of a POST).
    DATA(lo_assoc) = model->create_association( iv_association_name = 'Request_Attachment' iv_left_type = 'Request'
                                                iv_right_type = 'Attachment' iv_right_card = 'M' iv_left_card = '1'
                                                iv_def_assoc_set = abap_false ).
    model->create_association_set( iv_association_set_name = 'Request_Attachment_AS' iv_left_entity_set_name = 'RequestSet'
                                   iv_right_entity_set_name = 'AttachmentSet' iv_association_name = 'Request_Attachment' ).
    DATA(lo_req) = model->get_entity_type( iv_entity_name = 'Request' ).
    lo_req->create_navigation_property( iv_property_name = 'Attachments' iv_abap_fieldname = 'ATTACHMENTS'
                                        iv_association_name = 'Request_Attachment' ).
  ENDMETHOD.


  METHOD prop.
    DATA(lo_p) = io_type->create_property( iv_property_name = CONV #( iv_name ) iv_abap_fieldname = CONV #( to_upper( iv_name ) ) ).
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


  METHOD param.
    DATA(lo_p) = io_action->create_input_parameter( iv_parameter_name = CONV #( iv_name ) iv_abap_fieldname = CONV #( to_upper( iv_name ) ) ).
    lo_p->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
  ENDMETHOD.
ENDCLASS.
