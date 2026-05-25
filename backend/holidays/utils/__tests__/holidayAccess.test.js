const {
    canManageGlobal,
    canManageHoliday,
    getManagedGroupIdStrings,
    assertGroupInScope,
    assertCanManageHolidayRecord,
    normalizeHolidayWritePayload,
} = require('../holidayAccess');

const groupA = '507f1f77bcf86cd799439011';
const groupB = '507f1f77bcf86cd799439012';
const groupC = '507f1f77bcf86cd799439013';

function mockActor(overrides = {}) {
    return {
        role: 'manager',
        featureControl: [],
        managedHolidayGroupIds: [groupA, groupB],
        ...overrides,
    };
}

describe('holidayAccess', () => {
    describe('canManageHoliday / canManageGlobal', () => {
        test('super_admin can manage holiday and global', () => {
            const actor = mockActor({ role: 'super_admin' });
            expect(canManageHoliday(actor)).toBe(true);
            expect(canManageGlobal(actor)).toBe(true);
        });

        test('scoped write without global flag', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] });
            expect(canManageHoliday(actor)).toBe(true);
            expect(canManageGlobal(actor)).toBe(false);
        });

        test('global manage flag grants global only when write present', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR_MANAGE_GLOBAL:write'] });
            expect(canManageGlobal(actor)).toBe(true);
            expect(canManageHoliday(actor)).toBe(false);
        });

        test('no permissions', () => {
            const actor = mockActor({ featureControl: ['EMPLOYEES:read'] });
            expect(canManageHoliday(actor)).toBe(false);
            expect(canManageGlobal(actor)).toBe(false);
        });
    });

    describe('assertGroupInScope', () => {
        test('scoped user allowed for assigned group', () => {
            expect(() => assertGroupInScope(mockActor(), groupA)).not.toThrow();
        });

        test('scoped user denied for unassigned group', () => {
            expect(() => assertGroupInScope(mockActor(), groupC)).toThrow(/not authorized/);
        });

        test('global manager allowed for any group', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR_MANAGE_GLOBAL:write', 'HOLIDAY_CALENDAR:write'] });
            expect(() => assertGroupInScope(actor, groupC)).not.toThrow();
        });
    });

    describe('assertCanManageHolidayRecord', () => {
        test('scoped user cannot edit GLOBAL master', () => {
            const holiday = { scope: 'GLOBAL', isMaster: true, groupId: null };
            expect(() => assertCanManageHolidayRecord(mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] }), holiday))
                .toThrow(/org-wide/);
        });

        test('scoped user can edit GROUP holiday in scope', () => {
            const holiday = { scope: 'GROUP', isMaster: false, groupId: groupA };
            expect(() => assertCanManageHolidayRecord(mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] }), holiday))
                .not.toThrow();
        });

        test('scoped user cannot edit GROUP holiday out of scope', () => {
            const holiday = { scope: 'GROUP', isMaster: false, groupId: groupC };
            expect(() => assertCanManageHolidayRecord(mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] }), holiday))
                .toThrow(/not authorized/);
        });
    });

    describe('normalizeHolidayWritePayload', () => {
        test('global manager payload unchanged', () => {
            const actor = mockActor({ role: 'super_admin' });
            const body = { scope: 'GLOBAL', isMaster: true, applicableTo: 'ALL' };
            expect(normalizeHolidayWritePayload(actor, body)).toEqual(body);
        });

        test('scoped GLOBAL create becomes SPECIFIC_GROUPS for assigned groups', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] });
            const body = { scope: 'GLOBAL', isMaster: true, applicableTo: 'ALL', name: 'Test' };
            const out = normalizeHolidayWritePayload(actor, body);
            expect(out.scope).toBe('GLOBAL');
            expect(out.applicableTo).toBe('SPECIFIC_GROUPS');
            expect(out.targetGroupIds).toEqual([groupA, groupB]);
            expect(out.isMaster).toBe(false);
        });

        test('scoped user with no groups or mapping rejected', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'], managedHolidayGroupIds: [] });
            expect(() => normalizeHolidayWritePayload(actor, { scope: 'GROUP', groupId: groupA }))
                .toThrow(/No holiday groups or employee scope/);
        });

        test('scoped user with mapping only creates MAPPING scope', () => {
            const divId = '507f1f77bcf86cd799439099';
            const actor = mockActor({
                featureControl: ['HOLIDAY_CALENDAR:write'],
                managedHolidayGroupIds: [],
                holidayDivisionMapping: [{ division: divId, departments: [], employeeGroups: [] }],
            });
            const out = normalizeHolidayWritePayload(actor, { scope: 'GLOBAL', applicableTo: 'ALL' });
            expect(out.scope).toBe('MAPPING');
            expect(out.divisionMapping).toEqual([{ division: divId, departments: [], employeeGroups: [] }]);
        });

        test('scoped GROUP create out of scope rejected', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] });
            expect(() => normalizeHolidayWritePayload(actor, { scope: 'GROUP', groupId: groupC }))
                .toThrow(/not authorized/);
        });

        test('scoped SPECIFIC_GROUPS intersects with managed list', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] });
            const body = {
                scope: 'GLOBAL',
                applicableTo: 'SPECIFIC_GROUPS',
                targetGroupIds: [groupA, groupC],
            };
            const out = normalizeHolidayWritePayload(actor, body);
            expect(out.targetGroupIds).toEqual([groupA]);
        });

        test('scoped SPECIFIC_GROUPS with only out-of-scope ids rejected', () => {
            const actor = mockActor({ featureControl: ['HOLIDAY_CALENDAR:write'] });
            expect(() => normalizeHolidayWritePayload(actor, {
                scope: 'GLOBAL',
                applicableTo: 'SPECIFIC_GROUPS',
                targetGroupIds: [groupC],
            })).toThrow(/None of the selected groups/);
        });
    });

    describe('getManagedGroupIdStrings', () => {
        test('returns string ids', () => {
            const ids = getManagedGroupIdStrings(mockActor());
            expect(ids).toEqual([groupA, groupB]);
        });
    });
});
