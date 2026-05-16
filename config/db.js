/**
 * @file db.js
 * @description MySQL connection pool configuration.
 *
 * Uses `mysql2/promise` (the async/await-friendly MySQL client).
 * The pool is created once and shared across all modules via a singleton export.
 *
 * SSL Configuration:
 *   - If DB_ATTR_SSL_CA is a raw PEM certificate string → use it directly
 *   - If DB_ATTR_SSL_CA is a file path → read the file from disk
 *   - If the file doesn't exist → fall back to relaxed TLS (rejectUnauthorized: false)
 *   - This covers TiDB Cloud, PlanetScale, and self-hosted MySQL with TLS
 *
 * Pool Options:
 *   - connectionLimit: 10 simultaneous DB connections
 *   - keepAlive: Ping idle connections every 10s to prevent cloud DB timeouts
 *   - namedPlaceholders: Allows :name syntax in SQL queries 
 * Test
 */

import mysql from "mysql2/promise";
import { env } from "./env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the SSL certificate configuration for the database connection.
 *
 * Priority:
 *  1. DB_ATTR_SSL_CA starts with "-----BEGIN CERTIFICATE-----" → raw PEM string
 *  2. DB_ATTR_SSL_CA is a file path → read file from disk
 *  3. File not found → relaxed TLS without custom CA (warns in console)
 *
 * @returns {object|undefined} SSL options object or undefined if no SSL needed
 */
const resolveSslConfig = () => {
  const rawValue = `${process.env.DB_ATTR_SSL_CA || "isrgrootx1.pem"}`.trim();

  // No SSL value provided — return undefined (no SSL or rely entirely on server default)
  if (!rawValue) {
    return undefined;
  }

  // Direct PEM certificate content provided as an environment variable
  if (rawValue.startsWith("-----BEGIN CERTIFICATE-----")) {
    return {
      ca: rawValue,
      rejectUnauthorized: true,
    };
  }

  // Treat value as a file path. Relative paths are resolved from /server first.
  const certificatePath = path.isAbsolute(rawValue)
    ? rawValue
    : path.resolve(__dirname, "..", rawValue);

  // File doesn't exist — warn and fall back to relaxed TLS
  if (!fs.existsSync(certificatePath)) {
    console.warn("SSL CA file not found; using relaxed TLS settings without custom CA", {
      certificatePath,
    });
    return {
      rejectUnauthorized: false,
    };
  }

  // File found — use it as the CA certificate bundle
  return {
    ca: fs.readFileSync(certificatePath, "utf8"),
    rejectUnauthorized: true,
  };
};

/**
 * The global database connection pool.
 * Shared across the entire application — import `pool` or `default` to use it.
 */
const pool = mysql.createPool({
  host: env.dbHost,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  port: env.dbPort,
  ssl: resolveSslConfig(),          // Dynamic SSL based on env
  namedPlaceholders: true,          // Enables :paramName syntax in queries
  waitForConnections: true,         // Queue requests when all connections are in use
  connectionLimit: 10,              // Maximum concurrent connections
  queueLimit: 0,                    // Unlimited queue size (0 = no limit)
  enableKeepAlive: true,            // Send periodic keep-alive pings
  keepAliveInitialDelay: 10000,     // First keep-alive after 10 seconds of idle
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: true,
});

// Listen for unexpected idle connection errors (e.g. DB server restarted)
// Log them but don't crash — the pool will reconnect automatically
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", {
    name: err.name,
    message: err.message,
  });
});

/**
 * Verifies that the application can acquire a DB connection and run a tiny query.
 * This is intentionally lightweight so it can run safely during startup and tests.
 *
 * @returns {Promise<object>} Basic connection metadata for logs and health checks
 */
export const testDatabaseConnection = async () => {
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query("SELECT 1 AS ok, DATABASE() AS databaseName");
    return {
      ok: rows?.[0]?.ok === 1,
      databaseName: rows?.[0]?.databaseName || env.dbName,
      host: env.dbHost,
      port: env.dbPort,
    };
  } finally {
    connection.release();
  }
};

export { pool };
export default pool;
