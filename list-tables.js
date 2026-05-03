import db from './config/db.js';

async function run() {
  const [rows] = await db.query('SHOW TABLES');
  console.log(rows);
  process.exit(0);
}

run();
