import { useQuery } from "@tanstack/react-query";
import { deviceService, computeDeviceStatus } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";

// Map Firestore assetType → NodeCategory for AllNodes display
function mapCategory(assetType: string | null | undefined): string {
  if (!assetType) return "OHT";
  const t = assetType.toLowerCase();
  if (t === "evaratank" || t === "tank" || t === "oht") return "OHT";
  if (t === "evaradeep" || t === "borewell" || t === "deep" || t === "well")
    return "Borewell";
  if (
    t === "evaraflow" ||
    t === "flow" ||
    t === "flow_meter" ||
    t === "pumphouse"
  )
    return "FlowMeter";
  if (t === "sump") return "Sump";
  return "OHT";
}

// Map Firestore assetType → analytics_template for filtering
function mapAnalyticsTemplate(assetType: string | null | undefined): "EvaraTank" | "EvaraDeep" | "EvaraFlow" {
  if (!assetType) return "EvaraTank";
  const t = assetType.toLowerCase();
  
  // Standardized mappings to match ANALYTICS_CONFIG keys in AllNodes.tsx
  if (t === "evaratank" || t.includes("tank") || t === "oht" || t === "sump" || t === "level") return "EvaraTank";
  if (t === "evaradeep" || t.includes("deep") || t.includes("bore") || t.includes("well") || t === "depth") return "EvaraDeep";
  if (t === "evaraflow" || t.includes("flow") || t.includes("pump") || t.includes("meter")) return "EvaraFlow";
  
  return "EvaraTank";
}

// Helper to filter out ID-looking strings from display labels
function cleanLabel(val: string | null | undefined): string | null {
  if (!val) return null;
  // If it looks like a Firebase ID or MongoDB ID (alphanumeric, 20+ chars)
  if (/^[a-zA-Z0-9]{20,}$/.test(val)) return null;
  // If it looks like a short hex ID
  if (/^[a-fA-F0-9]{6,12}$/.test(val)) return null;
  return val;
}

export const useNodes = (searchQuery: string = "") => {
  const { user } = useAuth();

  const {
    data: nodes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["nodes", searchQuery, user?.id, user?.role],
    queryFn: async () => {
      // Superadmin sees ALL nodes — do NOT filter by customerId
      // Regular customers only see their own nodes
      const isSuperAdmin = user?.role === "superadmin";
      const rawNodes = await deviceService.getMapNodes(
        undefined,
        isSuperAdmin ? undefined : user?.id,
      );

      let filteredNodes = rawNodes || [];
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        filteredNodes = filteredNodes.filter(
          (n: any) =>
            (n.displayName || "").toLowerCase().includes(searchLower) ||
            (n.hardwareId || "").toLowerCase().includes(searchLower) ||
            (n.label || "").toLowerCase().includes(searchLower) ||
            (n.id || "").toLowerCase().includes(searchLower),
        );
      }

      // FIX 2: Map Firestore schema (Support new standardized fields)
      return filteredNodes.map((d: any) => ({
        id: d.id, // Primary ID MUST be the Firestore doc ID for API calls
        firestore_id: d.id,
        node_key: d.node_id || d.hardwareId || d.hardware_id || d.id || "",
        hardwareId: d.node_id || d.hardwareId || d.hardware_id || d.id,
        label: d.label || d.displayName || `${String(mapCategory(d.device_type || d.assetType || d.asset_type)).replace('OHT', 'Overhead Tank')} Node`,
        name: d.label || d.displayName || "Unnamed Node",
        analytics_template: (String(d.analytics_template).toLowerCase() === "evaratank" || String(d.analytics_template).toLowerCase() === "tank") ? "EvaraTank" :
                            (String(d.analytics_template).toLowerCase() === "evaradeep" || String(d.analytics_template).toLowerCase() === "deep") ? "EvaraDeep" :
                            (String(d.analytics_template).toLowerCase() === "evaraflow" || String(d.analytics_template).toLowerCase() === "flow") ? "EvaraFlow" :
                            mapAnalyticsTemplate(d.analytics_template || d.device_type || d.assetType || d.asset_type),
        asset_type: (d.device_type || d.asset_type || d.assetType || "tank").toLowerCase(),
        category: mapCategory(d.device_type || d.assetType || d.asset_type),
        status: computeDeviceStatus(d.last_seen || d.updated_at || d.created_at || d.updatedAt),
        latitude: d.latitude,
        longitude: d.longitude,
        is_active: d.is_active ?? (computeDeviceStatus(d.last_seen || d.updated_at || d.updatedAt) === "Online"),
        capacity: d.capacity || d.tank_size ? (String(d.capacity || d.tank_size).includes('L') ? (d.capacity || d.tank_size) : `${d.capacity || d.tank_size}L`) : null,
        location_name: cleanLabel(d.location_name) || cleanLabel(d.community_name) || cleanLabel(d.zone_name) || (d.community_id || d.zone_id ? "Main Site" : "General Area"),
        community_id: d.community_id || d.communityId,
        customer_id: d.customer_id || d.customerId,
        zone_id: d.zone_id || d.zoneId,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
    },
    staleTime: 1000 * 60 * 5, // 5 minutes stale (saves reads)
    gcTime: 1000 * 60 * 10, // 10 minutes cache
    retry: 1,
  });

  // Removed Firestore onSnapshot listener — it was causing constant cache invalidations
  // and burning through Firestore read quota. Data refreshes on navigation instead.

  return {
    nodes,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh: refetch,
  };
};
