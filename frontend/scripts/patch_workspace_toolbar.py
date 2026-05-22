from pathlib import Path

snippet_path = Path(__file__).parent / "workspace_employees_toolbar.txt"
page_path = Path(__file__).parent.parent / "src" / "app" / "(workspace)" / "employees" / "page.tsx"

snippet = snippet_path.read_text(encoding="utf-8")
content = page_path.read_text(encoding="utf-8")

start_marker = "        {/* Header - Unified Layout */}"
end_marker = "      {/* Employee List with Skeleton Loading */}"
start = content.index(start_marker)
end = content.index(end_marker)
content = content[:start] + snippet + content[end:]

old_wrapper = (
    '<div className="relative min-h-screen bg-bg-base overflow-x-hidden">\n\n\n'
    '      <div className="relative z-10 max-w-[1920px] mx-auto  sm:px-8 py-6 sm:py-8 space-y-8">'
)
new_wrapper = (
    '<div className="relative min-h-screen">\n'
    '      <div className="relative z-10 mx-auto max-w-[1920px] px-4 pb-8 sm:px-6 lg:px-8">'
)
if old_wrapper not in content:
    raise SystemExit("wrapper not found")
content = content.replace(old_wrapper, new_wrapper, 1)

page_path.write_text(content, encoding="utf-8")
print("patched", page_path)
