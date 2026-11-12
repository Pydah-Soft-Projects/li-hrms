const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require(path.join(__dirname, '../node_modules/mysql2/promise'));

async function checkDb() {
  console.log('Connecting to:', process.env.DB_HOST, 'Database:', process.env.DB_NAME);
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: 3306,
      connectTimeout: 15000
    });

    console.log('Connected successfully!');
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tables in database:', JSON.stringify(tables, null, 2));

    // Check structure of complaints
    const [complaintsCols] = await connection.query('DESCRIBE complaints');
    console.log('Complaints table columns:');
    complaintsCols.forEach(c => console.log(`  ${c.Field}: ${c.Type} | Null: ${c.Null} | Key: ${c.Key} | Default: ${c.Default}`));

    // Check all tables
    for (const row of tables) {
      const tableName = Object.values(row)[0];
      if (tableName !== 'complaints') {
        const [cols] = await connection.query(`DESCRIBE \`${tableName}\``);
        console.log(`\nTable ${tableName} columns:`, cols.map(c => `${c.Field} (${c.Type})`));
        try {
          const [sample] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT 3`);
          console.log(`Sample from ${tableName}:`, JSON.stringify(sample, null, 2));
        } catch (e) {
          console.log(`Could not sample from ${tableName}:`, e.message);
        }
      }
    }

    // Sample from complaints
    const [sampleComplaints] = await connection.query('SELECT * FROM complaints ORDER BY id DESC LIMIT 2');
    console.log('\nSample complaints:', JSON.stringify(sampleComplaints, null, 2));

    await connection.end();
  } catch (err) {
    console.error('Error connecting to MySQL:', err);
  }
}

checkDb();
