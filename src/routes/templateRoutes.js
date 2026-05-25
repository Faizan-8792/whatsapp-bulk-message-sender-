const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  listTemplates,
  saveTemplate,
  applyTemplate,
  deleteTemplate,
  clearTemplates,
} = require("../controllers/templateController");

const router = express.Router();

router.use(requireAuth);
router.get("/", listTemplates);
router.post("/", saveTemplate);
router.delete("/clear-all", clearTemplates);
router.get("/:templateId", applyTemplate);
router.delete("/:templateId", deleteTemplate);

module.exports = router;
