import * as functions from 'firebase-functions';
import axios from 'axios';
import { db, admin } from './config/firebase';

// Role Verification Helper
async function verifyRole(uid: string, allowedRoles: string[]): Promise<boolean> {
    const userDoc = await db.collection('customers').doc(uid).get();
    if (!userDoc.exists) return false;
    const role = userDoc.data()?.role;
    return allowedRoles.includes(role);
}

// Encryption helper for sensitive data
function encryptApiKey(apiKey: string): string {
    // Simple encryption for demonstration - use proper encryption in production
    return Buffer.from(apiKey).toString('base64');
}

function decryptApiKey(encryptedKey: string): string {
    // Simple decryption for demonstration - use proper decryption in production
    return Buffer.from(encryptedKey, 'base64').toString('utf-8');
}

// 1. Telemetry Proxy (Secure)
export const getTelemetry = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');

    const { nodeId, results = 100 } = data;
    if (!nodeId) throw new functions.https.HttpsError('invalid-argument', 'nodeId is required');

    // Fetch Node
    const nodeDoc = await db.collection('nodes').doc(nodeId).get();
    if (!nodeDoc.exists) throw new functions.https.HttpsError('not-found', 'Node not found');
    const nodeData = nodeDoc.data();

    // Enforce Access
    const isSuperAdmin = await verifyRole(context.auth.uid, ['superadmin']);
    if (!isSuperAdmin && nodeData?.customerId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this node');
    }

    // Fetch from ThingSpeak with secure API key handling
    const { channelId, encryptedReadApiKey } = nodeData || {};
    if (!channelId || !encryptedReadApiKey) {
        console.error(`[getTelemetry] Node ${nodeId} missing credentials`);
        throw new functions.https.HttpsError('failed-precondition', 'Node missing ThingSpeak credentials');
    }

    try {
        const readApiKey = decryptApiKey(encryptedReadApiKey);
        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=${results}`;
        
        const response = await axios.get(url);

        if (!response.data || !response.data.feeds) {
            console.warn(`[getTelemetry] No feeds returned for channel ${channelId}`);
        }

        return {
            success: true,
            feeds: response.data?.feeds || []
        };
    } catch (err: any) {
        console.error('[getTelemetry] ThingSpeak Error:', err.message);
        throw new functions.https.HttpsError('internal', `Failed to fetch telemetry: ${err.message}`);
    }
});

// 2. Create Node (Admin only - Secure)
export const createNode = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    const isAuthorized = await verifyRole(context.auth.uid, ['superadmin', 'community_admin']);
    if (!isAuthorized) throw new functions.https.HttpsError('permission-denied', 'Only admins can create nodes');

    const nodeId = data.hardwareId || data.id || data.node_key;
    if (!nodeId) throw new functions.https.HttpsError('invalid-argument', 'hardwareId is required');

    // Encrypt sensitive API keys before storing
    const encryptedReadApiKey = data.readApiKey ? encryptApiKey(data.readApiKey) : '';

    const nodeToSave = {
        displayName: data.displayName || data.name,
        hardwareId: nodeId,
        assetType: data.assetType || "EvaraTank",
        status: "online",
        latitude: Number(data.latitude) || 0,
        longitude: Number(data.longitude) || 0,
        zoneId: data.zoneId || "",
        communityId: data.communityId || "",
        customerId: data.customerId || "",
        channelId: String(data.thingspeakChannelId || data.channelId || ""),
        encryptedReadApiKey, // Store encrypted API key
        capacity: Number(data.capacity) || 0,
        tankHeight: Number(data.tankHeight || data.depth || 0),
        created_at: new Date().toISOString()
    };

    await db.collection('nodes').doc(nodeId).set(nodeToSave);

    if (nodeToSave.customerId) {
        await db.collection('customers').doc(nodeToSave.customerId).update({
            devices: admin.firestore.FieldValue.arrayUnion(nodeId)
        });
    }

    return { success: true, id: nodeId };
});

// 3. Write Audit Log
export const writeAuditLog = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');

    const logData = {
        ...data,
        user_id: context.auth.uid,
        created_at: new Date().toISOString()
    };

    await db.collection('audit_logs').add(logData);
    return { success: true };
});
