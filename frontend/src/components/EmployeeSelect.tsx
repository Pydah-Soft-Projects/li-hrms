import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { api, Employee } from '@/lib/api';

interface EmployeeSelectProps {
    value: string; // The selected employee ID or emp_no
    onChange: (employee: Employee | null) => void;
    error?: string;
    placeholder?: string;
    className?: string;
    required?: boolean;
    disabled?: boolean;
}

export default function EmployeeSelect({
    value,
    onChange,
    error,
    placeholder = "Search by name, emp no, or department...",
    className = "",
    required = false,
    disabled = false
}: EmployeeSelectProps) {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Initial load of default employees (limit 50)
    useEffect(() => {
        let isMounted = true;
        const loadInitial = async () => {
            try {
                const res = await api.getEmployees({ is_active: true, limit: 50 });
                if (isMounted && res.success) {
                    setEmployees(res.data || []);
                }
            } catch (err) {
                console.error('Failed to load initial employees:', err);
            }
        };
        loadInitial();
        return () => { isMounted = false; };
    }, []);

    // Debounced Search Effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!employeeSearch.trim()) {
                // If search is empty, we don't necessarily need to refetch if we already have the initial 50,
                // but to be safe and reset, we could fetch or just let frontend filter handle it.
                // We'll rely on the frontend filter for empty search to show the first 50.
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            try {
                const query: any = { is_active: true, search: employeeSearch, limit: 50 };
                const res = await api.getEmployees(query);
                if (res.success && res.data) {
                    // Merge results or just replace. Replacing is cleaner for search results.
                    setEmployees(res.data);
                }
            } catch (error) {
                console.error('Error searching employees:', error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [employeeSearch]);

    // Sync selected API value with local selectedEmployee object
    useEffect(() => {
        if (!value) {
            if (selectedEmployee !== null) {
                setSelectedEmployee(null);
                setEmployeeSearch('');
            }
            return;
        }

        // If value changes from outside, try to find it in our local list
        const found = employees.find(e => e._id === value || e.emp_no === value);
        if (found && found._id !== selectedEmployee?._id) {
            setSelectedEmployee(found);
        } else if (!found && value !== selectedEmployee?._id && value !== selectedEmployee?.emp_no) {
            // If we don't have it locally, we might need to fetch it specifically.
            // For now, we assume the parent handles passing the correct value after selection.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, employees]);

    const getEmployeeName = (emp: Employee) => {
        return emp.employee_name || 'Unknown';
    };

    const getEmployeeInitials = (emp: Employee) => {
        const name = getEmployeeName(emp);
        return name.charAt(0).toUpperCase();
    };

    // Frontend filtering
    const filteredEmployees = employees.filter((emp) => {
        if (!employeeSearch.trim()) return true;
        const searchLower = employeeSearch.toLowerCase();
        const fullName = getEmployeeName(emp).toLowerCase();
        return (
            fullName.includes(searchLower) ||
            emp.emp_no?.toLowerCase().includes(searchLower) ||
            emp.department?.name?.toLowerCase().includes(searchLower)
        );
    });


    const handleSelect = (emp: Employee) => {
        setSelectedEmployee(emp);
        setEmployeeSearch('');
        setShowDropdown(false);
        onChange(emp);
    };

    const handleClear = () => {
        setSelectedEmployee(null);
        setEmployeeSearch('');
        onChange(null);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {selectedEmployee ? (
                <div className={`flex items-center justify-between p-2 rounded-xl border ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${error ? 'bg-red-400' : 'bg-gradient-to-br from-blue-500 to-indigo-500'}`}>
                            {getEmployeeInitials(selectedEmployee)}
                        </div>
                        <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {getEmployeeName(selectedEmployee)}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                {selectedEmployee.emp_no}
                                {selectedEmployee.department?.name && ` • ${selectedEmployee.department.name}`}
                                {selectedEmployee.designation?.name && ` • ${selectedEmployee.designation.name}`}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className={`w-5 h-5 ${error ? 'text-red-400' : 'text-slate-400'}`} />
                    </div>
                    <input
                        type="text"
                        value={employeeSearch}
                        onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        placeholder={placeholder}
                        disabled={disabled}
                        className={`w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 
              ${error
                                ? 'border-red-300 bg-red-50 text-red-900 placeholder-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/30 dark:bg-red-900/10 dark:text-red-200'
                                : disabled
                                    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/50'
                                    : 'border-slate-200 bg-white text-slate-900 focus:border-blue-400 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500'}`}
                        required={required}
                    />

                    {showDropdown && (
                        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                            {isSearching ? (
                                <div className="p-4 flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                    <span className="text-xs">Searching employees...</span>
                                </div>
                            ) : filteredEmployees.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-500">
                                    {employeeSearch
                                        ? 'No employees found matching your search'
                                        : 'Type to search employees'}
                                </div>
                            ) : (
                                filteredEmployees.map((emp, idx) => (
                                    <button
                                        key={emp._id || emp.emp_no || `emp-${idx}`}
                                        type="button"
                                        onClick={() => handleSelect(emp)}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-left transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                                    >
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-sm font-medium">
                                            {getEmployeeInitials(emp)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-slate-900 dark:text-white truncate">
                                                {getEmployeeName(emp)}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {emp.emp_no} • {emp.department?.name || 'No Department'} {emp.designation?.name ? `• ${emp.designation.name}` : ''}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                            {filteredEmployees.length >= 50 && (
                                <div className="px-4 py-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700">
                                    Showing top 50 results. Keep typing to filter further.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
