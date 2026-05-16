import { pool } from "../config/db.js";
import { hashPassword } from "../utils/password.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "BoneHard Admin";

if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD are required to seed an admin user.");
  process.exit(1);
}

try {
  const passwordHash = await hashPassword(password);

  await pool.query(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES (:name, :email, :passwordHash, 'admin')
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        password_hash = VALUES(password_hash),
        role = 'admin'
    `,
    { name, email, passwordHash },
  );

  console.log("Admin user is ready", { email });
} catch (error) {
  console.error("Failed to seed admin user", {
    name: error.name,
    message: error.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
