import React from 'react';
import { AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface AlertEvent {
    id: string;
    device_id: string;
    event_type: string;
    timestamp: string;
    severity: 'critical' | 'warning' | 'info';
}

interface AlertsActivityPanelProps {
    total: number;
    critical: number;
    warning: number;
    recentAlerts?: AlertEvent[];
    className?: string;
}

export const AlertsActivityPanel = ({
    total,
    critical,
    warning,
    className
}: Omit<AlertsActivityPanelProps, 'recentAlerts'>) => {
    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] h-full flex flex-col justify-between", className)}>
            <div className="flex justify-between items-start">
                <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em]">Alerts & Activity</span>
                <div className="w-6 h-6 rounded-full bg-red-50/50 flex items-center justify-center border border-red-100/20">
                    <AlertTriangle size={12} className={clsx(total > 0 ? "text-red-500" : "text-gray-400")} />
                </div>
            </div>

            <div className="flex items-baseline gap-2">
                <h2 className={clsx("text-[36px] font-[800] leading-none tracking-tight", total > 0 ? "text-[#E5484D]" : "text-[#1F2937]")}>{total}</h2>
                <span className="text-[11px] font-[800] text-gray-400 uppercase tracking-widest leading-none">Active</span>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#E5484D] shadow-[0_0_8px_rgba(229,72,77,0.4)]" />
                    <span className="text-[10px] font-[800] text-gray-500">{critical} Critical</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                    <span className="text-[10px] font-[800] text-gray-500">{warning} Warning</span>
                </div>
                {total === 0 && (
                    <span className="text-[10px] text-gray-400 italic">No activity</span>
                )}
            </div>
        </div>
    );
};

export default React.memo(AlertsActivityPanel);
