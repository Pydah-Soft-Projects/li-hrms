/**
 * Normalize notification array fields that may arrive as JSON strings from multipart/form-data.
 * This prevents Mongoose embedded-array cast errors when fields like expoPushTokens or pushSubscriptions
 * are submitted as strings such as "[]".
 */
const normalizeNotificationArrayFields = (employeeData) => {
  if (!employeeData || typeof employeeData !== 'object') return;

  const normalizeArrayValue = (fieldName, value) => {
    if (value === undefined) return;

    if (Array.isArray(value)) {
      if (fieldName === 'expoPushTokens') {
        employeeData[fieldName] = value
          .filter((item) => item != null)
          .map((item) => {
            if (typeof item === 'string') {
              return { token: item, platform: 'unknown' };
            }
            if (typeof item === 'object') {
              return item;
            }
            return { token: String(item), platform: 'unknown' };
          });
      } else {
        employeeData[fieldName] = value;
      }
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        delete employeeData[fieldName];
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          normalizeArrayValue(fieldName, parsed);
          return;
        }
      } catch (err) {
        // Ignore invalid JSON payloads from form submissions instead of failing the update.
      }
    }

    delete employeeData[fieldName];
  };

  const normalizeJsonFieldValue = (fieldName, value) => {
    if (value === undefined || value === null) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        delete employeeData[fieldName];
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && (typeof parsed === 'object' || Array.isArray(parsed))) {
          employeeData[fieldName] = parsed;
          return;
        }
      } catch (err) {
        // Leave non-JSON strings intact; callers can handle them separately.
      }
    } else if (typeof value === 'object' || Array.isArray(value)) {
      employeeData[fieldName] = value;
    }
  };

  normalizeArrayValue('pushSubscriptions', employeeData.pushSubscriptions);
  normalizeArrayValue('expoPushTokens', employeeData.expoPushTokens);

  ['employmentTenures', 'dynamicFields', 'employeeAllowances', 'employeeDeductions'].forEach((fieldName) => {
    if (employeeData[fieldName] !== undefined) {
      normalizeJsonFieldValue(fieldName, employeeData[fieldName]);
    }
  });
};

module.exports = {
  normalizeNotificationArrayFields,
};
