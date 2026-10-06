CLASS zcl_src_agent_http DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    " ICF handler for the SAP agent. POST {"task": "...", "args": {...}} to /sap/zsrc_agent/tasks, answer {"ok": true, "result": ...}.
    " SICF: create node /sap/zsrc_agent/tasks, handler list = ZCL_SRC_AGENT_HTTP, logon = standard (user and password or SSO).
    INTERFACES if_http_extension.
ENDCLASS.

CLASS zcl_src_agent_http IMPLEMENTATION.
  METHOD if_http_extension~handle_request.
    server->response->set_header_field( name = 'Content-Type' value = 'application/json; charset=utf-8' ).
    IF server->request->get_method( ) <> 'POST'.
      server->response->set_cdata( '{"ok":true,"result":{"service":"zsrc_agent"}}' ).
      RETURN.
    ENDIF.
    server->response->set_cdata( zcl_src_agent_tasks=>handle( server->request->get_cdata( ) ) ).
  ENDMETHOD.
ENDCLASS.
