import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { LayoutDashboard } from 'lucide-react';
import clsx from 'clsx';

interface ProductPieChartProps {
    tank: number;
    flow: number;
    deep: number;
    className?: string;
}

export const ProductPieChart = ({
    tank,
    flow,
    deep,
    className
}: ProductPieChartProps) => {
    const data = [
        { name: 'EvaraTank', value: tank, color: '#3A7AFE' },
        { name: 'EvaraFlow', value: flow, color: '#0891B2' },
        { name: 'EvaraDeep', value: deep, color: '#7C3AED' }
    ];

    return (
        <div className={clsx("apple-glass-card p-[24px] rounded-[50px] flex flex-col h-full", className)}>
            <div className="flex justify-between items-center mb-3">
                <span className="text-[14px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em] leading-none">Product Distribution</span>
                <LayoutDashboard size={18} className="text-gray-400/60" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
                <div className="w-full h-full max-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={0}
                                outerRadius="90%"
                                dataKey="value"
                                stroke="rgba(255,255,255,0.4)"
                                strokeWidth={3}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Simple Legend */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-2">
                {data.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-[700] text-gray-500 uppercase tracking-tight">{item.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProductPieChart;
