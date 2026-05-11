# Shift Half-Day Detection and Payroll Aggregation Plan

## 1. Goal

Enhance backend shift detection so that once a shift is detected for attendance, the system:
- identifies which shift segment(s) the punches belong to: `firstHalf`, `break`, `secondHalf`
- computes segment-specific payroll metrics
- applies segment grace values when present, otherwise falls back to global grace
- aggregates payable shift values at the segment and daily level
- correctly handles overnight / cross-midnight shifts

## 2. What exists today

- `backend/shifts/model/Shift.js` already supports:
  - `startTime`, `endTime`, `duration`, `payableShifts`, `gracePeriod`
  - `firstHalf`, `break`, `secondHalf` with segment-level times and optional `gracePeriod` and `payableShifts`
- `backend/shifts/services/shiftDetectionService.js` already supports:
  - proximity-based shift matching using `inTime`
  - priority ordering: roster → designation → department → division → global
  - tie-breaking using `outTime`
  - overnight shift handling
  - `lateIn` / `earlyOut` calculations with global grace fallback
- shift create/update validation already checks first/second half and break completeness

## 3. New feature scope

### 3.1 Half-segment mapping

After a shift is detected and `outTime` is available:
- determine whether the attendance belongs to the first half or the second half
- for each punch interval, identify the active shift segment boundary
- if attendance spans both halves, calculate metrics for each relevant half

### 3.2 Segment grace calculation

For each half segment:
- use the half segment's `gracePeriod` if defined
- otherwise fall back to the global setting from system config
- calculate `lateIn` for first-half start and `earlyOut` for first-half end / second-half end as appropriate

### 3.3 Segment payable shift aggregation

- each `firstHalf` and `secondHalf` has its own `payableShifts`
- attach that payable value to the detected segment result
- sum segment payable shift values into the day’s total payable shifts
- preserve compatibility with full shift `payableShifts` when half-segments are not defined

### 3.4 Continuity validation and overnight support

- respect the expected chain:
  - `firstHalf.startTime == shift.startTime`
  - `firstHalf.endTime == break.startTime`
  - `break.endTime == secondHalf.startTime`
  - `secondHalf.endTime == shift.endTime`
- detect and handle gaps / overlaps if manually edited
- support cross-midnight shifts for both half segment mapping and grace calculations

## 4. Implementation plan

### 4.1 Create a half-day detection service

Add a dedicated helper module, for example:
- `backend/shifts/services/shiftHalfSegmentService.js`

This service should expose functions like:
- `buildShiftSegmentTimeline(shift)`
- `getSegmentForTimestamp(shift, timestamp)`
- `calculateSegmentLateIn(segment, punchIn, globalGrace)`
- `calculateSegmentEarlyOut(segment, punchOut, globalGrace)`
- `aggregateSegmentPayableShifts(segments)`

### 4.2 Enhance detection flow

Update `detectAndAssignShift` in `backend/shifts/services/shiftDetectionService.js` to:
- call the half-segment service after a shift is selected
- compute half-specific metrics in the returned result payload
- include: `detectedSegments`, `segmentLateIn`, `segmentEarlyOut`, `segmentPayableShifts`, `dailyPayableShifts`

### 4.3 Grace rules

Apply grace resolution order:
1. segment-level `gracePeriod` if defined and non-zero
2. global grace value from settings
3. shift-level `gracePeriod` as fallback only if the requested behavior is to use shift-level grace for non-zero segment grace values

### 4.4 Aggregation

Sum payable shifts:
- if `firstHalf` and/or `secondHalf` are present, use their `payableShifts`
- otherwise use full shift `payableShifts`
- store a final aggregate in the shift detection result for the day

### 4.5 Test coverage

Add tests to cover:
- normal single shift with full segments
- partial/half-day attendance in first half / second half
- segment grace fallback to global grace
- overnight shift segmentation
- aggregate payable shift computation
- case where segment grace is zero and global grace must apply

## 5. Required repository changes

1. `backend/shifts/services/shiftHalfSegmentService.js`
2. `backend/shifts/services/shiftDetectionService.js`
3. new or updated tests under `backend/tests/` or `backend/shifts/services/__tests__`
4. optional docs updates if this behavior should be surfaced in product documentation

## 6. Next steps

1. implement `shiftHalfSegmentService.js`
2. integrate it into `detectAndAssignShift`
3. add focused unit tests for half-segment detection and grace behavior
4. verify aggregate payable shift values in daily attendance results

## 7. Notes

- The new logic should preserve current detection behavior when no `firstHalf` / `secondHalf` is configured.
- The service can be built modularly so the half-day logic can later be reused by payroll, leave, or attendance reconciliation services.
