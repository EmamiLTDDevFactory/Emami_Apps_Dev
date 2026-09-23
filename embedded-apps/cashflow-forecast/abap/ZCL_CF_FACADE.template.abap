CLASS zcl_cf_facade DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS get_forecast IMPORTING iv_bukrs TYPE bukrs iv_scenario TYPE char10 iv_from TYPE datum iv_weeks TYPE i EXPORTING et_forecast TYPE ztt_cf_forecast.
ENDCLASS.
CLASS zcl_cf_facade IMPLEMENTATION.
  METHOD get_forecast.
    "Repository retrieves authorized, bounded source records.
    "Forecast service applies due-date, probability, planning-level and scenario logic.
    "Risk and explainability services enrich output; no database commits here.
  ENDMETHOD.
ENDCLASS.
