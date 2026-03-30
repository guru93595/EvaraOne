import sys

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    # Very simple tag and bracket tracker
    # We only care about major structural tags: <main, </main, <div, </div, return (
    
    # Check for return (
    if 'return (' in line:
        stack.append(('return', line_num))
        continue
    
    # Check for <div
    if '<div' in line and not '</div>' in line:
        # Avoid count if it's a self-closing div or just a string
        if not '/>' in line.split('<div')[-1]:
            stack.append(('div', line_num))
    
    # Check for <main
    if '<main' in line:
        stack.append(('main', line_num))
        
    # Check for </div
    if '</div>' in line:
        if stack and stack[-1][0] == 'div':
            stack.pop()
        else:
            print(f"Error: Unexpected </div> at line {line_num}. Current stack: {stack[-5:]}")
            # sys.exit(1) # Don't exit, find all errors

    # Check for </main
    if '</main' in line:
        if stack and stack[-1][0] == 'main':
            stack.pop()
        else:
            print(f"Error: Unexpected </main> at line {line_num}. Current stack: {stack[-5:]}")

    # Check for ); at end of return
    if ');' in line and any(s[0] == 'return' for s in stack):
        while stack and stack[-1][0] != 'return':
            tag, ln = stack.pop()
            print(f"Error: Unclosed {tag} from line {ln} before ); at line {line_num}")
        if stack:
            stack.pop()

print("Finished scan.")
if stack:
    print(f"Unclosed items at end of file: {stack}")
