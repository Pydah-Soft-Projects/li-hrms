const StatutoryDeductionConfig = require('../model/StatutoryDeductionConfig');

/**
 * Calculate statutory deductions for an employee for a month.
 * Only employee share is deducted from salary; employer share is for reporting.
 * Respects employee-level flags: applyESI, applyPF, applyProfessionTax (default true = apply).
 * When paidDays and totalDaysInMonth are provided, amounts are prorated by (paidDays / totalDaysInMonth).
 * @param {Object} params
 * @param {number} params.basicPay - Basic pay (full month)
 * @param {number} params.grossSalary - Gross salary (after allowances) - used for ESI
 * @param {number} params.earnedSalary - Earned salary (prorated) - optional for proration
 * @param {number} [params.dearnessAllowance=0] - DA if PF base is basic_da
 * @param {Object} [params.employee] - Employee doc; if applyESI/applyPF/applyProfessionTax are false, that deduction is skipped (amount 0).
 * @param {number} [params.paidDays] - Paid days in the month (for proration). When set with totalDaysInMonth, statutory is prorated.
 * @param {number} [params.totalDaysInMonth] - Total days in month (pay cycle). When set with paidDays, statutory is prorated.
 * @returns {Promise<{ breakdown: Array<{ name, code, employeeAmount, employerAmount }>, totalEmployeeShare, totalEmployerShare }>}
 */
async function calculateStatutoryDeductions({ basicPay = 0, grossSalary = 0, earnedSalary = 0, dearnessAllowance = 0, employee = null, paidDays = null, totalDaysInMonth = null }) {
  const config = await StatutoryDeductionConfig.get();
  const breakdown = [];
  let totalEmployeeShare = 0;
  let totalEmployerShare = 0;
  const applyESI = employee == null || (employee && employee.applyESI !== false);
  const applyPF = employee == null || (employee && employee.applyPF !== false);
  const applyPT = employee == null || (employee && employee.applyProfessionTax !== false);

  const prorate = (amount) => {
    if (amount == null || amount === 0) return amount;
    if (typeof paidDays === 'number' && typeof totalDaysInMonth === 'number' && totalDaysInMonth > 0 && paidDays >= 0) {
      const ratio = Math.min(1, Math.max(0, paidDays / totalDaysInMonth));
      return Math.round(amount * ratio * 100) / 100;
    }
    return amount;
  };

  // ESI: calculated on (wageBasePercentOfBasic % of basic). When enabled, wage ceiling applies: applicable when basic ≤ ceiling (0 = no ceiling).
  if (applyESI && config.esi && config.esi.enabled) {
    const basic = Number(basicPay) || 0;
    const wageBasePct = Math.min(100, Math.max(0, config.esi.wageBasePercentOfBasic ?? 50));
    const wageCeiling = config.esi.wageCeiling || 0;
    const empPct = config.esi.employeePercent ?? 0.75;
    const emprPct = config.esi.employerPercent ?? 3.25;
    const esiWage = basic * (wageBasePct / 100);
    const applicable = basic > 0 && (wageCeiling <= 0 || basic <= wageCeiling);
    if (applicable) {
      const empAmount = prorate(Math.round((esiWage * empPct / 100) * 100) / 100);
      const emprAmount = prorate(Math.round((esiWage * emprPct / 100) * 100) / 100);
      totalEmployeeShare += empAmount;
      totalEmployerShare += emprAmount;
      breakdown.push({
        name: 'ESI',
        code: 'ESI',
        employeeAmount: empAmount,
        employerAmount: emprAmount,
      });
    }
  }

  // PF: on Basic (or Basic + DA). Upper limit (wage ceiling): if salary ≥ ceiling, calculate on ceiling amount; else calculate on full basic. So contribution base = min(basic or basic+DA, wageCeiling).
  if (applyPF && config.pf && config.pf.enabled) {
    const base = (config.pf.base === 'basic_da') ? (Number(basicPay) || 0) + (Number(dearnessAllowance) || 0) : (Number(basicPay) || 0);
    const wageCeiling = config.pf.wageCeiling || 15000;
    const empPct = config.pf.employeePercent ?? 12;
    const emprPct = config.pf.employerPercent ?? 12;
    const contributionBase = base > 0 ? Math.min(base, wageCeiling) : 0;
    if (contributionBase > 0) {
      const empAmount = prorate(Math.round((contributionBase * empPct / 100) * 100) / 100);
      const emprAmount = prorate(Math.round((contributionBase * emprPct / 100) * 100) / 100);
      totalEmployeeShare += empAmount;
      totalEmployerShare += emprAmount;
      breakdown.push({
        name: 'PF',
        code: 'PF',
        employeeAmount: empAmount,
        employerAmount: emprAmount,
      });
    }
  }

  // Profession Tax: employee only; slab-based on basic pay (slab where basicPay falls → amount)
  if (applyPT && config.professionTax && config.professionTax.enabled && Array.isArray(config.professionTax.slabs) && config.professionTax.slabs.length > 0) {
    const basic = Number(basicPay) || 0;
    const sorted = [...config.professionTax.slabs].filter(s => s && typeof s.min === 'number').sort((a, b) => a.min - b.min);
    let amount = 0;
    for (const slab of sorted) {
      const max = slab.max == null || slab.max === undefined ? 1e9 : Number(slab.max);
      if (basic >= Number(slab.min) && basic <= max) {
        amount = Number(slab.amount) || 0;
        break;
      }
    }
    amount = prorate(amount);
    totalEmployeeShare += amount;
    breakdown.push({
      name: 'Profession Tax',
      code: 'PT',
      employeeAmount: amount,
      employerAmount: 0,
    });
  }

  return {
    breakdown,
    totalEmployeeShare,
    totalEmployerShare,
  };
}

module.exports = {
  calculateStatutoryDeductions,
};
