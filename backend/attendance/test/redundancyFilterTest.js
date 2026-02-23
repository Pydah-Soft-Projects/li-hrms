/**
 * Test Redundancy Filter Logic
 * This script tests the 30-minute redundancy filtering
 */

const { filterRedundantLogs } = require('../services/attendanceSyncService');

async function testRedundancyFilter() {
    console.log('🧪 Testing 30-Minute Redundancy Filter...\n');

    // Test Case 1: Same employee, same type, within 30 minutes
    const testLogs1 = [
        {
            employeeNumber: 'EMP001',
            timestamp: '2026-02-23T09:00:00Z',
            type: 'IN',
            source: 'test'
        },
        {
            employeeNumber: 'EMP001',
            timestamp: '2026-02-23T09:15:00Z', // 15 minutes later
            type: 'IN',
            source: 'test'
        },
        {
            employeeNumber: 'EMP001',
            timestamp: '2026-02-23T09:45:00Z', // 45 minutes later (should be kept)
            type: 'IN',
            source: 'test'
        }
    ];

    console.log('📋 Test Case 1: Same employee, same type, different times');
    console.log('Input logs:', testLogs1.length);
    
    const filtered1 = await filterRedundantLogs(testLogs1, 30);
    console.log('Filtered logs:', filtered1.length);
    console.log('Expected: 2 (first and third logs kept, second filtered)');
    console.log('✅ Pass:', filtered1.length === 2 ? 'YES' : 'NO');
    console.log('');

    // Test Case 2: Different types should not be filtered
    const testLogs2 = [
        {
            employeeNumber: 'EMP002',
            timestamp: '2026-02-23T09:00:00Z',
            type: 'IN',
            source: 'test'
        },
        {
            employeeNumber: 'EMP002',
            timestamp: '2026-02-23T09:15:00Z', // 15 minutes later
            type: 'OUT', // Different type - should be kept
            source: 'test'
        }
    ];

    console.log('📋 Test Case 2: Same employee, different types');
    console.log('Input logs:', testLogs2.length);
    
    const filtered2 = await filterRedundantLogs(testLogs2, 30);
    console.log('Filtered logs:', filtered2.length);
    console.log('Expected: 2 (both logs kept - different types)');
    console.log('✅ Pass:', filtered2.length === 2 ? 'YES' : 'NO');
    console.log('');

    // Test Case 3: Different employees should not be filtered
    const testLogs3 = [
        {
            employeeNumber: 'EMP003',
            timestamp: '2026-02-23T09:00:00Z',
            type: 'IN',
            source: 'test'
        },
        {
            employeeNumber: 'EMP004',
            timestamp: '2026-02-23T09:15:00Z', // 15 minutes later
            type: 'IN',
            source: 'test'
        }
    ];

    console.log('📋 Test Case 3: Different employees');
    console.log('Input logs:', testLogs3.length);
    
    const filtered3 = await filterRedundantLogs(testLogs3, 30);
    console.log('Filtered logs:', filtered3.length);
    console.log('Expected: 2 (both logs kept - different employees)');
    console.log('✅ Pass:', filtered3.length === 2 ? 'YES' : 'NO');
    console.log('');

    // Test Case 4: Edge case - exactly 30 minutes
    const testLogs4 = [
        {
            employeeNumber: 'EMP005',
            timestamp: '2026-02-23T09:00:00Z',
            type: 'IN',
            source: 'test'
        },
        {
            employeeNumber: 'EMP005',
            timestamp: '2026-02-23T09:30:00Z', // Exactly 30 minutes later
            type: 'IN',
            source: 'test'
        }
    ];

    console.log('📋 Test Case 4: Exactly 30 minutes apart');
    console.log('Input logs:', testLogs4.length);
    
    const filtered4 = await filterRedundantLogs(testLogs4, 30);
    console.log('Filtered logs:', filtered4.length);
    console.log('Expected: 1 (second filtered - exactly 30min window)');
    console.log('✅ Pass:', filtered4.length === 1 ? 'YES' : 'NO');
    console.log('');

    console.log('🎯 Redundancy Filter Test Complete!');
    console.log('📝 Summary: The filter should only remove logs that are:');
    console.log('   - Same employee');
    console.log('   - Same type (IN/OUT)');
    console.log('   - Within 30-minute window');
    console.log('   - Different employees, types, or >30min apart should be kept');
}

// Run test if called directly
if (require.main === module) {
    testRedundancyFilter().catch(console.error);
}

module.exports = { testRedundancyFilter };
