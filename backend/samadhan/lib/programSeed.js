'use strict';
/*
   v7 Phase 8 seeds (master prompt §O): the S/4HANA Programme desk - types with record classes, Process area ->
   Sub-process tree, programme lists, groups and routing, the defect SLA (S1 1 / S2 2 / S3 5 / S4 10 business days).
   Append-only; migration 7.8-program records what it adds so its down step removes exactly those rows.
*/
const S4_TYPES = [
    ['Defect – Unit', 'DEFECT'], ['Defect – SIT', 'DEFECT'], ['Defect – UAT', 'DEFECT'], ['Defect – Regression', 'DEFECT'], ['Defect – Performance', 'DEFECT'],
    ['Data Migration Issue', 'DEFECT'], ['Authorization / Role Issue', 'DEFECT'],
    ['Cutover Task', 'TASK'], ['Custom Code Remediation', 'TASK'], ['Training / Documentation', 'TASK'],
    ['Fit-Gap / Delta', 'ENHANCEMENT'], ['Risk', 'RISK'], ['Issue (RAID)', 'INCIDENT'], ['Hypercare Incident', 'INCIDENT'],
];

// Process area -> sub-process for the programme (the SAP modules plus the programme's own work streams).
const PROCESS_TREE = {
    'Order to Cash (SD)': ['Sales Order', 'Pricing', 'Delivery', 'Billing / e-Invoice', 'Credit', 'Returns', 'Schemes & Rebates', 'Intercompany'],
    'Procure to Pay (MM)': ['Purchase Requisition', 'Purchase Order', 'Goods Receipt', 'Invoice Verification', 'Subcontracting', 'Inventory'],
    'Plan to Produce (PP / QM)': ['MRP', 'Production Order', 'BOM / Recipe', 'Confirmation', 'Quality Inspection', 'Batch Management'],
    'Record to Report (FI / CO)': ['General Ledger', 'AP / AR', 'Asset Accounting', 'Bank', 'GST / TDS', 'Costing', 'Profitability', 'Closing'],
    'Hire to Retire (HCM)': ['Org Management', 'Personnel Administration', 'Time', 'Payroll'],
    'Data Migration': ['Customer / BP', 'Vendor / BP', 'Material', 'Open Purchase Orders', 'Open Sales Orders', 'Stock', 'GL Balances', 'Open Items', 'Fixed Assets', 'BOM / Routing', 'Pricing'],
    Cutover: ['Technical Cutover', 'Business Cutover', 'Data Loads', 'Go / No-go', 'Rollback'],
    'Custom Code & Integration': ['RICEFW', 'ATC Finding', 'Interface', 'Simplification Item', 'Fiori'],
    'Security & Roles': ['Role Design', 'SoD', 'User Mapping'],
    'Testing & Quality': ['Test Scripts', 'Test Data', 'Environment'],
    'PMO & Change Management': ['RAID', 'Training', 'Communication'],
};

const LISTS = {
    activatePhase: ['Prepare', 'Explore', 'Realize', 'Deploy', 'Hypercare', 'Run'],
    testCycle: ['Unit', 'SIT-1', 'SIT-2', 'UAT', 'Regression', 'Performance', 'Mock Cutover 1', 'Mock Cutover 2', 'Mock Cutover 3', 'Dress Rehearsal', 'Hypercare'],
    defectSeverity: ['S1 Critical', 'S2 High', 'S3 Medium', 'S4 Low'],
    retestStatus: ['Not started', 'Passed', 'Failed', 'Blocked'],
    mockCycle: ['Mock 1', 'Mock 2', 'Mock 3', 'Dress Rehearsal', 'Production'],
};
/** Defect severity -> ticket priority (4 Urgent ... 1 Low). */
const SEVERITY_PRIORITY = { 'S1 Critical': 4, 'S2 High': 3, 'S3 Medium': 2, 'S4 Low': 1 };
/** Cycles that count as "late" for defect leakage (found after SIT). */
const LATE_CYCLES = ['UAT', 'Regression', 'Performance', 'Dress Rehearsal', 'Hypercare'];

const GROUPS = ['PMO', 'Defect Triage', 'Data Migration', 'Cutover'];
const DEFAULT_GROUP = 'Defect Triage';
const AREA_GROUP = { 'Data Migration': 'Data Migration', Cutover: 'Cutover', 'PMO & Change Management': 'PMO' };

// Programme defects: resolution S1 1 / S2 2 / S3 5 / S4 10 business days (§O); first response 1 h / 4 bh / 1 bd / 1 bd.
const BH_DAY = 540;
const SLA_NAME = 'S/4HANA Programme defects';
const SLA_TARGETS = [[4, 60, BH_DAY, true], [3, 240, 2 * BH_DAY, true], [2, BH_DAY, 5 * BH_DAY, true], [1, BH_DAY, 10 * BH_DAY, true]];

const CANNED = [
    ['S4_PROGRAM', 'S/4 Programme', 'Please retest', 's4retest', 'Dear {{ticket.requester.name}},\n\nThe fix for {{ticket.ref}} is in the test system. Please retest the scenario and set the retest result (Passed / Failed) on the ticket.\n\nRegards,\n{{ticket.agent.name}}'],
    ['S4_PROGRAM', 'S/4 Programme', 'Need test evidence', 's4evidence', 'Dear {{ticket.requester.name}},\n\nTo work on this defect, please attach the test case id, the test data used, the steps and screenshots of the result.\n\nRegards,\n{{ticket.agent.name}}'],
];

module.exports = { S4_TYPES, PROCESS_TREE, LISTS, SEVERITY_PRIORITY, LATE_CYCLES, GROUPS, DEFAULT_GROUP, AREA_GROUP, SLA_NAME, SLA_TARGETS, CANNED, BH_DAY };
