require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const Division = require('../departments/model/Division');
const OD = require('../leaves/model/OD');
const User = require('../users/model/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

const connectMongoDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const getRandomDateInJuly2026 = () => {
  const day = Math.floor(Math.random() * 13) + 1; // July 1 to 13
  const dateStr = `2026-07-${String(day).padStart(2, '0')}`;
  return new Date(dateStr);
};

const seedODs = async () => {
  await connectMongoDB();

  try {
    console.log('🚀 Fetching active employees...');
    const employees = await Employee.find({ is_active: true })
      .populate('department_id')
      .populate('designation_id')
      .populate('division_id');

    if (employees.length === 0) {
      console.log('❌ No active employees found. Cannot generate OD records.');
      process.exit(1);
    }
    console.log(`ℹ️ Found ${employees.length} active employees. Using them for seed distribution.`);

    // Status distribution: 30 approved, 15 pending, 5 rejected, 5 cancelled = 55 total
    const statuses = [
      ...Array(30).fill('approved'),
      ...Array(15).fill('pending'),
      ...Array(5).fill('rejected'),
      ...Array(5).fill('cancelled')
    ];

    const odTypes = ['CLIENT_VISIT', 'CONFERENCE', 'OFFICIAL_WORK'];

    const coPurposes = [
      'Onsite client support during holiday deployment',
      'Emergency server maintenance on weekend',
      'Client critical database backup shift',
      'Holiday hardware setup and verification',
      'Onsite deployment training session'
    ];

    const hourPurposes = [
      'Quick client meeting at downtown tech center',
      'Vendor coordination and sample inspection',
      'Bank branch verification for account setup',
      'Brief client workshop and product demo',
      'Picking up visitor passes from head office'
    ];

    const regularPurposes = [
      'Standard client site deployment & support',
      'Attending regional tech innovation conference',
      'Official branch-office coordination meeting',
      'Corporate training on cloud migration',
      'Strategic planning meeting with engineering team'
    ];

    const places = [
      'Tech Park Phase II, Building C',
      'City Center Business Hub',
      'Convention Hall, Grand Avenue',
      'Regional Office, Sector 4',
      'Client Headquarters, Block G'
    ];

    // Delete existing dummy data if any to keep DB clean
    console.log('🧹 Cleaning up any previous seeded dummy records...');
    const deletedCount = await OD.deleteMany({ purpose: { $regex: 'seeded-dummy' } });
    console.log(`✅ Removed ${deletedCount.deletedCount} old seeded OD records.`);

    const recordsToInsert = [];

    // Map each status to employee and generate records
    // Segment 1: CO Eligible ODs (55 records)
    console.log('Generating 55 CO-Eligible ODs...');
    for (let i = 0; i < 55; i++) {
      const emp = getRandomItem(employees);
      const user = await User.findOne({ employeeRef: emp._id });
      const userId = user ? user._id : null;
      const userName = user ? user.name : emp.employee_name;
      const date = getRandomDateInJuly2026();
      const status = statuses[i];

      const record = {
        employeeId: emp._id,
        emp_no: emp.emp_no,
        odType: getRandomItem(odTypes),
        fromDate: date,
        toDate: date,
        numberOfDays: 1,
        isHalfDay: false,
        halfDayType: null,
        isCOEligible: true,
        odType_extended: 'full_day',
        purpose: `[seeded-dummy] ${getRandomItem(coPurposes)}`,
        placeVisited: getRandomItem(places),
        contactNumber: '9876543210',
        status: status,
        division_id: emp.division_id ? emp.division_id._id : null,
        division_name: emp.division_id ? emp.division_id.name : null,
        department: emp.department_id ? emp.department_id._id : null,
        department_id: emp.department_id ? emp.department_id._id : null,
        department_name: emp.department_id ? emp.department_id.name : null,
        designation: emp.designation_id ? emp.designation_id._id : null,
        appliedBy: userId,
        appliedAt: new Date(date.getTime() - 86400000), // applied day before
        workflow: {
          currentStepRole: status === 'pending' ? 'hod' : null,
          nextApproverRole: status === 'pending' ? 'hod' : null,
          isCompleted: status !== 'pending',
          approvalChain: [
            {
              stepOrder: 1,
              role: 'reporting_manager',
              label: 'Reporting Manager Approval',
              status: 'approved',
              actionByName: 'Alice Manager',
              actionByRole: 'reporting_manager',
              comments: 'Approved first step.',
              updatedAt: new Date(date.getTime() + 3600000)
            },
            {
              stepOrder: 2,
              role: 'hod',
              label: 'HOD Approval',
              status: status === 'approved' ? 'approved' : (status === 'pending' ? 'pending' : 'rejected'),
              actionByName: 'Bob HOD',
              actionByRole: 'hod',
              comments: status === 'approved' ? 'Verified weekend work.' : (status === 'pending' ? '' : 'Rejected weekend work.'),
              updatedAt: new Date(date.getTime() + 7200000)
            }
          ],
          history: [
            {
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: 'employee',
              comments: 'Applied for CO OD',
              timestamp: date
            }
          ]
        }
      };

      recordsToInsert.push(record);
    }

    // Segment 2: Hour-Based ODs (55 records)
    console.log('Generating 55 Hour-Based ODs...');
    for (let i = 0; i < 55; i++) {
      const emp = getRandomItem(employees);
      const user = await User.findOne({ employeeRef: emp._id });
      const userId = user ? user._id : null;
      const userName = user ? user.name : emp.employee_name;
      const date = getRandomDateInJuly2026();
      const status = statuses[i];

      const record = {
        employeeId: emp._id,
        emp_no: emp.emp_no,
        odType: getRandomItem(odTypes),
        fromDate: date,
        toDate: date,
        numberOfDays: 0,
        isHalfDay: false,
        halfDayType: null,
        isCOEligible: false,
        odType_extended: 'hours',
        odStartTime: '10:00',
        odEndTime: '14:00',
        durationHours: 4,
        purpose: `[seeded-dummy] ${getRandomItem(hourPurposes)}`,
        placeVisited: getRandomItem(places),
        contactNumber: '9876543210',
        status: status,
        division_id: emp.division_id ? emp.division_id._id : null,
        division_name: emp.division_id ? emp.division_id.name : null,
        department: emp.department_id ? emp.department_id._id : null,
        department_id: emp.department_id ? emp.department_id._id : null,
        department_name: emp.department_id ? emp.department_id.name : null,
        designation: emp.designation_id ? emp.designation_id._id : null,
        appliedBy: userId,
        appliedAt: new Date(date.getTime() - 86400000),
        workflow: {
          currentStepRole: status === 'pending' ? 'hod' : null,
          nextApproverRole: status === 'pending' ? 'hod' : null,
          isCompleted: status !== 'pending',
          approvalChain: [
            {
              stepOrder: 1,
              role: 'reporting_manager',
              label: 'Reporting Manager Approval',
              status: 'approved',
              actionByName: 'Alice Manager',
              actionByRole: 'reporting_manager',
              comments: 'Approved time window.',
              updatedAt: new Date(date.getTime() + 3600000)
            },
            {
              stepOrder: 2,
              role: 'hod',
              label: 'HOD Approval',
              status: status === 'approved' ? 'approved' : (status === 'pending' ? 'pending' : 'rejected'),
              actionByName: 'Bob HOD',
              actionByRole: 'hod',
              comments: status === 'approved' ? 'Approved hour-based OD.' : (status === 'pending' ? '' : 'Rejected.'),
              updatedAt: new Date(date.getTime() + 7200000)
            }
          ],
          history: [
            {
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: 'employee',
              comments: 'Applied for hour-based OD',
              timestamp: date
            }
          ]
        }
      };

      recordsToInsert.push(record);
    }

    // Segment 3: Regular ODs (55 records)
    console.log('Generating 55 Regular ODs...');
    for (let i = 0; i < 55; i++) {
      const emp = getRandomItem(employees);
      const user = await User.findOne({ employeeRef: emp._id });
      const userId = user ? user._id : null;
      const userName = user ? user.name : emp.employee_name;
      const date = getRandomDateInJuly2026();
      const status = statuses[i];
      const isHalfDay = i % 2 === 0; // half day for half of them

      const record = {
        employeeId: emp._id,
        emp_no: emp.emp_no,
        odType: getRandomItem(odTypes),
        fromDate: date,
        toDate: date,
        numberOfDays: isHalfDay ? 0.5 : 1,
        isHalfDay: isHalfDay,
        halfDayType: isHalfDay ? 'first_half' : null,
        isCOEligible: false,
        odType_extended: isHalfDay ? 'half_day' : 'full_day',
        purpose: `[seeded-dummy] ${getRandomItem(regularPurposes)}`,
        placeVisited: getRandomItem(places),
        contactNumber: '9876543210',
        status: status,
        division_id: emp.division_id ? emp.division_id._id : null,
        division_name: emp.division_id ? emp.division_id.name : null,
        department: emp.department_id ? emp.department_id._id : null,
        department_id: emp.department_id ? emp.department_id._id : null,
        department_name: emp.department_id ? emp.department_id.name : null,
        designation: emp.designation_id ? emp.designation_id._id : null,
        appliedBy: userId,
        appliedAt: new Date(date.getTime() - 86400000),
        workflow: {
          currentStepRole: status === 'pending' ? 'hod' : null,
          nextApproverRole: status === 'pending' ? 'hod' : null,
          isCompleted: status !== 'pending',
          approvalChain: [
            {
              stepOrder: 1,
              role: 'reporting_manager',
              label: 'Reporting Manager Approval',
              status: 'approved',
              actionByName: 'Alice Manager',
              actionByRole: 'reporting_manager',
              comments: 'Approved regular OD.',
              updatedAt: new Date(date.getTime() + 3600000)
            },
            {
              stepOrder: 2,
              role: 'hod',
              label: 'HOD Approval',
              status: status === 'approved' ? 'approved' : (status === 'pending' ? 'pending' : 'rejected'),
              actionByName: 'Bob HOD',
              actionByRole: 'hod',
              comments: status === 'approved' ? 'Approved.' : (status === 'pending' ? '' : 'Rejected.'),
              updatedAt: new Date(date.getTime() + 7200000)
            }
          ],
          history: [
            {
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: 'employee',
              comments: 'Applied for regular OD',
              timestamp: date
            }
          ]
        }
      };

      recordsToInsert.push(record);
    }

    console.log(`Inserting ${recordsToInsert.length} records into OD collection...`);
    const result = await OD.insertMany(recordsToInsert);
    console.log(`🎉 Successfully seeded ${result.length} OD records (55 CO-eligible, 55 Hour-based, 55 Regular)!`);

  } catch (error) {
    console.error('❌ Error seeding OD records:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

seedODs();
