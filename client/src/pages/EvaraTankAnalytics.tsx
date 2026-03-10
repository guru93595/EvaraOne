import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import { useRealtimeTelemetry } from '../hooks/useRealtimeTelemetry';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { TankConfig } from '../hooks/useDeviceConfig';
import {
    computeCapacityLitres,
    computeTankMetrics,
    percentageToVolume,
    formatVolume,
} from '../utils/tankCalculations';
import type { TankShape } from '../utils/tankCalculations';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelemetryPayload {
    timestamp: string;
    data?: Record<string, any>;
    level_percentage?: number;
    total_liters?: number;
}

interface LocalTankConfig {
    thingspeakChannelId: string;
    thingspeakReadKey: string;
    tankShape: TankShape;
    heightM: number;
    lengthM: number;
    breadthM: number;
    radiusM: number;
    capacityOverrideLitres: number | null;
    fieldDepth: string;
    fieldTemperature: string;
}

const DEFAULT_LOCAL_CFG: LocalTankConfig = {
    thingspeakChannelId: '',
    thingspeakReadKey: '',
    tankShape: 'rectangular',
    heightM: 0,
    lengthM: 0,
    breadthM: 0,
    radiusM: 0,
    capacityOverrideLitres: null,
    fieldDepth: 'field1',
    fieldTemperature: 'field2',
};

function serverConfigToLocal(cfg: TankConfig): LocalTankConfig {
    return {
        thingspeakChannelId: cfg.thingspeak_channel_id ?? '',
        thingspeakReadKey: '',   // never returned by the server for security
        tankShape: (cfg.tank_shape as TankShape) ?? 'rectangular',
        heightM: cfg.height_m ?? cfg.depth ?? cfg.tankHeight ?? 0,
        lengthM: cfg.length_m ?? 0,
        breadthM: cfg.breadth_m ?? 0,
        radiusM: cfg.radius_m ?? 0,
        capacityOverrideLitres: cfg.capacity_liters ?? cfg.capacity ?? null,
        fieldDepth: cfg.water_level_field ?? cfg.fieldKey ?? 'field1',
        fieldTemperature: cfg.temperature_field ?? 'field2',
    };
}

function localToApiBody(lc: LocalTankConfig) {
    return {
        thingspeak_channel_id: lc.thingspeakChannelId || undefined,
        thingspeak_read_key: lc.thingspeakReadKey || undefined,
        tank_shape: lc.tankShape,
        height_m: lc.heightM,
        length_m: lc.lengthM,
        breadth_m: lc.breadthM,
        radius_m: lc.radiusM,
        capacity_liters: lc.capacityOverrideLitres,
        water_level_field: lc.fieldDepth,
        temperature_field: lc.fieldTemperature,
    };
}

// ─── Main component ───────────────────────────────────────────────────────────
const EvaraTankAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // ── Config panel form state ───────────────────────────────────────────────
    const [localCfg, setLocalCfg] = useState<LocalTankConfig>(DEFAULT_LOCAL_CFG);
    const [cfgDirty, setCfgDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── Unified Analytics Data ────────────────────────────────────────────────
    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        isError: telemetryError,
        refetch,
        error: hookError
    } = useDeviceAnalytics(hardwareId);

    const deviceConfig = ('config' in (unifiedData?.config ?? {})
        ? (unifiedData!.config as any).config
        : undefined) as TankConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;
    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as any).data
        : undefined) as NodeInfoData | undefined;

    // ── Real-time Telemetry Integration ──────────────────────────────────────
    const { telemetry: realtimeData } = useRealtimeTelemetry(hardwareId || "");
    const [liveFeeds, setLiveFeeds] = useState<any[]>([]);

    // Sync initial history to live feeds
    useEffect(() => {
        const history = (unifiedData?.history as any)?.feeds || unifiedData?.history || [];
        if (history.length > 0) {
            setLiveFeeds(history);
        }
    }, [unifiedData?.history]);

    // Handle incoming real-time data
    useEffect(() => {
        if (realtimeData) {
            setLiveFeeds(prev => {
                const last = prev[prev.length - 1];
                // Avoid duplicates if the same timestamp comes in
                if (last && last.timestamp === realtimeData.timestamp) return prev;
                
                const newPoint = {
                    ...realtimeData,
                    // Ensure naming consistency with historical feeds
                    timestamp: realtimeData.timestamp || new Date().toISOString(),
                    level_percentage: realtimeData.level_percentage ?? realtimeData.percentage ?? realtimeData.Level ?? 0,
                    total_liters: realtimeData.total_liters ?? realtimeData.volume ?? 0,
                };
                
                // Keep last 50 points for the "Live" feel
                const updated = [...prev, newPoint];
                return updated.slice(-50);
            });
        }
    }, [realtimeData]);

    // Use realtimeData if available, fallback to fetched latest
    const activeTelemetry = realtimeData || telemetryData;

    const telemetryLoading = analyticsLoading;
    const historyLoading = analyticsLoading;

    // Online status
    const snapshotTs = activeTelemetry?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen;
    const onlineStatus = computeOnlineStatus(bestTimestamp);

    useEffect(() => {
        if (deviceConfig) {
            setLocalCfg(serverConfigToLocal(deviceConfig));
            setCfgDirty(false);
        }
    }, [deviceConfig]);

    const isDataMissing = (unifiedData?.history as any)?.feeds?.length === 0;
    const isConfigMissing = hookError === "Telemetry configuration missing";
    const isOffline = onlineStatus === 'Offline';

    // ── Stale-data age ────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(activeTelemetry?.timestamp ?? null);

    // ── Derive current metrics ────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const backendPct = activeTelemetry?.level_percentage;
        const backendVolume = activeTelemetry?.total_liters ?? null;

        if (backendPct != null && isFinite(backendPct)) {
            const capacityLitres = computeCapacityLitres({
                tankShape: localCfg.tankShape, heightM: localCfg.heightM,
                lengthM: localCfg.lengthM, breadthM: localCfg.breadthM,
                radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres,
            });
            const pctVal = Math.max(0, Math.min(100, backendPct));
            const volumeLitres = (backendVolume != null && isFinite(backendVolume))
                ? backendVolume
                : percentageToVolume(pctVal, capacityLitres);
            return {
                waterHeightCm: (pctVal / 100) * localCfg.heightM * 100,
                percentage: pctVal,
                volumeLitres,
                capacityLitres,
                isDataValid: true,
            };
        }
        const rawField = activeTelemetry?.data?.[localCfg.fieldDepth] as string | number | undefined;
        const sensorCm = rawField != null ? parseFloat(String(rawField)) : null;
        return computeTankMetrics({
            sensorReadingCm: sensorCm !== null && isFinite(sensorCm) ? sensorCm : null,
            dims: { tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres },
        });
    }, [activeTelemetry, localCfg]);

    // ── Charts ────────────────────────────────────────────────────────────────
    const { levelChartData, volumeChartData } = useMemo(() => {
        const levelData: { time: string; level: number }[] = [];
        const volumeData: { time: string; volume: number }[] = [];

        for (const feed of liveFeeds) {
            const d = new Date(feed.timestamp || feed.created_at);
            // Use HH:mm:ss for better precision in live view
            const time = `${d.getHours().toString().padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            levelData.push({ time, level: feed.level_percentage || feed.level || feed.percentage || 0 });
            volumeData.push({ time, volume: feed.total_liters || feed.volume || feed.currentVolume || 0 });
        }
        return { levelChartData: levelData, volumeChartData: volumeData };
    }, [liveFeeds]);

    // ── Metrics & State ───────────────────────────────────────────────────────
    const pct = metrics.percentage;
    const deviceName = deviceInfo?.name ?? 'Tank Device';
    const displayId = deviceInfo?.hardware_id ?? hardwareId ?? 'Unknown';

    // ── Computed capacity preview ─────────────────────────────────────────────
    const previewCapacity = useMemo(
        () => computeCapacityLitres({ tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres }),
        [localCfg],
    );

    // ── Config save ───────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError(null);
        try {
            // Updated to hit the centralized admin node configuration endpoint
            await api.put(`/admin/nodes/${hardwareId}`, localToApiBody(localCfg));
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            setCfgDirty(false);
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    }, [hardwareId, localCfg, queryClient]);

    const handleReset = useCallback(() => {
        if (deviceConfig) { setLocalCfg(serverConfigToLocal(deviceConfig)); setCfgDirty(false); }
    }, [deviceConfig]);

    function patch(updates: Partial<LocalTankConfig>) {
        setLocalCfg((prev) => ({ ...prev, ...updates }));
        setCfgDirty(true);
    }

    // ── Volume unit for chart axis ─────────────────────
    const { volUnit, volDivisor } = useMemo(() => {
        const maxVol = Math.max(...volumeChartData.map(d => d.volume), 1);
        return maxVol >= 1000 ? { volUnit: 'KL', volDivisor: 1000 } : { volUnit: 'L', volDivisor: 1 };
    }, [volumeChartData]);

    // ── Trend direction ──────────────────────────────────────────────────────
    const trendSelection = useMemo(() => {
        if (levelChartData.length < 3) return 'stable';
        const tail = levelChartData.slice(-3);
        const delta = tail[2].level - tail[0].level;
        return delta > 1.5 ? 'rising' : delta < -1.5 ? 'falling' : 'stable';
    }, [levelChartData]);

    const trendInfo = useMemo(() => {
        if (trendSelection === 'rising') return { label: 'Filling', icon: 'arrow_upward', color: '#34C759', bg: 'rgba(52,199,89,0.12)' };
        if (trendSelection === 'falling') return { label: 'Draining', icon: 'arrow_downward', color: '#FF3B30', bg: 'rgba(255,59,48,0.12)' };
        return { label: 'Stable', icon: 'remove', color: '#8E8E93', bg: 'rgba(142,142,147,0.12)' };
    }, [trendSelection]);

    // Guard: if no hardwareId id in route, redirect to /nodes
    if (!hardwareId) return <Navigate to="/nodes" replace />;

    if (analyticsLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'rgba(10,132,255,0.2)', borderTopColor: '#0A84FF' }} />
                    <p className="text-sm font-medium" style={{ color: '#8E8E93' }}>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: '#1C1C1E' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* Breadcrumb + status row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <nav className="flex items-center gap-1 text-sm font-medium" style={{ color: '#8E8E93' }}>
                            <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 flex items-center">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>home</span>
                            </button>
                            <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#C7C7CC' }}>chevron_right</span>
                            <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-medium" style={{ color: '#8E8E93' }}>
                                All Nodes
                            </button>
                            <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#C7C7CC' }}>chevron_right</span>
                            <span className="font-semibold" style={{ color: '#1C1C1E' }}>{deviceName}</span>
                        </nav>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                                style={{ background: isOffline ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)', color: isOffline ? '#FF3B30' : '#34C759' }}>
                                <span className="relative flex" style={{ width: 8, height: 8 }}>
                                    {!isOffline && <span className="absolute inset-0 rounded-full" style={{ background: '#34C759', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.75 }} />}
                                    <span className="relative rounded-full block w-full h-full" style={{ background: isOffline ? '#FF3B30' : '#34C759' }} />
                                </span>
                                {isOffline ? 'Offline' : 'Online'}
                            </div>
                            <button onClick={() => refetch()}
                                className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1.5 transition-all hover:scale-95"
                                style={{ background: 'rgba(10,132,255,0.1)', color: '#0A84FF', border: 'none', cursor: 'pointer' }}>
                                <span className="material-symbols-rounded" style={{ fontSize: 15 }}>refresh</span>
                                Refresh
                            </button>
                        </div>
                    </div>

                    {isConfigMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(255,149,0,0.1)', color: '#FF9500' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>settings</span>
                                Telemetry configuration missing (Channel ID or API Key)
                            </div>
                        </div>
                    )}

                    {!isConfigMissing && isDataMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(142,142,147,0.1)', color: '#8E8E93' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>database_off</span>
                                No telemetry data available for this device
                            </div>
                        </div>
                    )}

                    {telemetryError && !isConfigMissing && (
                        <div className="rounded-2xl px-4 py-3 text-sm font-medium flex items-center justify-between gap-4"
                            style={{ background: 'rgba(255,59,48,0.1)', color: '#FF3B30' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>warning</span>
                                Failed to load latest telemetry. Retrying in background...
                            </div>
                            <button onClick={() => refetch()} className="px-3 py-1 bg-[#FF3B30] text-white rounded-full text-xs font-semibold border-none cursor-pointer hover:bg-red-600 transition-colors">
                                Retry Now
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                        {/* TANK VISUALIZER */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-6 flex flex-col relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2 z-10">
                                <div>
                                    <h3 className="text-xl font-semibold m-0 leading-tight">{deviceName}</h3>
                                    <p className="text-xs font-medium mt-0.5 m-0" style={{ color: '#8E8E93' }}>ID: {displayId}</p>
                                </div>
                            </div>

                            <div className="flex-grow flex items-center justify-center py-6 z-10">
                                <div className="relative" style={{ width: 180, height: 260 }}>
                                    <div className="absolute inset-0 rounded-[40px] overflow-hidden z-10 tank-glass"
                                        style={{ border: '3px solid rgba(255,255,255,0.6)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                                        <div className="absolute top-0 bottom-0 left-2" style={{ width: 16, background: 'linear-gradient(90deg,rgba(255,255,255,0.6),transparent)', filter: 'blur(2px)', zIndex: 30 }} />
                                        <div className="absolute top-0 bottom-0 right-1" style={{ width: 8, background: 'linear-gradient(270deg,rgba(255,255,255,0.4),transparent)', filter: 'blur(1px)', zIndex: 30 }} />

                                        <div className="absolute bottom-0 left-0 right-0 overflow-hidden z-20"
                                            style={{ height: telemetryLoading ? '50%' : `${pct}%`, transition: 'height 1.5s cubic-bezier(0.34,1.56,0.64,1)', background: 'linear-gradient(180deg, #0A84FF 0%, #004ba0 100%)' }}>
                                            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'overlay' }} />
                                            {/* Level text inside water if high enough */}
                                            {pct > 15 && (
                                                <div className="absolute top-2 left-0 right-0 text-center text-white/40 font-bold text-xs pointer-events-none">
                                                    {Math.round(pct)}%
                                                </div>
                                            )}
                                            <div className="absolute bottom-0 w-[200%] h-full left-0 wave-animation" style={{ opacity: 0.8 }}>
                                                <svg viewBox="0 0 800 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                                                    <path d="M 0,30 Q 100,50 200,30 T 400,30 T 600,30 T 800,30 L 800,100 L 0,100 Z" fill="rgba(255,255,255,0.3)" />
                                                </svg>
                                            </div>
                                        </div>

                                        <div className="absolute right-3 top-0 bottom-0 flex flex-col justify-between py-6 z-30" style={{ opacity: 0.6, width: 32 }}>
                                            {[['100', true], ['', false], ['75', true], ['', false], ['50', true], ['', false], ['25', true], ['', false], ['0', true]].map(([lbl, show], i) => (
                                                <div key={i} className="flex items-center justify-end gap-1">
                                                    {show && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: '#475569' }}>{lbl}</span>}
                                                    <div style={{ width: (show as boolean) ? 8 : 4, height: 2, background: show ? '#94a3b8' : '#cbd5e1', borderRadius: 2 }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center z-10 mt-auto pt-2">
                                <span className="text-xs font-medium" style={{ color: '#8E8E93' }}>{staleLabel}</span>
                                <span className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                                    style={{ color: '#0A84FF', background: 'rgba(10,132,255,0.1)' }}>
                                    <span className="material-symbols-rounded" style={{ fontSize: 14 }}>sync</span> Live
                                </span>
                            </div>
                        </div>

                        {/* CORE STATS */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-8 flex flex-col relative group">
                            <div className="flex flex-col items-center justify-center flex-grow gap-8 z-10">
                                <div className="text-center">
                                    <p className="text-xs font-bold uppercase tracking-widest m-0 mb-2" style={{ color: '#8E8E93', letterSpacing: '0.15em' }}>Current Level</p>
                                    <div className="flex items-start justify-center">
                                        <span className="font-bold leading-none tracking-tight"
                                            style={{ fontSize: 88, color: '#1C1C1E' }}>
                                            {telemetryLoading ? '--' : Math.round(pct)}
                                        </span>
                                        <span className="font-semibold mt-3 ml-1" style={{ fontSize: 30, color: '#8E8E93' }}>%</span>
                                    </div>
                                    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold"
                                        style={{ background: trendInfo.bg, color: trendInfo.color }}>
                                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{trendInfo.icon}</span>
                                        {trendInfo.label}
                                    </div>
                                </div>

                                <div className="w-full h-px" style={{ background: 'rgba(0,0,0,0.08)' }} />

                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="text-center rounded-2xl p-4 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0 mb-1" style={{ color: '#8E8E93' }}>Volume</p>
                                        <p className="text-2xl font-black m-0 tracking-tight" style={{ color: '#0A84FF' }}>{formatVolume(metrics.volumeLitres)}</p>
                                    </div>
                                    <div className="text-center rounded-2xl p-4 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.04)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0 mb-1" style={{ color: '#8E8E93' }}>Capacity</p>
                                        <p className="text-2xl font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{formatVolume(metrics.capacityLitres)}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CONFIG PARAMS */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-6 lg:p-8 flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold m-0 flex items-center gap-2">
                                    Parameters
                                </h3>
                                <button onClick={handleReset} disabled={!cfgDirty}
                                    className="text-sm font-semibold transition-opacity bg-transparent border-none cursor-pointer"
                                    style={{ color: '#0A84FF', opacity: cfgDirty ? 1 : 0.4 }}>
                                    Reset
                                </button>
                            </div>

                            <div className="flex flex-col gap-5 flex-grow">
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider m-0 ml-1" style={{ color: '#8E8E93' }}>Dimensions</h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-medium ml-1" style={{ color: '#8E8E93' }}>Length (m)</label>
                                            <input type="number" step="0.1" value={localCfg.lengthM}
                                                onChange={e => patch({ lengthM: parseFloat(e.target.value) || 0 })}
                                                className="ios-input" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-medium ml-1" style={{ color: '#8E8E93' }}>Breadth (m)</label>
                                            <input type="number" step="0.1" value={localCfg.breadthM}
                                                onChange={e => patch({ breadthM: parseFloat(e.target.value) || 0 })}
                                                className="ios-input" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-medium ml-1" style={{ color: '#8E8E93' }}>Height (m)</label>
                                            <input type="number" step="0.1" value={localCfg.heightM}
                                                onChange={e => patch({ heightM: parseFloat(e.target.value) || 0 })}
                                                className="ios-input" />
                                        </div>
                                    </div>
                                    <div className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: 'rgba(10,132,255,0.08)', color: '#0A84FF' }}>
                                        Calculated Max: <strong>{formatVolume(previewCapacity)}</strong>
                                    </div>
                                </div>

                                {saveError && (
                                    <p className="text-xs font-semibold m-0" style={{ color: '#FF3B30' }}>⚠ {saveError}</p>
                                )}
                                <button onClick={handleSave} disabled={!cfgDirty || saving}
                                    className="w-full font-semibold py-3.5 rounded-2xl mt-auto"
                                    style={{
                                        background: cfgDirty ? '#1C1C1E' : 'rgba(0,0,0,0.08)',
                                        color: cfgDirty ? '#fff' : '#8E8E93',
                                        border: 'none',
                                        cursor: (cfgDirty && !saving) ? 'pointer' : 'default',
                                    }}>
                                    {saving ? 'Saving…' : 'Save Configuration'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Historical section */}
                    <section>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="apple-glass-card rounded-[2rem] p-6">
                                <h4 className="text-base font-semibold mb-6">Tank Level History</h4>
                                {historyLoading ? (
                                    <div className="h-[240px] flex items-center justify-center text-slate-400">Loading history…</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <AreaChart data={levelChartData.slice(-50)}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} />
                                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} />
                                            <Tooltip />
                                            <Area type="monotone" dataKey="level" stroke="#0A84FF" fill="rgba(10,132,255,0.1)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            <div className="apple-glass-card rounded-[2rem] p-6">
                                <h4 className="text-base font-semibold">Volume History</h4>
                                <p className="text-xs m-0 mt-0.5" style={{ color: '#8E8E93' }}>
                                    Volume in {volUnit} · {volumeChartData.length} data points
                                </p>
                                {historyLoading ? (
                                    <div className="h-[240px] flex items-center justify-center text-slate-400">Loading history…</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={240}>
                                        <AreaChart data={volumeChartData.slice(-50)}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} tickFormatter={(v) => volDivisor === 1000 ? `${(v / 1000).toFixed(1)}K` : v} />
                                            <Tooltip />
                                            <Area type="monotone" dataKey="volume" stroke="#FF9500" fill="rgba(255,149,0,0.1)" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default EvaraTankAnalytics;
