const router = require("express").Router();
const { getNodes, getNodeById, getNodeTelemetry, getNodeAnalytics, getNodeGraphData } = require("../controllers/nodes.controller.js");
const auditLog = require("../middleware/audit.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");

router.get("/", auditLog("VIEW_DASHBOARD"), getNodes);
router.get("/:id", auditLog("VIEW_DEVICE_DETAILS"), getNodeById);
router.get("/:id/telemetry", requireAuth, getNodeTelemetry);
router.get("/:id/analytics", requireAuth, getNodeAnalytics);
router.get("/:id/graph", requireAuth, getNodeGraphData);

module.exports = router;
