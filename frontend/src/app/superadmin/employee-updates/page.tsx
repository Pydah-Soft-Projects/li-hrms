'use client';

import React, { useState, useEffect } from 'react';
import { 
    api, 
    Department, 
    Division, 
    Designation, 
    EmployeeGroup 
} from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import {
    CheckCircle,
    XCircle,
    User,
    Clock,
    ArrowRight,
    Filter,
    Search,
    ChevronDown,
    AlertCircle,
    Check,
    RefreshCw,
    Plus
} from 'lucide-react';
import UpdateRequestReviewModal from '@/components/employee/UpdateRequestReviewModal';

interface UpdateRequest {
    _id: string;
    employee_id: {
        _id: string;
        employee_name: string;
        profilePhoto?: string;
        emp_no: string;
        department?: { name: string };
        designation?: { name: string };
    };
    emp_no: string;
    requestedChanges: Record<string, any>;
    previousValues: Record<string, any>;
    status: 'pending' | 'approved' | 'rejected';
    createdBy: { name: string };
    comments?: string;
    createdAt: string;
}

const UpdateRequestsPage = () => {
    const [requests, setRequests] = useState<UpdateRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('pending');
    const [selectedRequest, setSelectedRequest] = useState<UpdateRequest | null>(null);
    const [processing, setProcessing] = useState(false);
    const [formGroups, setFormGroups] = useState<any[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
    const [rejectComments, setRejectComments] = useState('');

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const res = await api.getEmployeeUpdateRequests({ status: statusFilter !== 'all' ? statusFilter : undefined });
            if (res.success) {
                setRequests(res.data || []);
            }
        } catch (err) {
            toast.error('Failed to fetch update requests');
        } finally {
            setLoading(false);
        }
    };

    const fetchFormSettings = async () => {
        try {
            const res = await api.getFormSettings();
            if (res.success) {
                setFormGroups(res.data.groups);
            }
        } catch (err) {
            console.error('Failed to fetch form settings');
        }
    };

    const fetchReferences = async () => {
        try {
            const [divRes, deptRes, desRes, groupRes] = await Promise.all([
                api.getDivisions(),
                api.getDepartments(),
                api.getDesignations(),
                api.getEmployeeGroups()
            ]);
            if (divRes.success) setDivisions(divRes.data || []);
            if (deptRes.success) setDepartments(deptRes.data || []);
            if (desRes.success) setDesignations(desRes.data || []);
            if (groupRes.success) setEmployeeGroups(groupRes.data || []);
        } catch (err) {
            console.error('Failed to fetch references');
        }
    };

    useEffect(() => {
        fetchRequests();
        fetchFormSettings();
        fetchReferences();
    }, [statusFilter]);

    const handleApprove = async (id: string, selectedFields?: string[]) => {
        if (!selectedRequest) return;
        
        try {
            setProcessing(true);
            const res = await api.approveEmployeeUpdateRequest(id, selectedFields);
            if (res.success) {
                toast.success('Request approved successfully');
                setSelectedRequest(null);
                fetchRequests();
            } else {
                toast.error(res.message || 'Failed to approve request');
            }
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (id: string, reason: string) => {
        try {
            setProcessing(true);
            const res = await api.rejectEmployeeUpdateRequest(id, reason);
            if (res.success) {
                toast.success('Request rejected');
                setSelectedRequest(null);
                fetchRequests();
            } else {
                toast.error(res.message || 'Failed to reject request');
            }
        } catch (err) {
            toast.error('An error occurred');
        } finally {
            setProcessing(false);
        }
    };

    const getFieldLabel = (fieldId: string, settings?: any) => {
        const groups = settings || formGroups;
        if (fieldId === 'qualifications') return 'Qualifications';
        if (!groups) return fieldId;
        for (const group of groups) {
            const field = group.fields.find((f: any) => f.id === fieldId);
            if (field) return field.label;
        }
        return fieldId;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-10">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Profile Requests</h1>
                        <p className="text-slate-500 mt-2 font-medium">Review and approve changes requested by employees to their profile records.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex">
                            {['pending', 'approved', 'rejected', 'all'].map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${statusFilter === status
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => fetchRequests()}
                            className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="h-64 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <Spinner />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-4">Loading Profile Requests...</p>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm text-center px-6">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                            <Clock className="w-8 h-8 text-slate-200" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">No requests found</h3>
                        <p className="text-slate-400 text-sm mt-1">There are no profile requests matching your current filter.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {requests.map((request) => (
                            <div
                                key={request._id}
                                onClick={() => setSelectedRequest(request)}
                                className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all p-6 cursor-pointer group flex flex-col"
                            >
                                <div className="flex items-start justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-100 ring-4 ring-slate-50/50">
                                            {request.employee_id?.profilePhoto ? (
                                                <img src={request.employee_id.profilePhoto} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-6 h-6 text-slate-300" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{request.employee_id?.employee_name || 'Unknown Employee'}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{request.emp_no}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${request.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                        request.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            'bg-red-50 text-red-600 border-red-100'
                                        }`}>
                                        {request.status}
                                    </span>
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Requested Changes</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(request.requestedChanges)
                                                .filter(([key, newValue]) => {
                                                    const noiseFields = [
                                                        'allData', 'AllData', 'division', 'department', 'designation', 
                                                        'employeeGroup', 'employee_group', 'dynamicFields', 'GenQualifications', 
                                                        'AllAllowanceDeductions', 'leave_stats', 'payroll_stats', 
                                                        'employeeAllowances', 'employeeDeductions', 'isProfileRequest',
                                                        'getQualifications', 'setQualifications', 'updatedAt', 'lastLogin', 
                                                        'createdAt', 'updated_at', 'last_login', 'created_at',
                                                        'v', '_v', '__v'
                                                    ];
                                                    if (key.startsWith('_') || noiseFields.some(nf => nf.toLowerCase() === key.toLowerCase())) return false;

                                                    // Resolve old value for phantom change detection
                                                    const oldValue = request.previousValues?.[key];
                                                    
                                                    const normalize = (v: any) => {
                                                        if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
                                                        if (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '') return Number(v);
                                                        if (Array.isArray(v) && v.length === 0) return null;
                                                        if (typeof v === 'object' && Object.keys(v).length === 0 && !(v instanceof Date)) return null;
                                                        return v;
                                                    };

                                                    return JSON.stringify(normalize(oldValue)) !== JSON.stringify(normalize(newValue));
                                                })
                                                .map(([key]) => (
                                                    <span key={key} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-100">
                                                        {getFieldLabel(key, formGroups)}
                                                    </span>
                                                ))}
                                        </div>
                                    </div>

                                    {request.comments && (
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 italic text-xs text-slate-500">
                                            &ldquo;{request.comments}&rdquo;
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between text-slate-400">
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">{formatDate(request.createdAt)}</span>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transform group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Comparison Modal */}
            {selectedRequest && (
                <UpdateRequestReviewModal
                    request={selectedRequest}
                    rejectComments={rejectComments}
                    setRejectComments={setRejectComments}
                    processingUpdateRequest={processing}
                    formGroups={formGroups}
                    getFieldLabel={getFieldLabel}
                    onApprove={handleApprove}
                    onReject={(reason) => handleReject(selectedRequest._id, reason)}
                    onClose={() => {
                        setSelectedRequest(null);
                    }}
                    divisions={divisions}
                    departments={departments}
                    designations={designations}
                    employeeGroups={employeeGroups}
                />
            )}
        </div>
    );
};

export default UpdateRequestsPage;
