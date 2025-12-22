try {
    console.log('Starting debug load...');
    const app = require('./server');
    console.log('App loaded successfully. Type:', typeof app);

    const request = require('supertest');
    console.log('Supertest loaded');

    (async () => {
        try {
            console.log('Attempting GET /health...');
            const response = await request(app).get('/health').timeout(5000);
            console.log('Response status:', response.status);
            console.log('Response body:', JSON.stringify(response.body, null, 2));
            process.exit(0);
        } catch (err) {
            console.error('Request failed:', err);
            if(process.env.NODE_ENV !== "test") process.exit(1);
        }
    })();
} catch (e) {
    console.error('Load failed:', e);
    if(process.env.NODE_ENV !== "test") process.exit(1);
}
