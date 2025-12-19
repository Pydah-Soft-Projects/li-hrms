const AttendanceDaily = require('../../model/AttendanceDaily');

test('trivial mock check', () => {
    console.log('AttendanceDaily type:', typeof AttendanceDaily);
    console.log('AttendanceDaily keys:', Object.keys(AttendanceDaily));
    expect(AttendanceDaily.findOne).toBeDefined();
});
