const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const OD = require('../leaves/model/OD');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

(async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find employee 2145
    const emp = await Employee.findOne({ emp_no: '2145' });
    if (!emp) {
      console.error('❌ Employee 2145 not found in database.');
      process.exit(1);
    }
    console.log(`👤 Found Employee: ${emp.employee_name} (${emp.emp_no})`);

    // Find User for employee 2145
    const user = await User.findOne({ employeeRef: emp._id });
    const userId = user ? user._id : null;
    const userName = user ? user.name : emp.employee_name;
    console.log(`👤 Found User: ${userName} (ID: ${userId})`);

    // Define a round-trip route using the user's coordinates (Start -> End -> Return to Start)
    const waypoints = [
      // Going trip
      { lat: 16.904842, lng: 82.236909, address: "Start Location" },
      { lat: 16.899871, lng: 82.236436 },
      { lat: 16.895579, lng: 82.235036 },
      { lat: 16.890672, lng: 82.234581 },
      { lat: 16.886572, lng: 82.233906 },
      { lat: 16.886152, lng: 82.233704 },
      { lat: 16.884377, lng: 82.234176 },
      { lat: 16.878599, lng: 82.233771 },
      { lat: 16.875758, lng: 82.232860 },
      { lat: 16.874854, lng: 82.242037 },
      { lat: 16.872271, lng: 82.239844 },
      { lat: 16.871981, lng: 82.232456, address: "End Location" },
      // Returning trip (back track)
      { lat: 16.872271, lng: 82.239844 },
      { lat: 16.874854, lng: 82.242037 },
      { lat: 16.875758, lng: 82.232860 },
      { lat: 16.878599, lng: 82.233771 },
      { lat: 16.884377, lng: 82.234176 },
      { lat: 16.886152, lng: 82.233704 },
      { lat: 16.886572, lng: 82.233906 },
      { lat: 16.890672, lng: 82.234581 },
      { lat: 16.895579, lng: 82.235036 },
      { lat: 16.899871, lng: 82.236436 },
      { lat: 16.904842, lng: 82.236909, address: "Returned to Start" }
    ];

    // Generate locationTrail directly from the waypoints
    const startTime = new Date('2026-07-29T09:00:00Z').getTime();
    const endTime = new Date('2026-07-29T10:30:00Z').getTime();
    const locationTrail = waypoints.map((wp, index) => {
      const t = index / (waypoints.length - 1);
      const time = startTime + t * (endTime - startTime);
      return {
        latitude: wp.lat,
        longitude: wp.lng,
        capturedAt: new Date(time),
        address: wp.address,
        accuracy: 3,
        speed: index === waypoints.length - 1 ? 0 : 35,
        heading: 180,
        source: 'mobile'
      };
    });

    console.log(`📍 Generated ${locationTrail.length} location trail GPS points.`);

    // Remove any existing test ODs for this user to avoid clutter
    const deleteRes = await OD.deleteMany({
      employeeId: emp._id,
      purpose: /System Integration Testing - Kakinada to Patavala/
    });
    console.log(`🧹 Deleted ${deleteRes.deletedCount} old test OD records for this user.`);

    const todayStr = '2026-07-29';

    // Create the On-Duty record
    const odRecord = new OD({
      employeeId: emp._id,
      emp_no: emp.emp_no,
      odType: 'CLIENT_VISIT',
      fromDate: new Date(`${todayStr}T00:00:00.000Z`),
      toDate: new Date(`${todayStr}T23:59:59.000Z`),
      numberOfDays: 1,
      isHalfDay: false,
      halfDayType: null,
      isCOEligible: false,
      odType_extended: 'full_day',
      purpose: 'System Integration Testing - Kakinada to Patavala Location Trail',
      placeVisited: 'Kakinada to Patavala',
      contactNumber: emp.phone_number || '7995207344',
      status: 'approved', // set as approved so it's fully displayed
      division_id: emp.division_id,
      department: emp.department_id,
      department_id: emp.department_id,
      designation: emp.designation_id,
      appliedBy: userId,
      appliedAt: new Date(`${todayStr}T08:30:00.000Z`),
      
      startEvidence: {
        photoEvidence: {
          url: "https://team-pydah.s3.ap-south-1.amazonaws.com/evidence/start_evidence_kakinada.jpg",
          key: "evidence/start_evidence_kakinada.jpg",
          exifLocation: {
            latitude: 16.904842,
            longitude: 82.236909
          }
        },
        geoLocation: {
          latitude: 16.904842,
          longitude: 82.236909,
          address: "Start Location",
          capturedAt: new Date(startTime)
        },
        submittedAt: new Date(startTime),
        exifDateTime: new Date(startTime)
      },

      endEvidence: {
        photoEvidence: {
          url: "https://team-pydah.s3.ap-south-1.amazonaws.com/evidence/end_evidence_patavala.jpg",
          key: "evidence/end_evidence_patavala.jpg",
          exifLocation: {
            latitude: 16.904842,
            longitude: 82.236909
          }
        },
        geoLocation: {
          latitude: 16.904842,
          longitude: 82.236909,
          address: "Returned to Start",
          capturedAt: new Date(endTime)
        },
        submittedAt: new Date(endTime),
        exifDateTime: new Date(endTime)
      },

      locationTrail: locationTrail,
      
      workflow: {
        currentStepRole: null,
        nextApproverRole: null,
        isCompleted: true,
        approvalChain: [
          {
            stepOrder: 1,
            role: 'reporting_manager',
            label: 'Reporting Manager Approval',
            status: 'approved',
            actionByName: 'System Test Admin',
            actionByRole: 'reporting_manager',
            comments: 'Auto-approved via integration testing script.',
            updatedAt: new Date(`${todayStr}T09:30:00.000Z`)
          }
        ],
        history: [
          {
            step: 'employee',
            action: 'submitted',
            actionBy: userId,
            actionByName: userName,
            actionByRole: 'employee',
            comments: 'Applied for client visit and route tracking test.',
            timestamp: new Date(`${todayStr}T08:30:00.000Z`)
          }
        ]
      }
    });

    const savedOd = await odRecord.save();
    console.log(`\n🎉 Test OD application created successfully!`);
    console.log(`🆔 OD Record ID: ${savedOd._id}`);
    console.log(`👤 Employee: ${emp.employee_name}`);
    console.log(`📅 Date: ${todayStr}`);
    console.log(`🚗 Route: ${savedOd.placeVisited}`);
    console.log(`📍 Location Trail Points: ${savedOd.locationTrail.length}`);

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
  } catch (err) {
    console.error('❌ Error creating test OD:', err);
    process.exit(1);
  }
})();
