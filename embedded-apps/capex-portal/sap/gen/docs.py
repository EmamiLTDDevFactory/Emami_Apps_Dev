import re
N='new/'
d=open(N+'zcl_zcapex_portal_dpc_ext.abap').read()

# ---- 1. split create_stream: parse slug | store_document
m=re.search(r'  METHOD /iwbep/if_mgw_appl_srv_runtime~create_stream\.\n(.*?)  ENDMETHOD\.\n',d,re.S)
body=m.group(1)
i=body.index('    IF doc_visible( iv_doctype = ls_doc-doctype')
j=body.index('    DATA(ls_out) = map_doc( ls_doc ).')
store=body[i:j]
head=body[:i]
new_stream='  METHOD /iwbep/if_mgw_appl_srv_runtime~create_stream.\n'+head+'''    ls_doc = store_document( is_doc     = ls_doc
                             iv_content = is_media_resource-value
                             iv_mime    = CONV #( is_media_resource-mime_type ) ).

'''+body[j:]+'  ENDMETHOD.\n'
d=d[:m.start()]+new_stream+d[m.end():]
store=store.replace('is_media_resource-value','iv_content').replace('is_media_resource-mime_type','iv_mime')
store_method='''

  METHOD store_document.
    " Shared by the Fiori upload (create_stream, raw body + Slug) and the Emami Apps upload (DocXferSet, base64 in JSON).
    " The rules are exactly the ones create_stream always had; only the way the bytes arrive differs.
    rs_doc = is_doc.
'''+store.replace('ls_doc','rs_doc')+'''  ENDMETHOD.
'''
store_method=store_method.replace('rs_doc = is_doc.\n    rs_doc','rs_doc = is_doc.\n    rs_doc',1)

# ---- 2. definition: private methods
d=d.replace('private section.\n','''private section.

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
''',1)

# ---- 3. create_entity: DocXferSet branch
old=re.search(r'  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity\.\n    capture_identity\( \)\.\n',d)
assert old
d=d[:old.end()]+'''    IF iv_entity_set_name = 'DocXferSet'.
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
'''+d[old.end():]

# ---- 4. get_entityset: DocXferSet branch (download = filtered read, base64 Content)
old=re.search(r"  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset\.\n    capture_identity\( \)\.\n",d)
assert old
d=d[:old.end()]+'''    IF iv_entity_set_name = 'DocXferSet'.
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
'''+d[old.end():]

# ---- 5. append store_document implementation before ENDCLASS
d=d.rstrip()
assert d.endswith('ENDCLASS.')
d=d[:-len('ENDCLASS.')].rstrip()+store_method+'\nENDCLASS.\n'
open(N+'zcl_zcapex_portal_dpc_ext.abap','w').write(d)

# ---- MPC_EXT
s=open('eds/mpc_ext.abap').read()
s=s.replace('''    METHODS get_last_modified
        REDEFINITION .''','''    " Document transfer for the Emami Apps (file as base64 text in a JSON entity; create = upload, filtered read = download).
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

    METHODS get_last_modified
        REDEFINITION .''',1)
s=s.replace('''  PRIVATE SECTION.
    METHODS define_budget_item''','''  PRIVATE SECTION.
    METHODS define_doc_xfer
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS xprop
      IMPORTING io_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ
                iv_name TYPE string iv_len TYPE i
                iv_key  TYPE abap_bool DEFAULT abap_false
      RAISING   /iwbep/cx_mgw_med_exception.
    METHODS define_budget_item''',1)
s=s.replace('''    lo_mime->set_as_content_type( ).
''','''    lo_mime->set_as_content_type( ).

    define_doc_xfer( ).
''',1)
s=s.replace('''  METHOD define_budget_item.''','''  METHOD define_doc_xfer.
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


  METHOD define_budget_item.''',1)
s=s.replace("VALUE '20261117115905'","VALUE '20261124130000'")
open(N+'zcl_zcapex_portal_mpc_ext.abap','w').write(s)
print('ok')
