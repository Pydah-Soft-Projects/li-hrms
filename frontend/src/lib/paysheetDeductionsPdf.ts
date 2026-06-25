import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyProfile } from '@/lib/companyProfile';
import { drawPayslipCompanyHeader } from '@/lib/payslipPdf';
import { api, type PayrollOutputColumn } from '@/lib/api';
import { inferPayslipSectionFromField } from '@/lib/payslipSections';
import { sortByEmpNo } from '@/lib/employeeSort';

export type DeductionsExportFormat = 'combined' | 'by_department';

interface DeductionColumn {
    header: string;
    field: string;
    isDeduction: boolean;
}

interface DeductionsReportParams {
    month: string;
    year: number;
    filters?: {
        ecNo?: string;
        department?: string;
        division?: string;
        designation?: string;
        group?: string;
    };
    salaryKindLabel?: string;
    format?: DeductionsExportFormat;
}

interface EmployeeDeductionRow {
    ecNo: string;
    name: string;
    designation: string;
    division: string;
    department: string;
    group: string;
    deductions: Record<string, number>;
    total: number;
}

interface DivisionDepartmentGroup {
    division: string;
    departments: { department: string; rows: Record<string, unknown>[] }[];
}

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const DED: [number, number, number] = [190, 24, 60];
const DED_HEADER: [number, number, number] = [185, 28, 28];
const EMP_HEADER: [number, number, number] = [51, 65, 85];
const STRIPE: [number, number, number] = [248, 250, 252];
const BORDER: [number, number, number] = [226, 232, 240];
const BANNER_BG: [number, number, number] = [241, 245, 249];

const EMP_COL_COUNT = 7;

/** jsPDF standard fonts only support ASCII — strip/replace Unicode to avoid spaced glyphs. */
function pdfAscii(text: string): string {
    return String(text ?? '')
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u2022/g, '|')
        .replace(/\u20B9/g, 'Rs.')
        .replace(/[^\x00-\x7F]/g, '');
}

function formatInrPdf(amount: number): string {
    const n = Number.isFinite(amount) ? amount : 0;
    const parts = n.toFixed(2).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${intPart}.${parts[1]}`;
}

function formatGeneratedAt(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeHeaderKey(key: string): string {
    return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stringValue(value: unknown): string {
    if (value == null || value === '') return '';
    if (typeof value === 'object') {
        const obj = value as { name?: string };
        if (obj.name != null && String(obj.name).trim()) return String(obj.name).trim();
        return '';
    }
    return String(value).trim();
}

function truncateText(text: string, maxLen: number): string {
    const t = pdfAscii(String(text || '').trim());
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(0, maxLen - 3))}...`;
}

function pickEmpNoFromRow(row: Record<string, unknown>): string {
    const exportVal = stringValue(row._exportEmpNo);
    if (exportVal) return exportVal;

    const direct = stringValue(
        row['Employee Number'] ??
        row['Employee Code'] ??
        row['Emp No'] ??
        row['EMP NO'] ??
        row['E.No'] ??
        row['E No'] ??
        row['Employee No'] ??
        row['EC No'] ??
        row.emp_no
    );
    if (direct) return direct;

    for (const [k, v] of Object.entries(row)) {
        if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
        const norm = normalizeHeaderKey(k);
        if (
            norm === 'employeenumber' ||
            norm === 'empno' ||
            norm === 'employeecode' ||
            norm === 'eno' ||
            norm === 'staffno' ||
            norm === 'staffnumber'
        ) {
            return stringValue(v);
        }
    }

    const emp = (row.employeeId || {}) as Record<string, unknown>;
    return stringValue(row.emp_no ?? emp.emp_no);
}

function pickNameFromRow(row: Record<string, unknown>): string {
    const direct = stringValue(row['Employee Name'] ?? row['Name']);
    if (direct) return direct;

    for (const [k, v] of Object.entries(row)) {
        if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
        const norm = normalizeHeaderKey(k);
        if (norm === 'name' || norm === 'employeename') return stringValue(v);
    }

    const emp = (row.employeeId || {}) as Record<string, unknown>;
    return stringValue(emp.employee_name);
}

function pickDesignationFromRow(row: Record<string, unknown>): string {
    const direct = stringValue(row['Designation']);
    if (direct) return direct;

    for (const [k, v] of Object.entries(row)) {
        if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
        if (/\bdesignation\b/i.test(k)) return stringValue(v);
    }

    const emp = (row.employeeId || {}) as Record<string, unknown>;
    return stringValue(emp.designation_id);
}

function pickOrgFieldFromRow(row: Record<string, unknown>, kind: 'division' | 'department'): string {
    if (kind === 'division') {
        const exportVal = stringValue(row._exportDivision);
        if (exportVal) return exportVal;
        const direct = stringValue(row['Division'] ?? row.division);
        if (direct) return direct;
    } else {
        const exportVal = stringValue(row._exportDepartment);
        if (exportVal) return exportVal;
        const direct = stringValue(row['Department'] ?? row.department);
        if (direct) return direct;
    }

    for (const [k, v] of Object.entries(row)) {
        if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
        if (kind === 'division' && /\bdivision\b/i.test(k)) return stringValue(v);
        if (kind === 'department' && /\bdepartment\b/i.test(k)) return stringValue(v);
    }

    const emp = (row.employeeId || {}) as Record<string, unknown>;
    return stringValue(kind === 'division' ? emp.division_id : emp.department_id);
}

function pickGroupFromRow(row: Record<string, unknown>): string {
    const exportVal = stringValue(row._employeeGroup);
    if (exportVal) return exportVal;

    const direct = stringValue(row['Employee Group'] ?? row['Group'] ?? row['Emp Group']);
    if (direct) return direct;

    for (const [k, v] of Object.entries(row)) {
        if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
        const norm = normalizeHeaderKey(k);
        if (norm === 'group' || norm === 'employeegroup' || norm === 'empgroup') {
            return stringValue(v);
        }
        if (/\bemployee\s*group\b/i.test(k)) return stringValue(v);
    }

    const emp = (row.employeeId || {}) as Record<string, unknown>;
    return stringValue(emp.employee_group_id);
}

function pickFieldViaHeaders(
    row: Record<string, unknown>,
    headers: string[],
    match: (norm: string) => boolean
): string {
    for (const header of headers) {
        if (!match(normalizeHeaderKey(header))) continue;
        const val = stringValue(row[header]);
        if (val) return val;
    }
    return '';
}

function isCumulativeOrMetaColumn(header: string, field?: string): boolean {
    const norm = normalizeHeaderKey(header);
    const f = String(field || '').trim();

    if (
        f === 'deductions.deductionsCumulative' ||
        f === 'deductions.statutoryCumulative' ||
        f === 'deductions.totalDeductions' ||
        f === 'loanAdvance.remainingBalance' ||
        norm === 'deductionscumulative' ||
        norm === 'statutorycumulative' ||
        norm === 'statutorydeductions' ||
        norm === 'totaldeductions' ||
        norm.includes('remainingbalance') ||
        norm.includes('payableamount') ||
        norm === 'netsalary' ||
        norm === 'netpay' ||
        norm === 'roundoff' ||
        norm === 'roundoffamount'
    ) {
        return true;
    }

    if (/^total\b/i.test(header) && /deduction|cumulative/i.test(header)) return true;
    return false;
}

function fieldIsDeductionAmount(field: string): boolean {
    const f = String(field || '').trim();
    if (!f || isCumulativeOrMetaColumn('', f)) return false;
    if (f.startsWith('deductions.')) return true;
    if (f === 'loanAdvance.advanceDeduction' || f === 'loanAdvance.totalEMI') return true;
    if (f.startsWith('manualDeductions')) return true;
    return false;
}

function isAttendanceDaysColumn(header: string): boolean {
    const h = header.toLowerCase().trim();
    if (/deduction/i.test(h) && /days?$/i.test(h)) return true;
    const dayPatterns = [
        /days?$/i,
        /present\s*days?/i,
        /absent\s*days?/i,
        /paid\s*days?/i,
        /payable\s*days?/i,
        /week\s*off/i,
        /holiday/i,
        /leave\s*days?/i,
        /lop\s*days?/i,
        /od\s*days?/i,
        /shifts?$/i,
        /hours?$/i,
        /permission\s*count/i,
    ];
    return dayPatterns.some((p) => p.test(h));
}

function isEmployeeOrEarningColumn(header: string, field?: string): boolean {
    const h = header.toLowerCase().trim();
    const norm = normalizeHeaderKey(header);
    const f = String(field || '').trim();

    if (f.startsWith('employee.')) return true;
    if (f.startsWith('earnings.') || f.startsWith('arrears.')) return true;
    if (f.startsWith('attendance.') && !/deduction/i.test(f)) return true;

    if (
        norm === 'sno' ||
        norm.includes('employeenumber') ||
        norm.includes('employeecode') ||
        norm.includes('empno') ||
        norm === 'name' ||
        norm.includes('employeename') ||
        norm.includes('designation') ||
        norm.includes('department') ||
        norm.includes('division') ||
        norm === 'group' ||
        norm.includes('employeegroup') ||
        norm.includes('bank') ||
        norm.includes('ifsc') ||
        norm.includes('paymentmode') ||
        norm.includes('salarymode') ||
        norm.includes('dateofjoining') ||
        norm === 'doj'
    ) {
        return true;
    }

    if (h.includes('employee') && !/deduction|advance|loan/i.test(h)) return true;
    if (h.includes('bank ') || h.startsWith('bank ')) return true;

    if (fieldIsDeductionAmount(f)) return false;

    if (
        norm.includes('basicpay') ||
        norm.includes('grosssalary') ||
        norm.includes('netsalary') ||
        norm.includes('earned') ||
        norm.includes('allowance') ||
        norm.includes('incentive') ||
        norm.includes('otpay') ||
        norm === 'ot' ||
        norm.includes('arrears')
    ) {
        return true;
    }

    if (h.includes('earning') && !h.includes('deduction')) return true;
    if (h.includes('gross') && !h.includes('deduction')) return true;
    if (h.includes('basic') && !h.includes('deduction')) return true;
    if ((h.includes('net') && h.includes('salary')) || h === 'net pay') return true;

    return false;
}

function headerLooksLikeDeductionAmount(header: string): boolean {
    const h = header.toLowerCase().trim();
    const norm = normalizeHeaderKey(header);

    if (
        norm.includes('employeenumber') ||
        norm.includes('employeecode') ||
        norm.includes('empno') ||
        norm === 'name' ||
        norm.includes('employeename') ||
        norm.includes('designation') ||
        norm.includes('department') ||
        norm.includes('division') ||
        norm === 'group' ||
        norm.includes('employeegroup')
    ) {
        return false;
    }

    if (isCumulativeOrMetaColumn(header)) return false;
    if (isAttendanceDaysColumn(header)) return false;

    const deductionPatterns = [
        /^pf$/i,
        /^esi$/i,
        /^pt$/i,
        /professional\s*tax/i,
        /provident\s*fund/i,
        /employee\s*state\s*insurance/i,
        /\badvance\b/i,
        /salary\s*advance/i,
        /advance\s*deduction/i,
        /advance\s*recovery/i,
        /loan\s*emi/i,
        /loan\s*deduction/i,
        /loan\s*recovery/i,
        /\bemi\b/i,
        /attendance\s*deduction/i,
        /late\s*deduction/i,
        /early\s*deduction/i,
        /permission\s*deduction/i,
        /absent\s*deduction/i,
        /leave\s*deduction/i,
        /lop\s*deduction/i,
        /manual\s*deduction/i,
        /other\s*deduction/i,
        /statutory/i,
        /deduction/i,
        /punishment/i,
        /recovery/i,
    ];

    return deductionPatterns.some((p) => p.test(h));
}

function resolvePayslipSection(col: PayrollOutputColumn): 'none' | 'deductions' | 'earnings' | 'attendance' {
    const section = String(col.payslipSection || 'none').trim().toLowerCase();
    if (section === 'deductions' || section === 'earnings' || section === 'attendance') return section;
    return inferPayslipSectionFromField(col.field);
}

function findOutputColumnForHeader(header: string, outputColumns: PayrollOutputColumn[]): PayrollOutputColumn | undefined {
    const trimmed = header.trim();
    return outputColumns.find((c) => String(c.header || '').trim() === trimmed);
}

function identifyDeductionColumns(
    headers: string[],
    outputColumns?: PayrollOutputColumn[]
): DeductionColumn[] {
    const deductionColumns: DeductionColumn[] = [];
    const seen = new Set<string>();

    for (const header of headers) {
        if (header === 'S.No' || seen.has(header)) continue;

        const configured = outputColumns?.length ? findOutputColumnForHeader(header, outputColumns) : undefined;
        const field = configured?.field ?? '';

        if (isEmployeeOrEarningColumn(header, field)) continue;
        if (isCumulativeOrMetaColumn(header, field)) continue;
        if (isAttendanceDaysColumn(header)) continue;

        let include = false;

        if (configured) {
            const section = resolvePayslipSection(configured);
            if (section === 'deductions') {
                include = true;
            } else if (section === 'none' && fieldIsDeductionAmount(field)) {
                include = true;
            } else if (section === 'none' && configured.source === 'formula') {
                include = headerLooksLikeDeductionAmount(header);
            }
        } else if (fieldIsDeductionAmount(field)) {
            include = true;
        } else {
            include = headerLooksLikeDeductionAmount(header);
        }

        if (!include) continue;

        seen.add(header);
        deductionColumns.push({ header, field: header, isDeduction: true });
    }

    return deductionColumns;
}

function extractEmployeeDeductionData(
    row: Record<string, unknown>,
    deductionColumns: DeductionColumn[],
    headers: string[] = []
): EmployeeDeductionRow {
    const ecNo =
        pickEmpNoFromRow(row) ||
        pickFieldViaHeaders(row, headers, (n) =>
            ['employeenumber', 'empno', 'employeecode', 'eno', 'staffno', 'staffnumber'].includes(n)
        ) ||
        '-';

    const name =
        pickNameFromRow(row) ||
        pickFieldViaHeaders(row, headers, (n) => n === 'name' || n === 'employeename') ||
        '-';

    const designation =
        pickDesignationFromRow(row) ||
        pickFieldViaHeaders(row, headers, (n) => n.includes('designation')) ||
        '-';

    const division =
        pickOrgFieldFromRow(row, 'division') ||
        pickFieldViaHeaders(row, headers, (n) => n.includes('division')) ||
        '-';

    const department =
        pickOrgFieldFromRow(row, 'department') ||
        pickFieldViaHeaders(row, headers, (n) => n.includes('department')) ||
        '-';

    const group =
        pickGroupFromRow(row) ||
        pickFieldViaHeaders(row, headers, (n) =>
            n === 'group' || n === 'employeegroup' || n === 'empgroup'
        ) ||
        '-';

    const deductions: Record<string, number> = {};
    let total = 0;

    for (const col of deductionColumns) {
        const value = row[col.field];
        const numValue = typeof value === 'number' ? value : Number(value) || 0;
        deductions[col.header] = numValue;
        total += numValue;
    }

    return {
        ecNo,
        name,
        designation,
        division,
        department,
        group,
        deductions,
        total,
    };
}

function abbreviateDeductionHeader(header: string, maxLen = 14): string {
    const replacements: [RegExp, string][] = [
        [/professional\s*tax/i, 'Prof. Tax'],
        [/attendance\s*deduction/i, 'Attend. Ded.'],
        [/permission\s*deduction/i, 'Perm. Ded.'],
        [/advance\s*deduction/i, 'Advance'],
        [/salary\s*advance/i, 'Sal. Advance'],
        [/loan\s*recovery/i, 'Loan Rec.'],
        [/manual\s*deduction/i, 'Manual Ded.'],
    ];
    let label = header.trim();
    for (const [pattern, short] of replacements) {
        if (pattern.test(label)) {
            label = label.replace(pattern, short);
            break;
        }
    }
    return truncateText(label, maxLen);
}

function groupRowsByDivisionDepartment(rows: Record<string, unknown>[]): DivisionDepartmentGroup[] {
    const divMap = new Map<string, Map<string, Record<string, unknown>[]>>();

    for (const row of rows) {
        const div = pdfAscii(pickOrgFieldFromRow(row, 'division') || 'N/A');
        const dept = pdfAscii(pickOrgFieldFromRow(row, 'department') || 'N/A');
        if (!divMap.has(div)) divMap.set(div, new Map());
        const deptMap = divMap.get(div)!;
        if (!deptMap.has(dept)) deptMap.set(dept, []);
        deptMap.get(dept)!.push(row);
    }

    const divisions = [...divMap.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    return divisions.map((division) => {
        const deptMap = divMap.get(division)!;
        const departments = [...deptMap.keys()]
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .map((department) => ({
                department,
                rows: sortByEmpNo(deptMap.get(department) || [], pickEmpNoFromRow),
            }));
        return { division, departments };
    });
}

function buildTableHeaders(deductionColumns: DeductionColumn[]): string[] {
    return [
        'S.No',
        'EC No.',
        'Employee Name',
        'Designation',
        'Division',
        'Department',
        'Group',
        ...deductionColumns.map((col) => pdfAscii(abbreviateDeductionHeader(col.header))),
        'Total',
    ];
}

function buildTableBody(
    employeeData: EmployeeDeductionRow[],
    startSerial = 0
): string[][] {
    return employeeData.map((emp, index) => {
        const row: string[] = [
            String(startSerial + index + 1),
            pdfAscii(emp.ecNo),
            truncateText(emp.name, 26),
            truncateText(emp.designation, 16),
            truncateText(emp.division, 12),
            truncateText(emp.department, 14),
            truncateText(emp.group, 10),
        ];
        return row;
    });
}

function appendAmountColumns(
    body: string[][],
    employeeData: EmployeeDeductionRow[],
    deductionColumns: DeductionColumn[]
): string[][] {
    return body.map((row, i) => {
        const emp = employeeData[i];
        const amounts = deductionColumns.map((col) => formatInrPdf(emp.deductions[col.header] || 0));
        amounts.push(formatInrPdf(emp.total));
        return [...row, ...amounts];
    });
}

function buildGrandTotalRow(
    employeeData: EmployeeDeductionRow[],
    deductionColumns: DeductionColumn[],
    label = 'Grand Total'
): string[] {
    const totalsRow: string[] = ['', '', '', '', '', '', pdfAscii(label)];
    for (const col of deductionColumns) {
        const columnTotal = employeeData.reduce(
            (sum, emp) => sum + (emp.deductions[col.header] || 0),
            0
        );
        totalsRow.push(formatInrPdf(columnTotal));
    }
    const grandTotal = employeeData.reduce((sum, emp) => sum + emp.total, 0);
    totalsRow.push(formatInrPdf(grandTotal));
    return totalsRow;
}

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

function getColumnStyles(
    pageWidth: number,
    marginX: number,
    deductionColumns: DeductionColumn[]
): Record<number, object> {
    const fixedWidth = 7 + 13 + 30 + 18 + 14 + 18 + 12;
    const availableWidth = pageWidth - marginX * 2 - fixedWidth;
    const amountColCount = deductionColumns.length + 1;
    const amountColWidth = Math.max(16, Math.min(28, availableWidth / amountColCount));

    const columnStyles: Record<number, object> = {
        0: { halign: 'center', cellWidth: 7 },
        1: { halign: 'center', cellWidth: 13 },
        2: { halign: 'left', cellWidth: 30, overflow: 'linebreak' },
        3: { halign: 'left', cellWidth: 18, overflow: 'linebreak' },
        4: { halign: 'left', cellWidth: 14, overflow: 'linebreak' },
        5: { halign: 'left', cellWidth: 18, overflow: 'linebreak' },
        6: { halign: 'left', cellWidth: 12, overflow: 'linebreak' },
    };

    for (let i = 0; i < amountColCount; i++) {
        columnStyles[EMP_COL_COUNT + i] = {
            halign: 'right',
            cellWidth: amountColWidth,
            fontStyle: i === amountColCount - 1 ? 'bold' : 'normal',
        };
    }

    return columnStyles;
}

function drawPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
    const pageNum =
        typeof (doc as { getNumberOfPages?: () => number }).getNumberOfPages === 'function'
            ? (doc as { getNumberOfPages: () => number }).getNumberOfPages()
            : 1;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
        pdfAscii(`Page ${pageNum} | Generated ${formatGeneratedAt(new Date())}`),
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
    );
}

function renderEmployeeTable(
    doc: jsPDF,
    startY: number,
    tableHeaders: string[],
    tableBody: string[][],
    deductionColumns: DeductionColumn[],
    marginX: number,
    pageWidth: number,
    pageHeight: number,
    options?: { includeHead?: boolean }
): number {
    const includeHead = options?.includeHead !== false;
    const columnStyles = getColumnStyles(pageWidth, marginX, deductionColumns);

    autoTable(doc, {
        startY,
        head: includeHead ? [tableHeaders] : undefined,
        body: tableBody,
        showFoot: 'never',
        theme: 'grid',
        styles: {
            fontSize: 6.5,
            cellPadding: 1.4,
            lineColor: BORDER,
            lineWidth: 0.1,
            valign: 'middle',
            overflow: 'linebreak',
            font: 'helvetica',
        },
        headStyles: {
            fontStyle: 'bold',
            fontSize: 6.5,
            textColor: WHITE,
            fillColor: DED_HEADER,
            halign: 'center',
            valign: 'middle',
            cellPadding: 1.6,
            font: 'helvetica',
        },
        bodyStyles: {
            textColor: INK,
            fillColor: WHITE,
            font: 'helvetica',
        },
        alternateRowStyles: {
            fillColor: STRIPE,
        },
        columnStyles,
        margin: { left: marginX, right: marginX, top: 8, bottom: 14 },
        tableWidth: 'auto',
        didParseCell: (data) => {
            if (data.section === 'head') {
                if (data.column.index < EMP_COL_COUNT) {
                    data.cell.styles.fillColor = EMP_HEADER;
                }
                if (data.column.index >= EMP_COL_COUNT) {
                    data.cell.styles.halign = 'right';
                }
            }
        },
        didDrawPage: () => drawPageFooter(doc, pageWidth, pageHeight),
    });

    return (doc as AutoTableDoc).lastAutoTable?.finalY ?? startY;
}

function renderGrandTotalTable(
    doc: jsPDF,
    startY: number,
    totalsRow: string[],
    deductionColumns: DeductionColumn[],
    marginX: number,
    pageWidth: number,
    pageHeight: number
): number {
    const pageHeightInner = doc.internal.pageSize.getHeight();
    let y = startY;
    if (y > pageHeightInner - 20) {
        doc.addPage();
        y = 14;
    }

    const columnStyles = getColumnStyles(pageWidth, marginX, deductionColumns);

    autoTable(doc, {
        startY: y + 2,
        body: [totalsRow],
        theme: 'grid',
        styles: {
            fontSize: 7,
            cellPadding: 1.8,
            lineColor: BORDER,
            lineWidth: 0.1,
            font: 'helvetica',
            fontStyle: 'bold',
        },
        bodyStyles: {
            textColor: WHITE,
            fillColor: DED,
            halign: 'right',
            font: 'helvetica',
            fontStyle: 'bold',
        },
        columnStyles: {
            ...columnStyles,
            [EMP_COL_COUNT - 1]: {
                ...(columnStyles[EMP_COL_COUNT - 1] as object),
                halign: 'right',
                fontStyle: 'bold',
            },
        },
        margin: { left: marginX, right: marginX, top: 8, bottom: 14 },
        tableWidth: 'auto',
        didDrawPage: () => drawPageFooter(doc, pageWidth, pageHeight),
    });

    return (doc as AutoTableDoc).lastAutoTable?.finalY ?? y;
}

function drawSectionBanner(
    doc: jsPDF,
    y: number,
    text: string,
    marginX: number,
    pageWidth: number
): number {
    doc.setFillColor(BANNER_BG[0], BANNER_BG[1], BANNER_BG[2]);
    doc.rect(marginX, y - 3.5, pageWidth - marginX * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(EMP_HEADER[0], EMP_HEADER[1], EMP_HEADER[2]);
    doc.text(pdfAscii(text), marginX + 2, y + 1);
    return y + 9;
}

function startNewDepartmentPage(doc: jsPDF): number {
    doc.addPage();
    return 14;
}

export async function generateDeductionsReportPdf(
    rows: Record<string, unknown>[],
    headers: string[],
    params: DeductionsReportParams,
    profile: CompanyProfile,
    outputColumns?: PayrollOutputColumn[],
    fileName?: string
): Promise<void> {
    if (!rows.length) {
        throw new Error('No data available for deductions report');
    }

    const format = params.format ?? 'combined';
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 8;

    const deductionColumns = identifyDeductionColumns(headers, outputColumns);

    if (deductionColumns.length === 0) {
        throw new Error('No deduction columns found in paysheet data');
    }

    const allEmployeeData = rows.map((row) =>
        extractEmployeeDeductionData(row, deductionColumns, headers)
    );

    const periodLabel = `${params.month} ${params.year}`;
    const titleSuffix = params.salaryKindLabel ? ` (${params.salaryKindLabel})` : '';
    let y = await drawPayslipCompanyHeader(doc, profile, {
        periodLabel: pdfAscii(`Deductions Report - ${periodLabel}${titleSuffix}`),
        confidentialLabel: 'CONFIDENTIAL',
    });

    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
        pdfAscii(
            `${allEmployeeData.length} employee(s) | ${deductionColumns.length} deduction column(s) | Amounts in INR`
        ),
        marginX,
        y
    );
    y += 4;

    if (format === 'by_department') {
        doc.setFontSize(7.5);
        doc.text(pdfAscii('Layout: By division and department'), marginX, y);
        y += 5;
    }

    if (params.filters) {
        const filterLines: string[] = [];
        if (params.filters.division) filterLines.push(`Division: ${params.filters.division}`);
        if (params.filters.department) filterLines.push(`Department: ${params.filters.department}`);
        if (params.filters.designation) filterLines.push(`Designation: ${params.filters.designation}`);
        if (params.filters.group) filterLines.push(`Group: ${params.filters.group}`);
        if (params.filters.ecNo) filterLines.push(`EC No: ${params.filters.ecNo}`);

        if (filterLines.length > 0) {
            doc.setFontSize(7.5);
            doc.text(pdfAscii(`Filters: ${filterLines.join(' | ')}`), marginX, y);
            y += 5;
        }
    }

    const tableHeaders = buildTableHeaders(deductionColumns);

    if (format === 'combined') {
        const body = appendAmountColumns(
            buildTableBody(allEmployeeData),
            allEmployeeData,
            deductionColumns
        );
        y = renderEmployeeTable(doc, y, tableHeaders, body, deductionColumns, marginX, pageWidth, pageHeight);

        const totalsRow = buildGrandTotalRow(allEmployeeData, deductionColumns);
        renderGrandTotalTable(doc, y, totalsRow, deductionColumns, marginX, pageWidth, pageHeight);
    } else {
        const groups = groupRowsByDivisionDepartment(rows);
        let sectionIndex = 0;

        for (const { division, departments } of groups) {
            for (const { department, rows: deptRows } of departments) {
                if (sectionIndex > 0) {
                    y = startNewDepartmentPage(doc);
                }

                y = drawSectionBanner(doc, y, `DIVISION: ${division}`, marginX, pageWidth);
                y = drawSectionBanner(doc, y, `DEPARTMENT: ${department}`, marginX, pageWidth);

                const deptEmployeeData = deptRows.map((row) =>
                    extractEmployeeDeductionData(row, deductionColumns, headers)
                );
                const body = appendAmountColumns(
                    buildTableBody(deptEmployeeData),
                    deptEmployeeData,
                    deductionColumns
                );

                y = renderEmployeeTable(doc, y, tableHeaders, body, deductionColumns, marginX, pageWidth, pageHeight, {
                    includeHead: true,
                });

                const deptTotalsRow = buildGrandTotalRow(
                    deptEmployeeData,
                    deductionColumns,
                    'Department Total'
                );
                renderGrandTotalTable(doc, y, deptTotalsRow, deductionColumns, marginX, pageWidth, pageHeight);

                sectionIndex += 1;
            }
        }

        if (sectionIndex === 0) {
            throw new Error('No department sections found for deductions report');
        }
    }

    const kindSlug = params.salaryKindLabel
        ? params.salaryKindLabel.toLowerCase().replace(/\s+/g, '_')
        : 'regular';
    const formatSlug = format === 'by_department' ? '_by_dept' : '';
    const saveName =
        fileName ??
        pdfAscii(`Deductions_Report_${kindSlug}_${params.month}_${params.year}${formatSlug}_${Date.now()}.pdf`);
    doc.save(saveName);
}

async function loadOutputColumns(): Promise<PayrollOutputColumn[] | undefined> {
    try {
        const configRes = await api.getPayrollConfig();
        const config = (configRes as { data?: { outputColumns?: PayrollOutputColumn[] } })?.data;
        if (Array.isArray(config?.outputColumns)) {
            return config.outputColumns;
        }
    } catch {
        /* fallback */
    }
    return undefined;
}

export async function exportDeductionsReport(
    rows: Record<string, unknown>[],
    headers: string[],
    month: string,
    profile: CompanyProfile,
    options?: {
        department?: string;
        division?: string;
        designation?: string;
        group?: string;
        search?: string;
        format?: DeductionsExportFormat;
        salaryKind?: 'regular' | 'second_salary';
    }
): Promise<void> {
    const [year, monthNum] = month.split('-').map(Number);
    const monthName = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long' });
    const outputColumns = await loadOutputColumns();

    const salaryKindLabel =
        options?.salaryKind === 'second_salary' ? '2nd Salary' : 'Regular Salary';

    const params: DeductionsReportParams = {
        month: monthName,
        year,
        format: options?.format ?? 'combined',
        salaryKindLabel,
        filters: {
            department: options?.department,
            division: options?.division,
            designation: options?.designation,
            group: options?.group,
        },
    };

    await generateDeductionsReportPdf(rows, headers, params, profile, outputColumns);
}

/** Export regular deductions PDF; also 2nd salary PDF when enabled and data exists. */
export async function exportDeductionsReportBundle(
    month: string,
    profile: CompanyProfile,
    options: {
        format: DeductionsExportFormat;
        secondSalaryEnabled: boolean;
        fetchPaysheet: (secondSalary: boolean) => Promise<{ headers: string[]; rows: Record<string, unknown>[] }>;
        filters?: {
            department?: string;
            division?: string;
            designation?: string;
            group?: string;
        };
    }
): Promise<{ exported: string[] }> {
    const exported: string[] = [];
    const outputColumns = await loadOutputColumns();
    const [year, monthNum] = month.split('-').map(Number);
    const monthName = new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'long' });

    const exportOne = async (secondSalary: boolean) => {
        const { headers, rows } = await options.fetchPaysheet(secondSalary);
        if (!rows.length) return;

        const salaryKindLabel = secondSalary ? '2nd Salary' : 'Regular Salary';
        const params: DeductionsReportParams = {
            month: monthName,
            year,
            format: options.format,
            salaryKindLabel,
            filters: options.filters,
        };

        await generateDeductionsReportPdf(rows, headers, params, profile, outputColumns);
        exported.push(salaryKindLabel);
    };

    await exportOne(false);

    if (options.secondSalaryEnabled) {
        await exportOne(true);
    }

    return { exported };
}
