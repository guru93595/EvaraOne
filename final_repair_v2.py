import os

file_path = r'd:\MAIN\client\src\pages\EvaraTankAnalytics.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Balance check logic
depth = 0
for i, line in enumerate(lines):
    # This is a very rough check but helps us see where we stand
    depth += line.count("<div") - line.count("</div>")

print(f"Current net depth: {depth}")

# We need to find the place where we can safely close the tags.
# That is just before the </main> tag and the closing top-level div.

# Re-read and replace the tail
content = "".join(lines)
# Find last </main>
main_close_index = content.rfind("</main>")
if main_close_index != -1:
    # Everything after </main> but before the final closing div and return
    # Let's find the closing div of the top level
    last_div_close = content.rfind("</div>", main_close_index)
    if last_div_close == -1:
        # If no div close after main_close, the file is really broken
        # Let's find the end of the function
        end_marker = ");"
        end_pos = content.rfind(end_marker)
    else:
        end_pos = last_div_close

    # For safety, I'll just append 12 </div> at the end of the return
    header = content[:main_close_index]
    
    # Let's find how many divs are open AT line 639
    # We want to close everything opened after the top-level div (635) and main (639)
    # So we'll add enough </div> to bring depth back to 2 (one for top div, one for max-width)
    # Wait, if we want to close main, we need depth for content inside main.
    
    # Let's just use a brute force balance to 0 unclosed divs.
    # Total Open: 140. Total Close: 130. Need 10 more.
    
    repaired = header + ("</div>" * 10) + content[main_close_index:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(repaired)
    print("Repaired with 10 extra div closures.")
else:
    print("Could not find </main> to anchor repair.")
