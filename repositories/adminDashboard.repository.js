import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

const userOrderCondition = `
  c.target_id IS NOT NULL
  AND c.created_by = c.target_id
  AND creator.role = 'user'
`;

const caseCondition = `NOT (${userOrderCondition})`;
const closedStatusCondition = `s.name IN ('Completed', 'Delivered', 'Closed')`;

const fourteenDaySeriesSql = `
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) AS date UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 12 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 11 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 9 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY) UNION ALL
  SELECT DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) UNION ALL
  SELECT CURRENT_DATE()
`;

const normalizeNumber = (value) => Number(value || 0);

export const listUsers = async ({ page = 1, perPage = 20, search = "", role = null } = {}) => {
  const paging = toLimitOffsetSql({ page, perPage });
  const where = [];
  const params = {};

  if (search) {
    where.push("(name LIKE :search OR email LIKE :search)");
    params.search = `%${search}%`;
  }

  if (role) {
    where.push("role = :role");
    params.role = role;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
      SELECT
          u.id, u.name, u.email, u.phone, u.address, u.role, u.is_active AS isActive, u.chat_enabled AS chatEnabled,
        u.created_at AS createdAt,
        (
          SELECT s.name
          FROM cases c
          JOIN case_statuses s ON s.id = c.status_id
          WHERE c.target_id = u.id AND c.is_archived = 0
          ORDER BY c.created_at DESC
          LIMIT 1
        ) AS latestCaseStatus
      FROM users u
      ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users ${whereSql}`,
    params,
  );

  return {
    rows,
    meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) },
  };
};

export const updateUserRole = async (id, role) => {
  await pool.execute(
    `UPDATE users SET role = :role WHERE id = :id`,
    { id, role },
  );
};

export const createAdminUser = async ({ name, email, passwordHash, phone = null, address = null, role = "user", isActive = true, chatEnabled = false }) => {
  const [result] = await pool.execute(
    `
        INSERT INTO users (name, email, password_hash, phone, address, role, is_active, chat_enabled)
        VALUES (:name, :email, :passwordHash, :phone, :address, :role, :isActive, :chatEnabled)
    `,
    {
      name,
      email,
      passwordHash,
      phone: phone || null,
      address: address || null,
        role,
        isActive: isActive ? 1 : 0,
        chatEnabled: chatEnabled || role !== "user" ? 1 : 0,
      },
    );
  
    const [rows] = await pool.execute(
      `SELECT id, name, email, phone, address, role, is_active AS isActive, chat_enabled AS chatEnabled, created_at AS createdAt FROM users WHERE id = :id LIMIT 1`,
    { id: result.insertId },
  );

  return rows[0] || null;
};

export const updateAdminUser = async (id, payload) => {
  const fields = [];
  const params = { id };

  if (payload.name !== undefined) {
    fields.push("name = :name");
    params.name = payload.name;
  }
  if (payload.email !== undefined) {
    fields.push("email = :email");
    params.email = payload.email;
  }
  if (payload.phone !== undefined) {
    fields.push("phone = :phone");
    params.phone = payload.phone || null;
  }
  if (payload.address !== undefined) {
    fields.push("address = :address");
    params.address = payload.address || null;
  }
  if (payload.role !== undefined) {
    fields.push("role = :role");
    params.role = payload.role;
  }
    if (payload.isActive !== undefined) {
      fields.push("is_active = :isActive");
      params.isActive = payload.isActive ? 1 : 0;
    }
    if (payload.chatEnabled !== undefined) {
      fields.push("chat_enabled = :chatEnabled");
      params.chatEnabled = payload.chatEnabled ? 1 : 0;
    }
  if (payload.passwordHash !== undefined) {
    fields.push("password_hash = :passwordHash");
    params.passwordHash = payload.passwordHash;
  }

  if (!fields.length) return null;

  await pool.execute(
    `UPDATE users SET ${fields.join(", ")} WHERE id = :id`,
    params,
  );

  const [rows] = await pool.execute(
      `SELECT id, name, email, phone, address, role, is_active AS isActive, chat_enabled AS chatEnabled, created_at AS createdAt FROM users WHERE id = :id LIMIT 1`,
    { id },
  );

  return rows[0] || null;
};

export const deleteAdminUser = async (id) => {
  await pool.execute(`DELETE FROM users WHERE id = :id`, { id });
};

export const getDashboardAnalytics = async (userId) => {
  const [
    [summaryRows],
    [userSummaryRows],
    [taskRows],
    [messageRows],
    [notificationRows],
    [caseStatusRows],
    [caseTrendRows],
    [orderTrendRows],
    [recentCaseRows],
    [recentOrderRows],
    [recentMessageRows],
    [recentUserRows],
    [attentionCaseRows],
    [attentionTaskRows],
    [leaderRows],
    [assigneeRows],
    [profitRows],
  ] = await Promise.all([
    pool.execute(
      `
        SELECT
          SUM(CASE WHEN ${caseCondition} THEN 1 ELSE 0 END) AS totalCases,
          SUM(CASE WHEN ${caseCondition} AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) THEN 1 ELSE 0 END) AS newCases14d,
          SUM(CASE WHEN ${caseCondition} AND s.name NOT IN ('Completed', 'Delivered', 'Closed') THEN 1 ELSE 0 END) AS activeCases,
          SUM(CASE WHEN ${caseCondition} AND c.estimated_completion_date IS NOT NULL AND c.estimated_completion_date < CURRENT_DATE() AND s.name NOT IN ('Completed', 'Delivered', 'Closed') THEN 1 ELSE 0 END) AS overdueCases,
          SUM(CASE WHEN ${userOrderCondition} THEN 1 ELSE 0 END) AS totalOrders,
          SUM(CASE WHEN ${userOrderCondition} AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) THEN 1 ELSE 0 END) AS newOrders14d
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0
      `,
    ),
    pool.execute(
      `
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS clientUsers,
          SUM(CASE WHEN role IN ('admin', 'assistant') THEN 1 ELSE 0 END) AS teamUsers
        FROM users
      `,
    ),
    pool.execute(
      `
        SELECT
          COUNT(*) AS totalTasks,
          SUM(CASE WHEN t.status <> 'completed' THEN 1 ELSE 0 END) AS openTasks,
          SUM(CASE WHEN t.status IN ('in-progress', 'assigned') THEN 1 ELSE 0 END) AS inProgressTasks,
          SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completedTasks,
          SUM(CASE WHEN t.priority = 'urgent' AND t.status <> 'completed' THEN 1 ELSE 0 END) AS urgentTasks,
          SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE() AND t.status <> 'completed' THEN 1 ELSE 0 END) AS overdueTasks
        FROM case_tasks t
        JOIN cases c ON c.id = t.case_id
        LEFT JOIN users creator ON creator.id = c.created_by
        WHERE c.is_archived = 0
          AND ${caseCondition}
      `,
    ),
    pool.execute(
      `
        SELECT
          COUNT(*) AS totalMessages,
          SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unreadMessages,
          SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) THEN 1 ELSE 0 END) AS newMessages14d
        FROM contact_submissions
      `,
    ),
    pool.execute(
      `SELECT COUNT(*) AS unreadNotifications FROM notifications WHERE user_id = :userId AND read_at IS NULL`,
      { userId },
    ),
    pool.execute(
      `
        SELECT
          s.name AS statusName,
          s.color AS statusColor,
          SUM(CASE WHEN c.id IS NOT NULL AND ${caseCondition} THEN 1 ELSE 0 END) AS total
        FROM case_statuses s
        LEFT JOIN cases c ON c.status_id = s.id
          AND c.is_archived = 0
        LEFT JOIN users creator ON creator.id = c.created_by
        GROUP BY s.id, s.name, s.color, s.sort_order
        ORDER BY s.sort_order ASC, s.name ASC
      `,
    ),
    pool.execute(
      `
        SELECT ds.date, COALESCE(created.total, 0) AS total
        FROM (${fourteenDaySeriesSql}) ds
        LEFT JOIN (
          SELECT DATE(c.created_at) AS date, COUNT(*) AS total
          FROM cases c
          LEFT JOIN users creator ON creator.id = c.created_by
          WHERE c.is_archived = 0
            AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY)
            AND ${caseCondition}
          GROUP BY DATE(c.created_at)
        ) created ON created.date = ds.date
        ORDER BY ds.date ASC
      `,
    ),
    pool.execute(
      `
        SELECT ds.date, COALESCE(created.total, 0) AS total
        FROM (${fourteenDaySeriesSql}) ds
        LEFT JOIN (
          SELECT DATE(c.created_at) AS date, COUNT(*) AS total
          FROM cases c
          LEFT JOIN users creator ON creator.id = c.created_by
          WHERE c.is_archived = 0
            AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY)
            AND ${userOrderCondition}
          GROUP BY DATE(c.created_at)
        ) created ON created.date = ds.date
        ORDER BY ds.date ASC
      `,
    ),
    pool.execute(
      `
        SELECT c.id, c.name, c.estimated_completion_date AS dueDate, c.progress_percentage AS progress,
               s.name AS statusName, target.name AS clientName, leader.name AS projectLeaderName, c.created_at AS createdAt
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN users target ON target.id = c.target_id
        LEFT JOIN users leader ON leader.id = c.project_leader_id
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0 AND ${caseCondition}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT c.id, c.name, c.target_time AS targetTime, c.contact_phone AS contactPhone,
               c.contact_email AS contactEmail, s.name AS statusName,
               creator.name AS userName, creator.email AS userEmail, c.start_date AS submittedDate, c.created_at AS createdAt
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0 AND ${userOrderCondition}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT id, contact_name AS name, contact_email AS email, contact_number AS phone,
               scope_of_work AS subject, status, created_at AS createdAt
        FROM contact_submissions
        ORDER BY created_at DESC, id DESC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT id, name, email, role, is_active AS isActive, created_at AS createdAt
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT c.id, c.name, c.estimated_completion_date AS dueDate, s.name AS statusName,
               target.name AS clientName, leader.name AS projectLeaderName,
               DATEDIFF(CURRENT_DATE(), c.estimated_completion_date) AS daysLate
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN users target ON target.id = c.target_id
        LEFT JOIN users leader ON leader.id = c.project_leader_id
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0
          AND ${caseCondition}
          AND c.estimated_completion_date IS NOT NULL
          AND c.estimated_completion_date < CURRENT_DATE()
          AND s.name NOT IN ('Completed', 'Delivered', 'Closed')
        ORDER BY c.estimated_completion_date ASC, c.id DESC
        LIMIT 5
      `,
    ),
    pool.execute(
      `
        SELECT t.id, t.title, t.priority, t.status, t.due_date AS dueDate,
               c.id AS caseId, c.name AS caseName, assignee.name AS assigneeName,
               DATEDIFF(CURRENT_DATE(), t.due_date) AS daysLate
        FROM case_tasks t
        JOIN cases c ON c.id = t.case_id
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN users assignee ON assignee.id = t.assignee_id
        WHERE c.is_archived = 0
          AND ${caseCondition}
          AND t.status <> 'completed'
          AND (
            t.priority = 'urgent'
            OR (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE())
          )
        ORDER BY t.priority = 'urgent' DESC, t.due_date IS NULL ASC, t.due_date ASC, t.id DESC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT leader.id, leader.name, leader.email, COUNT(c.id) AS activeCases
        FROM cases c
        JOIN users leader ON leader.id = c.project_leader_id
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0
          AND ${caseCondition}
          AND s.name NOT IN ('Completed', 'Delivered', 'Closed')
        GROUP BY leader.id, leader.name, leader.email
        ORDER BY activeCases DESC, leader.name ASC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT assignee.id, assignee.name, assignee.email,
               COUNT(t.id) AS openTasks,
               SUM(CASE WHEN t.priority = 'urgent' THEN 1 ELSE 0 END) AS urgentTasks,
               SUM(CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE() THEN 1 ELSE 0 END) AS overdueTasks
        FROM case_tasks t
        JOIN cases c ON c.id = t.case_id
        LEFT JOIN users creator ON creator.id = c.created_by
        JOIN users assignee ON assignee.id = t.assignee_id
        WHERE c.is_archived = 0
          AND ${caseCondition}
          AND t.status <> 'completed'
        GROUP BY assignee.id, assignee.name, assignee.email
        ORDER BY openTasks DESC, urgentTasks DESC, assignee.name ASC
        LIMIT 6
      `,
    ),
    pool.execute(
      `
        SELECT
          COALESCE(SUM(CASE WHEN ${caseCondition} AND ${closedStatusCondition} THEN COALESCE(c.price, 0) ELSE 0 END), 0) AS caseProfit,
          COALESCE(SUM(CASE WHEN ${userOrderCondition} AND ${closedStatusCondition} THEN COALESCE(c.price, 0) ELSE 0 END), 0) AS orderProfit,
          COALESCE(SUM(CASE WHEN ${closedStatusCondition} AND DATE(c.updated_at) >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01') THEN COALESCE(c.price, 0) ELSE 0 END), 0) AS monthCaseOrderProfit,
          COALESCE(SUM(CASE WHEN NOT (${closedStatusCondition}) THEN COALESCE(c.price, 0) ELSE 0 END), 0) AS openCaseOrderValue,
          (
            SELECT COALESCE(SUM(cps.amount), 0)
            FROM chat_payment_submissions cps
            WHERE cps.status = 'approved'
          ) AS chatProfit,
          (
            SELECT COALESCE(SUM(cps.amount), 0)
            FROM chat_payment_submissions cps
            WHERE cps.status = 'approved'
              AND cps.reviewed_at >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')
          ) AS monthChatProfit,
          (
            SELECT COALESCE(SUM(cps.amount), 0)
            FROM chat_payment_submissions cps
            WHERE cps.status = 'pending'
          ) AS pendingChatValue
        FROM cases c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN case_statuses s ON s.id = c.status_id
        WHERE c.is_archived = 0
      `,
    ),
  ]);

  const summary = summaryRows[0] || {};
  const users = userSummaryRows[0] || {};
  const tasks = taskRows[0] || {};
  const messages = messageRows[0] || {};
  const notifications = notificationRows[0] || {};
  const profit = profitRows[0] || {};
  const caseProfit = normalizeNumber(profit.caseProfit);
  const orderProfit = normalizeNumber(profit.orderProfit);
  const chatProfit = normalizeNumber(profit.chatProfit);
  const monthCaseOrderProfit = normalizeNumber(profit.monthCaseOrderProfit);
  const monthChatProfit = normalizeNumber(profit.monthChatProfit);
  const openCaseOrderValue = normalizeNumber(profit.openCaseOrderValue);
  const pendingChatValue = normalizeNumber(profit.pendingChatValue);

  return {
    generatedAt: new Date().toISOString(),
    range: { days: 14 },
    summary: {
      totalUsers: normalizeNumber(users.totalUsers),
      activeUsers: normalizeNumber(users.activeUsers),
      clientUsers: normalizeNumber(users.clientUsers),
      teamUsers: normalizeNumber(users.teamUsers),
      totalCases: normalizeNumber(summary.totalCases),
      activeCases: normalizeNumber(summary.activeCases),
      newCases14d: normalizeNumber(summary.newCases14d),
      overdueCases: normalizeNumber(summary.overdueCases),
      totalOrders: normalizeNumber(summary.totalOrders),
      newOrders14d: normalizeNumber(summary.newOrders14d),
      totalTasks: normalizeNumber(tasks.totalTasks),
      openTasks: normalizeNumber(tasks.openTasks),
      inProgressTasks: normalizeNumber(tasks.inProgressTasks),
      completedTasks: normalizeNumber(tasks.completedTasks),
      urgentTasks: normalizeNumber(tasks.urgentTasks),
      overdueTasks: normalizeNumber(tasks.overdueTasks),
      totalMessages: normalizeNumber(messages.totalMessages),
      unreadMessages: normalizeNumber(messages.unreadMessages),
      newMessages14d: normalizeNumber(messages.newMessages14d),
      unreadNotifications: normalizeNumber(notifications.unreadNotifications),
      profit: {
        total: caseProfit + orderProfit + chatProfit,
        month: monthCaseOrderProfit + monthChatProfit,
        openValue: openCaseOrderValue + pendingChatValue,
        cases: caseProfit,
        orders: orderProfit,
        chat: chatProfit,
        pendingChat: pendingChatValue,
      },
    },
    charts: {
      casesByStatus: caseStatusRows.map((row) => ({ ...row, total: normalizeNumber(row.total) })),
      casesTrend: caseTrendRows.map((row) => ({ date: row.date, total: normalizeNumber(row.total) })),
      ordersTrend: orderTrendRows.map((row) => ({ date: row.date, total: normalizeNumber(row.total) })),
      workload: {
        leaders: leaderRows.map((row) => ({ ...row, activeCases: normalizeNumber(row.activeCases) })),
        assignees: assigneeRows.map((row) => ({
          ...row,
          openTasks: normalizeNumber(row.openTasks),
          urgentTasks: normalizeNumber(row.urgentTasks),
          overdueTasks: normalizeNumber(row.overdueTasks),
        })),
      },
    },
    lists: {
      recentCases: recentCaseRows,
      recentOrders: recentOrderRows,
      recentMessages: recentMessageRows,
      recentUsers: recentUserRows,
      needsAttention: {
        cases: attentionCaseRows,
        tasks: attentionTaskRows,
      },
    },
  };
};

export const getAnalytics = async () => {
  const [caseRows] = await pool.execute(
    `
      SELECT
        s.name AS statusName,
        SUM(
          CASE
            WHEN c.id IS NOT NULL
              AND NOT (
                c.target_id IS NOT NULL
                AND c.created_by = c.target_id
                AND creator.role = 'user'
              )
            THEN 1
            ELSE 0
          END
        ) AS total
      FROM case_statuses s
      LEFT JOIN cases c ON c.status_id = s.id
        AND c.is_archived = 0
      LEFT JOIN users creator ON creator.id = c.created_by
      GROUP BY s.id, s.name, s.sort_order
      ORDER BY s.sort_order ASC, s.name ASC
    `,
  );

  const [dailyRows] = await pool.execute(
    `
      SELECT DATE(c.created_at) AS date, COUNT(*) AS count
      FROM cases c
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
        AND c.is_archived = 0
        AND NOT (
          c.target_id IS NOT NULL
          AND c.created_by = c.target_id
          AND creator.role = 'user'
        )
      GROUP BY DATE(c.created_at)
      ORDER BY date ASC
    `,
  );

  const [recentMessageRows] = await pool.execute(
    `
      SELECT id, contact_name AS name, contact_email AS email,
             scope_of_work AS subject, status, created_at
      FROM contact_submissions
      ORDER BY created_at DESC
      LIMIT 5
    `,
  );

  return {
    casesByStatus: caseRows,
    dailyCases: dailyRows,
    recentMessages: recentMessageRows,
  };
};
