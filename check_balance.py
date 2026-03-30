import re

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    # Find all <div (ignoring self-closing)
    # This regex handles <div ... > but not multi-line ones well.
    # However, most are single line opening in this file.
    
    # Let's just count <div and </div> globally and see the net.
    pass

content = "".join(lines)
num_div_open = len(re.findall(r'<div(?![a-zA-Z0-9])', content))
num_div_close = len(re.findall(r'</div>', content))
num_main_open = len(re.findall(r'<main(?![a-zA-Z0-9])', content))
num_main_close = len(re.findall(r'</main>', content))

print(f"Total Div: Open {num_div_open}, Close {num_div_close}, Diff {num_div_open - num_div_close}")
print(f"Total Main: Open {num_main_open}, Close {num_main_close}, Diff {num_main_open - num_main_close}")
