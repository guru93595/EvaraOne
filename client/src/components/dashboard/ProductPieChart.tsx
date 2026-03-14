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
            <span className="text-[12px] font-[800] text-[#1f2937]/70 uppercase tracking-[0.1em] mb-2 shrink-0">Product Distribution</span>
            <div className="flex-1 flex items-center gap-3 min-h-0">
                {/* Pie */}
                <div className="flex-shrink-0" style={{ width: 80, height: 80 }}>
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
                                outerRadius="90%"
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
                {/* Legend on the right */}
                <div className="flex flex-col gap-2">
                    {data.map((item) => (
                        <div key={item.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="text-[10px] font-[700] text-gray-500 uppercase tracking-tight">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProductPieChart;
