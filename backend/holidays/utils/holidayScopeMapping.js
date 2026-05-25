/**
 * Division/department/employee-group mapping helpers for holiday employee scope.
 * Mirrors HolidayGroup.divisionMapping semantics.
 */

function toId(value) {
    if (!value) return '';
    return (value._id || value).toString();
}

function toIdList(arr) {
    return (arr || []).map(toId).filter(Boolean);
}

function normalizeMappingRow(row) {
    if (!row?.division) return null;
    return {
        division: toId(row.division),
        departments: toIdList(row.departments),
        employeeGroups: toIdList(row.employeeGroups),
    };
}

function normalizeMappingList(rows) {
    return (rows || [])
        .map(normalizeMappingRow)
        .filter(Boolean);
}

/** Empty departments = all departments in division; empty employeeGroups = all groups. */
function isSubsetList(requested, allowed) {
    const req = toIdList(requested);
    const allow = toIdList(allowed);
    if (req.length === 0) {
        return allow.length === 0;
    }
    if (allow.length === 0) return true;
    return req.every((id) => allow.includes(id));
}

function isMappingRowSubset(requested, allowed) {
    if (!requested?.division || !allowed?.division) return false;
    if (toId(requested.division) !== toId(allowed.division)) return false;
    if (!isSubsetList(requested.departments, allowed.departments)) return false;
    if (!isSubsetList(requested.employeeGroups, allowed.employeeGroups)) return false;
    return true;
}

function isMappingListSubset(requestedRows, allowedRows) {
    const requested = normalizeMappingList(requestedRows);
    const allowed = normalizeMappingList(allowedRows);
    if (requested.length === 0) return false;
    if (allowed.length === 0) return false;
    return requested.every((reqRow) =>
        allowed.some((allowRow) => isMappingRowSubset(reqRow, allowRow))
    );
}

function intersectMappingRow(requested, allowed) {
    if (!isMappingRowSubset(requested, allowed)) return null;
    const req = normalizeMappingRow(requested);
    const allow = normalizeMappingRow(allowed);
    const departments =
        req.departments.length === 0
            ? [...allow.departments]
            : req.departments.filter((id) => allow.departments.length === 0 || allow.departments.includes(id));
    const employeeGroups =
        req.employeeGroups.length === 0
            ? [...allow.employeeGroups]
            : req.employeeGroups.filter((id) => allow.employeeGroups.length === 0 || allow.employeeGroups.includes(id));
    return {
        division: req.division,
        departments: departments.length === 0 && req.departments.length === 0 ? [] : departments,
        employeeGroups: employeeGroups.length === 0 && req.employeeGroups.length === 0 ? [] : employeeGroups,
    };
}

/**
 * Clamp requested mapping rows to the user's allowed holiday scope.
 * If requested is empty, returns a copy of the full allowed scope.
 */
function clampMappingToAllowed(allowedRows, requestedRows) {
    const allowed = normalizeMappingList(allowedRows);
    if (allowed.length === 0) return [];
    const requested = normalizeMappingList(requestedRows);
    if (requested.length === 0) {
        return allowed.map((row) => ({
            division: row.division,
            departments: [...row.departments],
            employeeGroups: [...row.employeeGroups],
        }));
    }
    const out = [];
    for (const reqRow of requested) {
        const match = allowed.find((a) => toId(a.division) === reqRow.division);
        if (!match) continue;
        const clamped = intersectMappingRow(reqRow, match);
        if (clamped) out.push(clamped);
    }
    return out;
}

function mappingToEmployeeOrConditions(mappingRows) {
    return normalizeMappingList(mappingRows).map((m) => ({
        division_id: m.division,
        ...(m.departments.length > 0 ? { department_id: { $in: m.departments } } : {}),
        ...(m.employeeGroups.length > 0 ? { employee_group_id: { $in: m.employeeGroups } } : {}),
    }));
}

function employeeMatchesMappingRow(employee, row) {
    const empDiv = toId(employee.division_id);
    const empDept = toId(employee.department_id);
    const empGrp = toId(employee.employee_group_id);
    const m = normalizeMappingRow(row);
    if (!m || empDiv !== m.division) return false;
    if (m.departments.length > 0 && !m.departments.includes(empDept)) return false;
    if (m.employeeGroups.length > 0 && !m.employeeGroups.includes(empGrp)) return false;
    return true;
}

function employeeMatchesMappingList(employee, mappingRows) {
    const rows = normalizeMappingList(mappingRows);
    if (rows.length === 0) return false;
    return rows.some((row) => employeeMatchesMappingRow(employee, row));
}

function mappingsOverlap(aRows, bRows) {
    const a = normalizeMappingList(aRows);
    const b = normalizeMappingList(bRows);
    if (!a.length || !b.length) return false;
    return a.some((aRow) => b.some((bRow) => {
        if (toId(aRow.division) !== toId(bRow.division)) return false;
        const deptOverlap =
            aRow.departments.length === 0 || bRow.departments.length === 0
                ? true
                : aRow.departments.some((d) => bRow.departments.includes(d));
        if (!deptOverlap) return false;
        const grpOverlap =
            aRow.employeeGroups.length === 0 || bRow.employeeGroups.length === 0
                ? true
                : aRow.employeeGroups.some((g) => bRow.employeeGroups.includes(g));
        return grpOverlap;
    }));
}

module.exports = {
    normalizeMappingList,
    isMappingListSubset,
    clampMappingToAllowed,
    mappingToEmployeeOrConditions,
    employeeMatchesMappingList,
    mappingsOverlap,
    toId,
};
