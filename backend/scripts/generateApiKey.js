require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const ApiKey = require('../security/model/ApiKey');

async function generateKey() {
  try {
    const clientName = process.argv[2] || 'External Client';
    
    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Generate a secure random API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const apiKey = `lihrms_${rawKey}`;
    
    // Save to database
    const newKey = new ApiKey({
      key: apiKey,
      clientName: clientName
    });
    
    await newKey.save();
    
    console.log('\n--- API KEY GENERATED SUCCESSFULLY ---');
    console.log(`Client Name: ${clientName}`);
    console.log(`API Key:     ${apiKey}`);
    console.log('--------------------------------------\n');
    console.log('Please provide this key to the client. They should pass it in the headers as:');
    console.log('x-api-key: ' + apiKey);
    
  } catch (error) {
    console.error('Error generating API key:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

generateKey();
