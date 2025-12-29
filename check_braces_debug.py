import re

file_path = '/home/ashleshbathina/projects/pydahsoft/li-hrms/frontend/src/app/(workspace)/leaves/page.tsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

balance = 0
leaves_page_start = 340 # line 341 is index 340

for i, line in enumerate(lines):
    # Remove comments (simple)
    line = re.sub(r'//.*', '', line)
    
    # We should ignore braces in strings/regex, but assuming code is mostly clean
    open_braces = line.count('{')
    close_braces = line.count('}')
    
    balance += (open_braces - close_braces)
    
    if i == 856: # Line 857 (0-indexed 856)
        print(f"Balance at line 857: {balance}")
    
    if i >= leaves_page_start and balance == 0:
         print(f"LeavesPage closed at line {i+1}")
         if i < 856:
             print("CLOSED EARLY!")
             break

