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
  deleteCAPAsForAudit
};