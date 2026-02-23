const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hrms').then(async () => {
  console.log('🔌 Connected to MongoDB');
  
  try {
    const LeavePolicySettings = require('./settings/model/LeavePolicySettings');
    
    // Check if settings already exist
    const existing = await LeavePolicySettings.findOne({});
    if (existing) {
      console.log('✅ Settings already exist');
      process.exit(0);
    }
    
    // Create default settings
    const defaultSettings = {
      financialYear: {
        startMonth: 4,
        startDay: 1,
        useCalendarYear: false
      },
      earnedLeave: {
        earningType: 'attendance_based',
        attendanceRules: {
          minDaysForFirstEL: 20,
          daysPerEL: 20,
          maxELPerMonth: 2,
          maxELPerYear: 12,
          considerPresentDays: true,
          considerHolidays: true,
          attendanceRanges: [
            { minDays: 1, maxDays: 10, elEarned: 0, description: '01-10 days = 0 EL' },
            { minDays: 11, maxDays: 20, elEarned: 1, description: '11-20 days = 1 EL' },
            { minDays: 21, maxDays: 25, elEarned: 1, description: '21-25 days = 1 EL' },
            { minDays: 26, maxDays: 31, elEarned: 2, description: '26-31 days = 2 EL' }
          ]
        },
        fixedRules: {
          elPerMonth: 1,
          maxELPerYear: 12
        }
      },
      carryForward: {
        casualLeave: {
          enabled: true,
          maxMonths: 12,
          expiryMonths: 12,
          carryForwardToNextYear: true
        },
        earnedLeave: {
          enabled: true,
          maxMonths: 24,
          expiryMonths: 60,
          carryForwardToNextYear: true
        },
        compensatoryOff: {
          enabled: true,
          maxMonths: 6,
          expiryMonths: 6,
          carryForwardToNextYear: false
        }
      },
      annualCLReset: {
        enabled: true,
        resetToBalance: 12,
        addCarryForward: true,
        resetMonth: 4,
        resetDay: 1
      },
      autoUpdate: {
        enabled: true,
        updateFrequency: 'monthly',
        updateDay: 1
      }
    };
    
    const settings = await LeavePolicySettings.create(defaultSettings);
    console.log('✅ Leave Policy Settings initialized successfully');
    console.log('📋 Settings ID:', settings._id);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing settings:', error.message);
    process.exit(1);
  }
}).catch(err => {
  console.error('❌ Database connection error:', err.message);
  process.exit(1);
});
