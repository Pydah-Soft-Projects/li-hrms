const fs = require('fs');
const path = 'd:/Ravi Buraga PydahSoft/li-hrms/frontend/src/app/superadmin/attendance/page.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/<\/div\s+>/g, '</div>');
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed all malformed div tags.');
