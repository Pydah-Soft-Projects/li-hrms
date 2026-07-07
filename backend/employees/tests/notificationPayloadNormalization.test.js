const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeNotificationArrayFields } = require('../utils/notificationPayloadNormalization');

test('parses stringified employmentTenures into an array', () => {
  const payload = {
    employmentTenures: '[{"joinDate":"2026-07-01T00:00:00.000Z","leaveDate":null}]',
  };

  normalizeNotificationArrayFields(payload);

  assert.ok(Array.isArray(payload.employmentTenures));
  assert.equal(payload.employmentTenures[0].joinDate, '2026-07-01T00:00:00.000Z');
});
