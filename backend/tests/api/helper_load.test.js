describe('SQL Helper Load Test', () => {
    test('should load sql helper', () => {
        console.log('--- START HELPER LOAD ---');
        const helper = require('../../employees/config/sqlHelper');
        console.log('--- END HELPER LOAD ---');
        expect(helper).toBeDefined();
    });
});
