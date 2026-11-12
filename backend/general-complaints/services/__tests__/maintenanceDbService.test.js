jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(),
}));

const mysql = require('mysql2/promise');
const service = require('../maintenanceDbService');

describe('maintenance complaint feedback', () => {
  test('reopens an unresolved complaint as pending and records the status transition', async () => {
    process.env.MAINTENANCE_DB_HOST = 'localhost';
    process.env.MAINTENANCE_DB_USER = 'test-user';
    process.env.MAINTENANCE_DB_PASSWORD = 'test-password';
    process.env.MAINTENANCE_DB_NAME = 'maintenance_db';

    const complaint = {
      id: 12,
      requester_user_id: 7,
      status: 'completed',
      assignments: [],
      comments: [],
      status_history: [],
      feedback: null,
      resolved_at: new Date('2026-11-12T08:00:00.000Z'),
      closed_at: new Date('2026-11-12T08:00:00.000Z'),
    };
    const query = jest.fn()
      .mockResolvedValueOnce([[complaint], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mysql.createPool.mockReturnValue({ query });

    const result = await service.submitFeedback(12, {
      rating: 1,
      comment: 'Still unresolved',
      is_satisfied: false,
    });

    expect(result).toEqual(expect.objectContaining({ is_satisfied: false, status: 'pending' }));
    expect(query).toHaveBeenCalledTimes(2);
    const [updateSql, updateValues] = query.mock.calls[1];
    expect(updateSql).toContain("status = ?");
    expect(updateValues[1]).toBe('pending');
    expect(JSON.parse(updateValues[2])).toEqual([
      expect.objectContaining({
        new_status: 'pending',
        old_status: 'completed',
        changed_by: 7,
      }),
    ]);
    expect(updateValues[3]).toBeNull();
    expect(updateValues[4]).toBeNull();
  });
});
