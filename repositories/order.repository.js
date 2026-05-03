import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

export async function createOrder({ contactName, contactNumber, contactEmail, scopeOfWork, fileLink }) {
  const [result] = await pool.execute(
    `INSERT INTO orders (contact_name, contact_number, contact_email, scope_of_work, file_link)
     VALUES (?, ?, ?, ?, ?)`,
    [contactName, contactNumber, contactEmail, scopeOfWork, fileLink || null]
  );
  return { id: result.insertId };
}

export async function listOrders({ page = 1, limit = 20, status } = {}) {
  const paging = toLimitOffsetSql({ page, perPage: limit });
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM orders ${where}`,
    params
  );

  const [rows] = await pool.execute(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC ${paging.sql}`,
    params
  );

  return {
    rows,
    meta: { total, page: paging.page, limit: paging.perPage, pages: Math.ceil(total / paging.perPage) },
  };
}

export async function getOrderById(id) {
  const [[row]] = await pool.execute(`SELECT * FROM orders WHERE id = ?`, [id]);
  return row || null;
}

export async function updateOrderStatus(id, status, notes = null) {
  await pool.execute(
    `UPDATE orders SET status = ?, notes = ? WHERE id = ?`,
    [status, notes, id]
  );
}

export async function deleteOrder(id) {
  await pool.execute(`DELETE FROM orders WHERE id = ?`, [id]);
}
