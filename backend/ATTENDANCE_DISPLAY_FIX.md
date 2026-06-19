/**
 * ATTENDANCE DETAIL MODAL - DAILY SUMMARY NOW INCLUDES
 * 
 * BEFORE (Problem):
 * ════════════════════════════════════════════════════════
 * ┌─────────────────────────────────────────────────────┐
 * │ Daily Status: HALF_DAY │ Total Hours: 4.5hrs       │
 * │ OT Hours: 0hrs         │ Extra Hours: 0hrs         │
 * └─────────────────────────────────────────────────────┘
 * ❌ Missing aggregate penalty totals!
 * 
 * 
 * AFTER (Fixed):
 * ════════════════════════════════════════════════════════
 * ┌─────────────────────────────────────────────────────┐
 * │ Daily Status: HALF_DAY │ Total Hours: 4.5hrs       │
 * │ OT Hours: 0hrs         │ Approved OT: 0hrs         │
 * │ Total Late In: 60m ⚫  │ Total Early Out: 30m ⚫   │
 * └─────────────────────────────────────────────────────┘
 * ✅ Now shows DAILY AGGREGATE penalties!
 * 
 * 
 * PENALTY CALCULATION LOGIC:
 * ════════════════════════════════════════════════════════
 * 
 * For Multi-Shift Same Day:
 * ├─ Shift 1 First Half (PRESENT): Late 60m  → INCLUDED
 * ├─ Shift 1 Second Half (ABSENT):  Late null → IGNORED
 * ├─ Shift 2 First Half (ABSENT):   Late null → IGNORED
 * └─ Shift 2 Second Half (PRESENT): Late 20m  → INCLUDED
 *    ─────────────────────────────────────────
 *    TOTAL LATE IN: 60 + 20 = 80m ✅
 * 
 * 
 * DISPLAY FEATURES:
 * ════════════════════════════════════════════════════════
 * • Shows 0m when no penalties
 * • Shows Xm in orange (text-orange-600) when > 0
 * • Animated orange pulse dot (⚫) indicator when penalties exist
 * • Dark mode compatible
 * • Responsive design (grid layout)
 */
