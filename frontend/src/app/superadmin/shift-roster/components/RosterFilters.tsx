import React, { memo } from 'react';
import { Building2, Filter, Calendar } from 'lucide-react';

interface RosterFiltersProps {
    selectedDivision: string;
    setSelectedDivision: (val: string) => void;
    divisions: Array<{ _id: string; name: string }>;
    selectedDept: string;
    setSelectedDept: (val: string) => void;
    departments: Array<{ _id: string; name: string }>;
    month: string;
    setMonth: (val: string) => void;
    setPage: (p: number) => void;
}

const RosterFilters = memo(({
    selectedDivision,
    setSelectedDivision,
    divisions,
    selectedDept,
    setSelectedDept,
    departments,
    month,
    setMonth,
    setPage
}: RosterFiltersProps) => {
    return (
        <div className="flex flex-wrap items-center gap-3">
            {/* Division Filter */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
                <Building2 size={14} className="text-slate-400" />
                <select
                    value={selectedDivision}
                    onChange={(e) => {
                        setSelectedDivision(e.target.value);
                        setSelectedDept('');
                        setPage(1);
                    }}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]"
                >
                    <option value="">All Divisions</option>
                    {divisions.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
                <Filter size={14} className="text-slate-400" />
                <select
                    value={selectedDept}
                    onChange={(e) => {
                        setSelectedDept(e.target.value);
                        setPage(1);
                    }}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none min-w-[120px]"
                >
                    <option value="">All Depts</option>
                    {departments.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Month Filter */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
                <Calendar size={14} className="text-slate-400" />
                <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                        setMonth(e.target.value);
                        setPage(1);
                    }}
                    className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none"
                />
            </div>
        </div>
    );
});

RosterFilters.displayName = 'RosterFilters';

export default RosterFilters;
