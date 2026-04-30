/**
 * Reconcile OD-linked AttendanceDaily dates by department + payroll month.
 *
 * Why:
 * - Older UTC-vs-IST OD date writes can place OD linkage on previous day.
 * - That can miss week-off/holiday contribution and skip expected CCL credit.
 *
 * Features:
 * - List departments for selection
 * - Filter by department and payroll month (YYYY-MM payroll summary key)
 * - Dry-run by default; --apply to write
 * - Optional --recalc to run recalculateOnAttendanceUpdate on touched dates
 *
 * Usage:
 *   node scripts/reconcile_od_dates_by_department.js --list-departments
 *   node scripts/reconcile_od_dates_by_department.js --month 2026-04 --department "Maintenance-Technical"
 *   node scripts/reconcile_od_dates_by_department.js --month 2026-04 --department-id <deptId> --apply --recalc
 */

const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Department');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const OD = require('../leaves/model/OD');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const { isHolidayOrWeekOff } = require('../leaves/services/odHolidayApplyContextService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');

const APPLY = process.argv.includes('--apply');
const RECALC = process.argv.includes('--recalc');
const LIST_DEPARTMENTS = process.argv.includes('--list-departments');
const QUIET = process.argv.includes('--quiet');

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !String(process.argv[i + 1]).startsWith('--')) return process.argv[i + 1];
  return null;
}

function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

async function recalcForEmpDates(empNo, dateSet) {
  if (!RECALC || !APPLY || !dateSet || dateSet.size === 0) return;
  const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
  for (const dateStr of [...dateSet].sort()) {
    try {
      await recalculateOnAttendanceUpdate(empNo, dateStr);
    } catch (e) {
      console.error(`[recalc] failed emp=${empNo} date=${dateStr}:`, e.message || e);
    }
  }
}

async function resolveDepartment() {
  const depIdArg = getArg('--department-id');
  const depNameArg = getArg('--department');

  if (!depIdArg && !depNameArg) return null;
  if (depIdArg) {
    const dep = await Department.findById(depIdArg).select('_id name').lean();
    if (!dep) throw new Error(`Department not found for --department-id ${depIdArg}`);
    return dep;
  }

  const needle = normalize(depNameArg);
  const all = await Department.find({}).select('_id name').sort({ name: 1 }).lean();
  const matches = all.filter((d) => normalize(d.name).includes(needle));
  if (matches.length === 0) throw new Error(`No department matches --department "${depNameArg}"`);
  if (matches.length > 1) {
    throw new Error(
      `Multiple departments matched "${depNameArg}". Use --department-id. Matches: ${matches
        .map((m) => `${m.name} (${m._id})`)
        .join(', ')}`
    );
  }
  return matches[0];
}

async function askInteractiveInputs() {
  const rl = readline.createInterface({ input, output });
  try {
    const all = await Department.find({}).select('_id name').sort({ name: 1 }).lean();
    console.log('\nAvailable departments:');
    console.table(all.map((d) => ({ id: String(d._id), name: d.name })));

    const deptIdInput = String(await rl.question('Enter department id or index: '))
      .trim();
    if (!deptIdInput) {
      throw new Error('Department id is required.');
    }
    let dep = null;
    if (/^\d+$/.test(deptIdInput)) {
      const idx = Number(deptIdInput);
      if (idx >= 0 && idx < all.length) {
        dep = all[idx];
      }
    }
    if (!dep) {
      dep = await Department.findById(deptIdInput).select('_id name').lean();
    }
    if (!dep) {
      throw new Error(`No department found for id/index ${deptIdInput}`);
    }

    const monthInput = String(await rl.question('Enter month (YYYY-MM) [default: 2026-04]: '))
      .trim();
    const month = monthInput || '2026-04';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error('Invalid month format. Use YYYY-MM');
    }
    return { department: dep, monthArg: month };
  } finally {
    rl.close();
  }
}

async function listDepartments() {
  const rows = await Department.find({}).select('_id name').sort({ name: 1 }).lean();
  console.table(rows.map((d) => ({ id: String(d._id), name: d.name })));
}

async function monthToPayrollWindow(monthStr) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthStr || ''))) {
    throw new Error('Invalid --month. Use YYYY-MM, e.g. 2026-04');
  }
  const [year, month] = monthStr.split('-').map(Number);
  const periodInfo = await dateCycleService.getPeriodInfo(createISTDate(`${monthStr}-15`));
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
  return { year, month, startDateStr, endDateStr };
}

async function hasCclCreditForOdDay(employeeId, dateStr) {
  const dayStart = createISTDate(dateStr, '00:00');
  const dayEnd = createISTDate(dateStr, '23:59');
  const row = await LeaveRegisterYear.findOne({
    employeeId,
    months: {
      $elemMatch: {
        transactions: {
          $elemMatch: {
            leaveType: 'CCL',
            transactionType: 'CREDIT',
            autoGeneratedType: 'OD_HOLIDAY_WO_CO_CREDIT',
            startDate: { $gte: dayStart, $lte: dayEnd },
          },
        },
      },
    },
  })
    .select('_id')
    .lean();
  return !!row;
}

function buildOdDetails(od) {
  return {
    odStartTime: od.odStartTime || null,
    odEndTime: od.odEndTime || null,
    durationHours: od.durationHours ?? null,
    odType: od.odType_extended || (od.isHalfDay ? 'half_day' : 'full_day'),
    odId: od._id,
  };
}

async function dayQualifiesForCo(od, empNo, dateStr) {
  if (await isHolidayOrWeekOff(empNo, dateStr)) return true;
  const raw = String(empNo || '').trim();
  const variants = [...new Set([raw.toUpperCase(), raw].filter(Boolean))];
  const att = await AttendanceDaily.findOne({
    date: dateStr,
    employeeNumber: variants.length ? { $in: variants } : raw.toUpperCase(),
  })
    .select('status')
    .lean();
  const st = String(att?.status || '').toUpperCase();
  if (st === 'HOLIDAY' || st === 'WEEK_OFF') return true;
  const fromStr = extractISTComponents(od.fromDate).dateStr;
  if (od.isCOEligible === true && dateStr === fromStr) return true;
  return false;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  if (LIST_DEPARTMENTS) {
    await listDepartments();
    await mongoose.disconnect();
    return;
  }

  let monthArg = getArg('--month');
  let department = await resolveDepartment();

  if (!monthArg || !department) {
    const interactive = await askInteractiveInputs();
    monthArg = monthArg || interactive.monthArg;
    department = department || interactive.department;
  }

  const window = await monthToPayrollWindow(monthArg);
  const empsArg = getArg('--emps');
  const scopedEmpNos = empsArg
    ? empsArg
        .split(/[,;]\s*|\s+/)
        .map((e) => String(e || '').trim().toUpperCase())
        .filter(Boolean)
    : null;
  const employees = await Employee.find({ department_id: department._id })
    .select('_id emp_no employee_name')
    .lean();
  let empNos = employees.map((e) => String(e.emp_no || '').toUpperCase()).filter(Boolean);
  if (scopedEmpNos && scopedEmpNos.length) {
    const scope = new Set(scopedEmpNos);
    empNos = empNos.filter((e) => scope.has(e));
  }

  if (empNos.length === 0) {
    console.log(`No employees found in department "${department.name}"`);
    await mongoose.disconnect();
    return;
  }

  const modeText = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`Mode: ${modeText}${RECALC ? ' (+recalc requested)' : ''}`);
  console.log(
    JSON.stringify(
      {
        month: monthArg,
        payroll_window: `${window.startDateStr}..${window.endDateStr}`,
        department: { id: String(department._id), name: department.name },
        employees_in_department: empNos.length,
      },
      null,
      2
    )
  );

  const rows = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: window.startDateStr, $lte: window.endDateStr },
    'odDetails.odId': { $exists: true, $ne: null },
  })
    .select('_id employeeNumber date odDetails odHours status')
    .lean();

  const byEmpTouchedDates = new Map();
  let checked = 0;
  let alreadyCorrect = 0;
  let mismatch = 0;
  let moved = 0;
  let merged = 0;
  let skipped = 0;
  let missingOd = 0;
  let outsideRange = 0;
  let odApprovedCount = 0;
  let odExpectedDayChecks = 0;
  let odMissingCorrectLink = 0;
  let odAutoRepairedById = 0;
  let cclExpectedHolidayWo = 0;
  let cclMissingCredit = 0;
  let cclCreditedNow = 0;

  for (const row of rows) {
    checked += 1;
    const empNo = String(row.employeeNumber || '').toUpperCase();
    const odId = row.odDetails?.odId;
    if (!odId) {
      skipped += 1;
      continue;
    }

    const od = await OD.findById(odId).select('_id fromDate toDate status').lean();
    if (!od || !od.fromDate || !od.toDate) {
      missingOd += 1;
      if (!QUIET) console.log(`[skip] missing/invalid OD for daily=${row._id} odId=${odId}`);
      continue;
    }

    const fromS = extractISTComponents(od.fromDate).dateStr;
    const toS = extractISTComponents(od.toDate).dateStr;
    const odIstDays = getAllDatesInRange(fromS, toS);
    if (!odIstDays.includes(row.date)) mismatch += 1;

    // We auto-fix only when OD is single IST day (safe deterministic fix).
    if (odIstDays.length !== 1) {
      outsideRange += 1;
      if (!QUIET && !odIstDays.includes(row.date)) {
        console.log(`[review] multi-day OD daily=${row._id} emp=${empNo} date=${row.date} odRange=${odIstDays.join(',')}`);
      }
      continue;
    }

    const correctDate = odIstDays[0];
    if (row.date === correctDate) {
      alreadyCorrect += 1;
      continue;
    }

    const target = await AttendanceDaily.findOne({ employeeNumber: empNo, date: correctDate });
    if (!target) {
      if (!APPLY) {
        moved += 1;
        if (!QUIET) console.log(`[dry-run] move daily=${row._id} ${row.date} -> ${correctDate} emp=${empNo}`);
      } else {
        const src = await AttendanceDaily.findById(row._id);
        src.set('date', correctDate);
        await src.save();
        moved += 1;
        if (!QUIET) console.log(`[apply] moved daily=${row._id} ${row.date} -> ${correctDate} emp=${empNo}`);
      }
    } else {
      if (!APPLY) {
        merged += 1;
        if (!QUIET) console.log(`[dry-run] merge OD from daily=${row._id} ${row.date} -> existing ${correctDate} emp=${empNo}`);
      } else {
        const src = await AttendanceDaily.findById(row._id);
        const tgt = await AttendanceDaily.findById(target._id);
        const totalOd = (Number(tgt.odHours) || 0) + (Number(src.odHours) || 0);
        if (!tgt.odDetails && src.odDetails) tgt.odDetails = src.odDetails;
        else if (src.odDetails) tgt.set('odDetails', { ...(tgt.odDetails || {}), ...src.odDetails });
        tgt.set('odHours', Math.round(totalOd * 100) / 100);
        tgt.markModified('odDetails');
        await tgt.save();

        src.set('odHours', 0);
        src.set('odDetails', null);
        await src.save();
        merged += 1;
        if (!QUIET) console.log(`[apply] merged OD daily=${row._id} -> ${target._id} emp=${empNo} date=${correctDate}`);
      }
    }

    if (!byEmpTouchedDates.has(empNo)) byEmpTouchedDates.set(empNo, new Set());
    byEmpTouchedDates.get(empNo).add(row.date);
    byEmpTouchedDates.get(empNo).add(correctDate);
  }

  // OD-first IST validation (catches missing/wrong-linked day even when row isn't in the current day query shape)
  const odDocs = await OD.find({
    department_id: department._id,
    emp_no: { $in: empNos },
    status: 'approved',
    isActive: true,
    fromDate: { $lte: createISTDate(window.endDateStr, '23:59') },
    toDate: { $gte: createISTDate(window.startDateStr, '00:00') },
  })
    .select('_id employeeId emp_no fromDate toDate odType_extended isHalfDay halfDayType durationHours odStartTime odEndTime')
    .lean();

  odApprovedCount = odDocs.length;
  for (const od of odDocs) {
    const empNo = String(od.emp_no || '').toUpperCase();
    if (!empNo) continue;
    const empNoVariants = [...new Set([empNo, String(od.emp_no || '').trim()].filter(Boolean))];
    const fromS = extractISTComponents(od.fromDate).dateStr;
    const toS = extractISTComponents(od.toDate).dateStr;
    const odDays = getAllDatesInRange(fromS, toS).filter(
      (d) => d >= window.startDateStr && d <= window.endDateStr
    );

    for (const day of odDays) {
      odExpectedDayChecks += 1;
      const correctDaily = await AttendanceDaily.findOne({
        employeeNumber: { $in: empNoVariants },
        date: day,
      })
        .select('_id employeeNumber date status odDetails odHours')
        .lean();
      const hasExactOnCorrectDay =
        !!correctDaily?.odDetails?.odId && String(correctDaily.odDetails.odId) === String(od._id);

      if (!hasExactOnCorrectDay) {
        odMissingCorrectLink += 1;
        const anyLinked = await AttendanceDaily.find({
          employeeNumber: { $in: empNoVariants },
          'odDetails.odId': od._id,
        })
          .select('_id date odDetails odHours')
          .sort({ date: 1 })
          .lean();

        if (correctDaily) {
          if (!APPLY) {
            odAutoRepairedById += 1;
            if (!QUIET) {
              console.log(
                `[dry-run][OD-first] attach missing odId=${od._id} on correct day ${day} emp=${empNo} daily=${correctDaily._id}`
              );
            }
          } else {
            const d = await AttendanceDaily.findById(correctDaily._id);
            d.set('odDetails', { ...(d.odDetails || {}), ...buildOdDetails(od) });
            if (String(od.odType_extended || '').toLowerCase() === 'hours') {
              d.set('odHours', Number(od.durationHours) || 0);
            }
            d.markModified('odDetails');
            await d.save();
            odAutoRepairedById += 1;
            if (!QUIET) console.log(`[apply][OD-first] attached odId on daily ${d._id} ${day} emp=${empNo}`);
            if (!byEmpTouchedDates.has(empNo)) byEmpTouchedDates.set(empNo, new Set());
            byEmpTouchedDates.get(empNo).add(day);
          }
        } else {
          const singleDayOd = getAllDatesInRange(fromS, toS).length === 1;
          if (singleDayOd && anyLinked.length === 1) {
          const src = anyLinked[0];
          const target = await AttendanceDaily.findOne({ employeeNumber: { $in: empNoVariants }, date: day });
          if (!APPLY) {
            odAutoRepairedById += 1;
            if (!QUIET) {
              console.log(
                `[dry-run][OD-first] relink odId=${od._id} emp=${empNo} ${src.date} -> ${day}`
              );
            }
          } else if (!target) {
            const sourceDoc = await AttendanceDaily.findById(src._id);
            sourceDoc.set('date', day);
            await sourceDoc.save();
            odAutoRepairedById += 1;
            if (!QUIET) console.log(`[apply][OD-first] moved daily ${src._id} ${src.date} -> ${day}`);
            if (!byEmpTouchedDates.has(empNo)) byEmpTouchedDates.set(empNo, new Set());
            byEmpTouchedDates.get(empNo).add(src.date);
            byEmpTouchedDates.get(empNo).add(day);
          } else {
            const sourceDoc = await AttendanceDaily.findById(src._id);
            const targetDoc = await AttendanceDaily.findById(target._id);
            const totalOd = (Number(targetDoc.odHours) || 0) + (Number(sourceDoc.odHours) || 0);
            if (!targetDoc.odDetails && sourceDoc.odDetails) targetDoc.odDetails = sourceDoc.odDetails;
            else if (sourceDoc.odDetails) {
              targetDoc.set('odDetails', { ...(targetDoc.odDetails || {}), ...sourceDoc.odDetails });
            }
            targetDoc.set('odHours', Math.round(totalOd * 100) / 100);
            targetDoc.markModified('odDetails');
            await targetDoc.save();
            sourceDoc.set('odHours', 0);
            sourceDoc.set('odDetails', null);
            await sourceDoc.save();
            odAutoRepairedById += 1;
            if (!QUIET) console.log(`[apply][OD-first] merged daily ${src._id} into ${target._id} for ${day}`);
            if (!byEmpTouchedDates.has(empNo)) byEmpTouchedDates.set(empNo, new Set());
            byEmpTouchedDates.get(empNo).add(src.date);
            byEmpTouchedDates.get(empNo).add(day);
          }
        } else if (APPLY && anyLinked.length === 0) {
          // Legacy hole: OD exists but linked daily not present on correct day.
          const created = await AttendanceDaily.findOneAndUpdate(
            { employeeNumber: empNoVariants[0], date: day },
            {
              $setOnInsert: { employeeNumber: empNo, date: day, shifts: [] },
              $set: {
                odHours:
                  String(od.odType_extended || '').toLowerCase() === 'hours'
                    ? Number(od.durationHours) || 0
                    : 0,
                odDetails: buildOdDetails(od),
              },
            },
            { upsert: true, new: true }
          );
          odAutoRepairedById += 1;
          if (!QUIET) console.log(`[apply][OD-first] ensured OD-linked daily ${created._id} on ${day}`);
          if (!byEmpTouchedDates.has(empNo)) byEmpTouchedDates.set(empNo, new Set());
          byEmpTouchedDates.get(empNo).add(day);
        } else if (!QUIET) {
          console.log(
            `[review][OD-first] missing correct-day link odId=${od._id} emp=${empNo} day=${day} linkedRows=${anyLinked.length}`
          );
          }
        }
      }

      const qualifies = await dayQualifiesForCo(od, empNo, day);
      if (qualifies) {
        cclExpectedHolidayWo += 1;
        const credited = await hasCclCreditForOdDay(od.employeeId, day);
        if (!credited) {
          cclMissingCredit += 1;
          if (APPLY) {
            try {
              const emp = await Employee.findById(od.employeeId)
                .select('_id emp_no employee_name doj is_active division_id department_id designation_id')
                .populate('department_id', 'name')
                .populate('designation_id', 'name')
                .lean();
              if (emp) {
                const increment = od.isHalfDay || od.odType_extended === 'half_day' ? 0.5 : 1;
                await leaveRegisterService.addTransaction({
                  employeeId: emp._id,
                  empNo: emp.emp_no,
                  employeeName: emp.employee_name || 'N/A',
                  designation: emp.designation_id?.name || 'N/A',
                  department: emp.department_id?.name || 'N/A',
                  divisionId: emp.division_id,
                  departmentId: emp.department_id?._id || emp.department_id,
                  dateOfJoining: emp.doj || new Date(),
                  employmentStatus: emp.is_active ? 'active' : 'inactive',
                  leaveType: 'CCL',
                  transactionType: 'CREDIT',
                  startDate: createISTDate(day),
                  endDate: createISTDate(day),
                  days: increment,
                  reason: `Compensatory Off for approved OD on holiday/week-off (${day})`,
                  status: 'APPROVED',
                  autoGenerated: true,
                  autoGeneratedType: 'OD_HOLIDAY_WO_CO_CREDIT',
                  applicationDate: new Date(),
                  approvalDate: new Date(),
                  approvedBy: null,
                  includedInPayroll: false,
                  operationLabel: 'OD_CO_REPAIR',
                });
                cclCreditedNow += 1;
                if (!QUIET) console.log(`[apply][CCL] credited ${increment} CCL emp=${empNo} day=${day}`);
              }
            } catch (e) {
              if (!QUIET) console.log(`[review][CCL] failed to credit emp=${empNo} day=${day}: ${e.message || e}`);
            }
          }
          if (!QUIET) {
            console.log(`[review][CCL] missing OD_HOLIDAY_WO_CO_CREDIT emp=${empNo} date=${day} odId=${od._id}`);
          }
        }
      }
    }
  }

  if (RECALC && APPLY) {
    console.log('Running recalc for touched employee/date pairs...');
    for (const [empNo, dateSet] of byEmpTouchedDates) {
      await recalcForEmpDates(empNo, dateSet);
    }
  } else if (RECALC && !APPLY) {
    console.log('Skipping recalc in dry-run. Re-run with --apply --recalc to execute.');
  }

  console.log('---');
  console.log(
    JSON.stringify(
      {
        checked_od_linked_rows: checked,
        already_correct_single_day_od: alreadyCorrect,
        mismatched_vs_od_ist_range: mismatch,
        dry_or_apply_moved: moved,
        dry_or_apply_merged: merged,
        skipped_missing_od: missingOd,
        multi_day_review_required: outsideRange,
        untouched_other: skipped,
        od_first: {
          approved_ods_in_department_period: odApprovedCount,
          expected_od_days_checked: odExpectedDayChecks,
          missing_correct_day_link: odMissingCorrectLink,
          auto_repaired_or_planned: odAutoRepairedById,
        },
        ccl_credit_check: {
          expected_holiday_or_weekoff_od_days: cclExpectedHolidayWo,
          missing_ccl_credit_entries: cclMissingCredit,
          credited_now_in_apply: cclCreditedNow,
        },
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

