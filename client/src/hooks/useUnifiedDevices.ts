import { useQuery } from '@tanstack/react-query';
import { deviceService } from '../services/DeviceService';
import type { Device } from '../types/entities';

export interface DeviceWithRelations extends Device {
  telemetry_snapshots?: {
    last_timestamp: string | null;
    level_percentage: number | null;
    depth_value: number | null;
    flow_rate: number | null;
    total_liters: number | null;
  } | null;
}

export interface MapDevice {
  id: string;
  name: string | null;
  label: string | null;
  node_key: string | null;
  asset_type: string | null;
  asset_category: string | null;
  analytics_template: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: string | null;
  specifications: string | null;
  status: string;
  last_seen: string | null;
  telemetry_snapshot?: any;
}

export const useUnifiedDevices = (searchQuery: string = '') => {
  return useQuery({
    queryKey: ['unified_devices', searchQuery],
    queryFn: async () => {
      const allNodes = await deviceService.getMapDevices();

      let filtered = allNodes || [];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(d =>
          (d.label?.toLowerCase().includes(q)) ||
          (d.node_key?.toLowerCase().includes(q))
        );
      }
      return filtered as any[];
    },
    staleTime: 1000 * 60 * 2,
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const useDeviceById = (id: string | undefined) => {
  return useQuery({
    queryKey: ['device', id],
    queryFn: async () => {
      if (!id) return null;
      return await deviceService.getDeviceDetails(id);
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
    retry: 2,
    refetchOnWindowFocus: false,
  });
};

export const transformToMapDevice = (device: any): MapDevice => {
  return {
    id: device.id,
    name: device.name || device.label || 'Unnamed',
    label: device.label,
    node_key: device.node_key,
    asset_type: device.asset_type,
    asset_category: null,
    analytics_template: device.analytics_template,
    latitude: device.latitude,
    longitude: device.longitude,
    capacity: null,
    specifications: null,
    status: device.status || 'Offline',
    last_seen: device.last_seen,
    telemetry_snapshot: device.telemetry_snapshot
  };
};
