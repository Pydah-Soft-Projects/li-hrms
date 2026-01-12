/**
 * Security Controller
 * Handles Gate Pass generation and verification
 */

const Permission = require('../../permissions/model/Permission');
const crypto = require('crypto');

/**
 * @desc    Get approved permissions for today (Security Dashboard)
 * @route   GET /api/security/permissions/today
 * @access  Private (Security, Super Admin)
 */
exports.getTodayPermissions = async (req, res) => {
    try {
        // Get today's date in YYYY-MM-DD format based on local time (or consistent server time)
        // Assuming backend stores date as string 'YYYY-MM-DD'
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];

        const permissions = await Permission.find({
            date: dateStr,
            status: 'approved',
        })
            .populate('employeeId', 'employee_name emp_no department_id designation_id photo')
            .populate('employeeId.department_id', 'name') // Population syntax check needed, simplified below
            .populate({
                path: 'employeeId',
                select: 'employee_name emp_no department_id designation_id photo',
                populate: [
                    { path: 'department_id', select: 'name' },
                    { path: 'designation_id', select: 'name' }
                ]
            })
            .select('employeeId date permissionStartTime permissionEndTime purpose status gateOutTime gateInTime gateOutVerifiedBy gateInVerifiedBy')
            .sort({ permissionStartTime: 1 });

        res.status(200).json({
            success: true,
            count: permissions.length,
            data: permissions,
        });
    } catch (error) {
        console.error('Error fetching today permissions:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
};

/**
 * @desc    Generate Gate Out QR Secret
 * @route   POST /api/security/gate-pass/out/:id
 * @access  Private (Employee - Own Permission)
 */
exports.generateGateOutQR = async (req, res) => {
    try {
        const permission = await Permission.findById(req.params.id);

        if (!permission) {
            return res.status(404).json({ success: false, message: 'Permission not found' });
        }

        // Check ownership
        // Assuming req.user._id refers to the user account matching the permission's requestedBy or linked employee
        // Since employeeId is an Employee model ref, and req.user is a User model ref, we need to check linkage.
        // For now, assuming basic auth check or that the user is the one who 'owns' this employee profile.
        // Simplified: Check if req.user._id matches requestedBy (if employee requests themselves)
        // or if the user is a superadmin/admin.

        // For robust ownership:
        if (permission.employeeId.toString() !== req.user.employeeId?.toString() && req.user.role !== 'super_admin') {
            // Note: req.user.employeeId needs to be available in request. 
            // If standard auth doesn't populate it, might need another check.
            // Let's assume standard role check for now or 'requestedBy'
            if (permission.requestedBy.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: 'Not authorized' });
            }
        }

        if (permission.status !== 'approved') {
            return res.status(400).json({ success: false, message: 'Permission is not approved' });
        }

        if (permission.gateOutTime) {
            return res.status(400).json({ success: false, message: 'Gate Out already recorded' });
        }

        // Generate a secure random secret
        // Prefix with 'OUT:' to verify type easily, plus random bytes
        const secret = `OUT:${permission._id}:${crypto.randomBytes(16).toString('hex')}`;

        permission.gateOutSecret = secret;
        await permission.save();

        res.status(200).json({
            success: true,
            qrSecret: secret,
        });
    } catch (error) {
        console.error('Error generating Gate Out QR:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Generate Gate In QR Secret
 * @route   POST /api/security/gate-pass/in/:id
 * @access  Private (Employee)
 */
exports.generateGateInQR = async (req, res) => {
    try {
        const permission = await Permission.findById(req.params.id);

        if (!permission) {
            return res.status(404).json({ success: false, message: 'Permission not found' });
        }

        // Auth Check
        if (permission.requestedBy.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (!permission.gateOutTime) {
            return res.status(400).json({ success: false, message: 'Must Gate Out first' });
        }

        if (permission.gateInTime) {
            return res.status(400).json({ success: false, message: 'Gate In already recorded' });
        }

        // 5 Minute Buffer Check
        const now = new Date();
        const gateOutTime = new Date(permission.gateOutTime);
        const diffMs = now - gateOutTime;
        const minutesPassed = diffMs / (1000 * 60);

        if (minutesPassed < 5) {
            const remaining = Math.ceil(5 - minutesPassed);
            return res.status(400).json({
                success: false,
                message: `Please wait ${remaining} more minute(s) before generating Gate In Pass`,
                waitTime: remaining
            });
        }

        // Generate secure random secret
        const secret = `IN:${permission._id}:${crypto.randomBytes(16).toString('hex')}`;

        permission.gateInSecret = secret;
        await permission.save();

        res.status(200).json({
            success: true,
            qrSecret: secret,
        });
    } catch (error) {
        console.error('Error generating Gate In QR:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const SecurityLog = require('../model/SecurityLog');

/**
 * @desc    Verify Gate Pass (Scan QR)
 * @route   POST /api/security/verify
 * @access  Private (Security, Super Admin)
 */
exports.verifyGatePass = async (req, res) => {
    try {
        const { qrSecret } = req.body;

        if (!qrSecret) {
            return res.status(400).json({ success: false, message: 'QR Code is required' });
        }

        // Determine type from prefix
        let type = '';
        let permissionId = '';

        if (qrSecret.startsWith('OUT:')) {
            type = 'OUT';
            permissionId = qrSecret.split(':')[1];
        } else if (qrSecret.startsWith('IN:')) {
            type = 'IN';
            permissionId = qrSecret.split(':')[1];
        } else {
            return res.status(400).json({ success: false, message: 'Invalid QR Code format' });
        }

        const permission = await Permission.findById(permissionId)
            .select('+gateOutSecret +gateInSecret')
            .populate('employeeId', 'employee_name emp_no');

        if (!permission) {
            return res.status(404).json({ success: false, message: 'Permission record not found' });
        }

        const logEntry = new SecurityLog({
            permissionId: permission._id,
            employeeId: permission.employeeId._id,
            verifiedBy: req.user._id,
            actionType: type === 'OUT' ? 'GATE_OUT' : 'GATE_IN'
        });

        // Verify Secret
        if (type === 'OUT') {
            if (permission.gateOutSecret !== qrSecret) {
                logEntry.status = 'FAILURE';
                logEntry.details = 'Invalid or Expired Gate Out QR';
                await logEntry.save();
                return res.status(400).json({ success: false, message: 'Invalid or Expired Gate Out QR' });
            }
            if (permission.gateOutTime) {
                logEntry.status = 'FAILURE';
                logEntry.details = 'Gate Out already verified';
                logEntry.actionType = 'VERIFICATION_FAILED'; // Or keep as GATE_OUT but failure
                await logEntry.save();
                return res.status(400).json({ success: false, message: 'Gate Out already verified', alreadyVerified: true });
            }

            // Action: Log Gate Out
            permission.gateOutTime = new Date();
            permission.gateOutVerifiedBy = req.user._id;
            // We don't clear the secret immediately to allow re-scans for confirmation if needed briefly, 
            // but the gateOutTime check prevents double action.
            // Or we can clear it to be strict. Let's keep it for audit.

        } else if (type === 'IN') {
            if (permission.gateInSecret !== qrSecret) {
                logEntry.status = 'FAILURE';
                logEntry.details = 'Invalid or Expired Gate In QR';
                await logEntry.save();
                return res.status(400).json({ success: false, message: 'Invalid or Expired Gate In QR' });
            }
            if (permission.gateInTime) {
                logEntry.status = 'FAILURE';
                logEntry.details = 'Gate In already verified';
                logEntry.actionType = 'VERIFICATION_FAILED';
                await logEntry.save();
                return res.status(400).json({ success: false, message: 'Gate In already verified', alreadyVerified: true });
            }

            // Action: Log Gate In
            permission.gateInTime = new Date();
            permission.gateInVerifiedBy = req.user._id;
        }

        await permission.save();

        logEntry.status = 'SUCCESS';
        logEntry.details = `Gate ${type === 'OUT' ? 'Out' : 'In'} Verified Successfully at ${new Date().toISOString()}`;
        await logEntry.save();

        res.status(200).json({
            success: true,
            message: `Gate ${type === 'OUT' ? 'Out' : 'In'} Verified Successfully`,
            data: {
                employeeName: permission.employeeId.employee_name,
                empNo: permission.employeeId.emp_no,
                type: type,
                timestamp: new Date()
            }
        });

    } catch (error) {
        console.error('Error verifying Gate Pass:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
