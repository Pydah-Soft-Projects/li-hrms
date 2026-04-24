/**
 * Auto-OD: scan AttendanceDaily and create/update OD rows for holiday/week-off work.
 * Invoked from AttendanceDaily pre-save when `auto_od_creation_enabled` is ON; `processAutoODForDate` for batch scans.
 */
const OD = require('../model/OD');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const { resolveLeaveTypeWorkflowSettings } = require('../../departments/services/divisionWorkflowResolver');
const Settings = require('../../settings/model/Settings');
const { getAutoOdEligibilityFromRecord } = require('../utils/holwoOdPunchResolver');

/**
 * Scan AttendanceDaily for holiday/week-off punches and create OD requests
 * @param {string} dateStr - Date to scan (YYYY-MM-DD)
 */
const processAutoODForDate = async (dateStr) => {
    try {
        const autoODSetting = await Settings.findOne({ key: 'auto_od_creation_enabled' }).lean();
        if (autoODSetting?.value !== true) {
            console.log('[AutoOD] Skipping date scan because auto_od_creation_enabled is OFF.');
            return;
        }

        const query = {
            date: dateStr,
            status: { $in: ['HOLIDAY', 'WEEK_OFF'] },
            totalWorkingHours: { $gt: 0 }
        };

        const attendanceRecords = await AttendanceDaily.find(query);
        if (attendanceRecords.length === 0) return;

        console.log(`[AutoOD] Found ${attendanceRecords.length} holiday/week-off attendance records with punches for ${dateStr}.`);

        for (const record of attendanceRecords) {
            await processAutoODForEmployee(record.employeeNumber, dateStr, record);
        }
    } catch (error) {
        console.error('[AutoOD] Error processing date:', dateStr, error);
    }
};

/**
 * Check and create OD for a specific employee and date
 * @param {string} employeeNumber - Employee number
 * @param {string} dateStr - Date (YYYY-MM-DD)
 * @param {Object} record - AttendanceDaily record
 */
const processAutoODForEmployee = async (employeeNumber, dateStr, record) => {
    try {
        const autoODSetting = await Settings.findOne({ key: 'auto_od_creation_enabled' }).lean();
        if (autoODSetting?.value !== true) {
            return;
        }

        if (!record || !['HOLIDAY', 'WEEK_OFF'].includes(record.status) || record.totalWorkingHours <= 0) {
            return;
        }

        const recordPlain = typeof record.toObject === 'function' ? record.toObject({ flattenMaps: true }) : record;
        const el = getAutoOdEligibilityFromRecord(recordPlain);
        if (!el.eligible) {
            console.log(`[AutoOD] Skip ${record.employeeNumber} on ${dateStr}: ${el.reason || 'not_eligible'}`);
            return;
        }

        // 2. Extract punch details FIRST (needed for updates and create when eligible)
        let punchDetails = '';
        let startT = null;
        let endT = null;

        if (record.shifts && record.shifts.length > 0) {
            const segmentTime = (s) => new Date(s.inTime || s.outTime || 0);
            const sortedShifts = [...record.shifts].sort((a, b) => segmentTime(a) - segmentTime(b));
            const firstIn = sortedShifts.find((s) => s.inTime)?.inTime ?? null;
            const lastOut = [...sortedShifts].reverse().find((s) => s.outTime)?.outTime ?? null;

            const formatTime = (date) => {
                if (!date) return null;
                const d = new Date(date);
                return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
            };

            const formatTimeDisplay = (date) => {
                if (!date) return 'N/A';
                return new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
            };

            startT = formatTime(firstIn);
            endT = formatTime(lastOut);
            punchDetails = ` [IN: ${formatTimeDisplay(firstIn)}, OUT: ${formatTimeDisplay(lastOut)}, Duration: ${record.totalWorkingHours} hrs]`;
        }

        // 1. Check if OD already exists for this date and employee
        // ODs are stored with fromDate = IST midnight = UTC prev-day 18:30
        // So we must use a FULL IST calendar day window to match reliably
        const dayStart = new Date(dateStr + 'T00:00:00+05:30'); // IST midnight = UTC 18:30 prev day
        const dayEnd   = new Date(dateStr + 'T23:59:59+05:30'); // IST end of day = UTC 18:29 same day

        console.log(`[AutoOD] Checking for existing OD: emp=${record.employeeNumber}, dateStr=${dateStr}, window=[${dayStart.toISOString()} → ${dayEnd.toISOString()}]`);

        // Look for ANY active OD on this date — pending, approved, partially-approved
        const existingActiveOD = await OD.findOne({
            emp_no: record.employeeNumber,
            fromDate: { $gte: dayStart, $lte: dayEnd },
            isActive: true,
            status: { $nin: ['cancelled', 'rejected'] }
        });

        if (existingActiveOD) {
            // UPDATE the existing OD with fresh punch details + half/full from shift segments
            const prevStartT = existingActiveOD.odStartTime;
            const prevEndT   = existingActiveOD.odEndTime;
            const prevHours  = existingActiveOD.durationHours;

            existingActiveOD.odStartTime   = startT   || existingActiveOD.odStartTime;
            existingActiveOD.odEndTime     = endT     || existingActiveOD.odEndTime;
            existingActiveOD.durationHours = record.totalWorkingHours || existingActiveOD.durationHours;
            existingActiveOD.odType_extended = el.odType_extended;
            existingActiveOD.isHalfDay = el.isHalfDay;
            existingActiveOD.halfDayType = el.halfDayType;
            existingActiveOD.numberOfDays = el.isHalfDay ? 0.5 : 1;

            const updateNote = `Biometric punches updated by system (${el.odType_extended || 'n/a'}).${punchDetails}`;
            existingActiveOD.workflow.history.push({
                step: 'system',
                action: 'status_changed',
                actionBy: null,
                actionByName: 'System (Auto-OD)',
                actionByRole: 'system',
                comments: updateNote,
                timestamp: new Date(),
            });

            await existingActiveOD.save();
            console.log(`[AutoOD] ✏️  Updated existing OD (${existingActiveOD._id}) for ${record.employeeNumber} on ${dateStr} — was [${prevStartT}→${prevEndT} ${prevHours}hrs], now [${startT}→${endT} ${record.totalWorkingHours}hrs]`);
            return;
        }

        // Check if there is a fully-rejected OD on this date.
        // If so we CAN create a new one; add a note about the previous rejection.
        const rejectedOD = await OD.findOne({
            emp_no: record.employeeNumber,
            fromDate: { $gte: dayStart, $lte: dayEnd },
            isActive: true,
            status: { $in: ['rejected', 'cancelled'] }
        }).sort({ updatedAt: -1 });

        let previousRejectionNote = '';
        if (rejectedOD) {
            const rejectedAt = rejectedOD.updatedAt ? new Date(rejectedOD.updatedAt).toLocaleDateString('en-IN') : 'N/A';
            previousRejectionNote = ` | Note: A previous OD (${rejectedOD.status}) on this date was found (${rejectedAt}). New OD auto-generated.`;
        }

        // 3. Fetch employee (required before workflow and for new OD)
        const employee = await Employee.findOne({ emp_no: record.employeeNumber })
            .populate('division_id', 'name')
            .populate('department_id', 'name');

        if (!employee) {
            console.log(`[AutoOD] Employee ${record.employeeNumber} not found in MongoDB. Skipping.`);
            return;
        }

        // 4. Get OD workflow settings (division override → global)
        const workflowSettings = await resolveLeaveTypeWorkflowSettings(
            'od',
            employee.division_id?._id || employee.division_id
        );

        // 5. Initialize workflow — exactly mirrors odController.js
        const approvalSteps = [];
        const reportingManagers = employee.dynamicFields?.reporting_to || employee.dynamicFields?.reporting_to_ || [];
        const hasReportingManager = Array.isArray(reportingManagers) && reportingManagers.length > 0;

        // Phase 1: Always set the FIRST step (reporting_manager if available, else HOD as fallback)
        if (hasReportingManager) {
            approvalSteps.push({
                stepOrder: 1,
                role: 'reporting_manager',
                label: 'Reporting Manager Approval',
                status: 'pending',
                isCurrent: true
            });
        } else {
            // Guaranteed fallback — HOD is always first if no reporting manager
            approvalSteps.push({
                stepOrder: 1,
                role: 'hod',
                label: 'HOD Approval',
                status: 'pending',
                isCurrent: true
            });
        }

        // Phase 2: Append remaining steps from workflow settings (skip HOD — already added above)
        if (workflowSettings?.workflow?.steps?.length > 0) {
            workflowSettings.workflow.steps.forEach(step => {
                if (step.approverRole !== 'hod') {
                    approvalSteps.push({
                        stepOrder: approvalSteps.length + 1,
                        role: step.approverRole,
                        label: step.stepName || `${step.approverRole?.toUpperCase()} Approval`,
                        status: 'pending',
                        isCurrent: false,
                    });
                }
            });
        }

        const workflowData = {
            currentStepRole: approvalSteps[0]?.role || 'hod',
            nextApproverRole: approvalSteps[0]?.role || 'hod',
            currentStep: approvalSteps[0]?.role || 'hod',
            nextApprover: approvalSteps[0]?.role || 'hod',
            approvalChain: approvalSteps,
            finalAuthority: workflowSettings?.workflow?.finalAuthority?.role || 'hr',
            reportingManagerIds: hasReportingManager ? reportingManagers.map(m => (m._id || m).toString()) : [],
            history: [
                {
                    step: 'system',
                    action: 'submitted',
                    actionBy: null, // System generated
                    actionByName: 'System (Auto-OD)',
                    actionByRole: 'system',
                    comments: `Auto-generated ${el.isHalfDay ? 'half-day' : 'full-day'} OD for work on holiday/week-off (${el.punchContextDetail || 'eligible'}).${punchDetails}`,
                    timestamp: new Date(),
                },
            ],
        };

        // 6. Create OD record (appliedBy left null — system-generated; UI shows "System")
        const od = new OD({
            employeeId: employee._id,
            emp_no: employee.emp_no,
            odType: 'OFFICIAL',
            odType_extended: el.odType_extended,
            fromDate: new Date(record.date + 'T00:00:00+05:30'),
            toDate: new Date(record.date + 'T00:00:00+05:30'),
            numberOfDays: el.isHalfDay ? 0.5 : 1,
            isHalfDay: el.isHalfDay,
            halfDayType: el.halfDayType,
            odStartTime: startT,
            odEndTime: endT,
            durationHours: record.totalWorkingHours,
            isCOEligible: true, // HOL / WEEK_OFF context
            purpose: 'Work on Holiday/Week-off',
            placeVisited: 'Organization Campus (Auto)',
            contactNumber: employee.phone_number || 'N/A',
            remarks: `Auto-generated by system (${el.odType_extended || 'n/a'}) from shift segments on a holiday/week-off.${punchDetails}${previousRejectionNote || ''}`,
            status: 'pending',
            isActive: true,
            appliedBy: null,
            division_id: employee.division_id?._id || employee.division_id,
            division_name: employee.division_id?.name || 'N/A',
            department: employee.department_id?._id || employee.department_id,
            department_name: employee.department_id?.name || 'N/A',
            appliedAt: new Date(),
            workflow: workflowData,
        });

        await od.save();
        console.log(`[AutoOD] ✅ Created pending OD for ${employee.emp_no} on ${dateStr}${punchDetails}`);
    } catch (error) {
        console.error(`[AutoOD] Error processing ${employeeNumber} on ${dateStr}:`, error);
    }
};

module.exports = { processAutoODForDate, processAutoODForEmployee };
