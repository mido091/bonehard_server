import { pool, testDatabaseConnection } from "../config/db.js";

try {
  const result = await testDatabaseConnection();

  console.log("Database connection verified", {
    database: result.databaseName,
    host: result.host,
    port: result.port,
  });
} catch (error) {
  console.error("Database connection failed", {
    name: error.name,
    message: error.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
