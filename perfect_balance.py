import re

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

num_open = len(re.findall(r'<div(?![a-zA-Z0-9])', content))
num_close = len(re.findall(r'</div>', content))
diff = num_open - num_close

if diff > 0:
    print(f"Adding {diff} closing tags...")
    # Find last </main> and insert before it
    pos = content.rfind("</main>")
    if pos != -1:
        new_content = content[:pos] + ("</div>" * diff) + content[pos:]
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
elif diff < 0:
    print(f"Removing {abs(diff)} closing tags...")
    # This is trickier, we'll just find the last N </div> and remove them
    # But for safety, let's just find them near the end.
    for _ in range(abs(diff)):
        pos = content.rfind("</div>")
        if pos != -1:
            content = content[:pos] + content[pos+6:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
else:
    print("Already balanced.")
