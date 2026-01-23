require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models using absolute paths
const Device = require(path.join(__dirname, 'src', 'models', 'Device'));
const AdmsRawLog = require(path.join(__dirname, 'src', 'models', 'AdmsRawLog'));
const logger = require(path.join(__dirname, 'src', 'utils', 'logger'));

/**
 * ADMS Connection Diagnostic Tool
 * 
 * This script helps diagnose why a device isn't connecting via ADMS
 */

async function diagnoseADMS() {
    try {
        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        // 1. List all devices
        console.log('═'.repeat(80));
        console.log('REGISTERED DEVICES');
        console.log('═'.repeat(80));

        const devices = await Device.find().sort({ createdAt: -1 });

        if (devices.length === 0) {
            console.log('⚠ No devices registered in database');
        } else {
            devices.forEach((device, index) => {
                console.log(`\n[${index + 1}] ${device.name}`);
                console.log(`    Device ID: ${device.deviceId}`);
                console.log(`    IP: ${device.ip}:${device.port}`);
                console.log(`    Status: ${device.enabled ? '✓ Enabled' : '✗ Disabled'}`);
                console.log(`    Location: ${device.location || 'N/A'}`);
                console.log(`    Last Sync: ${device.lastSyncAt ? device.lastSyncAt.toISOString() : 'Never'}`);
                console.log(`    Sync Status: ${device.lastSyncStatus || 'N/A'}`);
            });
        }

        // 2. Check recent ADMS activity
        console.log('\n\n' + '═'.repeat(80));
        console.log('RECENT ADMS ACTIVITY (Last 24 hours)');
        console.log('═'.repeat(80));

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const recentLogs = await AdmsRawLog.find({
            receivedAt: { $gte: yesterday }
        }).sort({ receivedAt: -1 }).limit(20);

        if (recentLogs.length === 0) {
            console.log('\n⚠ No ADMS activity in the last 24 hours');
            console.log('\nPossible reasons:');
            console.log('  1. Devices not configured to push to this server');
            console.log('  2. Network connectivity issues');
            console.log('  3. Wrong server IP/port configured on devices');
            console.log('  4. Biometric service not running on port 4000');
        } else {
            // Group by serial number
            const deviceActivity = {};

            recentLogs.forEach(log => {
                const sn = log.serialNumber || 'UNKNOWN';
                if (!deviceActivity[sn]) {
                    deviceActivity[sn] = {
                        heartbeats: 0,
                        dataUploads: 0,
                        lastSeen: log.receivedAt
                    };
                }

                if (log.table === 'HEARTBEAT') {
                    deviceActivity[sn].heartbeats++;
                } else if (log.table === 'ATTLOG') {
                    deviceActivity[sn].dataUploads++;
                }

                if (log.receivedAt > deviceActivity[sn].lastSeen) {
                    deviceActivity[sn].lastSeen = log.receivedAt;
                }
            });

            Object.entries(deviceActivity).forEach(([sn, activity]) => {
                console.log(`\n📡 Device SN: ${sn}`);
                console.log(`    Heartbeats: ${activity.heartbeats}`);
                console.log(`    Data Uploads: ${activity.dataUploads}`);
                console.log(`    Last Seen: ${activity.lastSeen.toISOString()}`);

                // Check if device is registered
                const registered = devices.find(d => d.deviceId === sn);
                if (registered) {
                    console.log(`    ✓ Registered as: ${registered.name}`);
                } else {
                    console.log(`    ⚠ Not registered (will auto-register on next data push)`);
                }
            });
        }

        // 3. Check for devices with TCP config but no ADMS activity
        console.log('\n\n' + '═'.repeat(80));
        console.log('DEVICES WITH NO RECENT ADMS ACTIVITY');
        console.log('═'.repeat(80));

        const activeSerials = recentLogs.map(log => log.serialNumber);
        const inactiveDevices = devices.filter(d => !activeSerials.includes(d.deviceId));

        if (inactiveDevices.length === 0) {
            console.log('\n✓ All registered devices are actively pushing data via ADMS');
        } else {
            console.log('\n⚠ The following devices are registered but NOT pushing via ADMS:\n');

            inactiveDevices.forEach((device, index) => {
                console.log(`[${index + 1}] ${device.name} (${device.deviceId})`);
                console.log(`    IP: ${device.ip}:${device.port}`);
                console.log(`    Last Sync: ${device.lastSyncAt ? device.lastSyncAt.toISOString() : 'Never'}`);
                console.log('');
                console.log('    Troubleshooting steps:');
                console.log('    1. Verify device can reach this server');
                console.log('    2. Check device push settings (Menu → Comm → Push Data)');
                console.log('    3. Ensure server IP and port 4000 are configured on device');
                console.log('    4. Check if device is powered on and network connected');
                console.log('');
            });
        }

        // 4. Network connectivity test
        console.log('\n' + '═'.repeat(80));
        console.log('SERVER CONFIGURATION');
        console.log('═'.repeat(80));
        console.log(`\nADMS Port: ${process.env.PORT || 4000}`);
        console.log(`MongoDB: ${MONGODB_URI}`);
        console.log(`\nTo test if server is reachable from device:`);
        console.log(`  1. From device menu: Menu → Comm → Test Server`);
        console.log(`  2. From network: ping <server-ip>`);
        console.log(`  3. Check firewall: Port ${process.env.PORT || 4000} must be open`);

        // 5. Recommendations
        console.log('\n\n' + '═'.repeat(80));
        console.log('RECOMMENDATIONS');
        console.log('═'.repeat(80));

        if (inactiveDevices.length > 0) {
            console.log('\n📋 For devices not connecting via ADMS:');
            console.log('\n1. Access device web interface: http://<device-ip>');
            console.log('2. Navigate to: Communication → Push Data');
            console.log('3. Configure:');
            console.log('   - Push Protocol: ADMS (or ICLOCK Protocol)');
            console.log('   - Server Address: <your-server-ip>');
            console.log('   - Server Port: 4000');
            console.log('   - Push Interval: 1 minute');
            console.log('   - Realtime: Enabled');
            console.log('4. Save and restart device');
            console.log('\n5. Monitor server logs for connection attempts:');
            console.log('   Look for: "ADMS Heartbeat: SN=<serial-number>"');
        }

        console.log('\n\n' + '═'.repeat(80));
        console.log('DIAGNOSTIC COMPLETE');
        console.log('═'.repeat(80));
        console.log('\nFor detailed troubleshooting guide, see: adms_connection_diagnosis.md\n');

        await mongoose.connection.close();

    } catch (error) {
        console.error('❌ Error running diagnostics:', error);
        process.exit(1);
    }
}

// Run diagnostics
diagnoseADMS();
