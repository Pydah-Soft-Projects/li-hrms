/**
 * Attendance Upload Controller
 * Handles Excel file uploads for attendance logs
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const AttendanceDaily = require('../model/AttendanceDaily');
const { processAndAggregateLogs } = require('../services/attendanceSyncService');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const { detectExtraHoursForEmployeeDates } = require('../services/extraHoursService');
const XLSX = require('xlsx');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * @desc    Upload attendance from Excel
 * @route   POST /api/attendance/upload
 * @access  Private (Super Admin, Sub Admin, HR)
 */
const { attendanceUploadQueue } = require('../../shared/jobs/queueManager');
const { parseLegacyRows, parseSimpleRows } = require('../services/attendanceUploadService');

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

    // Estimate processing time (simple heuristic: 500 records per minute, min 1 min)
    const estimatedMinutes = Math.max(1, Math.ceil(data.length / 500));

    // threshold for background processing
    const ASYNC_THRESHOLD = 100;

    if (data.length > ASYNC_THRESHOLD) {
      // Offload to background worker
      const jobId = `upload_${Date.now()}_${req.user.id}`;

      // We pass the buffer and user info to the worker
      // Note: BullMQ connection must be established
      await attendanceUploadQueue.add('processAttendanceUpload', {
        fileBuffer: req.file.buffer.toString('base64'), // Convert to base64 for job data
        userId: req.user.id,
        userName: req.user.name,
        originalName: req.file.originalname,
        rowCount: data.length
      }, { jobId });

      return res.status(202).json({
        success: true,
        isAsync: true,
        message: `Large file detected (${data.length} rows). Processing started in background.`,
        data: {
          estimatedMinutes,
          message: `This operation may take approximately ${estimatedMinutes} minutes. You are free to do other operations. You will receive a notification once completed.`
        }
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

    // OPTIMIZATION: Use Bulk Write instead of individual creates
    if (uniqueLogs.length > 0) {
      const bulkOps = uniqueLogs.map(log => ({
        updateOne: {
          filter: {
            employeeNumber: log.employeeNumber,
            timestamp: log.timestamp,
            type: log.type
          },
          update: { $setOnInsert: log },
          upsert: true
        }
      }));

      const result = await AttendanceRawLog.bulkWrite(bulkOps, { ordered: false });
      duplicateCount = uniqueLogs.length - result.upsertedCount;
      // All unique logs are "processed" even if they already existed in DB
      finalProcessedLogs.push(...uniqueLogs);
    }

    console.log(`[AttendanceUpload] Unique logs found: ${uniqueLogs.length}, New: ${uniqueLogs.length - duplicateCount}, Duplicates: ${duplicateCount}`);

    // 4. Process and aggregate
    const stats = await processAndAggregateLogs(finalProcessedLogs, false);

    // IMPORTANT: After processing logs, detect extra hours only for (employee, date) we processed (+ adjacent days for overnight)
    try {
      console.log('[ExcelUpload] Detecting extra hours for processed employee/dates...');

      const entries = finalProcessedLogs.map(log => {
        const d = new Date(log.timestamp);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { employeeNumber: log.employeeNumber, date };
      }).filter(e => e.date);

      if (entries.length > 0) {
        const extraHoursStats = await detectExtraHoursForEmployeeDates(entries, { includeAdjacentDays: true });
        stats.extraHoursDetected = extraHoursStats.updated;
        stats.extraHoursProcessed = extraHoursStats.processed;
      }
    } catch (extraHoursError) {
      console.error('[ExcelUpload] Error detecting extra hours:', extraHoursError);
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
