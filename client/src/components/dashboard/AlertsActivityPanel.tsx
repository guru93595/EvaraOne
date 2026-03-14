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
    recentAlerts = [],
    className
}: AlertsActivityPanelProps) => {
    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] h-full flex flex-col justify-between", className)}>
            <div className="flex justify-between items-start">
                <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em]">Alerts & Activity</span>
                <AlertTriangle size={14} className={clsx(total > 0 ? "text-red-500" : "text-gray-400")} />
            </div>

            <div className="flex items-baseline gap-4">
                <h2 className={clsx("text-[42px] font-[700] leading-none tracking-tight", total > 0 ? "text-[#E5484D]" : "text-[#1F2937]")}>{total}</h2>
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Active</span>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-[#E5484D]">{critical}</span>
                    <span className="text-[10px] text-gray-400 font-bold">Critical</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-[#F59E0B]">{warning}</span>
                    <span className="text-[10px] text-gray-400 font-bold">Warning</span>
                </div>
                {total === 0 && (
                    <span className="text-[10px] text-gray-400 italic">No urgent activity reported</span>
                )}
            </div>
        </div>
    );
};

export default React.memo(AlertsActivityPanel);
