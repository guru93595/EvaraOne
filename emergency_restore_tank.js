const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';

// I will read the file and find the start and end of the "Column 1" and "Column 2" sections.
// Then I will replace the middle part with a clean version.

let content = fs.readFileSync(path, 'utf8');

// 1. Fix the showWaterLevel wrapping in Column 1
// It was: {showWaterLevel && ({/* ── Depth / Bore Visualizer ── */ }...)}
// but got mangled.

// 2. Fix the Rate Cards in Column 2
// It was: {showFillRate && ({showConsumption && (...)} ... )}

// To be safe, I'll search for the surrounding stable code and replace the block between them.

const startMarker = '{/* ── Depth / Bore Visualizer ── */ }';
const endMarker = '{/* COMBINED HISTORY CHART */}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found');
    process.exit(1);
}

// I'll reconstruct the block between these two.
const cleanBlock = `{showWaterLevel && (
                            <div className="flex flex-col gap-6 w-full lg:sticky lg:top-4 h-fit">
                                <div className="apple-glass-card rounded-[2.5rem] p-10 flex flex-col items-center justify-center gap-6 min-h-[460px] relative overflow-hidden"
                                    style={{ background: 'linear-gradient(180deg, #F2F2F7 0%, #D1D1D6 100%)', boxShadow: 'inset 0 0 40px rgba(255,255,255,0.4), 0 10px 30px rgba(28,28,30,0.1)' }}>
                                    <div className="text-center w-full mt-2 mb-2">
                                        <p className="text-xs font-bold uppercase tracking-widest m-0" style={{ color: '#8E8E93' }}>Current Storage</p>
                                        <h3 className="text-4xl font-black text-gray-900 m-0 mt-1 tabular-nums">
                                            {formatValue(waterAnalytics.currentLevelLiters)}
                                            <span className="text-2xl font-medium text-gray-500 ml-1">Liters</span>
                                        </h3>
                                    </div>

                                    <div className="relative w-64 h-80 drop-shadow-2xl">
                                        <TankVisualizer
                                            level={waterAnalytics.levelPercentage}
                                            isOffline={isOffline}
                                        />
                                    </div>

                                    <div className="text-center w-full mt-0.5">
                                        {latestPoint?.predictions && (latestPoint.predictions.timeToEmpty || latestPoint.predictions.timeToFull) ? (
                                            <div className="flex flex-col gap-1 items-center">
                                                <div className={\`px-4 py-2 rounded-full text-[11px] font-bold flex items-center gap-2 shadow-sm border \${
                                                    latestPoint.predictions.timeToEmpty 
                                                    ? 'bg-red-50/80 text-red-600 border-red-100' 
                                                    : 'bg-green-50/80 text-green-600 border-green-100'
                                                }\`}>
                                                    <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
                                                        {latestPoint.predictions.timeToEmpty ? 'hourglass_bottom' : 'hourglass_top'}
                                                    </span>
                                                    {latestPoint.predictions.timeToEmpty ? (
                                                        <span>ESTIMATED EMPTY IN <b>{formatDuration(latestPoint.predictions.timeToEmpty)}</b></span>
                                                    ) : (
                                                        <span>ESTIMATED FULL IN <b>{formatDuration(latestPoint.predictions.timeToFull)}</b></span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* COLUMN 2 - GRAPHS & INSIGHTS */}
                        <div className="lg:col-span-2 flex flex-col gap-4 w-full h-full">

                            {/* RATE CARDS */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">

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

                                {showAlerts && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(175,82,222,0.15)' }}>
                                                <Bell size={22} color="#AF52DE" />
                                            </div>
                                            <button onClick={() => setActiveInfoPopup('alerts')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#8E8E93" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Alerts</p>
                                            <p className="text-[26px] leading-[1.1] font-black m-0 tracking-tight" style={{ color: waterAnalytics.alerts.activeCount > 0 ? '#FF3B30' : '#1C1C1E' }}>
                                                {waterAnalytics.alerts.activeCount} <span className="text-[13px] font-bold" style={{ color: '#8E8E93' }}>Active</span>
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {showHealth && (
                                    <div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', minHeight: '130px', position: 'relative' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center justify-center rounded-xl w-10 h-10" style={{ background: 'rgba(10,132,255,0.15)' }}>
                                                <Wifi size={22} color="#0A84FF" />
                                            </div>
                                            <button onClick={() => setActiveInfoPopup('deviceHealth')} className="bg-transparent border-none p-1 cursor-pointer transition-colors hover:bg-black/5 rounded-full flex items-center justify-center">
                                                <Info size={16} color="#8E8E93" />
                                            </button>
                                        </div>
                                        <div className="flex flex-col mt-auto pt-3 gap-0.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider m-0" style={{ color: '#8E8E93' }}>Device Health</p>
                                            <p className={\`leading-[1.1] font-black m-0 tracking-tight \${
                                                waterAnalytics.deviceHealth.status === 'Healthy' ? 'text-[26px]' : 'text-[18px]'
                                            }\`} style={{ color: waterAnalytics.deviceHealth.status === 'Healthy' ? '#34C759' : waterAnalytics.deviceHealth.status === 'Warning' ? '#FF9500' : '#FF3B30' }}>
                                                {waterAnalytics.deviceHealth.status}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
`;

// Also check showMap usage
const mapTarget = /\{showMap && \(<div className="apple-glass-card flex flex-col items-center justify-center gap-6 rounded-\[2\.5rem\] p-8 relative overflow-hidden"[\s\S]*?<\/div>\)\}\s+<\/div>\s+<\/div>/;

const newContent = content.substring(0, startIndex) + cleanBlock + content.substring(endIndex);
fs.writeFileSync(path, newContent);
console.log('Restored EvaraTankAnalytics.tsx');
