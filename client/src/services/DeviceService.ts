import api from "./api";
import type { Device } from "../types/entities";

export interface MapDevice extends Partial<Device> {
  id: string;
  name: string | null;
  status: "Online" | "Offline";
}

/**
 * Determine device online/offline status from telemetry timestamp freshness.
 */
export function computeDeviceStatus(
  lastTimestamp: string | null | undefined
): "Online" | "Offline" {
  if (!lastTimestamp) return "Offline";
  const ageMs = Date.now() - new Date(lastTimestamp).getTime();
  const thresholdMs = 1 * 60 * 60 * 1000; // 1 hour for all devices
  return ageMs < thresholdMs ? "Online" : "Offline";
}

export interface ProvisioningResult {
  success: boolean;
  message: string;
  device?: {
    id: string;
    label: string;
  };
}

class NodeService {
  private static instance: NodeService;

  private constructor() { }

  public static getInstance(): NodeService {
    if (!NodeService.instance) {
      NodeService.instance = new NodeService();
    }
    return NodeService.instance;
  }

  /**
   * Replaced onSnapshot with standard polling mechanism
   */
  subscribeToNodeUpdates(
    callback: (payload: any) => void,
    filter?: { community_id?: string },
  ) {
    let timeoutId: any;
    
    const poll = async () => {
        try {
            const nodes = await this.getMapNodes(filter?.community_id);
            // Simulate changes or just pass the whole array depending on frontend logic implementation
            nodes.forEach(node => callback(node));
        } catch(error) {
            console.error("Polling nodes failed", error);
        }
        timeoutId = setTimeout(poll, 15000); 
    };
    
    poll();
    
    return () => clearTimeout(timeoutId);
  }

  /**
   * Polling instead of onSnapshot
   */
  subscribeToNewNodes(
    callback: (payload: any) => void,
    filter?: { community_id?: string },
  ) {
    // simplified to just defer to subscribeToNodeUpdates for now
    return this.subscribeToNodeUpdates(callback, filter);
  }

  /**
   * Fetch a single node details via API.
   */
  async getNodeDetails(id: string): Promise<Device> {
    const response = await api.get(`/nodes/${id}`);
    return { id: response.data.id, ...response.data } as Device;
  }

  /**
   * Subscribe to all nodes for map display via API polling.
   */
  subscribeToMapNodes(
    callback: (nodes: MapDevice[]) => void,
    communityId?: string,
  ) {
    let timeoutId: any;
    
    const poll = async () => {
        try {
            const nodes = await this.getMapNodes(communityId);
            callback(nodes);
        } catch(error) {
           console.error("Map nodes polling error:", error);
        }
        timeoutId = setTimeout(poll, 15000); 
    };
    
    poll();
    
    return () => clearTimeout(timeoutId);
  }

  /**
   * Fetch all nodes for map display via API.
   */
  async getMapNodes(communityId?: string, customerId?: string): Promise<MapDevice[]> {
    const params: any = {};
    if (communityId) params.community_id = communityId;
    if (customerId) params.customerId = customerId;

    const response = await api.get("/nodes", { params });
    const allNodes = response.data;

    if (!Array.isArray(allNodes)) return [];

    return allNodes.map((data: any) => {
      const docId = data.id || data.hardwareId || data.node_id;
      return {
        ...data,
        id: docId, // Core identity MUST be docId for API routing
        firestore_id: docId,
        hardwareId: data.node_id || data.hardwareId || docId,
        name: data.label || data.displayName || data.display_name || data.name || data.hardwareId || docId,
        status: computeDeviceStatus(data.last_telemetry_seen || data.last_seen || data.updated_at || data.updatedAt),
        asset_type: (data.device_type || data.assetType || data.asset_type || "tank").toLowerCase(),
        analytics_template: data.analyticsTemplate || data.analytics_template || data.device_type || data.assetType || null,
      } as unknown as MapDevice;
    });
  }

  async getMapDevices(communityId?: string): Promise<MapDevice[]> {
    return this.getMapNodes(communityId);
  }

  async createNode(data: any): Promise<ProvisioningResult> {
    const response = await api.post<{ status: string; data: any }>(
      "/nodes",
      data,
    );
    return {
      success: response.data.status === "ok",
      message: response.data.status === "ok" ? "Node provisioned" : "Error",
      device: {
        id: response.data.data.id,
        label: response.data.data.displayName,
      },
    };
  }

  async exportNodeReadings(id: string): Promise<void> {
    const response = await api.get(`/reports/node/${id}/export`, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `node-readings-${id}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async getNodeAnalytics(id: string): Promise<any> {
    const response = await api.get(`/nodes/${id}/analytics`);
    return response.data;
  }

  async getNodeTelemetry(id: string): Promise<any> {
    const response = await api.get(`/nodes/${id}/telemetry`);
    return response.data;
  }
}

export const deviceService = NodeService.getInstance();
