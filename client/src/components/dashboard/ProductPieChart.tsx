import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
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
        { name: 'EvaraTank', value: Math.max(tank, 0.01), color: '#3A7AFE' },
        { name: 'EvaraFlow', value: Math.max(flow, 0.01), color: '#0891B2' },
        { name: 'EvaraDeep', value: Math.max(deep, 0.01), color: '#7C3AED' }
    ];

    return (
        <div className={clsx("apple-glass-card px-[20px] py-[16px] rounded-[20px] flex flex-col h-full", className)}>
            <div className="flex justify-between items-start mb-2 shrink-0">
                <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em]">Product Distribution</span>
                <div className="w-6 h-6 rounded-full bg-blue-50/50 flex items-center justify-center border border-blue-100/20">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3A7AFE" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                    </svg>
                </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-1 min-h-0 pt-2">
                {/* Pie */}
                <div className="flex-1 w-full" style={{ minHeight: '80px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Tooltip
                                contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 11 }}
                            />
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={0}
                                outerRadius="98%"
                                dataKey="value"
                                stroke="rgba(255,255,255,0.5)"
                                strokeWidth={2}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* Legend at bottom */}
                <div className="flex flex-row flex-wrap justify-center gap-x-6 gap-y-1">
                    {data.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] font-[800] text-gray-500 uppercase tracking-tight">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductPieChart;
