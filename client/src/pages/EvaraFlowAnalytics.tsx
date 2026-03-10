import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useStaleDataAge } from '../hooks/useStaleDataAge';
import { useDeviceAnalytics } from '../hooks/useDeviceAnalytics';
import type { NodeInfoData } from '../hooks/useDeviceAnalytics';
import { computeOnlineStatus } from '../utils/telemetryPipeline';
import type { FlowConfig } from '../hooks/useDeviceConfig';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelemetryPayload {
    timestamp: string;
    data: { entry_id: number;[key: string]: unknown };
    flow_rate?: number;
    total_liters?: number;
}

const EvaraFlowAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // ── Local state ───────────────────────────────────────────────────────────
    const [timeRange, setTimeRange] = useState<'24H' | '7D' | '30D'>('24H');
    const [displayUnit, setDisplayUnit] = useState<'m3' | 'L'>('m3');
    const [fieldTotal, setFieldTotal] = useState('field1');
    const [fieldFlow, setFieldFlow] = useState('field3');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

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
        : undefined) as FlowConfig | undefined;
    const telemetryData = (unifiedData?.latest && !('error' in unifiedData.latest)
        ? unifiedData.latest
        : undefined) as TelemetryPayload | undefined;
    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as any).data
        : undefined) as NodeInfoData | undefined;

    const historyFeeds = (unifiedData?.history as any)?.feeds || [];
    const maxFlowRate = deviceConfig?.max_flow_rate ?? 30;
    const historyLoading = analyticsLoading;

    // Online status
    const snapshotTs = telemetryData?.timestamp ?? null;
    const deviceLastSeen = deviceInfo?.last_seen ?? null;
    const bestTimestamp = snapshotTs ?? deviceLastSeen;
    const onlineStatus = computeOnlineStatus(bestTimestamp);

    // ── Seed field mapping state from DB config when it first loads ────────────
    useEffect(() => {
        if (!deviceConfig) return;
        if (deviceConfig.meter_reading_field) setFieldTotal(deviceConfig.meter_reading_field);
        if (deviceConfig.flow_rate_field) setFieldFlow(deviceConfig.flow_rate_field);
    }, [deviceConfig]);

    const isDataMissing = historyFeeds.length === 0;
    const isConfigMissing = hookError === "Telemetry configuration missing";
    const isOffline = onlineStatus === 'Offline';

    // ── Staleness ─────────────────────────────────────────────────────────────
    const { label: staleLabel } = useStaleDataAge(telemetryData?.timestamp ?? null);

    // ── Derived values ────────────────────────────────────────────────────────
    const deviceName = deviceInfo?.name ?? 'Flow Meter';
    const displayId = deviceInfo?.hardware_id ?? hardwareId ?? 'Unknown';
    const zoneName = deviceInfo?.zone_name ?? deviceInfo?.community_name ?? '';

    const flowRate = useMemo(() => {
        if (!telemetryData) return 0;
        if (telemetryData.flow_rate != null) return telemetryData.flow_rate;
        const v = parseFloat(telemetryData.data?.[fieldFlow] as string);
        if (!isNaN(v) && v >= 0) return v;
        return 0;
    }, [telemetryData, fieldFlow]);

    const totalRaw = useMemo(() => {
        if (!telemetryData) return 0;
        if (telemetryData.total_liters != null) return telemetryData.total_liters / 1000;
        const v = parseFloat(telemetryData.data?.[fieldTotal] as string);
        return isNaN(v) ? 0 : v;
    }, [telemetryData, fieldTotal]);

    const totalDisplay = displayUnit === 'L' ? totalRaw * 1000 : totalRaw;
    const totalUnit = displayUnit === 'L' ? 'L' : 'm³';

    // Odometer digits from total reading — 7-digit (6 black + 1 red)
    const odometer = useMemo(() => {
        const t = Math.abs(totalRaw);
        const intPart = Math.floor(t).toString().padStart(6, '0').slice(-6);
        const fracDigit = Math.floor((t % 1) * 10).toString();
        return { black: intPart.split(''), red: fracDigit };
    }, [totalRaw]);

    // Flow history derived from feeds
    const flowHistory = useMemo(() => {
        return historyFeeds.map((f: any) => {
            const d = new Date(f.timestamp || f.created_at);
            const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
            const rawFlow = f.flow_rate ?? parseFloat(f.raw?.[fieldFlow] as string) ?? 0;
            return { time, value: rawFlow };
        });
    }, [historyFeeds, fieldFlow]);

    // ── Save config ───────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        setSaving(true);
        setSaveError('');
        try {
            // Switching to primary admin endpoint for consistency
            await api.put(`/admin/nodes/${hardwareId}`, {
                max_flow_rate: maxFlowRate,
                meter_reading_field: fieldTotal,
                flow_rate_field: fieldFlow,
                thingspeak_channel_id: unifiedData?.config?.config?.thingspeak_channel_id,
                thingspeak_read_key: unifiedData?.config?.config?.thingspeak_read_api_key,
            });
            await queryClient.invalidateQueries({ queryKey: ['device-config', hardwareId] });
        } catch (err: any) {
            setSaveError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }, [hardwareId, maxFlowRate, fieldTotal, fieldFlow, queryClient, unifiedData]);

    // Guard: if no hardwareId in route, redirect to /nodes
    if (!hardwareId) return <Navigate to="/nodes" replace />;

    if (analyticsLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-solid animate-spin" style={{ borderColor: 'rgba(0,119,255,0.2)', borderTopColor: '#0077ff' }} />
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
                            <button onClick={() => navigate('/')} className="hover:text-[#0077ff] transition-colors bg-transparent border-none cursor-pointer p-0 flex items-center">
                                <span className="material-symbols-rounded" style={{ fontSize: 18 }}>home</span>
                            </button>
                            <span className="material-symbols-rounded" style={{ fontSize: 16, color: '#C7C7CC' }}>chevron_right</span>
                            <button onClick={() => navigate('/nodes')} className="hover:text-[#0077ff] transition-colors bg-transparent border-none cursor-pointer p-0 font-medium" style={{ color: '#8E8E93' }}>
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
                                style={{ background: 'rgba(0,119,255,0.1)', color: '#0077ff', border: 'none', cursor: 'pointer' }}>
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
                        {/* ANALOG BRASS METER */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-6 flex flex-col items-center justify-center gap-4">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isOffline ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                                {isOffline ? 'Offline' : 'Online'}
                            </div>

                            <div className="relative w-56 h-56 drop-shadow-2xl">
                                <svg viewBox="0 0 200 200" className="w-full h-full">
                                    <defs>
                                        <linearGradient id="brassBezelEF" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#dfbd69" />
                                            <stop offset="25%" stopColor="#926d25" />
                                            <stop offset="50%" stopColor="#fcf6ba" />
                                            <stop offset="75%" stopColor="#aa8431" />
                                            <stop offset="100%" stopColor="#654321" />
                                        </linearGradient>
                                        <radialGradient id="faceShadeEF" cx="50%" cy="50%" r="50%">
                                            <stop offset="85%" stopColor="#fdfaf2" />
                                            <stop offset="100%" stopColor="#d1d5db" />
                                        </radialGradient>
                                    </defs>
                                    <circle cx="100" cy="100" r="98" fill="url(#brassBezelEF)" stroke="#5d4037" strokeWidth="0.5" />
                                    <circle cx="100" cy="100" r="90" fill="#8d6e63" />
                                    <circle cx="100" cy="100" r="88" fill="url(#brassBezelEF)" />
                                    <circle cx="100" cy="100" r="84" fill="url(#faceShadeEF)" />

                                    {Array.from({ length: 28 }).map((_, i) => {
                                        const angle = -135 + i * (270 / 27);
                                        const rad = (angle * Math.PI) / 180;
                                        const isMajor = i % 3 === 0;
                                        const r1 = isMajor ? 66 : 70;
                                        return (
                                            <line key={i}
                                                x1={100 + r1 * Math.sin(rad)} y1={100 - r1 * Math.cos(rad)}
                                                x2={100 + 74 * Math.sin(rad)} y2={100 - 74 * Math.cos(rad)}
                                                stroke={isMajor ? '#94a3b8' : '#cbd5e1'} strokeWidth={isMajor ? 1.5 : 0.8} />
                                        );
                                    })}

                                    <g transform="translate(40, 78)">
                                        <rect x="0" y="0" width="120" height="22" rx="1" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.5" />
                                        {odometer.black.map((digit, i) => (
                                            <g key={i} transform={`translate(${4 + i * 15}, 3)`}>
                                                <rect x="0" y="0" width="13" height="16" rx="1" fill="#1a1a1a" />
                                                <text x="6.5" y="12.5" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10" fontWeight="bold">{digit}</text>
                                            </g>
                                        ))}
                                        <g transform="translate(94, 3)">
                                            <rect x="0" y="0" width="13" height="16" rx="1" fill="#ef4444" />
                                            <text x="6.5" y="12.5" textAnchor="middle" fill="white" fontFamily="monospace" fontSize="10" fontWeight="bold">{odometer.red}</text>
                                        </g>
                                    </g>
                                </svg>
                            </div>

                            <div className="text-center">
                                <p className="text-xs font-bold uppercase tracking-widest m-0" style={{ color: '#8E8E93' }}>Flow Rate</p>
                                <h3 className="text-4xl font-black text-slate-800 m-0 mt-1 tabular-nums">
                                    {flowRate.toFixed(1)}
                                    <span className="text-xl font-medium text-slate-400 ml-1">L/min</span>
                                </h3>
                                <p className="text-xs font-medium m-0 mt-1" style={{ color: '#8E8E93' }}>{staleLabel}</p>
                            </div>
                        </div>

                        {/* DEVICE CONFIG CARD */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-6 flex flex-col">
                            <div className="mb-5">
                                <h1 className="text-2xl font-bold text-slate-900 m-0">{deviceName}</h1>
                                <p className="text-sm m-0" style={{ color: '#8E8E93' }}>{zoneName ? `${zoneName} · ` : ''}ID: {displayId}</p>
                            </div>

                            <div className="flex flex-col gap-3 mb-5">
                                <div className="p-4 rounded-2xl" style={{ background: 'rgba(0,119,255,0.05)' }}>
                                    <p className="text-xs font-semibold uppercase tracking-wider m-0 mb-1" style={{ color: '#0077ff' }}>Total Usage</p>
                                    <p className="text-4xl font-black m-0 leading-tight">
                                        {totalDisplay.toFixed(1)} <span className="text-base font-normal text-slate-500">{totalUnit}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                                <p className="text-xs font-bold uppercase tracking-widest m-0 mb-3" style={{ color: '#8E8E93' }}>Display Units</p>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => setDisplayUnit('m3')} className="ios-input text-left flex justify-between" style={{ background: displayUnit === 'm3' ? 'rgba(0,119,255,0.1)' : 'transparent' }}>
                                        <span>Cubic Metres (m³)</span>
                                        {displayUnit === 'm3' && <span className="material-symbols-rounded">check</span>}
                                    </button>
                                    <button onClick={() => setDisplayUnit('L')} className="ios-input text-left flex justify-between" style={{ background: displayUnit === 'L' ? 'rgba(0,119,255,0.1)' : 'transparent' }}>
                                        <span>Litres (L)</span>
                                        {displayUnit === 'L' && <span className="material-symbols-rounded">check</span>}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* THINGSPEAK FIELDS */}
                        <div className="lg:col-span-4 apple-glass-card rounded-[2.5rem] p-6 flex flex-col">
                            <p className="text-xs font-bold uppercase tracking-widest m-0 mb-4" style={{ color: '#8E8E93' }}>ThingSpeak Fields</p>
                            <div className="flex flex-col gap-3 mb-5">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider px-1">Total Field</label>
                                    <select value={fieldTotal} onChange={e => setFieldTotal(e.target.value)} className="ios-input">
                                        <option value="field1">Field 1 (m³)</option>
                                        <option value="field2">Field 2 (m³)</option>
                                        <option value="field3">Field 3 (m³)</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider px-1">Flow Field</label>
                                    <select value={fieldFlow} onChange={e => setFieldFlow(e.target.value)} className="ios-input">
                                        <option value="field1">Field 1 (L/min)</option>
                                        <option value="field2">Field 2 (L/min)</option>
                                        <option value="field3">Field 3 (L/min)</option>
                                    </select>
                                </div>
                            </div>

                            {saveError && <p className="text-xs font-semibold m-0 mb-3" style={{ color: '#FF3B30' }}>⚠ {saveError}</p>}
                            <button onClick={handleSave} disabled={saving} className="w-full font-bold py-3.5 rounded-2xl bg-[#0077ff] text-white mt-auto">
                                {saving ? 'Saving…' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>

                    <div className="apple-glass-card rounded-[2.5rem] p-8">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold m-0">Flow Analytics</h2>
                                <p className="text-xs font-semibold mt-1 m-0" style={{ color: '#8E8E93' }}>
                                    Flow Rate (L/min) — {timeRange} window
                                </p>
                            </div>
                            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.05)' }}>
                                {(['24H', '7D', '30D'] as const).map(t => (
                                    <button key={t} onClick={() => setTimeRange(t)}
                                        className="px-4 py-1.5 text-xs font-bold rounded-lg transition-all"
                                        style={timeRange === t
                                            ? { background: 'rgba(255,255,255,0.9)', color: '#1C1C1E', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
                                            : { color: '#8E8E93', background: 'transparent' }}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {historyLoading ? (
                            <div className="h-72 flex items-center justify-center">Analysing flow data…</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={flowHistory.slice(-50)}>
                                    <defs>
                                        <linearGradient id="flowGradEF" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0077ff" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#0077ff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                    <RechartsTooltip />
                                    <Area type="monotone" dataKey="value" stroke="#0077ff" fill="url(#flowGradEF)" strokeWidth={2.5} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default EvaraFlowAnalytics;
