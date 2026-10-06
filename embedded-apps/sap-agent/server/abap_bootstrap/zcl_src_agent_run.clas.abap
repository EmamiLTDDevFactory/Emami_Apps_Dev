CLASS zcl_src_agent_run DEFINITION PUBLIC FINAL CREATE PUBLIC FOR TESTING DURATION LONG RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    " The SAP agent's runner (no SICF node): the agent saves each request, base64, into the inactive source of
    " program ZSRC_AGENT_REQ and runs this test; the answer of ZCL_SRC_AGENT_TASKS=>HANDLE comes back base64
    " in numbered test messages tagged with the request id. Do not change; ZSRC_AGENT_REQ is never activated.
    METHODS go FOR TESTING.
ENDCLASS.

CLASS zcl_src_agent_run IMPLEMENTATION.
  METHOD go.
    DATA lt_src TYPE string_table.
    DATA(lv_prog) = CONV syrepid( 'ZSRC_AGENT_REQ' ).
    READ REPORT lv_prog INTO lt_src STATE 'I'.
    IF sy-subrc <> 0.
      READ REPORT lv_prog INTO lt_src.
    ENDIF.
    DATA(lv_id) = `none`.
    DATA(lv_req) = ``.
    LOOP AT lt_src INTO DATA(lv_line).
      IF strlen( lv_line ) > 3 AND substring( val = lv_line len = 3 ) = '*I:'.
        lv_id = condense( substring( val = lv_line off = 3 ) ).
      ELSEIF strlen( lv_line ) > 3 AND substring( val = lv_line len = 3 ) = '*J:'.
        lv_req = lv_req && condense( substring( val = lv_line off = 3 ) ).
      ENDIF.
    ENDLOOP.
    DATA(lv_out) = cl_http_utility=>encode_base64( zcl_src_agent_tasks=>handle( cl_http_utility=>decode_base64( lv_req ) ) ).
    COMMIT WORK.
    DATA(lv_len) = strlen( lv_out ).
    DATA(lv_count) = ( lv_len + 99 ) DIV 100.
    DATA(lv_off) = 0.
    DATA(lv_no) = 0.
    WHILE lv_off < lv_len.
      DATA(lv_n) = nmin( val1 = 100 val2 = lv_len - lv_off ).
      lv_no = lv_no + 1.
      DATA(lv_msg) = |ZSRC { lv_id } { lv_no } { lv_count } { substring( val = lv_out off = lv_off len = lv_n ) }|.
      cl_abap_unit_assert=>fail( msg = lv_msg quit = if_aunit_constants=>no ).
      lv_off = lv_off + lv_n.
    ENDWHILE.
  ENDMETHOD.
ENDCLASS.
