import React from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, User, MessageSquare } from 'lucide-react';

interface ApprovalStep {
    stepOrder: number;
    role: string;
    label: string;
    status: 'pending' | 'approved' | 'rejected' | 'skipped';
    actionBy?: string;
    actionByName?: string;
    actionByRole?: string;
    comments?: string;
    updatedAt?: string;
    isCurrent?: boolean;
}

interface WorkflowTimelineProps {
    workflow: {
        approvalChain?: ApprovalStep[];
        currentStepRole?: string;
        isCompleted?: boolean;
        // Fallback/Legacy
        history?: any[];
    };
}

export default function WorkflowTimeline({ workflow }: WorkflowTimelineProps) {
    // If no dynamic chain, we might want to show legacy or nothing.
    // For now, let's assume if approvalChain exists, we use it.
    const steps = workflow?.approvalChain;

    if (!steps || steps.length === 0) {
        return (
            <div className="text-sm text-gray-500 italic">
                No workflow details available.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                Approval Progress
            </h3>

            <div className="relative">
                {steps.map((step, index) => {
                    const isLast = index === steps.length - 1;
                    const isCompleted = step.status === 'approved' || step.status === 'skipped';
                    const isRejected = step.status === 'rejected';
                    const isCurrent = step.isCurrent && !isCompleted && !isRejected;
                    const isPending = step.status === 'pending' && !isCurrent;

                    return (
                        <div key={step.stepOrder} className="relative flex gap-4 pb-8 last:pb-0">
                            {/* Connecting Line */}
                            {!isLast && (
                                <div
                                    className={`absolute left-3.5 top-8 bottom-0 w-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                                        }`}
                                />
                            )}

                            {/* Status Icon */}
                            <div className="relative z-10 shrink-0 mt-0.5">
                                {isCompleted ? (
                                    <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center border-2 border-white dark:border-gray-800 ring-2 ring-green-50 dark:ring-green-900/20">
                                        <CheckCircle className="w-4 h-4" />
                                    </div>
                                ) : isRejected ? (
                                    <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center border-2 border-white dark:border-gray-800 ring-2 ring-red-50 dark:ring-red-900/20">
                                        <XCircle className="w-4 h-4" />
                                    </div>
                                ) : isCurrent ? (
                                    <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border-2 border-white dark:border-gray-800 ring-2 ring-blue-50 dark:ring-blue-900/20 animate-pulse">
                                        <Clock className="w-4 h-4" />
                                    </div>
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center border-2 border-white dark:border-gray-800">
                                        <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                    </div>
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className={`text-sm font-medium ${isCurrent ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                                            }`}>
                                            {step.label}
                                        </h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {isCompleted ? `Approved by ${step.actionByName || 'Unknown'}` :
                                                isRejected ? `Rejected by ${step.actionByName || 'Unknown'}` :
                                                    isCurrent ? 'Awaiting Approval' : 'Pending'}
                                        </p>
                                    </div>
                                    {step.updatedAt && (
                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(step.updatedAt).toLocaleString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    )}
                                </div>

                                {/* Comments Bubble */}
                                {step.comments && (
                                    <div className="mt-3 flex gap-2 items-start p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700">
                                        <MessageSquare className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                                        <span>{step.comments}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
