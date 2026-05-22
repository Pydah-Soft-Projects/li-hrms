require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const ZKLib = require('node-zklib');
const Device = require('../src/models/Device');
const DeviceService = require('../src/services/deviceService');
const logger = require('../src/utils/logger');

/**
 * ============================================================
 * BIOMETRIC DEVICE LOG CLEARANCE SCRIPT (INTERACTIVE)
 * ============================================================
 * This script allows you to selectively clear attendance logs 
 * from biometric devices directly via TCP.
 * 
 * ⚠️ WARNING: THIS PERMANENTLY DELETES LOGS FROM THE DEVICE.
 * NO BACKUP IS CREATED BY DEFAULT IN THIS SCRIPT.
 * ============================================================
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function prompt(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

// Prevent script from crashing on internal library errors (like the subarray null error)
process.on('uncaughtException', (err) => {
    // console.error('\x1b[31m[UNCAUGHT EXCEPTION]\x1b[0m', err.message);
    // Usually these are non-fatal for our interactive loop if they happen in a background socket callback
});

process.on('unhandledRejection', (reason, promise) => {
    // console.error('\x1b[31m[UNHANDLED REJECTION]\x1b[0m', reason);
});

async function checkConnectivity(device) {
    const zk = new ZKLib(device.ip, device.port, 5000, 4000);
    try {
        await zk.createSocket();
        // Use getInfo instead of getAttendances - it's much faster and safer
        const info = await zk.getInfo();
        await zk.disconnect();
        return { online: true, logCount: info.logCounts || 0 };
    } catch (err) {
        // If getInfo fails, try a simple connect/disconnect to at least show online status
        try {
            await zk.disconnect().catch(() => {});
        } catch (e) {}
        return { online: false, error: err.message };
    }
}

async function main() {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';
    
    try {
        console.log('\n🚀 Initializing Device Clearance Tool...\n');
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB');

        const devices = await Device.find({ enabled: true }).sort({ deviceId: 1 }).lean();
        
        if (devices.length === 0) {
            console.log('❌ No enabled devices found in database.');
            process.exit(0);
        }

        console.log('\n🔍 Checking device connectivity and log counts...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`${'#'.padEnd(3)} | ${'Device ID'.padEnd(15)} | ${'Name'.padEnd(20)} | ${'Status'.padEnd(10)} | ${'Logs'.padEnd(6)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const deviceStatuses = [];
        for (let i = 0; i < devices.length; i++) {
            const dev = devices[i];
            const status = await checkConnectivity(dev);
            deviceStatuses.push({ ...dev, ...status });
            
            const statusStr = status.online ? '\x1b[32mONLINE\x1b[0m' : '\x1b[31mOFFLINE\x1b[0m';
            const logStr = status.online ? status.logCount : 'N/A';
            
            console.log(`${String(i + 1).padEnd(3)} | ${dev.deviceId.padEnd(15)} | ${dev.name.padEnd(20)} | ${statusStr.padEnd(19)} | ${String(logStr).padEnd(6)}`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const selection = await prompt('\nEnter index(es) to clear (e.g., 1,3 or "all") [Cancel: press Enter]: ');
        if (!selection.trim()) {
            console.log('Operation cancelled.');
            process.exit(0);
        }

        let selectedDevices = [];
        if (selection.toLowerCase() === 'all') {
            selectedDevices = deviceStatuses.filter(d => d.online);
        } else {
            const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
            selectedDevices = indices.map(idx => deviceStatuses[idx]).filter(d => d && d.online);
        }

        if (selectedDevices.length === 0) {
            console.log('❌ No valid online devices selected.');
            process.exit(0);
        }

        console.log('\nSelected Devices:');
        selectedDevices.forEach(d => console.log(` - ${d.name} (${d.deviceId}) [${d.logCount} logs]`));

        const mode = await prompt('\nChoose mode: (1) Dry Run, (2) APPLY DELETION [Default: 1]: ');
        const isDryRun = mode !== '2';

        if (isDryRun) {
            console.log('\n✨ DRY RUN MODE: No data will be deleted.');
        } else {
            const confirm = await prompt(`\n⚠️  DANGER: You are about to PERMANENTLY DELETE logs from ${selectedDevices.length} device(s). 
Type 'CONFIRM' to proceed: `);
            if (confirm !== 'CONFIRM') {
                console.log('Confirmation failed. Aborting.');
                process.exit(0);
            }
        }

        const deviceService = new DeviceService();

        for (const dev of selectedDevices) {
            console.log(`\nProcessing ${dev.name} (${dev.deviceId})...`);
            
            if (isDryRun) {
                console.log(`   [DRY-RUN] Would have cleared ${dev.logCount} logs.`);
                continue;
            }

            try {
                const zk = new ZKLib(dev.ip, dev.port, 10000, 4000);
                await zk.createSocket();
                
                console.log(`   Connected. Sending clear command...`);
                // Use the service logic directly
                await zk.disableDevice();
                await zk.clearAttendanceLog();
                // Refresh data to commit
                const { COMMANDS } = require('node-zklib/constants');
                await zk.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
                await zk.enableDevice();
                await zk.disconnect();

                console.log(`   ✅ Logs cleared successfully on ${dev.name}.`);

                // Update MongoDB lastLogTimestamp to null as logs are gone
                await Device.updateOne(
                    { deviceId: dev.deviceId },
                    { 
                        $set: { 
                            lastLogTimestamp: null,
                            lastSyncStatus: 'success',
                            lastSyncAt: new Date()
                        } 
                    }
                );
                console.log(`   ✅ Database record updated.`);

            } catch (err) {
                console.error(`   ❌ Failed to clear ${dev.name}: ${err.message}`);
            }
        }

        console.log('\n🏁 Process completed.');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ An error occurred:', err.message);
        process.exit(1);
    }
}

main();
