import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import {
    TrendingUp, TrendingDown, Timer, Droplets,
    RefreshCw, Zap, BarChart3, Clock, Calendar, Activity
} from 'lucide-react';
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
import { useWaterAnalytics } from '../hooks/useWaterAnalytics';

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
    const { user } = useAuth();

    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // ── Config panel form state ───────────────────────────────────────────────
    const [localCfg, setLocalCfg] = useState<LocalTankConfig>(DEFAULT_LOCAL_CFG);
    const [cfgDirty, setCfgDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showParams, setShowParams] = useState(false);
    const [showNodeInfo, setShowNodeInfo] = useState(false);
    const [showSecondaryInsights, setShowSecondaryInsights] = useState(false);
    const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);

    // ── Unified Analytics Data ────────────────────────────────────────────────
    const {
        data: unifiedData,
        isLoading: analyticsLoading,
        refetch
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

    const tankBehavior = (unifiedData as any)?.tankBehavior;

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

    // ── Water Analytics ────────────────────────────────────────────────────────
    const rawSensorField = activeTelemetry?.data?.[localCfg.fieldDepth] as string | number | undefined;
    const sensorDistanceM = rawSensorField != null ? parseFloat(String(rawSensorField)) / 100 : null;

    const waterAnalytics = useWaterAnalytics(
        localCfg.heightM,
        metrics.capacityLitres,
        sensorDistanceM,
        metrics.volumeLitres,
        metrics.percentage,
        activeTelemetry?.timestamp || new Date().toISOString(),
        liveFeeds
    );
    const combinedChartData = useMemo(() => {
        const data: { time: string; level: number; volume: number }[] = [];

        for (const feed of liveFeeds) {
            const d = new Date(feed.timestamp || feed.created_at);
            const time = `${d.getHours().toString().padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            data.push({
                time,
                level: feed.level_percentage || feed.level || feed.percentage || 0,
                volume: feed.total_liters || feed.volume || feed.currentVolume || 0
            });
        }
        return data;
    }, [liveFeeds]);

    const pct = metrics.percentage;
    const deviceName = deviceInfo?.name || (deviceInfo as any)?.label || 'Tank';

    // ── Computed capacity preview ─────────────────────────────────────────────
    const previewCapacity = useMemo(
        () => computeCapacityLitres({ tankShape: localCfg.tankShape, heightM: localCfg.heightM, lengthM: localCfg.lengthM, breadthM: localCfg.breadthM, radiusM: localCfg.radiusM, capacityOverrideLitres: localCfg.capacityOverrideLitres }),
        [localCfg],
    );

    // ── Config save ───────────────────────────────────────────────────────────
    // ── Config save ───────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError(null);
        try {
            await api.put(`/admin/nodes/${hardwareId}`, localToApiBody(localCfg));
            await queryClient.invalidateQueries({ queryKey: ['device_config', hardwareId] });
            setCfgDirty(false);
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    }, [hardwareId, localCfg, queryClient]);

    function patch(updates: Partial<LocalTankConfig>) {
        setLocalCfg((prev) => ({ ...prev, ...updates }));
        setCfgDirty(true);
    }

    // ── Volume unit for chart axis ─────────────────────
    const { volDivisor } = useMemo(() => {
        const maxVol = Math.max(...combinedChartData.map(d => d.volume), 1);
        return maxVol >= 1000 ? { volDivisor: 1000 } : { volDivisor: 1 };
    }, [combinedChartData]);

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
        <div className="min-h-screen font-sans relative overflow-x-hidden" style={{
            background: 'linear-gradient(145deg, #e8f0fe 0%, #d1e3f4 50%, #b8d4e8 100%)',
            color: '#1C1C1E'
        }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* Breadcrumb + Page Heading row */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                            <nav className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#8E8E93' }}>
                                <button onClick={() => navigate('/')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Home
                                </button>
                                <span className="text-[#C7C7CC]">›</span>
                                <button onClick={() => navigate('/nodes')} className="hover:text-[#FF9500] transition-colors bg-transparent border-none cursor-pointer p-0 font-medium" style={{ color: '#8E8E93' }}>
                                    All Nodes
                                </button>
                                <span className="text-[#C7C7CC]">›</span>
                                {deviceName}
                            </nav>
                            <h1 className="text-3xl font-bold tracking-tight m-0" style={{ color: '#1C1C1E' }}>
                                {deviceName} Analytics
                            </h1>
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                                style={{ background: isOffline ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)', color: isOffline ? '#FF3B30' : '#34C759' }}>
                                <span className="relative flex" style={{ width: 8, height: 8 }}>
                                    {!isOffline && <span className="absolute inset-0 rounded-full" style={{ background: '#34C759', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.75 }} />}
                                    <span className="relative rounded-full block w-full h-full" style={{ background: isOffline ? '#FF3B30' : '#34C759' }} />
                                </span>
                                {isOffline ? 'Offline' : 'Online'}
                            </div>
                            <button
                                className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1.5 transition-all hover:scale-95"
                                style={{
                                    background: 'rgba(175,82,222,0.1)',
                                    color: '#AF52DE',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setShowNodeInfo(true)}
                            >
                                Node Info
                            </button>
                            <button onClick={() => setShowParams(true)}
                                className="flex items-center gap-1.5 text-sm font-semibold rounded-full px-3 py-1.5 transition-all hover:scale-95"
                                style={{ background: 'rgba(255,149,0,0.1)', color: '#FF9500', border: 'none', cursor: 'pointer' }}>
                                Parameters
                            </button>
                            <button onClick={() => refetch()}
                                className="flex items-center justify-center gap-1.5 text-sm font-semibold rounded-full px-4 py-1.5 transition-all hover:scale-95"
                                style={{ background: 'rgba(10,132,255,0.1)', color: '#0A84FF', border: 'none', cursor: 'pointer' }}>
                                Refresh
                            </button>
                        </div>

                        {/* Parameters Popup Modal */}
                        {showParams && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                                onClick={() => setShowParams(false)}>
                                <div className="rounded-[1.5rem] p-6 flex flex-col w-full max-w-sm"
                                    style={{ background: '#e5e5e5', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}
                                    onClick={e => e.stopPropagation()}>

                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-[17px] font-bold m-0" style={{ color: '#1c1c1e' }}>Parameters</h3>
                                        <button onClick={() => setShowParams(false)}
                                            className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0"
                                            style={{ width: 24, height: 24, color: '#3c3c43', fontSize: '18px', fontWeight: 'bold' }}>
                                            &times;
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 mb-5">
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Length</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.lengthM}
                                                    onChange={e => patch({ lengthM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Breadth</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.breadthM}
                                                    onChange={e => patch({ breadthM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl" style={{ background: '#f5f5f5', border: '1px solid rgba(0,0,0,0.03)' }}>
                                            <label className="text-[10px] font-bold" style={{ color: '#8e8e93' }}>Height</label>
                                            <div className="flex items-baseline gap-1">
                                                <input type="number" step="0.1" value={localCfg.heightM}
                                                    onChange={e => patch({ heightM: parseFloat(e.target.value) || 0 })}
                                                    className="w-14 text-right font-bold text-sm bg-transparent border-none outline-none p-0 m-0"
                                                    style={{ color: '#1c1c1e', WebkitAppearance: 'none', MozAppearance: 'textfield' }} />
                                                <span className="text-sm font-bold" style={{ color: '#1c1c1e' }}>m</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl mb-5" style={{ background: '#c6d6ef' }}>
                                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#0A84FF' }}>Estimated Capacity</span>
                                        <span className="text-xl font-bold" style={{ color: '#2b4d83' }}>{formatVolume(previewCapacity)}</span>
                                    </div>

                                    {saveError && (
                                        <p className="text-[11px] font-bold text-center mt-0 mb-3" style={{ color: '#FF3B30' }}>{saveError}</p>
                                    )}

                                    {user?.role === "superadmin" && (
                                        <button onClick={async () => { await handleSave(); if (!saveError) setShowParams(false); }} disabled={!cfgDirty || saving}
                                            className="w-full font-semibold py-3.5 rounded-2xl text-white border-none cursor-pointer transition-opacity"
                                            style={{
                                                background: '#3A82F6',
                                                opacity: (cfgDirty && !saving) ? 1 : 0.5,
                                                pointerEvents: (cfgDirty && !saving) ? 'auto' : 'none',
                                                fontSize: '14px',
                                            }}>
                                            {saving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                    )}

                                </div>
                            </div>
                        )}
                    </div>

                    {/* Node Info Modal */}
                    {showNodeInfo && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setShowNodeInfo(false)}>
                            <div className="rounded-[1.5rem] p-6 flex flex-col w-full max-w-2xl"
                                style={{
                                    background: 'linear-gradient(145deg, #e8f0fe 0%, #d1e3f4 50%, #b8d4e8 100%)',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-[17px] font-bold m-0" style={{ color: '#1c1c1e' }}>Node Information</h3>
                                    <button onClick={() => setShowNodeInfo(false)}
                                        className="flex items-center justify-center rounded-full bg-white border-none cursor-pointer p-0 transition-all hover:scale-110"
                                        style={{
                                            width: 24,
                                            height: 24,
                                            background: '#f5f5f5',
                                            color: '#3c3c43',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                        }}>
                                        &times;
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Device Name</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>{deviceName}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Hardware ID</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>{hardwareId}</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Device Type</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>Water Tank Monitor</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Location</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>Not specified</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Subscription</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#2c3e50' }}>PRO</p>
                                    </div>

                                    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5e7c9a' }}>Status</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: isOffline ? '#e74c3c' : '#27ae60' }}>
                                            {isOffline ? 'Offline' : 'Online'}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl text-white border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            background: '#AF52DE',
                                            fontSize: '14px'
                                        }}
                                        onClick={() => {
                                            const info = `Device Name: ${deviceName}\nHardware ID: ${hardwareId}\nDevice Type: Water Tank Monitor\nLocation: Not specified\nSubscription: PRO\nStatus: ${isOffline ? 'Offline' : 'Online'}`;
                                            navigator.clipboard.writeText(info);
                                            alert('Node information copied to clipboard!');
                                        }}
                                    >
                                        Copy Info
                                    </button>
                                    <button
                                        className="flex-1 font-semibold py-3 rounded-2xl border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{
                                            background: '#f5f5f5',
                                            color: '#1c1c1e',
                                            fontSize: '14px'
                                        }}
                                        onClick={() => setShowNodeInfo(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch w-full">
                        {/* TANK VISUALIZER */}
                        <div className="apple-glass-card rounded-[2.5rem] p-6 flex flex-col relative overflow-hidden h-full flex-grow">
                            <div className="flex justify-between items-center mb-2 z-10 w-full">
                                <div>
                                    <h3 className="text-xl font-semibold m-0 leading-tight">{deviceName}</h3>
                                </div>
                                <div className="flex items-center">
                                    <span className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1"
                                        style={{ color: '#0A84FF', background: 'rgba(10,132,255,0.1)' }}>
                                        <span className="material-symbols-rounded" style={{ fontSize: 14 }}>sync</span> Live
                                    </span>
                                </div>
                            </div>

                            <div className="flex-grow flex items-center justify-center py-4 z-10 mt-4 mb-4" style={{ minHeight: '300px' }}>
                                <div className="relative" style={{ width: 160, height: 230 }}>
                                    <div className="absolute inset-0 rounded-[40px] overflow-hidden z-10 tank-glass"
                                        style={{ border: '3px solid rgba(255,255,255,0.6)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}>
                                        <div className="absolute top-0 bottom-0 left-2" style={{ width: 16, background: 'linear-gradient(90deg,rgba(255,255,255,0.6),transparent)', filter: 'blur(2px)', zIndex: 30 }} />
                                        <div className="absolute top-0 bottom-0 right-1" style={{ width: 8, background: 'linear-gradient(270deg,rgba(255,255,255,0.4),transparent)', filter: 'blur(1px)', zIndex: 30 }} />

                                        <div className="absolute bottom-0 left-0 right-0 overflow-hidden z-20"
                                            style={{ height: telemetryLoading ? '50%' : `${pct}%`, transition: 'height 1.5s cubic-bezier(0.34,1.56,0.64,1)', background: 'linear-gradient(180deg, #0A84FF 0%, #004ba0 100%)' }}>
                                            <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'overlay' }} />
                                            {/* Level text inside water if high enough */}
                                            {pct > 15 && (
                                                <div className="absolute top-6 left-0 right-0 text-center pointer-events-none z-30"
                                                    style={{
                                                        color: '#ffffff',
                                                        fontSize: '36px',
                                                        fontWeight: 800,
                                                        lineHeight: 1,
                                                        textShadow: '0 2px 6px rgba(0,0,0,0.35)',
                                                        letterSpacing: '-1px'
                                                    }}>
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

                            <div className="flex flex-col mt-auto pt-4 gap-2 z-10 w-full">
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 w-full">
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#0A84FF' }}>Water Level</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#0A84FF' }}>{Math.round(pct)}%</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Water Height</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{waterAnalytics.waterHeightM.toFixed(1)} m</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Sensor</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{waterAnalytics.sensorDistanceM.toFixed(2)} m</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#34C759' }}>Available</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#115C29' }}>{Math.round(metrics.volumeLitres).toLocaleString()} L</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#8E8E93' }}>Total Cap</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#1C1C1E' }}>{Math.round(metrics.capacityLitres).toLocaleString()} L</p>
                                    </div>
                                    <div className="text-left rounded-xl p-2 flex flex-col justify-center" style={{ background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.1)' }}>
                                        <p className="text-[8px] font-bold uppercase tracking-wider m-0 mb-0.5" style={{ color: '#FF9500' }}>Remaining</p>
                                        <p className="text-sm font-black m-0 tracking-tight" style={{ color: '#995900' }}>{Math.round(waterAnalytics.remainingCapacityLiters).toLocaleString()} L</p>
                                    </div>
                                </div>

                                <div className="text-center w-full mt-1">
                                    <span className="text-[10px] font-medium" style={{ color: '#8E8E93' }}>{staleLabel}</span>
                                </div>
                            </div>
                        </div>

                        {/* COMBINED HISTORY CHART AND RATE CARDS */}
                        <div className="lg:col-span-2 flex flex-col gap-2 w-full h-full">
                            {/* RATE CARDS */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full">
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px' }}>
                                    <div className="flex items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(52,199,89,0.15)' }}>
                                            <TrendingUp size={22} color="#34C759" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Fill Rate</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#34C759' }}>
                                            {waterAnalytics.fillRateLpm > 0 ? (
                                                <>+{waterAnalytics.fillRateLpm.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/min</span></>
                                            ) : '--'}
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px' }}>
                                    <div className="flex items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(255,59,48,0.15)' }}>
                                            <TrendingDown size={22} color="#FF3B30" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Consumption</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#FF3B30' }}>
                                            {waterAnalytics.drainRateLpm > 0 ? (
                                                <>-{waterAnalytics.drainRateLpm.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/min</span></>
                                            ) : '--'}
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px' }}>
                                    <div className="flex items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(255,149,0,0.15)' }}>
                                            <Timer size={22} color="#FF9500" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Est. Empty</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#FF9500' }}>
                                            {waterAnalytics.estimatedEmptyTimeMinutes ?
                                                `${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedEmptyTimeMinutes % 60)}m`
                                                : '--'}
                                        </p>
                                    </div>
                                </div>
                                <div className="apple-glass-card text-left rounded-[1.5rem] p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.25)', border: '1px solid rgba(255,255,255,0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px' }}>
                                    <div className="flex items-start">
                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(10,132,255,0.15)' }}>
                                            <Droplets size={22} color="#0A84FF" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Est. Full</p>
                                        <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: '#0A84FF' }}>
                                            {waterAnalytics.estimatedFullTimeMinutes ?
                                                (waterAnalytics.estimatedFullTimeMinutes > 60 ?
                                                    `${Math.floor(waterAnalytics.estimatedFullTimeMinutes / 60)}h ${Math.floor(waterAnalytics.estimatedFullTimeMinutes % 60)}m`
                                                    : `${Math.floor(waterAnalytics.estimatedFullTimeMinutes)} min`)
                                                : '--'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* COMBINED HISTORY CHART */}
                            <div className="apple-glass-card flex flex-col items-stretch justify-between relative overflow-hidden flex-grow" style={{
                                background: 'rgba(255, 255, 255, 0.25)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                borderRadius: '24px',
                                border: '1px solid rgba(255,255,255,0.35)',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                                padding: '24px',
                                height: '100%',
                                minHeight: '350px'
                            }}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="m-0" style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(0,0,0,0.75)' }}>
                                            TANK LEVEL AND VOLUME
                                        </h4>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#0A84FF' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>Tank Level (%)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#FF9500' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(0,0,0,0.5)' }}>Volume</span>
                                        </div>
                                    </div>
                                </div>

                                {historyLoading ? (
                                    <div className="flex-grow flex items-center justify-center text-slate-400">Loading history…</div>
                                ) : (
                                    <div className="flex-grow flex flex-col relative justify-end">
                                        <ResponsiveContainer width="100%" height={280}>
                                            <AreaChart data={combinedChartData.slice(-50)} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#FF9500" stopOpacity={0.15} />
                                                        <stop offset="95%" stopColor="#FF9500" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8E8E93' }} />

                                                {/* LEFT Y-AXIS - LEVEL % */}
                                                <YAxis yAxisId="left" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#0A84FF' }}
                                                    label={{ value: 'Level (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#0A84FF', fontWeight: 600 } }} />

                                                {/* RIGHT Y-AXIS - VOLUME KL */}
                                                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#FF9500' }}
                                                    tickFormatter={(v) => volDivisor === 1000 ? `${(v / 1000).toFixed(1)}K` : v}
                                                    label={{ value: `Volume (${volDivisor === 1000 ? 'KL' : 'L'})`, angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fontSize: 10, fill: '#FF9500', fontWeight: 600 } }} />

                                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }} />


                                                <Area yAxisId="left" type="monotone" name="Tank Level (%)" dataKey="level" stroke="#0A84FF" fillOpacity={1} fill="url(#colorLevel)" strokeWidth={2.5} />
                                                <Area yAxisId="right" type="monotone" name="Volume" dataKey="volume" stroke="#FF9500" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2.5} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* TANK BEHAVIOR ANALYTICS SECTION */}
                    <div className="flex flex-col gap-4 mt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity size={20} className="text-[#0A84FF]" />
                            <h2 className="text-xl font-bold m-0" style={{ color: '#1C1C1E' }}>Tank Behavior Analytics</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* REFILL BEHAVIOR CARD */}
                            <div className="apple-glass-card rounded-[2rem] p-6 flex flex-col gap-4"
                                style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl" style={{ background: 'rgba(52,199,89,0.1)' }}>
                                            <RefreshCw size={18} className="text-[#34C759]" />
                                        </div>
                                        <span className="font-bold text-sm" style={{ color: '#3c3c43' }}>Refill Behavior</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Today</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-1">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Refills Today</span>
                                        <span className="text-2xl font-black" style={{ color: '#1C1C1E' }}>{tankBehavior?.refillAnalytics?.refillsToday ?? 0}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Last Refill</span>
                                        <span className="text-2xl font-black" style={{ color: '#1C1C1E' }}>{tankBehavior?.refillAnalytics?.lastRefillTime ?? '--'}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 p-3 rounded-2xl" style={{ background: 'rgba(52,199,89,0.05)', border: '1px solid rgba(52,199,89,0.1)' }}>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold uppercase" style={{ color: '#34C759' }}>Avg. Refill Duration</span>
                                        <span className="text-sm font-bold" style={{ color: '#115C29' }}>{tankBehavior?.refillAnalytics?.averageRefillDuration ?? 0} min</span>
                                    </div>
                                    {/* Mini Refill Timeline Bar */}
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                        {(tankBehavior?.refillAnalytics?.refillTimeline || [0, 0, 1, 0, 1, 0, 0, 0, 1, 0]).map((active: number, i: number) => (
                                            <div key={i} className="h-full flex-grow" style={{
                                                background: active ? '#34C759' : 'transparent',
                                                borderRight: i < 9 ? '1px solid rgba(0,0,0,0.02)' : 'none'
                                            }} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* DAILY CONSUMPTION CARD */}
                            <div className="apple-glass-card rounded-[2rem] p-6 flex flex-col gap-4"
                                style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl" style={{ background: 'rgba(255,59,48,0.1)' }}>
                                            <BarChart3 size={18} className="text-[#FF3B30]" />
                                        </div>
                                        <span className="font-bold text-sm" style={{ color: '#3c3c43' }}>Consumption Analysis</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Trend</span>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Today</span>
                                            <span className="text-xl font-black" style={{ color: '#1C1C1E' }}>{tankBehavior?.consumptionAnalytics?.todayConsumption?.toLocaleString() ?? 0} L</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Yesterday</span>
                                            <span className="text-sm font-bold" style={{ color: '#3c3c43' }}>{tankBehavior?.consumptionAnalytics?.yesterdayConsumption?.toLocaleString() ?? 0} L</span>
                                        </div>
                                    </div>

                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                                        <div className="absolute h-full left-0 top-0 bg-[#FF3B30] rounded-full transition-all duration-1000"
                                            style={{ width: `${Math.min(100, ((tankBehavior?.consumptionAnalytics?.todayConsumption || 0) / (tankBehavior?.consumptionAnalytics?.averageDailyConsumption || 1)) * 50)}%` }} />
                                    </div>

                                    <div className="flex justify-between items-center pt-1">
                                        <div className="flex items-center gap-1">
                                            <Calendar size={12} className="text-[#8E8E93]" />
                                            <span className="text-[10px] font-bold" style={{ color: '#8E8E93' }}>Avg. Daily</span>
                                        </div>
                                        <span className="text-xs font-bold" style={{ color: '#1C1C1E' }}>{tankBehavior?.consumptionAnalytics?.averageDailyConsumption?.toLocaleString() ?? 0} L</span>
                                    </div>
                                </div>
                            </div>

                            {/* PEAK USAGE CARD */}
                            <div className="apple-glass-card rounded-[2rem] p-6 flex flex-col gap-4"
                                style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 rounded-xl" style={{ background: 'rgba(10,132,255,0.1)' }}>
                                            <Zap size={18} className="text-[#0A84FF]" />
                                        </div>
                                        <span className="font-bold text-sm" style={{ color: '#3c3c43' }}>Peak Usage</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Detected</span>
                                </div>

                                <div className="flex flex-col gap-1 my-2">
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-[#8E8E93]" />
                                        <span className="text-2xl font-black" style={{ color: '#1C1C1E' }}>{tankBehavior?.peakUsage?.peakTime || '--'}</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Peak Activity Time</span>
                                </div>

                                <div className="mt-auto p-4 rounded-2xl flex flex-col items-center justify-center gap-1" style={{ background: 'linear-gradient(135deg, #0A84FF 0%, #007AFF 100%)', boxShadow: '0 10px 20px rgba(10,132,255,0.2)' }}>
                                    <span className="text-[10px] font-bold uppercase text-white opacity-80">Max Drain Rate</span>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black text-white">{tankBehavior?.peakUsage?.peakDrainRate ?? 0}</span>
                                        <span className="text-xs font-bold text-white opacity-90">L/min</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECONDARY INSIGHTS (Collapsible) */}
                    <div className="flex flex-col gap-4 mt-6">
                        <button onClick={() => setShowSecondaryInsights(!showSecondaryInsights)}
                            className="flex items-center justify-between w-full p-4 rounded-2xl transition-all hover:bg-white/40"
                            style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                            <div className="flex items-center gap-2">
                                <Activity size={20} className="text-[#3c3c43]" />
                                <h2 className="text-lg font-bold m-0" style={{ color: '#1C1C1E' }}>Device & Alert Insights</h2>
                            </div>
                            <span className="font-bold text-[#8E8E93]">{showSecondaryInsights ? '▲' : '▼'}</span>
                        </button>
                        
                        {showSecondaryInsights && (
                            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: 'rgba(255,59,48,0.05)', border: '1px solid rgba(255,59,48,0.1)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#FF3B30' }}>Low Water Alert</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{pct < 20 ? 'Triggered (Below 20%)' : 'Normal'}</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.1)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#FF9500' }}>Overflow Risk</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{pct > 95 ? 'High Risk' : 'Low'}</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: 'rgba(175,82,222,0.05)', border: '1px solid rgba(175,82,222,0.1)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#AF52DE' }}>Rapid Depletion</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{waterAnalytics.drainRateLpm > 50 ? 'Detected' : 'Normal'}</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.1)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#0A84FF' }}>Last Comm.</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{activeTelemetry?.timestamp ? new Date(activeTelemetry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: isOffline ? 'rgba(255,59,48,0.05)' : 'rgba(52,199,89,0.05)', border: isOffline ? '1px solid rgba(255,59,48,0.1)' : '1px solid rgba(52,199,89,0.1)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: isOffline ? '#FF3B30' : '#34C759' }}>Connection</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{isOffline ? 'Disconnected' : 'Active'}</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col justify-center gap-1" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Signal Strength</span>
                                    <span className="text-sm font-black text-[#1C1C1E] tracking-tight">{(activeTelemetry?.data as any)?.rssi ? `${(activeTelemetry?.data as any).rssi} dBm` : 'Unknown'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ADVANCED ANALYTICS (Expandable) */}
                    <div className="flex flex-col gap-4 mt-2">
                        <button onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
                            className="flex items-center justify-center gap-2 w-full p-3 rounded-full transition-all hover:bg-white/40 font-bold"
                            style={{ background: 'transparent', border: '1px dashed rgba(0,0,0,0.15)', color: '#3c3c43', cursor: 'pointer' }}>
                            View Advanced Analytics {showAdvancedAnalytics ? '▲' : '▼'}
                        </button>
                        
                        {showAdvancedAnalytics && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col gap-0.5 justify-center" style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Yesterday's Consump.</span>
                                    <span className="text-lg font-black text-[#1C1C1E] tracking-tight">{tankBehavior?.consumptionAnalytics?.yesterdayConsumption?.toLocaleString() ?? 0} <span className="text-[12px] font-bold" style={{ color: '#8E8E93' }}>L</span></span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col gap-0.5 justify-center" style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Avg Daily Consump.</span>
                                    <span className="text-lg font-black text-[#1C1C1E] tracking-tight">{tankBehavior?.consumptionAnalytics?.averageDailyConsumption?.toLocaleString() ?? 0} <span className="text-[12px] font-bold" style={{ color: '#8E8E93' }}>L</span></span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col gap-0.5 justify-center" style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Tank Dimensions</span>
                                    <span className="text-sm mt-1 font-black text-[#1C1C1E] tracking-tight">{localCfg.lengthM}x{localCfg.breadthM}x{localCfg.heightM}m</span>
                                </div>
                                <div className="apple-glass-card p-4 rounded-xl flex flex-col gap-0.5 justify-center" style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.3)' }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Calibration Data</span>
                                    <span className="text-sm mt-1 font-black text-[#1C1C1E] tracking-tight">System Offset: 0.0m</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* FUTURE ANALYTICS (Placeholder) */}
                    <div className="flex flex-col gap-4 mt-6 mb-8 pt-6 border-t border-dashed" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                        <div className="flex items-center justify-between opacity-50 px-2">
                            <div className="flex items-center gap-2">
                                <Clock size={18} className="text-[#8E8E93]" />
                                <h2 className="text-sm uppercase tracking-widest font-bold m-0" style={{ color: '#8E8E93' }}>Future Features In Development</h2>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 opacity-50">
                            {['Water Usage Forecast', 'Leak Probability', 'Refill Efficiency', 'Event Timeline', 'Comparison Analytics'].map((feat, i) => (
                                <div key={i} className="apple-glass-card p-3 rounded-xl flex items-center justify-center text-center" style={{ background: 'rgba(255,255,255,0.15)', border: '1px dashed rgba(0,0,0,0.15)' }}>
                                    <span className="text-[11px] font-bold text-[#808080] tracking-tight">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default EvaraTankAnalytics;
