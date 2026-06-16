require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || '/hrms';
    await mongoose.connect(mongoURI, {
      maxPoolSize: 50, // Handle high concurrency
      minPoolSize: 10,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully (Pool Size: 500)', mongoURI);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    if (process.env.NODE_ENV !== 'test') {
      if (process.env.NODE_ENV !== "test") if (process.env.NODE_ENV !== "test") process.exit(1);
    }
  }
};

const closeMongoDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
};

const initializeDatabases = async () => {
  await connectMongoDB();
};

module.exports = {
  connectMongoDB,
  closeMongoDB,
  initializeDatabases,
  mongoose,
};
