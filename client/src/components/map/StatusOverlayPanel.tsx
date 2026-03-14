/**
 * StatusOverlayPanel — the "Infrastructure Status" side panel on the Home map.
 * Extracted from Home.tsx to reduce component size.
 */
import clsx from 'clsx';
import { Activity } from 'lucide-react';
import { isOnline } from '../../utils/mapIcons';
import type { MapDevice } from '../../hooks/useMapDevices';

interface AssetCategory {
    name: string;
    devices: MapDevice[];
    color: string;
    bg: string;
    icon?: React.ReactNode;
}

interface Props {
    visible: boolean;
    devices: MapDevice[];
    categories: AssetCategory[];
}

export const StatusOverlayPanel = ({ visible, devices, categories }: Props) => {
    const onlineCount = devices.filter(d => isOnline(d.status)).length;
    const offlineCount = devices.length - onlineCount;

    return (
        <div className={clsx(
            "absolute top-[185px] lg:top-[195px] right-4 z-[400] apple-glass-card/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 w-80 transition-all duration-300 origin-top-right overflow-hidden",
            visible ? "opacity-100 scale-100 max-h-[420px]" : "opacity-0 scale-95 max-h-0 pointer-events-none"
        )}>
            <div className="p-3.5">
                <h3 className="text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-2">
                    <Activity size={16} className="text-[var(--color-evara-blue)]" /> Status Overview
                </h3>

                {/* Summary Stats — Compact Row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-green-50/50 rounded-xl p-2 text-center border border-green-100/50">
                        <div className="text-[9px] font-black text-green-700/60 tracking-wider uppercase mb-0.5">Online</div>
                        <div className="text-base font-black text-green-600 leading-none">{onlineCount}</div>
                    </div>
                    <div className="bg-red-50/50 rounded-xl p-2 text-center border border-red-100/50">
                        <div className="text-[9px] font-black text-red-700/60 tracking-wider uppercase mb-0.5">Offline</div>
                        <div className="text-base font-black text-red-600 leading-none">{offlineCount}</div>
                    </div>
                    <div className="bg-blue-50/50 rounded-xl p-2 text-center border border-blue-100/50">
                        <div className="text-[9px] font-black text-blue-700/60 tracking-wider uppercase mb-0.5">Total</div>
                        <div className="text-base font-black text-blue-600 leading-none">{devices.length}</div>
                    </div>
                </div>

                {/* Asset Breakdown — Tighter Spacing */}
                <div className="space-y-1.5">
                    {categories.map((asset, i) => {
                        const working = asset.devices.filter(d => isOnline(d.status)).length;
                        const total = asset.devices.length;
                        const isFullyActive = total > 0 && working === total;
                        
                        return (
                            <div key={i} className={clsx("rounded-xl px-3 py-2", asset.bg)}>
                                <div className="flex justify-between items-center mb-1.5">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {asset.icon && <span className="shrink-0">{asset.icon}</span>}
                                        <span className="text-[11px] font-bold text-slate-700 truncate tracking-tight">{asset.name}</span>
                                    </div>
                                    <div className={clsx(
                                        "px-2 py-0.5 rounded-full text-[9px] font-bold tracking-tight whitespace-nowrap",
                                        isFullyActive ? "bg-green-100 text-green-600" : working === 0 && total > 0 ? "bg-red-100 text-red-500" : "bg-orange-100 text-orange-600"
                                    )}>
                                        {working}/{total} Active
                                    </div>
                                </div>
                                <div className="w-full h-[6px] bg-slate-200/50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,0,0,0.05)]" 
                                        style={{ 
                                            width: `${total > 0 ? (working / total) * 100 : 0}%`, 
                                            background: asset.color 
                                        }} 
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default StatusOverlayPanel;
