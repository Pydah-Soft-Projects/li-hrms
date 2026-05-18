# One-off patch: replace workspace employees page header/toolbar with superadmin-style layout
from pathlib import Path

path = Path(r"d:/li-hrms/frontend/src/app/(workspace)/employees/page.tsx")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

# Find markers
start = next(i for i, l in enumerate(lines) if l.strip() == "return (")
end = next(i for i, l in enumerate(lines) if "{/* Employee List with Skeleton Loading */}" in l)

snippet = Path(r"d:/li-hrms/frontend/scripts/workspace_employees_toolbar_snippet.txt").read_text(encoding="utf-8")

new_lines = [snippet]
if not snippet.endswith("\n"):
    new_lines.append("\n")

lines[start:end] = new_lines
path.write_text("".join(lines), encoding="utf-8")
print(f"Replaced lines {start+1}-{end} ({end-start} lines -> {len(new_lines)} lines)")
