console.log('--- COLLECTION START ---');
const appInstance = require('../../server');
console.log('--- COLLECTION SUCCESS ---');

describe('Minimal App Test', () => {
    test('should load app', () => {
        expect(appInstance).toBeDefined();
    });
});
