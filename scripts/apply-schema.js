import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runSqlFile = async (fileName) => {
  const filePath = path.resolve(__dirname, "..", "database", fileName);
  const sql = fs.readFileSync(filePath, "utf8");
  const statements = sql
    .split(/;\s*$/gm)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.query(statement, {});
  }
};

try {
  await runSqlFile("schema.sql");
  await runSqlFile("seed-statuses.sql");
  await runSqlFile("seed-templates.sql");
  console.log("Database schema, case statuses, and starter templates are ready.");
} catch (error) {
  console.error("Failed to apply database schema", {
    name: error.name,
    message: error.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
