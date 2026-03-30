import os

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We want to keep everything before line 634 (the return statement)
# Actually, let's keep everything up to the line before "return ("
header_lines = []
for line in lines:
    if 'return (' in line:
        break
    header_lines.append(line)

# The content I want to put in the return statement
# I will use a template that I know is correct
# I'll use placeholders for data that I'll fill from the existing file if needed, 
# but for JSX structure I'll use a clean version.

# Use a clean reassembled return block
# I'll use the chunks I've been seeing
return_block = """    return (
        <div className="min-h-screen font-sans relative overflow-x-hidden bg-transparent" style={{ color: '#1C1C1E' }}>
            <main className="relative flex-grow px-4 sm:px-6 lg:px-8 pt-[110px] lg:pt-[120px] pb-8" style={{ zIndex: 1 }}>
                <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
                    
                    {/* Breadcrumb + Page Heading row */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
                        <div className="flex flex-col gap-2">
                             {/* ... breadcrumb and header ... */}
                             {/* I'll use a simplified header for now or try to extract it */}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
"""

# Actually, I'll just use the Python script to fix the EXISTING file's end tags.
# This is less risky than replacing the whole return block.

# Trace balance from 634
print("Tracing balance...")
content = "".join(lines)
start_pos = content.find("return (")
if start_pos == -1:
    print("Could not find return (")
    sys.exit(1)

# I will replace from 1830 to the end with a clean closing sequence
# This is where the mess is.

# Find the last part of the timeline
end_timeline_marker = "Today's Event Timeline"
timeline_pos = content.rfind(end_timeline_marker)

new_tail = """
                        <div className="relative h-48 flex items-center px-8 pb-4">
                            <div className="absolute left-8 right-8 h-[2.5px] bg-black/30 rounded-full top-[35%] -translate-y-1/2" />
                            <div className="absolute left-8 right-8 flex justify-between top-[35%] -translate-y-1/2 px-0 w-[calc(100%-64px)] pointer-events-none">
                                {Array.from({ length: 21 }).map((_, i) => (
                                    <div key={i} style={{ 
                                        width: i % 5 === 0 ? '2.5px' : '1px', 
                                        height: i % 5 === 0 ? '14px' : '8px', 
                                        background: 'rgba(0,0,0,0.5)',
                                        marginTop: i % 5 === 0 ? '-1px' : '0px'
                                    }} />
                                ))}
                            </div>

                            <div style={{ marginTop: '0px' }} className="absolute left-8 right-8 top-[35%] z-20 pointer-events-none">
                                <div className="relative w-full">
                                {[
                                    { time: '08:15 AM', label: 'Refill Start', icon: TrendingUp, color: '#34C759', pos: '10%', desc: 'Refill detected' },
                                    { time: '09:45 AM', label: 'Complete', icon: Activity, color: '#0A84FF', pos: '25%', desc: 'Tank at 95%' },
                                    { time: '12:30 PM', label: 'Peak Use', icon: Activity, color: '#FF3B30', pos: '45%', desc: 'High usage' },
                                    { time: '03:45 PM', label: 'Stabilized', icon: Activity, color: '#0A84FF', pos: '65%', desc: 'No flow' },
                                    { time: '06:20 PM', label: 'Evening Use', icon: Activity, color: '#FF9500', pos: '80%', desc: 'Normal usage' },
                                    { time: '08:50 PM', label: 'Top-up Start', icon: TrendingUp, color: '#34C759', pos: '95%', desc: 'Auto refill' }
                                ].map((event, idx) => (
                                    <div key={idx} className="absolute flex flex-col items-center group cursor-pointer pointer-events-auto" style={{ left: event.pos, transform: 'translateX(-50%) translateY(-10px)' }}>
                                        <div className="w-5 h-5 rounded-full border-[3px] border-white shadow-lg transition-all group-hover:scale-125 z-10" style={{ background: event.color }} />
                                        <div className="apple-glass-card p-2 px-4 rounded-2xl flex flex-col items-center gap-0.5 shadow-xl opacity-90 group-hover:opacity-100 transition-all group-hover:-translate-y-1 border" 
                                             style={{ 
                                                 background: 'rgba(255, 255, 255, 0.98)', 
                                                 minWidth: '94px', 
                                                 borderColor: `{event.color}40`,
                                                 marginTop: '8px'
                                             }}>
                                            <span className="text-[12px] font-black leading-none" style={{ color: event.color }}>{event.time}</span>
                                            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight text-center">{event.label}</span>
                                            <span className="text-[8px] font-medium text-slate-400 mt-0.5 uppercase">{event.desc}</span>
                                        </div>
                                    </div>
                                ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {(analyticsLoading || analyticsFetching) && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Syncing Live Data...
                        </span>
                    </div>
                )}
            </main>

            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-20" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
                    onClick={() => !isDeleting && setShowDeleteConfirm(false)}>
                    <div className="rounded-3xl p-8 flex flex-col w-full max-w-sm text-center"
                        style={{
                            background: 'white',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                        onClick={e => e.stopPropagation()}>
                        
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons" style={{ fontSize: '32px' }}>delete_outline</span>
                        </div>
                        
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Delete this Node?</h3>
                        <p className="text-sm text-gray-500 mb-8">
                            This will permanently remove <strong>{deviceName}</strong> and all its historical telemetry data. This action cannot be undone.
                        </p>
                        
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className={`w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${isDeleting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-200 active:scale-95'}`}
                            >
                                {isDeleting ? 'Deleting...' : 'Yes, Delete Node'}
                            </button>
                            <button 
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EvaraTankAnalytics;
"""

# I need to find where "relative h-48" starts and replace from there
marker = '<div className="relative h-48 flex items-center px-8 pb-4">'
split_content = content.split(marker)
if len(split_content) > 1:
    # We take everything before the first occurrence of the marker
    header = split_content[0]
    final_content = header + marker + new_tail
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(final_content)
    print("Repaired file successfully.")
else:
    print("Could not find marker.")
"""
