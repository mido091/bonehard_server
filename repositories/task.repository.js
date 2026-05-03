import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

const taskSelect = `
  t.id,
  t.case_id AS caseId,
  t.title,
  t.description,
  t.priority,
  t.status,
  t.private_task AS privateTask,
  t.estimated_minutes AS estimatedMinutes,
  t.time_spent_minutes AS timeSpentMinutes,
  t.task_type AS taskType,
  t.start_date AS startDate,
  t.tags_json AS tagsJson,
  t.recurring_json AS recurringJson,
  t.completed_at AS completedAt,
  t.assignee_id AS assigneeId,
  assignee.name AS assigneeName,
  t.due_date AS dueDate,
  t.phase_id AS phaseId,
  p.name AS phaseName,
  t.sort_order AS sortOrder,
  t.created_at AS createdAt,
  t.updated_at AS updatedAt
`;

const normalizeTaskRows = (rows) => rows.map((row) => ({
  ...row,
  tags: row.tagsJson ? (typeof row.tagsJson === "string" ? JSON.parse(row.tagsJson) : row.tagsJson) : [],
  recurring: row.recurringJson ? (typeof row.recurringJson === "string" ? JSON.parse(row.recurringJson) : row.recurringJson) : null,
}));

export const listTasksByCase = async (caseId, filters = {}) => {
  const paging = toLimitOffsetSql(filters);
  const where = ["t.case_id = :caseId"];
  const params = { caseId };

  if (filters.search) {
    where.push("(t.title LIKE :search OR t.description LIKE :search)");
    params.search = `%${filters.search}%`;
  }

  if (filters.taskId) {
    where.push("t.id = :taskId");
    params.taskId = filters.taskId;
  }

  if (filters.status) {
    where.push("t.status = :status");
    params.status = filters.status;
  }

  if (filters.priority) {
    where.push("t.priority = :priority");
    params.priority = filters.priority;
  }

  if (filters.assigneeId) {
    where.push("t.assignee_id = :assigneeId");
    params.assigneeId = filters.assigneeId;
  }

  if (filters.phaseId) {
    where.push("t.phase_id = :phaseId");
    params.phaseId = filters.phaseId;
  }

  if (filters.taskType) {
    where.push("t.task_type = :taskType");
    params.taskType = filters.taskType;
  }

  if (filters.tag) {
    where.push("JSON_CONTAINS(t.tags_json, :tagJson)");
    params.tagJson = JSON.stringify(filters.tag);
  }

  if (filters.dueFrom) {
    where.push("t.due_date >= :dueFrom");
    params.dueFrom = filters.dueFrom;
  }

  if (filters.dueTo) {
    where.push("t.due_date <= :dueTo");
    params.dueTo = filters.dueTo;
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [rows] = await pool.execute(
    `
      SELECT ${taskSelect}
      FROM case_tasks t
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN case_phases p ON p.id = t.phase_id
      ${whereSql}
      ORDER BY t.sort_order ASC, t.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_tasks t ${whereSql}`,
    params,
  );

  return {
    rows: normalizeTaskRows(rows),
    meta: {
      page: paging.page,
      perPage: paging.perPage,
      total: Number(countRows[0]?.total || 0),
    },
  };
};

export const listTasksGlobal = async (filters = {}, scope = "all", userId = null) => {
  const paging = toLimitOffsetSql(filters);
  const where = [];
  const params = {};

  if (scope === "mine" && userId) {
    where.push("t.assignee_id = :userId");
    params.userId = userId;
  }

  if (filters.search) {
    where.push("(t.title LIKE :search OR t.description LIKE :search OR c.name LIKE :search)");
    params.search = `%${filters.search}%`;
  }

  if (filters.taskId) {
    where.push("t.id = :taskId");
    params.taskId = filters.taskId;
  }

  if (filters.status) {
    where.push("t.status = :status");
    params.status = filters.status;
  }

  if (filters.priority) {
    where.push("t.priority = :priority");
    params.priority = filters.priority;
  }

  if (filters.assigneeId) {
    where.push("t.assignee_id = :assigneeId");
    params.assigneeId = filters.assigneeId;
  }

  if (filters.phaseId) {
    where.push("t.phase_id = :phaseId");
    params.phaseId = filters.phaseId;
  }

  if (filters.taskType) {
    where.push("t.task_type = :taskType");
    params.taskType = filters.taskType;
  }

  if (filters.clientId) {
    where.push("(c.target_id = :clientId OR c.secondary_client_id = :clientId)");
    params.clientId = filters.clientId;
  }

  if (filters.tag) {
    where.push("JSON_CONTAINS(t.tags_json, :tagJson)");
    params.tagJson = JSON.stringify(filters.tag);
  }

  if (filters.dueFrom) {
    where.push("t.due_date >= :dueFrom");
    params.dueFrom = filters.dueFrom;
  }

  if (filters.dueTo) {
    where.push("t.due_date <= :dueTo");
    params.dueTo = filters.dueTo;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
      SELECT ${taskSelect}, c.name AS caseName
      FROM case_tasks t
      JOIN cases c ON c.id = t.case_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN case_phases p ON p.id = t.phase_id
      ${whereSql}
      ORDER BY t.due_date IS NULL ASC, t.due_date ASC, t.sort_order ASC, t.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_tasks t JOIN cases c ON c.id = t.case_id ${whereSql}`,
    params,
  );

  return {
    rows: normalizeTaskRows(rows),
    meta: {
      page: paging.page,
      perPage: paging.perPage,
      total: Number(countRows[0]?.total || 0),
    },
  };
};

export const createTask = async (caseId, data, connection = pool) => {
  const [result] = await connection.execute(
    `
      INSERT INTO case_tasks (
        case_id, title, description, priority, status, private_task,
        estimated_minutes, time_spent_minutes, task_type, start_date,
        tags_json, recurring_json, assignee_id, due_date, phase_id
      )
      VALUES (
        :caseId, :title, :description, :priority, :status, :privateTask,
        :estimatedMinutes, :timeSpentMinutes, :taskType, :startDate,
        :tagsJson, :recurringJson, :assigneeId, :dueDate, :phaseId
      )
    `,
    {
      ...data,
      caseId,
      description: data.description || null,
      privateTask: data.privateTask ? 1 : 0,
      estimatedMinutes: data.estimatedMinutes === "" ? null : data.estimatedMinutes ?? null,
      timeSpentMinutes: data.timeSpentMinutes === "" ? 0 : data.timeSpentMinutes ?? 0,
      taskType: data.taskType || "to-do",
      startDate: data.startDate || null,
      tagsJson: JSON.stringify(data.tags || []),
      recurringJson: data.recurring ? JSON.stringify(data.recurring) : null,
      assigneeId: data.assigneeId || null,
      dueDate: data.dueDate || null,
      phaseId: data.phaseId || null,
    },
  );

  return result.insertId;
};

export const updateTask = async (caseId, taskId, data, connection = pool) => {
  const fields = [];
  const params = { caseId, taskId };

  if (data.title !== undefined) { fields.push("title = :title"); params.title = data.title; }
  if (data.description !== undefined) { fields.push("description = :description"); params.description = data.description; }
  if (data.priority !== undefined) { fields.push("priority = :priority"); params.priority = data.priority; }
  if (data.status !== undefined) { fields.push("status = :status"); params.status = data.status; }
  if (data.privateTask !== undefined) { fields.push("private_task = :privateTask"); params.privateTask = data.privateTask ? 1 : 0; }
  if (data.estimatedMinutes !== undefined) { fields.push("estimated_minutes = :estimatedMinutes"); params.estimatedMinutes = data.estimatedMinutes === "" ? null : data.estimatedMinutes; }
  if (data.timeSpentMinutes !== undefined) { fields.push("time_spent_minutes = :timeSpentMinutes"); params.timeSpentMinutes = data.timeSpentMinutes === "" ? 0 : data.timeSpentMinutes; }
  if (data.taskType !== undefined) { fields.push("task_type = :taskType"); params.taskType = data.taskType; }
  if (data.startDate !== undefined) { fields.push("start_date = :startDate"); params.startDate = data.startDate || null; }
  if (data.tags !== undefined) { fields.push("tags_json = :tagsJson"); params.tagsJson = JSON.stringify(data.tags || []); }
  if (data.recurring !== undefined) { fields.push("recurring_json = :recurringJson"); params.recurringJson = data.recurring ? JSON.stringify(data.recurring) : null; }
  if (data.status === "completed") { fields.push("completed_at = COALESCE(completed_at, NOW())"); }
  if (data.status && data.status !== "completed") { fields.push("completed_at = NULL"); }
  if (data.assigneeId !== undefined) { fields.push("assignee_id = :assigneeId"); params.assigneeId = data.assigneeId; }
  if (data.dueDate !== undefined) { fields.push("due_date = :dueDate"); params.dueDate = data.dueDate; }
  if (data.phaseId !== undefined) { fields.push("phase_id = :phaseId"); params.phaseId = data.phaseId; }

  if (!fields.length) return;

  await connection.execute(
    `UPDATE case_tasks SET ${fields.join(", ")} WHERE id = :taskId AND case_id = :caseId`,
    params,
  );
};

export const replaceTaskWatchers = async (taskId, watcherIds = [], connection = pool) => {
  await connection.execute(`DELETE FROM case_task_watchers WHERE task_id = :taskId`, { taskId });
  for (const userId of watcherIds) {
    await connection.execute(
      `INSERT INTO case_task_watchers (task_id, user_id) VALUES (:taskId, :userId)`,
      { taskId, userId },
    );
  }
};

export const deleteTask = async (caseId, taskId, connection = pool) => {
  await connection.execute(
    `DELETE FROM case_tasks WHERE id = :taskId AND case_id = :caseId`,
    { caseId, taskId },
  );
};
