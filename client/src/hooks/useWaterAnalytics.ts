import { useMemo } from 'react';

// ─── Hard limit on any pump rate — physical maximum for this system ───────────
const MAX_RATE_LPM = 500; // L/min — Guard 4

// ─── Guard 5 — Log every rejected reading ─────────────────────────────────────
function logRejected(guard: string, reason: string, values: Record<string, unknown>) {
  console.warn(`[RateGuard][${guard}] REJECTED — ${reason}`, {
    timestamp: new Date().toISOString(),
    ...values,
  });
}

export interface TankAlerts {
  lowLevel: boolean;        // level < 20%
  criticalLow: boolean;     // level < 10%
  overflow: boolean;        // level > 95%
  highDrain: boolean;       // drainRateLpm > 100 L/min
  noFill: boolean;          // level < 20% AND no refill for > 2h
  sensorFault: boolean;     // volume = 0 unexpectedly (level > 5%)
  activeCount: number;
}

export interface DeviceHealth {
  sensorOk: boolean;    // last data received within 5 minutes
  dataValid: boolean;   // 0 <= volume <= capacity
  noFault: boolean;     // no volume jump > 50% of capacity in one reading
  connected: boolean;   // device is online
  status: 'Healthy' | 'Warning' | 'Critical';
}

export interface WaterAnalytics {
  waterHeightM: number;
  waterLevelPercent: number;
  sensorDistanceM: number;
  availableWaterLiters: number;
  totalCapacityLiters: number;
  remainingCapacityLiters: number;
  fillRateLpm: number;
  drainRateLpm: number;
  todaysConsumptionLiters: number;
  peakConsumptionTime: string | null;
  peakConsumptionRateLpm: number | null;
  peakDrainTime: string | null;
  peakDrainVolumeLiters: number | null;
  refillsToday: number;
  lastRefillTime: string | null;
  avgRefillTimeMinutes: number | null;
  estimatedEmptyTimeMinutes: number | null;
  estimatedFullTimeMinutes: number | null;
  lastUpdated: string;
  rateDataValid: boolean;
  alerts: TankAlerts;
  deviceHealth: DeviceHealth;
  isCorrected?: boolean;
  originalValue?: number;
  confidence?: number;
}

/**
 * Physics-correct water analytics hook.
 *
 * Formula chain (per user specification):
 *   delta_distance_m    = (prev_cm - curr_cm) / 100
 *   delta_volume_L      = L_m × B_m × delta_distance_m × 1000
 *   delta_time_min      = (curr_ts_ms - prev_ts_ms) / 1000 / 60
 *   rate_lpm            = delta_volume_L / delta_time_min
 *   fill_rate           = rate_lpm > 0 ? min(rate_lpm, 500) : 0
 *   consumption_rate    = rate_lpm < 0 ? min(abs(rate_lpm), 500) : 0
 */
export const useWaterAnalytics = (
  tankHeightM: number,
  tankCapacityLiters: number,
  sensorDistanceM: number | null,
  currentVolumeLiters: number,
  currentLevelPercent: number,
  timestamp: string,
  historyData: any[] = [],
  tankLengthM: number = 0,
  tankBreadthM: number = 0,
  deadBandM: number = 0,
  isCorrected: boolean = false,
  originalValue?: number,
  confidence?: number,
  isDeviceOnline: boolean = true,
): WaterAnalytics => {
  const analytics = useMemo(() => {
    const sensorDistance = sensorDistanceM ?? 0;
    const usableHeightM = Math.max(0, tankHeightM - deadBandM);
    const waterHeightM = Math.min(usableHeightM, Math.max(0, usableHeightM - sensorDistance));
    const waterLevelPercent = usableHeightM > 0 ? (waterHeightM / usableHeightM) * 100 : 0;
    const availableWaterLiters = (waterLevelPercent / 100) * tankCapacityLiters;
    const remainingCapacityLiters = tankCapacityLiters - availableWaterLiters;
    // ── Build normalised readings from history ────────────────────────────────
    // Each reading uses field1 (raw cm distance) for rate calculation.
    // Falls back to level_percentage only if field1 is unavailable.
    interface Reading {
      timestamp: number;
      distanceCm: number | null; // raw sensor distance in cm (null = unknown)
      volumeLiters: number;       // derived volume for consumption tracking
      levelPercent: number;
    }

    const allReadings: Reading[] = [...(historyData || [])].map(feed => {
      const ts = new Date(feed.timestamp || feed.created_at || feed.createdAt || 0).getTime();

      // Prefer raw field1 distance (cm) — this is what the sensor emits.
      // Backend now sends distance_cm explicitly; fall back to field1 for compatibility.
      const rawField1 = feed.distance_cm ?? feed.data?.field1 ?? feed.field1;
      const distanceCm: number | null = rawField1 != null
        ? parseFloat(String(rawField1))
        : null;

      // Derive level% from distance if possible, otherwise fallback
      let levelPercent: number;
      if (distanceCm !== null && isFinite(distanceCm) && usableHeightM > 0) {
        const wh = Math.min(usableHeightM, Math.max(0, usableHeightM - distanceCm / 100));
        levelPercent = (wh / usableHeightM) * 100;
      } else {
        levelPercent = feed.level_percentage ?? feed.level ?? feed.percentage ?? 0;
      }

      const volumeLiters = tankCapacityLiters > 0
        ? (levelPercent / 100) * tankCapacityLiters
        : 0;

      return { timestamp: ts, distanceCm, volumeLiters, levelPercent };
    }).filter(r => r.timestamp > 0);

    // Append current reading ONLY if it has a real timestamp
    const currentTs = timestamp ? new Date(timestamp).getTime() : 0;
    
    if (currentTs > 0) {
      const currentReading: Reading = {
        timestamp: currentTs,
        distanceCm: sensorDistance * 100, // convert back to cm for consistency
        volumeLiters: currentVolumeLiters,
        levelPercent: currentLevelPercent,
      };

      if (allReadings.length === 0 || currentTs > allReadings[allReadings.length - 1].timestamp) {
        allReadings.push(currentReading);
      } else if (Math.abs(currentTs - allReadings[allReadings.length - 1].timestamp) < 1000) {
        allReadings[allReadings.length - 1] = currentReading;
      }
    }

    allReadings.sort((a, b) => a.timestamp - b.timestamp);

    // ── Apply 10-Point Median Filter specifically for metrics ────────────────
    // This ensures rate calculations (slopes) are robust against jitter.
    const applyMedian = (arr: any[], field: string, size: number) => {
      return arr.map((_, idx) => {
        const start = Math.max(0, idx - Math.floor(size / 2));
        const end = Math.min(arr.length, idx + Math.floor(size / 2) + 1);
        const window = arr.slice(start, end).map(r => r[field]).filter(v => v !== null) as number[];
        if (window.length === 0) return arr[idx][field];
        window.sort((a, b) => a - b);
        return window[Math.floor(window.length / 2)];
      });
    };

    const medianVolumes = applyMedian(allReadings, 'volumeLiters', 10);

    const filteredReadings: Reading[] = allReadings.map((r, i) => ({
      ...r,
      volumeLiters: medianVolumes[i]
    }));

    let fillRateLpm = 0;
    let drainRateLpm = 0;
    let rateDataValid = false;

    // ── 5-Point Queue Rate Calculation (Moving Window Delta) ──
    // As requested: track readings in a queue and calculate rate from 1st to 5th point.
    const calculateQueueRate = (readings: Reading[]) => {
      if (readings.length < 2) return 0;
      
      const first = readings[0];
      const last = readings[readings.length - 1];
      
      const deltaVol = last.volumeLiters - first.volumeLiters;
      const deltaTMin = (last.timestamp - first.timestamp) / 60000;
      
      if (deltaTMin < 0.01) return 0; // Avoid division by zero/very small time
      return deltaVol / deltaTMin;
    };

    // Use at most 5 recent readings within the last 30 mins
    const recentQueue = filteredReadings
      .filter(r => (Date.now() - r.timestamp) < 30 * 60000)
      .slice(-5);

    if (recentQueue.length >= 2) {
      const rate = calculateQueueRate(recentQueue);
      const absRate = Math.abs(rate);

      // Stable threshold: if change is less than 0.2 L/min, consider it stable
      if (absRate < 0.2) {
        fillRateLpm = 0;
        drainRateLpm = 0;
        rateDataValid = true;
      } else if (rate > 0) {
        fillRateLpm = Math.min(rate, MAX_RATE_LPM);
        drainRateLpm = 0;
        rateDataValid = true;
      } else {
        drainRateLpm = Math.min(absRate, MAX_RATE_LPM);
        fillRateLpm = 0;
        rateDataValid = true;
      }
      
      // Final hard cap check for UI
      if (fillRateLpm > MAX_RATE_LPM || drainRateLpm > MAX_RATE_LPM) {
        logRejected('Guard4', `Queue rate ${rate.toFixed(1)} exceeds limit`, { rate });
      }
    }

    // ── Refill cycles today ───────────────────────────────────────────────────
    let refillsToday = 0;
    let lastRefillTime: string | null = null;
    let totalRefillDurationMin = 0;

    if (filteredReadings.length >= 3) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();

      let dropDetected = false;
      let potentialRefillStartTs: number | null = null;

      for (let i = 1; i < filteredReadings.length; i++) {
        const prev = filteredReadings[i - 1];
        const curr = filteredReadings[i];
        const isToday = curr.timestamp >= todayStartMs;
        const deltaLevel = curr.levelPercent - prev.levelPercent;

        if (deltaLevel < -5) {
          dropDetected = true;
          potentialRefillStartTs = null;
        } else if (dropDetected && deltaLevel > 2 && !potentialRefillStartTs) {
          potentialRefillStartTs = curr.timestamp;
          if (isToday) {
            refillsToday++;
            lastRefillTime = new Date(curr.timestamp).toISOString();
          }
        } else if (potentialRefillStartTs && deltaLevel <= 0) {
          const durationMin = (curr.timestamp - potentialRefillStartTs) / 60000;
          if (durationMin > 0 && durationMin < 1440) totalRefillDurationMin += durationMin;
          dropDetected = false;
          potentialRefillStartTs = null;
        }
      }

      if (potentialRefillStartTs) {
        const durationMin = (Date.now() - potentialRefillStartTs) / 60000;
        if (durationMin > 0 && durationMin < 1440) totalRefillDurationMin += durationMin;
      }
    }

    const avgRefillTimeMinutes = refillsToday > 0 ? (totalRefillDurationMin / refillsToday) : null;

    // ── Today's consumption ────────────────────────────────────────────────────
    let todaysConsumptionLiters = 0;
    let peakConsumptionRateLpm: number | null = null;
    let peakConsumptionTime: string | null = null;
    let peakDrainVolumeLiters: number | null = null;
    let peakDrainTime: string | null = null;

    if (filteredReadings.length >= 2) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();

      let currentContinuousDrainVolume = 0;
      let currentContinuousDrainStartTs: number | null = null;

      for (let i = 1; i < filteredReadings.length; i++) {
        const prev = filteredReadings[i - 1];
        const curr = filteredReadings[i];
        const isToday = curr.timestamp >= todayStartMs;
        const deltaVolumeL = curr.volumeLiters - prev.volumeLiters;
        const deltaTMin = (curr.timestamp - prev.timestamp) / 60000;

        if (deltaTMin > 0.1 && Math.abs(deltaVolumeL) <= (tankCapacityLiters * 0.5)) {
          if (deltaVolumeL < 0) {
            const consumed = Math.abs(deltaVolumeL);
            if (isToday) {
              todaysConsumptionLiters += consumed;
              const r = consumed / deltaTMin;
              if (r <= MAX_RATE_LPM && (peakConsumptionRateLpm === null || r > peakConsumptionRateLpm)) {
                peakConsumptionRateLpm = r;
                peakConsumptionTime = new Date(prev.timestamp).toISOString();
              }
            }
            if (currentContinuousDrainStartTs === null) currentContinuousDrainStartTs = prev.timestamp;
            currentContinuousDrainVolume += consumed;
          } else if (deltaVolumeL > 0) {
            if (currentContinuousDrainVolume > 0 && currentContinuousDrainStartTs !== null) {
              if (currentContinuousDrainStartTs >= todayStartMs) {
                if (peakDrainVolumeLiters === null || currentContinuousDrainVolume > peakDrainVolumeLiters) {
                  peakDrainVolumeLiters = currentContinuousDrainVolume;
                  peakDrainTime = new Date(currentContinuousDrainStartTs).toISOString();
                }
              }
            }
            currentContinuousDrainVolume = 0;
            currentContinuousDrainStartTs = null;
          }
        }
      }

      if (currentContinuousDrainVolume > 0 && currentContinuousDrainStartTs !== null) {
        const todayStartMs2 = new Date().setHours(0, 0, 0, 0);
        if (currentContinuousDrainStartTs >= todayStartMs2) {
          if (peakDrainVolumeLiters === null || currentContinuousDrainVolume > peakDrainVolumeLiters) {
            peakDrainVolumeLiters = currentContinuousDrainVolume;
            peakDrainTime = new Date(currentContinuousDrainStartTs).toISOString();
          }
        }
      }
    }

    // ── Estimated empty / full times ──────────────────────────────────────────
    let estimatedEmptyTimeMinutes: number | null = null;
    let estimatedFullTimeMinutes: number | null = null;

    if (drainRateLpm > 0.1 && availableWaterLiters > 0) {
      estimatedEmptyTimeMinutes = availableWaterLiters / drainRateLpm;
    }
    if (fillRateLpm > 0.1 && remainingCapacityLiters > 0) {
      estimatedFullTimeMinutes = remainingCapacityLiters / fillRateLpm;
    }

    // Use the latest filtered reading for real-time display metrics
    const lastFiltered = filteredReadings.length > 0 ? filteredReadings[filteredReadings.length - 1] : null;
    const finalLevelPercent = lastFiltered ? lastFiltered.levelPercent : waterLevelPercent;
    const finalVolumeLiters = lastFiltered ? lastFiltered.volumeLiters : availableWaterLiters;

    // ── Alerts ────────────────────────────────────────────────────────────────
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const lastRefillMs = lastRefillTime ? new Date(lastRefillTime).getTime() : 0;
    const noFillForTwoHours = lastRefillMs === 0 || (Date.now() - lastRefillMs) > twoHoursMs;

    const alertLowLevel    = finalLevelPercent < 20;
    const alertCriticalLow = finalLevelPercent < 10;
    const alertOverflow    = finalLevelPercent > 95;
    const alertHighDrain   = drainRateLpm > 100;
    const alertNoFill      = alertLowLevel && noFillForTwoHours;
    // Sensor fault: sensor reports 0 volume but level would be > 5% based on history
    const alertSensorFault = finalVolumeLiters === 0 && finalLevelPercent > 5;

    const activeCount = [alertLowLevel, alertCriticalLow, alertOverflow, alertHighDrain, alertNoFill, alertSensorFault]
      .filter(Boolean).length;

    const alerts: TankAlerts = {
      lowLevel: alertLowLevel,
      criticalLow: alertCriticalLow,
      overflow: alertOverflow,
      highDrain: alertHighDrain,
      noFill: alertNoFill,
      sensorFault: alertSensorFault,
      activeCount,
    };

    // ── Device Health ─────────────────────────────────────────────────────────
    const lastDataMs = timestamp ? Date.now() - new Date(timestamp).getTime() : Infinity;
    const sensorOk  = lastDataMs < 5 * 60 * 1000; // within 5 minutes
    const dataValid  = finalVolumeLiters >= 0 && finalVolumeLiters <= tankCapacityLiters + 1;
    // No fault: check if any consecutive pair jumped > 50% of capacity
    let noFault = true;
    if (tankCapacityLiters > 0) {
      for (let i = 1; i < filteredReadings.length; i++) {
        const jump = Math.abs(filteredReadings[i].volumeLiters - filteredReadings[i - 1].volumeLiters);
        if (jump > tankCapacityLiters * 0.5) { noFault = false; break; }
      }
    }
    const connected = isDeviceOnline;

    const failCount = [!sensorOk, !dataValid, !noFault, !connected].filter(Boolean).length;
    const healthStatus: DeviceHealth['status'] =
      failCount === 0 ? 'Healthy' :
      failCount <= 2  ? 'Warning' : 'Critical';

    const deviceHealth: DeviceHealth = { sensorOk, dataValid, noFault, connected, status: healthStatus };

    return {
      waterHeightM: lastFiltered ? (usableHeightM * finalLevelPercent / 100) : waterHeightM,
      waterLevelPercent: finalLevelPercent,
      sensorDistanceM: lastFiltered ? (usableHeightM - (usableHeightM * finalLevelPercent / 100)) : sensorDistance,
      availableWaterLiters: finalVolumeLiters,
      totalCapacityLiters: tankCapacityLiters,
      remainingCapacityLiters: tankCapacityLiters - finalVolumeLiters,
      fillRateLpm,
      drainRateLpm,
      todaysConsumptionLiters,
      peakConsumptionTime,
      peakConsumptionRateLpm,
      peakDrainTime,
      peakDrainVolumeLiters,
      refillsToday,
      lastRefillTime,
      avgRefillTimeMinutes,
      estimatedEmptyTimeMinutes,
      estimatedFullTimeMinutes,
      lastUpdated: timestamp,
      rateDataValid,
      alerts,
      deviceHealth,
      isCorrected,
      originalValue,
      confidence,
    };
  }, [
    tankHeightM, tankCapacityLiters, sensorDistanceM, currentVolumeLiters,
    currentLevelPercent, timestamp, historyData, tankLengthM, tankBreadthM, deadBandM, isDeviceOnline,
  ]);

  return analytics;
};

export const formatTimeDuration = (minutes: number | null): string => {
  if (minutes === null || !isFinite(minutes) || minutes < 0) return '--';
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
};

export const formatRate = (rate: number, isPositive: boolean): string => {
  if (!isFinite(rate) || rate > MAX_RATE_LPM) return 'Invalid reading';
  const absRate = Math.abs(rate);
  if (absRate < 1) return `${isPositive ? '+' : '-'}${absRate.toFixed(2)} L/min`;
  if (absRate < 100) return `${isPositive ? '+' : '-'}${absRate.toFixed(1)} L/min`;
  return `${isPositive ? '+' : '-'}${Math.round(absRate)} L/min`;
};
