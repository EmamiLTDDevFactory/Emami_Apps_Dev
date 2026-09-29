// const capaModel = require("../models/capaModel");

// const getCAPAs = (req, res) => {
//   try {
//     res.json(capaModel.getAllCAPAs(req.query.auditId));
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error fetching CAPAs" });
//   }
// };

// const replaceCAPAs = (req, res) => {
//   try {
//     res.json(capaModel.upsertCAPAs(req.body));
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error saving CAPAs" });
//   }
// };

// const createCAPAs = (req, res) => {
//   try {
//     const capas = capaModel.createCAPAs(req.body);
//     res.status(201).json(capas);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error creating CAPAs" });
//   }
// };

// const updateCAPA = (req, res) => {
//   try {
//     const capa = capaModel.updateCAPA(req.params.id, req.body || {});

//     if (!capa) {
//       return res.status(404).json({ message: "CAPA not found" });
//     }

//     res.json(capa);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error updating CAPA" });
//   }
// };

// module.exports = {
//   getCAPAs,
//   replaceCAPAs,
//   createCAPAs,
//   updateCAPA,
// };

const capaModel = require("../models/capaModel");

const getCAPAs = async (req, res) => {
  try {

    // const capas =
    //   await capaModel.getAllCAPAs(
    //     req.query.auditId
    //   );
    const { auditId } = req.query;

    const capas = await capaModel.getAllCAPAs(auditId);

    res.json(capas);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error fetching CAPAs"
    });
  }
};

const createCAPAs = async (req, res) => {
  try {

    const capas =
      await capaModel.createCAPAs(
        req.body
      );

    res.status(201).json(capas);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error creating CAPAs"
    });
  }
};

const updateCAPA = async (req, res) => {
  try {

    const capa =
      await capaModel.updateCAPA(
        req.params.id,
        req.body || {}
      );

    if (!capa) {
      return res.status(404).json({
        message: "CAPA not found"
      });
    }

    res.json(capa);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Error updating CAPA"
    });
  }
};

/* =====================================================
   UPLOAD CAPA EVIDENCE
   ===================================================== */

const uploadCAPAEvidenceController = async (
  req,
  res
) => {

  try {

    const capaId = req.params.id;

    // Check whether a file was actually uploaded
    if (!req.file) {

      return res.status(400).json({
        message: "Evidence file is required."
      });

    }

    const uploadedBy =
      req.body.uploadedBy || "Depot";

    const evidenceData = {

      fileName:
        req.file.originalname,

      filePath:
        `/uploads/capa-evidence/${req.file.filename}`,

      uploadedBy,

      uploadedAt:
        new Date()
    };

    const updatedCAPA =
      await capaModel.updateCAPAEvidence(
        capaId,
        evidenceData
      );

    if (!updatedCAPA) {

      return res.status(404).json({
        message: "CAPA not found"
      });

    }

    res.status(200).json(
      updatedCAPA
    );

  } catch (error) {

    console.error(
      "Evidence upload error:",
      error
    );

    res.status(500).json({
      message:
        "Unable to upload evidence."
    });
  }
};

/* =====================================================
   MULTI-EVIDENCE: add files / hide a file
   ===================================================== */

const { MAX_EVIDENCE_FILES } =
  require("../middleware/uploadCAPAEvidence");

const toEvidenceMeta = (file, folder, uploadedBy) => ({
  id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  fileName: file.originalname,
  filePath: `/uploads/${folder}/${file.filename}`,
  mimeType: file.mimetype,
  size: file.size,
  uploadedBy,
  uploadedAt: new Date().toISOString(),
  removed: false,
});

const addCAPAEvidenceController = async (req, res) => {

  try {

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "At least one evidence file is required."
      });
    }

    const uploadedBy =
      req.body.uploadedBy || "Depot";

    const updatedCAPA =
      await capaModel.addCAPAEvidenceFiles(
        req.params.id,
        req.files.map((file) =>
          toEvidenceMeta(file, "capa-evidence", uploadedBy)
        ),
        MAX_EVIDENCE_FILES
      );

    if (!updatedCAPA) {
      return res.status(404).json({
        message: "CAPA not found"
      });
    }

    res.status(200).json(updatedCAPA);

  } catch (error) {

    console.error("Evidence upload error:", error);

    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : "Unable to upload evidence."
    });
  }
};

// Soft remove only: the file stays on disk and in evidence_files (removed: true).
const removeCAPAEvidenceController = async (req, res) => {

  try {

    const updatedCAPA =
      await capaModel.removeCAPAEvidenceFile(
        req.params.id,
        req.params.fileId,
        req.body?.removedBy || ""
      );

    if (!updatedCAPA) {
      return res.status(404).json({
        message: "CAPA not found"
      });
    }

    res.status(200).json(updatedCAPA);

  } catch (error) {

    console.error("Evidence remove error:", error);

    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : "Unable to remove evidence."
    });
  }
};

// Checklist evidence: files are stored here, and their metadata is returned for
// the frontend to keep on the question inside the audit's checklist JSON.
const uploadChecklistEvidenceController = (req, res) => {

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      message: "At least one evidence file is required."
    });
  }

  const uploadedBy =
    req.body.uploadedBy || "CQA";

  res.status(200).json(
    req.files.map((file) => ({
      ...toEvidenceMeta(file, "checklist-evidence", uploadedBy),
      auditId: Number(req.params.id),
      questionId: req.body.questionId ?? null,
    }))
  );
};

const deleteCAPAsForAudit = async (req, res) => {
  try {

    const { auditId } = req.query;

    if (!auditId) {
      return res.status(400).json({
        message: "auditId is required"
      });
    }

    const deletedCount =
      await capaModel.deleteCAPAsByAudit(auditId);

    res.json({ deletedCount });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error deleting CAPAs"
    });
  }
};

module.exports = {
  getCAPAs,
  createCAPAs,
  updateCAPA,
  uploadCAPAEvidenceController,
  addCAPAEvidenceController,
  removeCAPAEvidenceController,
  uploadChecklistEvidenceController,
  deleteCAPAsForAudit
};