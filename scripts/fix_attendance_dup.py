from pathlib import Path

p = Path(r"d:/li-hrms/frontend/src/app/(workspace)/attendance/page.tsx")
t = p.read_text(encoding="utf-8")
needle = "import { api } from '@/lib/api';\n\nfunction AttendanceEmployeeBlock"
idx = t.find(needle)
if idx < 0:
    raise SystemExit("needle not found")
end = t.find("import { sortByEmpNo }", idx)
t = t[:idx] + "import { api } from '@/lib/api';\n" + t[end:]
p.write_text(t, encoding="utf-8")
print("done")
