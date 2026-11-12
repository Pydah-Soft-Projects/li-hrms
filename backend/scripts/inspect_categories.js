const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require(path.join(__dirname, '../node_modules/mysql2/promise'));

async function inspectCategories() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
  });

  const [categoriesCols] = await connection.query('DESCRIBE categories');
  console.log('Categories columns:', categoriesCols);

  const [categories] = await connection.query('SELECT * FROM categories');
  console.log('Categories:', JSON.stringify(categories, null, 2));

  // Check if there are colleges or locations or users in maintenance_db
  try {
    const [complaintSample] = await connection.query('SELECT DISTINCT college_id, college_name, block_no, floor_no, room_no FROM complaints LIMIT 20');
    console.log('Distinct locations in complaints:', JSON.stringify(complaintSample, null, 2));
  } catch (e) {
    console.log(e.message);
  }

  // Check complaints with reference_site = 'HRMS'
  const [hrmsComplaints] = await connection.query("SELECT * FROM complaints WHERE reference_site = 'HRMS' LIMIT 5");
  console.log('HRMS complaints:', JSON.stringify(hrmsComplaints, null, 2));

  await connection.end();
}

inspectCategories();

