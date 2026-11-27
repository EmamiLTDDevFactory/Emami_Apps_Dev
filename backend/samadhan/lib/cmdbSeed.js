'use strict';
/*
   Configuration management (ITIL "service configuration management" + "IT asset management"), migration 7.12-cmdb.
   A configuration item (CI) is anything that must be managed to deliver a service: laptops, desktops, printers,
   network devices, servers, VMs, cloud services, databases, applications, licences. Each CI has an identity (code =
   asset tag / CI id), a class, a lifecycle status, an owner / user, a site, its support vendor and hosting, and
   relationships to other CIs; tickets record the CIs they affect.
*/

const CI_CLASSES = ['Laptop', 'Desktop', 'Printer / Scanner', 'Mobile / Tablet', 'Monitor / Peripheral', 'Network device', 'Firewall', 'Server (physical)',
    'Virtual machine', 'Cloud service', 'Database', 'Storage / Backup', 'Application / Service', 'SAP system', 'Software licence', 'Other'];
// Lifecycle (asset management): plan -> stock -> in use (allocated) -> repair -> retired -> disposed.
const CI_STATUSES = ['Planned', 'In stock', 'In use', 'In repair', 'Retired', 'Disposed'];
const CI_CRITICALITY = ['Low', 'Medium', 'High', 'Critical'];
const CI_RELATIONS = ['Depends on', 'Runs on', 'Connected to', 'Part of', 'Uses', 'Backed up by'];

// Asset-tag letter (IND-KOL-L-0042) -> class, for CIs copied from the ASSET master.
const TAG_CLASS = { L: 'Laptop', D: 'Desktop', P: 'Printer / Scanner', S: 'Network device', R: 'Network device', F: 'Firewall', M: 'Mobile / Tablet', V: 'Virtual machine' };
const classFromTag = (code) => TAG_CLASS[(/-([A-Z])-\d+$/i.exec(String(code)) || [])[1]?.toUpperCase()] || 'Other';

module.exports = { CI_CLASSES, CI_CRITICALITY, CI_RELATIONS, CI_STATUSES, classFromTag };
