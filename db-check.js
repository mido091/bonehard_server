import { pool } from "./config/db.js";

async function test() {
  try {
    const [[row]] = await pool.execute("SELECT * FROM site_settings WHERE id = 1 LIMIT 1");
    console.log("SETTINGS ROW 1:", JSON.stringify(row, null, 2));
    
    const [social] = await pool.execute("SELECT * FROM site_social_links");
    console.log("SOCIAL LINKS:", JSON.stringify(social, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error("TEST FAILED:", err);
    process.exit(1);
  }
}

test();
