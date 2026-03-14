import api from "./api";
import { computeDeviceStatus } from "./DeviceService";

export async function getAllNodes() {
    try {
        const response = await api.get("/nodes");
        const allNodes = response.data;
        
        if (!Array.isArray(allNodes)) return [];

        return allNodes.map((data: any) => {
            const docId = data.id || data.hardwareId || data.node_id;
            const cap = data.capacity || data.tank_size;
            const assetType = (data.device_type || data.assetType || data.asset_type || "tank").toLowerCase();
            
            return {
                ...data,
                id: docId,
                firestore_id: docId,
                hardwareId: data.node_id || data.hardwareId || docId,
                label: data.label || data.displayName || data.name || "Unnamed Node",
                name: data.label || data.displayName || data.display_name || data.name || data.hardwareId || docId,
                status: computeDeviceStatus(data.last_online_at || data.last_seen || null, docId),
                asset_type: assetType,
                device_type: data.device_type || data.assetType || "tank",
                analytics_template: data.analytics_template || data.analyticsTemplate || (
                    assetType === "evaratank" ? "EvaraTank" : 
                    assetType === "evaradeep" ? "EvaraDeep" : 
                    assetType === "evaraflow" ? "EvaraFlow" : "EvaraTank"
                ),
                node_id: data.node_id || data.hardwareId || docId,
                node_key: data.node_id || data.hardwareId || docId,
                capacity: cap ? (String(cap).includes('L') ? cap : `${cap}L`) : "N/A",
                location_name: data.location_name || data.community_name || data.zone_name || (data.community_id || data.zone_id ? "Main Site" : "General Area"),
                community_name: data.community_name,
                zone_name: data.zone_name,
                communityId: data.community_id || data.communityId,
                zoneId: data.zone_id || data.zoneId,
                last_telemetry: data.last_telemetry || {
                    Level: data.last_level || 0,
                    Battery: data.battery_voltage || "4.2V",
                    Signal: data.signal_strength || "Good"
                }
            };
        });
    } catch (error) {
        console.error("Failed to fetch nodes from API", error);
        return [];
    }
}

// Replaced onSnapshot with polling approach for components that need it
export function subscribeToNodes(callback: (nodes: any[]) => void) {
    let timeoutId: any;
    
    const poll = async () => {
        try {
            const nodes = await getAllNodes();
            callback(nodes);
        } catch(error) {
            console.error("Polling nodes failed", error);
        }
        timeoutId = setTimeout(poll, 15000); // 15 seconds polling
    };
    
    poll();
    
    return () => clearTimeout(timeoutId); // return unsubscribe function
}

export const getNodeAnalytics = async (nodeId: string) => {
    const res = await api.get(`/nodes/${nodeId}/analytics`);
    return res.data;
};

export const getNodeTelemetry = async (nodeId: string) => {
    const res = await api.get(`/nodes/${nodeId}/telemetry`);
    return res.data;
};
