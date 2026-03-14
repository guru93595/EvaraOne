const router = require("express").Router();
const {
    createZone, getZones, getZoneById, updateZone, deleteZone,
    createCustomer, getCustomers, getCustomerById, updateCustomer, deleteCustomer,
    createCommunity, getCommunities, getCommunityById, updateCommunity, deleteCommunity,
    createNode, getNodes, updateNode, deleteNode,
    getDashboardSummary, getHierarchy, getAuditLogs, getDashboardInit
} = require("../controllers/admin.controller.js");

const validateRequest = require("../middleware/validateRequest.js");
const {
  createZoneSchema,
  createCustomerSchema,
  createCommunitySchema,
  createNodeSchema,
  updateNodeSchema
} = require("../schemas/index.schema.js");

const auditLog = require("../middleware/audit.middleware.js");

// Zones
router.post("/zones", validateRequest(createZoneSchema), auditLog("CREATE_ZONE"), createZone);
router.get("/zones", getZones);
router.get("/zones/:id", getZoneById);
router.put("/zones/:id", validateRequest(createZoneSchema), auditLog("UPDATE_ZONE"), updateZone);
router.delete("/zones/:id", auditLog("DELETE_ZONE"), deleteZone);

// Customers
router.post("/customers", validateRequest(createCustomerSchema), auditLog("CREATE_CUSTOMER"), createCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", validateRequest(createCustomerSchema), auditLog("UPDATE_CUSTOMER"), updateCustomer);
router.delete("/customers/:id", auditLog("DELETE_CUSTOMER"), deleteCustomer);

// Communities
router.post("/communities", validateRequest(createCommunitySchema), auditLog("CREATE_COMMUNITY"), createCommunity);
router.get("/communities", getCommunities);
router.get("/communities/:id", getCommunityById);
router.put("/communities/:id", validateRequest(createCommunitySchema), auditLog("UPDATE_COMMUNITY"), updateCommunity);
router.delete("/communities/:id", auditLog("DELETE_COMMUNITY"), deleteCommunity);

// Nodes
router.post("/nodes", validateRequest(createNodeSchema), auditLog("CREATE_NODE"), createNode);
router.get("/nodes", getNodes);
router.put("/nodes/:id", validateRequest(updateNodeSchema), auditLog("UPDATE_NODE"), updateNode);
router.delete("/nodes/:id", auditLog("DELETE_NODE"), deleteNode);

// Aggregate
router.get("/dashboard/init", auditLog("ADMIN_DASHBOARD_INIT"), getDashboardInit);

module.exports = router;
