/**
 * Dynamic per–leave-type policy: maps merged into legacy carryForward + annualCLReset
 * (CL/EL/CCL) so existing jobs and register logic keep working.
 */

const LeavePolicySettings = require('../model/LeavePolicySettings');
const LeaveSettings = require('../../leaves/model/LeaveSettings');

function toPlain(doc) {
    if (!doc) return {};
    return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function safeObj(o) {
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
}

function deepMerge(a, b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
    const base = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
    const out = { ...base };
    for (const k of Object.keys(b)) {
        const v = b[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object) {
            out[k] = deepMerge(base[k] || {}, v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

const DEFAULT_CARRY_BY_CODE = {
    CL: {
        enabled: true,
        maxMonths: 12,
        expiryMonths: 12,
        carryForwardToNextYear: true,
        carryMonthlyClCreditToNextPayrollMonth: true,
    },
    EL: {
        enabled: true,
        maxMonths: 24,
        expiryMonths: 60,
        carryForwardToNextYear: true,
        carryMonthlyPoolToNextPayrollMonth: true,
    },
    CCL: {
        enabled: true,
        maxMonths: 6,
        expiryMonths: 6,
        carryForwardToNextYear: false,
        carryMonthlyPoolToNextPayrollMonth: true,
    },
    __default: {
        enabled: true,
        maxMonths: 12,
        expiryMonths: 12,
        carryForwardToNextYear: true,
    },
};

function defaultCarryForTypeCode(code) {
    const u = String(code || '').toUpperCase();
    if (u === 'CL' || u === 'EL' || u === 'CCL') {
        return { ...DEFAULT_CARRY_BY_CODE[u] };
    }
    return { ...DEFAULT_CARRY_BY_CODE.__default };
}

const DEFAULT_ANNUAL_NON_CL = {
    enabled: false,
    resetToBalance: 0,
    addCarryForward: true,
    maxCarryForwardCl: 0,
    usePayrollCycleForReset: false,
    resetMonth: 4,
    resetDay: 1,
    casualLeaveByExperience: [],
};

function defaultAnnualForTypeCode(code) {
    const u = String(code || '').toUpperCase();
    if (u === 'CL') {
        return {
            enabled: true,
            resetToBalance: 12,
            addCarryForward: true,
            maxCarryForwardCl: 12,
            usePayrollCycleForReset: false,
            resetMonth: 4,
            resetDay: 1,
            casualLeaveByExperience: [],
        };
    }
    return { ...DEFAULT_ANNUAL_NON_CL };
}

/**
 * Merges carryForwardByLeaveType + annualResetByLeaveType (CL) into legacy shapes for server code.
 * @param {import('mongoose').Document|object} doc
 * @returns {object} plain
 */
function toResolvedPolicyPlain(doc) {
    const p = toPlain(doc);
    const byCarry = safeObj(p.carryForwardByLeaveType);
    const byAnnual = safeObj(p.annualResetByLeaveType);

    p.carryForward = p.carryForward || {};
    p.carryForward.casualLeave = deepMerge(p.carryForward.casualLeave || {}, byCarry.CL || {});
    if (typeof p.carryForward.casualLeave !== 'object') p.carryForward.casualLeave = {};

    p.carryForward.earnedLeave = deepMerge(
        p.carryForward.earnedLeave || {},
        byCarry.EL || {}
    );
    p.carryForward.compensatoryOff = deepMerge(
        p.carryForward.compensatoryOff || {},
        byCarry.CCL || {}
    );

    p.annualCLReset = deepMerge(p.annualCLReset || {}, byAnnual.CL || {});

    return p;
}

async function getActiveLeaveTypeList() {
    const s = await LeaveSettings.getActiveSettings('leave');
    if (!s || !Array.isArray(s.types)) return [];
    return s.types
        .filter((t) => t && t.isActive !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
        .map((t) => ({
            code: String(t.code || '').toUpperCase(),
            name: t.name || t.code,
        }));
}

/**
 * @param {object} p plain policy
 * @param {Array<{code:string,name:string}>} [leaveTypes]
 * @returns {object}
 */
function enrichLeavePolicyForGet(p, leaveTypes = []) {
    const byCarry = { ...safeObj(p.carryForwardByLeaveType) };
    const byAnnual = { ...safeObj(p.annualResetByLeaveType) };
    for (const lt of leaveTypes) {
        const c = lt.code;
        if (!c) continue;
        if (!byCarry[c] || Object.keys(byCarry[c] || {}).length === 0) {
            if (c === 'CL' && p.carryForward?.casualLeave) {
                byCarry[c] = { ...p.carryForward.casualLeave };
            } else if (c === 'EL' && p.carryForward?.earnedLeave) {
                byCarry[c] = { ...p.carryForward.earnedLeave };
            } else if (c === 'CCL' && p.carryForward?.compensatoryOff) {
                byCarry[c] = { ...p.carryForward.compensatoryOff };
            } else {
                byCarry[c] = { ...defaultCarryForTypeCode(c) };
            }
        } else {
            byCarry[c] = { ...defaultCarryForTypeCode(c), ...byCarry[c] };
        }
        if (!byAnnual[c] || Object.keys(byAnnual[c] || {}).length === 0) {
            if (c === 'CL' && p.annualCLReset) {
                byAnnual[c] = {
                    enabled: p.annualCLReset.enabled,
                    resetToBalance: p.annualCLReset.resetToBalance,
                    addCarryForward: p.annualCLReset.addCarryForward,
                    maxCarryForwardCl: p.annualCLReset.maxCarryForwardCl,
                    usePayrollCycleForReset: p.annualCLReset.usePayrollCycleForReset,
                    resetMonth: p.annualCLReset.resetMonth,
                    resetDay: p.annualCLReset.resetDay,
                    casualLeaveByExperience: p.annualCLReset.casualLeaveByExperience || [],
                };
            } else {
                byAnnual[c] = { ...defaultAnnualForTypeCode(c) };
            }
        } else {
            byAnnual[c] = { ...defaultAnnualForTypeCode(c), ...byAnnual[c] };
        }
    }
    return {
        ...p,
        leaveTypes,
        carryForwardByLeaveType: byCarry,
        annualResetByLeaveType: byAnnual,
    };
}

/**
 * @param {object} body
 * @returns {object} cleaned payload for $set
 */
function prepareLeavePolicyUpdate(body) {
    const b = { ...body };
    if ('leaveTypes' in b) delete b.leaveTypes;
    if (b.monthlyLeaveApplicationCap && typeof b.monthlyLeaveApplicationCap === 'object') {
        const cap = { ...b.monthlyLeaveApplicationCap };
        const raw = cap.maxDaysByType;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const m = Object.create(null);
            for (const k of Object.keys(raw)) {
                const c = String(k).toUpperCase();
                if (!c) continue;
                m[c] = Math.max(0, Math.min(62, Number(raw[k]) || 0));
            }
            cap.maxDaysByType = m;
        }
        b.monthlyLeaveApplicationCap = cap;
    }
    b.carryForward = b.carryForward ? { ...b.carryForward } : {};
    if (b.carryForwardByLeaveType && typeof b.carryForwardByLeaveType === 'object') {
        if (b.carryForwardByLeaveType.CL) {
            b.carryForward.casualLeave = deepMerge(b.carryForward.casualLeave || {}, b.carryForwardByLeaveType.CL);
        }
        if (b.carryForwardByLeaveType.EL) {
            b.carryForward.earnedLeave = deepMerge(b.carryForward.earnedLeave || {}, b.carryForwardByLeaveType.EL);
        }
        if (b.carryForwardByLeaveType.CCL) {
            b.carryForward.compensatoryOff = deepMerge(
                b.carryForward.compensatoryOff || {},
                b.carryForwardByLeaveType.CCL
            );
        }
    }
    b.annualCLReset = b.annualCLReset ? { ...b.annualCLReset } : {};
    if (b.annualResetByLeaveType && typeof b.annualResetByLeaveType === 'object' && b.annualResetByLeaveType.CL) {
        b.annualCLReset = deepMerge(b.annualCLReset, b.annualResetByLeaveType.CL);
    }
    return b;
}

/**
 * @returns {Promise<object>}
 */
async function getLeavePolicyResolved() {
    const doc = await LeavePolicySettings.getSettings();
    return toResolvedPolicyPlain(doc);
}

module.exports = {
    toResolvedPolicyPlain,
    getActiveLeaveTypeList,
    enrichLeavePolicyForGet,
    prepareLeavePolicyUpdate,
    getLeavePolicyResolved,
    defaultCarryForTypeCode,
    defaultAnnualForTypeCode,
};
