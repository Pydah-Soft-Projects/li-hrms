/**
 * Ensures invalid recipient ids never reach insertMany (money-adjacent modules rely on this).
 */

jest.mock('../../model/Notification', () => ({
  insertMany: jest.fn().mockResolvedValue([{ recipientUserId: '507f1f77bcf86cd799439011', _id: 'n1' }]),
  countDocuments: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../../shared/services/socketService', () => ({
  sendNotification: jest.fn(),
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));

jest.mock('../../../shared/services/pushNotificationService', () => ({
  sendWebPushToRecipientIds: jest.fn().mockResolvedValue({ sent: 0, skipped: true }),
  resolveOpenUrl: jest.fn((u) => u || 'http://localhost:3000/'),
}));

const Notification = require('../../model/Notification');
const { createNotifications } = require('../notificationService');

describe('createNotifications recipient filtering (simulation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops non-ObjectId strings and inserts nothing when all recipients are invalid', async () => {
    const created = await createNotifications({
      recipientUserIds: ['undefined', 'not-a-valid-id', ''],
      module: 'system',
      eventType: 'TEST',
      title: 't',
      message: 'm',
    });
    expect(Notification.insertMany).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('inserts only valid 24-hex user ids', async () => {
    const valid = '507f1f77bcf86cd799439011';
    await createNotifications({
      recipientUserIds: [valid, 'bad', valid],
      module: 'system',
      eventType: 'TEST',
      title: 't',
      message: 'm',
    });
    expect(Notification.insertMany).toHaveBeenCalledTimes(1);
    const docs = Notification.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(String(docs[0].recipientUserId)).toBe(valid);
  });
});
