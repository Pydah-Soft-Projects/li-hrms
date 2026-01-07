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

    // Expected columns: Employee Number, In-Time, Out-Time (optional)
    const rawLogs = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        // Try different column name variations
        const empNo = row['Employee Number'] || row['EmployeeNumber'] || row['Emp No'] || row['EmpNo'] || row['emp_no'];
        const inTime = row['In-Time'] || row['InTime'] || row['In Time'] || row['in_time'] || row['Check In'];
        const outTime = row['Out-Time'] || row['OutTime'] || row['Out Time'] || row['out_time'] || row['Check Out'];

        if (!empNo || !inTime) {
          errors.push(`Row ${i + 2}: Missing required fields (Employee Number, In-Time)`);
          continue;
        }

        // Parse dates focusing on 24-hour format and Excel serials
        const inTimeDate = parseExcelDate(inTime);
        if (!inTimeDate || isNaN(inTimeDate.getTime())) {
          errors.push(`Row ${i + 2}: Invalid In-Time format. Use 24-hour format (e.g., 14:30) or standard Excel date/time.`);
          continue;
        }

        // Insert IN log
        const inLog = {
          employeeNumber: String(empNo).trim().toUpperCase(),
          timestamp: inTimeDate,
          type: 'IN',
          source: 'excel',
          date: formatDate(inTimeDate),
          rawData: row,
        };

        // Try to insert (will fail if duplicate)
        try {
          await AttendanceRawLog.create(inLog);
        } catch (error) {
          if (error.code !== 11000) {
            throw error;
          }
          // Duplicate - skip
        }

        rawLogs.push(inLog);

        // Insert OUT log if provided
        if (outTime) {
          // Use inTimeDate as fallback so OutTime on the same day works even if just time is provided
          const outTimeDate = parseExcelDate(outTime, inTimeDate);

          if (outTimeDate && !isNaN(outTimeDate.getTime())) {
            const outLog = {
              employeeNumber: String(empNo).trim().toUpperCase(),
              timestamp: outTimeDate,
              type: 'OUT',
              source: 'excel',
              date: formatDate(outTimeDate),
              rawData: row,
            };

            try {
              await AttendanceRawLog.create(outLog);
            } catch (error) {
              if (error.code !== 11000) {
                throw error;
              }
            }

            rawLogs.push(outLog);
          }
        }

      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    // Process and aggregate
    const stats = await processAndAggregateLogs(rawLogs, false);

    // IMPORTANT: After processing logs, detect extra hours for all affected records
    // This ensures extra hours are calculated for all attendance records from Excel upload
    try {
      console.log('[ExcelUpload] Detecting extra hours for all processed records...');

      // Get unique dates from the processed logs
      const processedDates = [...new Set(rawLogs.map(log => {
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
      message: `Successfully processed ${rawLogs.length} logs from Excel`,
      data: {
        totalRows: data.length,
        logsProcessed: rawLogs.length,
        rawLogsInserted: stats.rawLogsInserted,
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

