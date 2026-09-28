// Per-screen configuration for SimpleMaster — each entry is a direct transcription of one source
// controller (controller/<name>.controller.js), its view's table and its value-help fragment:
// entity set, columns, dialog fields, the exact payload for I/C/D, and the exact message texts.
import type { MasterConfig } from './SimpleMaster';

const s = (v: unknown) => (v == null ? '' : String(v));

export const verticalMaster: MasterConfig = {
  title: 'Vertical Master',
  entitySet: 'ZSTR_MSD_VERTICALSet',
  dialogTitle: 'Add Vertial Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '10rem' },
    { header: 'Vertical Name', key: 'Zvertical' },
  ],
  fields: [{ key: 'Zvertical', label: 'Vertical Name', required: true, validate: true }],
  savePayload: (flag, v) => ({ Zvertical: v.Zvertical, Action: flag }),
  editValues: (r) => ({ Zvertical: s(r.Zvertical) }),
  deletePayload: (r) => ({ Zvertical: r.Zvertical, Action: 'D' }),
  createdMsg: 'Vertical Master Created Successfully!!',
  updatedMsg: 'Vertical Master Updated Successfully!!',
  deletedMsg: 'Vertical Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Vertical Master?',
};

export const observationCategory: MasterConfig = {
  title: 'Observation Category',
  entitySet: 'ZMSD_OBSERVATION_CATSet',
  dialogTitle: 'Add Observation Category',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Observation Category', key: 'ZobservationNm' },
    { header: 'Sub Category', key: 'NeedTOAdd' },
  ],
  fields: [{ key: 'name', label: 'Observaton Name', required: true, validate: true }],
  // Add sends the value as ZobservationNm; edit sends it as ZobservationNmN with ZobservationNm "".
  savePayload: (flag, v) =>
    flag === 'I'
      ? { ZobservationNm: v.name, ZobservationNmN: '', Action: flag }
      : { ZobservationNm: '', ZobservationNmN: v.name, Action: flag },
  editValues: (r) => ({ name: s(r.ZobservationNm).length > 0 ? s(r.ZobservationNm) : s(r.ZobservationNmN) }),
  deletePayload: (r) => ({ ZobservationNm: r.ZobservationNm, ZobservationNmN: r.ZobservationNmN, Action: 'D' }),
  createdMsg: 'Observation Category Created Successfully!!',
  updatedMsg: 'Observation Category Updated Successfully!!',
  deletedMsg: 'Observation Category Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Observation Category?',
};

export const riskCategory: MasterConfig = {
  title: 'Risk Category',
  entitySet: 'ZMSD_RISK_CATSet',
  dialogTitle: 'Add Risk Category',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Name', key: 'ZriskNm' },
    { header: 'Status', key: 'NeedToAdd' },
  ],
  // The radio group and Description are shown by the fragment but never posted or validated by
  // the source controller — kept display-only here too.
  fields: [
    { key: 'type', label: '', kind: 'radio', radioOptions: ['Internal Finance Control', 'Enterprise Risk Management'] },
    { key: 'name', label: 'Name', required: true, validate: true },
    { key: 'description', label: 'Description', required: true, kind: 'textarea' },
  ],
  savePayload: (flag, v) =>
    flag === 'I' ? { ZriskNm: v.name, ZriskNmN: '', Action: flag } : { ZriskNm: '', ZriskNmN: v.name, Action: flag },
  editValues: (r) => ({ name: s(r.ZriskNm).length > 0 ? s(r.ZriskNm) : s(r.ZriskNmN) }),
  deletePayload: (r) => ({ ZriskNm: r.ZriskNm, ZriskNmN: r.ZriskNmN, Action: 'D' }),
  createdMsg: 'Risk Category Created Successfully!!',
  updatedMsg: 'Risk Category Updated Successfully!!',
  deletedMsg: 'Risk Category Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Risk Category?',
};

export const locationTypeMaster: MasterConfig = {
  title: 'Location Type Master',
  entitySet: 'ZMSD_location_typeSet',
  dialogTitle: 'Add Location Type Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Name', key: 'ZlocationId' },
  ],
  fields: [{ key: 'ZlocationId', label: 'Name', required: true, validate: true }],
  savePayload: (flag, v) => ({ ZlocationId: v.ZlocationId, Action: flag }),
  editValues: (r) => ({ ZlocationId: s(r.ZlocationId) }),
  deletePayload: (r) => ({ ZlocationId: r.ZlocationId, Action: 'D' }),
  createdMsg: 'Location Type Master Created Successfully!!',
  updatedMsg: 'Location Type Master Updated Successfully!!',
  deletedMsg: 'Location Type Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Location Type Master?',
};

export const legalEntityTypeMaster: MasterConfig = {
  title: 'Legal Entity Type Master',
  entitySet: 'ZST_MSD_LEGAL_EN_TYPESet',
  dialogTitle: 'Add Legal Entity Type Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Entity Type', key: 'ZlegalEntityNm' },
  ],
  fields: [{ key: 'ZlegalEntityNm', label: 'Legal Entity Type', required: true, validate: true }],
  savePayload: (flag, v) => ({ ZlegalEntityNm: v.ZlegalEntityNm, Action: flag }),
  editValues: (r) => ({ ZlegalEntityNm: s(r.ZlegalEntityNm) }),
  deletePayload: (r) => ({ ZlegalEntityNm: r.ZlegalEntityNm, Action: 'D' }),
  createdMsg: 'Legal Entity Type Master Created Successfully!!',
  updatedMsg: 'Legal Entity Type Master Updated Successfully!!',
  deletedMsg: 'Legal Entity Type Master Deleted Successfully!!',
  // Source text (copy-pasted from Location Type Master) kept as-is.
  confirmDeleteMsg: 'Do you want to delete the Location Type Master?',
};

export const subEntityTypeMaster: MasterConfig = {
  title: 'Sub Entity Type Master',
  entitySet: 'ZMSD_SUB_ENTITY_TPSet',
  dialogTitle: 'Add Sub Entity Type Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    // The source view binds ZlocationNm, which ZMSD_SUB_ENTITY_TP doesn't carry (the controller
    // reads/writes ZsubEntyNm) — fall back to ZsubEntyNm so the column isn't always blank.
    { header: 'Sub Entity Type', key: 'ZlocationNm', value: (r) => r.ZlocationNm ?? r.ZsubEntyNm },
  ],
  fields: [
    { key: 'ZlegalEntityNm', label: 'Legal Entity Type', required: true, validate: true },
    { key: 'ZsubEntyNm', label: 'Sub Entity Type', required: true, validate: true },
  ],
  savePayload: (flag, v) => ({ ZlegalEntityNm: v.ZlegalEntityNm, ZsubEntyNm: v.ZsubEntyNm, Action: flag }),
  editValues: (r) => ({ ZlegalEntityNm: s(r.ZlegalEntityNm), ZsubEntyNm: s(r.ZsubEntyNm) }),
  deletePayload: (r) => ({ ZlegalEntityNm: r.ZlegalEntityNm, ZsubEntyNm: r.ZsubEntyNm, Action: 'D' }),
  createdMsg: 'Sub Entity Type Master Created Successfully!!',
  updatedMsg: 'Sub Entity Type Master Updated Successfully!!',
  deletedMsg: 'Sub Entity Type Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Sub Entity Type Master?',
};

export const industryMaster: MasterConfig = {
  title: 'Industry Master',
  entitySet: 'ZST_MSD_INDUSTRYSet',
  dialogTitle: 'Add Industry Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Industry', key: 'ZindustryNm' },
  ],
  fields: [{ key: 'ZindustryNm', label: 'Industry', required: true, validate: true }],
  savePayload: (flag, v) => ({ ZindustryNm: v.ZindustryNm, Action: flag }),
  editValues: (r) => ({ ZindustryNm: s(r.ZindustryNm) }),
  deletePayload: (r) => ({ ZindustryNm: r.ZindustryNm, Action: 'D' }),
  createdMsg: 'Industry Master Created Successfully!!',
  updatedMsg: 'Industry Master Updated Successfully!!',
  deletedMsg: 'Industry Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Industry Master?',
};

export const stateMaster: MasterConfig = {
  title: 'State Master',
  entitySet: 'ZST_MSD_STATESet',
  dialogTitle: 'Add State Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'State', key: 'ZstateNm' },
  ],
  fields: [{ key: 'ZstateNm', label: 'State', required: true, validate: true }],
  savePayload: (flag, v) => ({ ZstateNm: v.ZstateNm, Action: flag }),
  editValues: (r) => ({ ZstateNm: s(r.ZstateNm) }),
  deletePayload: (r) => ({ ZstateNm: r.ZstateNm, Action: 'D' }),
  createdMsg: 'State Master Created Successfully!!',
  updatedMsg: 'State Master Updated Successfully!!',
  deletedMsg: 'State Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the State Master?',
};

export const cityMaster: MasterConfig = {
  title: 'City Master',
  entitySet: 'ZST_CITYSet',
  dialogTitle: 'Add City Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'City', key: 'ZcityNm' },
    { header: 'State', key: 'ZstateNm' },
  ],
  fields: [
    { key: 'ZcityNm', label: 'City', required: true, validate: true },
    // Fragment: <Select items="{path:'/ZST_MSD_STATESet'}"> keyed and labelled by ZstateNm.
    { key: 'ZstateNm', label: 'State', required: true, validate: true, kind: 'select', optionsEntitySet: 'ZST_MSD_STATESet', optionsKey: 'ZstateNm' },
  ],
  savePayload: (flag, v) => ({ ZcityNm: v.ZcityNm, ZstateNm: v.ZstateNm, Action: flag }),
  editValues: (r) => ({ ZcityNm: s(r.ZcityNm), ZstateNm: s(r.ZstateNm) }),
  deletePayload: (r) => ({ ZcityNm: r.ZcityNm, ZstateNm: r.ZstateNm, Action: 'D' }),
  createdMsg: 'City Master Created Successfully!!',
  updatedMsg: 'City Master Updated Successfully!!',
  deletedMsg: 'City Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the City Master?',
};

export const departmentMaster: MasterConfig = {
  title: 'Department Master',
  entitySet: 'ZDEPARTMENT_MASTERSet',
  dialogTitle: 'Add Department Master',
  columns: [
    { header: 'Sl No.', key: 'slNo', width: '3rem' },
    { header: 'Department Name', key: 'Department' },
  ],
  fields: [{ key: 'name', label: 'Department Name', required: true, validate: true }],
  savePayload: (flag, v) =>
    flag === 'I' ? { Department: v.name, DepartmentN: '', Action: flag } : { Department: '', DepartmentN: v.name, Action: flag },
  editValues: (r) => ({ name: s(r.Department).length > 0 ? s(r.Department) : s(r.DepartmentN) }),
  deletePayload: (r) => ({ Department: r.Department, DepartmentN: r.DepartmentN, Action: 'D' }),
  createdMsg: 'Department Master Created Successfully!!',
  updatedMsg: 'Department Master Updated Successfully!!',
  deletedMsg: 'Department Master Deleted Successfully!!',
  confirmDeleteMsg: 'Do you want to delete the Department Master?',
};
