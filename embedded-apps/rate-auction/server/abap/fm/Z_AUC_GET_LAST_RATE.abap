*&---------------------------------------------------------------------*
*& Function module Z_AUC_GET_LAST_RATE
*& Attributes: Remote-Enabled Module
*& Import:  IV_MATNR TYPE CHAR40
*& Export:  EV_NETPR TYPE ZAUC_RATE     (price per 1 order price unit)
*&          EV_WAERS TYPE WAERS
*&          EV_FOUND TYPE ZAUC_FLAG
*& Rule: lowest positive net price on active info records of the material.
*& Agree this with Procurement. Alternative: price of the latest purchase order (EKKO/EKPO).
*& The platform uses this value as the suggested threshold.
*&---------------------------------------------------------------------*
  TYPES: BEGIN OF ty_p,
           netpr TYPE eine-netpr,
           peinh TYPE eine-peinh,
           waers TYPE eine-waers,
         END OF ty_p.
  DATA: lt_p     TYPE STANDARD TABLE OF ty_p,
        ls_p     TYPE ty_p,
        lv_matnr TYPE mara-matnr,
        lv_unit  TYPE zauc_rate.

  CLEAR: ev_netpr, ev_waers, ev_found.
  CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
    EXPORTING input  = iv_matnr
    IMPORTING output = lv_matnr.

  SELECT e~netpr e~peinh e~waers
    INTO TABLE lt_p
    FROM eina AS a INNER JOIN eine AS e ON e~infnr = a~infnr
    WHERE a~matnr = lv_matnr
      AND a~loekz = space
      AND e~loekz = space.

  LOOP AT lt_p INTO ls_p WHERE netpr > 0 AND peinh > 0.
    lv_unit = ls_p-netpr / ls_p-peinh.
    IF ev_found IS INITIAL OR lv_unit < ev_netpr.
      ev_netpr = lv_unit.
      ev_waers = ls_p-waers.
      ev_found = 'X'.
    ENDIF.
  ENDLOOP.
