/**
 * Admin Console writes (DOA rules, SLA/quota config, CAPEX users and plants). SAP's DoaRuleSet/ConfigSet are read-only today and
 * there is no user/role entity. Screens read through here and disable edit controls while `adminWritesEnabled()` is false.
 */
export const adminWritesEnabled = (): boolean => false;
export const ADMIN_WRITES_OFF_NOTE = 'Editing is not available yet: the SAP service only reads these settings today. Changes are still made in SAP.';
