import { useMemo } from 'react';
export interface WaterAnalytics {
  waterHeightM: number;
  waterLevelPercent: number;
  sensorDistanceM: number;
  availableWaterLiters: number;
  totalCapacityLiters: number;
  remainingCapacityLiters: number;
  fillRateLpm: number;
  drainRateLpm: number;
  estimatedEmptyTimeMinutes: number | null;
  estimatedFullTimeMinutes: number | null;
  lastUpdated: string;
}


export const useWaterAnalytics = (
  tankHeightM: number,
  tankCapacityLiters: number,
  sensorDistanceM: number | null,
  currentVolumeLiters: number,
  currentLevelPercent: number,
  timestamp: string,
  historyData: any[] = []
): WaterAnalytics => {
  const analytics = useMemo(() => {
    const sensorDistance = sensorDistanceM ?? 0;
    const waterHeightM = tankHeightM - sensorDistance;
    const waterLevelPercent = tankHeightM > 0 ? (waterHeightM / tankHeightM) * 100 : 0;
    const availableWaterLiters = (waterLevelPercent / 100) * tankCapacityLiters;
    const remainingCapacityLiters = tankCapacityLiters - availableWaterLiters;

    const allReadings = [...(historyData || [])].map(feed => ({
      timestamp: new Date(feed.timestamp || feed.created_at || feed.createdAt || 0).getTime(),
      volumeLiters: feed.total_liters ?? feed.volume ?? feed.currentVolume ?? 0,
      waterLevelPercent: feed.level_percentage ?? feed.level ?? feed.percentage ?? 0,
    })).filter(r => r.timestamp > 0);

    const currentReadingMs = timestamp ? new Date(timestamp).getTime() : Date.now();
    const currentReading = {
      timestamp: currentReadingMs,
      volumeLiters: currentVolumeLiters,
      waterLevelPercent: currentLevelPercent,
    };

    if (allReadings.length === 0 || currentReadingMs > allReadings[allReadings.length - 1].timestamp) {
      allReadings.push(currentReading);
    } else if (allReadings.length > 0 && Math.abs(currentReadingMs - allReadings[allReadings.length - 1].timestamp) < 1000) {
      allReadings[allReadings.length - 1] = currentReading;
    }

    // Sort to ensure chronological order and take the last 6 points (to get 5 intervals)
    allReadings.sort((a, b) => a.timestamp - b.timestamp);
    const recentReadings = allReadings.slice(-6);

    let fillRateLpm = 0;
    let drainRateLpm = 0;

    if (recentReadings.length >= 2) {
      const rates: number[] = [];

      for (let i = 1; i < recentReadings.length; i++) {
        const prev = recentReadings[i - 1];
        const curr = recentReadings[i];
        const timeDiffMinutes = (curr.timestamp - prev.timestamp) / 60000;

        if (timeDiffMinutes > 0) {
          const volumeDiff = curr.volumeLiters - prev.volumeLiters;
          const rate = volumeDiff / timeDiffMinutes;
          rates.push(rate);
        }
      }

      if (rates.length > 0) {
        const avgRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;
        console.log('[WaterAnalytics] Calculated Rates Array:', rates);
        console.log('[WaterAnalytics] Avg Rate:', avgRate);
        if (avgRate > 0) {
          fillRateLpm = avgRate;
        } else if (avgRate < 0) {
          drainRateLpm = Math.abs(avgRate);
        }
      } else {
         console.log('[WaterAnalytics] Rates Array empty!', rates);
      }
    } else {
        console.log('[WaterAnalytics] Not enough readings:', recentReadings.length);
    }

    let estimatedEmptyTimeMinutes: number | null = null;
    let estimatedFullTimeMinutes: number | null = null;

    if (drainRateLpm > 0.1 && availableWaterLiters > 0) {
      estimatedEmptyTimeMinutes = availableWaterLiters / drainRateLpm;
    }

    if (fillRateLpm > 0.1 && remainingCapacityLiters > 0) {
      estimatedFullTimeMinutes = remainingCapacityLiters / fillRateLpm;
    }

    return {
      waterHeightM,
      waterLevelPercent,
      sensorDistanceM: sensorDistance,
      availableWaterLiters,
      totalCapacityLiters: tankCapacityLiters,
      remainingCapacityLiters,
      fillRateLpm,
      drainRateLpm,
      estimatedEmptyTimeMinutes,
      estimatedFullTimeMinutes,
      lastUpdated: timestamp,
    };
  }, [tankHeightM, tankCapacityLiters, sensorDistanceM, currentVolumeLiters, currentLevelPercent, timestamp, historyData]);

  return analytics;
};

export const formatTimeDuration = (minutes: number | null): string => {
  if (minutes === null || !isFinite(minutes) || minutes < 0) return '--';
  
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} sec`;
  } else if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }
};

export const formatRate = (rate: number, isPositive: boolean): string => {
  const absRate = Math.abs(rate);
  if (absRate < 1) {
    return `${isPositive ? '+' : '-'}${absRate.toFixed(2)} L/min`;
  } else if (absRate < 100) {
    return `${isPositive ? '+' : '-'}${absRate.toFixed(1)} L/min`;
  } else {
    return `${isPositive ? '+' : '-'}${Math.round(absRate)} L/min`;
  }
};
