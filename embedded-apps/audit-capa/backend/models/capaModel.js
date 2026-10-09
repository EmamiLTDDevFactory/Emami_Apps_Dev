// const { readDatabase, writeDatabase } = require("../db");

// const getAllCAPAs = (auditId) => {
//   const capas = readDatabase().capas;

//   if (auditId === undefined) {
//     return capas;
//   }

//   return capas.filter(
//     (capa) => String(capa.auditId) === String(auditId)
//   );
// };

// const upsertCAPAs = (capas) => {
//   const database = readDatabase();
//   const incoming = Array.isArray(capas) ? capas : [capas];
//   const byId = new Map(
//     database.capas.map((capa) => [String(capa.id), capa])
//   );

//   for (const capa of incoming) {
//     const id = capa.id ?? Date.now();
//     const key = String(id);
//     byId.set(key, {
//       ...(byId.get(key) || {}),
//       ...capa,
//       id,
//     });
//   }

//   database.capas = Array.from(byId.values());
//   writeDatabase(database);
//   return database.capas;
// };

// const createCAPAs = (capas) => {
//   const database = readDatabase();
//   const incoming = Array.isArray(capas) ? capas : [capas];

//   const newCAPAs = incoming.map((capa, index) => ({
//     ...capa,
//     id: capa.id ?? Date.now() + index,
//   }));

//   database.capas.push(...newCAPAs);
//   writeDatabase(database);

//   return newCAPAs;
// };

// const updateCAPA = (id, changes) => {
//   const database = readDatabase();
//   const index = database.capas.findIndex(
//     (capa) => String(capa.id) === String(id)
//   );

//   if (index === -1) {
//     return null;
//   }

//   database.capas[index] = {
//     ...database.capas[index],
//     ...changes,
//     id: database.capas[index].id,
//   };

//   writeDatabase(database);
//   return database.capas[index];
// };

// module.exports = {
//   getAllCAPAs,
//   upsertCAPAs,
//   createCAPAs,
//   updateCAPA,
// };

const pool = require("../config/db");

// Evidence list for a CAPA. evidence_files (jsonb) holds every file ever
// uploaded; removed files stay in the list with removed: true (never deleted).
// CAPAs from before multi-evidence only have the single evidence_* columns, so
// that file is surfaced as the first item of the list.
const getEvidenceFiles = (row) => {

  if (Array.isArray(row.evidence_files)) {
    return row.evidence_files;
  }

  if (row.evidence_file_path) {
    return [
      {
        id: "legacy",
        fileName: row.evidence_file_name,
        filePath: row.evidence_file_path,
        uploadedBy: row.evidence_uploaded_by,
        uploadedAt: row.evidence_uploaded_at,
        removed: false,
      },
    ];
  }

  return [];
};

const mapCAPA = (row) => {

  if (!row) {
    return null;
  }

  return {
    id: row.id,

    auditId: row.audit_id,

    capaNo: row.capa_no,

    findingNo: row.finding_no,

    observationArea:
      row.category,

    parameter:
      row.parameter,

    observation:
      row.observation,

    rootCause:
      row.action_plan,

    preventiveAction:
      row.preventive_action,

    targetDate:
      row.target_date,

    submittedDate:
      row.submitted_date,

    // evidence:
    //   row.evidence,
    evidence: row.evidence,

    evidenceFileName:
      row.evidence_file_name,

    evidenceFilePath:
      row.evidence_file_path,

    evidenceUploadedBy:
      row.evidence_uploaded_by,

    evidenceUploadedAt:
      row.evidence_uploaded_at,

    evidenceFiles:
      getEvidenceFiles(row),

    // "Add CAPA" (extra CAPA on an existing finding, by CQA)
    description:
      row.capa_description,

    isAdditional:
      row.is_additional === true,

    // Depot "Add CAPA": extra Root Cause / Corrective Action entries.
    additionalActions:
      Array.isArray(row.additional_actions) ? row.additional_actions : [],

    cancelledBy:
      row.cancelled_by,

    cancelledAt:
      row.cancelled_at,

    cqaRemarks:
      row.reviewer_remarks,

    status:
      row.status,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
};

const getAllCAPAs = async (auditId) => {

  // if (auditId) {
  if (auditId !== undefined && auditId !== null) {

    const result = await pool.query(
      `
            SELECT *
            FROM audit_capa.capas
            WHERE audit_id = $1
            ORDER BY created_at DESC
            `,
      [auditId]
    );

    // return result.rows;
    return result.rows.map(mapCAPA);
  }

  const result = await pool.query(`
        SELECT *
        FROM audit_capa.capas
        ORDER BY created_at DESC
    `);

  // return result.rows;
  return result.rows.map(mapCAPA);
};

const normalizeDate = (value) => {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return value;
};
const createCAPAs = async (capas) => {

  const records =
    Array.isArray(capas)
      ? capas
      : [capas];

  const created = [];

  for (const capa of records) {

    const result =
      await pool.query(
        `
                INSERT INTO audit_capa.capas
                (
                    audit_id,
                    capa_no,
                    finding_no,
                    category,
                    parameter,
                    observation,
                    action_plan,
                    preventive_action,
                    target_date,
                    status,
                    capa_description,
                    is_additional
                )
                VALUES
                (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
                )
                RETURNING *
                `,
        [
          capa.auditId,
          capa.capaNo,
          capa.findingNo,
          capa.category,
          capa.parameter,
          capa.observation,
          // capa.actionPlan,
          // capa.rootCause,
          // capa.preventiveAction,
          capa.actionPlan || capa.rootCause,
          capa.responsibility || capa.preventiveAction,
          // capa.targetDate,
          normalizeDate(
            capa.targetDate
          ),
          capa.status || "Open",
          capa.description || null,
          capa.isAdditional === true ? true : null
        ]
        // [
        //   capa.auditId,
        //   capa.capaNo,
        //   capa.findingNo,
        //   capa.category,
        //   capa.parameter,
        //   capa.observation,
        //   capa.actionPlan,
        //   capa.preventiveAction,

        //   capa.targetDate &&
        //     capa.targetDate.trim() !== ""
        //     ? capa.targetDate
        //     : null,

        //   capa.status || "Open"
        // ]
      );

    // created.push(result.rows[0]);
    created.push(mapCAPA(result.rows[0]));
  }

  return created;
};

const updateCAPA = async (id, changes) => {

  const result = await pool.query(
    `
      UPDATE audit_capa.capas
      SET
          action_plan = COALESCE($1, action_plan),
          preventive_action = COALESCE($2, preventive_action),
          target_date = COALESCE($3, target_date),
          status = COALESCE($4, status),
          reviewer_remarks = COALESCE($5, reviewer_remarks),
          submitted_date = COALESCE($6, submitted_date),
          additional_actions = COALESCE($8::jsonb, additional_actions),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `,
    [
      changes.rootCause ?? null,
      changes.preventiveAction ?? null,
      changes.targetDate ?? null,
      // changes.evidence ?? null,
      changes.status ?? null,
      changes.cqaRemarks ?? null,
      changes.submittedDate ?? null,
      id,
      Array.isArray(changes.additionalActions)
        ? JSON.stringify(changes.additionalActions)
        : null
    ]
  );

  return mapCAPA(result.rows[0]);
};
// evidence = COALESCE($4, evidence),
// const updateCAPA = async (
//   id,
//   changes
// ) => {

//   const result =
//     await pool.query(
//       `
//             UPDATE audit_capa.capas
//             SET
//                 action_plan=$1,
//                 preventive_action=$2,
//                 target_date=$3,
//                 evidence=$4,
//                 status=$5,
//                 reviewer_remarks=$6,
//                 submitted_date=$7,
//                 updated_at=CURRENT_TIMESTAMP
//             WHERE id=$8
//             RETURNING *
//             `,
//       [
//         // changes.actionPlan,
//         changes.rootCause,
//         changes.preventiveAction,
//         changes.targetDate,
//         changes.evidence,
//         changes.status,
//         // changes.reviewerRemarks,
//         changes.cqaRemarks,
//         changes.submittedDate,
//         id
//       ]
//     );

//   // return result.rows[0];
//   return mapCAPA(result.rows[0]);
// };

const updateCAPAs = async (
  capaData
) => {

  const { rows } = await pool.query(
    `
        UPDATE audit_capa.capas
        SET
            category = $1,
            parameter = $2,
            observation = $3,
            action_plan = $4,
            preventive_action = $5,
            target_date = $6,
            status = $7
        WHERE id = $8
        RETURNING *;
        `,
    [
      capaData.category,
      capaData.parameter,
      capaData.observation,
      // capaData.actionPlan,
      capaData.rootCause,
      capaData.preventiveAction,
      // capaData.targetDate,
      normalizeDate(capaData.targetDate),
      capaData.status,
      capaData.id
    ]
  );

  if (rows.length === 0) {
    return null;
  }

  // return rows[0];
  return mapCAPA(rows[0]);
};

const updateCAPAEvidence = async (
  id,
  evidence
) => {

  const result =
    await pool.query(
      `
        UPDATE audit_capa.capas
        SET
          evidence_file_name = $1,
          evidence_file_path = $2,
          evidence_uploaded_by = $3,
          evidence_uploaded_at = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `,
      [
        evidence.fileName,
        evidence.filePath,
        evidence.uploadedBy,
        evidence.uploadedAt,
        id
      ]
    );

  return mapCAPA(
    result.rows[0]
  );
};

// Soft cancel of an added CAPA (never deleted). Only CAPAs created through
// "Add CAPA" can be cancelled, and not once Closed.
const cancelCAPA = async (id, cancelledBy) => {

  const { rows } = await pool.query(
    `
      UPDATE audit_capa.capas
      SET
        status = 'Cancelled',
        cancelled_by = $1,
        cancelled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
        AND is_additional = TRUE
        AND status NOT IN ('Closed', 'Cancelled')
      RETURNING *
    `,
    [cancelledBy || "", id]
  );

  return mapCAPA(rows[0]);
};

// Read-modify-write of the evidence list under a row lock, so two uploads
// landing together can't overwrite each other's files.
const withLockedEvidence = async (id, mutate) => {

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      "SELECT * FROM audit_capa.capas WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const { files, legacy } =
      mutate(getEvidenceFiles(rows[0]));

    // Legacy single-evidence columns keep pointing at the latest upload so
    // anything still reading them keeps working; nothing is ever cleared.
    const result = legacy
      ? await client.query(
        `
          UPDATE audit_capa.capas
          SET
            evidence_files = $1::jsonb,
            evidence_file_name = $2,
            evidence_file_path = $3,
            evidence_uploaded_by = $4,
            evidence_uploaded_at = $5,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
          RETURNING *
        `,
        [
          JSON.stringify(files),
          legacy.fileName,
          legacy.filePath,
          legacy.uploadedBy,
          legacy.uploadedAt,
          id,
        ]
      )
      : await client.query(
        `
          UPDATE audit_capa.capas
          SET
            evidence_files = $1::jsonb,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `,
        [JSON.stringify(files), id]
      );

    await client.query("COMMIT");

    return mapCAPA(result.rows[0]);

  } catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    throw error;
  } finally {
    client.release();
  }
};

const addCAPAEvidenceFiles = (id, newFiles, maxActive) =>
  withLockedEvidence(id, (current) => {

    const activeCount =
      current.filter((file) => !file.removed).length;

    if (activeCount + newFiles.length > maxActive) {
      const error = new Error(
        `A CAPA can have at most ${maxActive} evidence files (${activeCount} already attached).`
      );
      error.status = 400;
      throw error;
    }

    return {
      files: [...current, ...newFiles],
      legacy: newFiles[newFiles.length - 1],
    };
  });

const removeCAPAEvidenceFile = (id, fileId, removedBy) =>
  withLockedEvidence(id, (current) => {

    if (!current.some((file) => String(file.id) === String(fileId))) {
      const error = new Error("Evidence file not found.");
      error.status = 404;
      throw error;
    }

    return {
      files: current.map((file) =>
        String(file.id) === String(fileId)
          ? {
            ...file,
            removed: true,
            removedBy,
            removedAt: new Date().toISOString(),
          }
          : file
      ),
      legacy: null,
    };
  });

const deleteCAPAsByAudit = async (auditId) => {

  const result = await pool.query(
    `
    DELETE FROM audit_capa.capas
    WHERE audit_id = $1
    RETURNING id
    `,
    [auditId]
  );

  return result.rowCount;
};

module.exports = {
  getAllCAPAs,
  createCAPAs,
  updateCAPA,
  updateCAPAs,
  updateCAPAEvidence,
  addCAPAEvidenceFiles,
  removeCAPAEvidenceFile,
  cancelCAPA,
  deleteCAPAsByAudit
};
