import { pool } from "../config/db.js";
import {
  CASE_STATUS_NAMES,
  CASE_STATUS_PROGRESS_MAP,
  IMPLANT_SYSTEM_OPTIONS,
  SERVICES_NEEDED_OPTIONS,
} from "../constants/workflowOptions.js";

const userOrderCondition = `
  c.target_id IS NOT NULL
  AND c.created_by = c.target_id
  AND creator.role = 'user'
`;

const caseCondition = `NOT (${userOrderCondition})`;

const sheetUserLabelSql = `
  CASE
    WHEN email IS NOT NULL AND email <> '' THEN CONCAT(name, ' <', email, '>')
    ELSE name
  END
`;

export const listSheetSyncOptions = async () => {
  const [[clients], [leaders]] = await Promise.all([
    pool.execute(
      `
        SELECT id, ${sheetUserLabelSql} AS label
        FROM users
        WHERE role = 'user'
          AND is_active = 1
        ORDER BY name ASC, id ASC
      `,
    ),
    pool.execute(
      `
        SELECT id, ${sheetUserLabelSql} AS label
        FROM users
        WHERE role IN ('admin', 'assistant')
          AND is_active = 1
        ORDER BY role ASC, name ASC, id ASC
      `,
    ),
  ]);

  return {
    statuses: CASE_STATUS_NAMES,
    implantSystems: IMPLANT_SYSTEM_OPTIONS,
    servicesNeeded: SERVICES_NEEDED_OPTIONS,
    targetTimes: ["Same day", "24 hours", "48 hours", "72 hours", "1 week"],
    clients: clients.map((row) => row.label).filter(Boolean),
    leaders: leaders.map((row) => row.label).filter(Boolean),
  };
};

const caseStatusDisplaySql = "COALESCE(s.name, '')";
const sheetStatusProgressSql = `CASE s.name
  ${Object.entries(CASE_STATUS_PROGRESS_MAP).map(([name, progress]) => `WHEN '${name.replace(/'/g, "''")}' THEN ${progress}`).join("\n  ")}
  ELSE 0
END`;

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const normalizeSheetCaseRows = (rows) => rows.map((row) => ({
  ...row,
  servicesNeeded: parseJsonArray(row.servicesNeededJson).join(", "),
  servicesNeededJson: undefined,
}));

export const getSheetDashboardSummary = async () => {
  const [[summaryRows], [paymentRows]] = await Promise.all([
    pool.execute(
      `
        SELECT
          SUM(CASE WHEN ${caseCondition} THEN 1 ELSE 0 END) AS totalCases,
          SUM(CASE WHEN ${caseCondition} AND s.name = 'Order Received' THEN 1 ELSE 0 END) AS newCases,
          SUM(CASE WHEN ${caseCondition} AND s.name NOT IN ('Order Received', 'Completed', 'Order Canceled') THEN 1 ELSE 0 END) AS inProgressCases,
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
        ${caseStatusDisplaySql} AS status,
        CASE
          WHEN target.email IS NOT NULL AND target.email <> '' THEN CONCAT(target.name, ' <', target.email, '>')
          ELSE target.name
        END AS clientName,
        CASE
          WHEN leader.email IS NOT NULL AND leader.email <> '' THEN CONCAT(leader.name, ' <', leader.email, '>')
          ELSE leader.name
        END AS projectLeader,
        c.contact_phone AS contactPhone,
        c.contact_email AS contactEmail,
        c.target_time AS targetTime,
        c.implant_system AS implantSystem,
        c.implant_system_other AS implantSystemOther,
        c.services_needed_json AS servicesNeededJson,
        c.services_needed_other AS servicesNeededOther,
        c.description AS staffNotes,
        c.client_description AS clientNotes,
        DATE_FORMAT(c.start_date, '%Y-%m-%d') AS startDate,
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

  return normalizeSheetCaseRows(rows);
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
        c.implant_system AS implantSystem,
        c.implant_system_other AS implantSystemOther,
        c.services_needed_json AS servicesNeededJson,
        c.services_needed_other AS servicesNeededOther,
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

  return normalizeSheetCaseRows(rows);
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
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.id = :caseId
        AND c.is_archived = 0
        AND ${caseCondition}
      LIMIT 1
    `,
    { caseId },
  );

  return rows[0] || null;
};

export const deleteCaseFromSheet = async (caseId) => {
  const [result] = await pool.execute(
    `
      DELETE c
      FROM cases c
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.id = :caseId
        AND c.is_archived = 0
        AND ${caseCondition}
    `,
    { caseId },
  );

  return result.affectedRows > 0;
};

export const getCaseStatusByName = async (statusName) => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM case_statuses
      WHERE LOWER(name) = LOWER(:statusName)
        AND name IN (${CASE_STATUS_NAMES.map((_, index) => `:status_${index}`).join(", ")})
      LIMIT 1
    `,
    {
      statusName,
      ...Object.fromEntries(CASE_STATUS_NAMES.map((status, index) => [`status_${index}`, status])),
    },
  );

  return rows[0] || null;
};

const getEmailFromSheetUserLabel = (label = "") => {
  const match = String(label).match(/<([^<>]+)>/);
  return match ? match[1].trim() : "";
};

export const getSheetUserIdByLabel = async (label, allowedRoles) => {
  const normalizedLabel = String(label || "").trim();
  if (!normalizedLabel) return null;

  const email = getEmailFromSheetUserLabel(normalizedLabel);
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const roleParams = Object.fromEntries(roles.map((role, index) => [`role_${index}`, role]));
  const roleSql = roles.map((_, index) => `:role_${index}`).join(", ");

  const [rows] = await pool.execute(
    `
      SELECT id
      FROM users
      WHERE role IN (${roleSql})
        AND is_active = 1
        AND (
          (:email <> '' AND email = :email)
          OR ${sheetUserLabelSql} = :label
          OR name = :label
        )
      ORDER BY
        CASE WHEN :email <> '' AND email = :email THEN 0 ELSE 1 END,
        id ASC
      LIMIT 1
    `,
    { ...roleParams, email, label: normalizedLabel },
  );

  return rows[0]?.id || null;
};

export const getDefaultSheetCaseStatus = async () => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM case_statuses
      WHERE name = 'Order Received'
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

export const createCaseFromSheet = async ({
  patientName,
  statusId,
  clientId,
  projectLeaderId,
  contactPhone,
  contactEmail,
  targetTime,
  implantSystem,
  implantSystemOther,
  servicesNeeded,
  servicesNeededOther,
  staffNotes,
  clientNotes,
  startDate,
  dueDate,
  createdBy,
}) => {
  const [result] = await pool.execute(
    `
      INSERT INTO cases (
        name,
        status_id,
        target_id,
        project_leader_id,
        contact_phone,
        contact_email,
        target_time,
        implant_system,
        implant_system_other,
        services_needed_json,
        services_needed_other,
        description,
        client_description,
        start_date,
        estimated_completion_date,
        progress_tracking,
        progress_percentage,
        created_by
      )
      VALUES (
        :patientName,
        :statusId,
        :clientId,
        :projectLeaderId,
        :contactPhone,
        :contactEmail,
        :targetTime,
        :implantSystem,
        :implantSystemOther,
        :servicesNeededJson,
        :servicesNeededOther,
        :staffNotes,
        :clientNotes,
        :startDate,
        :dueDate,
        1,
        (SELECT ${sheetStatusProgressSql} FROM case_statuses s WHERE s.id = :statusId LIMIT 1),
        :createdBy
      )
    `,
    {
      patientName,
      statusId,
      clientId: clientId || null,
      projectLeaderId: projectLeaderId || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      targetTime: targetTime || null,
      implantSystem: implantSystem || null,
      implantSystemOther: implantSystem === "Other" ? implantSystemOther || null : null,
      servicesNeededJson: JSON.stringify(servicesNeeded || []),
      servicesNeededOther: (servicesNeeded || []).includes("Other") ? servicesNeededOther || null : null,
      staffNotes: staffNotes || null,
      clientNotes: clientNotes || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      createdBy: createdBy || null,
    },
  );

  return getSyncableCaseById(result.insertId);
};

export const updateCaseFromSheet = async ({
  caseId,
  patientName,
  statusId,
  clientId,
  projectLeaderId,
  contactPhone,
  contactEmail,
  targetTime,
  implantSystem,
  implantSystemOther,
  servicesNeeded,
  servicesNeededOther,
  staffNotes,
  clientNotes,
  startDate,
  dueDate,
}) => {
  const fields = [];
  const params = { caseId };

  if (patientName !== undefined) {
    fields.push("name = :patientName");
    params.patientName = patientName;
  }

  if (statusId !== undefined) {
    fields.push("status_id = :statusId");
    fields.push(`progress_percentage = (SELECT ${sheetStatusProgressSql} FROM case_statuses s WHERE s.id = :statusId LIMIT 1)`);
    params.statusId = statusId;
  }

  if (clientId !== undefined) {
    fields.push("target_id = :clientId");
    params.clientId = clientId || null;
  }

  if (projectLeaderId !== undefined) {
    fields.push("project_leader_id = :projectLeaderId");
    params.projectLeaderId = projectLeaderId || null;
  }

  if (contactPhone !== undefined) {
    fields.push("contact_phone = :contactPhone");
    params.contactPhone = contactPhone || null;
  }

  if (contactEmail !== undefined) {
    fields.push("contact_email = :contactEmail");
    params.contactEmail = contactEmail || null;
  }

  if (targetTime !== undefined) {
    fields.push("target_time = :targetTime");
    params.targetTime = targetTime || null;
  }

  if (implantSystem !== undefined) {
    fields.push("implant_system = :implantSystem");
    fields.push("implant_system_other = :implantSystemOther");
    params.implantSystem = implantSystem || null;
    params.implantSystemOther = implantSystem === "Other" ? implantSystemOther || null : null;
  }

  if (servicesNeeded !== undefined) {
    fields.push("services_needed_json = :servicesNeededJson");
    fields.push("services_needed_other = :servicesNeededOther");
    params.servicesNeededJson = JSON.stringify(servicesNeeded || []);
    params.servicesNeededOther = (servicesNeeded || []).includes("Other") ? servicesNeededOther || null : null;
  }

  if (staffNotes !== undefined) {
    fields.push("description = :staffNotes");
    params.staffNotes = staffNotes || null;
  }

  if (clientNotes !== undefined) {
    fields.push("client_description = :clientNotes");
    params.clientNotes = clientNotes || null;
  }

  if (startDate !== undefined) {
    fields.push("start_date = :startDate");
    params.startDate = startDate || null;
  }

  if (dueDate !== undefined) {
    fields.push("estimated_completion_date = :dueDate");
    params.dueDate = dueDate || null;
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
