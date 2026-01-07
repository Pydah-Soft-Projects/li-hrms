const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
const XLSX = require('xlsx');

/**
 * REPLICATED LOGIC FROM attendanceUploadController.js
 */
const formatDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseExcelDate = (val, fallbackDate = null) => {
    if (!val) return null;

    let y, m, d, H, M, S;

    if (typeof val === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(val);
        y = dateObj.y;
        m = dateObj.m;
        d = dateObj.d;
        H = dateObj.H;
        M = dateObj.M;
        S = dateObj.S;
    } else if (val instanceof Date) {
        y = val.getFullYear();
        m = val.getMonth() + 1;
        d = val.getDate();
        H = val.getHours();
        M = val.getMinutes();
        S = val.getSeconds();
    } else {
        const str = String(val).trim();
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
            y = isTimeOnly ? 1900 : parsed.year();
            m = parsed.month() + 1;
            d = parsed.date();
            H = parsed.hour();
            M = parsed.minute();
            S = parsed.second();
        } else {
            // THE FIX: Strip TZ indicators for strict local construction
            const native = new Date(str.replace(/Z|[+-]\d{2}(:?\d{2})?$/g, ''));
            if (isNaN(native.getTime())) return null;
            y = native.getFullYear();
            m = native.getMonth() + 1;
            d = native.getDate();
            H = native.getHours();
            M = native.getMinutes();
            S = native.getSeconds();
        }
    }

    if (y < 1920) {
        const base = fallbackDate || new Date();
        y = base.getFullYear();
        m = base.getMonth() + 1;
        d = base.getDate();
    }

    return new Date(y, m - 1, d, H, M, S);
};

function verify() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += msg + '\n';
    };

    log('--- FINAL VERIFICATION: ATTENDANCE PARSING ---');
    log(`Current Script Time: ${new Date().toLocaleString()}`);
    log('----------------------------------------------\n');

    const testCases = [
        {
            name: 'STRICT LOCAL: ISO String (No Offset)',
            input: '2026-01-01T16:08:50',
            expected: '4:08:50 pm'
        },
        {
            name: 'STRICT LOCAL: UTC String (Ignore Z)',
            input: '2026-01-01T16:08:50.000Z',
            expected: '4:08:50 pm'
        },
        {
            name: 'OVERNIGHT: Explicit Dual Dates (Respect Exactly)',
            in: '2026-01-01 21:00',
            out: '2026-01-02 05:00',
            expectedOutDate: '2/1/2026'
        },
        {
            name: 'NO AUTO-BUMP: Same-Day Out < In (Respect User Choice)',
            in: '2026-01-01 21:00',
            out: '2026-01-01 05:00',
            expectedOutDate: '1/1/2026'
        },
        {
            name: 'EXCEL SERIAL: 46022.375 (Strict Components)',
            input: 46022.375, // Jan 1 2026 9:00 (approx)
            expected: '1/1/2026, 9:00:00 am'
        }
    ];

    testCases.forEach(c => {
        log(`CASE: ${c.name}`);
        if (c.input !== undefined) {
            const result = parseExcelDate(c.input);
            log(`INPUT  : ${c.input}`);
            log(`RESULT : ${result ? result.toLocaleString() : 'null'}`);
            // Note: locale string might differ on user machine, but we care about the "components"
        } else {
            const inDate = parseExcelDate(c.in);
            const outDate = parseExcelDate(c.out, inDate);
            log(`IN    : ${c.in} -> ${inDate ? inDate.toLocaleString() : 'null'}`);
            log(`OUT   : ${c.out} -> ${outDate ? outDate.toLocaleString() : 'null'}`);
        }
        log('----------------------------------------------');
    });

    log('\nVerification Complete.');
    require('fs').writeFileSync('attendance_verify_results.txt', output);
}

verify();
