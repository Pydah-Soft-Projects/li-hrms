/**
 * Health Check API Tests
 * This test file verifies that the backend server is running correctly
 * and responding to basic health probe requests.
 */

console.log('--- Health Test Starting ---');
const request = require('supertest');
const app = require('../../server');
console.log('--- App Injected into Test ---');

describe('API Health Checks', () => {

    /**
     * Test Case: 
     * Verifies that the root endpoint (/) returns the correct metadata and status.
     */
    test('GET / should return operational status and metadata', async () => {
        const response = await request(app).get('/');

        // Check for HTTP 200 OK status
        expect(response.status).toBe(200);

        // Verify the response structure
        expect(response.body).toHaveProperty('name', 'HRMS Backend API');
        expect(response.body).toHaveProperty('status', 'running');
        expect(response.body.endpoints).toBeDefined();
    });

    /**
     * Test Case:
     * Verifies the /health endpoint for server monitoring.
     */
    test('GET /health should return healthy status and timestamp', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
        expect(response.body.timestamp).toBeDefined();

        // Ensure timestamp is a valid ISO string
        expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });
});
