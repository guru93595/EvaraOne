import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import tankIcon from '../../public/tank.png';

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none 
                ${checked ? 'bg-[#0077ff]' : 'bg-[#e2e8f0]'}`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${checked ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    );
};

const GreenTextToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={`relative inline-flex h-[28px] w-[54px] flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none overflow-hidden items-center shadow-sm
                ${checked ? 'bg-[#34C759]' : 'bg-[#cbd5e1]'}`}
        >
            <span 
                className={`absolute text-[10px] font-[900] tracking-wider text-white transition-opacity duration-200 ease-in-out left-1.5`}
                style={{ opacity: checked ? 1 : 0 }}
            >
                ON
            </span>
            <span 
                className={`absolute text-[10px] font-[900] tracking-wider text-slate-500 transition-opacity duration-200 ease-in-out right-1.5`}
                style={{ opacity: checked ? 0 : 1 }}
            >
                OFF
            </span>
            <span
                className={`pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out z-10
                    ${checked ? 'translate-x-[26px]' : 'translate-x-0'}`}
            />
        </button>
    );
};

const ConfigureNode = () => {
    const navigate = useNavigate();

    // Toggle states matching the screenshot
    const [globalStatus, setGlobalStatus] = useState(true);
    const [mapView, setMapView] = useState(false);
    const [waterLevel, setWaterLevel] = useState(true);
    const [estimations, setEstimations] = useState(false);
    const [fillRate, setFillRate] = useState(true);
    const [consumption, setConsumption] = useState(true);
    const [activeAlerts, setActiveAlerts] = useState(true);
    const [deviceHealth, setDeviceHealth] = useState(true);
    const [waterVolume, setWaterVolume] = useState(false);

    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: '#1C1C1E' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                
                <div className="max-w-[1000px] mx-auto flex flex-col gap-4">
                    {/* Page Header */}
                    <div className="flex flex-col gap-0 mb-0">
                        <button 
                            onClick={() => navigate(-1)} 
                            className="w-fit flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#0077ff] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors border-none cursor-pointer mb-2"
                        >
                            <ArrowLeft size={14} /> Back
                        </button>
                        
                        <div className="flex justify-between items-center w-full">
                            <div>
                                <div className="flex items-center gap-3">
                                    <Settings size={22} style={{ color: '#64748b' }} />
                                    <h2 className="text-[28px] font-bold m-0" style={{ color: '#1c2b4f', letterSpacing: '-0.5px' }}>
                                        Configuration
                                    </h2>
                                </div>
                                <p className="text-[15px] font-medium m-0 mt-0.5" style={{ color: '#64748b' }}>
                                    Manage system parameters and controls
                                </p>
                            </div>
                            
                            <div className="flex items-center justify-center">
                                <GreenTextToggleSwitch checked={globalStatus} onChange={() => setGlobalStatus(!globalStatus)} />
                            </div>
                        </div>
                    </div>

                    {/* Main Content Card */}
                    <div className="apple-glass-card rounded-[2rem] p-8 md:p-10" style={{ 
                        background: 'rgba(255, 255, 255, 0.18)', 
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.35)', 
                        boxShadow: '0 20px 40px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)' 
                    }}>
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/50">
                            <div className="flex items-center gap-3">
                                <img src={tankIcon} alt="Tank" className="w-8 h-8 object-contain" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }} />
                                <h3 className="text-xl font-bold m-0" style={{ color: '#1c2b4f' }}>EvaraTank Parameters</h3>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#34C759]/10 text-[#28a745] border border-[#34C759]/20 shadow-sm">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse"></span>
                                LIVE SYNC
                            </div>
                        </div>

                        {/* Toggles Container */}
                        <div className="flex flex-col gap-7">
                            {/* Parameter 1 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Map View</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Show or hide this node on the global map</p>
                                </div>
                                <ToggleSwitch checked={mapView} onChange={() => setMapView(!mapView)} />
                            </div>

                            {/* Parameter 2 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Tank Water Level</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Track real-time tank level</p>
                                </div>
                                <ToggleSwitch checked={waterLevel} onChange={() => setWaterLevel(!waterLevel)} />
                            </div>

                            {/* Parameter 3 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Estimations</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Predictive usage and time-to-fill</p>
                                </div>
                                <ToggleSwitch checked={estimations} onChange={() => setEstimations(!estimations)} />
                            </div>

                            {/* Parameter 4 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Fill Rate</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Monitor incoming water flow</p>
                                </div>
                                <ToggleSwitch checked={fillRate} onChange={() => setFillRate(!fillRate)} />
                            </div>

                            {/* Parameter 5 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Consumption</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Track water usage over time</p>
                                </div>
                                <ToggleSwitch checked={consumption} onChange={() => setConsumption(!consumption)} />
                            </div>

                            {/* Parameter 6 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Active Alerts</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>System warnings and notifications</p>
                                </div>
                                <ToggleSwitch checked={activeAlerts} onChange={() => setActiveAlerts(!activeAlerts)} />
                            </div>

                            {/* Parameter 7 */}
                            <div className="flex justify-between items-center group">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Device Health</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Monitor sensor and connection status</p>
                                </div>
                                <ToggleSwitch checked={deviceHealth} onChange={() => setDeviceHealth(!deviceHealth)} />
                            </div>

                            {/* Parameter 8 */}
                            <div className="flex justify-between items-center pb-2">
                                <div className="flex flex-col">
                                    <h4 className="text-[15px] font-bold m-0" style={{ color: '#1c2b4f' }}>Tank Water Volume</h4>
                                    <p className="text-[13px] font-medium m-0 mt-1.5" style={{ color: '#64748b' }}>Total capacity and current volume</p>
                                </div>
                                <ToggleSwitch checked={waterVolume} onChange={() => setWaterVolume(!waterVolume)} />
                            </div>

                            {/* Divider line before actions */}
                            <div className="w-full h-px bg-slate-200/60 mt-2 mb-2"></div>

                            {/* Bottom Actions */}
                            <div className="flex justify-between items-center mt-2">
                                <button className="text-[14px] font-bold text-[#64748b] hover:text-[#1c2b4f] transition-colors bg-transparent border-none cursor-pointer p-0">
                                    Restore Defaults
                                </button>
                                <button 
                                    className="px-8 flex items-center justify-center rounded-full font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] border-none cursor-pointer" 
                                    style={{ 
                                        height: '46px',
                                        background: 'linear-gradient(180deg, #4da4ff 0%, #0077ff 100%)',
                                        boxShadow: '0 8px 16px rgba(0, 119, 255, 0.25), inset 0 1px 1px rgba(255,255,255,0.3)',
                                        fontSize: '14.5px',
                                        letterSpacing: '0.2px'
                                    }}
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ConfigureNode;
