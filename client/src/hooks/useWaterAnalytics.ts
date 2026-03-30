import { useMemo } from 'react';

// ─── Hard limit on any pump rate — physical maximum for this system ───────────
const MAX_RATE_LPH = 30000; // L/hr (approx 500 L/min)


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
  fillRateLph: number;
  drainRateLph: number;
  todaysConsumptionLiters: number;
  peakConsumptionTime: string | null;
  peakConsumptionRateLph: number | null;
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

    // ── STEP 1: Compute independent slope from history ────────────────────────
    // We look for a reading at least 20 minutes old to get a stable trend.
    // We prioritize the reading nearest to 1 hour ago for maximum stability.
    let independentSlopeLph = 0;
    let rateDataValid = false;

    if (filteredReadings.length >= 2) {
      const newest = filteredReadings[filteredReadings.length - 1];
      
      // Look for readings that are at least 20 minutes old
      const candidateOldReadings = filteredReadings.filter(
        r => (newest.timestamp - r.timestamp) >= 20 * 60000
      );
      
      if (candidateOldReadings.length > 0) {
        // We pick the OLDEST available reading that is still within our buffer (up to ~60 min)
        // This gives us the widest possible window for the most stable slope.
        const oldest = candidateOldReadings[0]; 
        const dvL   = newest.volumeLiters - oldest.volumeLiters;
        const dtMin = (newest.timestamp  - oldest.timestamp) / 60000;
        
        if (dtMin > 0) {
          const slopeLpm = dvL / dtMin;
          independentSlopeLph = slopeLpm * 60;
          rateDataValid = true;
        }
      }
    }

    // ── STEP 2: Use slope to set rate cards (L/hr) ────────────────────────────────
    let fillRateLph  = 0;
    let drainRateLph = 0;

    // Dead zone: ignore fluctuations below 20 L/hr (approx 0.3 L/min)
    if (Math.abs(independentSlopeLph) < 20) {
      fillRateLph  = 0;
      drainRateLph = 0;
    } else if (independentSlopeLph > 0) {
      fillRateLph  = Math.min(independentSlopeLph, MAX_RATE_LPH);
      drainRateLph = 0;
    } else {
      drainRateLph = Math.min(Math.abs(independentSlopeLph), MAX_RATE_LPH);
      fillRateLph  = 0;
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
    let peakConsumptionRateLph: number | null = null;
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
              const r = consumed / (deltaTMin / 60); // L/hr
              if (r <= MAX_RATE_LPH && (peakConsumptionRateLph === null || r > peakConsumptionRateLph)) {
                peakConsumptionRateLph = r;
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

    // ── STEP 3: Dual-slope history scan for permanent estimations ─────────────
    // risingSlope  = rate from most recent rising segment → used for Est. Full
    // fallingSlope = rate from most recent falling segment → used for Est. Empty
    // These are INDEPENDENT of fillRateLph and drainRateLph display cards
    let risingSlopeLpm  = 0; 
    let fallingSlopeLpm = 0;
    
    // Limits for segment validation
    const MAX_RATE_LPM = MAX_RATE_LPH / 60;

    if (filteredReadings.length >= 2) {
      // ── Find most recent RISING segment ──
      let riseStart: Reading | null = null;
      let bestRiseRate = 0;

      for (let i = filteredReadings.length - 1; i >= 1; i--) {
        const curr = filteredReadings[i];
        const prev = filteredReadings[i - 1];
        const dv   = curr.volumeLiters - prev.volumeLiters;
        const dt   = (curr.timestamp  - prev.timestamp) / 60000;

        if (dv > 0 && dt > 0) {
          // still in a rising segment — extend it backwards
          if (!riseStart) riseStart = curr;
        } else if (riseStart) {
          // segment ended — compute slope from prev to riseStart
          const segDv = riseStart.volumeLiters - prev.volumeLiters;
          const segDt = (riseStart.timestamp  - prev.timestamp) / 60000;
          if (segDt > 5 && segDv > 0) {
            bestRiseRate = segDv / segDt;
          }
          break;
        }
      }
      // If still in rising segment at start of history
      if (riseStart && bestRiseRate === 0 && filteredReadings.length >= 2) {
        const oldest = filteredReadings[0];
        const segDv  = riseStart.volumeLiters - oldest.volumeLiters;
        const segDt  = (riseStart.timestamp  - oldest.timestamp) / 60000;
        if (segDt > 5 && segDv > 0) bestRiseRate = segDv / segDt;
      }
      if (bestRiseRate > 0.3 && bestRiseRate < MAX_RATE_LPM) {
        risingSlopeLpm = bestRiseRate;
      }

      // ── Find most recent FALLING segment ──
      let fallStart: Reading | null = null;
      let bestFallRate = 0;

      for (let i = filteredReadings.length - 1; i >= 1; i--) {
        const curr = filteredReadings[i];
        const prev = filteredReadings[i - 1];
        const dv   = curr.volumeLiters - prev.volumeLiters;
        const dt   = (curr.timestamp  - prev.timestamp) / 60000;

        if (dv < 0 && dt > 0) {
          if (!fallStart) fallStart = curr;
        } else if (fallStart) {
          const segDv = prev.volumeLiters - fallStart.volumeLiters;
          const segDt = (fallStart.timestamp - prev.timestamp) / 60000;
          if (segDt > 5 && segDv > 0) {
            bestFallRate = segDv / segDt;
          }
          break;
        }
      }
      if (fallStart && bestFallRate === 0 && filteredReadings.length >= 2) {
        const oldest = filteredReadings[0];
        const segDv  = oldest.volumeLiters - fallStart.volumeLiters;
        const segDt  = (fallStart.timestamp - oldest.timestamp) / 60000;
        if (segDt > 5 && segDv > 0) bestFallRate = Math.abs(segDv / segDt);
      }
      if (bestFallRate > 0.3 && bestFallRate < MAX_RATE_LPM) {
        fallingSlopeLpm = bestFallRate;
      }
    }

    // ── Est. times — always compute from history slopes ───────────────────────
    let estimatedFullTimeMinutes:  number | null = null;
    let estimatedEmptyTimeMinutes: number | null = null;

    const currentVol    = filteredReadings.length > 0
      ? filteredReadings[filteredReadings.length - 1].volumeLiters
      : availableWaterLiters;
    const remainingCap  = tankCapacityLiters - currentVol;

    // Est. Time Until Full — only when tank is NOT already full
    if (risingSlopeLpm > 0.3 && remainingCap > 0) {
      estimatedFullTimeMinutes = remainingCap / risingSlopeLpm;
    }

    // Est. Time Until Empty — only when tank is NOT already empty
    if (fallingSlopeLpm > 0.3 && currentVol > 0) {
      estimatedEmptyTimeMinutes = currentVol / fallingSlopeLpm;
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
    const alertHighDrain   = drainRateLph > 6000; // 100 L/min * 60 = 6000 L/hr
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
      fillRateLph,
      drainRateLph,
      todaysConsumptionLiters,
      peakConsumptionTime,
      peakConsumptionRateLph,
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
  if (!isFinite(rate) || rate > MAX_RATE_LPH) return 'Invalid reading';
  const absRate = Math.abs(rate);
  if (absRate === 0) return 'Stable';
  if (absRate < 10) return `${isPositive ? '+' : '-'}${absRate.toFixed(2)} L/hr`;
  if (absRate < 100) return `${isPositive ? '+' : '-'}${absRate.toFixed(1)} L/hr`;
  return `${isPositive ? '+' : '-'}${Math.round(absRate)} L/hr`;
};
