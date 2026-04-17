import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceService } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";
import { socket } from "../services/api";

export const useNodes = (searchQuery: string = "") => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ✅ FIX #10: PROPER SOCKET HANDLING (NO STATE OVERWRITES)
  // BEFORE: Any telemetry_update → invalidates entire ["nodes"] → triggers full re-fetch
  //         Multiple devices with telemetry = multiple invalidations = race conditions
  // AFTER: Socket events update state GRANULARLY (merge, don't replace)
  useEffect(() => {
    // Handle device:added (new device created)
    const handleDeviceAdded = (data: any) => {
      queryClient.setQueryData(["nodes", searchQuery, user?.id, user?.role], (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        
        // Check if device already exists (prevent duplicates)
        const exists = oldData.some((n: any) => n.id === data.device?.id);
        if (exists) return oldData;
        
        console.log(`[useNodes] 📝 Adding new device: ${data.device?.id}`);
        return [...oldData, data.device];
      });
    };

    // Handle device:deleted
    const handleDeviceDeleted = (data: any) => {
      queryClient.setQueryData(["nodes", searchQuery, user?.id, user?.role], (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        console.log(`[useNodes] 🗑️  Removing device: ${data.deviceId}`);
        return oldData.filter((n: any) => n.id !== data.deviceId);
      });
    };

    // Handle device:updated (configuration changes or telemetry data)
    const handleDeviceUpdated = (data: any) => {
      queryClient.setQueryData(["nodes", searchQuery, user?.id, user?.role], (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        
        return oldData.map((n: any) => {
          if (n.id === data.deviceId) {
            console.log(`[useNodes] 📞 Device updated: ${data.deviceId}`, data.changes || data);
            
            // Handle both update formats:
            // 1. From updateNode: { deviceId, changes: {...}, timestamp }
            // 2. From telemetry: { deviceId, telemetry, status, ... }
            const updates = data.changes || data;
            
            return {
              ...n,
              ...updates,  // Merge configuration changes (device_name, label, etc)
              telemetry_snapshot: {
                ...(n.telemetry_snapshot || {}),
                // If telemetry object exists, merge it separately
                ...(data.telemetry || data.telemetry_snapshot || {})
              },
              last_seen: data.timestamp || data.lastUpdatedAt || n.last_seen,
              status: data.status || n.status
            };
          }
          return n;
        });
      });
    };

    // Handle device:status-changed (device went online/offline)
    const handleStatusChanged = (data: any) => {
      queryClient.setQueryData(["nodes", searchQuery, user?.id, user?.role], (oldData: any) => {
        if (!oldData || !Array.isArray(oldData)) return oldData;
        
        return oldData.map((n: any) => {
          if (n.id === data.deviceId) {
            console.log(`[useNodes] 🔴 Status changed: ${data.deviceId} ${data.oldStatus} → ${data.newStatus}`);
            return {
              ...n,
              status: data.newStatus,
              last_updated_at: data.lastUpdated || data.timestamp,
              last_seen: data.lastUpdated || data.timestamp,
              telemetry_snapshot: {
                ...(n.telemetry_snapshot || {}),
                status: data.newStatus,
                lastUpdated: data.timestamp
              }
            };
          }
          return n;
        });
      });
    };

    socket.on("device:added", handleDeviceAdded);
    socket.on("device:deleted", handleDeviceDeleted);
    socket.on("device:updated", handleDeviceUpdated);
    socket.on("device:status-changed", handleStatusChanged);  // Real-time status sync
    socket.on("telemetry_update", handleDeviceUpdated);  // Also handle old event name

    return () => {
      socket.off("device:added", handleDeviceAdded);
      socket.off("device:deleted", handleDeviceDeleted);
      socket.off("device:updated", handleDeviceUpdated);
      socket.off("device:status-changed", handleStatusChanged);
      socket.off("telemetry_update", handleDeviceUpdated);
    };
  }, [queryClient, searchQuery, user?.id, user?.role]);

  const {
    data: nodes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["nodes", searchQuery, user?.id, user?.role],
    queryFn: async () => {
      const isSuperAdmin = user?.role === "superadmin";
      const mappedNodes = await deviceService.getMapNodes(
        undefined,
        isSuperAdmin ? undefined : user?.id,
      );
      
      console.log(`[useNodes] ✅ Received ${mappedNodes.length} devices from backend`, 
        mappedNodes.map((n: any) => ({ id: n.id, label: n.label, type: n.analytics_template })));

      if (!searchQuery) return mappedNodes;

      const searchLower = searchQuery.toLowerCase();
      return mappedNodes.filter(
        (n: any) =>
          (n.displayName || "").toLowerCase().includes(searchLower) ||
          (n.hardwareId || "").toLowerCase().includes(searchLower) ||
          (n.label || "").toLowerCase().includes(searchLower) ||
          (n.id || "").toLowerCase().includes(searchLower),
      );
    },
    refetchInterval: 12000, // Balanced: fetch every 12 seconds (not too aggressive)
    staleTime: 5000, // Data becomes stale after 5 seconds
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    nodes,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh: refetch,
  };
};
