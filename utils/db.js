import { pool } from "../config/db.js";

export const withTransaction = async (callback) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const toLimitOffset = ({ page = 1, perPage = 20 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePerPage = Math.min(Math.max(Number(perPage) || 20, 1), 100);

  return {
    page: safePage,
    perPage: safePerPage,
    limit: safePerPage,
    offset: (safePage - 1) * safePerPage,
  };
};

export const toLimitOffsetSql = (query = {}) => {
  const paging = toLimitOffset(query);

  return {
    ...paging,
    // LIMIT/OFFSET are sanitized integers before being embedded for TiDB compatibility.
    sql: `LIMIT ${paging.limit} OFFSET ${paging.offset}`,
  };
};
