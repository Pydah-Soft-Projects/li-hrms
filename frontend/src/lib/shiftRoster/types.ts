import { Shift, Employee } from '@/lib/api';

export type RosterHalfNonWorking = 'WO' | 'HOL';

export type RosterCell = {
  shiftId?: string | null;
  status?: RosterHalfNonWorking;
  firstHalfStatus?: RosterHalfNonWorking;
  secondHalfStatus?: RosterHalfNonWorking;
  notes?: string;
};

export type RosterState = Map<string, Record<string, RosterCell>>;

export interface RosterFiltersProps {
  selectedDivision: string;
  setSelectedDivision: (val: string) => void;
  divisions: Array<{ _id: string; name: string }>;
  selectedDept: string;
  setSelectedDept: (val: string) => void;
  departments: Array<{ _id: string; name: string }>;
  selectedDesignation: string;
  setSelectedDesignation: (val: string) => void;
  designations: Array<{ _id: string; name: string }>;
  selectedGroup: string;
  setSelectedGroup: (val: string) => void;
  groups: any[];
  month: string;
  setMonth: (val: string) => void;
  setPage: (p: number) => void;
  cycleDates: { startDate: string; endDate: string; label: string } | null;
}

export interface SearchSectionProps {
  value: string;
  onSearchChange: (term: string) => void;
  onSearchSubmit: () => void;
}

export interface QuickAssignSectionProps {
  weekdays: string[];
  shiftAssignDays: Record<string, boolean>;
  setShiftAssignDays: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedShiftForAssign: string;
  setSelectedShiftForAssign: (val: string) => void;
  shifts: Shift[];
  handleAssignAll: () => void;
  handleAssignSelected: () => void;
  selectedCount: number;
  shiftLabel: (s?: Shift | null) => string;
}

export interface RosterGridProps {
  loading: boolean;
  weekdays: string[];
  selectedEmpNos: Set<string>;
  onToggleSelectEmployee: (empNo: string) => void;
  onToggleSelectAll: () => void;
  allOnPageSelected: boolean;
  someOnPageSelected: boolean;
  filteredEmployees: Employee[];
  totalEmployees: number;
  page: number;
  setPage: (p: number) => void;
  limit: number;
  setLimit: (l: number) => void;
  totalPages: number;
  days: string[];
  roster: RosterState;
  dirtyKeys: Set<string>;
  holidayCache: Map<string, Set<string>>;
  shifts: Shift[];
  updateCell: (empNo: string, date: string, value: RosterCell) => void;
  applyDayToRestOfWeek: (empNo: string, sourceDate: string) => void;
  applyColumnDay: (date: string, value: RosterCell) => void;
  onDuplicateRow: (sourceEmpNo: string) => void;
  applyEmployeeAllDays: (empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => void;
  applyEmployeeWeekdays: (empNo: string, assignmentValue: string, weekdayFlags: Record<string, boolean>) => void;
  globalHolidayDates: Set<string>;
  shiftLabel: (s?: Shift | null) => string;
}

export interface AssignmentSummaryItem {
  employee: Employee;
  shifts: Array<{ shiftId: string | null; shiftLabel: string; days: number; dates: string[] }>;
  totalDays: number;
  weekOffs: number;
  holidays: number;
}

export interface AssignmentsViewProps {
  filteredAssignedSummary: AssignmentSummaryItem[];
  shifts: Shift[];
  shiftLabel: (s?: Shift | null) => string;
}

export type CycleDates = { startDate: string; endDate: string; label: string };

export type RosterListQuery = {
  page: number;
  limit: number;
  selectedDept: string;
  selectedDivision: string;
  selectedDesignation: string;
  selectedGroup: string;
  searchQuery: string;
  cycleDates: CycleDates | null;
};
