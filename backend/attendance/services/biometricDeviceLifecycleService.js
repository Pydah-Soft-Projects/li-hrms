/**
 * HRMS ↔ biometric device lifecycle for resign/terminate (LWD+1 offboard)
 * and rejoin (write user back to devices they were removed from).
 *
 * Requires BIOMETRIC_SERVICE_BASE_URL (or BIOMETRIC_SERVICE_URL)
 * and HRMS_MICROSERVICE_SECRET_KEY (same as biometric service).
 */

const axios = require('axios');
const Employee = require('../../employees/model/Employee');

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function resolveBiometricBaseUrl() {
  const base =
    process.env.BIOMETRIC_SERVICE_BASE_URL ||
    process.env.BIOMETRIC_SERVICE_URL ||
    '';
  const trimmed = String(base).trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, '');
}

function isLifecycleEnabled() {
  const v = String(process.env.BIOMETRIC_DEVICE_LIFECYCLE || 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True when leftDate calendar day is strictly before today (LWD+1 reached). */
function isPastLastWorkingDay(leftDate) {
  if (!leftDate) return false;
  const lwd = leftDate instanceof Date ? new Date(leftDate) : new Date(leftDate);
  if (isNaN(lwd.getTime())) return false;
  lwd.setHours(0, 0, 0, 0);
  return lwd < startOfTodayLocal();
}

async function postBiometricInternal(path, body) {
  const base = resolveBiometricBaseUrl();
  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!base) {
    return { skipped: true, reason: 'biometric_url_not_configured' };
  }
  if (!systemKey) {
    return { skipped: true, reason: 'system_key_not_configured' };
  }

  const url = `${base}/api/internal${path}`;
  let attempt = 0;
  let lastErr;
  while (attempt < RETRY_ATTEMPTS) {
    attempt += 1;
    try {
      const res = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-system-key': systemKey,
        },
        timeout: 60000,
      });
      return { skipped: false, data: res.data };
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  return {
    skipped: false,
    error: lastErr?.response?.data?.message || lastErr?.message || 'biometric_request_failed',
  };
}

/**
 * Deactivate emp_no on all active biometric devices; persist offboard snapshot on Employee.
 */
async function runBiometricDeviceOffboard(empNo, { force = false } = {}) {
  if (!isLifecycleEnabled()) {
    return { skipped: true, reason: 'lifecycle_disabled' };
  }

  const empNoUpper = String(empNo || '').trim().toUpperCase();
  if (!empNoUpper) return { skipped: true, reason: 'no_emp_no' };

  const employee = await Employee.findOne({ emp_no: empNoUpper });
  if (!employee) return { skipped: true, reason: 'employee_not_found' };

  if (!force && employee.biometricOffboardedAt) {
    return {
      skipped: true,
      reason: 'already_offboarded',
      deviceIds: employee.biometricOffboardDeviceIds || [],
    };
  }

  if (!force && employee.leftDate && !isPastLastWorkingDay(employee.leftDate)) {
    return { skipped: true, reason: 'lwd_not_reached', leftDate: employee.leftDate };
  }

  const result = await postBiometricInternal('/users/deactivate-all', {
    empNo: empNoUpper,
    userId: empNoUpper,
  });

  if (result.skipped) return result;
  if (result.error) {
    console.error(`[BiometricLifecycle] Offboard failed for ${empNoUpper}:`, result.error);
    return { skipped: false, success: false, error: result.error };
  }

  const deviceIds = result.data?.deviceIds || [];
  employee.biometricOffboardedAt = new Date();
  employee.biometricOffboardDeviceIds = deviceIds;
  await employee.save();

  console.log(
    `[BiometricLifecycle] Offboarded ${empNoUpper} from ${deviceIds.length} device(s): ${deviceIds.join(', ') || '(none)'}`
  );

  return {
    skipped: false,
    success: true,
    empNo: empNoUpper,
    deviceIds,
    biometric: result.data,
  };
}

/**
 * On rejoin: write user back to devices recorded at offboard (fallback: inactiveDeviceIds).
 */
async function runBiometricDeviceOnboard(empNo) {
  if (!isLifecycleEnabled()) {
    return { skipped: true, reason: 'lifecycle_disabled' };
  }

  const empNoUpper = String(empNo || '').trim().toUpperCase();
  if (!empNoUpper) return { skipped: true, reason: 'no_emp_no' };

  const employee = await Employee.findOne({ emp_no: empNoUpper });
  if (!employee) return { skipped: true, reason: 'employee_not_found' };

  const deviceIds = Array.isArray(employee.biometricOffboardDeviceIds)
    ? employee.biometricOffboardDeviceIds.filter(Boolean)
    : [];

  const result = await postBiometricInternal('/users/activate-on-devices', {
    empNo: empNoUpper,
    userId: empNoUpper,
    ...(deviceIds.length ? { deviceIds } : {}),
  });

  if (result.skipped) return result;
  if (result.error) {
    console.error(`[BiometricLifecycle] Onboard failed for ${empNoUpper}:`, result.error);
    return { skipped: false, success: false, error: result.error };
  }

  employee.biometricOffboardedAt = null;
  employee.biometricOffboardDeviceIds = [];
  await employee.save();

  const activatedIds = result.data?.deviceIds || deviceIds;
  console.log(
    `[BiometricLifecycle] Onboarded ${empNoUpper} to ${activatedIds.length} device(s): ${activatedIds.join(', ') || '(none)'}`
  );

  return {
    skipped: false,
    success: true,
    empNo: empNoUpper,
    deviceIds: activatedIds,
    biometric: result.data,
  };
}

function scheduleBiometricDeviceOffboard(empNo, opts) {
  setImmediate(() => {
    runBiometricDeviceOffboard(empNo, opts).catch((err) => {
      console.error('[BiometricLifecycle] Offboard unhandled:', err.message);
    });
  });
}

function scheduleBiometricDeviceOnboard(empNo) {
  setImmediate(() => {
    runBiometricDeviceOnboard(empNo).catch((err) => {
      console.error('[BiometricLifecycle] Onboard unhandled:', err.message);
    });
  });
}

module.exports = {
  runBiometricDeviceOffboard,
  runBiometricDeviceOnboard,
  scheduleBiometricDeviceOffboard,
  scheduleBiometricDeviceOnboard,
  isPastLastWorkingDay,
  resolveBiometricBaseUrl,
  isLifecycleEnabled,
};
