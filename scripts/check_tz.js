import mysql from 'mysql2/promise';
import fs from 'fs';
import { config } from 'dotenv';
config();
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { ca: fs.readFileSync('./isrgrootx1.pem', 'utf8') }
});
const [[tz]] = await conn.execute("SELECT NOW() AS dbNow, UTC_TIMESTAMP() AS utcNow");
console.log(JSON.stringify(tz));
await conn.end();
