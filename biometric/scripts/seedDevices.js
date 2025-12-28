require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../src/models/Device');
const logger = require('../src/utils/logger');

// Initial devices to seed
const initialDevices = [
    {
        deviceId: "DEVICE_003",
        name: "Main Gate",
        ip: "192.168.3.84",
        port: 4370,
        enabled: true,
        location: "Main Entrance"
    },
    {
        deviceId: "DEVICE_004",
        name: "Office Entrance",
        ip: "192.168.3.85",
        port: 4370,
        enabled: true,
        location: "Office Building"
    }
];

async function seedDevices() {
    try {
        // Connect to MongoDB
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';
        await mongoose.connect(MONGODB_URI);
        logger.info('Connected to MongoDB');

        // Clear existing devices (optional - comment out if you want to keep existing)
        // await Device.deleteMany({});
        // logger.info('Cleared existing devices');

        // Insert devices
        for (const deviceData of initialDevices) {
            const existingDevice = await Device.findOne({ deviceId: deviceData.deviceId });

            if (existingDevice) {
                logger.info(`Device ${deviceData.deviceId} already exists, skipping...`);
            } else {
                const device = new Device(deviceData);
                await device.save();
                logger.info(`Added device: ${deviceData.deviceId} - ${deviceData.name}`);
            }
        }

        logger.info('Device seeding completed successfully!');

        // Display all devices
        const allDevices = await Device.find();
        console.log('\n=== Current Devices in Database ===');
        allDevices.forEach(device => {
            console.log(`${device.deviceId}: ${device.name} (${device.ip}:${device.port}) - ${device.enabled ? 'Enabled' : 'Disabled'}`);
        });

        await mongoose.connection.close();
        logger.info('Database connection closed');

    } catch (error) {
        logger.error('Error seeding devices:', error);
        process.exit(1);
    }
}

// Run the seed function
seedDevices();
