const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Device = require('../src/models/Device');

const devices = [
    {
        deviceId: 'DEV-104',
        name: 'Device-104 (Office)',
        ip: '192.168.10.104',
        port: 4370,
        enabled: true,
        location: 'Main Office'
    },
    {
        deviceId: 'DEV-097',
        name: 'Device-097 (Entrance)',
        ip: '192.168.10.97',
        port: 4370,
        enabled: true,
        location: 'Entrance'
    }
];

async function seedDevices() {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs-1';

    console.log('Connecting to MongoDB:', MONGODB_URI);

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        for (const dev of devices) {
            await Device.findOneAndUpdate(
                { deviceId: dev.deviceId },
                dev,
                { upsert: true, new: true }
            );
            console.log(`- Device ${dev.name} (${dev.ip}) seeded/updated.`);
        }

        console.log('\nAll devices have been successfully seeded!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding devices:', err);
        process.exit(1);
    }
}

seedDevices();
