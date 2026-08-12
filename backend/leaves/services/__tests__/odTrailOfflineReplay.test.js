const OD = require('../../model/OD');
const { appendOdTrailPoints } = require('../odTrailService');

jest.mock('../../model/OD', () => ({
  findById: jest.fn(),
}));

describe('OD trail offline replay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('replaying an acknowledged batch does not duplicate points', async () => {
    const od = {
      _id: 'od-1',
      status: 'draft',
      appliedBy: 'user-1',
      locationTrail: [],
      markModified: jest.fn(),
      save: jest.fn(async function save() { return this; }),
    };
    OD.findById = jest.fn().mockResolvedValue(od);

    const user = { _id: 'user-1', role: 'employee' };
    const points = [
      {
        pointId: 'mobile-point-1',
        latitude: 17.385,
        longitude: 78.4867,
        capturedAt: '2026-08-11T10:00:00.000Z',
        source: 'mobile',
      },
      {
        pointId: 'mobile-point-2',
        latitude: 17.386,
        longitude: 78.4877,
        capturedAt: '2026-08-11T10:01:00.000Z',
        source: 'mobile',
      },
    ];

    const first = await appendOdTrailPoints({ odId: 'od-1', user, points, client: 'mobile' });
    const replay = await appendOdTrailPoints({ odId: 'od-1', user, points, client: 'mobile' });

    expect(first.ok).toBe(true);
    expect(first.normalized).toHaveLength(2);
    expect(replay.ok).toBe(true);
    expect(replay.normalized).toHaveLength(0);
    expect(od.locationTrail).toHaveLength(2);
    expect(od.save).toHaveBeenCalledTimes(1);
  });

  test('still accepts a new point in a mixed replay batch', async () => {
    const od = {
      _id: 'od-2',
      status: 'draft',
      appliedBy: 'user-2',
      locationTrail: [{ pointId: 'mobile-point-1', latitude: 17.385, longitude: 78.4867 }],
      markModified: jest.fn(),
      save: jest.fn(async function save() { return this; }),
    };
    OD.findById = jest.fn().mockResolvedValue(od);

    const result = await appendOdTrailPoints({
      odId: 'od-2',
      user: { _id: 'user-2' },
      client: 'mobile',
      points: [
        { pointId: 'mobile-point-1', latitude: 17.385, longitude: 78.4867 },
        { pointId: 'mobile-point-3', latitude: 17.387, longitude: 78.4887 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.normalized).toHaveLength(1);
    expect(od.locationTrail.map((point) => point.pointId)).toEqual(['mobile-point-1', 'mobile-point-3']);
  });
});
