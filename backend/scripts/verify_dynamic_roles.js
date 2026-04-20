const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../users/model/User');
const Role = require('../users/model/Role');

async function verify() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    // 1. Create a Dynamic Role
    const roleName = 'Test-Dynamic-Role-' + Date.now();
    console.log(`Creating role: ${roleName}`);
    const role = await Role.create({
      name: roleName,
      activeModules: ['DASHBOARD:read', 'ATTENDANCE:write'],
      isActive: true
    });

    // 2. Create a User with this role
    const userName = 'testuser-' + Date.now();
    const userEmail = `${userName}@example.com`;
    console.log(`Creating user: ${userEmail}`);
    const user = await User.create({
      name: userName,
      email: userEmail,
      password: 'password123',
      role: 'employee',
      customRoles: [role._id],
      featureControl: ['PROFILE:read'] // Manual override
    });

    // 3. Verify resolution (simulating resolveFeatureControl logic)
    const populatedUser = await User.findById(user._id).populate('customRoles');
    
    const resolveFeatureControl = (u) => {
      let effectivePermissions = [...(u.featureControl || [])];
      if (u.customRoles && Array.isArray(u.customRoles)) {
        u.customRoles.forEach((r) => {
          if (r.isActive && Array.isArray(r.activeModules)) {
            effectivePermissions = [...new Set([...effectivePermissions, ...r.activeModules])];
          }
        });
      }
      return effectivePermissions;
    };

    const effective = resolveFeatureControl(populatedUser);
    console.log('Effective Permissions:', effective);

    const expected = ['PROFILE:read', 'DASHBOARD:read', 'ATTENDANCE:write'];
    const success = expected.every(p => effective.includes(p));

    if (success) {
      console.log('✅ Verification Successful: All expected permissions resolved.');
    } else {
      console.error('❌ Verification Failed: Permissions mismatch.');
    }

    // Cleanup
    console.log('Cleaning up...');
    await User.findByIdAndDelete(user._id);
    await Role.findByIdAndDelete(role._id);
    
    await mongoose.disconnect();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
}

verify();
