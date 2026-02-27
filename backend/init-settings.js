const LeavePolicySettings = require('./settings/model/LeavePolicySettings');

console.log('🚀 Initializing Leave Policy Settings...');

LeavePolicySettings.create({})
    .then(settings => {
        console.log('✅ Settings initialized successfully');
        console.log('📋 Settings ID:', settings._id);
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error initializing settings:', err.message);
        process.exit(1);
    });
