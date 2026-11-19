"! Attachments and comments of a material request, on the same storage the Web Dynpro components use:
"!  - draft attachments: /INOWITS/P_DMS_A, object id '<app>/<transid>/' (the old component built it as app / transid / key)
"!  - final posting: DMS documents (/INOWITS/P_CL_DMS=>CREATE) linked to the material (/INOWITS/ATTACHMENT, object type BUS1001006)
"!  - comments: SAP text of /INOWITS/P_CL_COMMENTS_OBJ, object id 'MMC' + request number without leading zeros
CLASS zcl_mm_mdm_attach DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES:
      BEGIN OF ty_att,
        attach_id  TYPE c LENGTH 10,
        file_name  TYPE c LENGTH 255,
        mime_type  TYPE c LENGTH 30,
        doc_type   TYPE c LENGTH 50,
        size       TYPE i,
        created_by TYPE c LENGTH 12,
        created_on TYPE d,
      END OF ty_att,
      tt_att TYPE STANDARD TABLE OF ty_att WITH EMPTY KEY,
      BEGIN OF ty_comment,
        comment_id TYPE c LENGTH 10,
        text       TYPE string,
      END OF ty_comment,
      tt_comment TYPE STANDARD TABLE OF ty_comment WITH EMPTY KEY.

    CLASS-METHODS list
      IMPORTING iv_transid    TYPE clike
                iv_app_id     TYPE clike DEFAULT 'MC'
      RETURNING VALUE(rt_att) TYPE tt_att.

    CLASS-METHODS add
      IMPORTING iv_transid        TYPE clike
                iv_app_id         TYPE clike DEFAULT 'MC'
                iv_file_name      TYPE clike
                iv_mime_type      TYPE clike
                iv_doc_type       TYPE clike OPTIONAL
                iv_content        TYPE xstring
                iv_user           TYPE syuname
      RETURNING VALUE(rv_attach_id) TYPE string
      RAISING   zcx_mm_mdm.

    CLASS-METHODS get
      IMPORTING iv_transid        TYPE clike
                iv_app_id         TYPE clike DEFAULT 'MC'
                iv_attach_id      TYPE clike
      EXPORTING ev_content        TYPE xstring
                ev_mime_type      TYPE string
                ev_file_name      TYPE string
      RAISING   zcx_mm_mdm.

    CLASS-METHODS delete
      IMPORTING iv_transid   TYPE clike
                iv_app_id    TYPE clike DEFAULT 'MC'
                iv_attach_id TYPE clike
                iv_user      TYPE syuname
      RAISING   zcx_mm_mdm.

    "! Document types the request must carry (/INOWITS/P_DOC_T, MANDATORY = X for the material type)
    CLASS-METHODS check_mandatory
      IMPORTING iv_transid     TYPE clike
                iv_app_id      TYPE clike DEFAULT 'MC'
      RETURNING VALUE(rt_msg)  TYPE zif_mm_mdm_types=>tt_msg.

    "! Last approval: create the DMS documents and link them to the posted material
    CLASS-METHODS final_attach
      IMPORTING iv_transid TYPE clike
                iv_app_id  TYPE clike DEFAULT 'MC'
                iv_matnr   TYPE matnr
                iv_user    TYPE syuname
      RAISING   zcx_mm_mdm.

    CLASS-METHODS list_comments
      IMPORTING iv_transid        TYPE clike
      RETURNING VALUE(rt_comment) TYPE tt_comment.

    CLASS-METHODS add_comment
      IMPORTING iv_transid TYPE clike
                iv_text    TYPE string
      RAISING   zcx_mm_mdm.

  PRIVATE SECTION.
    CLASS-METHODS object_id
      IMPORTING iv_transid          TYPE clike
                iv_app_id           TYPE clike
      RETURNING VALUE(rv_object_id) TYPE /inowits/p_dms_a-object_id.
    CLASS-METHODS comment_key
      IMPORTING iv_transid     TYPE clike
      RETURNING VALUE(rv_key)  TYPE tdobname.
ENDCLASS.



CLASS ZCL_MM_MDM_ATTACH IMPLEMENTATION.


  METHOD object_id.
    DATA(lv_t) = |{ CONV string( iv_transid ) ALPHA = IN }|.
    rv_object_id = |{ CONV string( iv_app_id ) }/{ lv_t }/|.
  ENDMETHOD.


  METHOD comment_key.
    rv_key = |MMC{ |{ CONV string( iv_transid ) ALPHA = OUT }| }|.
    CONDENSE rv_key NO-GAPS.
  ENDMETHOD.


  METHOD list.
    SELECT serial_no, file_name, mime_type, doc_type, xstring, created_by, created_on
      FROM /inowits/p_dms_a
      WHERE object_id = @( object_id( iv_transid = iv_transid iv_app_id = iv_app_id ) )
      ORDER BY serial_no
      INTO TABLE @DATA(lt_rows).
    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      APPEND VALUE #( attach_id = <r>-serial_no file_name = <r>-file_name mime_type = <r>-mime_type doc_type = <r>-doc_type
                      size = xstrlen( <r>-xstring ) created_by = <r>-created_by created_on = <r>-created_on ) TO rt_att.
    ENDLOOP.
  ENDMETHOD.


  METHOD add.
    DATA(lv_obj) = object_id( iv_transid = iv_transid iv_app_id = iv_app_id ).
    IF iv_content IS INITIAL.
      zcx_mm_mdm=>raise_text( 'The file is empty' ).
    ENDIF.
    SELECT MAX( serial_no ) FROM /inowits/p_dms_a WHERE object_id = @lv_obj INTO @DATA(lv_max).
    DATA(lv_next) = CONV i( lv_max ) + 1.
    DATA(ls_row) = VALUE /inowits/p_dms_a(
      object_id = lv_obj serial_no = |{ lv_next WIDTH = 10 ALIGN = RIGHT PAD = `0` }|
      created_on = sy-datum created_by = iv_user user_type = iv_user
      doc_type = iv_doc_type file_name = iv_file_name mime_type = iv_mime_type xstring = iv_content ).
    MODIFY /inowits/p_dms_a FROM ls_row.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( 'The attachment could not be saved' ).
    ENDIF.
    rv_attach_id = ls_row-serial_no.
  ENDMETHOD.


  METHOD get.
    SELECT SINGLE file_name, mime_type, xstring FROM /inowits/p_dms_a
      WHERE object_id = @( object_id( iv_transid = iv_transid iv_app_id = iv_app_id ) )
        AND serial_no = @( |{ CONV string( iv_attach_id ) ALPHA = IN }| )
      INTO @DATA(ls).
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( 'Attachment not found' ).
    ENDIF.
    ev_content = ls-xstring.  ev_mime_type = ls-mime_type.  ev_file_name = ls-file_name.
  ENDMETHOD.


  METHOD delete.
    DATA(lv_obj) = object_id( iv_transid = iv_transid iv_app_id = iv_app_id ).
    DATA(lv_ser) = CONV /inowits/p_dms_a-serial_no( |{ CONV string( iv_attach_id ) ALPHA = IN }| ).
    SELECT SINGLE created_by FROM /inowits/p_dms_a WHERE object_id = @lv_obj AND serial_no = @lv_ser INTO @DATA(lv_by).
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( 'Attachment not found' ).
    ENDIF.
    IF lv_by <> iv_user.
      zcx_mm_mdm=>raise_text( 'Only the person who added the attachment can delete it' ).
    ENDIF.
    DELETE FROM /inowits/p_dms_a WHERE object_id = @lv_obj AND serial_no = @lv_ser.
  ENDMETHOD.


  METHOD check_mandatory.
    "document types flagged mandatory for the material type (and its generic fields) of the request
    SELECT SINGLE mtart FROM /inowits/mm_mara WHERE transid = @( |{ CONV string( iv_transid ) ALPHA = IN }| ) INTO @DATA(lv_mtart).
    SELECT doc_type, gen_field1, gen_field2 FROM /inowits/p_doc_t
      WHERE app_name = 'MC' AND mandatory = 'X' AND ( gen_type = @lv_mtart OR gen_type = '*' )
      INTO TABLE @DATA(lt_doc).
    CHECK lt_doc IS NOT INITIAL.
    DATA(lt_have) = list( iv_transid = iv_transid iv_app_id = iv_app_id ).
    LOOP AT lt_doc ASSIGNING FIELD-SYMBOL(<d>).
      IF NOT line_exists( lt_have[ doc_type = <d>-doc_type ] ).
        APPEND VALUE #( code = 'E_DOC' severity = 'E' target = 'Attachment'
                        message = |Please attach the document of type { <d>-doc_type }| ) TO rt_msg.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD final_attach.
    DATA(lt_rows) = list( iv_transid = iv_transid iv_app_id = iv_app_id ).
    CHECK lt_rows IS NOT INITIAL.
    DATA(lv_tid) = CONV string( |{ CONV string( iv_transid ) ALPHA = OUT }| ).
    DATA(lv_app) = SWITCH string( to_upper( CONV string( iv_app_id ) ) WHEN 'MC' THEN `MMC` WHEN 'MX' THEN `MMX` WHEN 'ME' THEN `MME` ELSE `MMC` ).
    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      get( EXPORTING iv_transid = iv_transid iv_app_id = iv_app_id iv_attach_id = <r>-attach_id
           IMPORTING ev_content = DATA(lv_x) ev_mime_type = DATA(lv_mime) ev_file_name = DATA(lv_fn) ).
      DATA(lv_dt) = CONV /inowits/p_doctype( COND #( WHEN <r>-doc_type IS NOT INITIAL THEN <r>-doc_type ELSE 'DRW' ) ).
      SELECT SINGLE doc_desc FROM /inowits/p_doc_t WHERE app_name = 'MC' AND doc_type = @<r>-doc_type INTO @DATA(lv_desc).
      IF sy-subrc = 0 AND lv_desc IS NOT INITIAL.
        lv_dt = lv_desc.
      ELSEIF <r>-doc_type IS INITIAL.
        lv_dt = 'DRW'.
      ENDIF.
      DATA ls_ret TYPE bapiret2.
      CLEAR ls_ret.
      /inowits/p_cl_dms=>create(
        EXPORTING iv_object_id = CONV #( |{ lv_app }/{ lv_tid }/| )
                  iv_doc_type  = lv_dt
                  iv_user_type = CONV #( iv_user )
                  iv_serial_no = CONV #( <r>-attach_id )
                  iv_content   = lv_x
                  iv_mime_type = CONV #( lv_mime )
                  iv_file_name = CONV #( lv_fn )
                  iv_app_name  = lv_app
        IMPORTING es_return    = ls_ret ).
      IF ls_ret-type CA 'EA'.
        zcx_mm_mdm=>raise_text( |Attachment { lv_fn } could not be stored in DMS: { ls_ret-message }| ).
      ENDIF.
    ENDLOOP.
    DATA lt_return TYPE bapirettab.
    DATA lv_key    TYPE string.
    DATA lv_objid  TYPE string.
    DATA lv_objkey TYPE swo_typeid.
    DATA lv_objtyp TYPE swo_objtyp.
    lv_objid = lv_tid.  lv_objkey = |{ iv_matnr ALPHA = IN }|.  lv_objtyp = 'BUS1001006'.
    CALL FUNCTION '/INOWITS/ATTACHMENT'
      EXPORTING iv_app_name = lv_app iv_key = lv_key iv_object_id = lv_objid iv_objkey = lv_objkey iv_objtype = lv_objtyp
      TABLES et_return = lt_return.
    IF line_exists( lt_return[ type = 'E' ] ).
      zcx_mm_mdm=>raise_text( |The attachments could not be linked to the material: { lt_return[ type = 'E' ]-message }| ).
    ENDIF.
  ENDMETHOD.


  METHOD list_comments.
    DATA lt_lines TYPE /inowits/p_tline.
    NEW /inowits/p_cl_comments_obj( )->read( EXPORTING iv_object_id = comment_key( iv_transid ) IMPORTING et_lines = lt_lines ).
    DATA(lv_i) = 0.
    LOOP AT lt_lines ASSIGNING FIELD-SYMBOL(<l>).
      CHECK <l>-tdline IS NOT INITIAL.
      lv_i = lv_i + 1.
      APPEND VALUE #( comment_id = |{ lv_i WIDTH = 10 ALIGN = RIGHT PAD = `0` }| text = <l>-tdline ) TO rt_comment.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_comment.
    DATA lv_status TYPE /inowits/p_status.
    IF iv_text IS INITIAL.
      zcx_mm_mdm=>raise_text( 'The comment is empty' ).
    ENDIF.
    NEW /inowits/p_cl_comments_obj( )->create( EXPORTING iv_object_id = CONV #( comment_key( iv_transid ) ) iv_comments = iv_text
                                               IMPORTING ev_status = lv_status ).
  ENDMETHOD.
ENDCLASS.
