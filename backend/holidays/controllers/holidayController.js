const Holiday = require('../model/Holiday');
const HolidayGroup = require('../model/HolidayGroup');
const HolidayHistory = require('../model/HolidayHistory');
const User = require('../../users/model/User');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Employee = require('../../employees/model/Employee');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const cacheService = require('../../shared/services/cacheService');
const { rosterSyncQueue } = require('../../shared/jobs/queueManager');
const {
    loadHolidayActor,
    canManageGlobal,
    canManageHoliday,
    getManagedGroupIdStrings,
    getHolidayDivisionMapping,
    hasHolidayEmployeeScope,
    assertCanManageHolidayRecord,
    normalizeHolidayWritePayload,
    canViewHolidayRecord,
} = require('../utils/holidayAccess');
const {
    normalizeMappingList,
    mappingToEmployeeOrConditions,
    mappingToEmployeeOrConditionsExpanded,
    employeeMatchesMappingList,
    clampMappingToAllowed,
} = require('../utils/holidayScopeMapping');
const {
    normalizeRosterApplyOptions,
    getAttendanceProcessingMode,
    buildRosterEntriesForHoliday,
} = require('../utils/holidayRosterApply');

// Normalize to YYYY-MM-DD from a Date or date string (avoids timezone shifting calendar day)
function toDateString(d) {
    const x = new Date(d);
    const y = x.getUTCFullYear();
    const m = String(x.getUTCMonth() + 1).padStart(2, '0');
    const day = String(x.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function resolveHistoryActor(reqUser, actor) {
    const userId = actor?._id || reqUser?._id || reqUser?.userId || null;
    return {
        performedBy: userId,
        performedByName: actor?.name || reqUser?.name || null,
        performedByRole: actor?.role || reqUser?.role || null,
    };
}

async function logHolidayHistory({ holidayId, event, reqUser, actor, details, comments }) {
    try {
        const who = resolveHistoryActor(reqUser, actor);
        await HolidayHistory.create({
            holidayId,
            event,
            performedBy: who.performedBy,
            performedByName: who.performedByName,
            performedByRole: who.performedByRole,
            details: details || {},
            comments: comments || null,
        });
    } catch (err) {
        console.error('[HolidayHistory] log failed:', err.message);
    }
}

async function logHolidayHistoryMany(entries) {
    if (!entries?.length) return;
    await Promise.all(entries.map((entry) => logHolidayHistory(entry)));
}

function getDateRangeStrings(startInput, endInput) {
    const startStr = toDateString(startInput);
    const endStr = endInput ? toDateString(endInput) : startStr;
    const dates = [];
    let current = new Date(startStr + 'T12:00:00Z');
    const stop = new Date(endStr + 'T12:00:00Z');
    while (current <= stop) {
        dates.push(toDateString(current));
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
}

async function resolveEmployeesForHolidayScope({ scope, groupId, applicableTo, targetGroupIds, divisionMapping }) {
    const baseFilter = (typeof Employee.getCurrentlyActiveFilter === 'function')
        ? Employee.getCurrentlyActiveFilter()
        : { is_active: { $ne: false } };
    if (scope === 'MAPPING') {
        const rows = normalizeMappingList(divisionMapping);
        if (rows.length === 0) return [];
        const deptDocs = await Department.find(
            typeof Department.getCurrentlyActiveFilter === 'function'
                ? Department.getCurrentlyActiveFilter()
                : { isActive: { $ne: false } }
        )
            .select('divisions')
            .lean();
        const conditions = mappingToEmployeeOrConditionsExpanded(rows, deptDocs);
        if (conditions.length === 0) return [];
        const emps = await Employee.find({ ...baseFilter, $or: conditions }).select('emp_no').lean();
        const seen = new Set();
        const out = [];
        for (const e of emps) {
            const no = String(e.emp_no || '').toUpperCase();
            if (no && !seen.has(no)) {
                seen.add(no);
                out.push(no);
            }
        }
        return out;
    }
    if (scope === 'GROUP') {
        const group = await HolidayGroup.findById(groupId).lean();
        if (!group || !group.divisionMapping || group.divisionMapping.length === 0) return [];
        const deptDocs = await Department.find(
            typeof Department.getCurrentlyActiveFilter === 'function'
                ? Department.getCurrentlyActiveFilter()
                : { isActive: { $ne: false } }
        )
            .select('divisions')
            .lean();
        const conditions = mappingToEmployeeOrConditionsExpanded(group.divisionMapping, deptDocs);
        if (conditions.length === 0) return [];
        const emps = await Employee.find({ ...baseFilter, $or: conditions }).select('emp_no').lean();
        const seen = new Set();
        const out = [];
        for (const e of emps) {
            const no = String(e.emp_no || '').toUpperCase();
            if (no && !seen.has(no)) {
                seen.add(no);
                out.push(no);
            }
        }
        return out;
    }

    if (scope === 'GLOBAL' && applicableTo === 'SPECIFIC_GROUPS') {
        const groups = await HolidayGroup.find({ _id: { $in: targetGroupIds || [] }, isActive: true }).lean();
        const allMappings = [];
        for (const g of groups) {
            (g.divisionMapping || []).forEach(m => {
                allMappings.push({
                    division_id: m.division,
                        ...(m.departments && m.departments.length > 0 ? { department_id: { $in: m.departments } } : {}),
                        ...(m.employeeGroups && m.employeeGroups.length > 0 ? { employee_group_id: { $in: m.employeeGroups } } : {})
                });
            });
        }
        if (allMappings.length === 0) return [];
        const emps = await Employee.find({ ...baseFilter, $or: allMappings }).select('emp_no').lean();
        return emps.map(e => String(e.emp_no || '').toUpperCase()).filter(Boolean);
    }

    const emps = await Employee.find(baseFilter).select('emp_no').lean();
    return emps.map(e => String(e.emp_no || '').toUpperCase()).filter(Boolean);
}

/** Roster sync helper — same employee resolution as saveHoliday (supports MAPPING scope). */
async function syncHolidayToRoster(holiday) {
    try {
        const { date, endDate, scope, applicableTo, targetGroupIds, groupId, divisionMapping, name, createdBy } = holiday;
        const empNos = await resolveEmployeesForHolidayScope({
            scope,
            groupId,
            applicableTo,
            targetGroupIds,
            divisionMapping,
        });
        if (empNos.length === 0) return;

        const dates = getDateRangeStrings(date, endDate);
        for (const day of dates) {
            for (const empNo of empNos) {
                await PreScheduledShift.findOneAndUpdate(
                    { employeeNumber: empNo, date: day },
                    {
                        $set: {
                            status: 'HOL',
                            shiftId: null,
                            notes: `Holiday: ${name}`,
                        },
                        $setOnInsert: { scheduledBy: createdBy },
                    },
                    { upsert: true }
                );
            }
        }

        console.log(`Synced holiday "${name}" to roster for ${empNos.length} employees across ${dates.length} days.`);
    } catch (err) {
        console.error('Error syncing holiday to roster:', err);
    }
}

async function guessShiftFromWeekdayPattern(employeeNumber, dateStr) {
    const targetWeekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    const lookbackStart = new Date(`${dateStr}T00:00:00Z`);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 63);
    const fromStr = toDateString(lookbackStart);

    const candidates = await PreScheduledShift.find({
        employeeNumber,
        date: { $gte: fromStr, $lt: dateStr },
        shiftId: { $ne: null },
        status: { $ne: 'HOL' }
    }).select('date shiftId').sort({ date: -1 }).lean();

    for (const row of candidates) {
        const wd = new Date(`${row.date}T00:00:00Z`).getUTCDay();
        if (wd === targetWeekday && row.shiftId) return row.shiftId;
    }
    return null;
}

function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Employees to update when a holiday is removed — scoped list plus legacy over-applied roster rows. */
async function collectEmployeeNumbersForHolidayRosterCleanup(holiday, deleteDates) {
    const fromScope = await resolveEmployeesForHolidayScope({
        scope: holiday.scope,
        groupId: holiday.groupId,
        applicableTo: holiday.applicableTo,
        targetGroupIds: holiday.targetGroupIds,
        divisionMapping: holiday.divisionMapping,
    });
    const seen = new Set(fromScope.map((n) => String(n).toUpperCase()));

    if (holiday.name) {
        const legacyRows = await PreScheduledShift.find({
            date: { $in: deleteDates },
            status: 'HOL',
            notes: { $regex: escapeRegex(holiday.name), $options: 'i' },
        })
            .select('employeeNumber')
            .lean();
        for (const row of legacyRows) {
            const no = String(row.employeeNumber || '').toUpperCase();
            if (no) seen.add(no);
        }
    }

    return [...seen];
}

async function applyRosterEntriesAndSync(entries, userId) {
    if (!entries || entries.length === 0) return { affected: 0 };

    const bulkOps = entries.map((entry) => {
        const updateDoc = {
            employeeNumber: entry.employeeNumber,
            date: entry.date,
            notes: entry.notes != null ? entry.notes : (
                entry.status === 'HOL'
                    ? (entry.holidayName ? `Holiday: ${entry.holidayName}` : 'Holiday')
                    : entry.status === 'WO'
                        ? 'Week Off'
                        : null
            ),
        };

        if (entry.status === 'HOL' || entry.status === 'WO') {
            updateDoc.status = entry.status;
            updateDoc.shiftId = null;
            updateDoc.firstHalfStatus = null;
            updateDoc.secondHalfStatus = null;
            updateDoc.holidaySegmentScope = null;
            updateDoc.holidayHalfDayType = null;
            updateDoc.sourceHolidayId = entry.sourceHolidayId || null;
        } else if (
            entry.shiftId ||
            entry.firstHalfStatus ||
            entry.secondHalfStatus
        ) {
            updateDoc.shiftId = entry.shiftId || null;
            updateDoc.status = null;
            updateDoc.firstHalfStatus = entry.firstHalfStatus || null;
            updateDoc.secondHalfStatus = entry.secondHalfStatus || null;
            updateDoc.holidaySegmentScope = entry.holidaySegmentScope || null;
            updateDoc.holidayHalfDayType = entry.holidayHalfDayType || null;
            updateDoc.sourceHolidayId = entry.sourceHolidayId || null;
        }

        return {
            updateOne: {
                filter: { employeeNumber: entry.employeeNumber, date: entry.date },
                update: { $set: updateDoc, $setOnInsert: { scheduledBy: userId } },
                upsert: true,
            },
        };
    });

    await PreScheduledShift.bulkWrite(bulkOps, { ordered: false });

    const { syncRosterEntriesToAttendance } = require('../../attendance/services/rosterAttendanceSyncService');
    await syncRosterEntriesToAttendance(entries).catch((err) =>
        console.error('Failed to sync roster to attendance:', err.message)
    );

    await rosterSyncQueue.add('syncRoster', { entries, userId }).catch((err) =>
        console.error('Failed to enqueue roster sync:', err)
    );
    return { affected: entries.length };
}

// @desc    Get all holidays (Master + Groups)
// @route   GET /api/holidays/admin
// @access  Private (Super Admin, HR)
exports.getAllHolidaysAdmin = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        const { year } = req.query;
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
        let query = includeInactive ? {} : { isActive: { $ne: false } };

        if (year) {
            query = {
                ...(includeInactive ? {} : { isActive: { $ne: false } }),
                $or: [
                    { date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } },
                    { endDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } }
                ]
            };
        }

        let holidays = await Holiday.find(query)
            .populate('targetGroupIds', 'name')
            .populate('groupId', 'name')
            .populate('divisionMapping.division', 'name code')
            .populate('divisionMapping.departments', 'name code')
            .populate('divisionMapping.employeeGroups', 'name code')
            .sort({ date: 1 });

        let groups = await HolidayGroup.find({ isActive: true })
            .populate('divisionMapping.division', 'name')
            .populate('divisionMapping.departments', 'name')
            .populate('divisionMapping.employeeGroups', 'name code');

        const isGlobalManager = canManageGlobal(actor);
        const managedIds = getManagedGroupIdStrings(actor);
        const holidayMappingScope = getHolidayDivisionMapping(actor);
        const attendanceProcessingMode = await getAttendanceProcessingMode();

        if (!isGlobalManager && canManageHoliday(actor)) {
            groups = groups.filter((g) => managedIds.includes(g._id.toString()));
            holidays = holidays.filter((h) => canViewHolidayRecord(actor, h));
        }

        res.status(200).json({
            success: true,
            data: {
                holidays,
                groups,
                access: {
                    canManageGlobal: isGlobalManager,
                    managedHolidayGroupIds: managedIds,
                    holidayDivisionMapping: holidayMappingScope,
                    hasEmployeeScope: holidayMappingScope.length > 0,
                    attendanceProcessingMode,
                },
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching holidays',
            error: error.message
        });
    }
};

// @desc    Get holiday groups (admin)
// @route   GET /api/holidays/groups
// @access  Private (Super Admin, Sub Admin, HR)
exports.getHolidayGroupsAdmin = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        let groupQuery = { isActive: true };
        if (!canManageGlobal(actor)) {
            const managedIds = getManagedGroupIdStrings(actor);
            groupQuery._id = { $in: managedIds };
        }
        const groups = await HolidayGroup.find(groupQuery)
            .select('name description divisionMapping isActive createdBy createdAt updatedAt')
            .sort({ name: 1 })
            .lean();
        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching holiday groups',
            error: error.message
        });
    }
};

// @desc    Get holidays for a specific user (Computed)
// @route   GET /api/holidays/my
// @access  Private
exports.getMyHolidays = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId)
            .populate('division')
            .populate('department')
            .populate('groupMapping', 'name')
            .select('division department role groupMapping');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { year } = req.query;
        const dateQuery = year ? {
            $or: [
                { date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } },
                { endDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } }
            ]
        } : {};

        // 1. Identify User's Group
        // Find groups that match user's division + department + custom employee group (if configured).
        const userGroupIds = (user.groupMapping || [])
            .map(g => (g && g._id ? g._id.toString() : g?.toString()))
            .filter(Boolean);

        const allGroups = await HolidayGroup.find({ isActive: true }).lean();
        const applicableGroups = allGroups.filter((g) => {
            const maps = g.divisionMapping || [];
            return maps.some((m) => {
                const divMatch = m.division?.toString() === user.division?._id?.toString();
                if (!divMatch) return false;

                const deptMatch = !m.departments || m.departments.length === 0
                    ? true
                    : m.departments.some((d) => d?.toString() === user.department?._id?.toString());
                if (!deptMatch) return false;

                const grpMatch = !m.employeeGroups || m.employeeGroups.length === 0
                    ? true
                    : userGroupIds.length > 0 && m.employeeGroups.some((eg) => userGroupIds.includes(eg?.toString()));

                return grpMatch;
            });
        });

        const groupIds = applicableGroups.map(g => g._id);

        // 2. Fetch Master Holidays
        // - Global (applicableTo: 'ALL')
        // - Partial (applicableTo: 'SPECIFIC_GROUPS' and user's group is in targetGroupIds)
        const masterHolidays = await Holiday.find({
            ...dateQuery,
            isActive: { $ne: false },
            isMaster: true,
            $or: [
                { applicableTo: 'ALL' },
                {
                    applicableTo: 'SPECIFIC_GROUPS',
                    targetGroupIds: { $in: groupIds }
                }
            ]
        }).lean();

        // 3. Fetch Group Specific Holidays
        const groupHolidays = await Holiday.find({
            ...dateQuery,
            isActive: { $ne: false },
            scope: 'GROUP',
            groupId: { $in: groupIds }
        }).lean();

        // 4. Merge and Handle Overrides
        // If a group holiday overrides a master holiday, replace it
        const masterMap = new Map(masterHolidays.map(h => [h._id.toString(), h]));

        // Process group holidays
        const finalHolidays = [];

        // Add all group holidays first (they might be additions or overrides)
        for (const gh of groupHolidays) {
            if (gh.overridesMasterId) {
                // This is an override, remove the master from the map
                masterMap.delete(gh.overridesMasterId.toString());
            }
            finalHolidays.push(gh);
        }

        // Add remaining master holidays
        finalHolidays.push(...masterMap.values());

        // 5. Direct employee-scope holidays (MAPPING)
        const mappingHolidays = await Holiday.find({
            ...dateQuery,
            isActive: { $ne: false },
            scope: 'MAPPING',
        }).lean();

        const empRecord = await Employee.findOne({
            $or: [
                { emp_no: user.employeeId },
                { _id: user.employeeRef },
            ],
        }).select('division_id department_id employee_group_id emp_no').lean();

        if (empRecord) {
            for (const mh of mappingHolidays) {
                if (employeeMatchesMappingList(empRecord, mh.divisionMapping)) {
                    finalHolidays.push(mh);
                }
            }
        }

        // Sort by date
        finalHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.status(200).json({
            success: true,
            count: finalHolidays.length,
            data: finalHolidays
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user holidays',
            error: error.message
        });
    }
};

// @desc    Create/Update Holiday Group
// @route   POST /api/holidays/groups
// @access  Private (Super Admin)
exports.saveHolidayGroup = async (req, res) => {
    try {
        const { _id, name, description, divisionMapping, isActive } = req.body;

        const hasOverlap = (a = [], b = []) => {
            if (a.length === 0 || b.length === 0) return true; // empty means ALL
            return a.some(v => b.includes(v));
        };

        const normalizeMapping = (m) => ({
            division: m.division?.toString(),
            departments: (m.departments || []).map(d => d.toString()),
            employeeGroups: (m.employeeGroups || []).map(g => g.toString())
        });

        const inputMappings = (divisionMapping || []).map(normalizeMapping).filter(m => m.division);

        // 0. Validation: duplicates inside the same payload
        for (let i = 0; i < inputMappings.length; i++) {
            for (let j = i + 1; j < inputMappings.length; j++) {
                const a = inputMappings[i];
                const b = inputMappings[j];
                if (a.division !== b.division) continue;

                const deptOverlap = hasOverlap(a.departments, b.departments);
                const groupOverlap = hasOverlap(a.employeeGroups, b.employeeGroups);

                if (deptOverlap && groupOverlap) {
                    return res.status(400).json({
                        success: false,
                        message: `Duplicate mapping rows detected in this form (rows ${i + 1} and ${j + 1}) for the same division scope. Please refine departments or employee groups.`
                    });
                }
            }
        }

        // 1. Validation: Mapping Exclusivity
        // Ensure that (Division, Department, EmployeeGroup) scope doesn't overlap with another group
        const allGroups = await HolidayGroup.find({ _id: { $ne: _id }, isActive: true });

        for (const mapping of inputMappings) {
            const currentDivisionId = mapping.division;
            const currentDeptIds = mapping.departments;
            const currentEmpGroupIds = mapping.employeeGroups;

            for (const existingGroup of allGroups) {
                for (const existingMapping of existingGroup.divisionMapping) {
                    if (existingMapping.division.toString() === currentDivisionId) {
                        const existingDeptIds = existingMapping.departments.map(d => d.toString());
                        const existingEmpGroupIds = (existingMapping.employeeGroups || []).map(g => g.toString());
                        const deptOverlap = hasOverlap(currentDeptIds, existingDeptIds);
                        const groupOverlap = hasOverlap(currentEmpGroupIds, existingEmpGroupIds);

                        if (deptOverlap && groupOverlap) {
                            return res.status(400).json({
                                success: false,
                                message: `Some Division/Department/Employee Group scope is already mapped in group: ${existingGroup.name}. Duplicate mappings are not allowed.`
                            });
                        }
                    }
                }
            }
        }

        let group;
        if (_id) {
            group = await HolidayGroup.findById(_id);
            if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

            group.name = name;
            group.description = description;
            group.divisionMapping = divisionMapping;
            group.isActive = isActive !== undefined ? isActive : group.isActive;
            await group.save();
        } else {
            group = await HolidayGroup.create({
                name,
                description,
                divisionMapping,
                isActive: true,
                createdBy: req.user.userId
            });
        }

        res.status(200).json({
            success: true,
            data: group
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error saving holiday group',
            error: error.message
        });
    }
};

// @desc    Create/Update Holiday (Master or Group)
// @route   POST /api/holidays
// @access  Private (Super Admin)
exports.saveHoliday = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        const normalized = normalizeHolidayWritePayload(actor, req.body);
        const {
            _id, name, date, endDate, type, isMaster, scope, applicableTo, targetGroupIds, groupId,
            overridesMasterId, description, rosterFillMode, divisionMapping,
        } = normalized;

        let rosterApplyMode = 'FULL_DAY';
        let halfDayType = null;
        let multiShiftScope = 'FULL_DAY';
        try {
            const rosterOpts = normalizeRosterApplyOptions(normalized);
            rosterApplyMode = rosterOpts.rosterApplyMode;
            halfDayType = rosterOpts.halfDayType;
            multiShiftScope = rosterOpts.multiShiftScope;
        } catch (rosterValErr) {
            return res.status(rosterValErr.statusCode || 400).json({
                success: false,
                message: rosterValErr.message,
            });
        }

        const processingMode = await getAttendanceProcessingMode();
        if (rosterApplyMode === 'HALF_DAY' && processingMode === 'multi_shift' && multiShiftScope === 'FULL_DAY') {
            multiShiftScope = 'ALL_SEGMENTS';
        }

        let createdMessage = null;

        // Validation
        if (scope === 'GROUP' && !groupId) {
            return res.status(400).json({ success: false, message: 'Group ID is required for Group Scope holidays' });
        }
        if (scope === 'MAPPING' && (!divisionMapping || divisionMapping.length === 0)) {
            return res.status(400).json({ success: false, message: 'Employee scope mapping is required for this holiday' });
        }

        let holiday;
        // --- UPDATE LOGIC ---
        if (_id) {
            holiday = await Holiday.findById(_id);
            if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
            if (holiday.isActive === false) return res.status(400).json({ success: false, message: 'Cannot update a deactivated holiday' });

            try {
                assertCanManageHolidayRecord(actor, holiday);
            } catch (accessErr) {
                return res.status(accessErr.statusCode || 403).json({ success: false, message: accessErr.message });
            }

            if (!canManageGlobal(actor) && (scope === 'GLOBAL' || isMaster)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only users with global holiday management can modify org-wide holidays',
                });
            }

            const wasGlobal = holiday.scope === 'GLOBAL';
            const isNowGlobal = scope === 'GLOBAL';

            // Update the main holiday
            holiday.name = name;
            holiday.date = date;
            holiday.endDate = endDate || null;
            holiday.type = type;
            holiday.isMaster = isMaster;
            holiday.scope = scope;
            holiday.applicableTo = applicableTo;
            holiday.targetGroupIds = applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [];
            holiday.groupId = scope === 'GROUP' ? groupId : undefined;
            holiday.divisionMapping = scope === 'MAPPING' ? divisionMapping : [];
            holiday.overridesMasterId = overridesMasterId;
            holiday.description = description;
            holiday.rosterApplyMode = rosterApplyMode;
            holiday.halfDayType = halfDayType;
            holiday.multiShiftScope = multiShiftScope;

            // If updating a Group Copy (that has a source), break the sync
            if (holiday.sourceHolidayId) {
                holiday.isSynced = false;
            }

            await holiday.save();

            await logHolidayHistory({
                holidayId: holiday._id,
                event: 'holiday_updated',
                reqUser: req.user,
                actor,
                details: {
                    scope: holiday.scope,
                    applicableTo: holiday.applicableTo,
                    groupId: holiday.groupId,
                    targetGroupIds: holiday.targetGroupIds,
                    divisionMapping: holiday.divisionMapping,
                    rosterApplyMode: holiday.rosterApplyMode,
                    halfDayType: holiday.halfDayType,
                    multiShiftScope: holiday.multiShiftScope,
                },
                comments: 'Holiday updated',
            });

            // PROPAGATION: If Global Holiday Updated
            if (isNowGlobal) {
                // Find all synced copies and update them
                await Holiday.updateMany(
                    { sourceHolidayId: holiday._id, isSynced: true },
                    {
                        $set: {
                            name,
                            date,
                            endDate: endDate || null,
                            type,
                            description,
                            rosterApplyMode,
                            halfDayType,
                            multiShiftScope,
                        }
                    }
                );
            }
        }
        // --- CREATE LOGIC ---
        else {
            // Special Case: Bulk Create for Specific Groups (Individually, No Global Master)
            if (scope === 'GLOBAL' && applicableTo === 'SPECIFIC_GROUPS' && targetGroupIds && targetGroupIds.length > 0) {
                const holidaysToCreate = targetGroupIds.map(gid => ({
                    name,
                    date,
                    endDate: endDate || null,
                    type,
                    isMaster: false,
                    scope: 'GROUP',
                    groupId: gid,
                    description,
                    rosterApplyMode,
                    halfDayType,
                    multiShiftScope,
                    createdBy: req.user.userId,
                    isSynced: false // Independent
                }));

                const createdHolidays = await Holiday.insertMany(holidaysToCreate);
                holiday = createdHolidays[0];
                createdMessage = `Created ${createdHolidays.length} group holidays`;

                await logHolidayHistoryMany(
                    createdHolidays.map((h) => ({
                        holidayId: h._id,
                        event: 'holiday_created',
                        reqUser: req.user,
                        actor,
                        details: { scope: h.scope, groupId: h.groupId, bulkCreate: true },
                        comments: 'Holiday created (bulk group apply)',
                    }))
                );
            } else if (scope === 'MAPPING') {
                holiday = await Holiday.create({
                    name,
                    date,
                    endDate: endDate || null,
                    type,
                    isMaster: false,
                    scope: 'MAPPING',
                    divisionMapping,
                    description,
                    rosterApplyMode,
                    halfDayType,
                    multiShiftScope,
                    createdBy: req.user.userId,
                    isSynced: false,
                });

                await logHolidayHistory({
                    holidayId: holiday._id,
                    event: 'holiday_created',
                    reqUser: req.user,
                    actor,
                    details: { scope: holiday.scope, divisionMapping: holiday.divisionMapping },
                    comments: 'Holiday created (employee scope)',
                });
            } else {
                holiday = await Holiday.create({
                    name,
                    date,
                    endDate: endDate || null,
                    type,
                    isMaster,
                    scope,
                    applicableTo,
                    targetGroupIds: applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [],
                    groupId: scope === 'GROUP' ? groupId : undefined,
                    overridesMasterId,
                    description,
                    rosterApplyMode,
                    halfDayType,
                    multiShiftScope,
                    createdBy: req.user.userId,
                    isSynced: true,
                });

                await logHolidayHistory({
                    holidayId: holiday._id,
                    event: 'holiday_created',
                    reqUser: req.user,
                    actor,
                    details: { scope: holiday.scope, applicableTo: holiday.applicableTo, targetGroupIds: holiday.targetGroupIds, groupId: holiday.groupId },
                    comments: 'Holiday created',
                });

                // PROPAGATION: If Global Holiday Created -> Create Synced Copies for ALL or SPECIFIC Groups
                if (scope === 'GLOBAL') {
                    let groupFilter = { isActive: true };

                    // If targeting specific groups, filter by ID
                    if (applicableTo === 'SPECIFIC_GROUPS' && targetGroupIds && targetGroupIds.length > 0) {
                        groupFilter._id = { $in: targetGroupIds };
                    }

                    const targetedGroups = await HolidayGroup.find(groupFilter);

                    const copies = targetedGroups.map(group => ({
                        name,
                        date,
                        endDate: endDate || null,
                        type,
                        isMaster: false, // Copies are not "Master" definitions, they are instances
                        scope: 'GROUP',
                        groupId: group._id,
                        description,
                        rosterApplyMode,
                        halfDayType,
                        multiShiftScope,
                        createdBy: req.user.userId,
                        sourceHolidayId: holiday._id, // Link to Parent
                        isSynced: true // Synced by default
                    }));

                    if (copies.length > 0) {
                        await Holiday.insertMany(copies);
                    }
                }
            }
        }

        const effectiveScope = scope;
        const effectiveApplicableTo = applicableTo || 'ALL';
        const effectiveGroupId = scope === 'GROUP' ? groupId : undefined;
        const effectiveTargetGroupIds = effectiveApplicableTo === 'SPECIFIC_GROUPS' ? (targetGroupIds || []) : [];
        const effectiveDivisionMapping = scope === 'MAPPING' ? divisionMapping : [];
        const matchedEmployees = await resolveEmployeesForHolidayScope({
            scope: effectiveScope,
            groupId: effectiveGroupId,
            applicableTo: effectiveApplicableTo,
            targetGroupIds: effectiveTargetGroupIds,
            divisionMapping: effectiveDivisionMapping,
        });
        const holidayDates = getDateRangeStrings(date, endDate);
        const rosterEntries = await buildRosterEntriesForHoliday({
            employeeNumbers: matchedEmployees,
            dates: holidayDates,
            holidayName: name,
            holidayId: holiday._id,
            rosterFillMode: rosterFillMode || 'HOL',
            rosterApplyMode,
            halfDayType,
            multiShiftScope,
            guessShiftFromWeekdayPattern,
        });
        await applyRosterEntriesAndSync(rosterEntries, req.user.userId);

        res.status(200).json({
            success: true,
            data: holiday,
            affectedEmployees: matchedEmployees.length,
            ...(createdMessage ? { message: createdMessage } : {})
        });

    } catch (error) {
        const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 600
            ? error.statusCode
            : 500;
        res.status(status).json({
            success: false,
            message: error.message || 'Error saving holiday',
            error: error.message,
        });
    }
};

// @desc    Delete Holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Super Admin)
exports.deleteHoliday = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        const { onDeleteAction = 'RESTORE_PATTERN' } = req.body || {};
        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
        if (holiday.isActive === false) return res.status(200).json({ success: true, message: 'Holiday already deactivated' });

        try {
            assertCanManageHolidayRecord(actor, holiday);
        } catch (accessErr) {
            return res.status(accessErr.statusCode || 403).json({ success: false, message: accessErr.message });
        }

        const deleteDates = getDateRangeStrings(holiday.date, holiday.endDate);
        const employeeNumbers = await collectEmployeeNumbersForHolidayRosterCleanup(holiday, deleteDates);

        // If deactivating a Global Holiday -> deactivate it AND all synced copies
        if (holiday.scope === 'GLOBAL') {
            await Holiday.updateMany(
                { sourceHolidayId: holiday._id, isSynced: true },
                { $set: { isActive: false, deactivatedAt: new Date(), deactivatedBy: req.user.userId } }
            );

            // For copies that are NOT synced (overridden), detach them (clear sourceHolidayId)
            await Holiday.updateMany(
                { sourceHolidayId: holiday._id, isSynced: false },
                { $set: { sourceHolidayId: null } }
            );
        }

        // Soft delete this holiday record
        holiday.isActive = false;
        holiday.deactivatedAt = new Date();
        holiday.deactivatedBy = req.user.userId;
        await holiday.save();

        await logHolidayHistory({
            holidayId: holiday._id,
            event: 'holiday_deactivated',
            reqUser: req.user,
            actor,
            details: { onDeleteAction, scope: holiday.scope },
            comments: 'Holiday deactivated (soft delete)',
        });

        const rosterEntries = [];
        if (onDeleteAction === 'WEEK_OFF') {
            for (const empNo of employeeNumbers) {
                for (const day of deleteDates) {
                    rosterEntries.push({ employeeNumber: empNo, date: day, status: 'WO' });
                }
            }
        } else {
            for (const empNo of employeeNumbers) {
                for (const day of deleteDates) {
                    const shiftId = await guessShiftFromWeekdayPattern(empNo, day);
                    if (shiftId) {
                        rosterEntries.push({
                            employeeNumber: empNo,
                            date: day,
                            shiftId,
                            firstHalfStatus: null,
                            secondHalfStatus: null,
                            status: null,
                            holidaySegmentScope: null,
                            holidayHalfDayType: null,
                            sourceHolidayId: null,
                            notes: null,
                        });
                    } else {
                        rosterEntries.push({ employeeNumber: empNo, date: day, status: 'WO' });
                    }
                }
            }
        }
        await applyRosterEntriesAndSync(rosterEntries, req.user.userId);

        res.status(200).json({ success: true, message: 'Holiday deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting holiday', error: error.message });
    }
};

// @desc    Delete Holiday Group
// @route   DELETE /api/holidays/groups/:id
// @access  Private (Super Admin)
exports.deleteHolidayGroup = async (req, res) => {
    try {
        const group = await HolidayGroup.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

        // Check if used in holidays
        const associatedHolidays = await Holiday.countDocuments({ groupId: group._id });
        if (associatedHolidays > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete group: It has ${associatedHolidays} holidays associated with it. Delete the holidays first.`
            });
        }

        await group.deleteOne();

        res.status(200).json({ success: true, message: 'Holiday Group deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting group', error: error.message });
    }
};

// @desc    Preview how many employees a holiday scope would affect
// @route   POST /api/holidays/preview-impact
// @access  Private (Holiday write)
exports.previewHolidayImpact = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        const { scope, groupId, applicableTo, targetGroupIds, divisionMapping } = req.body || {};
        let effectiveScope = scope;
        let effectiveMapping = divisionMapping;
        let effectiveGroupId = groupId;
        let effectiveApplicableTo = applicableTo;
        let effectiveTargetGroupIds = targetGroupIds;

        if (!canManageGlobal(actor)) {
            if (scope === 'MAPPING' || (divisionMapping && divisionMapping.length > 0)) {
                effectiveScope = 'MAPPING';
                effectiveMapping = clampMappingToAllowed(
                    getHolidayDivisionMapping(actor),
                    divisionMapping || []
                );
                if (effectiveMapping.length === 0) {
                    return res.status(403).json({
                        success: false,
                        message: 'No valid employee scope within your assignment',
                    });
                }
            } else if (scope === 'GROUP' && groupId) {
                const managed = getManagedGroupIdStrings(actor);
                if (!managed.includes(String(groupId))) {
                    return res.status(403).json({ success: false, message: 'Group not in your scope' });
                }
            } else if (scope === 'GLOBAL') {
                effectiveScope = hasHolidayEmployeeScope(actor) ? 'MAPPING' : 'GLOBAL';
                if (effectiveScope === 'MAPPING') {
                    effectiveMapping = getHolidayDivisionMapping(actor);
                } else {
                    effectiveApplicableTo = 'SPECIFIC_GROUPS';
                    effectiveTargetGroupIds = getManagedGroupIdStrings(actor);
                }
            }
        }

        const empNos = await resolveEmployeesForHolidayScope({
            scope: effectiveScope,
            groupId: effectiveGroupId,
            applicableTo: effectiveApplicableTo,
            targetGroupIds: effectiveTargetGroupIds,
            divisionMapping: effectiveMapping,
        });

        res.status(200).json({
            success: true,
            data: {
                employeeCount: empNos.length,
                dayCount: 1,
                scope: effectiveScope,
                divisionMapping: effectiveScope === 'MAPPING' ? normalizeMappingList(effectiveMapping) : undefined,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error previewing holiday impact',
            error: error.message,
        });
    }
};

// @desc    Get holiday activity log (admin)
// @route   GET /api/holidays/:id/activity
// @access  Private (Super Admin, Sub Admin, HR)
exports.getHolidayActivity = async (req, res) => {
    try {
        const actor = await loadHolidayActor(req);
        const holidayId = req.params.id;
        const holiday = await Holiday.findById(holidayId).select('scope groupId isMaster divisionMapping');
        if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
        try {
            assertCanManageHolidayRecord(actor, holiday);
        } catch (accessErr) {
            return res.status(accessErr.statusCode || 403).json({ success: false, message: accessErr.message });
        }
        const limit = Math.min(Number(req.query.limit) || 80, 200);
        const rows = await HolidayHistory.find({ holidayId })
            .populate('performedBy', 'name email role')
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching holiday activity', error: error.message });
    }
};
