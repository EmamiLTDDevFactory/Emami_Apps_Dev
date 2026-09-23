// ============================================================================
// CDS Views for Suite on HANA 2.0 (SoH 2.0) – CashFlow Intelligence
// Adapt release-specific annotations to your activation environment.
// Aggregation is pushed down to the HANA columnar engine.
// ============================================================================

@AbapCatalog.sqlViewName: 'ZCVCFOpenAR'
@AbapCatalog.compiler.compareCheck: true
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'CF – Open AR weighted by due week'
define view ZC_CF_OPEN_AR
  as select from bsid as I
  association [0..1] to kna1 as _Customer on $projection.Customer = _Customer.kunnr
{
  key I.bukrs                          as CompanyCode,
  key I.kunnr                          as Customer,
  _Customer.name1                      as CustomerName,
  -- due-week bucket computed in HANA (no ABAP loop)
  cast(( days_between( current_date, I.faedt ) / 7 ) as abap.int4) as DueWeekOffset,
  sum( I.dmbtr )                       as AmountLc,
  I.waers                              as Currency
}
group by I.bukrs, I.kunnr, _Customer.name1, I.waers,
         cast(( days_between( current_date, I.faedt ) / 7 ) as abap.int4)
// NOTE: collection probability is derived from payment terms / planning level
// (T052, FDFD) in ZCL_CF_REPOSITORY to keep this analytical view indexable.

@AbapCatalog.sqlViewName: 'ZCVCFWeekly'
@AbapCatalog.compiler.compareCheck: true
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'CF – Weekly cash aggregation consumed by ZCL_CF_FACADE'
define view ZC_CF_WEEKLY_CASH
  as select from ZC_CF_OPEN_AR as AR
{
  key AR.CompanyCode                                        as CompanyCode,
  key AR.DueWeekOffset                                      as WeekOffset,
  sum( AR.AmountLc )                                        as ExpectedInflow
}
group by AR.CompanyCode, AR.DueWeekOffset

@AbapCatalog.sqlViewName: 'ZCVCFOpenAP'
@AbapCatalog.compiler.compareCheck: true
@AccessControl.authorizationCheck: #CHECK
@EndUserText.label: 'CF – Open AP weighted by due week'
define view ZC_CF_OPEN_AP
  as select from bsik as I
{
  key I.bukrs                                                     as CompanyCode,
  key I.lifnr                                                     as Vendor,
  cast(( days_between( current_date, I.faedt ) / 7 ) as abap.int4) as DueWeekOffset,
  sum( I.dmbtr )                                                  as AmountLc,
  I.waers                                                         as Currency
}
group by I.bukrs, I.lifnr, I.waers,
         cast(( days_between( current_date, I.faedt ) / 7 ) as abap.int4)

