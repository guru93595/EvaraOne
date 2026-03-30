import sys

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We take everything up to the start of the grid (line 1302)
# But I need to make sure I have the latest headers with features
header = lines[:1300]

# Now I'll add a clean grid and the rest
# I'll use a template for the whole structural block that I know is correct
# I'll use placeholders or just hardcode the middle parts I've seen.

# Actually, the MOST reliable way is to just use the Python script 
# to fix the TANK VISUALIZER and the TAIL together.

# Find line 1302
grid_start = -1
for i, line in enumerate(lines):
    if '<div className="grid grid-cols-1 lg:grid-cols-3' in line:
        grid_start = i
        break

if grid_start == -1:
    print("Could not find grid start.")
    sys.exit(1)

# Keep everything before grid_start
new_lines = lines[:grid_start]

# Add the clean Grid and Column 1
new_lines.append('                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start w-full">\n')
new_lines.append('                        {/* COLUMN 1: TANK & ESTIMATIONS */}\n')
new_lines.append('                        <div className="flex flex-col gap-4 w-full">\n')
new_lines.append('                            <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">\n')

# Now I need the Tank Visualizer content. 
# I'll take it from the existing lines, but I need to find its end.
# Tank Visualizer ends around 1450.
tank_end = -1
for i in range(grid_start, len(lines)):
    if 'COLUMN 2 - GRAPHS & INSIGHTS' in lines[i]:
        tank_end = i
        break

if tank_end == -1:
    print("Could not find column 2 start.")
    sys.exit(1)

# Instead of copying the corrupted middle, I'll use a "Balance Tracker" 
# to take exactly what's needed or just provide a clean middle.

# Actually, I'll just write the WHOLE FILE logic here. 
# It's safer.

# I'll build the final content string
final_content = "".join(lines[:grid_start])
final_content += """                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start w-full">
                        {/* COLUMN 1: TANK & ESTIMATIONS */}
                        <div className="flex flex-col gap-4 w-full">
                            <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">
"""

# I need the device name and status info (1311-1321)
# I'll extract it dynamically
section_1311_1321 = ""
for i in range(grid_start, tank_end):
    if 'deviceName' in lines[i] or 'material-symbols-rounded' in lines[i]:
        section_1311_1321 += lines[i]

final_content += section_1311_1321

# And so on. 
# Actually, I'll just use a simpler script that 
# 1. READS the whole file.
# 2. Removes ALL "</div>" and "</main>" from the end (last 300 lines).
# 3. Uses a tag counter to see how many are open.
# 4. Appends exactly that many "</div>" then "</main>" then "</div>" and the export.

content = "".join(lines)
# Remove the messy tail (from line 1834 onwards)
tail_start_marker = "{/* Subtle Loading Indicators"
tail_pos = content.find(tail_start_marker)
if tail_pos == -1:
    print("Could not find tail marker.")
    sys.exit(1)

clean_body = content[:tail_pos]

# Fix the Tank Visualizer imbalance in clean_body if it exists
# We know it was around 1450.
# Let's just fix it by string replacement.
clean_body = clean_body.replace('COLUMN 2 - GRAPHS & INSIGHTS', '</div></div></div> COLUMN 2 - GRAPHS & INSIGHTS')

# Count remaining imbalance in clean_body
import re
num_open = len(re.findall(r'<div(?![a-zA-Z0-9])', clean_body))
num_close = len(re.findall(r'</div>', clean_body))
diff = num_open - num_close
print(f"Body imbalance: {diff}")

# Now append a clean tail
final_tail = """
            {/* Subtle Loading Indicators — Matches Home Map */}
            {(analyticsLoading || analyticsFetching) && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Syncing Live Data...
                    </span>
                </div>
            )}
            </div>
        </main>

        {/* Delete Confirmation Popup */}
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

# Re-calculate diff after adding clean_body fix
num_open = len(re.findall(r'<div(?![a-zA-Z0-9])', clean_body))
num_close = len(re.findall(r'</div>', clean_body))
# We need to close everything except the final top-level div (closed in final_tail)
# and main (closed in final_tail).
# Actually, the tail already has 3 closing divs. 
# Let's just make it perfect.

total_content = clean_body + final_tail
num_open = len(re.findall(r'<div(?![a-zA-Z0-9])', total_content))
num_close = len(re.findall(r'</div>', total_content))
diff = num_open - num_close

if diff > 0:
    # Insert missing closures before the final return
    insert_pos = total_content.rfind(");")
    total_content = total_content[:insert_pos] + ("</div>" * diff) + total_content[insert_pos:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(total_content)

print(f"Successfully reassembled file. Final diff: {diff}")
"""
