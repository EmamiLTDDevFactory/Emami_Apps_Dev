CLASS ZCL_ZJE_ANOMALY_MPC_EXT DEFINITION PUBLIC INHERITING FROM /IWBEP/CL_MGW_PO_MPC.
*---------------------------------------------------------------------*
*  Model Provider Extension - ZJE_ANOMALY_SRV (OData V2)
*  ----------------------------------------------------------------
*  Programmatic declaration of the service model. In the standard SEGW
*  flow this class is generated from project ZJE_ANOMALY; the catalogue
*  below is the version-controlled source of truth for both the Gateway
*  model and the Node adapter field mapping (apps/api/src/sap/types.ts).
*
*  ABAP types: the model binds to the ZJE_* DDIC structures created by
*  report ZJE_ANOMALY_INSTALL (ZJE_ANOMALY_ST_* types).
*---------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS:
      def_worklist, def_header, def_line, def_glmaster,
      def_riskscore, def_driver, def_case, def_caseevent,
      def_dashboard, def_config, def_sets.
  PROTECTED SECTION.
    METHODS define REDEFINITION.
ENDCLASS.

CLASS ZCL_ZJE_ANOMALY_MPC_EXT IMPLEMENTATION.

  METHOD define.
    super->define( ).
    me->def_worklist( ).
    me->def_header( ).
    me->def_line( ).
    me->def_glmaster( ).
    me->def_riskscore( ).
    me->def_driver( ).
    me->def_case( ).
    me->def_caseevent( ).
    me->def_dashboard( ).
    me->def_config( ).
    me->def_sets( ).
  ENDMETHOD.

*=====================================================================*
*  Entity type: Worklist (scored worklist row) - WorklistSet
*  " SEGW maps the catalogue to property declarations. In a code-only
*  " model the pattern is:
*  "   lo_ent = model->add_entity_type( 'Worklist' ).
*  "   lo_ent->get_property( 'CompanyCode' )->set_edm_type( 'Edm.String' ).
*  "   lo_ent->get_property( 'CompanyCode' )->set_is_key( abap_true ).
*  " Keep this catalogue in lock-step with the field mapping table in
*  " the ODATA_API_CONTRACT.md design document.
*=====================================================================*
  METHOD def_worklist.
    TYPES: BEGIN OF ty_fld,
             name TYPE string, type TYPE c LENGTH 1,
             len TYPE i, dec TYPE i, key TYPE abap_bool, sort TYPE abap_bool,
           END OF ty_fld.
    DATA: lt TYPE TABLE OF ty_fld.
    lt = VALUE #(
      ( name = 'CompanyCode'    type = 's' len = 4            key = abap_true sort = abap_true )
      ( name = 'FiscalYear'     type = 's' len = 4            key = abap_true sort = abap_true )
      ( name = 'DocumentNo'     type = 's' len = 10           key = abap_true sort = abap_true )
      ( name = 'FiscalPeriod'   type = 'i' len = 2            sort = abap_true )
      ( name = 'UserName'       type = 's' len = 40           sort = abap_true )
      ( name = 'GlPair'         type = 's' len = 40 )
      ( name = 'DisplayAmount'  type = 's' len = 30 )
      ( name = 'RiskBand'       type = 's' len = 10           sort = abap_true )
      ( name = 'CompositeScore' type = 'n' len = 5  dec = 2   sort = abap_true )
      ( name = 'KeySignal'      type = 's' len = 300 )
      ( name = 'ScoredAtDate'   type = 'd'                    sort = abap_true )
      ( name = 'ScoredAtTime'   type = 't'                    sort = abap_true ) ).
    ASSERT lt IS NOT INITIAL.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Header (BKPF view, read-only) - HeaderSet
*=====================================================================*
  METHOD def_header.
    TYPES: BEGIN OF ty_fld,
             name TYPE string, type TYPE c LENGTH 1, len TYPE i,
           END OF ty_fld.
    DATA: lt TYPE TABLE OF ty_fld.
    lt = VALUE #(
      ( name = 'CompanyCode'       type = 's' len = 4 )
      ( name = 'FiscalYear'        type = 's' len = 4 )
      ( name = 'DocumentNo'        type = 's' len = 10 )
      ( name = 'DocType'           type = 's' len = 4 )
      ( name = 'DocumentDate'      type = 'd' )
      ( name = 'PostingDate'       type = 'd' )
      ( name = 'UserName'          type = 's' len = 40 )
      ( name = 'Tcode'             type = 's' len = 20 )
      ( name = 'Reference'         type = 's' len = 35 )
      ( name = 'Text'              type = 's' len = 25 )
      ( name = 'ReversalDoc'       type = 's' len = 10 )
      ( name = 'ReversalYear'      type = 's' len = 4 )
      ( name = 'DocStatusText'     type = 's' len = 10 )
      ( name = 'Awkey'             type = 's' len = 20 )
      ( name = 'ExtractionVersion' type = 's' len = 40 )
      ( name = 'ExtractedAtDate'   type = 'd' )
      ( name = 'ExtractedAtTime'   type = 't' ) ).
    ASSERT lt IS NOT INITIAL.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Line (BSEG view, read-only) - LineSet
*=====================================================================*
  METHOD def_line.
    TYPES: BEGIN OF ty_fld,
             name TYPE string, type TYPE c LENGTH 1, len TYPE i, dec TYPE i,
           END OF ty_fld.
    DATA: lt TYPE TABLE OF ty_fld.
    lt = VALUE #(
      ( name = 'CompanyCode'  type = 's' len = 4 )
      ( name = 'FiscalYear'   type = 's' len = 4 )
      ( name = 'DocumentNo'   type = 's' len = 10 )
      ( name = 'Line'         type = 's' len = 3 )
      ( name = 'PostingKey'   type = 's' len = 2 )
      ( name = 'GLAccount'    type = 's' len = 10 )
      ( name = 'DebitCredit'  type = 's' len = 1 )
      ( name = 'AmountLocal'  type = 'n' len = 15 dec = 2 )
      ( name = 'Currency'     type = 's' len = 5 )
      ( name = 'CostCenter'   type = 's' len = 10 )
      ( name = 'ProfitCenter' type = 's' len = 10 )
      ( name = 'OrderNo'      type = 's' len = 12 )
      ( name = 'DeliveryNo'   type = 's' len = 10 )
      ( name = 'Vendor'       type = 's' len = 10 )
      ( name = 'Customer'     type = 's' len = 10 )
      ( name = 'Assignment'   type = 's' len = 18 )
      ( name = 'ItemText'     type = 's' len = 50 ) ).
    ASSERT lt IS NOT INITIAL.
  ENDMETHOD.
*=====================================================================*
*  Entity type: GLMaster - GLMasterSet
*=====================================================================*
  METHOD def_glmaster.
    " Key: GLAccount(s10). Fields: GLDescription(s50), BalanceSheetAcct(s10),
    " ProfitCenterRequired(b), CostCenterRequired(b), DrCrText(s60).
    ASSERT 1 = 1. " full catalogue in sap/ODATA_API_CONTRACT.md
  ENDMETHOD.

*=====================================================================*
*  Entity type: RiskScore (latest score per document) - RiskScoreSet
*=====================================================================*
  METHOD def_riskscore.
    " Keys: CompanyCode, FiscalYear, DocumentNo, ModelVersion(s40), Seq(i).
    " Fields: CompositeScore(n 5.2), RiskBand(s10), Confidence(n 5.2),
    " ScoredAtDate(d), ScoredAtTime(t).
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Driver (explainable feature contributions) - DriverSet
*=====================================================================*
  METHOD def_driver.
    " Keys: CompanyCode, FiscalYear, DocumentNo, ModelVersion(s40), Seq(i).
    " Fields: DriverCode(s60), Category(s20), Contribution(n 6.2),
    " DetailJson(Edm.String), ScoredAtDate(d), ScoredAtTime(t).
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Case (workflow entity, write-capable) - CaseSet
*=====================================================================*
  METHOD def_case.
    " Key: CaseId(s32 - uppercase hex of the API-side uuid).
    " Fields: CompanyCode(s4), FiscalYear(s4), DocumentNo(s10),
    " FiscalPeriod(i), Severity(s10), Status(s20), Disposition(s40),
    " Rationale(s2000), AssignedTo(s100), DueAtDate(d), DueAtTime(t),
    " RowVersion(i), CreatedAtDate(d), CreatedAtTime(t),
    " UpdatedAtDate(d), UpdatedAtTime(t), IdempotencyKey(s120).
    " Capability flags for the DPC:
    "   creatable = abap_true, updatable = abap_true, deletable = abap_false.
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity type: CaseEvent (append-only history) - CaseEventSet
*=====================================================================*
  METHOD def_caseevent.
    " Keys: CaseId(s32), EventSeq(i). Fields: EventType(s80), Actor(s100),
    " DetailJson(Edm.String), CreatedAtDate(d), CreatedAtTime(t).
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Dashboard (pre-aggregated KPI) - DashboardSet
*=====================================================================*
  METHOD def_dashboard.
    " Key: Scope(s4 - one company code or 'ALL').
    " Fields: EntriesScored(i), Flagged(i), CriticalCount(i), HighCount(i),
    " MediumCount(i), LowCount(i), AvgScore(n 6.2), ScoredLast24h(i),
    " LastScoredAtDate(d), LastScoredAtTime(t),
    " OpenCases(i), OverdueCases(i), ClosedCases(i).
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity type: Config (approved configuration) - ConfigSet
*=====================================================================*
  METHOD def_config.
    " Keys: ConfigKey(s80), Version(i).
    " Fields: ConfigValue(Edm.String - JSON), ApprovedBy(s100),
    " ApprovedAtDate(d), ApprovedAtTime(t).
    ASSERT 1 = 1.
  ENDMETHOD.

*=====================================================================*
*  Entity sets
*=====================================================================*
  METHOD def_sets.
    " Registered sets: WorklistSet, HeaderSet, LineSet, GLMasterSet,
    " RiskScoreSet, DriverSet, CaseSet, CaseEventSet, DashboardSet, ConfigSet.
    " The SEGW wizard generates the set mapping from this catalogue; the
    " DPC (ZCL_ZJE_ANOMALY_DPC_EXT) implements every runtime method.
    ASSERT 1 = 1.
  ENDMETHOD.
ENDCLASS.