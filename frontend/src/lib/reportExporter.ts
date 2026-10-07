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

export interface AdditionalSheetOption<T = any> {
  sheetName: string;
  title?: string;
  subtitle?: string;
  data: T[];
  columns: ReportColumn<T>[];
  selectedKeys: string[];
}

export interface ExportReportOptions<T = any> {
  title: string;
  subtitle?: string;
  sheetName?: string;
  data: T[];
  columns: ReportColumn<T>[];
  selectedKeys: string[];
  format: 'excel' | 'pdf';
  fileName: string;
  additionalSheets?: AdditionalSheetOption[];
}

export function exportReportWithColumns<T = any>({
  title,
  subtitle,
  sheetName = 'Report',
  data,
  columns,
  selectedKeys,
  format,
  fileName,
  additionalSheets,
}: ExportReportOptions<T>) {
  const activeCols = columns.filter((col) => selectedKeys.includes(col.key));
  if (activeCols.length === 0 && (!additionalSheets || additionalSheets.every(s => s.columns.filter(c => s.selectedKeys.includes(c.key)).length === 0))) {
    throw new Error('Please select at least one column to export.');
  }

  if (format === 'excel' || (format as string) === 'xlsx') {
    const workbook = XLSX.utils.book_new();

    if (activeCols.length > 0) {
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
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Report');
    }

    if (additionalSheets && additionalSheets.length > 0) {
      additionalSheets.forEach((sheet) => {
        const sActiveCols = sheet.columns.filter((c) => sheet.selectedKeys.includes(c.key));
        if (sActiveCols.length > 0) {
          const sRows = sheet.data.length > 0 ? sheet.data.map((item, idx) => {
            const rowObj: Record<string, any> = {};
            sActiveCols.forEach((col) => {
              const val = col.getValue ? col.getValue(item, idx) : (item as any)[col.key];
              rowObj[col.label] = val != null ? val : '';
            });
            return rowObj;
          }) : [
            sActiveCols.reduce((acc, col) => {
              acc[col.label] = '';
              return acc;
            }, {} as Record<string, any>)
          ];
          const sWorksheet = XLSX.utils.json_to_sheet(sRows);
          XLSX.utils.book_append_sheet(workbook, sWorksheet, sheet.sheetName || 'Additional Sheet');
        }
      });
    }

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
    const doc = new jsPDF({
      orientation: activeCols.length > 6 ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    if (activeCols.length > 0) {
      const headers = [activeCols.map((c) => c.label)];
      const body = data.map((item, idx) =>
        activeCols.map((col) => {
          const val = col.getValue ? col.getValue(item, idx) : (item as any)[col.key];
          return val != null ? String(val) : '';
        })
      );

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
    }

    if (additionalSheets && additionalSheets.length > 0) {
      additionalSheets.forEach((sheet) => {
        const sActiveCols = sheet.columns.filter((c) => sheet.selectedKeys.includes(c.key));
        if (sActiveCols.length > 0) {
          if (activeCols.length > 0) {
            doc.addPage();
          }
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(sheet.title || sheet.sheetName, 14, 15);

          if (sheet.subtitle) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(sheet.subtitle, 14, 21);
          }

          const sHeaders = [sActiveCols.map((c) => c.label)];
          const sBody = sheet.data.map((item, idx) =>
            sActiveCols.map((col) => {
              const val = col.getValue ? col.getValue(item, idx) : (item as any)[col.key];
              return val != null ? String(val) : '';
            })
          );

          autoTable(doc, {
            head: sHeaders,
            body: sBody,
            startY: sheet.subtitle ? 25 : 20,
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
          });
        }
      });
    }

    const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    doc.save(finalFileName);
  }
}
