const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);
const XLSX = require('xlsx');

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

function test() {
    console.log('--- Final Verification (V3): No Auto-Bumping & Strict Local ---\n');

    const cases = [
        {
            name: 'Overnight - Explicit Dates (Respect exactly)',
            in: '2026-01-01 21:03',
            out: '2026-01-02 05:00'
        },
        {
            name: 'Overnight - Same Day provided (No Auto-Bumping)',
            in: '2026-01-07 21:00',
            out: '2026-01-07 05:00'
        },
        {
            name: 'Time Only Fallback (Inherit Date, no bump)',
            in: '2026-01-07 21:00',
            out: '05:00'
        },
        {
            name: 'TZ Shift Prevention (Ignoring Z)',
            in: '1899-12-30T16:08:50.000Z',
            out: null
        }
    ];

    cases.forEach(c => {
        console.log(`CASE: ${c.name}`);
        const inTimeDate = parseExcelDate(c.in);
        console.log(`IN:  ${c.in} -> ${inTimeDate ? inTimeDate.toLocaleString() : 'null'}`);

        if (c.out) {
            const outTimeDate = parseExcelDate(c.out, inTimeDate);
            console.log(`OUT: ${c.out} -> ${outTimeDate ? outTimeDate.toLocaleString() : 'null'}`);
        }
        console.log('------------------');
    });
}

test();
