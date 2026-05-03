import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

const sortMap = {
  name: "c.name",
  status: "s.name",
  target: "target.name",
  dueDate: "c.estimated_completion_date",
  createdAt: "c.created_at",
};

const caseSelect = `
  c.id,
  c.name,
  c.description,
  c.client_description AS clientDescription,
  c.status_id AS statusId,
  CASE
    WHEN s.name = 'Completed' OR s.name IN ('Delivered', 'Closed') OR s.sort_order = 30 THEN 'Completed'
    WHEN s.name = 'In Progress' OR s.name IN (
      'CASE ON HOLD (DR''S REQUEST)',
      'Case Approved / QC & Paperwork',
      'Need New CBCT Scan',
      'Planning',
      'Planning Completed (Need Scheduling)',
      'Pending Doctor Approval',
      'Surgical Guide Design',
      'Guide Printing',
      'Finishing / Preparing for Shipping',
      'QC'
    ) OR s.sort_order = 20 THEN 'In Progress'
    ELSE 'New'
  END AS statusName,
  s.color AS statusColor,
  c.target_id AS targetId,
  target.name AS targetName,
  c.secondary_client_id AS secondaryClientId,
  secondary.name AS secondaryClientName,
  c.project_leader_id AS projectLeaderId,
  leader.name AS projectLeaderName,
  c.start_date AS startDate,
  c.estimated_completion_date AS estimatedCompletionDate,
  c.target_time AS targetTime,
  c.contact_phone AS contactPhone,
  c.contact_email AS contactEmail,
  c.custom_uid AS customUid,
  c.progress_tracking AS progressTracking,
  c.price,
  c.color,
  c.template_id AS templateId,
  c.progress_percentage AS progressPercentage,
  c.is_archived AS isArchived,
  c.created_by AS createdBy,
  creator.name AS createdByName,
  creator.email AS createdByEmail,
  creator.role AS createdByRole,
  c.created_at AS createdAt,
  c.updated_at AS updatedAt,
  COALESCE(task_stats.totalTasks, 0) AS totalTasks,
  COALESCE(task_stats.completedTasks, 0) AS completedTasks
`;

const caseJoins = `
  LEFT JOIN case_statuses s ON s.id = c.status_id
  LEFT JOIN users target ON target.id = c.target_id
  LEFT JOIN users secondary ON secondary.id = c.secondary_client_id
  LEFT JOIN users leader ON leader.id = c.project_leader_id
  LEFT JOIN users creator ON creator.id = c.created_by
  LEFT JOIN (
    SELECT
      case_id,
      COUNT(*) AS totalTasks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedTasks
    FROM case_tasks
    GROUP BY case_id
  ) task_stats ON task_stats.case_id = c.id
`;

const buildCaseFilters = (filters) => {
  const where = ["c.is_archived = :archived"];
  const params = {};
  params.archived = filters.archived ? 1 : 0;

  if (filters.search) {
    where.push("(c.name LIKE :search OR c.custom_uid LIKE :search)");
    params.search = `%${filters.search}%`;
  }

  if (filters.statusId) {
    where.push("c.status_id = :statusId");
    params.statusId = filters.statusId;
  }

  if (filters.statusIds?.length) {
    const statusPlaceholders = filters.statusIds.map((_, index) => `:statusId_${index}`);
    where.push(`c.status_id IN (${statusPlaceholders.join(", ")})`);
    filters.statusIds.forEach((statusId, index) => {
      params[`statusId_${index}`] = statusId;
    });
  }

  if (filters.targetId) {
    where.push("c.target_id = :targetId");
    params.targetId = filters.targetId;
  }

  if (filters.createdBy) {
    where.push("c.created_by = :createdBy");
    params.createdBy = filters.createdBy;
  }

  if (filters.userOrdersOnly) {
    where.push(`
      c.target_id IS NOT NULL
      AND c.created_by = c.target_id
      AND EXISTS (
        SELECT 1
        FROM users order_creator
        WHERE order_creator.id = c.created_by
          AND order_creator.role = 'user'
      )
    `);
  }

  if (filters.excludeUserOrders) {
    where.push(`
      NOT (
        c.target_id IS NOT NULL
        AND c.created_by = c.target_id
        AND EXISTS (
          SELECT 1
          FROM users order_creator
          WHERE order_creator.id = c.created_by
            AND order_creator.role = 'user'
        )
      )
    `);
  }

  if (filters.secondaryClientId) {
    where.push("c.secondary_client_id = :secondaryClientId");
    params.secondaryClientId = filters.secondaryClientId;
  }

  if (filters.projectLeaderId) {
    where.push("c.project_leader_id = :projectLeaderId");
    params.projectLeaderId = filters.projectLeaderId;
  }

  if (filters.teammateId) {
    where.push("EXISTS (SELECT 1 FROM case_team_members ctm WHERE ctm.case_id = c.id AND ctm.user_id = :teammateId)");
    params.teammateId = filters.teammateId;
  }

  if (filters.teamId) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM case_team_members ctm
        JOIN team_memberships tm ON tm.user_id = ctm.user_id
        WHERE ctm.case_id = c.id AND tm.team_id = :teamId
      )
    `);
    params.teamId = filters.teamId;
  }

  if (filters.fromDueDate) {
    where.push("c.estimated_completion_date >= :fromDueDate");
    params.fromDueDate = filters.fromDueDate;
  }

  if (filters.toDueDate) {
    where.push("c.estimated_completion_date <= :toDueDate");
    params.toDueDate = filters.toDueDate;
  }

  if (filters.customUid) {
    where.push("c.custom_uid LIKE :customUid");
    params.customUid = `%${filters.customUid}%`;
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
};

export const listCases = async (filters) => {
  const paging = toLimitOffsetSql(filters);
  const { whereSql, params } = buildCaseFilters(filters);
  const sortColumn = sortMap[filters.sortBy] || sortMap.createdAt;
  const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";

  const [rows] = await pool.execute(
    `
      SELECT ${caseSelect}
      FROM cases c
      ${caseJoins}
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDir}, c.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM cases c ${whereSql}`,
    params,
  );

  return {
    rows,
    meta: {
      page: paging.page,
      perPage: paging.perPage,
      total: Number(countRows[0]?.total || 0),
    },
  };
};

export const getCaseById = async (id) => {
  const [rows] = await pool.execute(
    `
      SELECT ${caseSelect}
      FROM cases c
      ${caseJoins}
      WHERE c.id = :id
      LIMIT 1
    `,
    { id },
  );

  return rows[0] || null;
};

export const createCase = async (data, userId, connection = pool) => {
  const [result] = await connection.execute(
    `
      INSERT INTO cases (
        name, description, client_description, status_id, target_id, secondary_client_id,
        project_leader_id, start_date, estimated_completion_date, target_time,
        contact_phone, contact_email, custom_uid, progress_tracking, price, color, template_id, created_by
      )
      VALUES (
        :name, :description, :clientDescription, :statusId, :targetId, :secondaryClientId,
        :projectLeaderId, :startDate, :estimatedCompletionDate, :targetTime,
        :contactPhone, :contactEmail, :customUid, :progressTracking, :price, :color, :templateId, :createdBy
      )
    `,
    {
      ...data,
      description: data.description || null,
      clientDescription: data.clientDescription || null,
      targetId: data.targetId || null,
      secondaryClientId: data.secondaryClientId || null,
      projectLeaderId: data.projectLeaderId || null,
      startDate: data.startDate || null,
      estimatedCompletionDate: data.estimatedCompletionDate || null,
      targetTime: data.targetTime || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      customUid: data.customUid || null,
      progressTracking: data.progressTracking === false ? 0 : 1,
      price: data.price === "" ? null : data.price ?? null,
      color: data.color || null,
      templateId: data.templateId || null,
      createdBy: userId,
    },
  );

  return result.insertId;
};

export const updateCase = async (id, data, connection = pool) => {
  await connection.execute(
    `
      UPDATE cases
      SET
        name = :name,
        description = :description,
        client_description = :clientDescription,
        status_id = :statusId,
        target_id = :targetId,
        secondary_client_id = :secondaryClientId,
        project_leader_id = :projectLeaderId,
        start_date = :startDate,
        estimated_completion_date = :estimatedCompletionDate,
        target_time = :targetTime,
        custom_uid = :customUid,
        progress_tracking = :progressTracking,
        price = :price,
        color = :color,
        template_id = :templateId
      WHERE id = :id
    `,
    {
      ...data,
      id,
      description: data.description || null,
      clientDescription: data.clientDescription || null,
      targetId: data.targetId || null,
      secondaryClientId: data.secondaryClientId || null,
      projectLeaderId: data.projectLeaderId || null,
      startDate: data.startDate || null,
      estimatedCompletionDate: data.estimatedCompletionDate || null,
      targetTime: data.targetTime || null,
      customUid: data.customUid || null,
      progressTracking: data.progressTracking === false ? 0 : 1,
      price: data.price === "" ? null : data.price ?? null,
      color: data.color || null,
      templateId: data.templateId || null,
    },
  );
};

export const cloneCase = async (id, userId, connection = pool) => {
  const [rows] = await connection.execute(
    `
      SELECT name, description, status_id AS statusId, target_id AS targetId,
        secondary_client_id AS secondaryClientId, project_leader_id AS projectLeaderId,
        start_date AS startDate, estimated_completion_date AS estimatedCompletionDate,
        target_time AS targetTime, custom_uid AS customUid, progress_tracking AS progressTracking,
        price, color, template_id AS templateId
      FROM cases
      WHERE id = :id
      LIMIT 1
    `,
    { id },
  );

  const source = rows[0];
  if (!source) return null;

  const [result] = await connection.execute(
    `
      INSERT INTO cases (
        name, description, status_id, target_id, secondary_client_id,
        project_leader_id, start_date, estimated_completion_date, target_time,
        custom_uid, progress_tracking, price, color, template_id, created_by
      )
      VALUES (
        :name, :description, :statusId, :targetId, :secondaryClientId,
        :projectLeaderId, :startDate, :estimatedCompletionDate, :targetTime,
        :customUid, :progressTracking, :price, :color, :templateId, :createdBy
      )
    `,
    {
      ...source,
      name: `${source.name} (Copy)`,
      customUid: source.customUid ? `${source.customUid}-copy` : null,
      createdBy: userId,
    },
  );

  return result.insertId;
};

export const updateCaseStatus = async (id, statusId) => {
  await pool.execute(
    `UPDATE cases SET status_id = :statusId WHERE id = :id`,
    { id, statusId },
  );
};

export const archiveCase = async (id) => {
  await pool.execute(
    `UPDATE cases SET is_archived = 1 WHERE id = :id`,
    { id },
  );
};

export const refreshCaseProgress = async (caseId, connection = pool) => {
  await connection.execute(
    `
      UPDATE cases c
      LEFT JOIN (
        SELECT
          case_id,
          COUNT(*) AS totalTasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedTasks
        FROM case_tasks
        WHERE case_id = :caseId
        GROUP BY case_id
      ) task_stats ON task_stats.case_id = c.id
      SET c.progress_percentage = CASE
        WHEN COALESCE(task_stats.totalTasks, 0) = 0 THEN 0
        ELSE ROUND((task_stats.completedTasks / task_stats.totalTasks) * 100)
      END
      WHERE c.id = :caseId
    `,
    { caseId },
  );
};

export const countCaseStats = async () => {
  const [rows] = await pool.execute(
    `
      SELECT
        COUNT(*) AS totalCases,
        SUM(CASE WHEN s.name = 'New' THEN 1 ELSE 0 END) AS pendingCases,
        SUM(CASE WHEN s.name <> 'New' THEN 1 ELSE 0 END) AS otherStatusCases
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      LEFT JOIN users creator ON creator.id = c.created_by
      WHERE c.is_archived = 0
        AND NOT (
          c.target_id IS NOT NULL
          AND c.created_by = c.target_id
          AND creator.role = 'user'
        )
    `,
  );

  return rows[0] || { totalCases: 0, pendingCases: 0, otherStatusCases: 0 };
};
