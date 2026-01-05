
const fs = require('fs');
const content = fs.readFileSync('d:/li-hrms/backend/leaves/controllers/leaveController.js', 'utf8');
const lines = content.split('\n');

let balance = 0;
let inProcessAction = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('exports.processLeaveAction')) {
        inProcessAction = true;
        console.log(`Starting processLeaveAction at line ${i + 1}`);
    }

    if (inProcessAction) {
        for (let j = 0; j < line.length; j++) {
            if (line[j] === '{') balance++;
            if (line[j] === '}') balance--;
        }

        if (balance === 0 && line.trim() === '};') {
            console.log(`Ending processLeaveAction at line ${i + 1}`);
            // inProcessAction = false; // Don't stop, let's see if it continues
        }

        if (balance < 0) {
            console.log(`Imbalance detected at line ${i + 1}: balance is ${balance}`);
            console.log(`Line content: ${line}`);
            break;
        }

        if (line.includes('catch (error)')) {
            console.log(`Catch detected at line ${i + 1}, balance is ${balance}`);
        }
    }
}
console.log(`Final balance: ${balance}`);
