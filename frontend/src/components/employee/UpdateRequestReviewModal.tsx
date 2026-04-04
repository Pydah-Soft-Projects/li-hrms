import React from 'react';
import { Edit2, Plus, ShieldCheck } from 'lucide-react';
import Spinner from '@/components/Spinner';

interface UpdateRequestReviewModalProps {
    request: {
        _id: string;
        emp_no: string;
        status: string;
        employeeId?: {
            employee_name: string;
            dynamicFields?: Record<string, unknown>;
            [key: string]: unknown;
        };
        employee_id?: {
            _id: string;
            employee_name: string;
            profilePhoto?: string;
            emp_no: string;
            dynamicFields?: Record<string, unknown>;
        };
        requestedChanges: Record<string, unknown>;
        previousValues?: Record<string, unknown>;
    };
    rejectComments: string;
    setRejectComments: (comments: string) => void;
    processingUpdateRequest: boolean;
    formGroups: any;
    getFieldLabel: (field: string, settings: any) => string;
    onApprove: (id: string, selectedFields?: string[]) => void;
    onReject: (id: string) => void;
    onClose: () => void;
    divisions?: any[];
    departments?: any[];
    designations?: any[];
    employeeGroups?: any[];
}

export default function UpdateRequestReviewModal({
    request,
    rejectComments,
    setRejectComments,
    processingUpdateRequest,
    formGroups,
    getFieldLabel,
    onApprove,
    onReject,
    onClose,
    divisions = [],
    departments = [],
    designations = [],
    employeeGroups = [],
}: UpdateRequestReviewModalProps) {
    const [selectedFields, setSelectedFields] = React.useState<string[]>([]);

    const renderTableValue = React.useCallback((data: any[]) => {
        if (!data || data.length === 0) return '—';
        
        // Extract headers from the items (keys of the objects)
        const allKeys = new Set<string>();
        data.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(key => {
                    const lowerKey = key.toLowerCase();
                    if (!['certificateurl', 'certificatefile', '_id', 'id', '__v', 'isprefilled'].includes(lowerKey)) {
                        allKeys.add(key);
                    }
                });
            }
        });
        const headers = Array.from(allKeys);
        
        if (headers.length === 0) return `List (${data.length} items)`;

        return (
            <div className="mt-1 overflow-x-auto rounded-xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/40">
                <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50/80 dark:bg-slate-900/80 sticky top-0">
                        <tr>
                            {headers.map(header => (
                                <th key={header} className="px-3 py-2 font-black text-slate-500 uppercase tracking-widest whitespace-nowrap border-b border-slate-100 dark:border-slate-800">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                {headers.map(header => (
                                    <td key={header} className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium">
                                        {String(item[header] ?? '—')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }, []);

    const resolveValue = React.useCallback((val: any, fieldName: string): React.ReactNode => {
        if (val === null || val === undefined || val === '') return '—';

        // Direct Object Check
        if (typeof val === 'object' && val?.name && !Array.isArray(val)) return val.name;
        if (typeof val === 'object' && val?._id && !val.name && !Array.isArray(val)) val = val._id;

        // Handle Stringified JSON (if any, e.g. Qualifications)
        if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) {
                    if (fieldName.toLowerCase().includes('qualification')) {
                        return renderTableValue(parsed);
                    }
                    return `List (${parsed.length} items)`;
                }
                return 'Complex Object';
            } catch (e) {
                // Not valid JSON, continue with normal resolution
            }
        }

        // ID Resolution
        if (fieldName === 'division_id') {
            const found = divisions.find(d => String(d._id) === String(val) || String(d.id) === String(val));
            return found ? found.name : val;
        }
        if (fieldName === 'department_id') {
            const found = departments.find(d => String(d._id) === String(val) || String(d.id) === String(val));
            return found ? found.name : val;
        }
        if (fieldName === 'designation_id' || fieldName === 'designation') {
            const found = designations.find(d => String(d._id) === String(val) || String(d.id) === String(val));
            return found ? found.name : val;
        }
        if (fieldName === 'employee_group_id') {
            const found = employeeGroups.find(g => String(g._id) === String(val) || String(g.id) === String(val));
            return found ? found.name : val;
        }

        if (typeof val === 'object') {
            if (Array.isArray(val)) {
                if (fieldName.toLowerCase().includes('qualification')) {
                    return renderTableValue(val);
                }
                return `List (${val.length} items)`;
            }
            return 'Complex Object';
        }

        // Generic Date Check (YYYY-MM-DD or ISO)
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            try {
                return new Date(val).toLocaleDateString('en-GB');
            } catch (e) {
                return val;
            }
        }

        return String(val);
    }, [divisions, departments, designations, employeeGroups, renderTableValue]);

    React.useEffect(() => {
        if (request?.requestedChanges) {
            const noiseFields = [
                'allData', 'AllData', 'division', 'department', 'designation', 
                'employeeGroup', 'employee_group', 'dynamicFields', 'GenQualifications', 
                'AllAllowanceDeductions', 'leave_stats', 'payroll_stats', 
                'employeeAllowances', 'employeeDeductions', 'isProfileRequest',
                'getQualifications', 'setQualifications', 'updatedAt', 'lastLogin', 
                'createdAt', 'updated_at', 'last_login', 'created_at',
                'v', '_v', '__v'
            ];
            
            const initialFields = Object.entries(request.requestedChanges)
                .filter(([field, newValue]) => {
                    const isNoise = field.startsWith('_') || noiseFields.some(nf => nf.toLowerCase() === field.toLowerCase());
                    if (isNoise) return false;

                    const empData = (request.employeeId || request.employee_id) as Record<string, unknown>;
                    const oldValue = request.previousValues?.[field] ??
                        empData?.[field] ??
                        (empData?.dynamicFields as any)?.[field];

                    const normalize = (v: any) => {
                        if (v === null || v === undefined || v === '' || v === 0 || v === '0' || v === false || v === 'false') return null;
                        if (v === true || v === 'true') return true;
                        if (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '') return Number(v);
                        if (Array.isArray(v) && v.length === 0) return null;
                        if (typeof v === 'object' && Object.keys(v).length === 0 && !(v instanceof Date)) return null;
                        if (typeof v === 'string') return v.trim();
                        return v;
                    };

                    const nOld = normalize(oldValue);
                    const nNew = normalize(newValue);
                    if (JSON.stringify(nOld) === JSON.stringify(nNew)) return false;

                    const formattedOld = resolveValue(oldValue, field);
                    const formattedNew = resolveValue(newValue, field);
                    if (formattedOld === formattedNew) return false;

                    return true;
                })
                .map(([field]) => field);
            setSelectedFields(initialFields);
        }
    }, [request]);

    const toggleField = (field: string) => {
        setSelectedFields(prev => 
            prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
        );
    };


    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-950">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Review Update Request</h3>
                            <p className="text-sm text-slate-500">From {(request.employeeId || request.employee_id)?.employee_name} ({request.emp_no})</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <Plus className="h-6 w-6 rotate-45" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="max-h-[60vh] overflow-y-auto p-6">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                            <span>Current Value</span>
                            <span>Requested Change</span>
                        </div>
                        {Object.entries(request.requestedChanges)
                            .filter(([field, newValue]) => {
                                const noiseFields = [
                                    'allData', 'AllData', 'division', 'department', 'designation', 
                                    'employeeGroup', 'employee_group', 'dynamicFields', 'GenQualifications', 
                                    'AllAllowanceDeductions', 'leave_stats', 'payroll_stats', 
                                    'employeeAllowances', 'employeeDeductions', 'isProfileRequest',
                                    'getQualifications', 'setQualifications', 'updatedAt', 'lastLogin', 
                                    'createdAt', 'updated_at', 'last_login', 'created_at',
                                    'v', '_v', '__v'
                                ];
                                
                                const isNoise = field.startsWith('_') || noiseFields.some(nf => nf.toLowerCase() === field.toLowerCase());
                                if (isNoise) return false;

                                const empData = (request.employeeId || request.employee_id) as Record<string, unknown>;
                                const oldValue = request.previousValues?.[field] ??
                                    empData?.[field] ??
                                    (empData?.dynamicFields as any)?.[field];

                                const normalize = (v: any) => {
                                    if (v === null || v === undefined || v === '' || v === 0 || v === '0' || v === false || v === 'false') return null;
                                    if (v === true || v === 'true') return true;
                                    if (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '') return Number(v);
                                    if (Array.isArray(v) && v.length === 0) return null;
                                    if (typeof v === 'object' && Object.keys(v).length === 0 && !(v instanceof Date)) return null;
                                    if (typeof v === 'string') return v.trim();
                                    return v;
                                };

                                const nOld = normalize(oldValue);
                                const nNew = normalize(newValue);
                                if (JSON.stringify(nOld) === JSON.stringify(nNew)) return false;

                                const formattedOld = resolveValue(oldValue, field);
                                const formattedNew = resolveValue(newValue, field);
                                if (formattedOld === formattedNew) return false;

                                return true;
                            })
                            .map(([field, newValue]) => {
                                const isSelected = selectedFields.includes(field);
                                const empData = (request.employeeId || request.employee_id) as Record<string, unknown>;
                                const oldValue = request.previousValues?.[field] ??
                                    empData?.[field] ??
                                    (empData?.dynamicFields as any)?.[field];

                                const formattedOld = resolveValue(oldValue, field);
                                const formattedNew = resolveValue(newValue, field);

                                if (formattedOld === formattedNew) return null;

                                return (
                                    <div 
                                        key={field} 
                                        onClick={() => request.status === 'pending' && toggleField(field)}
                                        className={`group relative space-y-2 rounded-2xl border p-4 transition-all cursor-pointer ${
                                            isSelected 
                                                ? 'border-indigo-100 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-900/10 shadow-sm' 
                                                : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-transparent opacity-60 grayscale-[0.5]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                {request.status === 'pending' && (
                                                    <div className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                                                        isSelected 
                                                            ? 'border-indigo-500 bg-indigo-500 text-white' 
                                                            : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                                                    }`}>
                                                        {isSelected && <Plus className="h-3.5 w-3.5" />}
                                                    </div>
                                                )}
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                                    {getFieldLabel(field, formGroups)}
                                                </span>
                                            </div>
                                            {isSelected && <span className="text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Selected for update</span>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className={`text-sm ${typeof formattedOld === 'string' ? 'text-slate-500 line-through decoration-red-300/50' : ''}`}>
                                                {formattedOld}
                                            </div>
                                            <div className={`text-sm ${typeof formattedNew === 'string' ? 'font-semibold text-slate-900 dark:text-slate-100' : ''}`}>
                                                {formattedNew}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {request.status === 'pending' && (
                        <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
                            <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Rejection Comments (Optional)
                            </label>
                            <textarea
                                value={rejectComments}
                                onChange={(e) => setRejectComments(e.target.value)}
                                placeholder="Enter reason if rejecting..."
                                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm transition-all focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-900/20"
                                rows={3}
                            />
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 bg-slate-50/50 p-6 dark:bg-slate-900/50">
                    <button
                        onClick={onClose}
                        className="rounded-xl px-6 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        Close
                    </button>
                    {request.status === 'pending' && (
                        <>
                            <button
                                onClick={() => onReject(request._id)}
                                disabled={processingUpdateRequest}
                                className="rounded-xl bg-red-50 px-6 py-2.5 text-sm font-bold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => onApprove(request._id, selectedFields)}
                                disabled={processingUpdateRequest || selectedFields.length === 0}
                                className="group relative flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/40 disabled:opacity-50"
                            >
                                {processingUpdateRequest ? (
                                    <Spinner className="h-4 w-4 border-white" />
                                ) : (
                                    <ShieldCheck className="h-4 w-4" />
                                )}
                                Approve {selectedFields.length > 0 ? (selectedFields.length === Object.keys(request.requestedChanges).length ? 'All Changes' : `${selectedFields.length} Selected`) : 'Changes'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
