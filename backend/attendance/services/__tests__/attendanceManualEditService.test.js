const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeManualOverrides,
  findOverrideOutTime,
  buildOutTimeReprocessOptions,
  buildInTimeReprocessOptions,
  getShiftSegmentIndex,
} = require('../attendanceManualEditService');

describe('attendanceManualEditService', () => {
  it('normalizes legacy plain-object overrides', () => {
    const inTime = new Date('2025-06-05T04:00:00.000Z');
    const outTime = new Date('2025-06-05T12:00:00.000Z');
    const normalized = normalizeManualOverrides({ [inTime.toISOString()]: outTime });
    assert.equal(normalized.byInTime[inTime.toISOString()].toISOString(), outTime.toISOString());
    assert.deepEqual(normalized.segmentPairs, []);
  });

  it('finds override with fuzzy timestamp match', () => {
    const inTime = new Date('2025-06-05T04:00:00.000Z');
    const outTime = new Date('2025-06-05T12:00:00.000Z');
    const nearIn = new Date(inTime.getTime() + 1000);
    const found = findOverrideOutTime(nearIn, {
      byInTime: { [inTime.toISOString()]: outTime },
      segmentPairs: [],
    });
    assert.equal(found.toISOString(), outTime.toISOString());
  });

  it('anchors last-segment OUT override to first shift IN on multi-shift days', () => {
    const firstIn = new Date('2025-06-05T04:00:00.000Z');
    const secondIn = new Date('2025-06-05T12:00:00.000Z');
    const newOut = new Date('2025-06-05T18:00:00.000Z');
    const attendanceRecord = {
      shifts: [
        { _id: 'a', shiftNumber: 1, inTime: firstIn, outTime: secondIn },
        { _id: 'b', shiftNumber: 2, inTime: secondIn, outTime: newOut },
      ],
    };
    const secondSegment = attendanceRecord.shifts[1];
    const { manualOverrides } = buildOutTimeReprocessOptions(attendanceRecord, secondSegment, newOut);
    assert.equal(getShiftSegmentIndex(attendanceRecord, secondSegment), 1);
    assert.equal(
      manualOverrides.byInTime[firstIn.toISOString()].toISOString(),
      newOut.toISOString()
    );
    assert.equal(manualOverrides.segmentEdit.segmentIndex, 1);
  });

  it('builds IN edit override pairing new IN with existing OUT', () => {
    const oldIn = new Date('2025-06-05T04:00:00.000Z');
    const newIn = new Date('2025-06-05T04:30:00.000Z');
    const outTime = new Date('2025-06-05T12:00:00.000Z');
    const attendanceRecord = {
      shifts: [{ _id: 'a', shiftNumber: 1, inTime: oldIn, outTime }],
    };
    const segment = attendanceRecord.shifts[0];
    const { manualOverrides } = buildInTimeReprocessOptions(attendanceRecord, segment, newIn);
    assert.equal(manualOverrides.byInTime[newIn.toISOString()].toISOString(), outTime.toISOString());
    assert.equal(manualOverrides.segmentEdit.editType, 'IN');
  });
});
