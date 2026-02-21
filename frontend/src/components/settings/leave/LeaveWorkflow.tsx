'use client';

import React from 'react';
import WorkflowManager, { WorkflowData } from '../shared/WorkflowManager';

interface LeaveWorkflowProps {
    workflow: WorkflowData;
    onChange: (workflow: WorkflowData) => void;
}

const LeaveWorkflow = ({ workflow, onChange }: LeaveWorkflowProps) => {
    return (
        <WorkflowManager
            workflow={workflow}
            onChange={onChange}
            title="Multi-Level Approval"
            description="Workflow Engine for automated authorization."
        />
    );
};

export default LeaveWorkflow;
