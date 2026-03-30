const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix the double-nested logic and malformed JSX in the Rate Cards section
// We'll replace the entire grid content for Column 2 Rate Cards
const target = /<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">([\s\S]*?)<\/div>\s+<div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style=\{[\s\S]*?background: 'rgba\(175,82,222,0.15\)'/;

const replacement = `<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">

                                {showFillRate && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(52,199,89,0.15)' }}>
                                                <TrendingUp size={22} color="#34C759" />
                                            </div>
                                            <button onClick={() => setActiveInfoPopup('fillRate')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#8E8E93" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Fill Rate</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.fillRateLph > 30000 ? '#FF3B30' : '#34C759' }}>
                                                {waterAnalytics.fillRateLph > 30000 ? (
                                                    <span style={{ fontSize: '13px', color: '#FF3B30' }}>Invalid reading</span>
                                                ) : waterAnalytics.fillRateLph > 0 ? (
                                                    <>+{waterAnalytics.fillRateLph.toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/hr</span></>
                                                ) : waterAnalytics.rateDataValid && waterAnalytics.drainRateLph === 0 ? (
                                                    <span style={{ fontSize: '16px', color: '#8E8E93' }}>Stable</span>
                                                ) : '--'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {showConsumption && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(255,59,48,0.15)' }}>
                                                <TrendingDown size={22} color="#FF3B30" />
                                            </div>
                                            <button onClick={() => setActiveInfoPopup('consumption')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#8E8E93" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Consumption</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.drainRateLph > 30000 ? '#FF3B30' : '#FF3B30' }}>
                                                {waterAnalytics.drainRateLph > 30000 ? (
                                                    <span style={{ fontSize: '13px', color: '#FF3B30' }}>Invalid reading</span>
                                                ) : waterAnalytics.drainRateLph > 0 ? (
                                                    <>{Math.abs(waterAnalytics.drainRateLph).toFixed(0)} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>L/hr</span></>
                                                ) : waterAnalytics.rateDataValid && waterAnalytics.fillRateLph === 0 ? (
                                                    <span style={{ fontSize: '16px', color: '#8E8E93' }}>Stable</span>
                                                ) : '--'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>

                                    <div className="flex justify-between items-start">

                                        <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(175,82,222,0.15)' }}>`;

if (target.test(content)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log('Successfully fixed EvaraTankAnalytics.tsx syntax');
} else {
    console.error('Target not found in EvaraTankAnalytics.tsx');
    process.exit(1);
}
