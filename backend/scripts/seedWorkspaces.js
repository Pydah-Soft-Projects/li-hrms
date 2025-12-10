/**
 * Seed Script for Default Modules and Workspaces
 * Run with: node scripts/seedWorkspaces.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Module = require('../workspaces/model/Module');
const Workspace = require('../workspaces/model/Workspace');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';

// Default Modules
const defaultModules = [
  {
    name: 'Dashboard',
    code: 'DASHBOARD',
    description: 'Overview and summary dashboard',
    icon: 'dashboard',
    route: '/dashboard',
    category: 'core',
    sortOrder: 1,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Dashboard', description: 'Can view the dashboard' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Data', description: 'Personal statistics only' },
      { key: 'department', label: 'Department Data', description: 'Department statistics' },
      { key: 'all', label: 'All Data', description: 'Organization-wide statistics' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Leave Management',
    code: 'LEAVE',
    description: 'Apply, track, and manage leave requests',
    icon: 'calendar',
    route: '/leaves',
    category: 'hr',
    sortOrder: 2,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Leaves', description: 'Can view leave requests' },
      { key: 'canCreate', label: 'Apply Leave', description: 'Can submit leave applications' },
      { key: 'canEdit', label: 'Edit Leave', description: 'Can edit leave requests' },
      { key: 'canDelete', label: 'Delete Leave', description: 'Can delete leave requests' },
      { key: 'canApprove', label: 'Approve Leave', description: 'Can approve/reject leave requests' },
      { key: 'canForward', label: 'Forward Leave', description: 'Can forward leave requests to next level' },
      { key: 'canExport', label: 'Export Data', description: 'Can export leave data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Leaves', description: 'Only personal leave requests' },
      { key: 'department', label: 'Department Leaves', description: 'All leaves in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Leaves from assigned departments' },
      { key: 'all', label: 'All Leaves', description: 'All leave requests in organization' },
    ],
    defaultPermissions: { canView: true, canCreate: true, canEdit: false, canDelete: false },
  },
  {
    name: 'Attendance',
    code: 'ATTENDANCE',
    description: 'Track and manage attendance records',
    icon: 'clock',
    route: '/attendance',
    category: 'hr',
    sortOrder: 3,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Attendance', description: 'Can view attendance records' },
      { key: 'canCreate', label: 'Mark Attendance', description: 'Can mark attendance manually' },
      { key: 'canEdit', label: 'Edit Attendance', description: 'Can correct attendance records' },
      { key: 'canDelete', label: 'Delete Attendance', description: 'Can delete attendance records' },
      { key: 'canExport', label: 'Export Data', description: 'Can export attendance data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Attendance', description: 'Only personal attendance' },
      { key: 'department', label: 'Department Attendance', description: 'All attendance in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Attendance from assigned departments' },
      { key: 'all', label: 'All Attendance', description: 'All attendance in organization' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Employees',
    code: 'EMPLOYEES',
    description: 'Employee master data management',
    icon: 'users',
    route: '/employees',
    category: 'hr',
    sortOrder: 4,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Employees', description: 'Can view employee records' },
      { key: 'canCreate', label: 'Create Employee', description: 'Can add new employees' },
      { key: 'canEdit', label: 'Edit Employee', description: 'Can edit employee data' },
      { key: 'canDelete', label: 'Delete Employee', description: 'Can delete employees' },
      { key: 'canExport', label: 'Export Data', description: 'Can export employee data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Profile', description: 'Only personal profile' },
      { key: 'department', label: 'Department Employees', description: 'All employees in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Employees from assigned departments' },
      { key: 'all', label: 'All Employees', description: 'All employees in organization' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Departments',
    code: 'DEPARTMENTS',
    description: 'Department and designation management',
    icon: 'building',
    route: '/departments',
    category: 'admin',
    sortOrder: 5,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Departments', description: 'Can view departments' },
      { key: 'canCreate', label: 'Create Department', description: 'Can add new departments' },
      { key: 'canEdit', label: 'Edit Department', description: 'Can edit department data' },
      { key: 'canDelete', label: 'Delete Department', description: 'Can delete departments' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Department', description: 'Only own department' },
      { key: 'all', label: 'All Departments', description: 'All departments' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Shifts',
    code: 'SHIFTS',
    description: 'Shift scheduling and management',
    icon: 'clock',
    route: '/shifts',
    category: 'admin',
    sortOrder: 6,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Shifts', description: 'Can view shifts' },
      { key: 'canCreate', label: 'Create Shift', description: 'Can create new shifts' },
      { key: 'canEdit', label: 'Edit Shift', description: 'Can edit shifts' },
      { key: 'canDelete', label: 'Delete Shift', description: 'Can delete shifts' },
    ],
    availableScopes: [
      { key: 'own', label: 'Assigned Shifts', description: 'Only assigned shifts' },
      { key: 'all', label: 'All Shifts', description: 'All shifts' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Users',
    code: 'USERS',
    description: 'User account management',
    icon: 'user',
    route: '/users',
    category: 'admin',
    sortOrder: 7,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Users', description: 'Can view user accounts' },
      { key: 'canCreate', label: 'Create User', description: 'Can create new users' },
      { key: 'canEdit', label: 'Edit User', description: 'Can edit user accounts' },
      { key: 'canDelete', label: 'Delete User', description: 'Can delete users' },
    ],
    availableScopes: [
      { key: 'all', label: 'All Users', description: 'All user accounts' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Reports',
    code: 'REPORTS',
    description: 'Generate and view reports',
    icon: 'chart',
    route: '/reports',
    category: 'reports',
    sortOrder: 8,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Reports', description: 'Can view reports' },
      { key: 'canExport', label: 'Export Reports', description: 'Can export report data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Data', description: 'Reports for own data only' },
      { key: 'department', label: 'Department Data', description: 'Reports for department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Reports for assigned departments' },
      { key: 'all', label: 'All Data', description: 'Organization-wide reports' },
    ],
    defaultPermissions: { canView: true, canExport: false },
  },
  {
    name: 'Settings',
    code: 'SETTINGS',
    description: 'System settings and configuration',
    icon: 'settings',
    route: '/settings',
    category: 'settings',
    sortOrder: 9,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Settings', description: 'Can view settings' },
      { key: 'canEdit', label: 'Edit Settings', description: 'Can modify settings' },
    ],
    availableScopes: [
      { key: 'all', label: 'All Settings', description: 'All system settings' },
    ],
    defaultPermissions: { canView: true, canEdit: false },
  },
  {
    name: 'Profile',
    code: 'PROFILE',
    description: 'Personal profile management',
    icon: 'user',
    route: '/profile',
    category: 'core',
    sortOrder: 10,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Profile', description: 'Can view own profile' },
      { key: 'canEdit', label: 'Edit Profile', description: 'Can edit own profile' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Profile', description: 'Personal profile only' },
    ],
    defaultPermissions: { canView: true, canEdit: true },
  },
  {
    name: 'Team',
    code: 'TEAM',
    description: 'View team members and structure',
    icon: 'users',
    route: '/team',
    category: 'core',
    sortOrder: 11,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Team', description: 'Can view team members' },
    ],
    availableScopes: [
      { key: 'department', label: 'Department Team', description: 'Team members in department' },
      { key: 'assigned', label: 'Assigned Teams', description: 'Assigned team members' },
      { key: 'all', label: 'All Teams', description: 'All team members' },
    ],
    defaultPermissions: { canView: true },
  },
  {
    name: 'Workspaces',
    code: 'WORKSPACES',
    description: 'Workspace management (Super Admin only)',
    icon: 'workspace',
    route: '/workspaces',
    category: 'admin',
    sortOrder: 12,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Workspaces', description: 'Can view workspaces' },
      { key: 'canCreate', label: 'Create Workspace', description: 'Can create workspaces' },
      { key: 'canEdit', label: 'Edit Workspace', description: 'Can edit workspaces' },
      { key: 'canDelete', label: 'Delete Workspace', description: 'Can delete workspaces' },
    ],
    availableScopes: [
      { key: 'all', label: 'All Workspaces', description: 'All workspaces' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Loan & Salary Advance',
    code: 'LOANS',
    description: 'Loan and salary advance management',
    icon: 'dollar-sign',
    route: '/loans',
    category: 'hr',
    sortOrder: 13,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Loans', description: 'Can view loan applications' },
      { key: 'canCreate', label: 'Create Loan', description: 'Can create loan applications' },
      { key: 'canEdit', label: 'Edit Loan', description: 'Can edit loan applications' },
      { key: 'canDelete', label: 'Delete Loan', description: 'Can delete loan applications' },
      { key: 'canApprove', label: 'Approve Loan', description: 'Can approve/reject loan applications' },
      { key: 'canExport', label: 'Export Data', description: 'Can export loan data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Loans', description: 'Only personal loan applications' },
      { key: 'department', label: 'Department Loans', description: 'All loans in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Loans from assigned departments' },
      { key: 'all', label: 'All Loans', description: 'All loan applications in organization' },
    ],
    defaultPermissions: { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false },
  },
  {
    name: 'OT & Permissions',
    code: 'OT_PERMISSIONS',
    description: 'Overtime and permission management',
    icon: 'clock',
    route: '/ot-permissions',
    category: 'hr',
    sortOrder: 14,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View OT/Permissions', description: 'Can view OT and permission requests' },
      { key: 'canCreate', label: 'Create Request', description: 'Can submit OT/permission requests' },
      { key: 'canEdit', label: 'Edit Request', description: 'Can edit OT/permission requests' },
      { key: 'canDelete', label: 'Delete Request', description: 'Can delete OT/permission requests' },
      { key: 'canApprove', label: 'Approve Request', description: 'Can approve/reject requests' },
      { key: 'canExport', label: 'Export Data', description: 'Can export OT/permission data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Requests', description: 'Only personal OT/permission requests' },
      { key: 'department', label: 'Department Requests', description: 'All requests in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Requests from assigned departments' },
      { key: 'all', label: 'All Requests', description: 'All OT/permission requests in organization' },
    ],
    defaultPermissions: { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false },
  },
  {
    name: 'Confused Shifts',
    code: 'CONFUSED_SHIFTS',
    description: 'Manage and resolve confused shift records',
    icon: 'alert-circle',
    route: '/confused-shifts',
    category: 'hr',
    sortOrder: 15,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Confused Shifts', description: 'Can view confused shift records' },
      { key: 'canEdit', label: 'Resolve Shift', description: 'Can resolve confused shifts' },
      { key: 'canDelete', label: 'Delete Record', description: 'Can delete confused shift records' },
      { key: 'canExport', label: 'Export Data', description: 'Can export confused shift data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Records', description: 'Only personal confused shift records' },
      { key: 'department', label: 'Department Records', description: 'All records in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Records from assigned departments' },
      { key: 'all', label: 'All Records', description: 'All confused shift records in organization' },
    ],
    defaultPermissions: { canView: true, canEdit: false, canDelete: false },
  },
  {
    name: 'Allowances & Deductions',
    code: 'ALLOWANCES_DEDUCTIONS',
    description: 'Manage allowances and deductions',
    icon: 'dollar-sign',
    route: '/allowances-deductions',
    category: 'admin',
    sortOrder: 16,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Allowances/Deductions', description: 'Can view allowances and deductions' },
      { key: 'canCreate', label: 'Create Item', description: 'Can create new allowances/deductions' },
      { key: 'canEdit', label: 'Edit Item', description: 'Can edit allowances/deductions' },
      { key: 'canDelete', label: 'Delete Item', description: 'Can delete allowances/deductions' },
      { key: 'canExport', label: 'Export Data', description: 'Can export allowances/deductions data' },
    ],
    availableScopes: [
      { key: 'all', label: 'All Items', description: 'All allowances and deductions' },
    ],
    defaultPermissions: { canView: true, canCreate: false, canEdit: false, canDelete: false },
  },
  {
    name: 'Payroll Transactions',
    code: 'PAYROLL_TRANSACTIONS',
    description: 'View payroll transactions and analytics',
    icon: 'file-text',
    route: '/payroll-transactions',
    category: 'reports',
    sortOrder: 17,
    isSystem: true,
    availablePermissions: [
      { key: 'canView', label: 'View Transactions', description: 'Can view payroll transactions' },
      { key: 'canExport', label: 'Export Data', description: 'Can export payroll transaction data' },
    ],
    availableScopes: [
      { key: 'own', label: 'Own Transactions', description: 'Only personal payroll transactions' },
      { key: 'department', label: 'Department Transactions', description: 'All transactions in department' },
      { key: 'assigned', label: 'Assigned Departments', description: 'Transactions from assigned departments' },
      { key: 'all', label: 'All Transactions', description: 'All payroll transactions in organization' },
    ],
    defaultPermissions: { canView: true, canExport: false },
  },
];

// Helper to get module ID by code
const getModuleId = (modules, code) => {
  const mod = modules.find((m) => m.code === code);
  return mod ? mod._id : null;
};

// Default Workspaces
const createDefaultWorkspaces = (modules) => [
  {
    name: 'Employee Portal',
    code: 'EMP',
    type: 'employee',
    description: 'Personal workspace for all employees',
    isSystem: true,
    defaultModuleCode: 'DASHBOARD',
    theme: { primaryColor: '#3b82f6', icon: 'user' },
    modules: [
      {
        moduleId: getModuleId(modules, 'DASHBOARD'),
        moduleCode: 'DASHBOARD',
        permissions: { canView: true },
        dataScope: 'own',
        isEnabled: true,
        sortOrder: 1,
      },
      {
        moduleId: getModuleId(modules, 'LEAVE'),
        moduleCode: 'LEAVE',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false },
        dataScope: 'own',
        settings: {
          editableStatuses: ['draft', 'pending'],
          allowedActions: ['apply', 'cancel', 'track'],
        },
        isEnabled: true,
        sortOrder: 2,
      },
      {
        moduleId: getModuleId(modules, 'ATTENDANCE'),
        moduleCode: 'ATTENDANCE',
        permissions: { canView: true, canCreate: false, canEdit: false },
        dataScope: 'own',
        isEnabled: true,
        sortOrder: 3,
      },
      {
        moduleId: getModuleId(modules, 'PROFILE'),
        moduleCode: 'PROFILE',
        permissions: { canView: true, canEdit: true },
        dataScope: 'own',
        settings: {
          editableFields: ['phone', 'emergency_contact', 'address'],
        },
        isEnabled: true,
        sortOrder: 4,
      },
    ],
  },
  {
    name: 'Department Head',
    code: 'HOD',
    type: 'department',
    description: 'Workspace for department heads/managers',
    isSystem: true,
    defaultModuleCode: 'DASHBOARD',
    theme: { primaryColor: '#8b5cf6', icon: 'building' },
    modules: [
      {
        moduleId: getModuleId(modules, 'DASHBOARD'),
        moduleCode: 'DASHBOARD',
        permissions: { canView: true },
        dataScope: 'department',
        isEnabled: true,
        sortOrder: 1,
      },
      {
        moduleId: getModuleId(modules, 'LEAVE'),
        moduleCode: 'LEAVE',
        permissions: { canView: true, canCreate: true, canEdit: false, canForward: true, canApprove: false },
        dataScope: 'department',
        settings: {
          allowedActions: ['view', 'forward', 'reject', 'comment'],
          workflowActions: {
            pending: ['forward', 'reject', 'request_info'],
            forwarded: ['view'],
          },
        },
        isEnabled: true,
        sortOrder: 2,
      },
      {
        moduleId: getModuleId(modules, 'ATTENDANCE'),
        moduleCode: 'ATTENDANCE',
        permissions: { canView: true, canEdit: true, canExport: true },
        dataScope: 'department',
        isEnabled: true,
        sortOrder: 3,
      },
      {
        moduleId: getModuleId(modules, 'TEAM'),
        moduleCode: 'TEAM',
        permissions: { canView: true },
        dataScope: 'department',
        isEnabled: true,
        sortOrder: 4,
      },
      {
        moduleId: getModuleId(modules, 'REPORTS'),
        moduleCode: 'REPORTS',
        permissions: { canView: true, canExport: true },
        dataScope: 'department',
        isEnabled: true,
        sortOrder: 5,
      },
    ],
  },
  {
    name: 'HR Management',
    code: 'HR',
    type: 'hr',
    description: 'Workspace for HR personnel',
    isSystem: true,
    defaultModuleCode: 'DASHBOARD',
    theme: { primaryColor: '#10b981', icon: 'users' },
    modules: [
      {
        moduleId: getModuleId(modules, 'DASHBOARD'),
        moduleCode: 'DASHBOARD',
        permissions: { canView: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 1,
      },
      {
        moduleId: getModuleId(modules, 'LEAVE'),
        moduleCode: 'LEAVE',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true },
        dataScope: 'assigned', // HR can be assigned to specific departments
        settings: {
          editableStatuses: ['forwarded', 'pending'],
          allowedActions: ['view', 'approve', 'reject', 'edit', 'export'],
          workflowActions: {
            forwarded: ['approve', 'reject', 'request_info'],
            pending: ['approve', 'reject', 'forward_to_hod'],
          },
        },
        isEnabled: true,
        sortOrder: 2,
      },
      {
        moduleId: getModuleId(modules, 'ATTENDANCE'),
        moduleCode: 'ATTENDANCE',
        permissions: { canView: true, canCreate: true, canEdit: true, canExport: true },
        dataScope: 'assigned',
        isEnabled: true,
        sortOrder: 3,
      },
      {
        moduleId: getModuleId(modules, 'EMPLOYEES'),
        moduleCode: 'EMPLOYEES',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: false, canExport: true },
        dataScope: 'assigned',
        isEnabled: true,
        sortOrder: 4,
      },
      {
        moduleId: getModuleId(modules, 'REPORTS'),
        moduleCode: 'REPORTS',
        permissions: { canView: true, canExport: true },
        dataScope: 'assigned',
        isEnabled: true,
        sortOrder: 5,
      },
    ],
  },
  {
    name: 'Administration',
    code: 'SUBADMIN',
    type: 'subadmin',
    description: 'Workspace for sub-administrators',
    isSystem: true,
    defaultModuleCode: 'DASHBOARD',
    theme: { primaryColor: '#f59e0b', icon: 'settings' },
    modules: [
      {
        moduleId: getModuleId(modules, 'DASHBOARD'),
        moduleCode: 'DASHBOARD',
        permissions: { canView: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 1,
      },
      {
        moduleId: getModuleId(modules, 'LEAVE'),
        moduleCode: 'LEAVE',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 2,
      },
      {
        moduleId: getModuleId(modules, 'ATTENDANCE'),
        moduleCode: 'ATTENDANCE',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 3,
      },
      {
        moduleId: getModuleId(modules, 'EMPLOYEES'),
        moduleCode: 'EMPLOYEES',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: true, canExport: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 4,
      },
      {
        moduleId: getModuleId(modules, 'DEPARTMENTS'),
        moduleCode: 'DEPARTMENTS',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: false },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 5,
      },
      {
        moduleId: getModuleId(modules, 'SHIFTS'),
        moduleCode: 'SHIFTS',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 6,
      },
      {
        moduleId: getModuleId(modules, 'USERS'),
        moduleCode: 'USERS',
        permissions: { canView: true, canCreate: true, canEdit: true, canDelete: false },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 7,
      },
      {
        moduleId: getModuleId(modules, 'REPORTS'),
        moduleCode: 'REPORTS',
        permissions: { canView: true, canExport: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 8,
      },
      {
        moduleId: getModuleId(modules, 'SETTINGS'),
        moduleCode: 'SETTINGS',
        permissions: { canView: true, canEdit: true },
        dataScope: 'all',
        isEnabled: true,
        sortOrder: 9,
      },
    ],
  },
];

async function seedWorkspaces() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Seed Modules
    console.log('\nSeeding modules...');
    const createdModules = [];

    for (const moduleData of defaultModules) {
      const existing = await Module.findOne({ code: moduleData.code });
      if (existing) {
        console.log(`  Module ${moduleData.code} already exists, skipping...`);
        createdModules.push(existing);
      } else {
        const module = await Module.create(moduleData);
        console.log(`  Created module: ${module.name} (${module.code})`);
        createdModules.push(module);
      }
    }

    console.log(`\nTotal modules: ${createdModules.length}`);

    // Seed Workspaces
    console.log('\nSeeding workspaces...');
    const workspaceConfigs = createDefaultWorkspaces(createdModules);

    for (const wsData of workspaceConfigs) {
      const existing = await Workspace.findOne({ code: wsData.code });
      if (existing) {
        console.log(`  Workspace ${wsData.code} already exists, skipping...`);
      } else {
        // Filter out modules with null moduleId
        wsData.modules = wsData.modules.filter((m) => m.moduleId !== null);
        const workspace = await Workspace.create(wsData);
        console.log(`  Created workspace: ${workspace.name} (${workspace.code})`);
      }
    }

    console.log('\n✅ Seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding workspaces:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  seedWorkspaces();
}

module.exports = { seedWorkspaces, defaultModules, createDefaultWorkspaces };

