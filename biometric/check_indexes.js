const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function checkIndexes() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';
        await mongoose.connect(MONGODB_URI);

        const collection = mongoose.connection.collection('attendancelogs');
        const indexes = await collection.indexes();

        console.log('--- CURRENT INDEXES ---');
        console.log(JSON.stringify(indexes, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkIndexes();
