const router = require("express").Router();
const { getNodes, getNodeById, getNodeTelemetry, getNodeAnalytics } = require("../controllers/nodes.controller.js");
const auditLog = require("../middleware/audit.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");

router.get("/", auditLog("VIEW_DASHBOARD"), getNodes);
router.get("/:id", auditLog("VIEW_DEVICE_DETAILS"), getNodeById);
// ─── Telemetry Gateway ───
router.get("/:id/telemetry", requireAuth, getNodeTelemetry);

// ─── Analytics ───
router.get("/:id/analytics", requireAuth, getNodeAnalytics);

module.exports = router;
