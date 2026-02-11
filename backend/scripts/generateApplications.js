/**
 * Script to generate 50 test employee applications
 * Run with: node scripts/generateApplications.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const Designation = require('../departments/model/Designation');
const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');

// Fake data pools
const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Arnav', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Atharv', 'Advait', 'Pranav', 'Dhruv', 'Kabir', 'Ritvik', 'Yash', 'Rudra', 'Aryan',
  'Ananya', 'Diya', 'Aanya', 'Pari', 'Aadhya', 'Sara', 'Myra', 'Navya', 'Anvi', 'Ira',
  'Saanvi', 'Kiara', 'Shanaya', 'Riya', 'Zara', 'Avni', 'Mira', 'Aditi', 'Ishita', 'Tara',
  'Amit', 'Rahul', 'Priya', 'Neha', 'Raj', 'Kavya', 'Rohan', 'Sneha', 'Vikram', 'Pooja'
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Joshi',
  'Desai', 'Mehta', 'Shah', 'Agarwal', 'Jain', 'Rao', 'Krishnan', 'Bhat', 'Kulkarni', 'Chopra',
  'Malhotra', 'Arora', 'Kapoor', 'Bansal', 'Saxena', 'Mishra', 'Pandey', 'Rathore', 'Chauhan', 'Rawat'
];

const CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
  'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal',
  'Visakhapatnam', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Coimbatore'
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female'];
const MARITAL_STATUSES = ['Single', 'Married'];

// Helper functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const generateEmpNo = (index) => `EMP${String(index).padStart(4, '0')}`;
const generatePhone = () => `${randomNumber(6, 9)}${randomNumber(100000000, 999999999)}`;
const generateAadhar = () => `${randomNumber(1000, 9999)} ${randomNumber(1000, 9999)} ${randomNumber(1000, 9999)}`;
const generateEmail = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;

// Generate random bank details
const BANKS = ['SBI', 'HDFC', 'ICICI', 'Axis', 'PNB', 'BOB', 'Canara', 'Union', 'IDBI'];
const generateBankAccount = () => `${randomNumber(10000000000, 99999999999)}`;
const generateIFSC = (bank) => `${bank}0${randomNumber(100000, 999999)}`;

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function getExistingData() {
  console.log('\n📊 Fetching existing data...');

  const [departments, divisions, designations, users, existingEmployees, existingApplications] = await Promise.all([
    Department.find({ isActive: true }),
    Division.find({ isActive: true }),
    Designation.find({ isActive: true }),
    User.find({ role: { $in: ['hr', 'super_admin', 'sub_admin'] } }),
    Employee.find().select('emp_no'),
    EmployeeApplication.find().select('emp_no')
  ]);

  if (departments.length === 0) {
    throw new Error('No departments found! Please create departments first.');
  }

  if (users.length === 0) {
    throw new Error('No HR/Admin users found! Please create users first.');
  }

  // Create set of existing emp_no to avoid duplicates
  const existingEmpNos = new Set([
    ...existingEmployees.map(e => e.emp_no?.toUpperCase()),
    ...existingApplications.map(a => a.emp_no?.toUpperCase())
  ].filter(Boolean));

  console.log(`✓ Found ${departments.length} departments`);
  console.log(`✓ Found ${divisions.length} divisions`);
  console.log(`✓ Found ${designations.length} designations`);
  console.log(`✓ Found ${users.length} users`);
  console.log(`✓ Found ${existingEmpNos.size} existing employee numbers`);

  return { departments, divisions, designations, users, existingEmpNos };
}

function generateUniqueEmpNo(existingEmpNos, startIndex) {
  let empNo;
  let counter = startIndex;
  do {
    empNo = generateEmpNo(counter);
    counter++;
  } while (existingEmpNos.has(empNo));
  existingEmpNos.add(empNo);
  return empNo;
}

function generateApplicationData(index, existingData) {
  const { departments, divisions, designations, users, existingEmpNos } = existingData;

  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const fullName = `${firstName} ${lastName}`;
  const gender = randomElement(GENDERS);
  const bank = randomElement(BANKS);

  // Generate unique emp_no
  const empNo = generateUniqueEmpNo(existingEmpNos, 5000 + index);

  // Random dates
  const dob = randomDate(new Date(1985, 0, 1), new Date(2000, 11, 31));
  const doj = randomDate(new Date(2020, 0, 1), new Date());

  // Random organizational data
  const department = randomElement(departments);
  const division = divisions.length > 0 ? randomElement(divisions) : null;
  const designation = designations.length > 0 ? randomElement(designations) : null;
  const createdBy = randomElement(users);

  // Random salary between 20k and 100k
  const proposedSalary = randomNumber(20, 100) * 1000;

  return {
    emp_no: empNo,
    employee_name: fullName,
    department_id: department._id,
    division_id: division?._id || null,
    designation_id: designation?._id || null,
    doj: doj,
    dob: dob,
    proposedSalary: proposedSalary,
    gender: gender,
    marital_status: randomElement(MARITAL_STATUSES),
    blood_group: randomElement(BLOOD_GROUPS),
    experience: randomNumber(0, 15),
    address: `${randomNumber(1, 999)}, ${randomElement(['MG Road', 'Park Street', 'Main Road', 'Station Road', 'Gandhi Nagar'])}`,
    location: randomElement(CITIES),
    aadhar_number: generateAadhar(),
    phone_number: generatePhone(),
    alt_phone_number: Math.random() > 0.5 ? generatePhone() : null,
    email: generateEmail(fullName),
    pf_number: Math.random() > 0.4 ? `PF${randomNumber(100000, 999999)}` : null,
    esi_number: Math.random() > 0.4 ? `ESI${randomNumber(100000, 999999)}` : null,
    bank_account_no: generateBankAccount(),
    bank_name: bank,
    bank_place: randomElement(CITIES),
    ifsc_code: generateIFSC(bank),
    paidLeaves: 0,
    allottedLeaves: randomNumber(12, 24),
    qualifications: Math.random() > 0.3 ? [
      {
        degree: randomElement(['B.Tech', 'M.Tech', 'BCA', 'MCA', 'MBA', 'B.Com', 'M.Com', 'B.Sc', 'M.Sc']),
        institution: randomElement(['Delhi University', 'Mumbai University', 'IIT', 'NIT', 'Anna University']),
        year: randomNumber(2005, 2020)
      }
    ] : null,
    createdBy: createdBy._id,
    status: 'pending',
    is_active: true,
    dynamicFields: {}
  };
}

async function generateApplications() {
  try {
    console.log('\n🚀 Starting application generation...\n');

    await connectDB();
    const existingData = await getExistingData();

    console.log('\n📝 Generating 50 applications...');

    const applications = [];
    const batchSize = 10;

    for (let i = 0; i < 50; i++) {
      const appData = generateApplicationData(i, existingData);
      applications.push(appData);

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`   Generated ${i + 1}/50 applications...\r`);
      }
    }

    console.log('\n\n💾 Saving applications to database...');

    // Insert in batches to avoid overwhelming the database
    let savedCount = 0;
    for (let i = 0; i < applications.length; i += batchSize) {
      const batch = applications.slice(i, i + batchSize);
      await EmployeeApplication.insertMany(batch);
      savedCount += batch.length;
      console.log(`   Saved ${savedCount}/${applications.length} applications...`);
    }

    console.log('\n✅ Success! Generated 50 employee applications');
    console.log(`\n📋 Summary:`);
    console.log(`   • Total applications created: ${applications.length}`);
    console.log(`   • Status: All set to 'pending'`);
    console.log(`   • Salary range: ₹20,000 - ₹1,00,000`);
    console.log(`   • Departments: ${existingData.departments.length} different departments`);
    console.log(`\n🎯 You can now test the bulk approve feature with these applications!`);

  } catch (error) {
    console.error('\n❌ Error generating applications:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run the script
generateApplications();
