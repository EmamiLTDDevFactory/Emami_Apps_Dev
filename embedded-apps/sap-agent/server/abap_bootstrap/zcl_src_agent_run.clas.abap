CLASS zcl_src_agent_run DEFINITION PUBLIC FINAL CREATE PUBLIC FOR TESTING DURATION LONG RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    " Rewritten by the SAP agent for every handler call (no SICF node needed): the test method calls
    " ZCL_SRC_AGENT_TASKS=>HANDLE and returns its answer base64 in numbered test messages.
    METHODS go FOR TESTING.
ENDCLASS.

CLASS zcl_src_agent_run IMPLEMENTATION.
  METHOD go.
    DATA(lv_json) = `{"task": "ping", "args": {}}`.
    DATA(lv_out) = cl_http_utility=>encode_base64( zcl_src_agent_tasks=>handle( lv_json ) ).
    COMMIT WORK.
    DATA(lv_len) = strlen( lv_out ).
    DATA(lv_count) = ( lv_len + 99 ) DIV 100.
    DATA(lv_off) = 0.
    DATA(lv_no) = 0.
    WHILE lv_off < lv_len.
      DATA(lv_n) = nmin( val1 = 100 val2 = lv_len - lv_off ).
      lv_no = lv_no + 1.
      DATA(lv_msg) = |ZSRC boot { lv_no } { lv_count } { substring( val = lv_out off = lv_off len = lv_n ) }|.
      cl_abap_unit_assert=>fail( msg = lv_msg quit = if_aunit_constants=>no ).
      lv_off = lv_off + lv_n.
    ENDWHILE.
  ENDMETHOD.
ENDCLASS.
