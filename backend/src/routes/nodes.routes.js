const router = require("express").Router();
const { getNodes, getNodeById, getNodeTelemetry, getNodeAnalytics } = require("../controllers/nodes.controller.js");

router.get("/", getNodes);
router.get("/:id", getNodeById);
router.get("/:id/telemetry", getNodeTelemetry);
router.get("/:id/analytics", getNodeAnalytics);

module.exports = router;
