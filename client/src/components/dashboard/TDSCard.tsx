import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { MapPin, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { computeDeviceStatus } from '../../services/DeviceService';

interface TDSCardProps {
    node: any;
    realtimeStatus?: any;
}

const TDSCard = ({ node, realtimeStatus }: TDSCardProps) => {
    const data = realtimeStatus || node.last_telemetry || {};
    const tdsValue = data.tdsValue ?? data.tds_value ?? 0;
    const waterQuality = data.waterQualityRating || data.water_quality_rating || "Unknown";
    const lastSeen = data.timestamp || data.last_seen || node.last_seen || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    const history = (data.tdsHistory || data.tds_history || []).map((h: any, i: number) => ({
        index: i,
        value: h.value ?? h
    }));

    // Quality color logic
    const qualityColor = waterQuality.toLowerCase() === 'good' 
        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        : 'text-red-500 bg-red-500/10 border-red-500/20';

    const cardTint = waterQuality.toLowerCase() === 'good'
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-red-500/5 border-red-500/20';

    return (
        <Link
            to={`/evaratds/${node.hardwareId || node.id}`}
            className={clsx(
                "group rounded-[24px] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative mx-auto w-full border apple-glass-card",
                isOnline ? cardTint : "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/20"
            )}
        >
            <div className="p-5 flex flex-col flex-1 relative z-10 w-full min-h-[160px] gap-[18px]">
                {/* Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-white dark:bg-white/10 rounded-[14px] shadow-sm flex items-center justify-center shrink-0">
                            <FlaskConical className="text-blue-600 dark:text-blue-400" size={24} />
                        </div>
                        <div className="flex flex-col gap-1 pr-2 overflow-hidden">
                            <h3 className="font-[900] text-[17px] leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                                {node.label || node.displayName}
                            </h3>
                            <span className="w-fit bg-[#e2eaff] dark:bg-white/10 text-blue-700 dark:text-blue-300 text-[9px] font-[900] px-2 py-0.5 rounded-lg uppercase tracking-wider card-subheading">
                                EvaraTDS
                            </span>
                        </div>
                    </div>
                    
                    <span className={clsx(
                        "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-[10px] shadow-sm shrink-0",
                        isOnline ? "bg-green-100 text-green-600 dark:text-green-400 border border-green-200" : "bg-red-100 text-red-600 dark:text-red-400 border border-red-200"
                    )}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", isOnline ? "bg-green-600" : "bg-red-600")} />
                        {isOnline ? "Online" : "Offline"}
                    </span>
                </div>

                {/* Metrics */}
                <div className="flex justify-between items-end mt-2 px-1">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-2 card-label">
                            TDS VALUE
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black leading-none card-value">
                                {tdsValue}
                            </span>
                            <span className="text-xs font-bold card-number">ppm</span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-2 card-label">
                            QUALITY
                        </span>
                        <span className={clsx(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm",
                            qualityColor
                        )}>
                            {waterQuality}
                        </span>
                    </div>
                </div>

                {/* Sparkline */}
                <div className="h-14 w-full mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history.length > 0 ? history : [{value: 0}, {value: 0}]}>
                            <defs>
                                <linearGradient id="colorTds" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <Area 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#3B82F6" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill="url(#colorTds)" 
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 px-1">
                    <div className="flex items-center gap-1 text-[11px] font-bold uppercase truncate card-location">
                        <MapPin size={12} className="shrink-0 card-location" />
                        <span className="truncate card-location">{node.location_name || node.location || "Main Inlet"}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
            <div
                className="relative overflow-hidden px-5 py-[13px] text-center text-[11.5px] font-[900] tracking-[0.15em] transition-all uppercase w-full flex items-center justify-center gap-1.5 group-hover:bg-[#002868]/70"
                style={{
                    color: 'var(--liquid-button-text)',
                    background: 'rgba(15, 48, 150, 0.7)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}
            >
                <span className="relative z-10 drop-shadow-sm">VIEW MORE</span>
                <span className="text-[14px] relative z-10 drop-shadow-sm transform transition-transform group-hover:translate-x-1">→</span>
            </div>
        </Link>
    );
};

export default TDSCard;
