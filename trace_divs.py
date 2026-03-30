import re

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    # Simple regex for <div and </div>
    # Using finditer to handle multiple tags on one line
    opens = list(re.finditer(r'<div(?![a-zA-Z0-9])', line))
    closes = list(re.finditer(r'</div>', line))
    self_closes = list(re.finditer(r'<div[^>]*/>', line)) # handle <div ... />
    
    # Actually, <div can be multi-line. Let's just look at characters.
    # But for a quick check, this is okay if we assume one per line or simple ones.
    
    for op in opens:
        # Check if it's self-closing on the same line
        # This is a bit naive but covers common cases
        is_self = False
        for sc in self_closes:
            if sc.start() == op.start():
                is_self = True
                break
        if not is_self:
            stack.append(line_num)
            
    for cl in closes:
        if stack:
            stack.pop()
        else:
            print(f"Error: Unexpected </div> at line {line_num}")

print(f"Finished scan. Unclosed divs: {len(stack)}")
if stack:
    # Print the last 20 unclosed tags
    print(f"Last 20 unclosed div lines: {stack[-20:]}")
