import re

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. CLEAN THE TAIL: Remove any existing closing div/main tags after showDeleteConfirm
# This prevents cumulative errors from previous attempts.
# Find the start of showDeleteConfirm
pos = content.rfind("{showDeleteConfirm && (")
if pos != -1:
    # Keep up to the end of the showDeleteConfirm block (which we'll reconstruct)
    # Actually, simpler: find the last export default and go back
    export_pos = content.rfind("export default")
    if export_pos != -1:
        # Keep everything before the return ends
        return_end_pos = content.rfind(");", pos, export_pos)
        if return_end_pos != -1:
            clean_content = content[:return_end_pos]
        else:
            clean_content = content[:pos] # fallback
    else:
        clean_content = content
else:
    clean_content = content

# 2. COUNT IMBALANCE in clean_content
div_open = len(re.findall(r'<div(?![a-zA-Z0-9])', clean_content))
div_close = len(re.findall(r'</div>', clean_content))
main_open = len(re.findall(r'<main(?![a-zA-Z0-9])', clean_content))
main_close = len(re.findall(r'</main>', clean_content))

div_diff = div_open - div_close
main_diff = main_open - main_close

print(f"Imbalance before final closure: Div {div_diff}, Main {main_diff}")

# 3. CONSTRUCT BALANCED TAIL
# We need to close showDeleteConfirm if we cut it in the middle
balanced_tail = ""
if "{showDeleteConfirm && (" in clean_content and ")}" not in clean_content[clean_content.rfind("{showDeleteConfirm && ("):]:
     balanced_tail += "        )}\n"

# Close all pending divs except top-level ones closed by the very end
# Actually, just close EVERYTHING here.
balanced_tail += "</div>" * (div_diff - 1) # Close all but top-most div
balanced_tail += "</main>" * main_diff
balanced_tail += "</div>\n    );\n};\n\nexport default EvaraTankAnalytics;"

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(clean_content + balanced_tail)

print("File reconstructed and balanced.")
