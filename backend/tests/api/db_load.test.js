describe('DB Load Test', () => {
    test('should load database config', () => {
        console.log('--- START DB LOAD ---');
        const db = require('../../config/database');
        console.log('--- END DB LOAD ---');
        expect(db).toBeDefined();
    });
});
