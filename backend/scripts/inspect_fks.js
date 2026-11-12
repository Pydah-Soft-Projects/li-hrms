const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require(path.join(__dirname, '../node_modules/mysql2/promise'));

async function inspectForeignKeys() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
  });

  const [fks] = await connection.query(`
    SELECT 
      TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM
      INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE
      TABLE_SCHEMA = 'maintenance_db' AND TABLE_NAME = 'complaints' AND REFERENCED_TABLE_NAME IS NOT NULL;
  `);
  console.log('Foreign keys on complaints:', fks);

  await connection.end();
}

inspectForeignKeys();

