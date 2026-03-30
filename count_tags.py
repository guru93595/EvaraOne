import sys

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

div_open = content.count("<div")
div_close = content.count("</div>")
main_open = content.count("<main")
main_close = content.count("</main")
fragment_open = content.count("<>")
fragment_close = content.count("</>")

print(f"div: {div_open} / {div_close}")
print(f"main: {main_open} / {main_close}")
print(f"fragment: {fragment_open} / {fragment_close}")

if div_open != div_close or main_open != main_close or fragment_open != fragment_close:
    print("IMBALANCE DETECTED!")
else:
    print("Tags are balanced.")
