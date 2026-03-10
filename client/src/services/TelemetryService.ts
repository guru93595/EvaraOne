import api from "./api";

export interface TelemetryData {
  timestamp: string;
  values: Record<string, number | string | null>;
  deviceId: string;

  // Typed Fields (Phase 1 Alignment)
  level_percentage?: number | null;
  depth_value?: number | null;
  temperature_value?: number | null;
  flow_rate?: number | null;
  total_liters?: number | null;

  // Normalized Fields (Harden Phase)
  temperature?: number | null;
  humidity?: number | null;
  battery_level?: number | null;
  signal_strength?: number | null;

  // Calculation fields
  waterLevel?: number;
  distance?: number;
}

export interface DeviceMetadata {
  id: string;
  node_key: string | null;
  classification: string;
}

class TelemetryService {
  private static instance: TelemetryService;

  private constructor() { }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Complete Telemetry Pipeline: ThingSpeak -> Processing -> Structured UI Result
   */
  public async getTelemetry(
    channelId: string,
    readApiKey: string,
    mode: "tank" | "flow" | "raw" = "tank",
    tankHeight = 1.2,
    results = 50,
    fieldKey = "field1",
    capacity = 1000
  ) {

    try {
      // 1. Fetch from ThingSpeak Directly
      const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${readApiKey}&results=${results}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`ThingSpeak API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const feeds = data.feeds || [];

      if (feeds.length === 0) {
        return { percentage: 0, waterLevel: 0, distance: 0, currentVolume: 0, feeds: [] };
      }

      // 2. Process Feeds based on Mode
      const tankHeightCm = (tankHeight || 1.2) * 100;

      const processedFeeds = feeds.map((feed: any) => {
        const rawValue = feed[fieldKey] ?? feed.field1 ?? 0;
        const val = parseFloat(String(rawValue));

        if (mode === "tank") {
          const distance = val;
          const waterLevelCm = Math.max(0, tankHeightCm - distance);
          const percentage = Math.min(100, Math.max(0, (waterLevelCm / tankHeightCm) * 100));
          const currentVolume = (percentage / 100) * capacity;

          return {
            timestamp: feed.created_at,
            distance: distance,
            waterLevel: waterLevelCm,
            percentage: parseFloat(percentage.toFixed(2)),
            currentVolume: parseFloat(currentVolume.toFixed(2)),
            totalLiters: parseFloat(currentVolume.toFixed(2)),
            raw: feed
          };
        } else {
          // Flow or Raw mode
          return {
            timestamp: feed.created_at,
            value: val,
            percentage: val, // fallback
            currentVolume: val, // fallback
            totalLiters: val, // for flow meters calculating total over time
            raw: feed
          };
        }
      });

      const latest = processedFeeds[processedFeeds.length - 1];

      return {
        ...latest,
        feeds: processedFeeds,
        raw: latest.raw
      };

    } catch (err: any) {
      console.error(`[TelemetryService] ERROR during pipeline execution:`, err.message);
      console.error(`[TelemetryService] Context: channelId=${channelId}, fieldKey=${fieldKey}`);
      throw err;
    }
  }

  /**
   * Fetches real-time telemetry from the hardened FastAPI gateway.
   */
  public async getLiveTelemetry(
    deviceId: string,
  ): Promise<TelemetryData | null> {
    try {
      // Use the actual backend endpoint that exists
      const response = await api.get(`/nodes/${deviceId}/telemetry`);
      const data = response.data;

      if (!data) return null;

      return {
        timestamp: data.last_seen || data.timestamp || new Date().toISOString(),
        values: data.raw_data || data,
        deviceId: deviceId,
        level_percentage: data.level_percentage ?? null,
        depth_value: data.distance ?? null,
        temperature_value: null,
        flow_rate: null,
        total_liters: data.volume ?? null,
        distance: data.distance,
        waterLevel: data.level_percentage,
      };
    } catch (err) {
      console.error(
        "[TelemetryService] Live telemetry fetch failed for",
        deviceId,
        ":",
        err,
      );
      return null;
    }
  }

  /**
   * Fetches historical telemetry from the hardened FastAPI gateway.
   */
  public async getHistoryTelemetry(
    deviceId: string,
  ): Promise<TelemetryData[] | null> {
    try {
      // Use the actual backend endpoint that exists
      const response = await api.get(`/nodes/${deviceId}/analytics`);
      const rawData = response.data;

      if (!rawData || !rawData.history) return null;

      return rawData.history.map((feed: any) => ({
        timestamp: feed.timestamp || feed.created_at,
        values: feed,
        deviceId: deviceId,
        level_percentage: feed.level ?? null,
        total_liters: feed.volume ?? null,
      }));
    } catch (err) {
      console.error(
        "[TelemetryService] History fetch failed for",
        deviceId,
        ":",
        err,
      );
      return null;
    }
  }

  /**
   * Clears local state.
   */
  public clearCache(): void {
  }
}

export const telemetryService = TelemetryService.getInstance();
