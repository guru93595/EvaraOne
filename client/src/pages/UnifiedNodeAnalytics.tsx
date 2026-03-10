import { useParams, Link } from "react-router-dom";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import api from "../services/api";
import { getNodeAnalytics, getNodeTelemetry } from "../services/nodeService";
import { useRealtimeTelemetry } from "../hooks/useRealtimeTelemetry";

export default function UnifiedNodeAnalytics() {
    const { id } = useParams<{ id: string }>();

    // Secure Telemetry Pipeline through the new Node proxy
    const { data: analyticsData, isLoading, error } = useQuery({
        queryKey: ["node-analytics", id],
        queryFn: async () => {
            if (!id) return null;
            
            // 1. Fetch node info to get assetType and capacity
            const nodeResponse = await api.get(`/nodes/${id}`);
            const node = nodeResponse.data;

            // 2. Fetch processed analytics from backend proxy
            const TSData = await getNodeAnalytics(id);
            const metrics = await getNodeTelemetry(id);

            return {
                node,
                history: TSData.history || [],
                latest: metrics
            };
        },
        enabled: !!id,
        retry: 1
    });

    const { telemetry, lastSync } = useRealtimeTelemetry(id || "", analyticsData?.latest);

    if (isLoading) return <div className="p-8 pt-[140px] text-slate-300">Loading secure analytics...</div>;

    if (error || !analyticsData) {
        return (
            <div className="p-8 pt-[140px] flex flex-col items-center justify-center space-y-4">
                <div className="text-amber-500 text-lg font-semibold">Unable to fetch proxy analytics</div>
                <p className="text-slate-400">Please ensure the ThingSpeak config is valid for this node.</p>
                <Link to="/nodes" className="text-blue-400 hover:underline">Back to Nodes</Link>
            </div>
        );
    }

    const { node } = analyticsData;

    // Derive historical data array
    const history = analyticsData.history || [];
    const chartData = history.map((point: any) => {
        let d = new Date(point.timestamp);
        const timeStr = `${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
        return { time: timeStr, value: point.level_percentage || point.level || 0 };
    });

    const hasData = history.length > 0;

    const isTank = node.assetType === "EvaraTank" || node.assetType === "OHT";
    const isFlow = node.assetType === "EvaraFlow" || node.assetType === "PumpHouse";
    const isDeep = node.assetType === "EvaraDeep" || node.assetType === "Borewell";

    const getMetricLabel = () => {
        if (isTank) return "Fill Level (%)";
        if (isFlow) return "Flow Rate (L/min)";
        if (isDeep) return "Water Depth (m)";
        return "Value";
    };

    const primaryMetric = telemetry?.level_percentage || 0;

    const PrimaryDisplay = () => {
        if (isTank) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-800/50 rounded-2xl border border-slate-700 transition-all duration-300">
                    <div className="text-sm font-semibold text-slate-400 mb-2">LIVE LEVEL</div>
                    <div className="text-6xl font-bold text-blue-400">{primaryMetric.toFixed(1)}%</div>
                    <div className="text-xl font-medium text-blue-300/80 mt-2">{(telemetry?.distance || 0).toFixed(0)} cm (Distance)</div>
                    <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-widest">
                        Available: {telemetry?.volume?.toLocaleString() || 0} L
                    </div>
                    <div className="mt-2 text-xs text-green-500/80 font-mono animate-pulse">Live Sync: {lastSync}</div>
                </div>
            );
        }
        if (isFlow) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-800/50 rounded-2xl border border-slate-700 transition-all duration-300">
                    <div className="text-sm font-semibold text-slate-400 mb-2">CURRENT FLOW</div>
                    <div className="text-6xl font-bold text-sky-400">{primaryMetric.toFixed(2)}</div>
                    <div className="text-sm text-sky-500/70 mt-1">Liters / min</div>
                    <div className="mt-4 text-xs text-green-500/80 font-mono animate-pulse">Live Sync: {lastSync}</div>
                </div>
            );
        }
        if (isDeep) {
            return (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-800/50 rounded-2xl border border-slate-700 transition-all duration-300">
                    <div className="text-sm font-semibold text-slate-400 mb-2">DEPTH MEASUREMENT</div>
                    <div className="text-6xl font-bold text-indigo-400">{(telemetry?.distance || 0).toFixed(1)}m</div>
                    <div className="mt-4 text-xs text-green-500/80 font-mono animate-pulse">Live Sync: {lastSync}</div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="p-4 pt-[100px] lg:p-8 lg:pt-[100px] max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link to="/nodes" className="inline-flex items-center text-sm text-slate-400 hover:text-white mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back to Nodes
                    </Link>
                    <h1 className="text-3xl font-bold text-white tracking-tight">{node.displayName || node.hardwareId || id}</h1>
                    <p className="text-sm text-slate-400 mt-1">ID: {node.hardwareId || id} | Type: {node.assetType}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-1">
                    <PrimaryDisplay />
                </div>
                <div className="col-span-1 lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl">
                    <h3 className="text-lg font-bold text-white mb-6">Historical {getMetricLabel()}</h3>
                    <div className="h-[300px]">
                        {!hasData ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-2 text-slate-500">
                                <span className="material-symbols-rounded text-4xl">database_off</span>
                                <p>Device has not sent telemetry yet</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData.slice(-50)} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                                        itemStyle={{ color: '#60a5fa' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke={isTank ? "#3b82f6" : isFlow ? "#0ea5e9" : "#6366f1"}
                                        strokeWidth={3}
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#fff', strokeWidth: 2 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
