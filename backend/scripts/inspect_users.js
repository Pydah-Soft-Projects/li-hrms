const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require(path.join(__dirname, '../node_modules/mysql2/promise'));

async function inspectUsers() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
  });

  const [users] = await connection.query(`SELECT id, username, email, hrms_id, role_id FROM users LIMIT 10`);
  console.log('Sample users in maintenance_db:', users);

  await connection.end();
}

inspectUsers();

