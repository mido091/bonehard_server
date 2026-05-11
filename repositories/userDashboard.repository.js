import { pool } from "../config/db.js";

const sevenDaySeriesSql = `
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY) AS date UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) UNION ALL
  SELECT CURRENT_DATE()
`;

const userOrderWhere = `
  c.target_id = :userId
  AND c.created_by = :userId
  AND creator.role = 'user'
  AND c.is_archived = 0
`;

const normalizeNumber = (value) => Number(value || 0);

export const getUserOrderDashboardAnalytics = async (userId) => {
  const [
    [summaryRows],
    [recentRows],
    [trendRows],
  ] = await Promise.all([
    pool.execute(
      `
        SELECT
          COUNT(DISTINCT c.id) AS totalOrders,
          COUNT(DISTINCT CASE WHEN DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) THEN c.id END) AS submitted14d,
          COUNT(DISTINCT CASE WHEN c.target_time IS NOT NULL AND c.target_time <> '' THEN c.id END) AS withTargetTime,
          COUNT(DISTINCT CASE WHEN c.contact_phone IS NOT NULL AND c.contact_phone <> '' AND c.contact_email IS NOT NULL AND c.contact_email <> '' THEN c.id END) AS completeContact,
          MAX(c.created_at) AS latestSubmittedAt,
          COUNT(DISTINCT CASE WHEN cf.id IS NOT NULL THEN c.id END) AS withFiles,
          COUNT(cf.id) AS totalFiles
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_files cf ON cf.case_id = c.id
        WHERE ${userOrderWhere}
      `,
      { userId },
    ),
    pool.execute(
      `
        SELECT
          c.id,
          c.name,
          c.start_date AS startDate,
          c.created_at AS createdAt,
          c.target_time AS targetTime,
          c.contact_phone AS contactPhone,
          c.contact_email AS contactEmail,
          COUNT(cf.id) AS fileCount
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_files cf ON cf.case_id = c.id
        WHERE ${userOrderWhere}
        GROUP BY c.id, c.name, c.start_date, c.created_at, c.target_time, c.contact_phone, c.contact_email
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 5
      `,
      { userId },
    ),
    pool.execute(
      `
        SELECT ds.date, COALESCE(created.total, 0) AS total
        FROM (${sevenDaySeriesSql}) ds
        LEFT JOIN (
          SELECT DATE(c.created_at) AS date, COUNT(*) AS total
          FROM cases c
          LEFT JOIN users creator ON creator.id = c.created_by
          WHERE ${userOrderWhere}
            AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
          GROUP BY DATE(c.created_at)
        ) created ON created.date = ds.date
        ORDER BY ds.date ASC
      `,
      { userId },
    ),
  ]);

  const summary = summaryRows[0] || {};

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalOrders: normalizeNumber(summary.totalOrders),
      submitted14d: normalizeNumber(summary.submitted14d),
      withFiles: normalizeNumber(summary.withFiles),
      totalFiles: normalizeNumber(summary.totalFiles),
      withTargetTime: normalizeNumber(summary.withTargetTime),
      completeContact: normalizeNumber(summary.completeContact),
      latestSubmittedAt: summary.latestSubmittedAt || null,
    },
    charts: {
      ordersTrend: trendRows.map((row) => ({
        date: row.date,
        total: normalizeNumber(row.total),
      })),
    },
    lists: {
      recentOrders: recentRows.map((row) => ({
        ...row,
        fileCount: normalizeNumber(row.fileCount),
      })),
    },
  };
};
