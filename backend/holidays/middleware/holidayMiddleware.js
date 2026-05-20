const {
    loadHolidayActor,
    canManageHoliday,
    canManageGlobal,
} = require('../utils/holidayAccess');

exports.requireHolidayWrite = async (req, res, next) => {
    try {
        const actor = await loadHolidayActor(req);
        if (!actor) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!canManageHoliday(actor)) {
            return res.status(403).json({
                success: false,
                message: 'Holiday calendar write access required',
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.requireHolidayGlobalManage = async (req, res, next) => {
    try {
        const actor = await loadHolidayActor(req);
        if (!actor) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!canManageGlobal(actor)) {
            return res.status(403).json({
                success: false,
                message: 'Global holiday management permission required',
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
