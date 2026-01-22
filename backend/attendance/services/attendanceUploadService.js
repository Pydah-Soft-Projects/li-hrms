const XLSX = require('xlsx');
const dayjs = require('dayjs');

/**
 * Robust date/time parser for Excel inputs
 */
const parseExcelDate = (val, fallbackDate = null) => {
    if (!val) return null;

    let y, m, d, H, M, S;

    if (typeof val === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(val);
        y = dateObj.y; m = dateObj.m; d = dateObj.d;
        H = dateObj.H; M = dateObj.M; S = dateObj.S;
    } else if (val instanceof Date) {
        y = val.getFullYear(); m = val.getMonth() + 1; d = val.getDate();
        H = val.getHours(); M = val.getMinutes(); S = val.getSeconds();
    } else {
        const str = String(val).trim();
        const isTimeOnly = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/.test(str);
        const formats = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'DD-MM-YYYY HH:mm:ss', 'DD-MM-YYYY HH:mm', 'YYYY/MM/DD HH:mm:ss', 'DD/MM/YYYY HH:mm', 'HH:mm:ss', 'HH:mm'];
        const parsed = dayjs(str, formats, true);
        if (parsed.isValid()) {
            y = isTimeOnly ? 1900 : parsed.year();
            m = parsed.month() + 1; d = parsed.date();
            H = parsed.hour(); M = parsed.minute(); S = parsed.second();
        } else {
            const native = new Date(str.replace(/Z|[+-]\d{2}(:?\d{2})?$/g, ''));
            if (isNaN(native.getTime())) return null;
            y = native.getFullYear(); m = native.getMonth() + 1; d = native.getDate();
            H = native.getHours(); M = native.getMinutes(); S = native.getSeconds();
        }
    }

    if (y < 1920) {
        const base = fallbackDate || new Date();
        y = base.getFullYear(); m = base.getMonth() + 1; d = base.getDate();
    }

    const timeStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}`;
    return dayjs(timeStr, "YYYY-MM-DD HH:mm:ss").toDate();
};

const isValidLegacyTime = (val) => {
    if (val === undefined || val === null || val === '') return false;
    const n = Number(val);
    return !isNaN(n) && n !== 0;
};

const legacyTimeToDate = (baseDate, val) => {
    let hh, mm;
    if (typeof val === 'number') {
        hh = Math.floor(val); mm = Math.round((val - hh) * 100);
    } else {
        const s = String(val).replace(':', '.');
        const p = s.split('.');
        hh = parseInt(p[0]); mm = parseInt(p[1] || '0');
    }
    if (isNaN(hh) || isNaN(mm)) return null;
    const d = new Date(baseDate);
    d.setHours(hh, mm, 0, 0);
    return d;
};

/**
 * Specialized parser for "Legacy Report"
 */
const parseLegacyRows = (rows, headerIdx) => {
    const rawLogs = [];
    const errors = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        const sno = Number(row[0]);
        if (isNaN(sno) || sno === 0) continue;

        const empNo = String(row[1]).trim().toUpperCase();
        const pDateRaw = row[5];
        if (!empNo || !pDateRaw) continue;

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

        const punches = [row[6], row[7], row[8], row[9]];
        for (let j = 0; j < punches.length; j += 2) {
            const inVal = punches[j], outVal = punches[j + 1];
            if (isValidLegacyTime(inVal)) {
                const tIn = legacyTimeToDate(baseDate, inVal);
                rawLogs.push({ employeeNumber: empNo, timestamp: tIn, type: 'IN', source: 'excel', date: dayjs(tIn).format('YYYY-MM-DD') });
                if (isValidLegacyTime(outVal)) {
                    let tOut = legacyTimeToDate(baseDate, outVal);
                    if (tOut < tIn) tOut = new Date(tOut.getTime() + 86400000);
                    rawLogs.push({ employeeNumber: empNo, timestamp: tOut, type: 'OUT', source: 'excel', date: dayjs(tOut).format('YYYY-MM-DD') });
                }
            }
        }
    }
    return { rawLogs, errors };
};

/**
 * Fallback parser for Simple List format
 */
const parseSimpleRows = (data) => {
    const rawLogs = [];
    const errors = [];
    for (const row of data) {
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
            date: dayjs(inTimeDate).format('YYYY-MM-DD')
        });

        if (outTime) {
            const outTimeDate = parseExcelDate(outTime, inTimeDate);
            if (outTimeDate && !isNaN(outTimeDate.getTime())) {
                rawLogs.push({
                    employeeNumber: String(empNo).trim().toUpperCase(),
                    timestamp: outTimeDate,
                    type: 'OUT',
                    source: 'excel',
                    date: dayjs(outTimeDate).format('YYYY-MM-DD')
                });
            }
        }
    }
    return { rawLogs, errors };
};

module.exports = {
    parseExcelDate,
    parseLegacyRows,
    parseSimpleRows
};
