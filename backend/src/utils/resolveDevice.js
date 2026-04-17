/**
 * ✅ AUDIT FIX L2: Shared Device Resolution Utility
 * 
 * Resolves a device by document ID, device_id (hardware ID), or node_id.
 * Previously duplicated in admin.controller.js, nodes.controller.js, and tds.controller.js.
 * Now single source of truth.
 * 
 * @param {string} id - Document ID, device_id, or node_id
 * @returns {DocumentSnapshot|null} Firestore document snapshot or null
 */

const { db } = require("../config/firebase.js");

async function resolveDevice(id) {
    if (!id) return null;

    // 1. Try direct document lookup (fastest — indexed by default)
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;

    // 2. Query by device_id field (human-readable hardware ID)
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];

    // 3. Fallback to node_id
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];

    return null;
}

module.exports = resolveDevice;
