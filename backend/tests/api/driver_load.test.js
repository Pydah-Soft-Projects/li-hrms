describe('Driver Load Test', () => {
    test('should load mssql', () => {
        console.log('--- START MSSQL LOAD ---');
        require('mssql');
        console.log('--- END MSSQL LOAD ---');
    });
    test('should load mysql2', () => {
        console.log('--- START MYSQL2 LOAD ---');
        require('mysql2/promise');
        console.log('--- END MYSQL2 LOAD ---');
    });
    test('should load mongoose', () => {
        console.log('--- START MONGOOSE LOAD ---');
        require('mongoose');
        console.log('--- END MONGOOSE LOAD ---');
    });
});
