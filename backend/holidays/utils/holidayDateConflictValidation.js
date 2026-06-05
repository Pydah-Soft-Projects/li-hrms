const Holiday = require('../model/Holiday');
const HolidayGroup = require('../model/HolidayGroup');
const {
    toHolidayDateString,
    parseHolidayCalendarDate,
    getHolidayDateRangeStrings,
} = require('./holidayCalendarDates');

function holidayDateRange(holiday) {
    const start = toHolidayDateString(holiday.date);
    const end = holiday.endDate ? toHolidayDateString(holiday.endDate) : start;
    return { start, end };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
}

function overlappingDates(requestDates, holiday) {
    const { start, end } = holidayDateRange(holiday);
    return requestDates.filter((d) => d >= start && d <= end);
}

function getGroupIdString(holiday) {
    if (!holiday?.groupId) return null;
    return typeof holiday.groupId === 'object' ? String(holiday.groupId._id) : String(holiday.groupId);
}

function getGroupName(holiday, groupNameById) {
    const gid = getGroupIdString(holiday);
    if (gid && groupNameById.has(gid)) return groupNameById.get(gid);
    if (typeof holiday.groupId === 'object' && holiday.groupId?.name) return holiday.groupId.name;
    return gid ? `Group ${gid}` : 'Unknown group';
}

function isGlobalMasterScope(scope, applicableTo, isBulkGroupCreate) {
    if (scope !== 'GLOBAL' || isBulkGroupCreate) return false;
    const mode = applicableTo || 'ALL';
    return mode === 'ALL';
}

function describeExistingHoliday(holiday) {
    if (holiday.scope === 'GLOBAL') return 'org-wide (Global)';
    if (holiday.scope === 'MAPPING') return 'employee scope';
    if (holiday.sourceHolidayId) return `synced copy for this group`;
    if (holiday.overridesMasterId) return `group override`;
    return 'group holiday';
}

/**
 * Resolve which holiday groups will receive a new/updated holiday entry.
 */
async function resolveTargetGroupIds({ scope, applicableTo, targetGroupIds, groupId, isBulkGroupCreate }) {
    if (scope === 'GROUP' && groupId) {
        return [String(groupId)];
    }
    if (scope === 'GLOBAL') {
        if (isBulkGroupCreate) {
            return (targetGroupIds || []).map((id) => String(id));
        }
        if (applicableTo === 'ALL') {
            const groups = await HolidayGroup.find({ isActive: true }).select('_id').lean();
            return groups.map((g) => String(g._id));
        }
        if (applicableTo === 'SPECIFIC_GROUPS' && targetGroupIds?.length) {
            return targetGroupIds.map((id) => String(id));
        }
    }
    return [];
}

/**
 * Find date conflicts before creating or updating a holiday.
 * Returns { ok: true } or { ok: false, message, conflicts }.
 */
async function validateHolidayDateConflicts({
    _id,
    date: rawDate,
    endDate: rawEndDate,
    scope,
    applicableTo,
    targetGroupIds,
    groupId,
    overridesMasterId,
    isBulkGroupCreate,
}) {
    const date = parseHolidayCalendarDate(rawDate);
    const endDate = rawEndDate ? parseHolidayCalendarDate(rawEndDate) : null;
    const effectiveApplicableTo = applicableTo || (scope === 'GLOBAL' ? 'ALL' : applicableTo);

    const requestDates = getHolidayDateRangeStrings(date, endDate);
    const rangeStart = requestDates[0];
    const rangeEnd = requestDates[requestDates.length - 1];

    const excludeIds = new Set();
    if (_id) excludeIds.add(String(_id));

    if (_id) {
        const syncedCopies = await Holiday.find({
            sourceHolidayId: _id,
            isActive: { $ne: false },
        })
            .select('_id')
            .lean();
        syncedCopies.forEach((h) => excludeIds.add(String(h._id)));
    }

    const allActive = await Holiday.find({ isActive: { $ne: false } })
        .select('name date endDate scope groupId sourceHolidayId overridesMasterId applicableTo isActive')
        .populate('groupId', 'name')
        .lean();

    const activeCandidates = allActive.filter((h) => {
        if (excludeIds.has(String(h._id))) return false;
        const { start, end } = holidayDateRange(h);
        return rangesOverlap(start, end, rangeStart, rangeEnd);
    });

    const groups = await HolidayGroup.find({ isActive: true }).select('_id name').lean();
    const groupNameById = new Map(groups.map((g) => [String(g._id), g.name]));

    const affectedGroupIds = await resolveTargetGroupIds({
        scope,
        applicableTo: effectiveApplicableTo,
        targetGroupIds,
        groupId,
        isBulkGroupCreate,
    });

    const conflicts = [];
    const conflictKeys = new Set();
    const isUpdate = !!_id;

    const addConflict = (entry) => {
        const key = `${entry.groupId || entry.scope}:${entry.date}:${entry.existingHolidayId}`;
        if (conflictKeys.has(key)) return;
        conflictKeys.add(key);
        conflicts.push(entry);
    };

    if (scope === 'MAPPING') {
        for (const existing of activeCandidates) {
            if (existing.scope !== 'MAPPING') continue;
            const dates = overlappingDates(requestDates, existing);
            for (const d of dates) {
                addConflict({
                    scope: 'MAPPING',
                    groupId: null,
                    groupName: 'Employee scope',
                    date: d,
                    existingHolidayName: existing.name,
                    existingHolidayId: String(existing._id),
                    existingKind: describeExistingHoliday(existing),
                });
            }
        }
    } else if (isGlobalMasterScope(scope, effectiveApplicableTo, isBulkGroupCreate)) {
        for (const existing of activeCandidates) {
            const dates = overlappingDates(requestDates, existing);
            if (dates.length === 0) continue;

            if (existing.scope === 'GLOBAL') {
                for (const d of dates) {
                    addConflict({
                        scope: 'GLOBAL',
                        groupId: null,
                        groupName: 'All employees (Global)',
                        date: d,
                        existingHolidayName: existing.name,
                        existingHolidayId: String(existing._id),
                        existingKind: describeExistingHoliday(existing),
                    });
                }
                continue;
            }

            if (!isUpdate && existing.scope === 'GROUP') {
                const gid = getGroupIdString(existing);
                for (const d of dates) {
                    addConflict({
                        scope: 'GROUP',
                        groupId: gid,
                        groupName: getGroupName(existing, groupNameById),
                        date: d,
                        existingHolidayName: existing.name,
                        existingHolidayId: String(existing._id),
                        existingKind: describeExistingHoliday(existing),
                    });
                }
            }
        }
    } else if (affectedGroupIds.length > 0) {
        const targetSet = new Set(affectedGroupIds.map(String));
        const overrideMasterId = overridesMasterId ? String(overridesMasterId) : null;
        const overrideGroupId = groupId ? String(groupId) : null;

        for (const gid of affectedGroupIds) {
            for (const existing of activeCandidates) {
                const dates = overlappingDates(requestDates, existing);
                if (dates.length === 0) continue;

                if (existing.scope === 'GLOBAL') {
                    if (isUpdate && scope === 'GROUP') {
                        continue;
                    }
                    if (
                        overrideMasterId
                        && overrideGroupId
                        && gid === overrideGroupId
                        && String(existing._id) === overrideMasterId
                    ) {
                        continue;
                    }
                    for (const d of dates) {
                        addConflict({
                            scope: 'GLOBAL',
                            groupId: gid,
                            groupName: groupNameById.get(gid) || `Group ${gid}`,
                            date: d,
                            existingHolidayName: existing.name,
                            existingHolidayId: String(existing._id),
                            existingKind: 'org-wide (Global) — applies to this group',
                        });
                    }
                    continue;
                }

                if (existing.scope !== 'GROUP') continue;

                const existingGid = getGroupIdString(existing);
                if (!existingGid || !targetSet.has(existingGid)) continue;

                if (
                    overrideMasterId
                    && overrideGroupId
                    && existingGid === overrideGroupId
                    && String(existing.sourceHolidayId || '') === overrideMasterId
                ) {
                    continue;
                }

                for (const d of dates) {
                    addConflict({
                        scope: 'GROUP',
                        groupId: existingGid,
                        groupName: getGroupName(existing, groupNameById),
                        date: d,
                        existingHolidayName: existing.name,
                        existingHolidayId: String(existing._id),
                        existingKind: describeExistingHoliday(existing),
                    });
                }
            }
        }
    }

    if (conflicts.length === 0) {
        return { ok: true };
    }

    const dateLabel =
        requestDates.length === 1
            ? requestDates[0]
            : `${rangeStart} to ${rangeEnd}`;

    const groupOnlyConflicts = conflicts.filter((c) => c.scope === 'GROUP');
    const isGlobalCreateBlockedByGroups =
        isGlobalMasterScope(scope, effectiveApplicableTo, isBulkGroupCreate)
        && !isUpdate
        && groupOnlyConflicts.length > 0;

    const lines = conflicts.map((c) => {
        const who = c.groupName || 'Employee scope';
        return `• ${who} — ${c.date}: "${c.existingHolidayName}" (${c.existingKind})`;
    });

    const message = isGlobalCreateBlockedByGroups
        ? [
            `Cannot create org-wide global holiday on ${dateLabel} (IST) — these holiday groups already have an event on this date (they are included in global scope):`,
            ...lines,
            'Remove or reschedule the group holiday first, or edit the existing group event instead of creating a global duplicate.',
        ].join('\n')
        : [
            `A holiday already exists on the selected date(s) (${dateLabel}, IST).`,
            'The following groups or scopes are affected:',
            ...lines,
            'Update the existing holiday or choose different date(s).',
        ].join('\n');

    const err = new Error(message);
    err.statusCode = 409;
    err.conflicts = conflicts;
    return { ok: false, message, conflicts, error: err };
}

module.exports = {
    validateHolidayDateConflicts,
    getHolidayDateRangeStrings,
    toHolidayDateString,
    parseHolidayCalendarDate,
    // Back-compat aliases
    getDateRangeStrings: getHolidayDateRangeStrings,
    toDateString: toHolidayDateString,
};
