import { pool } from "../config/db.js";

const userOrderCondition = `
  c.target_id IS NOT NULL
  AND c.created_by = c.target_id
  AND creator.role = 'user'
`;

const caseCondition = `NOT (${userOrderCondition})`;

export const getSheetDashboardSummary = async () => {
  const [[summaryRows], [paymentRows]] = await Promise.all([
    pool.execute(
      `
        SELECT
          SUM(CASE WHEN ${caseCondition} THEN 1 ELSE 0 END) AS totalCases,
          SUM(CASE WHEN ${caseCondition} AND s.name = 'New' THEN 1 ELSE 0 END) AS newCases,
          SUM(CASE WHEN ${caseCondition} AND s.name = 'In Progress' THEN 1 ELSE 0 END) AS inProgressCases,
          SUM(CASE WHEN ${caseCondition} AND s.name = 'Completed' THEN 1 ELSE 0 END) AS completedCases,
          SUM(CASE WHEN ${userOrderCondition} THEN 1 ELSE 0 END) AS totalOrders,
          SUM(CASE WHEN ${userOrderCondition} AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 13 DAY) THEN 1 ELSE 0 END) AS newOrders14d
        FROM cases c
        LEFT JOIN case_statuses s ON s.id = c.status_id
        LEFT JOIN users creator ON creator.id = c.created_by
        WHERE c.is_archived = 0
      `,
    ),
    pool.execute(
      `
        SELECT
          COUNT(*) AS totalPayments,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingPayments,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approvedPayments,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejectedPayments
        FROM chat_payment_submissions
      `,
    ),
  ]);

  return {
    ...(summaryRows[0] || {}),
    ...(paymentRows[0] || {}),
  };
};

export const listDashboardCasesForSheet = async () => {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id AS caseId,
        c.name AS patientName,
        COALESCE(s.name, '') AS status,
        target.name AS clientName,
        leader.name AS projectLeader,
        c.target_time AS targetTime,
        DATE_FORMAT(c.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(c.estimated_completion_date, '%Y-%m-%d') AS dueDate,
        c.progress_percentage AS progress,
        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i') AS updatedAt,
        'dashboard' AS source
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      LEFT JOIN users creator ON creator.id = c.created_by
      LEFT JOIN users target ON target.id = c.target_id
      LEFT JOIN users leader ON leader.id = c.project_leader_id
      WHERE c.is_archived = 0
        AND ${caseCondition}
      ORDER BY c.updated_at DESC, c.id DESC
    `,
  );

  return rows;
};

export const listDashboardOrdersForSheet = async () => {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id AS orderId,
        c.name AS orderName,
        target.name AS userName,
        target.email AS userEmail,
        c.contact_phone AS contactPhone,
        c.contact_email AS contactEmail,
        COALESCE(s.name, '') AS status,
        c.target_time AS targetTime,
        DATE_FORMAT(c.start_date, '%Y-%m-%d') AS submittedDate,
        DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i') AS updatedAt,
        'dashboard' AS source
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      LEFT JOIN users creator ON creator.id = c.created_by
      LEFT JOIN users target ON target.id = c.target_id
      WHERE c.is_archived = 0
        AND ${userOrderCondition}
      ORDER BY c.created_at DESC, c.id DESC
    `,
  );

  return rows;
};

export const listDashboardPaymentsForSheet = async () => {
  const [rows] = await pool.execute(
    `
      SELECT
        cps.id AS paymentId,
        u.name AS userName,
        u.email AS userEmail,
        u.phone AS accountPhone,
        cps.transfer_phone AS transferPhone,
        cps.amount,
        cps.currency,
        cps.status,
        cps.proof_file_name AS proofFileName,
        reviewer.name AS reviewedBy,
        cps.review_note AS reviewNote,
        DATE_FORMAT(cps.reviewed_at, '%Y-%m-%d %H:%i') AS reviewedAt,
        DATE_FORMAT(cps.created_at, '%Y-%m-%d %H:%i') AS submittedAt,
        DATE_FORMAT(cps.updated_at, '%Y-%m-%d %H:%i') AS updatedAt,
        'dashboard' AS source
      FROM chat_payment_submissions cps
      JOIN users u ON u.id = cps.user_id
      LEFT JOIN users reviewer ON reviewer.id = cps.reviewed_by
      ORDER BY FIELD(cps.status, 'pending', 'rejected', 'approved'), cps.created_at DESC, cps.id DESC
    `,
  );

  return rows;
};

export const getSyncableCaseById = async (caseId) => {
  const [rows] = await pool.execute(
    `
      SELECT
        c.id,
        c.name,
        c.status_id AS statusId,
        s.name AS statusName
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      WHERE c.id = :caseId
        AND c.is_archived = 0
      LIMIT 1
    `,
    { caseId },
  );

  return rows[0] || null;
};

export const getCaseStatusByName = async (statusName) => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM case_statuses
      WHERE LOWER(name) = LOWER(:statusName)
      LIMIT 1
    `,
    { statusName },
  );

  return rows[0] || null;
};

export const getDefaultSheetCaseStatus = async () => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM case_statuses
      ORDER BY
        CASE WHEN name = 'New' THEN 0 ELSE 1 END,
        sort_order ASC,
        id ASC
      LIMIT 1
    `,
  );

  return rows[0] || null;
};

export const getSheetCaseCreatorUserId = async () => {
  const [rows] = await pool.execute(
    `
      SELECT id
      FROM users
      WHERE role = 'admin'
      ORDER BY id ASC
      LIMIT 1
    `,
  );

  return rows[0]?.id || null;
};

export const createCaseFromSheet = async ({ patientName, statusId, targetTime, startDate, dueDate, createdBy }) => {
  const [result] = await pool.execute(
    `
      INSERT INTO cases (
        name,
        status_id,
        target_time,
        start_date,
        estimated_completion_date,
        progress_tracking,
        created_by
      )
      VALUES (
        :patientName,
        :statusId,
        :targetTime,
        :startDate,
        :dueDate,
        1,
        :createdBy
      )
    `,
    {
      patientName,
      statusId,
      targetTime: targetTime || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      createdBy: createdBy || null,
    },
  );

  return getSyncableCaseById(result.insertId);
};

export const updateCaseFromSheet = async ({ caseId, patientName, statusId }) => {
  const fields = [];
  const params = { caseId };

  if (patientName !== undefined) {
    fields.push("name = :patientName");
    params.patientName = patientName;
  }

  if (statusId !== undefined) {
    fields.push("status_id = :statusId");
    params.statusId = statusId;
  }

  if (!fields.length) {
    return getSyncableCaseById(caseId);
  }

  await pool.execute(
    `
      UPDATE cases
      SET ${fields.join(", ")}
      WHERE id = :caseId
        AND is_archived = 0
    `,
    params,
  );

  return getSyncableCaseById(caseId);
};
