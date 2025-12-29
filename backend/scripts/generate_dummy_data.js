
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const LeaveSettings = require('../leaves/model/LeaveSettings');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const Workspace = require('../workspaces/model/Workspace');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';

const connectMongoDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const seedData = async () => {
  await connectMongoDB();

  try {
    console.log('🚀 Starting Dummy Data Generation...');

    // 1. Get Default Workspace (Employee Portal)
    let defaultWorkspace = await Workspace.findOne({ code: 'EMP' });
    if (!defaultWorkspace) {
      console.log('⚠️ Employee Portal workspace not found. Please run seedWorkspaces.js first.');
      // Fallback: try to find ANY workspace
      defaultWorkspace = await Workspace.findOne();
      if (!defaultWorkspace) {
        console.log('❌ No workspaces found. Aborting.');
        process.exit(1);
      }
    }
    console.log(`ℹ️ Using Workspace: ${defaultWorkspace.name}`);

    // 2. Create Departments
    const departmentsData = [
      { name: 'Engineering', code: 'ENG', description: 'Software Development' },
      { name: 'Human Resources', code: 'HR', description: 'HR Management' },
      { name: 'Sales', code: 'SALES', description: 'Sales and Marketing' },
    ];

    const departments = {};
    for (const dept of departmentsData) {
      let d = await Department.findOne({ code: dept.code });
      if (!d) {
        d = await Department.create(dept);
        console.log(`✅ Created Department: ${d.name}`);
      } else {
        console.log(`ℹ️ Department exists: ${d.name}`);
      }
      departments[dept.code] = d;
    }

    // 3. Create Designations
    const designationsData = [
      { name: 'Software Engineer', code: 'SE', deptCode: 'ENG' },
      { name: 'Senior Engineer', code: 'SR_SE', deptCode: 'ENG' },
      { name: 'HR Manager', code: 'HR_MGR', deptCode: 'HR' },
      { name: 'Sales Executive', code: 'SALES_EXEC', deptCode: 'SALES' },
      { name: 'Engineering Manager', code: 'ENG_MGR', deptCode: 'ENG' },
    ];

    const designations = {};
    for (const desig of designationsData) {
      let d = await Designation.findOne({ code: desig.code });
      if (!d) {
        const dept = departments[desig.deptCode];
        if (dept) {
          d = await Designation.create({
            name: desig.name,
            code: desig.code,
            department: dept._id,
          });
          console.log(`✅ Created Designation: ${d.name}`);
        }
      } else {
        console.log(`ℹ️ Designation exists: ${d.name}`);
      }
      designations[desig.code] = d;
    }

    // 4. Create Users & Employees
    const usersData = [
      // Admin is assumed to exist from seedSuperAdmin.js
      {
        name: 'Alice Header',
        email: 'alice.hod@hrms.com',
        password: 'Password@123',
        role: 'hod',
        empNo: 'EMP001',
        deptCode: 'ENG',
        desigCode: 'ENG_MGR',
        gender: 'Female',
      },
      {
        name: 'Bob Engineer',
        email: 'bob.se@hrms.com',
        password: 'Password@123',
        role: 'employee',
        empNo: 'EMP002',
        deptCode: 'ENG',
        desigCode: 'SE',
        gender: 'Male',
      },
      {
        name: 'Charlie Senior',
        email: 'charlie.sr@hrms.com',
        password: 'Password@123',
        role: 'employee',
        empNo: 'EMP003',
        deptCode: 'ENG',
        desigCode: 'SR_SE',
        gender: 'Male',
      },
      {
        name: 'Dana HR',
        email: 'dana.hr@hrms.com',
        password: 'Password@123',
        role: 'hr',
        empNo: 'EMP004',
        deptCode: 'HR',
        desigCode: 'HR_MGR',
        gender: 'Female',
      },
      {
        name: 'Eve Sales',
        email: 'eve.sales@hrms.com',
        password: 'Password@123',
        role: 'employee',
        empNo: 'EMP005',
        deptCode: 'SALES',
        desigCode: 'SALES_EXEC',
        gender: 'Female',
      },
    ];

    const createdUsers = {};
    const createdEmployees = {};

    for (const userData of usersData) {
      let user = await User.findOne({ email: userData.email });
      let employee = await Employee.findOne({ emp_no: userData.empNo });

      if (!employee) {
        const dept = departments[userData.deptCode];
        const desig = designations[userData.desigCode];

        employee = await Employee.create({
          emp_no: userData.empNo,
          employee_name: userData.name,
          email: userData.email,
          department_id: dept._id,
          designation_id: desig._id,
          gender: userData.gender,
          password: userData.password, // Will be hashed by pre-save
          doj: new Date('2023-01-01'),
          dob: new Date('1990-01-01'),
          phone_number: '9876543210',
          paidLeaves: 12,
          allottedLeaves: 24,
          is_active: true,
        });
        console.log(`✅ Created Employee: ${employee.employee_name} (${employee.emp_no})`);
      } else {
        console.log(`ℹ️ Employee exists: ${employee.emp_no}`);
      }
      createdEmployees[userData.empNo] = employee;

      if (!user) {
        const dept = departments[userData.deptCode];
        user = await User.create({
          name: userData.name,
          email: userData.email,
          password: userData.password, // Will be hashed
          role: userData.role,
          roles: [userData.role],
          employeeId: userData.empNo,
          employeeRef: employee._id,
          department: dept._id,
          activeWorkspaceId: defaultWorkspace._id,
          isActive: true,
        });
        console.log(`✅ Created User: ${user.email}`);
      } else {
        console.log(`ℹ️ User exists: ${user.email}`);
        // Ensure link
        if (!user.employeeRef) {
          user.employeeRef = employee._id;
          await user.save();
          console.log(`   🔗 Linked User ${user.email} to Employee ${employee.emp_no}`);
        }
      }
      createdUsers[userData.empNo] = user;
    }

    // Link HOD to Department
    const engineeringDept = departments['ENG'];
    const aliceUser = createdUsers['EMP001'];
    if (engineeringDept && aliceUser && !engineeringDept.hod) {
      engineeringDept.hod = aliceUser._id;
      await engineeringDept.save();
      console.log(`✅ Assigned ${aliceUser.name} as HOD of Engineering`);
    }
    // Link HR to Department
    const hrDept = departments['HR'];
    const danaUser = createdUsers['EMP004'];
    if (hrDept && danaUser && !hrDept.hr) {
      hrDept.hr = danaUser._id;
      await hrDept.save();
      console.log(`✅ Assigned ${danaUser.name} as HR of HR Dept`);
    }


    // 5. Create Leave Settings
    let leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
    if (!leaveSettings) {
      leaveSettings = await LeaveSettings.create({
        type: 'leave',
        types: [
          { code: 'CL', name: 'Casual Leave', maxDaysPerYear: 12, isPaid: true, color: '#3b82f6' },
          { code: 'SL', name: 'Sick Leave', maxDaysPerYear: 10, isPaid: true, color: '#ef4444' },
          { code: 'PL', name: 'Privilege Leave', maxDaysPerYear: 15, isPaid: true, color: '#10b981' },
        ],
        statuses: [
          { code: 'draft', name: 'Draft', color: '#94a3b8' },
          { code: 'pending', name: 'Pending', color: '#f59e0b' },
          { code: 'hod_approved', name: 'HOD Approved', color: '#3b82f6' },
          { code: 'approved', name: 'Approved', color: '#10b981', isFinal: true, isApproved: true },
          { code: 'rejected', name: 'Rejected', color: '#ef4444', isFinal: true },
          { code: 'cancelled', name: 'Cancelled', color: '#64748b', isFinal: true },
        ],
        isActive: true,
        settings: {
          allowBackdated: true,
          maxBackdatedDays: 30,
          allowFutureDated: true,
          maxAdvanceDays: 90,
        }
      });
      console.log('✅ Created Leave Settings');
    } else {
      console.log('ℹ️ Leave Settings already exist');
    }

    let odSettings = await LeaveSettings.findOne({ type: 'od', isActive: true });
    if (!odSettings) {
      odSettings = await LeaveSettings.create({
        type: 'od',
        types: [
          { code: 'CLIENT_VISIT', name: 'Client Visit', description: 'Visiting client location', color: '#8b5cf6' },
          { code: 'CONFERENCE', name: 'Conference', description: 'Attending conference/seminar', color: '#ec4899' },
          { code: 'OFFICIAL_WORK', name: 'Official Work', description: 'Bank work, govt office, etc.', color: '#f97316' },
        ],
        statuses: [
          { code: 'draft', name: 'Draft', color: '#94a3b8' },
          { code: 'pending', name: 'Pending', color: '#f59e0b' },
          { code: 'approved', name: 'Approved', color: '#10b981', isFinal: true, isApproved: true },
          { code: 'rejected', name: 'Rejected', color: '#ef4444', isFinal: true },
        ],
        isActive: true
      });
      console.log('✅ Created OD Settings');
    } else {
      console.log('ℹ️ OD Settings already exist');
    }


    // 6. Create Leave/OD Applications
    const bob = createdUsers['EMP002'];
    const bobEmp = createdEmployees['EMP002'];
    const charlie = createdUsers['EMP003'];
    const charlieEmp = createdEmployees['EMP003'];
    const alice = createdUsers['EMP001']; // Approver (HOD)

    if (bob && bobEmp && leaveSettings) {
      // Pending Leave for Bob
      const existingPending = await Leave.findOne({ employeeId: bobEmp._id, status: 'pending' });
      if (!existingPending) {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);

        await Leave.create({
          employeeId: bobEmp._id,
          emp_no: bobEmp.emp_no,
          leaveType: 'CL',
          fromDate: tomorrow,
          toDate: dayAfter,
          numberOfDays: 2,
          purpose: 'Personal work at home',
          contactNumber: '9876543210',
          status: 'pending',
          department: bobEmp.department_id,
          designation: bobEmp.designation_id,
          appliedBy: bob._id,
          appliedAt: new Date(),
          workflow: {
            currentStepRole: 'hod',
            nextApproverRole: 'hod',
            history: [{
              step: 'employee',
              action: 'submitted',
              actionBy: bob._id,
              actionByName: bob.name,
              actionByRole: 'employee',
              comments: 'Applied for leave',
              timestamp: new Date()
            }]
          }
        });
        console.log(`✅ Created Pending Leave for ${bob.name}`);
      }

      // Approved Leave for Bob (Past)
      const existingApproved = await Leave.findOne({ employeeId: bobEmp._id, status: 'approved' });
      if (!existingApproved) {
        const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);

        await Leave.create({
          employeeId: bobEmp._id,
          emp_no: bobEmp.emp_no,
          leaveType: 'SL',
          fromDate: lastWeek,
          toDate: lastWeek,
          numberOfDays: 1,
          purpose: 'Not feeling well',
          contactNumber: '9876543210',
          status: 'approved',
          department: bobEmp.department_id,
          designation: bobEmp.designation_id,
          appliedBy: bob._id,
          appliedAt: new Date(lastWeek.getTime() - 86400000), // Applied day before
          workflow: {
            currentStepRole: null,
            nextApproverRole: null,
            isCompleted: true,
            history: [
              {
                step: 'employee',
                action: 'submitted',
                actionBy: bob._id,
                actionByName: bob.name,
                actionByRole: 'employee',
                comments: 'Applied for sick leave',
                timestamp: new Date(lastWeek.getTime() - 86400000)
              },
              {
                step: 'hod',
                action: 'approved',
                actionBy: alice._id,
                actionByName: alice.name,
                actionByRole: 'hod',
                comments: 'Approved, get well soon',
                timestamp: new Date(lastWeek.getTime() - 43200000)
              }
            ]
          }
        });
        console.log(`✅ Created Approved Leave for ${bob.name}`);
      }
    }

    if (charlie && charlieEmp && odSettings) {
      // Pending OD for Charlie
      const existingOD = await OD.findOne({ employeeId: charlieEmp._id, status: 'pending' });
      if (!existingOD) {
        const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 5);

        await OD.create({
          employeeId: charlieEmp._id,
          emp_no: charlieEmp.emp_no,
          odType: 'CLIENT_VISIT',
          fromDate: nextWeek,
          toDate: nextWeek,
          numberOfDays: 1,
          purpose: 'Client meeting at City Center',
          placeVisited: 'City Center Mall',
          contactNumber: '9876543210',
          status: 'pending',
          department: charlieEmp.department_id,
          designation: charlieEmp.designation_id,
          appliedBy: charlie._id,
          appliedAt: new Date(),
          odType_extended: 'full_day',
          workflow: {
            currentStepRole: 'hod',
            nextApproverRole: 'hod',
            history: [{
              step: 'employee',
              action: 'submitted',
              actionBy: charlie._id,
              actionByName: charlie.name,
              actionByRole: 'employee',
              comments: 'Client visit request',
              timestamp: new Date()
            }]
          }
        });
        console.log(`✅ Created Pending OD for ${charlie.name}`);
      }
    }

    console.log('\n🎉 Verified/Generated Dummy Data Successfully!');
  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected');
  }
};

seedData();
