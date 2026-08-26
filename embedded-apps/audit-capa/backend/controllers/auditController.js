// const auditModel = require("../models/auditModel");

// const getAudits = (req, res) => {
//   try {
//     res.json(auditModel.getAllAudits());
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error fetching audits" });
//   }
// };

// const getAudit = (req, res) => {
//   try {
//     const audit = auditModel.getAuditById(req.params.id);

//     if (!audit) {
//       return res.status(404).json({ message: "Audit not found" });
//     }

//     res.json(audit);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error fetching audit" });
//   }
// };

// const createAudit = (req, res) => {
//   try {
//     if (!req.body || typeof req.body !== "object") {
//       return res.status(400).json({ message: "Audit payload is required" });
//     }

//     const audit = auditModel.createAudit(req.body);
//     res.status(201).json(audit);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error creating audit" });
//   }
// };

// const updateAudit = (req, res) => {
//   try {
//     const audit = auditModel.updateAudit(req.params.id, req.body || {});

//     if (!audit) {
//       return res.status(404).json({ message: "Audit not found" });
//     }

//     res.json(audit);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error updating audit" });
//   }
// };

// const deleteAudit = (req, res) => {
//   try {
//     const deleted = auditModel.deleteAudit(req.params.id);

//     if (!deleted) {
//       return res.status(404).json({ message: "Audit not found" });
//     }

//     res.status(204).send();
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Error deleting audit" });
//   }
// };

// module.exports = {
//   getAudits,
//   getAudit,
//   createAudit,
//   updateAudit,
//   deleteAudit,
// };

const auditModel = require("../models/auditModel");

const getAudits = async (req, res) => {
  try {
    const audits = await auditModel.getAllAudits();
    res.json(audits);
  } catch (error) {
    console.error("Error fetching audits:", error);
    res.status(500).json({
      message: "Error fetching audits"
    });
  }
};

const getAudit = async (req, res) => {
  try {
    const audit = await auditModel.getAuditById(req.params.id);

    if (!audit) {
      return res.status(404).json({
        message: "Audit not found"
      });
    }

    res.json(audit);
  } catch (error) {
    console.error("Error fetching audit:", error);

    res.status(500).json({
      message: "Error fetching audit"
    });
  }
};

const createAudit = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        message: "Audit payload is required"
      });
    }

    const audit =
      await auditModel.createAudit(req.body);

    res.status(201).json(audit);

  }
  // catch (error) {
  //   console.error("Error creating audit:", error);

  //   res.status(500).json({
  //     message: "Error creating audit"
  //   });
  // }
  catch (error) {

    console.error(
      "CREATE AUDIT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateAudit = async (req, res) => {
  try {
    const audit =
      await auditModel.updateAudit(
        req.params.id,
        req.body || {}
      );

    if (!audit) {
      return res.status(404).json({
        message: "Audit not found"
      });
    }

    res.json(audit);

  } catch (error) {
    console.error("Error updating audit:", error);

    res.status(500).json({
      message: "Error updating audit"
    });
  }
};

const deleteAudit = async (req, res) => {
  try {
    const deleted =
      await auditModel.deleteAudit(
        req.params.id
      );

    if (!deleted) {
      return res.status(404).json({
        message: "Audit not found"
      });
    }

    res.status(204).send();

  } catch (error) {
    console.error("Error deleting audit:", error);

    res.status(500).json({
      message: "Error deleting audit"
    });
  }
};

module.exports = {
  getAudits,
  getAudit,
  createAudit,
  updateAudit,
  deleteAudit
};
