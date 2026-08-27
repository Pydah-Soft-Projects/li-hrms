const {
  applyShiftSegmentOverride,
  hasUsableShiftSegments,
} = require('../shiftSegmentOverrides');
const {
  applyDivisionSegmentsToShift,
  resolveEffectiveShiftDoc,
} = require('../divisionShiftSegments');

const MASTER_HALVES = {
  firstHalf: { startTime: '09:00', endTime: '13:00' },
  break: { startTime: '13:00', endTime: '13:30' },
  secondHalf: { startTime: '13:30', endTime: '18:00' },
};

const shiftMaster = {
  _id: '697f7c88a2942c6b291e096d',
  name: 'General',
  startTime: '09:00',
  endTime: '18:00',
  ...MASTER_HALVES,
  segmentOverrides: [],
};

describe('null division/override halves keep shift master', () => {
  test('hasUsableShiftSegments is false when firstHalf/break/secondHalf are null', () => {
    expect(hasUsableShiftSegments({
      firstHalf: null,
      break: null,
      secondHalf: null,
    })).toBe(false);
  });

  test('applyDivisionSegmentsToShift does not wipe master when assignment halves are null', () => {
    const effective = applyDivisionSegmentsToShift(shiftMaster, {
      shiftId: shiftMaster._id,
      gender: 'All',
      employee_group_id: '5a3a89a9337ce9effffd4c88',
      firstHalf: null,
      break: null,
      secondHalf: null,
    });
    expect(effective.firstHalf).toEqual(MASTER_HALVES.firstHalf);
    expect(effective.break).toEqual(MASTER_HALVES.break);
    expect(effective.secondHalf).toEqual(MASTER_HALVES.secondHalf);
  });

  test('applyShiftSegmentOverride does not wipe master when override halves are null', () => {
    const shift = {
      ...shiftMaster,
      segmentOverrides: [{
        division: 'div-1',
        firstHalf: null,
        break: null,
        secondHalf: null,
      }],
    };
    const effective = applyShiftSegmentOverride(shift, 'div-1');
    expect(effective.firstHalf).toEqual(MASTER_HALVES.firstHalf);
    expect(effective.secondHalf).toEqual(MASTER_HALVES.secondHalf);
  });

  test('resolveEffectiveShiftDoc uses master when division assignment halves are null', async () => {
    const division = {
      _id: 'div-1',
      shifts: [{
        shiftId: shiftMaster._id,
        gender: 'All',
        employee_group_id: '5a3a89a9337ce9effffd4c88',
        firstHalf: null,
        break: null,
        secondHalf: null,
      }],
    };

    const effective = await resolveEffectiveShiftDoc(shiftMaster, {
      division,
      divisionId: 'div-1',
      groupingEnabled: false,
    });

    expect(effective.firstHalf.startTime).toBe('09:00');
    expect(effective.secondHalf.endTime).toBe('18:00');
  });

  test('resolveEffectiveShiftDoc uses division assignment times when they are set', async () => {
    const division = {
      _id: 'div-1',
      shifts: [{
        shiftId: shiftMaster._id,
        gender: 'All',
        firstHalf: { startTime: '08:00', endTime: '12:00' },
        break: { startTime: '12:00', endTime: '12:30' },
        secondHalf: { startTime: '12:30', endTime: '16:00' },
      }],
    };

    const effective = await resolveEffectiveShiftDoc(shiftMaster, {
      division,
      divisionId: 'div-1',
      groupingEnabled: false,
    });

    expect(effective.firstHalf.startTime).toBe('08:00');
    expect(effective.secondHalf.endTime).toBe('16:00');
  });
});
