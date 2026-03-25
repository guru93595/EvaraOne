const router = require("express").Router();
const {
    createZone, getZones, getZoneById, updateZone, deleteZone,
    createCustomer, getCustomers, getCustomerById, updateCustomer, deleteCustomer,
    createNode, updateNode, deleteNode,
    getDashboardSummary, getZoneStats, getHierarchy, getAuditLogs
} = require("../controllers/admin.controller.js");

// Zones
router.post("/zones", createZone);
router.get("/zones", getZones);
router.get("/zones/:id", getZoneById);
router.put("/zones/:id", updateZone);
router.delete("/zones/:id", deleteZone);

// Customers
router.post("/customers", createCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);

// Nodes
router.post("/nodes", createNode);
router.put("/nodes/:id", updateNode);
router.delete("/nodes/:id", deleteNode);

module.exports = router;
