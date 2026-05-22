import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import type { Department, Division } from '@/lib/api';
import { buildDivisionToDepartmentIdsMap } from '@/lib/divisionDepartmentUtils';

function resolveManagerName(div: Division): string {
    if (!div.manager) return 'Vacant';
    return typeof div.manager === 'string' ? div.manager : div.manager.name || 'Vacant';
}

export interface DivisionDepartmentGroup {
    division: Division;
    manager: string;
    departments: Department[];
}

/**
 * Division → department links from both `Division.departments` and `Department.divisions`.
 */
export function buildDivisionDepartmentGroups(
    divisions: Division[],
    departments: Department[]
): DivisionDepartmentGroup[] {
    const deptById = new Map(departments.map((d) => [d._id, d]));
    const divToDeptIds = buildDivisionToDepartmentIdsMap(divisions, departments);

    const sortedDivisions = [...divisions].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    return sortedDivisions.map((division) => {
        const deptIds = divToDeptIds.get(division._id) || new Set();
        const deptList = [...deptIds]
            .map((id) => deptById.get(id))
            .filter(Boolean) as Department[];
        deptList.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        return {
            division,
            manager: resolveManagerName(division),
            departments: deptList,
        };
    });
}

export function downloadDivisionsHierarchyPdf(
    divisions: Division[],
    departments: Department[],
    fileBaseName = 'divisions_hierarchy'
): void {
    const groups = buildDivisionDepartmentGroups(divisions, departments);
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 18;
    const titleLine = 8;
    const bodyLine = 6.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Divisions & Departments', margin, y);
    y += titleLine;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    y += titleLine + 4;
    doc.setTextColor(0, 0, 0);

    const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - 12) {
            doc.addPage();
            y = 18;
        }
    };

    for (const { division, manager, departments: deptList } of groups) {
        const header = `${division.name}${division.code ? ` (${division.code})` : ''}`;
        const sub = `Manager: ${manager}`;

        ensureSpace(bodyLine * 3 + (deptList.length || 1) * bodyLine + 8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        const wrappedHeader = doc.splitTextToSize(header, pageWidth - margin * 2);
        doc.text(wrappedHeader, margin, y);
        y += wrappedHeader.length * bodyLine + 1;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        doc.text(sub, margin, y);
        y += bodyLine + 3;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        if (deptList.length === 0) {
            doc.setTextColor(110, 110, 110);
            doc.text('No departments linked', margin + 4, y);
            y += bodyLine;
            doc.setTextColor(0, 0, 0);
        } else {
            for (const dept of deptList) {
                ensureSpace(bodyLine);
                const line = `${dept.name}${dept.code ? ` (${dept.code})` : ''}`;
                const bullets = doc.splitTextToSize(`\u2022 ${line}`, pageWidth - margin * 2 - 4);
                doc.text(bullets, margin + 4, y);
                y += bullets.length * bodyLine;
            }
        }
        y += 6;
    }

    const safe = fileBaseName.replace(/[^\w\-]+/g, '_');
    doc.save(`${safe}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadDivisionsHierarchyExcel(
    divisions: Division[],
    departments: Department[],
    fileBaseName = 'divisions_hierarchy'
): void {
    const groups = buildDivisionDepartmentGroups(divisions, departments);
    const rows: (string | number)[][] = [
        ['Division', 'Division Code', 'Manager', 'Department', 'Department Code'],
    ];

    for (const { division, manager, departments: deptList } of groups) {
        if (deptList.length === 0) {
            rows.push([division.name, division.code || '', manager, 'No departments linked', '']);
        } else {
            deptList.forEach((dept, index) => {
                rows.push([
                    index === 0 ? division.name : '',
                    index === 0 ? division.code || '' : '',
                    index === 0 ? manager : '',
                    dept.name,
                    dept.code || '',
                ]);
            });
        }
        rows.push(['', '', '', '', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 36 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divisions');
    const safe = fileBaseName.replace(/[^\w\-]+/g, '_');
    XLSX.writeFile(wb, `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
