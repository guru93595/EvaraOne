import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { deviceService } from "../services/DeviceService";
import { useRealtimeTelemetry } from "./useRealtimeTelemetry";
import type { Device, TelemetrySnapshot } from "../types/entities";

export interface TelemetryData {
  timestamp: string;
  data: {
    entry_id: number;
    [key: string]: any;
  };
}

export interface NodeInfoData {
  id: string;
  hardware_id: string;
  name: string;
  asset_type: string;
  last_seen: string | null;
  zone_name?: string;
  community_name?: string;
}

export interface AnalyticsData {
  device: Device | null | undefined;
  telemetry: TelemetrySnapshot | null | undefined;
  history: any[] | undefined;
  isLoading: boolean;
  error: string | null | undefined;
  // Deep Analytics compatibility
  data?: {
    config?: any;
    latest?: any;
    info?: { data: NodeInfoData };
    history?: { feeds: any[] };
  };
  refetch: () => void;
  isError: boolean;
}

export const useDeviceAnalytics = (hardwareIdOverride?: string): AnalyticsData => {
  const { hardwareId: routeHardwareId } = useParams<{ hardwareId: string }>();
  const hardwareId = hardwareIdOverride || routeHardwareId || '';

  // 1. Fetch Node Configuration from Firestore
  const {
    data: device,
    isLoading: deviceLoading,
    error: deviceError,
    refetch: refetchDevice,
    isError: isDeviceError,
  } = useQuery({
    queryKey: ["device_config", hardwareId],
    queryFn: async () => {
      if (!hardwareId) return null;
      return await deviceService.getNodeDetails(hardwareId);
    },
    enabled: !!hardwareId,
    staleTime: 1000 * 60,
  });

  // 2. Fetch Telemetry from Backend API (replacing ThingSpeak polling)
  const {
    data: telemetryResult,
    isLoading: telemetryLoading,
    error: telemetryError,
    refetch: refetchTelemetry,
    isError: isTelemetryError,
  } = useQuery({
    queryKey: ["telemetry_backend", hardwareId],
    queryFn: async () => {
      if (!hardwareId) return null;
      // Fetch from our specialized proxy endpoint which handles security & caching
      const response = await deviceService.getNodeAnalytics(hardwareId);
      return response;
    },
    enabled: !!hardwareId,
    staleTime: 1000 * 3, // 3 seconds
    refetchInterval: 5_000, // Auto-refresh every 5s for ultra-fresh analytics
    // WebSocket updates will also trigger React Query cache updates
  });

  // 3. Hook into Real-Time WebSocket Updates
  const { telemetry: realtimeData } = useRealtimeTelemetry(hardwareId);

  const isLoading = deviceLoading || telemetryLoading;
  const isError = isDeviceError || isTelemetryError;
  const error = (deviceError as any)?.message || (telemetryError as any)?.message || null;

  // Map to unified structure expected by analytics pages
  const unifiedData = useMemo(() => {
    if (!device) return undefined;

    // Derive every field with all Firestore naming variants covered
    const d = device as any;
    const conf = d.configuration || {};
    const hw = d.hardwareId || d.hardware_id || d.node_key || device.id || '';
    const displayName = d.displayName || d.display_name || d.name || d.label || hw;
    const depthM = conf.depth ?? d.depth ?? d.height_m ?? d.tankHeight ?? d.height ?? d.max_depth ?? 0;
    const lengthM = conf.tank_length ?? d.length_m ?? d.length ?? d.tankLength ?? 0;
    const breadthM = conf.tank_breadth ?? d.breadth_m ?? d.breadth ?? d.tankBreadth ?? d.width ?? 0;
    const radiusM = conf.radius ?? d.radius_m ?? d.radius ?? 0;
    const capacityLitres = conf.tank_size ?? d.capacity ?? d.capacity_liters ?? d.tank_size ?? d.tank_capacity ?? null;
    const fieldKey = d.fieldKey ?? d.water_level_field ?? d.field_key ?? 'field1';
    const channelId = d.channelId ?? d.thingspeakChannelId ?? d.thingspeak_channel_id ?? '';
    const tankShape = d.tankShape ?? d.tank_shape ?? 'rectangular';

    // Console log for debugging (as requested)

    // Use realtimeData if available, otherwise fallback to the LAST item from history (ThingSpeak order)
    const historyArr = telemetryResult?.history || [];
    const latestFromHistory = historyArr.length > 0 ? historyArr[historyArr.length - 1] : null;
    
    const latestTelemetry = realtimeData ? {
        timestamp: realtimeData.time || new Date().toISOString(),
        level_percentage: realtimeData.level_percentage ?? (realtimeData.level != null && depthM > 0 ? (realtimeData.level / depthM) * 100 : 0),
        total_liters: realtimeData.total_liters ?? realtimeData.volume ?? 0,
        data: realtimeData
    } : (latestFromHistory ? {
        timestamp: latestFromHistory.timestamp || latestFromHistory.created_at,
        level_percentage: latestFromHistory.level_percentage ?? latestFromHistory.level ?? 0,
        total_liters: latestFromHistory.total_liters ?? latestFromHistory.volume ?? 0,
        data: latestFromHistory
    } : null);

    return {
      // Config sub-object expected by serverConfigToLocal() in analytics pages
      config: {
        config: {
          ...d,
          // Explicitly set canonical field names that serverConfigToLocal reads
          thingspeak_channel_id: channelId,
          tank_shape: tankShape,
          height_m: depthM,
          depth: depthM,
          tankHeight: depthM,
          length_m: lengthM,
          breadth_m: breadthM,
          radius_m: radiusM,
          capacity_liters: capacityLitres,
          capacity: capacityLitres,
          water_level_field: fieldKey,
          fieldKey,
          // Deep analytics specific
          depth_field: fieldKey,
          total_bore_depth: d.total_bore_depth ?? d.bore_depth ?? depthM ?? 200,
          static_water_level: d.static_water_level ?? d.pump_depth ?? 180,
        }
      },
      latest: latestTelemetry,
      info: {
        data: {
          id: device.id || hw,
          hardware_id: hw,                  // ← FIX: was mapped from node_key (empty)
          name: displayName,
          asset_type: d.assetType || d.asset_type || 'Generic',
          last_seen: d.last_seen || d.updatedAt || null,
          zone_name: d.zoneName || d.zone_name,
          community_name: d.communityName || d.community_name,
        } as NodeInfoData
      },
      history: {
        feeds: telemetryResult?.history || []
      }
    };
  }, [device, telemetryResult, realtimeData]);



  return {
    device,
    telemetry: device?.telemetry_snapshot as any,
    isLoading,
    isError,
    error,
    data: unifiedData,
    history: telemetryResult?.history || [],
    refetch: () => {
      refetchDevice();
      refetchTelemetry();
    }
  };
};
