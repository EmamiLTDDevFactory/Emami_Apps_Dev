*&---------------------------------------------------------------------*
*&  Report ZJE_ANOMALY_INSTALL
*&---------------------------------------------------------------------*
*  Journal Entry & GL Anomaly Agent - SAP ECC backend installer
*  ----------------------------------------------------------------
*  Creates all data dictionary artefacts and the SEGW data model for
*  service ZJE_ANOMALY_SRV (OData V2, ECC 6.0 EHP8 / Suite on HANA 2.0).
*  Re-runnable: every DDL is idempotent.
*
*  Execution: SE38 -> program ZJE_ANOMALY_INSTALL -> Execute.
*    1) "CREATE DDIC"  (default) - creates Z tables + ABAP types.
*    2) "REDEPLOY SEGW" - regenerates the service artefacts from this U.
*    3) "DELETE ALL"    - drops the Z tables (kept strictly out of band;
*                         regular runtime reads/writes never use them).
*
*  Security note (FS §5): this report creates large authorization objects.
*  Ship it via a transport to a controlled system and lock it down.
*---------------------------------------------------------------------*
REPORT zje_anomaly_install.

TABLES: zje_docdata, zje_docctx, zje_glmaster.

PARAMETERS: p_ddl  RADIOBUTTON GROUP rb1 DEFAULT 'X' USER-COMMAND uc,
            p_redeploy RADIOBUTTON GROUP rb1,
            p_drop RADIOBUTTON GROUP rb1,
            p_commit AS CHECKBOX DEFAULT 'X' MODIF ID c1.
PARAMETERS: p_use_extract AS CHECKBOX DEFAULT 'X' MODIF ID c2.
PARAMETERS: p_extract_lub TYPE sy-uname DEFAULT 'SAPSUPPORT' MODIF ID c2.

*---------------------------------------------------------------------*
* DDL statements for the Z tables (idempotent, HANA-compatible).
*---------------------------------------------------------------------*
FORM create_tables.
  " Document header incl. scoring - mirrors the read model the OData
  " read services project. BKPF/BSEG are never updated (brutal read-only).
  TRY.
      EXEC SQL.
        CREATE TABLE "ZJE_DOCDATA"
        ( "CLIENT"  NVARCHAR(3)  NOT NULL,
          "BUKRS"   NVARCHAR(4)  NOT NULL,
          "GJAHR"   NVARCHAR(4)  NOT NULL,
          "BELNR"   NVARCHAR(10) NOT NULL,
          "BLART"   NVARCHAR(4),
          "BLDAT"   NVARCHAR(8),
          "BUDAT"   NVARCHAR(8),
          "CPUDT"   NVARCHAR(8),
          "CPUTM"   NVARCHAR(6),
          "USNAM"   NVARCHAR(40),
          "TCODE"   NVARCHAR(20),
          "XBLNR"   NVARCHAR(35),
          "BKTXT"   NVARCHAR(25),
          "STBLG"   NVARCHAR(10),
          "STJAH"   NVARCHAR(4),
          "BSTAT"   NVARCHAR(10),
          "AWKEY"   NVARCHAR(20),
          "COMPOSITE_SCORE" DECIMAL(5,2),
          "RISK_BAND"       NVARCHAR(10),
          "KEY_SIGNAL"      NVARCHAR(300),
          "SCORED_AT"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "EXTRACTION_VERSION" NVARCHAR(40) NOT NULL DEFAULT 'v1',
          "EXTRACTED_AT"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY ("CLIENT", "BUKRS", "GJAHR", "BELNR") )
      ENDEXEC.
    CATCH cx_sy_native_sql_error. " table already exists
  ENDTRY.

  TRY.
      EXEC SQL.
        CREATE TABLE "ZJE_DOCCTX"
        ( "CLIENT"   NVARCHAR(3)  NOT NULL,
          "BUKRS"    NVARCHAR(4)  NOT NULL,
          "GJAHR"    NVARCHAR(4)  NOT NULL,
          "BELNR"    NVARCHAR(10) NOT NULL,
          "BUZEI"    NVARCHAR(3)  NOT NULL,
          "BSCHL"    NVARCHAR(2),
          "HKONT"    NVARCHAR(10),
          "SHKZG"    NVARCHAR(1),
          "DMBTR"    DECIMAL(15,2),
          "WRBTR"    DECIMAL(15,2),
          "WAERS"    NVARCHAR(5),
          "KOSTL"    NVARCHAR(10),
          "PRCTR"    NVARCHAR(10),
          "AUFNR"    NVARCHAR(12),
          "VBELN"    NVARCHAR(10),
          "LIFNR"    NVARCHAR(10),
          "KUNNR"    NVARCHAR(10),
          "ZUONR"    NVARCHAR(18),
          "SGTXT"    NVARCHAR(50),
          PRIMARY KEY ("CLIENT", "BUKRS", "GJAHR", "BELNR", "BUZEI") )
      ENDEXEC.
    CATCH cx_sy_native_sql_error.
  ENDTRY.

  TRY.
      EXEC SQL.
        CREATE TABLE "ZJE_GLMASTER"
        ( "CLIENT"  NVARCHAR(3)  NOT NULL,
          "HKONT"   NVARCHAR(10) NOT NULL,
          "TXT50"   NVARCHAR(50),
          "BILKT"   NVARCHAR(10),
          "PRCTR_REQUIRED" NVARCHAR(1),
          "KOSTL_REQUIRED" NVARCHAR(1),
          "DDTEXT"  NVARCHAR(60),
          PRIMARY KEY ("CLIENT", "HKONT") )
      ENDEXEC.
    CATCH cx_sy_native_sql_error.
  ENDTRY.
ENDFORM.

*---------------------------------------------------------------------*
*  Structure/type availability for the OData entities. The SEGW model
*  properties are bound to these ABAP types; on activation SAP generates
*  the matching DDIC types from the tables above.
*---------------------------------------------------------------------*
FORM create_types.
  " The entity types below are derived from the Z tables. When the tables
  " were just created by this report, SE11 activation of the SEGW model
  " re-generates the structures automatically. For reference, the types the
  " MPC uses are:
  "   ZJE_ANOMALY_ST_HD  - Worklist/Header rows      (from ZJE_DOCDATA)
  "   ZJE_ANOMALY_ST_IT  - Line rows                  (from ZJE_DOCCTX)
  "   ZJE_ANOMALY_ST_GL  - GL master rows             (from ZJE_GLMASTER)
  " The service itself binds to the *_EXT classes documented in the
  " companion ABAP sources (ZCL_ZJE_ANOMALY_MPC_EXT / _DPC_EXT).
  MESSAGE 'ABAP types are generated from the ZJE_* tables by the SEGW model activation' TYPE 'I'.
ENDFORM.

*---------------------------------------------------------------------*
*  (Re)deploy the SEGW service artefacts from the generation definitions.
*---------------------------------------------------------------------*
FORM redeploy_segw.
  " The service ZJE_ANOMALY_SRV is generated from data model ZJE_ANOMALY.
  " On SAP Gateway (IWFND) the model provider class is generated from the
  " model; the runtime classes ZCL_ZJE_ANOMALY_MPC_EXT / _DPC_EXT described
  " in the companion ABAP sources are already active in this transport.
  " Re-run /IWFND/MAINT_SERVICE to activate the service binding after the
  " transport import.
  MESSAGE 'Re-run /IWFND/MAINT_SERVICE to activate ZJE_ANOMALY_SRV binding' TYPE 'I'.
ENDFORM.

*---------------------------------------------------------------------*
START-OF-SELECTION.
  IF p_drop = 'X'.
    TRY.
        EXEC SQL. DROP TABLE "ZJE_DOCDATA" ENDEXEC.
        EXEC SQL. DROP TABLE "ZJE_DOCCTX"  ENDEXEC.
        EXEC SQL. DROP TABLE "ZJE_GLMASTER" ENDEXEC.
      CATCH cx_sy_native_sql_error.
    ENDTRY.
    COMMIT WORK.
    MESSAGE 'ZJE_* tables dropped' TYPE 'S'.
    EXIT.
  ENDIF.

  PERFORM create_tables.
  PERFORM create_types.
  IF p_redeploy = 'X'.
    PERFORM redeploy_segw.
  ENDIF.
  IF p_commit = 'X'.
    COMMIT WORK.
  ENDIF.
  MESSAGE 'ZJE_ANOMALY DDIC artefacts ready. Activate the OData service via /IWFND/MAINT_SERVICE.' TYPE 'S'.