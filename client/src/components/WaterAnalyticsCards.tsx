import React from 'react';
import type { WaterAnalytics } from '../hooks/useWaterAnalytics';
import { formatTimeDuration, formatRate } from '../hooks/useWaterAnalytics';

interface WaterAnalyticsCardsProps {
  analytics: WaterAnalytics;
  loading?: boolean;
}

const Card: React.FC<{ title: string; value: string | number; unit: string; highlight?: 'positive' | 'negative' | 'neutral'; icon?: string }> = ({ 
  title, 
  value, 
  unit, 
  highlight = 'neutral',
  icon 
}) => {
  const highlightColors = {
    positive: { bg: 'rgba(52,199,89,0.1)', text: '#34C759', border: 'rgba(52,199,89,0.2)' },
    negative: { bg: 'rgba(255,59,48,0.1)', text: '#FF3B30', border: 'rgba(255,59,48,0.2)' },
    neutral: { bg: 'rgba(0,0,0,0.02)', text: '#1C1C1E', border: 'rgba(0,0,0,0.05)' },
  };

  const colors = highlightColors[highlight];

  return (
    <div 
      className="flex flex-col justify-between p-4 rounded-2xl"
      style={{ 
        background: colors.bg, 
        border: `1px solid ${colors.border}`,
        minHeight: '100px'
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#8E8E93' }}>{icon}</span>}
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>{title}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: colors.text }}>{value}</span>
        <span className="text-xs font-medium" style={{ color: '#8E8E93' }}>{unit}</span>
      </div>
    </div>
  );
};

export const WaterAnalyticsCards: React.FC<WaterAnalyticsCardsProps> = ({ analytics, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-[100px] rounded-2xl animate-pulse" style={{ background: 'rgba(0,0,0,0.05)' }} />
        ))}
      </div>
    );
  }


  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Card 
        title="Water Level" 
        value={`${analytics.waterLevelPercent.toFixed(1)}`} 
        unit="%" 
        icon="water_full"
        highlight={analytics.waterLevelPercent > 80 ? 'positive' : analytics.waterLevelPercent < 20 ? 'negative' : 'neutral'}
      />
      
      <Card 
        title="Water Height" 
        value={`${analytics.waterHeightM.toFixed(2)}`} 
        unit="m" 
        icon="height"
        highlight="neutral"
      />
      
      <Card 
        title="Sensor Distance" 
        value={`${analytics.sensorDistanceM.toFixed(2)}`} 
        unit="m" 
        icon="sensors"
        highlight="neutral"
      />
      
      <Card 
        title="Available Water" 
        value={`${(analytics.availableWaterLiters / 1000).toFixed(1)}`} 
        unit="KL" 
        icon="water"
        highlight={analytics.availableWaterLiters > analytics.totalCapacityLiters * 0.8 ? 'positive' : analytics.availableWaterLiters < analytics.totalCapacityLiters * 0.2 ? 'negative' : 'neutral'}
      />
      
      <Card 
        title="Remaining Capacity" 
        value={`${(analytics.remainingCapacityLiters / 1000).toFixed(1)}`} 
        unit="KL" 
        icon="storage"
        highlight="neutral"
      />
      
      <Card 
        title="Tank Capacity" 
        value={`${(analytics.totalCapacityLiters / 1000).toFixed(1)}`} 
        unit="KL" 
        icon="inventory_2"
        highlight="neutral"
      />
      
      <Card 
        title="Fill Rate" 
        value={analytics.fillRateLpm > 0 && analytics.fillRateLpm <= 500 ? formatRate(analytics.fillRateLpm, true) : analytics.fillRateLpm > 500 ? 'Invalid reading' : '--'} 
        unit="" 
        icon="trending_up"
        highlight={analytics.fillRateLpm > 0 && analytics.fillRateLpm <= 500 ? 'positive' : analytics.fillRateLpm > 500 ? 'negative' : 'neutral'}
      />
      
      <Card 
        title="Drain Rate" 
        value={analytics.drainRateLpm > 0 && analytics.drainRateLpm <= 500 ? formatRate(analytics.drainRateLpm, false) : analytics.drainRateLpm > 500 ? 'Invalid reading' : '--'} 
        unit="" 
        icon="trending_down"
        highlight={analytics.drainRateLpm > 0 && analytics.drainRateLpm <= 500 ? 'negative' : analytics.drainRateLpm > 500 ? 'negative' : 'neutral'}
      />
      
      <Card 
        title="Time Until Empty" 
        value={formatTimeDuration(analytics.estimatedEmptyTimeMinutes)} 
        unit="" 
        icon="timer"
        highlight={analytics.estimatedEmptyTimeMinutes && analytics.estimatedEmptyTimeMinutes < 60 ? 'negative' : 'neutral'}
      />
      
      <Card 
        title="Time Until Full" 
        value={formatTimeDuration(analytics.estimatedFullTimeMinutes)} 
        unit="" 
        icon="schedule"
        highlight={analytics.estimatedFullTimeMinutes && analytics.estimatedFullTimeMinutes < 30 ? 'positive' : 'neutral'}
      />

      <Card 
        title="Refills Today" 
        value={analytics.refillsToday} 
        unit="times" 
        icon="autorenew"
        highlight={analytics.refillsToday > 0 ? 'positive' : 'neutral'}
      />

      <Card 
        title="Last Refill Time" 
        value={analytics.lastRefillTime ? new Date(analytics.lastRefillTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} 
        unit="" 
        icon="update"
        highlight="neutral"
      />

      <Card 
        title="Avg Refill Time" 
        value={formatTimeDuration(analytics.avgRefillTimeMinutes)} 
        unit="" 
        icon="hourglass_top"
        highlight="neutral"
      />

      <Card 
        title="Today's Consumption" 
        value={`${(analytics.todaysConsumptionLiters / 1000).toFixed(2)}`} 
        unit="KL" 
        icon="water_drop"
        highlight="neutral"
      />

      <Card 
        title="Peak Consumption Time" 
        value={analytics.peakConsumptionTime ? new Date(analytics.peakConsumptionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} 
        unit="" 
        icon="query_builder"
        highlight="neutral"
      />

      <Card 
        title="Peak Consumption Rate" 
        value={analytics.peakConsumptionRateLpm ? `${analytics.peakConsumptionRateLpm.toFixed(1)} L/min` : '--'} 
        unit="" 
        icon="speed"
        highlight="neutral"
      />

      <Card 
        title="Peak Drain Time" 
        value={analytics.peakDrainTime ? new Date(analytics.peakDrainTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} 
        unit="" 
        icon="calendar_clock"
        highlight="neutral"
      />

      <Card 
        title="Peak Drain Vol" 
        value={analytics.peakDrainVolumeLiters ? `${analytics.peakDrainVolumeLiters.toFixed(0)}` : '--'} 
        unit="L" 
        icon="waterfall_chart"
        highlight="neutral"
      />
    </div>
  );
};

export default WaterAnalyticsCards;
