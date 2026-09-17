// const { readDatabase, writeDatabase } = require("../db");

// const getAllAudits = () => {
//   return readDatabase().audits;
// };

// const getAuditById = (id) => {
//   return readDatabase().audits.find(
//     (audit) => String(audit.id) === String(id)
//   );
// };

// const createAudit = (audit) => {
//   const database = readDatabase();

//   const newAudit = {
//     ...audit,
//     id: audit.id ?? Date.now(),
//   };

//   database.audits.push(newAudit);
//   writeDatabase(database);

//   return newAudit;
// };

// const updateAudit = (id, changes) => {
//   const database = readDatabase();
//   const index = database.audits.findIndex(
//     (audit) => String(audit.id) === String(id)
//   );

//   if (index === -1) {
//     return null;
//   }

//   database.audits[index] = {
//     ...database.audits[index],
//     ...changes,
//     id: database.audits[index].id,
//   };

//   writeDatabase(database);
//   return database.audits[index];
// };

// const deleteAudit = (id) => {
//   const database = readDatabase();
//   const auditId = String(id);
//   const exists = database.audits.some(
//     (audit) => String(audit.id) === auditId
//   );

//   if (!exists) {
//     return false;
//   }

//   database.audits = database.audits.filter(
//     (audit) => String(audit.id) !== auditId
//   );

//   // Keep related CAPAs consistent when an audit is deleted.
//   database.capas = database.capas.filter(
//     (capa) => String(capa.auditId) !== auditId
//   );

//   writeDatabase(database);
//   return true;
// };

// module.exports = {
//   getAllAudits,
//   getAuditById,
//   createAudit,
//   updateAudit,
//   deleteAudit,
// };

// const pool = require("../config/db");

// // Get all audits
// const getAllAudits = async () => {
//   const result = await pool.query(`
//         SELECT *
//         FROM audit_capa.audits
//         ORDER BY created_at DESC
//     `);

//   return result.rows;
// };


// // Get audit by ID
// const getAuditById = async (id) => {
//   const result = await pool.query(
//     `
//         SELECT *
//         FROM audit_capa.audits
//         WHERE id = $1
//         `,
//     [id]
//   );

//   return result.rows[0] || null;
// };


// // Create audit
// const createAudit = async (audit) => {

//   const newAudit = {
//     ...audit,
//     // id: audit.id ?? Date.now(),
//   };

//   const result = await pool.query(
//     `
//         INSERT INTO audit_capa.audits (
//             // id,
//             audit_no,
//             depot,
//             auditor,

//             auditor_signature,
//             auditor_signature_submitted,
//             auditor_signature_date,

//             depot_incharge_name,

//             depot_signature,
//             depot_signature_submitted,
//             depot_signature_date,

//             audit_type,
//             audit_category,

//             audit_date,
//             due_date,
//             created_date,

//             status,
//             compliance,

//             checklist,
//             capa_records
//         )
//         VALUES (
//             $1,
//             $2,
//             $3,
//             $4,
//             $5,
//             $6,
//             $7,
//             $8,
//             $9,
//             $10,
//             $11,
//             $12,
//             $13,
//             $14,
//             $15,
//             $16,
//             $17,
//             $18,
//             $19,
//             $20
//         )
//         RETURNING *
//         `,
//     [
//       // newAudit.id,
//       newAudit.auditNo,
//       newAudit.depot,
//       newAudit.auditor,

//       newAudit.auditorSignature || "",
//       newAudit.auditorSignatureSubmitted || false,
//       newAudit.auditorSignatureDate || "",

//       newAudit.depotInchargeName || "",

//       newAudit.depotSignature || "",
//       newAudit.depotSignatureSubmitted || false,
//       newAudit.depotSignatureDate || "",

//       newAudit.auditType,
//       newAudit.auditCategory,

//       newAudit.auditDate,
//       newAudit.dueDate,
//       newAudit.createdDate,

//       newAudit.status || "Open",
//       newAudit.compliance ?? 0,

//       JSON.stringify(newAudit.checklist || []),
//       JSON.stringify(newAudit.capaRecords || [])
//     ]
//   );

//   return result.rows[0];
// };


// // Update audit
// const updateAudit = async (id, changes) => {

//   const existing = await getAuditById(id);

//   if (!existing) {
//     return null;
//   }

//   const updated = {
//     ...existing,
//     ...changes,
//     id: existing.id,
//   };

//   const result = await pool.query(
//     `
//         UPDATE audit_capa.audits
//         SET
//             audit_no = $1,
//             depot = $2,
//             auditor = $3,

//             auditor_signature = $4,
//             auditor_signature_submitted = $5,
//             auditor_signature_date = $6,

//             depot_incharge_name = $7,

//             depot_signature = $8,
//             depot_signature_submitted = $9,
//             depot_signature_date = $10,

//             audit_type = $11,
//             audit_category = $12,

//             audit_date = $13,
//             due_date = $14,
//             created_date = $15,

//             status = $16,
//             compliance = $17,

//             checklist = $18,
//             capa_records = $19,

//             updated_at = CURRENT_TIMESTAMP

//         WHERE id = $20

//         RETURNING *
//         `,
//     [
//       updated.auditNo,
//       updated.depot,
//       updated.auditor,

//       updated.auditorSignature || "",
//       updated.auditorSignatureSubmitted || false,
//       updated.auditorSignatureDate || "",

//       updated.depotInchargeName || "",

//       updated.depotSignature || "",
//       updated.depotSignatureSubmitted || false,
//       updated.depotSignatureDate || "",

//       updated.auditType,
//       updated.auditCategory,

//       updated.auditDate,
//       updated.dueDate,
//       updated.createdDate,

//       updated.status,
//       updated.compliance ?? 0,

//       JSON.stringify(updated.checklist || []),
//       JSON.stringify(updated.capaRecords || []),

//       id
//     ]
//   );

//   return result.rows[0] || null;
// };


// // Delete audit
// const deleteAudit = async (id) => {

//   const result = await pool.query(
//     `
//         DELETE FROM audit_capa.audits
//         WHERE id = $1
//         RETURNING id
//         `,
//     [id]
//   );

//   return result.rowCount > 0;
// };


// module.exports = {
//   getAllAudits,
//   getAuditById,
//   createAudit,
//   updateAudit,
//   deleteAudit,
// };

// const pool = require("../config/db");


// // Convert PostgreSQL snake_case → React camelCase
// const mapAudit = (row) => {
//   if (!row) {
//     return null;
//   }

//   const convertToPostgresDate = (date) => {
//     if (!date || date === "") {
//       return null;
//     }

//     // DD-MM-YYYY
//     if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
//       const [day, month, year] = date.split("-");
//       return `${year}-${month}-${day}`;
//     }

//     // Already YYYY-MM-DD
//     if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
//       return date;
//     }

//     return null;
//   };


//   const convertToPostgresTimestamp = (date) => {
//     if (!date || date === "") {
//       return null;
//     }

//     // DD-MM-YYYY
//     if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
//       const [day, month, year] = date.split("-");
//       return `${year}-${month}-${day} 00:00:00`;
//     }

//     // MM/DD/YYYY
//     if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
//       const [month, day, year] = date.split("/");
//       return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 00:00:00`;
//     }

//     // YYYY-MM-DD
//     if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
//       return `${date} 00:00:00`;
//     }

//     return null;
//   };

//   return {
//     id: row.id,

//     auditNo: row.audit_no,
//     depot: row.depot,
//     auditor: row.auditor,

//     auditorSignature:
//       row.auditor_signature,

//     auditorSignatureSubmitted:
//       row.auditor_signature_submitted,

//     auditorSignatureDate:
//       row.auditor_signature_date,

//     depotInchargeName:
//       row.depot_incharge_name,

//     depotSignature:
//       row.depot_signature,

//     depotSignatureSubmitted:
//       row.depot_signature_submitted,

//     depotSignatureDate:
//       row.depot_signature_date,

//     auditType:
//       row.audit_type,

//     auditCategory:
//       row.audit_category,

//     auditDate:
//       row.audit_date,

//     dueDate:
//       row.due_date,

//     createdDate:
//       row.created_date,

//     status:
//       row.status,

//     compliance:
//       row.compliance,

//     checklist:
//       row.checklist || [],

//     capaRecords:
//       row.capa_records || [],

//     createdAt:
//       row.created_at,

//     updatedAt:
//       row.updated_at,
//   };
// };


// // Get all audits
// const getAllAudits = async () => {

//   const result = await pool.query(`
//     SELECT *
//     FROM audit_capa.audits
//     ORDER BY created_at DESC
//   `);

//   return result.rows.map(mapAudit);
// };


// // Get audit by ID
// const getAuditById = async (id) => {

//   const result = await pool.query(
//     `
//       SELECT *
//       FROM audit_capa.audits
//       WHERE id = $1
//     `,
//     [id]
//   );

//   return mapAudit(result.rows[0]);
// };


// // Create audit
// const createAudit = async (audit) => {

//   const result = await pool.query(
//     `
//       INSERT INTO audit_capa.audits (
//         audit_no,
//         depot,
//         auditor,

//         auditor_signature,
//         auditor_signature_submitted,
//         auditor_signature_date,

//         depot_incharge_name,

//         depot_signature,
//         depot_signature_submitted,
//         depot_signature_date,

//         audit_type,
//         audit_category,

//         audit_date,
//         due_date,
//         created_date,

//         status,
//         compliance,

//         checklist,
//         capa_records
//       )
//       VALUES (
//         $1,
//         $2,
//         $3,
//         $4,
//         $5,
//         $6,
//         $7,
//         $8,
//         $9,
//         $10,
//         $11,
//         $12,
//         $13,
//         $14,
//         $15,
//         $16,
//         $17,
//         $18,
//         $19
//       )
//       RETURNING *
//     `,
//     [
//       audit.auditNo,
//       audit.depot,
//       audit.auditor,

//       audit.auditorSignature || "",
//       audit.auditorSignatureSubmitted || false,
//       // audit.auditorSignatureDate || "",
//       convertToPostgresTimestamp(
//         audit.auditorSignatureDate
//       ),


//       audit.depotInchargeName || "",

//       audit.depotSignature || "",
//       audit.depotSignatureSubmitted || false,
//       // audit.depotSignatureDate || "",
//       convertToPostgresTimestamp(
//         audit.depotSignatureDate
//       ),

//       audit.auditType,
//       audit.auditCategory || "Depot",

//       // audit.auditDate,
//       // audit.dueDate,

//       convertToPostgresDate(audit.auditDate),
//       convertToPostgresDate(audit.dueDate),
//       convertToPostgresTimestamp(audit.createdDate) ||
//       new Date(),

//       // audit.createdDate ||
//       // new Date().toLocaleDateString(),

//       audit.status || "Open",

//       audit.compliance ?? 0,

//       JSON.stringify(
//         audit.checklist || []
//       ),

//       JSON.stringify(
//         audit.capaRecords || []
//       ),
//     ]
//   );

//   return mapAudit(result.rows[0]);
// };


// // Update audit
// const updateAudit = async (
//   id,
//   changes
// ) => {

//   const existing =
//     await getAuditById(id);

//   if (!existing) {
//     return null;
//   }

//   const updated = {
//     ...existing,
//     ...changes,
//     id: existing.id,
//   };

//   const result = await pool.query(
//     `
//       UPDATE audit_capa.audits
//       SET
//         audit_no = $1,
//         depot = $2,
//         auditor = $3,

//         auditor_signature = $4,
//         auditor_signature_submitted = $5,
//         auditor_signature_date = $6,

//         depot_incharge_name = $7,

//         depot_signature = $8,
//         depot_signature_submitted = $9,
//         depot_signature_date = $10,

//         audit_type = $11,
//         audit_category = $12,

//         audit_date = $13,
//         due_date = $14,
//         created_date = $15,

//         status = $16,
//         compliance = $17,

//         checklist = $18,
//         capa_records = $19,

//         updated_at = CURRENT_TIMESTAMP

//       WHERE id = $20

//       RETURNING *
//     `,
//     [
//       updated.auditNo,
//       updated.depot,
//       updated.auditor,

//       updated.auditorSignature || "",
//       updated.auditorSignatureSubmitted || false,
//       updated.auditorSignatureDate || "",

//       updated.depotInchargeName || "",

//       updated.depotSignature || "",
//       updated.depotSignatureSubmitted || false,
//       updated.depotSignatureDate || "",

//       updated.auditType,
//       updated.auditCategory || "Depot",

//       updated.auditDate,
//       updated.dueDate,
//       updated.createdDate,

//       updated.status,
//       updated.compliance ?? 0,

//       JSON.stringify(
//         updated.checklist || []
//       ),

//       JSON.stringify(
//         updated.capaRecords || []
//       ),

//       id,
//     ]
//   );

//   return mapAudit(result.rows[0]);
// };


// // Delete audit
// const deleteAudit = async (id) => {

//   const result = await pool.query(
//     `
//       DELETE FROM audit_capa.audits
//       WHERE id = $1
//       RETURNING id
//     `,
//     [id]
//   );

//   return result.rowCount > 0;
// };


// module.exports = {
//   getAllAudits,
//   getAuditById,
//   createAudit,
//   updateAudit,
//   deleteAudit,
// };

// const pool = require("../config/db");

// // ---------------------------------------------------------
// // Helpers
// // ---------------------------------------------------------

// const convertToPostgresDate = (value) => {
//   if (!value) {
//     return null;
//   }

//   // Already YYYY-MM-DD
//   if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
//     return value;
//   }

//   // Frontend sends DD-MM-YYYY
//   if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
//     const [day, month, year] = value.split("-");
//     return `${year}-${month}-${day}`;
//   }

//   return value;
// };

// // const convertToPostgresTimestamp = (value) => {
// //   if (!value || value === "") {
// //     return null;
// //   }

// //   // Already valid ISO timestamp
// //   if (value.includes("T")) {
// //     return value;
// //   }

// //   // DD-MM-YYYY
// //   if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
// //     const [day, month, year] = value.split("-");

// //     return `${year}-${month}-${day} 00:00:00`;
// //   }

// //   return value;
// // };

// const convertToPostgresTimestamp = (value) => {
//   if (value === null || value === undefined || value === "") {
//     return null;
//   }

//   // PostgreSQL timestamp returned by pg can already be a Date object
//   if (value instanceof Date) {
//     return value;
//   }

//   if (typeof value !== "string") {
//     return null;
//   }

//   // DD-MM-YYYY
//   const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);

//   if (match) {
//     const [, day, month, year] = match;

//     return `${year}-${month}-${day} 00:00:00`;
//   }

//   // YYYY-MM-DD
//   if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
//     return `${value} 00:00:00`;
//   }

//   // ISO timestamp / other valid date string
//   const parsed = new Date(value);

//   if (!isNaN(parsed.getTime())) {
//     return parsed;
//   }

//   return null;
// };

// const parseJsonb = (value) => {
//   if (value === null || value === undefined) {
//     return [];
//   }

//   if (typeof value === "string") {
//     try {
//       return JSON.parse(value);
//     } catch (error) {
//       return [];
//     }
//   }

//   return value;
// };


// // ---------------------------------------------------------
// // Convert PostgreSQL row -> React object
// // ---------------------------------------------------------

// const mapAudit = (row) => {
//   if (!row) {
//     return null;
//   }

//   return {
//     id: row.id,

//     auditNo: row.audit_no,
//     auditCategory: row.audit_category,
//     auditType: row.audit_type,

//     depot: row.depot,
//     auditor: row.auditor,

//     auditDate: row.audit_date,
//     dueDate: row.due_date,

//     createdDate: row.created_date,

//     status: row.status,
//     compliance: row.compliance,

//     auditorSignature: row.auditor_signature || "",
//     auditorSignatureSubmitted:
//       row.auditor_signature_submitted || false,

//     auditorSignatureDate:
//       row.auditor_signature_date || "",

//     depotInchargeName:
//       row.depot_incharge_name || "",

//     depotSignature:
//       row.depot_signature || "",

//     depotSignatureSubmitted:
//       row.depot_signature_submitted || false,

//     depotSignatureDate:
//       row.depot_signature_date || "",

//     checklist: parseJsonb(row.checklist),

//     capaRecords: parseJsonb(row.capa_records),

//     createdAt: row.created_at,
//     updatedAt: row.updated_at,
//   };
// };


// // ---------------------------------------------------------
// // GET ALL
// // ---------------------------------------------------------

// const getAllAudits = async () => {
//   const result = await pool.query(`
//     SELECT *
//     FROM audit_capa.audits
//     ORDER BY created_at DESC
//   `);

//   return result.rows.map(mapAudit);
// };


// // ---------------------------------------------------------
// // GET BY ID
// // ---------------------------------------------------------

// const getAuditById = async (id) => {
//   const result = await pool.query(
//     `
//       SELECT *
//       FROM audit_capa.audits
//       WHERE id = $1
//     `,
//     [id]
//   );

//   return mapAudit(result.rows[0]);
// };


// // ---------------------------------------------------------
// // CREATE
// // ---------------------------------------------------------

// const createAudit = async (audit) => {
//   const result = await pool.query(
//     `
//       INSERT INTO audit_capa.audits (

//         audit_no,
//         audit_category,
//         audit_type,

//         depot,
//         auditor,

//         audit_date,
//         due_date,

//         created_date,

//         status,
//         compliance,

//         auditor_signature,
//         auditor_signature_submitted,
//         auditor_signature_date,

//         depot_incharge_name,

//         depot_signature,
//         depot_signature_submitted,
//         depot_signature_date,

//         checklist,
//         capa_records

//       )
//       VALUES (

//         $1,
//         $2,
//         $3,

//         $4,
//         $5,

//         $6,
//         $7,

//         $8,

//         $9,
//         $10,

//         $11,
//         $12,
//         $13,

//         $14,

//         $15,
//         $16,
//         $17,

//         $18,
//         $19

//       )

//       RETURNING *
//     `,
//     [

//       // 1
//       audit.auditNo,

//       // 2
//       audit.auditCategory || "Depot",

//       // 3
//       audit.auditType || "Onsite",

//       // 4
//       audit.depot,

//       // 5
//       audit.auditor,

//       // 6
//       convertToPostgresDate(
//         audit.auditDate
//       ),

//       // 7
//       convertToPostgresDate(
//         audit.dueDate
//       ),

//       // 8
//       convertToPostgresTimestamp(
//         audit.createdDate
//       ) || new Date(),

//       // 9
//       audit.status || "Open",

//       // 10
//       audit.compliance ?? 0,

//       // 11
//       audit.auditorSignature || "",

//       // 12
//       audit.auditorSignatureSubmitted || false,

//       // 13
//       convertToPostgresTimestamp(
//         audit.auditorSignatureDate
//       ),

//       // 14
//       audit.depotInchargeName || "",

//       // 15
//       audit.depotSignature || "",

//       // 16
//       audit.depotSignatureSubmitted || false,

//       // 17
//       convertToPostgresTimestamp(
//         audit.depotSignatureDate
//       ),

//       // 18
//       JSON.stringify(
//         audit.checklist || []
//       ),

//       // 19
//       JSON.stringify(
//         audit.capaRecords || []
//       ),
//     ]
//   );

//   return mapAudit(result.rows[0]);
// };


// // ---------------------------------------------------------
// // UPDATE
// // ---------------------------------------------------------

// const updateAudit = async (id, changes) => {
//   const existing = await getAuditById(id);

//   if (!existing) {
//     return null;
//   }

//   const updated = {
//     ...existing,
//     ...changes,
//   };

//   const result = await pool.query(
//     `
//       UPDATE audit_capa.audits
//       SET

//         audit_no = $1,
//         audit_category = $2,
//         audit_type = $3,

//         depot = $4,
//         auditor = $5,

//         audit_date = $6,
//         due_date = $7,

//         created_date = $8,

//         status = $9,
//         compliance = $10,

//         auditor_signature = $11,
//         auditor_signature_submitted = $12,
//         auditor_signature_date = $13,

//         depot_incharge_name = $14,

//         depot_signature = $15,
//         depot_signature_submitted = $16,
//         depot_signature_date = $17,

//         checklist = $18,
//         capa_records = $19,

//         updated_at = CURRENT_TIMESTAMP

//       WHERE id = $20

//       RETURNING *
//     `,
//     [

//       updated.auditNo,

//       updated.auditCategory || "Depot",

//       updated.auditType || "Onsite",

//       updated.depot,

//       updated.auditor,

//       convertToPostgresDate(
//         updated.auditDate
//       ),

//       convertToPostgresDate(
//         updated.dueDate
//       ),

//       convertToPostgresTimestamp(
//         updated.createdDate
//       ) || new Date(),

//       updated.status || "Open",

//       updated.compliance ?? 0,

//       updated.auditorSignature || "",

//       updated.auditorSignatureSubmitted || false,

//       convertToPostgresTimestamp(
//         updated.auditorSignatureDate
//       ),

//       updated.depotInchargeName || "",

//       updated.depotSignature || "",

//       updated.depotSignatureSubmitted || false,

//       convertToPostgresTimestamp(
//         updated.depotSignatureDate
//       ),

//       JSON.stringify(
//         updated.checklist || []
//       ),

//       JSON.stringify(
//         updated.capaRecords || []
//       ),

//       id,
//     ]
//   );

//   return mapAudit(result.rows[0]);
// };


// // ---------------------------------------------------------
// // DELETE
// // ---------------------------------------------------------

// const deleteAudit = async (id) => {
//   const result = await pool.query(
//     `
//       DELETE FROM audit_capa.audits
//       WHERE id = $1
//       RETURNING id
//     `,
//     [id]
//   );

//   return result.rowCount > 0;
// };


// // ---------------------------------------------------------
// // EXPORT
// // ---------------------------------------------------------

// module.exports = {
//   getAllAudits,
//   getAuditById,
//   createAudit,
//   updateAudit,
//   deleteAudit,
// };


const pool = require("../config/db");

// =========================================================
// HELPERS
// =========================================================

const generateAuditNo = async (auditType) => {

  const now = new Date();

  const yy =
    now
      .getFullYear()
      .toString()
      .slice(-2);

  const mm =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const typeCode =
    auditType === "Desktop"
      ? "DD"
      : "DO";

  const { rows } =
    await pool.query(
      `
       SELECT COALESCE(
            MAX(
                CAST(
                    RIGHT(audit_no,4) AS INTEGER
                )
            ),0
        ) + 1 AS serial
        FROM audit_capa.audits
        WHERE audit_type = $1
      `,
      [auditType]
    );

  const serial =
    String(rows[0].serial)
      .padStart(4, "0");

  return `AUD/${typeCode}/${yy}/${mm}/${serial}`;
};

const convertToPostgresDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // PostgreSQL / JS Date object
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return null;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split("-");
    return `${year}-${month}-${day}`;
  }

  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [month, day, year] = value.split("/");

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
};


const convertToPostgresTimestamp = (value) => {

  if (value === null || value === undefined || value === "") {
    return null;
  }

  // PostgreSQL returns timestamp as Date object
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null;
    }

    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {

    const [day, month, year] = value.split("-");

    return `${year}-${month}-${day} 00:00:00`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value} 00:00:00`;
  }

  // ISO timestamp
  const parsed = new Date(value);

  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};


const parseJsonb = (value) => {

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {

    try {
      return JSON.parse(value);
    } catch (error) {
      return [];
    }
  }

  return value;
};


// =========================================================
// MAP DATABASE -> FRONTEND
// =========================================================

const mapAudit = (row) => {

  if (!row) {
    return null;
  }

  return {

    id: row.id,

    auditNo: row.audit_no,

    auditCategory: row.audit_category,

    auditType: row.audit_type,

    depot: row.depot,

    auditor: row.auditor,

    auditDate: row.audit_date,

    dueDate: row.due_date,

    createdDate: row.created_date,

    status: row.status,

    compliance: row.compliance,

    auditorSignature:
      row.auditor_signature || "",

    auditorSignatureSubmitted:
      row.auditor_signature_submitted || false,

    auditorSignatureDate:
      row.auditor_signature_date || null,

    depotInchargeName:
      row.depot_incharge_name || "",

    depotSignature:
      row.depot_signature || "",

    depotSignatureSubmitted:
      row.depot_signature_submitted || false,

    depotSignatureDate:
      row.depot_signature_date || null,

    checklist:
      parseJsonb(row.checklist),

    capaRecords:
      parseJsonb(row.capa_records),

    generalInfo:
      parseJsonb(row.general_info) || {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at
  };
};


// =========================================================
// GET ALL AUDITS
// =========================================================

const getAllAudits = async () => {

  const result = await pool.query(`
    SELECT *
    FROM audit_capa.audits
    ORDER BY created_at DESC
  `);

  return result.rows.map(mapAudit);
};


// =========================================================
// GET AUDIT BY ID
// =========================================================

const getAuditById = async (id) => {

  const result = await pool.query(
    `
      SELECT *
      FROM audit_capa.audits
      WHERE id = $1
    `,
    [id]
  );

  return mapAudit(result.rows[0]);
};


// =========================================================
// CREATE AUDIT
// =========================================================

const createAudit = async (audit) => {

  // IMPORTANT:
  // auditNo is mandatory in PostgreSQL.
  // if (!audit.auditNo) {
  //   throw new Error("auditNo is required");
  // }

  if (!audit.depot) {
    throw new Error("depot is required");
  }

  if (!audit.auditor) {
    throw new Error("auditor is required");
  }

  if (!audit.auditDate) {
    throw new Error("auditDate is required");
  }

  if (!audit.dueDate) {
    throw new Error("dueDate is required");
  }
  const auditNo =
    await generateAuditNo(
      audit.auditType
    );

  const result = await pool.query(

    `
      INSERT INTO audit_capa.audits (

        audit_no,
        audit_category,
        audit_type,

        depot,
        auditor,

        audit_date,
        due_date,

        created_date,

        status,
        compliance,

        auditor_signature,
        auditor_signature_submitted,
        auditor_signature_date,

        depot_incharge_name,

        depot_signature,
        depot_signature_submitted,
        depot_signature_date,

        checklist,
        capa_records,
        general_info


      )
      VALUES (

        $1,
        $2,
        $3,

        $4,
        $5,

        $6,
        $7,

        $8,

        $9,
        $10,

        $11,
        $12,
        $13,

        $14,

        $15,
        $16,
        $17,

        $18,
        $19,
        $20
        

      )

      RETURNING *
    `,
    [

      // audit.auditNo,
      auditNo,

      audit.auditCategory || "Depot",

      audit.auditType || "Onsite",

      audit.depot,

      audit.auditor,

      convertToPostgresDate(
        audit.auditDate
      ),

      convertToPostgresDate(
        audit.dueDate
      ),

      // created_date is a server-side audit trail timestamp, not user input - the frontend's
      // new Date().toLocaleDateString() is locale-dependent (e.g. renders as day-first in some
      // locales) and convertToPostgresTimestamp can misparse or reject it, so always stamp with
      // the server's own clock instead of trusting the client-supplied value.
      new Date(),

      audit.status || "Open",

      audit.compliance ?? 0,

      audit.auditorSignature || "",

      audit.auditorSignatureSubmitted ?? false,

      convertToPostgresTimestamp(
        audit.auditorSignatureDate
      ),

      audit.depotInchargeName || "",

      audit.depotSignature || "",

      audit.depotSignatureSubmitted ?? false,

      convertToPostgresTimestamp(
        audit.depotSignatureDate
      ),

      JSON.stringify(
        audit.checklist || []
      ),

      JSON.stringify(
        audit.capaRecords || []
      ),
      JSON.stringify(audit.generalInfo || {})
    ]
  );

  return mapAudit(result.rows[0]);
};


// =========================================================
// UPDATE AUDIT
// =========================================================

const updateAudit = async (id, changes) => {

  const existing = await getAuditById(id);

  if (!existing) {
    return null;
  }


  // Merge frontend changes with DB values.
  // Existing values remain intact when the frontend
  // sends only signature-related fields.

  const updated = {
    ...existing,
    ...changes
  };


  // IMPORTANT:
  // Never allow empty/undefined values to wipe mandatory
  // fields during a signature update.

  const auditNo =
    changes.auditNo !== undefined &&
      changes.auditNo !== null &&
      changes.auditNo !== ""
      ? changes.auditNo
      : existing.auditNo;

  const depot =
    changes.depot !== undefined &&
      changes.depot !== null &&
      changes.depot !== ""
      ? changes.depot
      : existing.depot;

  const auditor =
    changes.auditor !== undefined &&
      changes.auditor !== null &&
      changes.auditor !== ""
      ? changes.auditor
      : existing.auditor;

  const auditCategory =
    changes.auditCategory !== undefined &&
      changes.auditCategory !== null &&
      changes.auditCategory !== ""
      ? changes.auditCategory
      : existing.auditCategory || "Depot";

  const auditType =
    changes.auditType !== undefined &&
      changes.auditType !== null &&
      changes.auditType !== ""
      ? changes.auditType
      : existing.auditType || "Onsite";


  const auditDate =
    changes.auditDate !== undefined
      ? changes.auditDate
      : existing.auditDate;

  const dueDate =
    changes.dueDate !== undefined
      ? changes.dueDate
      : existing.dueDate;


  const result = await pool.query(
    `
      UPDATE audit_capa.audits
      SET

        audit_no = $1,
        audit_category = $2,
        audit_type = $3,

        depot = $4,
        auditor = $5,

        audit_date = $6,
        due_date = $7,

        status = $8,
        compliance = $9,

        auditor_signature = $10,
        auditor_signature_submitted = $11,
        auditor_signature_date = $12,

        depot_incharge_name = $13,

        depot_signature = $14,
        depot_signature_submitted = $15,
        depot_signature_date = $16,

        checklist = $17,
        capa_records = $18,
        general_info = $19,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = $20

      RETURNING *
    `,
    [

      auditNo,

      auditCategory,

      auditType,

      depot,

      auditor,

      convertToPostgresDate(
        auditDate
      ),

      convertToPostgresDate(
        dueDate
      ),

      updated.status || "Open",

      updated.compliance ?? 0,

      updated.auditorSignature || "",

      updated.auditorSignatureSubmitted ?? false,

      convertToPostgresTimestamp(
        updated.auditorSignatureDate
      ),

      updated.depotInchargeName || "",

      updated.depotSignature || "",

      updated.depotSignatureSubmitted ?? false,

      convertToPostgresTimestamp(
        updated.depotSignatureDate
      ),

      JSON.stringify(
        updated.checklist || []
      ),

      JSON.stringify(
        updated.capaRecords || []
      ),
      JSON.stringify(
        updated.generalInfo || {}
      ),

      id
    ]
  );

  return mapAudit(result.rows[0]);
};


// =========================================================
// DELETE AUDIT
// =========================================================


// const deleteAudit = async (id) => {

//   await pool.query(
//     `
//       DELETE FROM audit_capa.notifications
//       WHERE audit_id = $1
//     `,
//     [id]
//   );

//   const result = await pool.query(
//     `
//       DELETE FROM audit_capa.audits
//       WHERE id = $1
//       RETURNING id
//     `,
//     [id]
//   );

//   return result.rowCount > 0;
// };

const deleteAudit = async (id) => {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    // Delete related notifications
    await client.query(
      `
      DELETE FROM audit_capa.notifications
      WHERE audit_id = $1
      `,
      [id]
    );

    await client.query(
      `
      DELETE FROM audit_capa.capas
      WHERE audit_id = $1
      `,
      [id]
    );


    // Delete audit
    const result = await client.query(
      `
      DELETE FROM audit_capa.audits
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    await client.query("COMMIT");

    return result.rowCount > 0;

  } catch (error) {

    await client.query("ROLLBACK");
    throw error;

  } finally {

    client.release();
  }
};

// const deleteAudit = async (id) => {

//   const result = await pool.query(
//     `
//       DELETE FROM audit_capa.audits
//       WHERE id = $1
//       RETURNING id
//     `,
//     [id]
//   );

//   return result.rowCount > 0;
// };


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getAllAudits,
  getAuditById,
  createAudit,
  updateAudit,
  deleteAudit
};