import re

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# We want to repair the structure from line 634 (return)
start_pos = content.find("return (")
if start_pos == -1:
    print("No return found")
    sys.exit(1)

# We'll re-scan the WHOLE file content for tags to build a stack
# and then use it to judge what's open at the end.

tokens = re.findall(r'<(div|main)(?![a-zA-Z0-9])|</div>|</main>|<[^>]+/>|{showDeleteConfirm && \(| \)} ', content)
# Actually, re.findall with groups is tricky. 
# Let's use re.finditer

stack = []
idx = 0
# We'll only track from the return start
for match in re.finditer(r'<(div|main)(?![a-zA-Z0-9])|</div>|</main>|<[^>]+/>|{showDeleteConfirm && \(|\)}', content[start_pos:]):
    tag = match.group(0)
    if tag.startswith("<div") or tag.startswith("<main"):
        if not tag.endswith("/>"): # ignore self-closing
            tag_name = "div" if "div" in tag else "main"
            stack.append((tag_name, match.start() + start_pos))
    elif tag == "</div>":
        if stack and stack[-1][0] == "div":
            stack.pop()
    elif tag == "</main>":
        if stack and stack[-1][0] == "main":
            stack.pop()
    elif tag == "{showDeleteConfirm && (":
        stack.append(("conditional", match.start() + start_pos))
    elif tag == ")}":
        if stack and stack[-1][0] == "conditional":
            stack.pop()

print(f"Stack at end: {stack}")

# We want to find the last valid content (Timeline or Loading Indicators)
# and then close everything in the stack.

# Find the Loading Indicators closing brace
end_loading = content.rfind("Syncing Live Data...")
if end_loading != -1:
    end_of_loading_block = content.find(")}", end_loading)
    if end_of_loading_block != -1:
        base_content = content[:end_of_loading_block + 2]
    else:
        base_content = content[:end_loading + 50]
else:
    # fallback to just before the mess
    base_content = content[:content.rfind("{/* Delete Confirmation Popup")-10]

# Now, we need to close the stack EXCEPT the ones that should be closed AFTER the modal or at the very end.
# Actually, let's just build a clean terminal sequence.

# We'll close everything that was opened BEFORE the modal.
# Then we'll add the modal.
# Then we'll close the top-level div.

modal_code = """
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
"""

# Re-scan base_content to see what's open
new_stack = []
for match in re.finditer(r'<(div|main)(?![a-zA-Z0-9])|</div>|</div>|</main>|{showDeleteConfirm && \(|\)}', base_content[start_pos:]):
    tag = match.group(0)
    if tag.startswith("<div") or tag.startswith("<main"):
        if not tag.endswith("/>"):
            tag_name = "div" if "div" in tag else "main"
            new_stack.append(tag_name)
    elif tag == "</div>":
        if new_stack and new_stack[-1] == "div":
            new_stack.pop()
    elif tag == "</main>":
        if new_stack and new_stack[-1] == "main":
            new_stack.pop()

print(f"Pending to close: {new_stack}")

final_rep = base_content
# We want to close all nested divs, then close main, then add modal, then close top div.
# Top level is div (635), Then main (639), Then max-width (641).
# So we expect new_stack to end with ['div', 'main', 'div'] if everything else is closed.

for name in reversed(new_stack[3:]):
    final_rep += f"</div>" if name == "div" else "</main>"

final_rep += "</div>" # Close max-width (641)
final_rep += "</main>" # Close main (639)
final_rep += modal_code
final_rep += "</div>\n    );\n};\n\nexport default EvaraTankAnalytics;"

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(final_rep)

print("Repair completed.")
