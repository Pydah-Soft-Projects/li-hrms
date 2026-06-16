'use client';

import React from 'react';
import WorkflowManager, { WorkflowData } from '../shared/WorkflowManager';
import { SettingsSectionCard } from '../SettingsPageShell';
import { SettingsWorkflowTheme } from '../SettingsThemeContext';

interface LeaveWorkflowProps {
    workflow: WorkflowData;
    onChange: (workflow: WorkflowData) => void;
}

const LeaveWorkflow = ({ workflow, onChange }: LeaveWorkflowProps) => {
    return (
        <SettingsWorkflowTheme>
            <SettingsSectionCard title="Multi-level approval" description="Workflow engine for automated authorization.">
                <WorkflowManager
                    workflow={workflow}
                    onChange={onChange}
                    title="Approval steps"
                    description="Configure approver roles and final authority."
                />
            </SettingsSectionCard>
        </SettingsWorkflowTheme>
    );
};

export default LeaveWorkflow;
