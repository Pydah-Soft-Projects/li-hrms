const LeavePolicySettings = require('./settings/model/LeavePolicySettings');

console.log('🚀 Initializing Leave Policy Settings...');

LeavePolicySettings.getSettings()
    .then(settings => {
        if (settings) {
            console.log('✅ Leave Policy Settings already exist');
            console.log('📋 Current Settings:', JSON.stringify(settings, null, 2));
        } else {
            console.log('❌ No settings found');
        }
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Error accessing settings:', err.message);
        process.exit(1);
    });
