const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const dayjs = require('dayjs');
const {
  buildCertificationReport,
  rowsToExportObjects,
} = require('../services/certificationReportService');

function sendExportError(res, error) {
  console.error('[CertificationReport]', error);
  if (!res.headersSent) {
    res.status(500).json({ success: false, message: error.message || 'Export failed' });
  }
}

/**
 * @desc    Certification status report (preview)
 * @route   GET /api/employees/reports/certifications
 */
exports.getCertificationReport = async (req, res) => {
  try {
    const report = await buildCertificationReport(req.scopeFilter || {}, req.query);
    res.status(200).json({
      success: true,
      employees: report.employees,
      rows: report.employees,
      qualFieldLabels: report.qualFieldLabels,
      overallStatusOptions: report.overallStatusOptions,
      data: {
        employees: report.employees,
        rows: report.employees,
        qualFieldLabels: report.qualFieldLabels,
        overallStatusOptions: report.overallStatusOptions,
      },
      stats: report.stats,
      pagination: {
        total: report.total,
        page: report.page,
        limit: report.limit,
        totalPages: report.totalPages,
      },
    });
  } catch (error) {
    console.error('[CertificationReport] getCertificationReport:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Export certification report as XLSX
 * @route   GET /api/employees/reports/certifications/export
 */
exports.exportCertificationReport = async (req, res) => {
  try {
    const report = await buildCertificationReport(req.scopeFilter || {}, {
      ...req.query,
      page: 1,
      limit: 100000,
    });

    const exportRows = rowsToExportObjects(report.allRows, report.qualFieldLabels);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Certifications');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=certification_report_${dayjs().format('YYYYMMDD')}.xlsx`
    );
    res.status(200).send(buffer);
  } catch (error) {
    sendExportError(res, error);
  }
};

/**
 * @desc    Export certification report as PDF
 * @route   GET /api/employees/reports/certifications/export-pdf
 */
exports.exportCertificationReportPDF = async (req, res) => {
  try {
    const report = await buildCertificationReport(req.scopeFilter || {}, {
      ...req.query,
      page: 1,
      limit: 100000,
    });

    const doc = new PDFDocument({
      margin: { top: 30, bottom: 0, left: 30, right: 30 },
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=certification_report_${dayjs().format('YYYYMMDD')}.pdf`
    );
    doc.pipe(res);

    const MARGIN = 30;
    const innerW = doc.page.width - MARGIN * 2;
    const stats = report.stats || {};

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e1b4b').text('Employee Certification Report', MARGIN, MARGIN);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#64748b')
      .text(`Generated: ${dayjs().format('DD MMM YYYY, HH:mm')}`, MARGIN, MARGIN + 20);

    doc
      .fontSize(8)
      .text(
        `Employees: ${stats.totalEmployees || 0}  |  Qualification rows: ${stats.totalQualificationRows || 0}  |  With qualifications: ${stats.employeesWithQualifications || 0}  |  Without: ${stats.employeesWithoutQualifications || 0}`,
        MARGIN,
        MARGIN + 32
      );

    const baseCols = ['#', 'Emp Code', 'Employee', 'Division', 'Dept', 'Designation', 'Overall Status', 'Row'];
    const qualCols = report.qualFieldLabels || [];
    const tailCols = ['Row Status', 'Cert'];
    const columns = [...baseCols, ...qualCols, ...tailCols];

    const fixedWidths = [20, 42, 72, 52, 52, 52, 58, 18];
    const tailWidths = [48, 22];
    const usedFixed = fixedWidths.reduce((a, b) => a + b, 0) + tailWidths.reduce((a, b) => a + b, 0);
    const qualWidth = qualCols.length
      ? Math.max(36, Math.floor((innerW - usedFixed) / qualCols.length))
      : 0;
    const colWidths = [...fixedWidths, ...qualCols.map(() => qualWidth), ...tailWidths];
    const colAligns = columns.map((_, i) => (i === 0 || i >= columns.length - 2 ? 'center' : 'left'));

    let currentY = MARGIN + 52;

    const drawTable = (tableRows, startY) => {
      let y = startY;
      doc.save();
      doc.roundedRect(MARGIN, y, innerW, 16, 4).fill('#7c3aed');
      doc.fontSize(5).font('Helvetica-Bold').fillColor('#ffffff');
      let x = MARGIN + 3;
      columns.forEach((col, i) => {
        doc.text(col, x, y + 4, { width: colWidths[i] - 6, align: colAligns[i], lineBreak: false });
        x += colWidths[i];
      });
      doc.restore();
      y += 16;
      doc.font('Helvetica').fontSize(5).fillColor('#334155');

      tableRows.forEach((cells, index) => {
        if (y > 520) {
          doc.addPage({ layout: 'landscape', margin: { top: 30, bottom: 0, left: 30, right: 30 } });
          y = 40;
        }
        if (index % 2 === 1) {
          doc.save().fillColor('#f8fafc').rect(MARGIN, y, innerW, 14).fill().restore();
        }
        x = MARGIN + 3;
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? ''), x, y + 3, {
            width: colWidths[i] - 6,
            align: colAligns[i],
            ellipsis: true,
            lineBreak: false,
          });
          x += colWidths[i];
        });
        y += 14;
      });
      return y + 8;
    };

    const pdfRows = report.allRows.map((row) => {
      const cells = [
        row.sNo,
        row.emp_no,
        row.employee_name,
        row.division,
        row.department,
        row.designation,
        row.overallCertificationStatus,
        row.qualificationRow === '' ? '—' : row.qualificationRow,
      ];
      qualCols.forEach((label) => {
        cells.push(row.qualificationFields?.[label] ?? '');
      });
      cells.push(row.rowStatus || '—', row.hasCertificate);
      return cells;
    });

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e293b').text('Detailed Records', MARGIN, currentY);
    currentY += 12;
    drawTable(pdfRows, currentY);

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(7)
        .fillColor('#94a3b8')
        .text(`Page ${i + 1} of ${pages.count}  |  Generated by HRMS System`, MARGIN, doc.page.height - 20, {
          align: 'center',
          width: innerW,
        });
    }

    doc.end();
  } catch (error) {
    sendExportError(res, error);
  }
};
