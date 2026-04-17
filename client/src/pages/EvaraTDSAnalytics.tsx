import { useState, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import TDSMeterVisual from '../components/dashboard/TDSMeterVisual';

import { useQuery } from '@tanstack/react-query';
import {
    Thermometer, Droplets,
    ChevronLeft, ChevronRight, AlertTriangle,
    Activity, Shield as ShieldIcon, Bell
} from 'lucide-react';
import api from '../services/api';
import clsx from 'clsx';

// Constants for Water Quality
const QUALITY_CONFIG = {
    Good: {
        color: '#10b981', // emerald-500
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-500',
        icon: ShieldIcon,
        description: 'Water is safe for consumption and general use.'
    },
    Acceptable: {
        color: '#f59e0b', // amber-500
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-500',
        icon: AlertTriangle,
        description: 'TDS levels are slightly elevated. Consider filtration.'
    },
    Critical: {
        color: '#ef4444', // red-500
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-500',
        icon: AlertTriangle,
        description: 'High TDS levels detected. Unsafe for direct consumption.'
    }
};

const EvaraTDSAnalytics = () => {
    const { hardwareId } = useParams<{ hardwareId: string }>();
    const navigate = useNavigate();
    const [chartRange, setChartRange] = useState<'24H' | '1W' | '1M' | 'Range'>('24H');

    // Fetch EvaraTDS data
    const { data: device, isLoading, isError } = useQuery({
        queryKey: ['evaratds_device', hardwareId],
        queryFn: async () => {
            if (!hardwareId) return null;

            const [telemetryRes, historyRes, analyticsRes] = await Promise.all([
                api.get(`/devices/tds/${hardwareId}/telemetry`),
                api.get(`/devices/tds/${hardwareId}/history`),
                api.get(`/devices/tds/${hardwareId}/analytics`)
            ]);

            const telemetry = telemetryRes.data;
            const history = historyRes.data;
            const analytics = analyticsRes.data;

            // Map backend quality to frontend config keys
            let waterQualityRating = "Good";
            const q = telemetry.quality || "UNKNOWN";
            if (q === "EXCELLENT" || q === "GOOD") waterQualityRating = "Good";
            else if (q === "FAIR" || q === "POOR") waterQualityRating = "Acceptable";
            else if (q === "VERY_POOR") waterQualityRating = "Critical";

            return {
                deviceName: telemetry.label || "TDS Sensor",
                tdsValue: telemetry.tds_value,
                temperature: telemetry.temperature,
                waterQualityRating,
                lastUpdated: telemetry.last_updated,
                tdsHistory: (history.data || []).map((h: any) => ({
                    timestamp: h.timestamp,
                    value: h.tds_value
                })),
                tdsAvg: analytics.avg_tds,
                tdsMin: analytics.min_tds,
                tdsMax: analytics.max_tds,
                alertsCount: 0 
            };
        },
        enabled: !!hardwareId,
        refetchInterval: 30000 // Refresh every 30s
    });




    // Format a UTC timestamp to local HH:mm (24h, no AM/PM)
    const toHHmm = (ts: string) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    // Derived Data
    const quality = (device?.waterQualityRating || "Good") as keyof typeof QUALITY_CONFIG;
    const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG.Good;

    // Calculate offline status based on lastUpdated
    const { tdsDurationLabel } = useMemo(() => {
        if (!device?.lastUpdated) return { tdsDurationLabel: '' };

        const lastSeenDate = new Date(device.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenDate.getTime();
        const diffMin = diffMs / 60000;
        const offline = diffMin > 30;

        // Duration Formatting
        const hoursAgo = Math.floor(diffMin / 60);
        const durationLabel = offline ? (
            hoursAgo > 0
                ? `Device offline · Last seen ${hoursAgo} hours ago`
                : `Device offline · Last seen ${Math.floor(diffMin)} minutes ago`
        ) : '';

        return { tdsDurationLabel: durationLabel };
    }, [device?.lastUpdated]);

    // Build chart data: last 36 readings ≈ 3 hours at 5-min ThingSpeak intervals
    const tdsHistory = useMemo(() => {
        const raw = (device?.tdsHistory || [])
            .map((h: any) => ({
                ts: new Date(h.timestamp).getTime(),
                timestamp: h.timestamp,
                value: h.value ?? 0,
            }))
            .filter((h: { ts: number }) => !isNaN(h.ts));

        // Sort ascending then keep only the last 36 points
        raw.sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
        const slice = raw.slice(-36);

        return slice.map((h: { ts: number; timestamp: string; value: number }) => ({
            fullTime: toHHmm(h.timestamp),
            ts: h.ts,
            value: h.value,
        }));
    }, [device?.tdsHistory]);

    // Generate 7 evenly-spaced X-axis tick values across the data range
    const xAxisTicks = useMemo(() => {
        if (tdsHistory.length < 2) return [];
        const first = tdsHistory[0].ts;
        const last  = tdsHistory[tdsHistory.length - 1].ts;
        const count = 7;
        const step  = (last - first) / (count - 1);
        return Array.from({ length: count }, (_, i) => Math.round(first + i * step));
    }, [tdsHistory]);

    if (!hardwareId) return <Navigate to="/nodes" replace />;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <p className="font-medium animate-pulse" style={{ color: "var(--text-muted)" }}>Loading Water Quality Labs...</p>
                </div>
            </div>
        );
    }

    if (isError || !device) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
                <div className="apple-glass-card p-8 rounded-[32px] text-center max-w-md">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="text-red-500" size={32} />
                    </div>
                    <h2 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>Device Not Found</h2>
                    <p className="mb-6" style={{ color: "var(--text-muted)" }}>The EvaraTDS unit you are looking for could not be found or is unavailable.</p>
                    <button
                        onClick={() => navigate('/nodes')}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 bg-transparent selection:bg-blue-500/30">
            <div className="max-w-7xl mx-auto space-y-6">

                <div className="flex flex-col gap-2 mb-2">
                    <nav className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
                        <button onClick={() => navigate('/')} className="hover:text-blue-400 transition-colors bg-transparent border-none cursor-pointer p-0 uppercase font-bold">
                            Home
                        </button>
                        <ChevronRight size={12} className="opacity-40" />
                        <button onClick={() => navigate('/nodes')} className="hover:text-blue-400 transition-colors bg-transparent border-none cursor-pointer p-0 uppercase font-bold">
                            All Nodes
                        </button>
                        <ChevronRight size={12} className="opacity-40" />
                        <span className="text-[var(--text-primary)] font-bold">{device.deviceName}</span>
                    </nav>

                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate(-1)}
                                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shadow-sm shrink-0"
                                style={{ color: "var(--text-muted)" }}
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div>
                                <h1 className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
                                    {device.deviceName} Analytics
                                </h1>
                                {tdsDurationLabel && (
                                    <p className="text-xs font-bold text-red-500 m-0 mt-1">
                                        {tdsDurationLabel}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>


                <div className="grid lg:grid-cols-12 gap-8">
                    {/* --- LEFT COLUMN: DEVICE VISUALIZATION --- */}
                    <div className="lg:col-span-4 space-y-4">

                        {/* Hero: TDS Meter SVG + Animated Water */}
                        <div className="apple-glass-card rounded-[2.5rem] border border-white/5 relative overflow-hidden flex flex-col p-6 min-h-[560px]">
                            {/* Card Header: Device Name + Live Badge */}
                            <div className="flex items-center justify-between mb-4 relative z-10">
                                <h3 className="text-xl font-bold tracking-tight text-black dark:text-white">
                                    {device.deviceName} TDS Meter
                                </h3>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Live</span>
                                </div>
                            </div>

                            <div className="flex-grow flex items-center justify-center">
                                <TDSMeterVisual
                                    tdsValue={device.tdsValue || 0}
                                    quality={quality as 'Good' | 'Acceptable' | 'Critical'}
                                />
                            </div>

                            {/* Parameter Cards at the bottom - Mirroring EvaraTank style */}
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="text-left rounded-2xl p-4 flex flex-col justify-center transition-all hover:scale-[1.02]"
                                    style={{
                                        background: quality === 'Good' ? 'rgba(16, 185, 129, 0.06)' :
                                            quality === 'Acceptable' ? 'rgba(245, 158, 11, 0.06)' :
                                                'rgba(239, 68, 68, 0.06)',
                                        border: `1px solid ${quality === 'Good' ? 'rgba(16, 185, 129, 0.12)' :
                                            quality === 'Acceptable' ? 'rgba(245, 158, 11, 0.12)' :
                                                'rgba(239, 68, 68, 0.12)'}`
                                    }}>
                                    <p className="text-[9px] font-bold uppercase tracking-wider m-0 mb-1"
                                        style={{ color: qualityConfig.color, opacity: 0.8 }}>Water Quality</p>
                                    <p className="text-lg font-black m-0 tracking-tight"
                                        style={{ color: qualityConfig.color }}>{quality.toUpperCase()}</p>
                                </div>

                                <div className="text-left rounded-2xl p-4 flex flex-col justify-center transition-all hover:scale-[1.02]"
                                    style={{
                                        background: 'rgba(255, 149, 0, 0.06)',
                                        border: '1px solid rgba(255, 149, 0, 0.12)'
                                    }}>
                                    <p className="text-[9px] font-bold uppercase tracking-wider m-0 mb-1"
                                        style={{ color: '#FF9500', opacity: 0.8 }}>Temperature</p>
                                    <p className="text-lg font-black m-0 tracking-tight"
                                        style={{ color: '#FF9500' }}>{device.temperature || 0}°C</p>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* --- RIGHT COLUMN: DASHBOARD --- */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* 4 Cards Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="TDS LEVEL"
                                value={device.tdsValue || 0}
                                unit="ppm"
                                icon={Droplets}
                                topIcon={Droplets}
                                topIconColor="text-blue-500"
                            />
                            <StatCard
                                label="TEMPERATURE"
                                value={device.temperature || 0}
                                unit="°C"
                                icon={Thermometer}
                                topIcon={Thermometer}
                                topIconColor="text-orange-500"
                            />
                            <StatCard
                                label="WATER QUALITY"
                                value={quality}
                                unit=""
                                icon={qualityConfig.icon}
                                topIcon={ShieldIcon}
                                topIconColor={qualityConfig.text}
                            />
                            <StatCard
                                label="NOTIFICATIONS"
                                value={device.alertsCount || 0}
                                unit=""
                                icon={Bell}
                                topIcon={Bell}
                                topIconColor="text-red-500"
                            />
                        </div>

                        {/* TDS TREND CHART */}
                        <div className="apple-glass-card rounded-[32px] p-6 lg:p-8 border border-white/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <Activity size={120} className="text-blue-500" />
                            </div>

                            <div className="flex items-center justify-between mb-8 relative z-10">
                                <div>
                                    <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center gap-2">
                                        <Activity size={20} className="text-blue-500" />
                                        TDS Level Trends
                                    </h3>
                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-1">Dissolved Solids Monitoring (PPM)</p>
                                </div>
                                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                    {(['24H', '1W', '1M', 'Range'] as const).map(range => (
                                        <button
                                            key={range}
                                            onClick={() => setChartRange(range)}
                                            className={clsx(
                                                "px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                                                chartRange === range ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="h-[350px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={tdsHistory}>
                                        <defs>
                                            <linearGradient id="tdsGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="ts"
                                scale="time"
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 700 }}
                                className="text-gray-400 dark:text-gray-500"
                                dy={10}
                                ticks={xAxisTicks}
                                tickFormatter={(ts: number) => toHHmm(new Date(ts).toISOString())}
                            />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 700 }}
                                            className="text-gray-400 dark:text-gray-500" />
                                        <Tooltip
                                            content={<CustomTooltip />}
                                            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={4}
                                            fillOpacity={1}
                                            fill="url(#tdsGradient)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>


                    </div>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTS ---

const StatCard = ({ label, subLabel, value, unit, icon: Icon, topIcon: TopIcon, color, topIconColor = "#004F94" }: any) => (
    <div className="apple-glass-card rounded-[2rem] p-4 flex flex-col relative overflow-hidden transition-all duration-300 hover:border-white/10 border border-white/5 h-full">
        {/* Header: Label / Top Icon */}
        <div className="flex justify-between items-start mb-2 h-11">
            <div className="flex flex-col justify-center h-full">
                <h2 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)] m-0 uppercase leading-tight">{label}</h2>
            </div>
            {/* Top Right Icon Box */}
            <div className="w-8 h-8 rounded-[10px] bg-white dark:bg-white/10 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-slate-50 dark:border-white/10">
                <TopIcon width="16" height="16" className={topIconColor} />
            </div>
        </div>

        {/* Body Content */}
        <div className="flex items-center gap-2.5 w-full overflow-hidden mt-auto">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color || "bg-[#f1f5f9] dark:bg-white/5"}`}>
                <Icon size={16} className={topIconColor} />
            </div>
            <div className="flex flex-col min-w-0">
                {subLabel && <span className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-widest truncate">{subLabel}</span>}
                <div className="flex items-baseline gap-1">
                    <span className="text-xl lg:text-2xl font-bold tracking-tighter leading-tight" style={{ color: topIconColor }}>
                        {value}
                    </span>
                    {unit && <span className="text-xs font-bold tracking-tight text-[var(--text-muted)]">{unit}</span>}
                </div>
            </div>
        </div>
    </div>
);


const CustomTooltip = ({ active, payload, unit = 'ppm' }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="apple-glass-card px-4 py-3 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl">
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>{payload[0].payload.fullTime}</p>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{payload[0].value}</span>
                    <span className="text-xs font-bold text-blue-400">{unit}</span>
                </div>
            </div>
        );
    }
    return null;
};

export default EvaraTDSAnalytics;
