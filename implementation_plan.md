# Prioritize Attendance Punches for CO-Eligible Day ODs (Revised)

Modify the OD classification logic to prioritize the duration calculated from attendance punches when classifying an OD on a co-eligible day (weekly off or holiday).
- If the duration meets or exceeds the half-day threshold, the OD is auto-classified with `requiresAuthorityDecision: false`.
- If the duration does not meet the half-day threshold, it is still classified as a tentative half-day with `requiresAuthorityDecision: true`.
- On the frontend, show "Weekly off / Holiday OD — your decision required" instead of "Duration shortfall — your decision required" for co-eligible days.

## User Review Required

> [!IMPORTANT]
> - **Backend classification change**: For co-eligible days (week-offs/holidays) with attendance punches:
>   - We prioritize the biometric/attendance duration over photo evidence duration.
>   - If worked minutes are below the half-day threshold (e.g. 1 min), the OD remains tentative and `requiresAuthorityDecision: true` is set.
> - **Frontend UI change**: If an OD requires authority decision and is co-eligible (`isCOEligible: true` or `status: 'authority_required'`), the heading will say "**Weekly off / Holiday OD — your decision required**" instead of "**Duration shortfall — your decision required**".

## Open Questions

None.

## Proposed Changes

### Backend Leaves Service

---

#### [MODIFY] [odDurationClassificationService.js](file:///c:/Users/Saketh%20Damerla/PydahSoft/li-hrms/backend/leaves/services/odDurationClassificationService.js)

- Re-order the resolution in `classifyRegularOdFromEvidence` to load `loadRosterShiftForOdDay` before calculating `durationMins`.
- If `isCoEligible` is true and `attPunches?.durationMins > 0`, explicitly set `durationMins = attPunches.durationMins`.
- Revert the `|| isCoEligible` from the `else if` condition so that we only auto-classify without authority decision if `durationMins >= halfMin`. Otherwise, it falls through and requires authority decision.

### Frontend Pages

---

#### [MODIFY] [page.tsx](file:///c:/Users/Saketh%20Damerla/PydahSoft/li-hrms/frontend/src/app/(workspace)/leaves/page.tsx)
- Change the heading "Duration shortfall — your decision required" to show "Weekly off / Holiday OD — your decision required" when `selectedItem.isCOEligible` is true or `selectedItem.durationClassification?.status === 'authority_required'`.

#### [MODIFY] [page.tsx](file:///c:/Users/Saketh%20Damerla/PydahSoft/li-hrms/frontend/src/app/superadmin/leaves/page.tsx)
- Apply the same heading change to the superadmin leaves view.

## Verification Plan

### Automated Tests
Run backend unit tests for the classification service:
- `npm test backend/leaves/services/__tests__/odDurationClassificationService.test.js`

### Manual Verification
- Verify that if worked duration is 1 min on a week-off, it returns `requiresAuthorityDecision: true` and the frontend shows "Weekly off / Holiday OD — your decision required".
