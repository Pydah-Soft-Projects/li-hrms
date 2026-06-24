const { normalizeNotificationArrayFields } = require('../notificationPayloadNormalization');

describe('normalizeNotificationArrayFields', () => {
  test('parses expoPushTokens and pushSubscriptions JSON strings into arrays', () => {
    const payload = {
      pushSubscriptions: '[]',
      expoPushTokens: '[{"token":"abc","platform":"android"}]',
    };

    normalizeNotificationArrayFields(payload);

    expect(payload.pushSubscriptions).toEqual([]);
    expect(payload.expoPushTokens).toEqual([{ token: 'abc', platform: 'android' }]);
  });

  test('drops invalid notification payloads instead of passing strings into Mongoose', () => {
    const payload = {
      pushSubscriptions: 'not-json',
      expoPushTokens: 'not-json',
    };

    normalizeNotificationArrayFields(payload);

    expect(payload).not.toHaveProperty('pushSubscriptions');
    expect(payload).not.toHaveProperty('expoPushTokens');
  });
});
