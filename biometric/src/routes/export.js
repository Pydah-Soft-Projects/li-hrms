/**
 * HRMS filters (departments, divisions) and attendance export for dashboard download.
 * Connects to HRMS MongoDB for employee name, department, division.
 */

const express = require('express');
const router = express.Router();
const { getHRMSModels } = require('../config/hrmsConnection');
const AttendanceLog = require('../models/AttendanceLog');
const Device = require('../models/Device');
const DeviceUser = require('../models/DeviceUser');
const logger = require('../utils/logger');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;
const XLSX = require('xlsx');

// Date format DD-Mon-YY (e.g. 01-Dec-25)
function formatPDate(d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const mon = months[d.getMonth()];
    const yy = String(d.getFullYear()).slice(-2);
    return `${day}-${mon}-${yy}`;
}

// Time format HH.MM (e.g. 7.57, 20.00)
function formatTime(d) {
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h}.${String(m).padStart(2, '0')}`;
}

// Build daily pairs (IN, OUT) and TOT HRS
function buildDayRow(logs) {
    // Sort by timestamp just in case
    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const pairs = [];
    let currentIn = null;
    let totHrs = 0;

    for (const l of logs) {
        const time = new Date(l.timestamp);
        const type = l.logType;
        const isIn = ['CHECK-IN', 'BREAK-IN', 'OVERTIME-IN'].includes(type);
        const isOut = ['CHECK-OUT', 'BREAK-OUT', 'OVERTIME-OUT'].includes(type);

        if (isIn) {
            // if already have an IN without OUT, treat previous as orphan IN
            if (currentIn) {
                pairs.push({ in: currentIn, out: null });
            }
            currentIn = time;
        } else if (isOut) {
            if (currentIn) {
                // matched pair
                const hrs = (time - currentIn) / (1000 * 60 * 60);
                if (hrs > 0) totHrs += hrs;
                pairs.push({ in: currentIn, out: time });
                currentIn = null;
            } else {
                // orphan OUT
                pairs.push({ in: null, out: time });
            }
        }
    }

    // specific case: handle trailing IN (orphan)
    if (currentIn) {
        pairs.push({ in: currentIn, out: null });
    }

    return { pairs, totHrsStr: totHrs > 0 ? totHrs.toFixed(2) : '' };
}

/**
 * GET /api/hrms/filters
 * Returns distinct departments and divisions from HRMS for download dialog dropdowns.
 */
router.get('/hrms/filters', async (req, res) => {
    try {
        const models = getHRMSModels();
        if (!models) {
            // Return empty if not connected, allowing mocked filtering in frontend if needed
            // But usually this means no filters available.
            return res.json({
                success: true,
                data: { departments: [], divisions: [] },
                message: 'HRMS not connected'
            });
        }
        const [departments, divisions] = await Promise.all([
            models.Department.find({}).select('_id name code').sort({ name: 1 }).lean(),
            models.Division.find({}).select('_id name code').sort({ name: 1 }).lean()
        ]);
        res.json({
            success: true,
            data: {
                departments: departments.map(d => ({ _id: d._id.toString(), name: d.name || '', code: d.code || '' })),
                divisions: divisions.map(d => ({ _id: d._id.toString(), name: d.name || '', code: d.code || '' }))
            }
        });
    } catch (err) {
        logger.error('HRMS filters error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/export/attendance
 * Query: employeeId (optional), startDate, endDate, departmentId (optional), divisionId (optional)
 * Returns CSV with dynamic columns (IN 1, OUT 1, IN 2, OUT 2... IN N, OUT N)
 */
router.get('/export/attendance', async (req, res) => {
    try {
        const { employeeId, startDate, endDate, departmentId, divisionId } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid startDate or endDate' });
        }

        const models = getHRMSModels();
        // Warn but proceed if no models (allows export of device-only users/logs)

        // 1) Filter eligible employee IDs from HRMS (if filters applied)
        let allowedEmpNos = null;
        if ((departmentId || divisionId) && models) {
            const empFilter = { is_active: { $ne: false } };
            if (departmentId) empFilter.department_id = departmentId;
            if (divisionId) empFilter.division_id = divisionId;
            const employees = await models.Employee.find(empFilter).select('emp_no').lean();
            allowedEmpNos = new Set(employees.map(e => String(e.emp_no).toUpperCase()));

            if (allowedEmpNos.size === 0) {
                // Return empty CSV immediately
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
                return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,TOT HRS\n');
            }
        }

        // 2) Build logs query
        const logQuery = {
            timestamp: { $gte: start, $lte: end }
        };
        if (allowedEmpNos) {
            if (employeeId && employeeId.trim()) {
                const single = String(employeeId).toUpperCase().trim();
                // If filter active and requested ID not in filter -> empty
                if (!allowedEmpNos.has(single)) {
                    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
                    return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,TOT HRS\n');
                }
                logQuery.employeeId = single;
            } else {
                logQuery.employeeId = { $in: [...allowedEmpNos] };
            }
        } else if (employeeId && employeeId.trim()) {
            logQuery.employeeId = String(employeeId).toUpperCase().trim();
        }

        const logs = await AttendanceLog.find(logQuery).lean();
        // If no logs found
        if (logs.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
            return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,TOT HRS\n');
        }

        const empNos = [...new Set(logs.map(l => String(l.employeeId).toUpperCase()))];

        // 3) Fetch employee details (HRMS or Fallback)
        const empMap = {};

        // Try HRMS first
        if (models) {
            const employees = await models.Employee.find({
                emp_no: { $in: empNos },
                is_active: { $ne: false }
            })
                .populate('department_id', 'name code')
                .populate('division_id', 'name code')
                .lean();

            employees.forEach(e => {
                empMap[String(e.emp_no).toUpperCase()] = {
                    emp_no: e.emp_no,
                    employee_name: (e.employee_name || '').trim() || e.emp_no,
                    department: (e.department_id?.name || '').trim(),
                    division: (e.division_id?.name || '').trim()
                };
            });
        }

        // Check strict mode (only include HRMS employees)
        const isStrict = req.query.strict === 'true';

        if (!isStrict) {
            // Try DeviceUsers for missing names
            const missingEmpNos = empNos.filter(id => !empMap[id]);
            if (missingEmpNos.length > 0) {
                const deviceUsers = await DeviceUser.find({ userId: { $in: missingEmpNos } })
                    .select('userId name department division')
                    .lean(); // Fetch department/division from DeviceUser

                deviceUsers.forEach(u => {
                    const uid = String(u.userId).toUpperCase();
                    empMap[uid] = {
                        emp_no: u.userId,
                        employee_name: u.name || u.userId,
                        department: u.department || '', // Use stored department
                        division: u.division || ''     // Use stored division
                    };
                });
            }

            // Fill remaining gaps
            empNos.forEach(empNo => {
                if (!empMap[empNo]) {
                    empMap[empNo] = { emp_no: empNo, employee_name: empNo, department: '', division: '' };
                }
            });
        }

        // 2) Parse Logs & Group by Employee -> Date
        // We will do a robust "Strict Shift Pairing" here
        // Logic:
        // - Sort logs by time
        // - Filter out duplicates: Ignore log if same type and within 2 minutes of previous
        // - State Machine: Expect IN -> Expect OUT
        // - Max 3 pairs
        const byEmpDate = {}; // This will store { pairs: [], totHrs: number }

        // Helper to format Date key YYYY-MM-DD
        const getDateKey = (date) => {
            const d = new Date(date);
            return d.toISOString().slice(0, 10);
        };

        // Group raw logs first
        const rawLogsByEmpDate = {};

        logs.forEach(log => {
            const empId = String(log.employeeId).toUpperCase();
            const dateKey = getDateKey(log.timestamp);

            if (!rawLogsByEmpDate[empId]) rawLogsByEmpDate[empId] = {};
            if (!rawLogsByEmpDate[empId][dateKey]) rawLogsByEmpDate[empId][dateKey] = [];

            // Normalize type: 'CHECK-IN' -> 'IN', 'CHECK-OUT' -> 'OUT'
            // 'BREAK-OUT' -> 'OUT', 'BREAK-IN' -> 'IN'
            // 'OVERTIME-IN' -> 'IN', 'OVERTIME-OUT' -> 'OUT'
            // 0 -> IN, 1 -> OUT
            let type = 'IN';
            const lt = (log.logType || '').toUpperCase();
            const rt = Number(log.rawType);

            if (lt.includes('OUT') || rt === 1 || rt === 3 || rt === 5) type = 'OUT';
            else type = 'IN';

            rawLogsByEmpDate[empId][dateKey].push({
                time: new Date(log.timestamp),
                type: type
            });
        });

        // Now Process Each Employee/Date Group
        for (const empId in rawLogsByEmpDate) {
            // Check if strict mode is on and employee is not in map
            if (isStrict && !empMap[empId]) continue;

            if (!byEmpDate[empId]) byEmpDate[empId] = {};

            for (const dateKey in rawLogsByEmpDate[empId]) {
                let dayLogs = rawLogsByEmpDate[empId][dateKey];

                // 1. Sort by time
                dayLogs.sort((a, b) => a.time - b.time);

                // 2. Deduplicate (Threshold: 2 minutes = 120000 ms)
                const uniqueLogs = [];
                if (dayLogs.length > 0) {
                    uniqueLogs.push(dayLogs[0]);
                    for (let i = 1; i < dayLogs.length; i++) {
                        const prev = uniqueLogs[uniqueLogs.length - 1];
                        const curr = dayLogs[i];
                        const diff = curr.time - prev.time;

                        // If same type and close in time, skip (it's a bounce/duplicate)
                        if (curr.type === prev.type && diff < 120000) {
                            continue;
                        }
                        uniqueLogs.push(curr);
                    }
                }

                // 3. Hybrid Smart Pairing Logic (Approved Plan)
                // Logic:
                // - Support valid pairs (IN -> OUT)
                // - Support consecutive INs if gap > 1 hour (IN -> (gap) -> IN)
                // - Ignore consecutive INs if gap <= 1 hour (debounce)
                // - Ignore orphan OUTs

                const pairs = [];
                let pendingIn = null; // Timestamp of open session
                let totalHours = 0;

                uniqueLogs.forEach(log => {
                    const time = log.time; // Date object

                    if (log.type === 'IN') {
                        if (pendingIn) {
                            // Already have an open IN. Check gap.
                            const diff = time - pendingIn;
                            if (diff > 3600000) { // > 1 hour
                                // Treat previous IN as complete orphan
                                pairs.push({ in: pendingIn, out: null });
                                // Start new session with current IN
                                pendingIn = time;
                            } else {
                                // diff <= 1 hour: Ignore current IN (Debounce/Duplicate)
                                // Keep the *first* IN of the burst.
                            }
                        } else {
                            // No open session, start one
                            pendingIn = time;
                        }
                    } else {
                        // Type OUT
                        if (pendingIn) {
                            // Match found! Close the pair.
                            const hrs = (time - pendingIn) / (1000 * 60 * 60);
                            if (hrs > 0) totalHours += hrs;

                            pairs.push({ in: pendingIn, out: time });
                            pendingIn = null;
                        } else {
                            // Orphan OUT (no matching IN), ignore.
                        }
                    }
                });

                // Finalize: Check if day ended with an open IN
                if (pendingIn) {
                    pairs.push({ in: pendingIn, out: null });
                }

                byEmpDate[empId][dateKey] = {
                    pairs: pairs,
                    totHrsStr: totalHours > 0 ? totalHours.toFixed(2) : ''
                };
            }
        }

        // 4) Build groups (Division > Dept)
        const groupKey = (empNo) => {
            const info = empMap[empNo];
            return `${info.division}\t${info.department}`;
        };
        const groups = new Map();
        for (const empNo of Object.keys(byEmpDate)) { // Use the processed byEmpDate
            const key = groupKey(empNo);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(empNo);
        }

        // Sort groups
        const sortedGroupEntries = [...groups.entries()].sort((a, b) => {
            const [divA, deptA] = a[0].split('\t');
            const [divB, deptB] = b[0].split('\t');
            const c = (divA || '').localeCompare(divB || '');
            return c !== 0 ? c : (deptA || '').localeCompare(deptB || '');
        });

        const rows = [];
        let sno = 0;
        let maxPairs = 1; // At least 1 pair columns (IN 1 / OUT 1)

        const BLANK_ROWS_BETWEEN_GROUPS = 3;

        for (let g = 0; g < sortedGroupEntries.length; g++) {
            const [key, groupEmpNos] = sortedGroupEntries[g];
            const [divisionName, departmentName] = key.split('\t');
            // Sort employees by Name (or ID) within group
            groupEmpNos.sort((a, b) => (empMap[a]?.employee_name || a).localeCompare(empMap[b]?.employee_name || b));

            for (const empNo of groupEmpNos) {
                const info = empMap[empNo];
                const dates = Object.keys(byEmpDate[empNo]).sort();

                for (const dateKey of dates) {
                    const [y, m, day] = dateKey.split('-');
                    const pDate = formatPDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(day)));

                    // dayLogs is now { pairs, totHrsStr }
                    const { pairs, totHrsStr } = byEmpDate[empNo][dateKey];

                    if (pairs.length > maxPairs) maxPairs = pairs.length;

                    sno += 1;
                    rows.push({
                        sno,
                        eno: info.emp_no,
                        name: info.employee_name,
                        division: info.division,
                        department: info.department,
                        pdate: pDate,
                        pairs, // Array of {in, out}
                        totHrs: totHrsStr
                    });
                }
            }
            if (g < sortedGroupEntries.length - 1) {
                for (let i = 0; i < BLANK_ROWS_BETWEEN_GROUPS; i++) rows.push({ blank: true });
            }
        }

        // 6) Dynamic Header Construction
        const fixedHeaders = ['SNO', 'E.NO', 'EMPLOYEE NAME', 'DIVISION', 'DEPARTMENT', 'PDate'];
        const dynamicHeaders = [];
        for (let i = 1; i <= maxPairs; i++) {
            dynamicHeaders.push(`IN ${i}`, `OUT ${i}`);
        }
        const finalHeaders = [...fixedHeaders, ...dynamicHeaders, 'TOT HRS'];
        const headerRow = finalHeaders.join(',');

        const escapeCsv = (v) => {
            const s = String(v == null ? '' : v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };

        const lines = [headerRow, ...rows.map(r => {
            if (r.blank) return '';

            const baseData = [r.sno, r.eno, r.name, r.division, r.department, r.pdate];

            // Map pairs to columns
            const pairData = [];
            for (let i = 0; i < maxPairs; i++) {
                const p = r.pairs && r.pairs[i];
                pairData.push(p?.in ? formatTime(p.in) : '', p?.out ? formatTime(p.out) : '');
            }

            return [...baseData, ...pairData, r.totHrs].map(escapeCsv).join(',');
        })];

        const csv = lines.join('\n');

        const filename = `attendance_report_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);

    } catch (err) {
        logger.error('Export attendance error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/export/summary/pdf
 * Generates a PDF summary of all devices and user counts
 */
router.get('/export/summary/pdf', async (req, res) => {
    try {
        const devices = await Device.find({}).lean();
        const totalUniqueUsers = await DeviceUser.countDocuments();

        const doc = new jsPDF();

        // Title
        doc.setFontSize(20);
        doc.text('Biometric Device Summary Report', 14, 22);
        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

        // Device details table
        const tableData = devices.map(dev => {
            const health = dev.status || {};
            return [
                dev.name,
                dev.deviceId,
                dev.ip,
                health.userCount || 0,
                health.fingerCount || 0,
                health.attCount || 0,
                dev.enabled ? 'Active' : 'Offline'
            ];
        });

        autoTable(doc, {
            startY: 40,
            head: [['Device Name', 'Serial Number', 'IP Address', 'Users', 'Fingers', 'Logs', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [99, 102, 241] }
        });

        const finalY = doc.lastAutoTable.finalY + 15;

        // Summary text
        const totalUsersAcrossDevices = devices.reduce((sum, dev) => sum + (dev.status?.userCount || 0), 0);

        doc.setFontSize(14);
        doc.text('Global Statistics:', 14, finalY);
        doc.setFontSize(11);
        doc.text(`Total User Records (all devices): ${totalUsersAcrossDevices}`, 14, finalY + 8);
        doc.text(`Total Unique User IDs (system-wide): ${totalUniqueUsers}`, 14, finalY + 16);
        doc.text(`Total Devices Monitored: ${devices.length}`, 14, finalY + 24);

        const pdfBuffer = doc.output('arraybuffer');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="biometric_summary_${new Date().toISOString().slice(0, 10)}.pdf"`);
        res.send(Buffer.from(pdfBuffer));

    } catch (err) {
        logger.error('Export PDF summary error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/export/unique-users/excel
 * Generates an Excel file with all unique users
 */
router.get('/export/unique-users/excel', async (req, res) => {
    try {
        const usersData = await DeviceUser.find({}).lean();

        const users = usersData.map(u => ({
            'User ID': u.userId,
            'Name': u.name || 'N/A',
            'Card Number': u.card || 'None',
            'Fingers': u.fingerprints?.length || 0,
            'Face Support': u.face?.templateData ? 'Yes' : 'No',
            'Last Device': u.lastDeviceId || 'Unknown',
            'Last Synced': new Date(u.lastSyncedAt).toLocaleString()
        }));

        const worksheet = XLSX.utils.json_to_sheet(users);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Unique Users");

        // Auto-adjust column widths
        const wscols = Object.keys(users[0] || {}).map(k => ({ wch: Math.max(k.length, 15) }));
        worksheet['!cols'] = wscols;

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="unique_users_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);

    } catch (err) {
        logger.error('Export Excel unique users error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
