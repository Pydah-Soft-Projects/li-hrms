import re

file_path = '/home/ashleshbathina/projects/pydahsoft/li-hrms/frontend/src/app/(workspace)/leaves/page.tsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

balance = 0
leaves_page_start = 341 - 1 # 0-indexed

for i, line in enumerate(lines):
    # Remove comments
    line = re.sub(r'//.*', '', line)
    
    # Simple brace counting (ignoring strings for now, which might be risky but usually fine for structural checks)
    open_braces = line.count('{')
    close_braces = line.count('}')
    
    balance += (open_braces - close_braces)
    
    if i >= leaves_page_start:
        if balance == 0:
            print(f"LeavesPage potentially closed at line {i+1}")
            # we want to see if it closes BEFORE 857
            if i + 1 < 857:
                print("CRITICAL: LeavesPage closed before line 857!")
                break

print(f"Balance at end of file: {balance}")
print(f"Balance at line 857: {balance}") # Actually this will print the balance at the end of loop if we don't break
