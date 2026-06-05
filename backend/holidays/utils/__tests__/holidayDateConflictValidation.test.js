/**
 * Holiday date-conflict validation — simulated scenarios with realistic HRMS data.
 *
 * Labels:
 *   TP = True Positive  — conflict exists, validation correctly blocks
 *   TN = True Negative  — no conflict, validation correctly allows
 *   FP = False Positive guard — must NOT block (would be a bug if ok:false)
 *   FN = False Negative guard — must block (would be a bug if ok:true)
 */

const mongoose = require('mongoose');
const { createISTDate } = require('../../../shared/utils/dateUtils');

const G_ENG = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const G_HR = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const G_FIN = new mongoose.Types.ObjectId('507f1f77bcf86cd799439013');
const G_PYDAH = new mongoose.Types.ObjectId('507f1f77bcf86cd799439099');

const H_GLOBAL = new mongoose.Types.ObjectId('607f1f77bcf86cd799439001');
const H_ENG_SYNC = new mongoose.Types.ObjectId('607f1f77bcf86cd799439002');
const H_HR_LOCAL = new mongoose.Types.ObjectId('607f1f77bcf86cd799439003');
const H_MAPPING = new mongoose.Types.ObjectId('607f1f77bcf86cd799439004');
const H_FIN_LOCAL = new mongoose.Types.ObjectId('607f1f77bcf86cd799439005');
const H_RANGE = new mongoose.Types.ObjectId('607f1f77bcf86cd799439006');
const H_INACTIVE = new mongoose.Types.ObjectId('607f1f77bcf86cd799439099');
const H_PYDAH = new mongoose.Types.ObjectId('607f1f77bcf86cd799439010');

const D_REPUBLIC = '2026-01-26';
const D_INDEPENDENCE = '2026-08-15';
const D_RANGE_START = '2026-10-01';
const D_RANGE_END = '2026-10-03';
const D_ADJACENT = '2026-01-27';

let mockHolidays = [];
let mockGroups = [];

function toDate(str) {
    return createISTDate(str, '00:00');
}

function holidayOverlapsRange(h, rangeStart, rangeEnd) {
    if (h.isActive === false) return false;
    const start = h.date.toISOString().slice(0, 10);
    const end = h.endDate ? h.endDate.toISOString().slice(0, 10) : start;
    const rangeStartDate = new Date(`${rangeStart}T00:00:00Z`);
    const rangeEndDate = new Date(`${rangeEnd}T23:59:59Z`);
    if (h.date > rangeEndDate) return false;
    if (h.endDate) {
        return h.endDate >= rangeStartDate;
    }
    return h.date >= rangeStartDate;
}

function filterHolidays(query) {
    let rows = [...mockHolidays];

    if (query.isActive) {
        rows = rows.filter((h) => h.isActive !== false);
    }
    if (query.sourceHolidayId) {
        rows = rows.filter((h) => String(h.sourceHolidayId) === String(query.sourceHolidayId));
    }

    return rows;
}

function makeChain(rows) {
    const chain = {
        select() { return chain; },
        populate() { return chain; },
        lean: async () => rows,
    };
    return chain;
}

jest.mock('../../model/Holiday', () => ({
    find: jest.fn((query) => makeChain(filterHolidays(query))),
}));

jest.mock('../../model/HolidayGroup', () => ({
    find: jest.fn((query) => {
        let rows = mockGroups.filter((g) => g.isActive !== false);
        if (query._id?.$in) {
            const allowed = new Set(query._id.$in.map(String));
            rows = rows.filter((g) => allowed.has(String(g._id)));
        }
        return makeChain(rows);
    }),
}));

const { validateHolidayDateConflicts } = require('../holidayDateConflictValidation');

function baseDataset() {
    mockGroups = [
        { _id: G_ENG, name: 'Engineering Calendar', isActive: true },
        { _id: G_HR, name: 'HR Calendar', isActive: true },
        { _id: G_FIN, name: 'Finance Calendar', isActive: true },
    ];

    mockHolidays = [
        {
            _id: H_GLOBAL,
            name: 'Republic Day',
            date: toDate(D_REPUBLIC),
            endDate: null,
            scope: 'GLOBAL',
            isActive: true,
            groupId: null,
            sourceHolidayId: null,
        },
        {
            _id: H_ENG_SYNC,
            name: 'Republic Day',
            date: toDate(D_REPUBLIC),
            endDate: null,
            scope: 'GROUP',
            isActive: true,
            groupId: { _id: G_ENG, name: 'Engineering Calendar' },
            sourceHolidayId: H_GLOBAL,
        },
        {
            _id: H_HR_LOCAL,
            name: 'HR Team Outing',
            date: toDate(D_REPUBLIC),
            endDate: null,
            scope: 'GROUP',
            isActive: true,
            groupId: { _id: G_HR, name: 'HR Calendar' },
            sourceHolidayId: null,
        },
        {
            _id: H_MAPPING,
            name: 'Division A Special Off',
            date: toDate(D_INDEPENDENCE),
            endDate: null,
            scope: 'MAPPING',
            isActive: true,
            groupId: null,
            sourceHolidayId: null,
        },
        {
            _id: H_FIN_LOCAL,
            name: 'Finance Audit Day',
            date: toDate(D_INDEPENDENCE),
            endDate: null,
            scope: 'GROUP',
            isActive: true,
            groupId: { _id: G_FIN, name: 'Finance Calendar' },
            sourceHolidayId: null,
        },
        {
            _id: H_RANGE,
            name: 'Gandhi Jayanti Extended',
            date: toDate(D_RANGE_START),
            endDate: toDate(D_RANGE_END),
            scope: 'GROUP',
            isActive: true,
            groupId: { _id: G_ENG, name: 'Engineering Calendar' },
            sourceHolidayId: null,
        },
        {
            _id: H_INACTIVE,
            name: 'Old Cancelled Holiday',
            date: toDate(D_REPUBLIC),
            endDate: null,
            scope: 'GROUP',
            isActive: false,
            groupId: { _id: G_FIN, name: 'Finance Calendar' },
            sourceHolidayId: null,
        },
    ];
}

const scenarios = [
    {
        id: 'TP-01',
        label: 'TP',
        name: 'Duplicate GROUP holiday same group + same date',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_HR,
            applicableTo: 'SPECIFIC_GROUPS',
        },
        expectOk: false,
        expectGroups: ['HR Calendar'],
    },
    {
        id: 'TP-02',
        label: 'TP',
        name: 'GLOBAL ALL blocked when org-wide holiday already exists',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GLOBAL',
            applicableTo: 'ALL',
            isBulkGroupCreate: false,
        },
        expectOk: false,
        expectGroups: ['All employees (Global)'],
    },
    {
        id: 'TP-03',
        label: 'TP',
        name: 'GLOBAL ALL blocked when any group already has holiday on date',
        setup: () => {
            baseDataset();
            mockHolidays = mockHolidays.filter((h) => h.scope !== 'GLOBAL');
        },
        input: {
            date: D_REPUBLIC,
            scope: 'GLOBAL',
            applicableTo: 'ALL',
            isBulkGroupCreate: false,
        },
        expectOk: false,
        expectGroups: ['HR Calendar', 'Engineering Calendar'],
    },
    {
        id: 'TP-04',
        label: 'TP',
        name: 'Bulk group create blocked for group with existing holiday',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GLOBAL',
            applicableTo: 'SPECIFIC_GROUPS',
            targetGroupIds: [G_HR, G_FIN],
            isBulkGroupCreate: true,
        },
        expectOk: false,
        expectGroups: ['HR Calendar'],
    },
    {
        id: 'TP-05',
        label: 'TP',
        name: 'GROUP create blocked when GLOBAL holiday applies to that group',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_ENG,
            applicableTo: 'SPECIFIC_GROUPS',
        },
        expectOk: false,
        expectGroups: ['Engineering Calendar'],
    },
    {
        id: 'TP-06',
        label: 'TP',
        name: 'MAPPING create blocked when MAPPING holiday exists on date',
        setup: baseDataset,
        input: {
            date: D_INDEPENDENCE,
            scope: 'MAPPING',
        },
        expectOk: false,
        expectGroups: ['Employee scope'],
    },
    {
        id: 'TP-07',
        label: 'TP',
        name: 'Single day inside existing multi-day range (Engineering)',
        setup: baseDataset,
        input: {
            date: '2026-10-02',
            scope: 'GROUP',
            groupId: G_ENG,
        },
        expectOk: false,
        expectGroups: ['Engineering Calendar'],
    },
    {
        id: 'TP-08',
        label: 'TP',
        name: 'New multi-day range overlaps existing single-day group holiday',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            endDate: D_ADJACENT,
            scope: 'GROUP',
            groupId: G_HR,
        },
        expectOk: false,
        expectGroups: ['HR Calendar'],
    },
    {
        id: 'TP-09',
        label: 'TP',
        name: 'Global ALL blocked when Pydahsoft group already has holiday (reported scenario)',
        setup: () => {
            mockGroups = [{ _id: G_PYDAH, name: 'Pydahsoft', isActive: true }];
            mockHolidays = [
                {
                    _id: H_PYDAH,
                    name: 'Pydahsoft Team Holiday',
                    date: toDate('2026-06-05'),
                    endDate: null,
                    scope: 'GROUP',
                    isActive: true,
                    groupId: { _id: G_PYDAH, name: 'Pydahsoft' },
                    sourceHolidayId: null,
                },
            ];
        },
        input: {
            date: '2026-06-05',
            scope: 'GLOBAL',
            applicableTo: 'ALL',
            isBulkGroupCreate: false,
        },
        expectOk: false,
        expectGroups: ['Pydahsoft'],
    },
    {
        id: 'TP-10',
        label: 'TP',
        name: 'Global blocked when group holiday stored as IST midnight (+05:30)',
        setup: () => {
            mockGroups = [{ _id: G_PYDAH, name: 'Pydahsoft', isActive: true }];
            mockHolidays = [
                {
                    _id: H_PYDAH,
                    name: 'IST Midnight Holiday',
                    date: createISTDate('2026-06-05', '00:00'),
                    endDate: null,
                    scope: 'GROUP',
                    isActive: true,
                    groupId: { _id: G_PYDAH, name: 'Pydahsoft' },
                    sourceHolidayId: null,
                },
            ];
        },
        input: {
            date: '2026-06-05',
            scope: 'GLOBAL',
            applicableTo: 'ALL',
            isBulkGroupCreate: false,
        },
        expectOk: false,
        expectGroups: ['Pydahsoft'],
    },
    {
        id: 'TP-11',
        label: 'TP',
        name: 'Global create with missing applicableTo still blocked by existing group holiday',
        setup: () => {
            mockGroups = [{ _id: G_PYDAH, name: 'Pydahsoft', isActive: true }];
            mockHolidays = [
                {
                    _id: H_PYDAH,
                    name: 'Pydahsoft Event',
                    date: toDate('2026-06-05'),
                    endDate: null,
                    scope: 'GROUP',
                    isActive: true,
                    groupId: { _id: G_PYDAH, name: 'Pydahsoft' },
                    sourceHolidayId: null,
                },
            ];
        },
        input: {
            date: '2026-06-05',
            scope: 'GLOBAL',
            isBulkGroupCreate: false,
        },
        expectOk: false,
        expectGroups: ['Pydahsoft'],
    },
    {
        id: 'TN-01',
        label: 'TN',
        name: 'Different date — no conflict',
        setup: baseDataset,
        input: {
            date: '2026-03-08',
            scope: 'GROUP',
            groupId: G_HR,
        },
        expectOk: true,
    },
    {
        id: 'TN-02',
        label: 'TN',
        name: 'Same date different group — Finance allowed (only HR has holiday)',
        setup: () => {
            baseDataset();
            mockHolidays = mockHolidays.filter((h) => h.scope !== 'GLOBAL' && String(h.groupId?._id || h.groupId) !== String(G_ENG));
        },
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_FIN,
        },
        expectOk: true,
    },
    {
        id: 'TN-03',
        label: 'TN',
        name: 'Update same holiday (_id excluded) — no self-conflict',
        setup: baseDataset,
        input: {
            _id: H_HR_LOCAL,
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_HR,
        },
        expectOk: true,
    },
    {
        id: 'TN-04',
        label: 'TN',
        name: 'Update GLOBAL master — synced copies excluded',
        setup: baseDataset,
        input: {
            _id: H_GLOBAL,
            date: D_REPUBLIC,
            scope: 'GLOBAL',
            applicableTo: 'ALL',
            isBulkGroupCreate: false,
        },
        expectOk: true,
    },
    {
        id: 'FP-01',
        label: 'FP',
        name: 'Group override replacing synced global copy — must allow',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_ENG,
            overridesMasterId: H_GLOBAL,
        },
        expectOk: true,
    },
    {
        id: 'FP-02',
        label: 'FP',
        name: 'Inactive holiday on same date — must NOT block Finance',
        setup: () => {
            baseDataset();
            mockHolidays = mockHolidays.filter((h) => h.scope !== 'GLOBAL' && h.isActive !== false && String(h.groupId?._id || h.groupId) !== String(G_ENG));
            mockHolidays.push({
                _id: H_INACTIVE,
                name: 'Old Cancelled Holiday',
                date: toDate(D_REPUBLIC),
                endDate: null,
                scope: 'GROUP',
                isActive: false,
                groupId: { _id: G_FIN, name: 'Finance Calendar' },
                sourceHolidayId: null,
            });
        },
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_FIN,
        },
        expectOk: true,
    },
    {
        id: 'FP-03',
        label: 'FP',
        name: 'Adjacent next day — must NOT block HR group',
        setup: baseDataset,
        input: {
            date: D_ADJACENT,
            scope: 'GROUP',
            groupId: G_HR,
        },
        expectOk: true,
    },
    {
        id: 'FP-04',
        label: 'FP',
        name: 'GROUP holiday must NOT be blocked by unrelated MAPPING on same date',
        setup: baseDataset,
        input: {
            date: D_INDEPENDENCE,
            scope: 'GROUP',
            groupId: G_ENG,
        },
        expectOk: true,
    },
    {
        id: 'FP-05',
        label: 'FP',
        name: 'Bulk create for Finance only — HR conflict must NOT appear',
        setup: baseDataset,
        input: {
            date: D_INDEPENDENCE,
            scope: 'GLOBAL',
            applicableTo: 'SPECIFIC_GROUPS',
            targetGroupIds: [G_FIN],
            isBulkGroupCreate: true,
        },
        expectOk: false,
        expectGroups: ['Finance Calendar'],
        expectNotGroups: ['HR Calendar'],
    },
    {
        id: 'FN-01',
        label: 'FN',
        name: 'Must block duplicate HR holiday (regression guard)',
        setup: baseDataset,
        input: {
            date: D_REPUBLIC,
            scope: 'GROUP',
            groupId: G_HR,
        },
        expectOk: false,
    },
];

describe('holidayDateConflictValidation simulation', () => {
    const results = [];

    afterAll(() => {
        const passed = results.filter((r) => r.pass).length;
        const failed = results.filter((r) => !r.pass).length;
        // eslint-disable-next-line no-console
        console.log('\n========== HOLIDAY DATE CONFLICT TEST REPORT ==========');
        // eslint-disable-next-line no-console
        console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);
        // eslint-disable-next-line no-console
        console.log('ID     | Type | Result | Scenario');
        // eslint-disable-next-line no-console
        console.log('-------|------|--------|------------------------------------------');
        for (const r of results) {
            const status = r.pass ? 'PASS' : 'FAIL';
            // eslint-disable-next-line no-console
            console.log(`${r.id.padEnd(6)} | ${r.label.padEnd(4)} | ${status.padEnd(6)} | ${r.name}`);
            if (!r.pass && r.detail) {
                // eslint-disable-next-line no-console
                console.log(`       |      |        | ${r.detail}`);
            }
            if (r.conflicts?.length) {
                const preview = r.conflicts
                    .slice(0, 3)
                    .map((c) => `${c.groupName}@${c.date}`)
                    .join(', ');
                // eslint-disable-next-line no-console
                console.log(`       |      |        | Conflicts: ${preview}${r.conflicts.length > 3 ? '...' : ''}`);
            }
        }
        // eslint-disable-next-line no-console
        console.log('=======================================================\n');
    });

    test.each(scenarios)('$id [$label] $name', async (scenario) => {
        scenario.setup();
        const result = await validateHolidayDateConflicts(scenario.input);

        const okMatch = result.ok === scenario.expectOk;
        let groupMatch = true;
        let detail = '';

        if (scenario.expectOk === false && scenario.expectGroups?.length) {
            const names = (result.conflicts || []).map((c) => c.groupName);
            const missing = scenario.expectGroups.filter((g) => !names.includes(g));
            if (missing.length) {
                groupMatch = false;
                detail = `Missing expected groups: ${missing.join(', ')}. Got: ${names.join(', ') || '(none)'}`;
            }
        }

        if (scenario.expectNotGroups?.length) {
            const names = (result.conflicts || []).map((c) => c.groupName);
            const unexpected = scenario.expectNotGroups.filter((g) => names.includes(g));
            if (unexpected.length) {
                groupMatch = false;
                detail = `False positive groups: ${unexpected.join(', ')}`;
            }
        }

        if (scenario.expectOk === true && !result.ok) {
            detail = `False positive — blocked unexpectedly: ${result.message?.split('\n')[0]}`;
        }
        if (scenario.expectOk === false && result.ok) {
            detail = 'False negative — allowed when conflict exists';
        }

        const pass = okMatch && groupMatch;
        results.push({
            id: scenario.id,
            label: scenario.label,
            name: scenario.name,
            pass,
            detail,
            conflicts: result.conflicts,
        });

        expect(result.ok).toBe(scenario.expectOk);
        if (scenario.expectGroups?.length && scenario.expectOk === false) {
            const names = (result.conflicts || []).map((c) => c.groupName);
            for (const g of scenario.expectGroups) {
                expect(names).toContain(g);
            }
        }
        if (scenario.expectNotGroups?.length) {
            const names = (result.conflicts || []).map((c) => c.groupName);
            for (const g of scenario.expectNotGroups) {
                expect(names).not.toContain(g);
            }
        }
    });
});
