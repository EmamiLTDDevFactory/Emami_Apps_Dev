FUNCTION z_sd_o2c_action
  IMPORTING
    VALUE(iv_action) TYPE char30
    VALUE(iv_payload) TYPE string OPTIONAL
    VALUE(iv_requestid) TYPE char40 OPTIONAL
  EXPORTING
    VALUE(ev_result) TYPE string.
  " Order to Cash (Emami Apps): RFC entry point, called over SOAP-RFC (/sap/bc/soap/rfc) by the Emami Apps backend
  " (backend/orderToCashSap.js). All logic is in ZCL_SD_O2C=>HANDLE; the answer is JSON.
  ev_result = zcl_sd_o2c=>handle( iv_action = iv_action iv_payload = iv_payload ).
ENDFUNCTION.
