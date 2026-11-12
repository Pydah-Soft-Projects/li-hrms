const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require(path.join(__dirname, '../node_modules/mysql2/promise'));

async function inspectLocations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
  });

  const [colleges] = await connection.query(`
    SELECT DISTINCT college_id, college_name 
    FROM complaints 
    WHERE college_name IS NOT NULL AND college_name != ''
  `);
  console.log('Distinct colleges in complaints:', colleges);

  const [blocks] = await connection.query(`
    SELECT DISTINCT college_name, block_no 
    FROM complaints 
    WHERE block_no IS NOT NULL AND block_no != ''
  `);
  console.log('Distinct blocks in complaints:', blocks);

  const [floors] = await connection.query(`
    SELECT DISTINCT floor_no 
    FROM complaints 
    WHERE floor_no IS NOT NULL AND floor_no != ''
  `);
  console.log('Distinct floors in complaints:', floors);

  const [rooms] = await connection.query(`
    SELECT DISTINCT room_no 
    FROM complaints 
    WHERE room_no IS NOT NULL AND room_no != ''
  `);
  console.log('Distinct rooms in complaints:', rooms);

  const [allCategories] = await connection.query(`
    SELECT id, name, description, parent_id, is_active 
    FROM categories
  `);
  console.log('All categories:', allCategories);

  // Check how complaint_number is formatted across complaints
  const [complaintNumbers] = await connection.query(`
    SELECT complaint_number, created_at 
    FROM complaints 
    ORDER BY id DESC LIMIT 10
  `);
  console.log('Recent complaint numbers:', complaintNumbers);

  await connection.end();
}

inspectLocations();

