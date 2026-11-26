CLASS zcl_mm_mat_docs DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "! Read-only: the SPECIFICATION (title SPEC_...) and ARTWORK (title ARTWORK_...) PDFs attached (GOS, BUS1001006) to RM / PM / FG materials (ROH, VERP, PKGN, FERT).
    "! Rows (ZMATDOC_S_ROW): L = latest document per material and type (VERSIONS = how many), V = every version, newest first,
    "! C = one base64 chunk (CHUNK of CHUNKS) of a document's content. A document is only read for a material it is attached to.
    TYPES tt_row TYPE STANDARD TABLE OF zmatdoc_s_row WITH DEFAULT KEY.
    TYPES ty_r_matnr TYPE RANGE OF matnr.
    CONSTANTS c_chunk TYPE i VALUE 600000.
    METHODS constructor IMPORTING it_matnr TYPE ty_r_matnr
                                  iv_type  TYPE csequence OPTIONAL.
    METHODS latest   RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS versions RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS chunk    IMPORTING iv_doc_id TYPE csequence iv_chunk TYPE i RETURNING VALUE(rt_rows) TYPE tt_row.

  PRIVATE SECTION.
    DATA: mr_matnr TYPE ty_r_matnr,
          mv_type  TYPE c LENGTH 4,
          mv_id    TYPE i.
    METHODS docs    RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS next_id RETURNING VALUE(rv) TYPE char12.
ENDCLASS.


CLASS zcl_mm_mat_docs IMPLEMENTATION.

  METHOD constructor.
    mr_matnr = it_matnr.
    DELETE mr_matnr WHERE NOT ( sign = 'I' AND option = 'EQ' ).
    LOOP AT mr_matnr ASSIGNING FIELD-SYMBOL(<m>).
      <m>-low = |{ <m>-low ALPHA = IN }|.
    ENDLOOP.
    mv_type = to_upper( iv_type ).
  ENDMETHOD.

  METHOD next_id.
    mv_id = mv_id + 1.
    rv = |{ mv_id WIDTH = 12 ALIGN = RIGHT PAD = '0' }|.
  ENDMETHOD.

  METHOD docs.
    TYPES: BEGIN OF ty_k, instid TYPE sibfboriid, END OF ty_k.
    TYPES: BEGIN OF ty_o, objtp TYPE so_obj_tp, objyr TYPE so_obj_yr, objno TYPE so_obj_no, END OF ty_o.
    DATA: lt_k TYPE STANDARD TABLE OF ty_k WITH DEFAULT KEY,
          lt_o TYPE SORTED TABLE OF ty_o WITH UNIQUE KEY objtp objyr objno,
          ls_r TYPE zmatdoc_s_row.
    IF mr_matnr IS INITIAL. RETURN. ENDIF.
    " ---- 1. the materials: RM (ROH), PM (VERP, PKGN), FG (FERT) only
    SELECT m~matnr, m~mtart, t~maktx FROM mara AS m LEFT OUTER JOIN makt AS t ON t~matnr = m~matnr AND t~spras = @sy-langu
      WHERE m~matnr IN @mr_matnr AND m~mtart IN ('ROH','VERP','PKGN','FERT') INTO TABLE @DATA(lt_m).
    IF lt_m IS INITIAL. RETURN. ENDIF.
    SORT lt_m BY matnr.
    lt_k = VALUE #( FOR m IN lt_m ( instid = m-matnr ) ).
    " ---- 2. their GOS attachments
    SELECT instid_a, instid_b, utctime FROM srgbtbrel FOR ALL ENTRIES IN @lt_k
      WHERE instid_a = @lt_k-instid AND typeid_a = 'BUS1001006' AND catid_a = 'BO' AND reltype = 'ATTA'
      INTO TABLE @DATA(lt_rel).
    IF lt_rel IS INITIAL. RETURN. ENDIF.
    LOOP AT lt_rel INTO DATA(ls_rel).
      INSERT VALUE ty_o( objtp = ls_rel-instid_b+17(3) objyr = ls_rel-instid_b+20(2) objno = ls_rel-instid_b+22(12) ) INTO TABLE lt_o.
    ENDLOOP.
    SELECT objtp, objyr, objno, objdes, file_ext, objlen, crdat, cronam FROM sood FOR ALL ENTRIES IN @lt_o
      WHERE objtp = @lt_o-objtp AND objyr = @lt_o-objyr AND objno = @lt_o-objno INTO TABLE @DATA(lt_sood).
    SORT lt_sood BY objtp objyr objno.
    " ---- 3. keep the SPEC_ / ARTWORK_ PDFs
    LOOP AT lt_rel INTO ls_rel.
      READ TABLE lt_sood INTO DATA(ls_s) WITH KEY objtp = ls_rel-instid_b+17(3) objyr = ls_rel-instid_b+20(2) objno = ls_rel-instid_b+22(12) BINARY SEARCH.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      DATA(lv_t) = to_upper( condense( CONV string( ls_s-objdes ) ) ).
      DATA(lv_type) = COND char4( WHEN lv_t CP 'SPEC_*' THEN 'SPEC' WHEN lv_t CP 'ARTWORK_*' THEN 'ART' ).
      IF lv_type IS INITIAL OR to_upper( condense( CONV string( ls_s-file_ext ) ) ) <> 'PDF'. CONTINUE. ENDIF.
      IF mv_type IS NOT INITIAL AND mv_type <> lv_type. CONTINUE. ENDIF.
      READ TABLE lt_m INTO DATA(ls_m) WITH KEY matnr = ls_rel-instid_a(18) BINARY SEARCH.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      CLEAR ls_r.
      ls_r-matnr = ls_m-matnr. ls_r-maktx = ls_m-maktx. ls_r-mtart = ls_m-mtart. ls_r-doc_type = lv_type.
      ls_r-doc_id = ls_rel-instid_b. ls_r-title = ls_s-objdes. ls_r-file_ext = ls_s-file_ext. ls_r-doc_size = ls_s-objlen.
      ls_r-crdat = ls_s-crdat. ls_r-created_by = ls_s-cronam. ls_r-att_ts = |{ ls_rel-utctime }|.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
    SORT rt_rows BY matnr doc_type att_ts DESCENDING doc_id DESCENDING.
  ENDMETHOD.

  METHOD latest.
    DATA(lt) = docs( ).
    LOOP AT lt INTO DATA(ls) GROUP BY ( m = ls-matnr t = ls-doc_type ) ASSIGNING FIELD-SYMBOL(<g>).
      DATA(lv_n) = 0.
      DATA(ls_first) = VALUE zmatdoc_s_row( ).
      LOOP AT GROUP <g> INTO DATA(lx).
        lv_n = lv_n + 1.
        IF lv_n = 1. ls_first = lx. ENDIF.
      ENDLOOP.
      ls_first-mode = 'L'. ls_first-rowid = next_id( ). ls_first-versions = lv_n.
      APPEND ls_first TO rt_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD versions.
    rt_rows = docs( ).
    LOOP AT rt_rows ASSIGNING FIELD-SYMBOL(<r>).
      <r>-mode = 'V'. <r>-rowid = next_id( ).
    ENDLOOP.
  ENDMETHOD.

  METHOD chunk.
    DATA: ls_doc TYPE sofolenti1,
          lt_hex TYPE STANDARD TABLE OF solix,
          ls_r   TYPE zmatdoc_s_row.
    " the document must be a SPEC_ / ARTWORK_ PDF of one of the given materials
    DATA(lt_docs) = docs( ).
    READ TABLE lt_docs INTO ls_r WITH KEY doc_id = iv_doc_id.
    IF sy-subrc <> 0.
      APPEND VALUE #( mode = 'C' rowid = next_id( ) doc_id = iv_doc_id msg = 'This document is not a specification or artwork of the given material' ) TO rt_rows.
      RETURN.
    ENDIF.
    ls_r-mode = 'C'. ls_r-rowid = next_id( ). ls_r-chunk = iv_chunk.
    CALL FUNCTION 'SO_DOCUMENT_READ_API1'
      EXPORTING document_id = CONV so_entryid( iv_doc_id )
      IMPORTING document_data = ls_doc
      TABLES contents_hex = lt_hex
      EXCEPTIONS OTHERS = 9.
    IF sy-subrc <> 0.
      ls_r-msg = |The document could not be read (SO_DOCUMENT_READ_API1 { sy-subrc })|.
      APPEND ls_r TO rt_rows.
      RETURN.
    ENDIF.
    DATA(lv_x) = cl_bcs_convert=>solix_to_xstring( it_solix = lt_hex iv_size = CONV i( ls_doc-doc_size ) ).
    DATA(lv_len) = xstrlen( lv_x ).
    ls_r-doc_size = lv_len.
    ls_r-chunks = COND #( WHEN lv_len = 0 THEN 0 ELSE ( lv_len + c_chunk - 1 ) DIV c_chunk ).
    IF iv_chunk >= 0 AND iv_chunk < ls_r-chunks.
      DATA(lv_off) = iv_chunk * c_chunk.
      DATA(lv_part) = COND i( WHEN lv_len - lv_off < c_chunk THEN lv_len - lv_off ELSE c_chunk ).
      DATA lv_piece TYPE xstring.
      lv_piece = lv_x+lv_off(lv_part).
      ls_r-content = cl_http_utility=>encode_x_base64( lv_piece ).
    ELSE.
      ls_r-msg = |Chunk { iv_chunk } is out of range (0 to { ls_r-chunks - 1 })|.
    ENDIF.
    APPEND ls_r TO rt_rows.
  ENDMETHOD.

ENDCLASS.
