/**
 * HRMS filters (departments, divisions) and attendance export for dashboard download.
 * Connects to HRMS MongoDB for employee name, department, division.
 */

const express = require('express');
const router = express.Router();
const { getHRMSModels } = require('../config/hrmsConnection');
const AttendanceLog = require('../models/AttendanceLog');
const logger = require('../utils/logger');

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

// Build daily IN1, OUT1, IN2, OUT2, No. of INs, No. of OUTs, TOT HRS (cumulative of all IN–OUT pairs)
function buildDayRow(logs) {
    const inOut = [];
    for (const l of logs) {
        if (l.logType === 'CHECK-IN' || l.logType === 'OVERTIME-IN' || l.logType === 'BREAK-IN') {
            inOut.push({ type: 'in', time: new Date(l.timestamp) });
        } else if (l.logType === 'CHECK-OUT' || l.logType === 'OVERTIME-OUT' || l.logType === 'BREAK-OUT') {
            inOut.push({ type: 'out', time: new Date(l.timestamp) });
        }
    }
    const numIns = inOut.filter(x => x.type === 'in').length;
    const numOuts = inOut.filter(x => x.type === 'out').length;

    let in1 = '', out1 = '', in2 = '', out2 = '';
    let totHrs = 0;
    let idx = 0;
    while (idx < inOut.length) {
        const pairIn = inOut[idx];
        const pairOut = inOut[idx + 1];
        if (pairIn?.type === 'in' && pairOut?.type === 'out') {
            const hrs = (pairOut.time - pairIn.time) / (1000 * 60 * 60);
            totHrs += hrs;
            if (!in1) {
                in1 = formatTime(pairIn.time);
                out1 = formatTime(pairOut.time);
            } else if (!in2) {
                in2 = formatTime(pairIn.time);
                out2 = formatTime(pairOut.time);
            }
            idx += 2;
        } else {
            idx += 1;
        }
    }
    const totHrsStr = totHrs > 0 ? totHrs.toFixed(2) : '';
    return { in1, out1, in2, out2, numIns, numOuts, totHrsStr };
}

/**
 * GET /api/hrms/filters
 * Returns distinct departments and divisions from HRMS for download dialog dropdowns.
 */
router.get('/hrms/filters', async (req, res) => {
    try {
        const models = getHRMSModels();
        if (!models) {
            return res.status(503).json({
                success: false,
                error: 'HRMS database not connected. Set HRMS_MONGODB_URI.'
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
 * When department/division are selected, only employees in HRMS matching those are included.
 * Returns CSV grouped by Division then Department (2–3 blank rows between groups):
 * SNO, E.NO, EMPLOYEE NAME, DIVISION, DEPARTMENT, PDate, IN 1, OUT 1, IN 2, OUT 2, No. of INs, No. of OUTs, TOT HRS
 * TOT HRS = cumulative of all IN–OUT pairs for that day.
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
        if (!models) {
            return res.status(503).json({
                success: false,
                error: 'HRMS database not connected. Set HRMS_MONGODB_URI.'
            });
        }

        // 1) Optionally limit to employees matching department/division
        let allowedEmpNos = null;
        if (departmentId || divisionId) {
            const empFilter = { is_active: { $ne: false } };
            if (departmentId) empFilter.department_id = departmentId;
            if (divisionId) empFilter.division_id = divisionId;
            const employees = await models.Employee.find(empFilter).select('emp_no').lean();
            allowedEmpNos = new Set(employees.map(e => String(e.emp_no).toUpperCase()));
            if (allowedEmpNos.size === 0) {
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
                return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,IN 2,OUT 2,No. of INs,No. of OUTs,TOT HRS\n');
            }
        }

        // 2) Build attendance query
        const logQuery = {
            timestamp: { $gte: start, $lte: end }
        };
        if (allowedEmpNos) {
            if (employeeId && employeeId.trim()) {
                const single = String(employeeId).toUpperCase().trim();
                if (!allowedEmpNos.has(single)) {
                    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
                    return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,IN 2,OUT 2,No. of INs,No. of OUTs,TOT HRS\n');
                }
                logQuery.employeeId = single;
            } else {
                logQuery.employeeId = { $in: [...allowedEmpNos] };
            }
        } else if (employeeId && employeeId.trim()) {
            logQuery.employeeId = String(employeeId).toUpperCase().trim();
        }

        const logs = await AttendanceLog.find(logQuery).sort({ timestamp: 1 }).lean();
        const empNos = [...new Set(logs.map(l => String(l.employeeId).toUpperCase()))];
        if (empNos.length === 0) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
            return res.send('\uFEFFSNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,IN 2,OUT 2,No. of INs,No. of OUTs,TOT HRS\n');
        }

        // 3) Fetch employees from HRMS (name, department, division)
        const employees = await models.Employee.find({
            emp_no: { $in: empNos },
            is_active: { $ne: false }
        })
            .populate('department_id', 'name code')
            .populate('division_id', 'name code')
            .lean();

        const empMap = {};
        employees.forEach(e => {
            empMap[String(e.emp_no).toUpperCase()] = {
                emp_no: e.emp_no,
                employee_name: (e.employee_name || '').trim() || e.emp_no,
                department: (e.department_id?.name || '').trim(),
                division: (e.division_id?.name || '').trim()
            };
        });
        // Ensure every emp_no from logs has an entry (e.g. not in HRMS)
        empNos.forEach(empNo => {
            if (!empMap[empNo]) {
                empMap[empNo] = { emp_no: empNo, employee_name: empNo, department: '', division: '' };
            }
        });

        // 4) Group logs by (employeeId, date)
        const byEmpDate = {};
        for (const log of logs) {
            const empNo = String(log.employeeId).toUpperCase();
            const d = new Date(log.timestamp);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!byEmpDate[empNo]) byEmpDate[empNo] = {};
            if (!byEmpDate[empNo][dateKey]) byEmpDate[empNo][dateKey] = [];
            byEmpDate[empNo][dateKey].push(log);
        }

        // 5) Group employees by Division then Department; output rows with 2–3 blank rows between each group
        const groupKey = (empNo) => {
            const info = empMap[empNo] || { division: '', department: '' };
            return `${info.division}\t${info.department}`;
        };
        const groups = new Map(); // key = "Division\tDepartment", value = [emp_nos]
        for (const empNo of Object.keys(byEmpDate)) {
            const key = groupKey(empNo);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(empNo);
        }
        // Sort groups by division name then department name
        const sortedGroupEntries = [...groups.entries()].sort((a, b) => {
            const [divA, deptA] = a[0].split('\t');
            const [divB, deptB] = b[0].split('\t');
            const c = (divA || '').localeCompare(divB || '');
            return c !== 0 ? c : (deptA || '').localeCompare(deptB || '');
        });

        const rows = [];
        let sno = 0;
        const BLANK_ROWS_BETWEEN_GROUPS = 3;

        for (let g = 0; g < sortedGroupEntries.length; g++) {
            const [key, groupEmpNos] = sortedGroupEntries[g];
            const [divisionName, departmentName] = key.split('\t');
            groupEmpNos.sort((a, b) => (empMap[a]?.emp_no || a).localeCompare(empMap[b]?.emp_no || b));

            for (const empNo of groupEmpNos) {
                const info = empMap[empNo] || { emp_no: empNo, employee_name: empNo, department: '', division: '' };
                const dates = Object.keys(byEmpDate[empNo]).sort();
                for (const dateKey of dates) {
                    const [y, m, day] = dateKey.split('-');
                    const pDate = formatPDate(new Date(parseInt(y), parseInt(m) - 1, parseInt(day)));
                    const dayLogs = byEmpDate[empNo][dateKey].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    const { in1, out1, in2, out2, numIns, numOuts, totHrsStr } = buildDayRow(dayLogs);
                    sno += 1;
                    rows.push({
                        sno,
                        eno: info.emp_no,
                        name: info.employee_name,
                        division: info.division,
                        department: info.department,
                        pdate: pDate,
                        in1,
                        out1,
                        in2,
                        out2,
                        numIns,
                        numOuts,
                        totHrs: totHrsStr
                    });
                }
            }
            // 2–3 blank rows between groups (except after last group)
            if (g < sortedGroupEntries.length - 1) {
                for (let i = 0; i < BLANK_ROWS_BETWEEN_GROUPS; i++) {
                    rows.push({ blank: true });
                }
            }
        }

        // 6) CSV output
        const header = 'SNO,E.NO,EMPLOYEE NAME,DIVISION,DEPARTMENT,PDate,IN 1,OUT 1,IN 2,OUT 2,No. of INs,No. of OUTs,TOT HRS';
        const escapeCsv = (v) => {
            const s = String(v == null ? '' : v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const lines = [header, ...rows.map(r => {
            if (r.blank) return '';
            return [r.sno, r.eno, r.name, r.division, r.department, r.pdate, r.in1, r.out1, r.in2, r.out2, r.numIns, r.numOuts, r.totHrs].map(escapeCsv).join(',');
        })];
        const csv = lines.join('\n');

        const filename = `attendance_report_${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv); // BOM for Excel UTF-8
    } catch (err) {
        logger.error('Export attendance error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
