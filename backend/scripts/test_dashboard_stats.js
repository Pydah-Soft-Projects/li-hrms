
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

// Mock a user ID - you might need a real one from your DB
// I'll try to find one from the database if I can, or just use a placeholder
const testUserId = '67b36f73e7d58066f1fc977b'; // This is a placeholder

async function testDashboardStats() {
    try {
        console.log('Testing Dashboard Stats endpoint...');

        // Generate a token
        const token = jwt.sign({ userId: testUserId }, JWT_SECRET);

        const response = await axios.get(`${API_URL}/dashboard/stats`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching dashboard stats:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testDashboardStats();
