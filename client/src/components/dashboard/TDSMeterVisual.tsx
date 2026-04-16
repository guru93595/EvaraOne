import React from 'react';

interface TDSMeterVisualProps {
    tdsValue: number;
    quality: 'Good' | 'Acceptable' | 'Critical';
}

const QUALITY_CFG = {
    Good:       { lcd: '#4ade80', glow: 'rgba(74,222,128,0.55)',  badge: '#16a34a', label: 'GOOD QUALITY'  },
    Acceptable: { lcd: '#facc15', glow: 'rgba(250,204,21,0.55)',  badge: '#b45309', label: 'ACCEPTABLE'    },
    Critical:   { lcd: '#f87171', glow: 'rgba(248,113,113,0.55)', badge: '#dc2626', label: 'CRITICAL'      },
};

const TDSMeterVisual: React.FC<TDSMeterVisualProps> = ({ tdsValue, quality }) => {
    const cfg = QUALITY_CFG[quality] || QUALITY_CFG.Good;

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden select-none bg-gradient-to-b from-blue-50/20 to-transparent">

            {/* ── Upper area: meter probe ── */}
            <div className="flex-1 flex items-end justify-center relative pb-12">

                {/* Background ambient glow */}
                <div className="absolute inset-0"
                    style={{ background: 'radial-gradient(circle at 50% 70%, rgba(59,130,246,0.15) 0%, transparent 70%)' }} />

                {/* TDS Meter Body SVG */}
                <div className="relative z-20 flex items-end justify-center h-full w-full mb-[-2px]">
                    <svg
                        viewBox="0 0 140 380"
                        width="120"
                        height="380"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
                    >
                        <defs>
                            <linearGradient id="meterBody" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#2c3138" />
                                <stop offset="50%" stopColor="#3d444d" />
                                <stop offset="100%" stopColor="#1a1e23" />
                            </linearGradient>
                            
                            <linearGradient id="tipMetal" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#94a3b8" />
                                <stop offset="40%" stopColor="#f1f5f9" />
                                <stop offset="60%" stopColor="#e2e8f0" />
                                <stop offset="100%" stopColor="#64748b" />
                            </linearGradient>

                            <linearGradient id="screenGlass" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0a1a0a" />
                                <stop offset="100%" stopColor="#051005" />
                            </linearGradient>

                            <filter id="lcdGlowEffect" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* --- Probe Tip (Metal) --- */}
                        <path d="M45 230 L95 230 L80 340 C75 355 65 355 60 340 Z" fill="url(#tipMetal)" />
                        {/* Tip Reflections */}
                        <path d="M68 230 L74 230 L70 330 L68 330 Z" fill="white" opacity="0.3" />

                        {/* --- Main Body --- */}
                        <rect x="20" y="20" width="100" height="230" rx="35" fill="url(#meterBody)" />
                        
                        {/* Subtle Body Bezel highlight */}
                        <rect x="21" y="21" width="98" height="228" rx="34" stroke="white" strokeOpacity="0.05" strokeWidth="1" />

                        {/* LCD Screen Container */}
                        <rect x="25" y="45" width="90" height="110" rx="14" fill="#000" stroke="#4a5568" strokeWidth="1" />
                        <rect x="30" y="50" width="80" height="100" rx="10" fill="url(#screenGlass)" />
                        
                        {/* Clip path: constrains everything to the inner screen */}
                        <defs>
                            <clipPath id="screenClip">
                                <rect x="30" y="50" width="80" height="100" rx="10" />
                            </clipPath>
                        </defs>

                        {/* LCD value — clipped inside screen */}
                        <g clipPath="url(#screenClip)">
                            <text x="70" y="108" textAnchor="middle" fontSize="30" fontWeight="900"
                                  fontFamily="monospace" fill={cfg.lcd} style={{ filter: 'url(#lcdGlowEffect)' }}
                                  letterSpacing="-1">
                                {tdsValue}
                            </text>
                            <text x="70" y="128" textAnchor="middle" fontSize="10" fontWeight="bold"
                                  fontFamily="monospace" fill={cfg.lcd} opacity="0.8">ppm</text>
                        </g>

                        {/* Brand Section */}
                        <g transform="translate(70, 185)" opacity="0.6">
                            <path d="M-8 -10 C-12 -6 -12 2 -8 6 C-4 10 4 10 8 6 C12 2 12 -6 8 -10 C4 -14 -4 -14 -8 -10" fill={cfg.lcd} opacity="0.2" />
                            <path d="M-4 -4 C-6 -2 -6 2 -4 4 C-2 6 2 6 4 4 C6 2 6 -2 4 -4 C2 -6 -2 -6 -4 -4" fill={cfg.lcd} />
                            <text y="15" textAnchor="middle" fontSize="9" fontWeight="800" fill="#cbd5e1" letterSpacing="1">EVARATECH</text>
                        </g>

                        {/* Side Buttons (Realistic) */}
                        <rect x="118" y="70" width="4" height="25" rx="2" fill="#1a202c" />
                        <rect x="118" y="105" width="4" height="25" rx="2" fill="#1a202c" />
                    </svg>
                </div>

                {/* Splash Effect at Water Line */}
                <div className="absolute bottom-[38%] left-1/2 -translate-x-1/2 w-48 h-12 z-20 pointer-events-none opacity-60">
                    <svg viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M60 20 Q100 0 140 20 Q100 40 60 20" fill="rgba(255,255,255,0.4)" filter="blur(4px)" />
                        <circle cx="85" cy="15" r="2" fill="white" />
                        <circle cx="115" cy="10" r="1.5" fill="white" />
                        <circle cx="100" cy="25" r="2.5" fill="white" />
                    </svg>
                </div>
            </div>

            {/* ── Water body (Image 2 style) ── */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden z-10"
                style={{
                    height: '42%',
                    background: 'linear-gradient(180deg, #0082f3 0%, #004db2 100%)'
                }}>

                {/* Surface Surface Glow Line */}
                <div className="absolute top-0 left-0 w-full h-[3px] bg-white opacity-40 blur-[1px] z-20" />
                
                {/* Surface Shimmer */}
                <div className="absolute top-0 left-0 w-full h-12 pointer-events-none z-20"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
                        animation: 'tdsShine 4s ease-in-out infinite',
                    }} />

                {/* Primary Wave */}
                <div className="absolute top-[-20px] left-0 w-[200%] h-24 z-10"
                    style={{
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 560 40' fill='%230082f3' fill-opacity='0.6' xmlns='http://www.w3.org/2000/svg'><path d='M0 20C140 20 140 0 280 0C420 0 420 20 560 20V40H0V20Z'/></svg>")`,
                        backgroundRepeat: 'repeat-x',
                        backgroundPosition: '0 bottom',
                        animation: 'tdsWave 8s linear infinite',
                        filter: 'blur(1px)'
                    }} />
                
                {/* Secondary Wave */}
                <div className="absolute top-[-15px] left-[-50%] w-[200%] h-24 z-[5] opacity-40"
                    style={{
                        backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 560 40' fill='%2300b4ff' fill-opacity='0.4' xmlns='http://www.w3.org/2000/svg'><path d='M0 20C140 20 140 0 280 0C420 0 420 20 560 20V40H0V20Z'/></svg>")`,
                        backgroundRepeat: 'repeat-x',
                        backgroundPosition: '0 bottom',
                        animation: 'tdsWave 12s linear infinite reverse',
                    }} />

                {/* Submerged Probe Reflection / Shadow */}
                <div className="absolute left-1/2 -top-10 -translate-x-1/2 w-24 h-40 bg-black/20 blur-2xl rounded-full z-[8]" />
            </div>
        </div>
    );
};

export default TDSMeterVisual;
