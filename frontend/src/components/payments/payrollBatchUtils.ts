import type { PayrollBatch, PayrollBatchStatus } from "@/lib/api";

export const UNASSIGNED_DIV_KEY = "__unassigned__";

export function getDivisionKey(batch: PayrollBatch): string {
  const d = batch.division;
  if (!d) return UNASSIGNED_DIV_KEY;
  if (typeof d === "string") return d;
  return String(d._id || UNASSIGNED_DIV_KEY);
}

export function getDivisionLabel(batch: PayrollBatch): string {
  const d = batch.division;
  if (!d) return "Unassigned division";
  if (typeof d === "string") return "Division";
  return d.name?.trim() || "Unassigned division";
}

export type DepartmentGroup = {
  deptId: string;
  deptName: string;
  batches: PayrollBatch[];
};

export type DivisionGroup = {
  key: string;
  label: string;
  departments: DepartmentGroup[];
  batches: PayrollBatch[];
};

function sortBatches(a: PayrollBatch, b: PayrollBatch) {
  return String(a.batchNumber || "").localeCompare(String(b.batchNumber || ""), undefined, {
    numeric: true,
  });
}

export function groupBatchesForUi(batches: PayrollBatch[]): DivisionGroup[] {
  type Acc = { label: string; deptMap: Map<string, PayrollBatch[]> };
  const byDiv = new Map<string, Acc>();

  for (const b of batches) {
    const dk = getDivisionKey(b);
    const label = getDivisionLabel(b);
    if (!byDiv.has(dk)) {
      byDiv.set(dk, { label, deptMap: new Map() });
    }
    const acc = byDiv.get(dk)!;
    if (label && acc.label === "Unassigned division" && label !== "Unassigned division") {
      acc.label = label;
    }
    const deptId =
      typeof b.department === "object" && b.department
        ? String(b.department._id)
        : String(b.department || "unknown");
    if (!acc.deptMap.has(deptId)) {
      acc.deptMap.set(deptId, []);
    }
    acc.deptMap.get(deptId)!.push(b);
  }

  const out: DivisionGroup[] = [];
  for (const [key, { label, deptMap }] of byDiv) {
    const departments: DepartmentGroup[] = [];
    for (const [deptId, list] of deptMap) {
      const deptName =
        list[0] && typeof list[0].department === "object" && list[0].department
          ? list[0].department.name
          : "Department";
      departments.push({
        deptId,
        deptName,
        batches: [...list].sort(sortBatches),
      });
    }
    departments.sort((a, b) => a.deptName.localeCompare(b.deptName, undefined, { sensitivity: "base" }));
    const flat = departments.flatMap((d) => d.batches);
    out.push({ key, label, departments, batches: flat });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}

export function batchesEligibleForAction(
  batches: PayrollBatch[],
  action: "approve" | "freeze" | "complete",
): PayrollBatch[] {
  const want: Record<typeof action, PayrollBatchStatus> = {
    approve: "pending",
    freeze: "approved",
    complete: "freeze",
  };
  const s = want[action];
  return batches.filter((b) => b.status === s);
}
