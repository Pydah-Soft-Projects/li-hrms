# Frontend Multi-Shift Integration Guide

## 📋 Overview

This guide covers all frontend changes needed to display multi-shift attendance data in the superadmin attendance page.

**File to Update:** [frontend/src/app/superadmin/attendance/page.tsx](file:///d:/li-hrms/frontend/src/app/superadmin/attendance/page.tsx) (2776 lines)

---

## 🔧 Step 1: Update TypeScript Interfaces

### Current Interface (Lines 7-59)
```typescript
interface AttendanceRecord {
  date: string;
  inTime: string | null;
  outTime: string | null;
  totalHours: number | null;
  status: 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LEAVE' | 'OD' | 'HALF_DAY' | '-';
  // ... other fields
}
```

### Add Multi-Shift Fields
```typescript
interface AttendanceRecord {
  date: string;
  
  // ========== MULTI-SHIFT FIELDS ==========
  shifts?: Array<{
    shiftNumber: number;
    inTime: string;
    outTime: string | null;
    duration: number | null;
    workingHours: number | null;
    otHours: number;
    matchedShiftId: string | null;
    shiftName: string | null;
    lateInMinutes: number | null;
    earlyOutMinutes: number | null;
    isLateIn: boolean;
    isEarlyOut: boolean;
    status: 'complete' | 'incomplete';
  }>;
  totalShifts?: number;
  totalWorkingHours?: number;
  totalOTHours?: number;
  
  // ========== BACKWARD COMPATIBILITY ==========
  inTime: string | null;  // First shift IN
  outTime: string | null; // Last shift OUT
  totalHours: number | null;
  status: 'PRESENT' | 'ABSENT' | 'PARTIAL' | 'LEAVE' | 'OD' | 'HALF_DAY' | '-';
  // ... other existing fields
}
```

---

## 🎨 Step 2: Update Attendance Table Display

### Location: Lines 1482-1550 (approximately)

### Current Display
Shows single IN/OUT time per cell.

### New Multi-Shift Display

#### Option A: Compact View (Recommended for Table)
```typescript
{daysArray.map((day) => {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const record = dailyAttendance[dateStr] || null;
  
  // Check if multi-shift
  const hasMultipleShifts = record?.totalShifts && record.totalShifts > 1;
  
  return (
    <td
      key={day}
      className="border-r border-slate-200 px-1 py-1 text-center cursor-pointer hover:bg-blue-50"
      onClick={() => handleDateClick(item.employee, dateStr)}
    >
      {record ? (
        <div className="flex flex-col gap-0.5">
          {/* Status Badge */}
          <div className={`text-xs font-semibold ${getStatusColor(record.status)}`}>
            {displayStatus}
          </div>
          
          {/* Multi-Shift Indicator */}
          {hasMultipleShifts && (
            <div className="flex items-center justify-center gap-0.5">
              {Array.from({ length: record.totalShifts }, (_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-blue-500"
                  title={`Shift ${i + 1}`}
                />
              ))}
            </div>
          )}
          
          {/* Total Hours */}
          <div className="text-[9px] text-slate-600">
            {record.totalWorkingHours?.toFixed(1) || record.totalHours?.toFixed(1) || '-'}h
          </div>
        </div>
      ) : (
        <span className="text-slate-400">-</span>
      )}
    </td>
  );
})}
```

#### Visual Example:
```
┌─────┐
│  P  │  ← Status
│ ●●  │  ← 2 shift indicators
│ 12h │  ← Total hours
└─────┘
```

---

## 📊 Step 3: Update Detail Dialog

### Location: Search for "showDetailDialog" (around line 1800+)

### Add Shift Breakdown Section

```typescript
{/* Attendance Detail Dialog */}
{showDetailDialog && attendanceDetail && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-2xl font-bold">Attendance Details</h2>
        <p className="text-sm text-slate-600">{selectedDate}</p>
      </div>
      
      {/* Content */}
      <div className="p-6 space-y-6">
        
        {/* ========== MULTI-SHIFT SECTION ========== */}
        {attendanceDetail.shifts && attendanceDetail.shifts.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Shifts ({attendanceDetail.totalShifts || attendanceDetail.shifts.length})
            </h3>
            
            {/* Shift Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attendanceDetail.shifts.map((shift, index) => (
                <div
                  key={index}
                  className="border-2 border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  {/* Shift Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                          {shift.shiftNumber}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          Shift {shift.shiftNumber}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {shift.shiftName || 'Unassigned'}
                        </div>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-[10px] font-semibold ${
                      shift.status === 'complete' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {shift.status === 'complete' ? '✓ Complete' : '⚠ Incomplete'}
                    </div>
                  </div>
                  
                  {/* Shift Times */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">IN:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {new Date(shift.inTime).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">OUT:</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {shift.outTime 
                          ? new Date(shift.outTime).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          : '-'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Shift Stats */}
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500">Hours</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {shift.workingHours?.toFixed(1) || '0.0'}h
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">OT</div>
                      <div className="text-sm font-bold text-orange-600">
                        {shift.otHours?.toFixed(1) || '0.0'}h
                      </div>
                    </div>
                  </div>
                  
                  {/* Late/Early Indicators */}
                  {(shift.isLateIn || shift.isEarlyOut) && (
                    <div className="mt-2 flex gap-1">
                      {shift.isLateIn && (
                        <div className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[9px]">
                          Late: {shift.lateInMinutes}m
                        </div>
                      )}
                      {shift.isEarlyOut && (
                        <div className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px]">
                          Early: {shift.earlyOutMinutes}m
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Daily Summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Daily Summary</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Total Shifts</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {attendanceDetail.totalShifts || attendanceDetail.shifts.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Total Hours</div>
                  <div className="text-2xl font-bold text-green-600">
                    {attendanceDetail.totalWorkingHours?.toFixed(1) || '0.0'}h
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">Total OT</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {attendanceDetail.totalOTHours?.toFixed(1) || '0.0'}h
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ========== SINGLE SHIFT (BACKWARD COMPATIBLE) ========== */
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Single Shift</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-600">IN Time</div>
                <div className="text-lg font-semibold">
                  {attendanceDetail.inTime 
                    ? new Date(attendanceDetail.inTime).toLocaleTimeString() 
                    : '-'
                  }
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">OUT Time</div>
                <div className="text-lg font-semibold">
                  {attendanceDetail.outTime 
                    ? new Date(attendanceDetail.outTime).toLocaleTimeString() 
                    : '-'
                  }
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* ... rest of existing detail dialog content ... */}
      </div>
    </div>
  </div>
)}
```

---

## 🎨 Step 4: Add Helper Functions

Add these helper functions near the top of the component:

```typescript
// Helper to get status color
const getStatusColor = (status: string) => {
  switch (status) {
    case 'PRESENT': return 'text-green-600';
    case 'HALF_DAY': return 'text-yellow-600';
    case 'PARTIAL': return 'text-orange-600';
    case 'ABSENT': return 'text-red-600';
    case 'LEAVE': return 'text-blue-600';
    case 'OD': return 'text-purple-600';
    default: return 'text-slate-400';
  }
};

// Helper to format time
const formatTime = (dateString: string | null) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Helper to check if multi-shift
const isMultiShift = (record: AttendanceRecord | null) => {
  return record?.totalShifts && record.totalShifts > 1;
};
```

---

## 📱 Step 5: Add Shift Indicators Component

Create a reusable component for shift indicators:

```typescript
const ShiftIndicators = ({ count }: { count: number }) => {
  if (count <= 1) return null;
  
  return (
    <div className="flex items-center justify-center gap-0.5" title={`${count} shifts`}>
      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-blue-500"
        />
      ))}
    </div>
  );
};
```

---

## 🔄 Step 6: Update Summary Modal

If there's a monthly summary modal, update it to show multi-shift stats:

```typescript
{/* In Monthly Summary Modal */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  <div className="bg-white p-4 rounded-lg shadow">
    <div className="text-sm text-slate-600">Total Shifts Worked</div>
    <div className="text-2xl font-bold text-blue-600">
      {monthlySummary?.totalShiftsWorked || '-'}
    </div>
  </div>
  <div className="bg-white p-4 rounded-lg shadow">
    <div className="text-sm text-slate-600">Multi-Shift Days</div>
    <div className="text-2xl font-bold text-purple-600">
      {monthlySummary?.multiShiftDays || '-'}
    </div>
  </div>
  <div className="bg-white p-4 rounded-lg shadow">
    <div className="text-sm text-slate-600">Avg Shifts/Day</div>
    <div className="text-2xl font-bold text-green-600">
      {monthlySummary?.averageShiftsPerDay?.toFixed(1) || '-'}
    </div>
  </div>
  <div className="bg-white p-4 rounded-lg shadow">
    <div className="text-sm text-slate-600">Total OT Hours</div>
    <div className="text-2xl font-bold text-orange-600">
      {monthlySummary?.totalOTHours?.toFixed(1) || '-'}h
    </div>
  </div>
</div>
```

---

## 📋 Implementation Checklist

### Phase 1: TypeScript Updates
- [ ] Update [AttendanceRecord](file:///d:/li-hrms/frontend/src/app/superadmin/attendance/page.tsx#7-60) interface with multi-shift fields
- [ ] Add helper functions (getStatusColor, formatTime, isMultiShift)
- [ ] Create `ShiftIndicators` component

### Phase 2: Table Display
- [ ] Update table cell rendering to show shift indicators
- [ ] Add total hours display (use totalWorkingHours if available)
- [ ] Add hover tooltip showing shift count

### Phase 3: Detail Dialog
- [ ] Add shift cards section
- [ ] Display each shift with IN/OUT times
- [ ] Show shift-wise late/early indicators
- [ ] Add daily summary section
- [ ] Maintain backward compatibility for single shifts

### Phase 4: Summary Modal
- [ ] Add multi-shift statistics
- [ ] Show total shifts worked
- [ ] Display multi-shift days count
- [ ] Show average shifts per day

### Phase 5: Testing
- [ ] Test with single shift data (backward compatible)
- [ ] Test with 2 shifts
- [ ] Test with 3 shifts
- [ ] Test with incomplete shifts
- [ ] Test late/early indicators per shift

---

## 🎯 Visual Design Examples

### Table Cell (Multi-Shift)
```
┌──────────┐
│    P     │  ← Status badge
│   ●●●    │  ← 3 shift dots
│   16.5h  │  ← Total hours
└──────────┘
```

### Detail Dialog Shift Card
```
┌─────────────────────────────┐
│ ① Shift 1    ✓ Complete    │
│   Morning Shift              │
├─────────────────────────────┤
│ IN:  08:00 AM               │
│ OUT: 04:00 PM               │
├─────────────────────────────┤
│ Hours: 8.0h    OT: 0.0h     │
│ Late: 5m                    │
└─────────────────────────────┘
```

---

## 🚀 Quick Start

1. **Backup the file:**
   ```bash
   cp frontend/src/app/superadmin/attendance/page.tsx frontend/src/app/superadmin/attendance/page.tsx.backup
   ```

2. **Update TypeScript interfaces** (Lines 7-59)

3. **Add helper functions** (After imports)

4. **Update table rendering** (Lines 1482-1550)

5. **Update detail dialog** (Search for "showDetailDialog")

6. **Test with real data**

---

## 📞 Support Notes

- **Backward Compatible:** All changes maintain support for single-shift data
- **Gradual Rollout:** Can be deployed without breaking existing functionality
- **Data Migration:** No frontend migration needed - handles both formats

---

*Frontend Integration Guide Created: 2026-01-25*
