'use client';

import React from 'react';

interface LeaveWorkspaceAccessProps {
    workspacePermissions: Record<string, any>;
    workspaces: any[];
    onChange: (permissions: Record<string, any>) => void;
}

const LeaveWorkspaceAccess = ({ workspacePermissions, workspaces, onChange }: LeaveWorkspaceAccessProps) => {
    const update = (wsId: string, field: string, value: boolean) => {
        const next = { ...workspacePermissions };
        const currentWS = next[wsId] || { leave: { canApplyForSelf: false, canApplyForOthers: false }, od: { canApplyForSelf: false, canApplyForOthers: false } };

        // Support legacy and nested structures
        if (field.startsWith('leave.') || field.startsWith('od.')) {
            const [type, key] = field.split('.');
            next[wsId] = {
                ...currentWS,
                [type]: { ...currentWS[type], [key]: value }
            };
        }
        onChange(next);
    };

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Workspace Permissions</h3>
                    <p className="text-xs text-gray-500 mt-1">Control who can apply for Leave/OD in each branch.</p>
                </div>
            </div>

            <div className="overflow-x-auto rounded-[30px] border border-gray-100 dark:border-gray-800">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-md">
                        <tr>
                            <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-tighter">Workspace / Branch</th>
                            <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-tighter text-center">Self Leave</th>
                            <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-tighter text-center">Other Leave</th>
                            <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-tighter text-center">Self OD</th>
                            <th className="px-6 py-4 font-bold text-gray-400 uppercase tracking-tighter text-center">Other OD</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {workspaces.map((ws) => {
                            const p = workspacePermissions[ws._id] || {};
                            const l = p.leave || {};
                            const o = p.od || {};

                            return (
                                <tr key={ws._id} className="hover:bg-gray-50/30 dark:hover:bg-gray-900/20 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-bold text-[10px] text-gray-500">
                                                {ws.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">{ws.name}</p>
                                                <p className="text-[10px] text-gray-400">{ws.code || 'NO_CODE'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    {[
                                        { field: 'leave.canApplyForSelf', val: l.canApplyForSelf },
                                        { field: 'leave.canApplyForOthers', val: l.canApplyForOthers },
                                        { field: 'od.canApplyForSelf', val: o.canApplyForSelf },
                                        { field: 'od.canApplyForOthers', val: o.canApplyForOthers }
                                    ].map((cell, i) => (
                                        <td key={i} className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => update(ws._id, cell.field, !cell.val)}
                                                className={`inline-flex h-5 w-8 items-center rounded-full transition-colors ${cell.val ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${cell.val ? 'translate-x-4' : 'translate-x-1'}`} />
                                            </button>
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LeaveWorkspaceAccess;
