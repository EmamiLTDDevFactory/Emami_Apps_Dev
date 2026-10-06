CLASS zcl_src_agent_run DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    " Reaches ZCL_SRC_AGENT_TASKS without an ICF node (no SICF): the agent writes each request into this class's
    " local test class and runs it through ADT's ABAP Unit runner; the answer comes back as test messages,
    " base64 in numbered chunks. Same guard (role, STVARV) as the HTTP handler.
    CLASS-METHODS run IMPORTING iv_json TYPE string iv_size TYPE i DEFAULT 100 RETURNING VALUE(rt_chunks) TYPE string_table.
ENDCLASS.

CLASS zcl_src_agent_run IMPLEMENTATION.
  METHOD run.
    DATA(lv_out) = cl_http_utility=>encode_base64( zcl_src_agent_tasks=>handle( iv_json ) ).
    COMMIT WORK.
    DATA(lv_len) = strlen( lv_out ).
    DATA(lv_off) = 0.
    WHILE lv_off < lv_len.
      DATA(lv_n) = nmin( val1 = iv_size val2 = lv_len - lv_off ).
      APPEND substring( val = lv_out off = lv_off len = lv_n ) TO rt_chunks.
      lv_off = lv_off + lv_n.
    ENDWHILE.
  ENDMETHOD.
ENDCLASS.
