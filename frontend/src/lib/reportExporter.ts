import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportColumn<T = any> {
  key: string;
  label: string;
  getValue?: (row: T, index: number) => any;
  defaultChecked?: boolean;
  isNecessary?: boolean;
}

export interface ExportReportOptions<T = any> {
  title: string;
  subtitle?: string;
  data: T[];
  columns: ReportColumn<T>[];
  selectedKeys: string[];
  format: 'excel' | 'pdf';
  fileName: string;
}

export function exportReportWithColumns<T = any>({
  title,
  subtitle,
  data,
  columns,
  selectedKeys,
  format,
  fileName,
}: ExportReportOptions<T>) {
  const activeCols = columns.filter((col) => selectedKeys.includes(col.key));
  if (activeCols.length === 0) {
    throw new Error('Please select at least one column to export.');
  }

  if (format === 'excel' || (format as string) === 'xlsx') {
    const excelRows = data.length > 0 ? data.map((item, idx) => {
      const rowObj: Record<string, any> = {};
      activeCols.forEach((col) => {
        const val = col.getValue ? col.getValue(item, idx) : (item as any)[col.key];
        rowObj[col.label] = val != null ? val : '';
      });
      return rowObj;
    }) : [
      activeCols.reduce((acc, col) => {
        acc[col.label] = '';
        return acc;
      }, {} as Record<string, any>)
    ];

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    const finalFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;

    try {
      XLSX.writeFile(workbook, finalFileName);
    } catch (err) {
      console.warn('XLSX.writeFile fallback to Blob download:', err);
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  } else {
    // PDF Export
    const headers = [activeCols.map((c) => c.label)];
    const body = data.map((item, idx) =>
      activeCols.map((col) => {
        const val = col.getValue ? col.getValue(item, idx) : (item as any)[col.key];
        return val != null ? String(val) : '';
      })
    );

    const doc = new jsPDF({
      orientation: activeCols.length > 6 ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 15);

    if (subtitle) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(subtitle, 14, 21);
    }

    const startY = subtitle ? 25 : 20;

    autoTable(doc, {
      head: headers,
      body: body,
      startY,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    doc.save(finalFileName);
  }
}
