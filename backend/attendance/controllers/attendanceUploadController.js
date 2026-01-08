/**
 * Attendance Upload Controller
 * Handles Excel file uploads for attendance logs
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const AttendanceDaily = require('../model/AttendanceDaily');
const { processAndAggregateLogs } = require('../services/attendanceSyncService');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const { batchDetectExtraHours } = require('../services/extraHoursService');
const XLSX = require('xlsx');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

/**
 * @desc    Upload attendance from Excel
 * @route   POST /api/attendance/upload
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Excel file is required',
      });
    }

    // Parse Excel file with date/serial awareness
    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: true,
      cellText: false
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Excel file is empty',
      });
    }

    // 1. Template Detection (Legacy Report vs Simple List)
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    let isLegacy = false;
    let headerIdx = -1;

    // Check first 10 rows for signature
    for (let i = 0; i < 10; i++) {
      if (rows[i] && rows[i].includes('SNO') && rows[i].includes('E .NO') && rows[i].includes('PDate')) {
        isLegacy = true;
        headerIdx = i;
        break;
      }
    }

    const rawLogs = [];
    const errors = [];

    if (isLegacy) {
      console.log('[AttendanceUpload] Legacy Report detected at row', headerIdx + 1);
      const legacyResult = parseLegacyRows(rows, headerIdx);
      rawLogs.push(...legacyResult.rawLogs);
      errors.push(...legacyResult.errors);
    } else {
      // 2. Original Simple List Logic
      console.log('[AttendanceUpload] Simple List format detected');
      const simpleResult = await parseSimpleRows(data);
      rawLogs.push(...simpleResult.rawLogs);
      errors.push(...simpleResult.errors);
    }

    if (rawLogs.length === 0 && errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Failed to parse any valid logs',
        errors
      });
    }

    // 3. Save Raw Logs and Process (Bulk Insertion optimization)
    // Group by unique identity to avoid database-level collision spam
    const uniqueLogs = [];
    const logKeys = new Set();

    for (const log of rawLogs) {
      const key = `${log.employeeNumber}_${log.timestamp.getTime()}_${log.type}`;
      if (!logKeys.has(key)) {
        logKeys.add(key);
        uniqueLogs.push(log);
      }
    }

    const finalProcessedLogs = [];
    let duplicateCount = 0;

    for (const logData of uniqueLogs) {
      try {
        await AttendanceRawLog.create(logData);
        finalProcessedLogs.push(logData);
      } catch (err) {
        if (err.code === 11000) {
          duplicateCount++;
          // Still add to finalProcessedLogs so processAndAggregateLogs knows which employees/dates to refresh
          finalProcessedLogs.push(logData);
        } else {
          console.error(`[AttendanceUpload] DB Error for ${logData.employeeNumber}: ${err.message}`);
          errors.push(`DB Error for ${logData.employeeNumber}: ${err.message}`);
        }
      }
    }

    console.log(`[AttendanceUpload] Unique logs found: ${uniqueLogs.length}, New: ${finalProcessedLogs.length - duplicateCount}, Duplicates: ${duplicateCount}`);

    // 4. Process and aggregate
    const stats = await processAndAggregateLogs(finalProcessedLogs, false);

    // IMPORTANT: After processing logs, detect extra hours for all affected records
    // This ensures extra hours are calculated for all attendance records from Excel upload
    try {
      console.log('[ExcelUpload] Detecting extra hours for all processed records...');

      // Get unique dates from the processed logs
      const processedDates = [...new Set(finalProcessedLogs.map(log => {
        const d = new Date(log.timestamp);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }))];

      if (processedDates.length > 0) {
        const minDate = processedDates.sort()[0];
        const maxDate = processedDates.sort()[processedDates.length - 1];

        // Batch detect extra hours for all records in the date range
        const extraHoursStats = await batchDetectExtraHours(minDate, maxDate);
        console.log(`[ExcelUpload] Extra hours detection: ${extraHoursStats.message}`);

        // Add extra hours stats to response
        stats.extraHoursDetected = extraHoursStats.updated;
        stats.extraHoursProcessed = extraHoursStats.processed;
      }
    } catch (extraHoursError) {
      console.error('[ExcelUpload] Error detecting extra hours:', extraHoursError);
      // Don't fail the upload if extra hours detection fails
      stats.extraHoursError = extraHoursError.message;
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${finalProcessedLogs.length} logs from Excel`,
      data: {
        totalRows: isLegacy ? (rows.length - headerIdx - 1) : data.length,
        logsProcessed: finalProcessedLogs.length,
        duplicatesSkipped: duplicateCount,
        rawLogsInserted: finalProcessedLogs.length - duplicateCount,
        dailyRecordsCreated: stats.dailyRecordsCreated,
        dailyRecordsUpdated: stats.dailyRecordsUpdated,
        extraHoursDetected: stats.extraHoursDetected || 0,
        extraHoursProcessed: stats.extraHoursProcessed || 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

  } catch (error) {
    console.error('Error uploading Excel:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload Excel file',
    });
  }
};

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD');
};

/**
 * Robust date/time parser for Excel inputs
 * Extracts components and rebases "Time Only" values to current/target date
 */
const parseExcelDate = (val, fallbackDate = null) => {
  if (!val) return null;

  let y, m, d, H, M, S;

  if (typeof val === 'number') {
    // 1. Handle Excel Serial Number
    const dateObj = XLSX.SSF.parse_date_code(val);
    y = dateObj.y;
    m = dateObj.m;
    d = dateObj.d;
    H = dateObj.H;
    M = dateObj.M;
    S = dateObj.S;
  } else if (val instanceof Date) {
    // 2. Handle JS Date object (parsed by XLSX with cellDates: true)
    y = val.getFullYear();
    m = val.getMonth() + 1;
    d = val.getDate();
    H = val.getHours();
    M = val.getMinutes();
    S = val.getSeconds();
  } else {
    // 3. Handle String
    const str = String(val).trim();

    // Detect if this is a time-only string (HH:mm or HH:mm:ss)
    const isTimeOnly = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(str);

    const formats = [
      'YYYY-MM-DD HH:mm:ss',
      'YYYY-MM-DD HH:mm',
      'DD-MM-YYYY HH:mm:ss',
      'DD-MM-YYYY HH:mm',
      'YYYY/MM/DD HH:mm:ss',
      'DD/MM/YYYY HH:mm',
      'HH:mm:ss',
      'HH:mm'
    ];

    const parsed = dayjs(str, formats, true);
    if (parsed.isValid()) {
      y = isTimeOnly ? 1900 : parsed.year(); // Force rebase for time-only
      m = parsed.month() + 1;
      d = parsed.date();
      H = parsed.hour();
      M = parsed.minute();
      S = parsed.second();
    } else {
      const native = new Date(str.replace(/Z|[+-]\d{2}(:?\d{2})?$/g, '')); // Strip timezone/UTC indicator for strict local construction
      if (isNaN(native.getTime())) return null;
      y = native.getFullYear();
      m = native.getMonth() + 1;
      d = native.getDate();
      H = native.getHours();
      M = native.getMinutes();
      S = native.getSeconds();
    }
  }

  // REBASE Logic: Excel defaults "Time Only" cells to 1899-12-30 or 1900-01-01
  // Or dayjs defaults to current date for time-only strings
  if (y < 1920) {
    const base = fallbackDate || new Date();
    y = base.getFullYear();
    m = base.getMonth() + 1;
    d = base.getDate();
  }

  // Return local Date object
  return new Date(y, m - 1, d, H, M, S);
};

/**
 * @desc    Download Excel template
 * @route   GET /api/attendance/upload/template
 * @access  Private
 */
exports.downloadTemplate = async (req, res) => {
  try {
    // Create sample data with strict 24-hour format
    const sampleData = [
      {
        'Employee Number': 'EMP001',
        'In-Time': dayjs().format('YYYY-MM-DD 09:00:00'),
        'Out-Time': dayjs().format('YYYY-MM-DD 18:00:00'),
      },
      {
        'Employee Number': 'EMP002',
        'In-Time': dayjs().format('YYYY-MM-DD 14:30:00'),
        'Out-Time': dayjs().format('YYYY-MM-DD 23:15:00'),
      },
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_template.xlsx');
    res.send(buffer);

  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate template',
    });
  }
};

/**
 * Specialized parser for "Legacy Report" (SNO, E.NO... format)
 */
const parseLegacyRows = (rows, headerIdx) => {
  const rawLogs = [];
  const errors = [];
  console.log(`[AttendanceUpload] Beginning legacy parse of ${rows.length - headerIdx - 1} rows`);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    // Row usually starts with a SNO (number)
    const snoRaw = row[0];
    const sno = Number(snoRaw);

    // Check if this is a valid data row (must have a number at col 0)
    if (isNaN(sno) || sno === 0) {
      // Log skip for unexpected content if it looks like it should have been data
      if (snoRaw && String(snoRaw).trim() !== '') {
        console.log(`[AttendanceUpload] Skipping Row ${i + 1}: Invalid SNO "${snoRaw}"`);
      }
      continue;
    }

    const empNo = String(row[1]).trim().toUpperCase();
    const pDateRaw = row[5];

    if (!empNo || !pDateRaw) {
      console.log(`[AttendanceUpload] Skipping Row ${i + 1}: Missing EmpNo or Date`);
      continue;
    }

    let baseDate;
    if (typeof pDateRaw === 'number') {
      const dObj = XLSX.SSF.parse_date_code(pDateRaw);
      baseDate = new Date(dObj.y, dObj.m - 1, dObj.d);
    } else if (pDateRaw instanceof Date) {
      baseDate = new Date(pDateRaw.getFullYear(), pDateRaw.getMonth(), pDateRaw.getDate());
    } else {
      const d = dayjs(String(pDateRaw).trim(), ['DD-MMM-YY', 'DD-MMM-YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY']);
      if (!d.isValid()) continue;
      baseDate = d.toDate();
    }

    // Helper to extract punches
    const in1 = row[6], out1 = row[7], in2 = row[8], out2 = row[9];

    let tIn1 = null, tOut1 = null;
    if (isValidLegacyTime(in1)) {
      tIn1 = legacyTimeToDate(baseDate, in1);
      rawLogs.push({ employeeNumber: empNo, timestamp: tIn1, type: 'IN', source: 'excel', date: dayjs(tIn1).format('YYYY-MM-DD'), rawData: row });

      if (isValidLegacyTime(out1)) {
        tOut1 = legacyTimeToDate(baseDate, out1);
        if (tOut1 < tIn1) tOut1 = new Date(tOut1.getTime() + 86400000);
        rawLogs.push({ employeeNumber: empNo, timestamp: tOut1, type: 'OUT', source: 'excel', date: dayjs(tOut1).format('YYYY-MM-DD'), rawData: row });
      }
    }

    if (isValidLegacyTime(in2)) {
      // Check if in2 is actually TOT HRS (Duration) misaligned
      let isDuration = false;
      if (tIn1 && tOut1) {
        const diffMin = (tOut1 - tIn1) / 60000;
        const durVal = Math.floor(diffMin / 60) + (Math.round(diffMin % 60) / 100);
        if (Math.abs(durVal - Number(in2)) < 0.01) isDuration = true;
      }

      if (!isDuration) {
        const tIn2 = legacyTimeToDate(baseDate, in2);
        rawLogs.push({ employeeNumber: empNo, timestamp: tIn2, type: 'IN', source: 'excel', date: dayjs(tIn2).format('YYYY-MM-DD'), rawData: row });

        if (isValidLegacyTime(out2)) {
          let tOut2 = legacyTimeToDate(baseDate, out2);
          if (tOut2 < tIn2) tOut2 = new Date(tOut2.getTime() + 86400000);
          rawLogs.push({ employeeNumber: empNo, timestamp: tOut2, type: 'OUT', source: 'excel', date: dayjs(tOut2).format('YYYY-MM-DD'), rawData: row });
        }
      }
    }
  }
  return { rawLogs, errors };
};

/**
 * Fallback parser for Simple List format
 */
const parseSimpleRows = async (data) => {
  const rawLogs = [];
  const errors = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const empNo = row['Employee Number'] || row['EmployeeNumber'] || row['Emp No'] || row['EmpNo'] || row['emp_no'];
    const inTime = row['In-Time'] || row['InTime'] || row['In Time'] || row['in_time'] || row['Check In'];
    const outTime = row['Out-Time'] || row['OutTime'] || row['Out Time'] || row['out_time'] || row['Check Out'];

    if (!empNo || !inTime) continue;

    const inTimeDate = parseExcelDate(inTime);
    if (!inTimeDate || isNaN(inTimeDate.getTime())) continue;

    rawLogs.push({
      employeeNumber: String(empNo).trim().toUpperCase(),
      timestamp: inTimeDate,
      type: 'IN',
      source: 'excel',
      date: dayjs(inTimeDate).format('YYYY-MM-DD'),
      rawData: row,
    });

    if (outTime) {
      const outTimeDate = parseExcelDate(outTime, inTimeDate);
      if (outTimeDate && !isNaN(outTimeDate.getTime())) {
        rawLogs.push({
          employeeNumber: String(empNo).trim().toUpperCase(),
          timestamp: outTimeDate,
          type: 'OUT',
          source: 'excel',
          date: dayjs(outTimeDate).format('YYYY-MM-DD'),
          rawData: row,
        });
      }
    }
  }
  return { rawLogs, errors };
};

const isValidLegacyTime = (val) => {
  if (val === undefined || val === null || val === '') return false;
  const n = Number(val);
  return !isNaN(n) && n !== 0;
};

const legacyTimeToDate = (baseDate, val) => {
  let hh, mm;
  if (typeof val === 'number') {
    hh = Math.floor(val);
    mm = Math.round((val - hh) * 100);
  } else {
    const s = String(val).replace(':', '.');
    const p = s.split('.');
    hh = parseInt(p[0]);
    mm = parseInt(p[1] || '0');
  }
  if (isNaN(hh) || isNaN(mm)) return null;
  const d = new Date(baseDate);
  d.setHours(hh, mm, 0, 0);
  return d;
};
