# OData V2 Contract
Service: `ZCASHFLOW_AI_SRV`

## Entity Sets
- `KPISet`: Key, Label, Value, Note, Tone, Currency, CompanyCode, AsOfDate
- `ForecastSet`: CompanyCode, Scenario, Week, StartDate, EndDate, OpeningCash, Inflows, Outflows, ClosingCash, LowerBound, UpperBound, Confidence
- `RiskSet`: RiskId, Category, Score, Severity, Alert, FinancialImpact, Mitigation, Owner, DueDate, Status
- `ExplainabilitySet`: ExplanationId, Week, FactorName, Impact, Direction, Rank, Source, Rationale
- `CashFlowLineSet`: DocumentKey, SourceType, CompanyCode, Partner, DueDate, Amount, Currency, Probability, PlanningLevel, PlanningGroup, Risk
- `ActionSet`: ActionId, ActionType, Title, Amount, Owner, Status, ApprovalRequired, CreatedBy, CreatedAt
- `InsightSet`: InsightId, Title, Detail, Priority, Impact, Confidence, Sources, ActionType, SuggestedAction
- `FilterValueSet`: Dimension, Key, Text

## Query examples
`ForecastSet?$filter=CompanyCode eq '1000' and Scenario eq 'BASE'&$orderby=StartDate&$format=json`

`CashFlowLineSet?$filter=DueDate ge datetime'2026-09-01T00:00:00'&$top=100&$skip=0&$inlinecount=allpages`

## Mutation
POST to `ActionSet` only creates a governed recommendation/work item. It must not execute F110, clearing, payment, borrowing or posting directly. Use an approval workflow and a separate controlled execution service.
