const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { listLogs, retryFailedFromLog } = require("../controllers/logController");

const router = express.Router();

router.use(requireAuth);
router.get("/", listLogs);
router.post("/:logId/retry-failed", retryFailedFromLog);

module.exports = router;
