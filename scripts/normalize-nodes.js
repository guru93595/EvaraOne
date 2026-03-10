const admin = require('firebase-admin');

// IMPORTANT: This script requires a service account JSON file to run locally.
// For automated architectural completion, I am writing this script so the user
// can execute it locally once they export their serviceAccountKey.json from Firebase Auth.

console.log("To run this normalization script, initialize firebase-admin with your service account credentials.");

async function normalizeNodes() {
    const db = admin.firestore();
    console.log("Starting node schema normalization...");

    const snapshot = await db.collection('nodes').get();
    let updatedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let needsUpdate = false;
        let updatePayload = {};

        // Normalize hardwareId
        const newHardwareId = data.hardwareId || data.node_key || data.nodeId || doc.id;
        if (newHardwareId !== data.hardwareId || data.node_key || data.nodeId) {
            updatePayload.hardwareId = newHardwareId;
            updatePayload.node_key = admin.firestore.FieldValue.delete();
            updatePayload.nodeId = admin.firestore.FieldValue.delete();
            needsUpdate = true;
        }

        // Normalize displayName
        const newDisplayName = data.displayName || data.name || data.label || 'Unnamed Node';
        if (newDisplayName !== data.displayName || data.name || data.label) {
            updatePayload.displayName = newDisplayName;
            updatePayload.name = admin.firestore.FieldValue.delete();
            updatePayload.label = admin.firestore.FieldValue.delete();
            needsUpdate = true;
        }

        // Normalize foreign keys
        const newCustomerId = data.customerId || data.customer_id;
        if (data.customer_id) {
            updatePayload.customerId = newCustomerId;
            updatePayload.customer_id = admin.firestore.FieldValue.delete();
            needsUpdate = true;
        }

        if (needsUpdate) {
            await doc.ref.update(updatePayload);
            updatedCount++;
            console.log(`Normalized node ${doc.id}`);
        }
    }

    console.log(`Normalization complete. Updated ${updatedCount} nodes.`);
}

// normalizeNodes().catch(console.error);
