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

// Zones
router.post("/zones", validateRequest(createZoneSchema), createZone);
router.get("/zones", getZones);
router.get("/zones/:id", getZoneById);
router.put("/zones/:id", validateRequest(createZoneSchema), updateZone);
router.delete("/zones/:id", deleteZone);

// Customers
router.post("/customers", validateRequest(createCustomerSchema), createCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id", getCustomerById);
router.put("/customers/:id", validateRequest(createCustomerSchema), updateCustomer);
router.delete("/customers/:id", deleteCustomer);

// Communities
router.post("/communities", validateRequest(createCommunitySchema), createCommunity);
router.get("/communities", getCommunities);
router.get("/communities/:id", getCommunityById);
router.put("/communities/:id", validateRequest(createCommunitySchema), updateCommunity);
router.delete("/communities/:id", deleteCommunity);

// Nodes
router.post("/nodes", validateRequest(createNodeSchema), createNode);
router.get("/nodes", getNodes);
router.put("/nodes/:id", validateRequest(updateNodeSchema), updateNode);
router.delete("/nodes/:id", deleteNode);

// Aggregate
router.get("/dashboard/init", getDashboardInit);

module.exports = router;
