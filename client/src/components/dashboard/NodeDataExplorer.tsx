import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { getDeviceAnalyticsRoute } from '../../utils/deviceRouting';
import { useRealtimeTelemetry } from '../../hooks/useRealtimeTelemetry';

type NodeType = 'tank' | 'flow' | 'deep';

interface NodeData {
    id: string;
    firestore_id: string;
    name: string;
    type: NodeType;
    status: 'Online' | 'Offline';
    isStale: boolean;
    lastSeen?: string;
    metrics: Record<string, any>;
    location?: string;
    device?: string;
}

// ─── Sub-component for individual Node Cards ──────────────────────────────
const NodeExplorerItem = ({ node }: { node: NodeData }) => {
    const navigate = useNavigate();
    const { telemetry: snap } = useRealtimeTelemetry(node.id);
    const isTank = node.type === 'tank';
    
    // Percentage calculation for tanks
    let pct = snap?.level_percentage ?? (node.metrics?.Level || 0);
    if (snap && !snap.level_percentage && isTank) {
        const distance = parseFloat(snap.field1 || snap.field2 || snap.water_level_raw_sensor_reading);
        const depth = 1.2; // Default fallback
        if (!isNaN(distance)) {
            const validDistance = Math.min(distance / 100, depth);
            pct = Math.min(100, ((depth - validDistance) / depth) * 100);
        }
    }

    const barColor = pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444";
    const glowColor = pct > 60 ? "rgba(34,197,94,0.3)" : pct > 30 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

    const handleClick = () => {
        navigate(getDeviceAnalyticsRoute({
            id: node.firestore_id,
            hardwareId: node.id,
            analytics_template: node.type === 'tank' ? 'EvaraTank' : node.type === 'flow' ? 'EvaraFlow' : 'EvaraDeep',
        }));
    };

    return (
        <div 
            onClick={handleClick}
            className="apple-glass-inner p-3.5 rounded-[32px] hover:scale-[1.02] transition-all duration-300 border border-white/40 shadow-sm flex flex-col h-auto min-h-[110px] cursor-pointer group hover:shadow-xl hover:bg-white/50"
        >
            <div className="flex justify-between items-start mb-1.5">
                <span className="text-[10px] font-black text-blue-500/60 uppercase tracking-widest">
                    {node.type === 'tank' ? 'EvaraTank' : node.type === 'flow' ? 'EvaraFlow' : 'EvaraDeep'}
                </span>
                <div className={clsx(
                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter flex items-center gap-1.5",
                    node.status === "Online" 
                        ? "bg-green-100/50 text-green-600 border border-green-200/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]" 
                        : "bg-red-100/50 text-red-500 border border-red-200/50"
                )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", node.status === "Online" ? "bg-green-500 animate-pulse" : "bg-red-400")} />
                    {node.status === "Online" ? "LIVE" : "OFFLINE"}
                </div>
            </div>
            
            <h4 className="text-[15px] font-extrabold text-gray-800 truncate leading-tight group-hover:text-blue-600 transition-colors">
                {node.name}
            </h4>

            {isTank ? (
                <div className="mt-1.5 text-left">
                    <div className="flex justify-between items-end mb-0">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Water Level</span>
                        <span className="text-[12px] font-black text-gray-800">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="liquid-glass-progress-container !h-2">
                        <div
                            className="liquid-glass-progress-fill"
                            style={{
                                width: `${Math.min(100, Math.max(5, pct))}%`,
                                background: barColor,
                                "--glow-color": glowColor,
                            } as any}
                        >
                            <div className="liquid-glass-progress-waves" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 mt-1.5">
                    {Object.entries(node.metrics).slice(0, 2).map(([key, val]) => (
                        <div key={key} className="flex flex-col">
                            <span className="text-[8px] uppercase font-black text-gray-400 tracking-wider mb-0">{key}</span>
                            <span className="text-[14px] font-bold text-gray-800">{val}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Main Explorer Component ──────────────────────────────────────────────
export const NodeDataExplorer = ({ nodes, className }: { nodes: NodeData[], className?: string }) => {
    const [activeType, setActiveType] = useState<NodeType>('tank');
    const [activeLocation, setActiveLocation] = useState<string>('all');

    const uniqueLocations = Array.from(new Set(nodes.map(n => n.location).filter(Boolean))) as string[];

    const filteredNodes = nodes.filter(n => {
        if (n.type !== activeType) return false;
        if (activeLocation !== 'all' && n.location !== activeLocation) return false;
        return true;
    });

    return (
        <div className={clsx("apple-glass-card p-[24px] rounded-[50px] flex flex-col", className)}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-3">
                    <h3 className="text-[16px] font-black text-[#1f2937] uppercase tracking-widest leading-none">Node Explorer</h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <select
                        value={activeType}
                        onChange={(e) => setActiveType(e.target.value as NodeType)}
                        className="bg-gray-100/50 border border-gray-200/30 text-[12px] font-black text-gray-600 rounded-[20px] px-5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none shadow-sm cursor-pointer hover:bg-white transition-all w-full sm:w-40"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 15px center', paddingRight: '40px' }}
                    >
                        <option value="tank">EvaraTank</option>
                        <option value="deep">EvaraDeep</option>
                        <option value="flow">EvaraFlow</option>
                    </select>

                    <select
                        value={activeLocation}
                        onChange={(e) => setActiveLocation(e.target.value)}
                        className="bg-gray-100/50 border border-gray-200/30 text-[12px] font-black text-gray-600 rounded-[20px] px-5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none shadow-sm cursor-pointer hover:bg-white transition-all w-full sm:w-44"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 15px center', paddingRight: '40px' }}
                    >
                        <option value="all">All Locations</option>
                        {uniqueLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-5 pb-4">
                    {filteredNodes.length > 0 ? filteredNodes.map((node) => (
                        <NodeExplorerItem key={node.id} node={node} />
                    )) : (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20 italic text-gray-500">
                            <Search size={40} className="mb-3" />
                            <span className="font-black uppercase tracking-widest text-[14px]">No Nodes Found</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NodeDataExplorer;
