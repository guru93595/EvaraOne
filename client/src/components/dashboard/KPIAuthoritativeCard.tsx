import React from 'react';
import clsx from 'clsx';

interface KPIAuthoritativeCardProps {
    total: number;
    online: number;
    offline: number;
    className?: string;
}

export const KPIAuthoritativeCard = ({
    total,
    online,
    offline,
    className
}: KPIAuthoritativeCardProps) => {
    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] flex flex-col justify-between h-full", className)}>
            <div className="flex justify-between items-start">
                <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em]">Total Devices</span>
                <div className="w-6 h-6 rounded-full bg-blue-50/50 flex items-center justify-center border border-blue-100/20">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3A7AFE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
            </div>
            <h2 className="text-[36px] font-[800] text-[#1F2937] leading-none tracking-tight">{total.toLocaleString()}</h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#16A34A] shadow-[0_0_8px_rgba(22,163,74,0.4)]" />
                    <span className="text-[10px] font-[800] text-gray-500">{online} Online</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#E5484D] shadow-[0_0_8px_rgba(229,72,77,0.4)]" />
                    <span className="text-[10px] font-[800] text-gray-500">{offline} Offline</span>
                </div>
            </div>
        </div>
    );
};

export default React.memo(KPIAuthoritativeCard);
