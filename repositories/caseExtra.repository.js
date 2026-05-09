import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";
import { cleanUploadDisplayName } from "../utils/fileValidation.js";

export const listCaseNotes = async (caseId, query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT n.id, n.subject, n.content, n.created_by AS createdBy, u.name AS createdByName,
        n.created_at AS createdAt, n.updated_at AS updatedAt
      FROM case_notes n
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.case_id = :caseId
      ORDER BY n.created_at DESC, n.id DESC
      ${paging.sql}
    `,
    { caseId },
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_notes WHERE case_id = :caseId`,
    { caseId },
  );

  return {
    rows: rows.map((row) => ({ ...row, fileName: cleanUploadDisplayName(row.fileName) })),
    meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) },
  };
};

export const createCaseNote = async (caseId, payload, userId) => {
  await pool.execute(
    `
      INSERT INTO case_notes (case_id, subject, content, created_by)
      VALUES (:caseId, :subject, :content, :userId)
    `,
    { caseId, subject: payload.subject, content: payload.content || null, userId },
  );
};

/**
 * List general notes for a case.
 * @param {boolean} [options.publicOnly] - If true, only return non-private notes (for user-facing views).
 */
export const listCaseGeneralNotes = async (caseId, query, options = {}) => {
  const paging = toLimitOffsetSql(query);
  const where = ["n.case_id = :caseId"];
  const params = { caseId };

  // Public-only filter: hide private notes from user-facing views
  if (options.publicOnly) {
    where.push("n.is_private = 0");
  }

  const [rows] = await pool.execute(
    `
      SELECT n.id, n.title, n.content, n.is_private AS isPrivate,
        n.created_by AS createdBy, u.name AS createdByName,
        u.email AS createdByEmail, u.role AS createdByRole,
        ub.name AS updatedByName,
        n.created_at AS createdAt, n.updated_at AS updatedAt
      FROM case_general_notes n
      LEFT JOIN users u ON u.id = n.created_by
      LEFT JOIN users ub ON ub.id = n.updated_by
      WHERE ${where.join(" AND ")}
      ORDER BY n.updated_at DESC, n.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_general_notes n WHERE ${where.join(" AND ")}`,
    params,
  );

  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

/** Fetch a single general note by ID (for ownership/update checks). */
export const getCaseGeneralNoteById = async (caseId, noteId) => {
  const [rows] = await pool.execute(
    `SELECT id, case_id AS caseId, title, content, is_private AS isPrivate,
       created_by AS createdBy, updated_by AS updatedBy,
       created_at AS createdAt, updated_at AS updatedAt
     FROM case_general_notes
     WHERE id = :noteId AND case_id = :caseId
     LIMIT 1`,
    { caseId, noteId },
  );
  return rows[0] || null;
};

export const createCaseGeneralNote = async (caseId, payload, userId) => {
  const [result] = await pool.execute(
    `
      INSERT INTO case_general_notes (case_id, title, content, is_private, created_by)
      VALUES (:caseId, :title, :content, :isPrivate, :userId)
    `,
    {
      caseId,
      title: payload.title,
      content: payload.content || null,
      isPrivate: payload.isPrivate ? 1 : 0,
      userId,
    },
  );
  return getCaseGeneralNoteById(caseId, result.insertId);
};

/** Update note content / visibility. */
export const updateCaseGeneralNote = async (caseId, noteId, payload, userId) => {
  await pool.execute(
    `
      UPDATE case_general_notes
      SET title = :title, content = :content, is_private = :isPrivate,
          updated_by = :userId, updated_at = CURRENT_TIMESTAMP
      WHERE id = :noteId AND case_id = :caseId
    `,
    {
      caseId,
      noteId,
      title: payload.title,
      content: payload.content || null,
      isPrivate: payload.isPrivate ? 1 : 0,
      userId,
    },
  );
  return getCaseGeneralNoteById(caseId, noteId);
};

/** Hard-delete a general note. */
export const deleteCaseGeneralNote = async (caseId, noteId) => {
  const [result] = await pool.execute(
    `DELETE FROM case_general_notes WHERE id = :noteId AND case_id = :caseId`,
    { caseId, noteId },
  );
  return result.affectedRows > 0;
};

export const listCaseTimers = async (caseId, query) => {
  const paging = toLimitOffsetSql(query);
  const where = ["t.case_id = :caseId"];
  const params = { caseId };

  if (query.status) {
    where.push("t.status = :status");
    params.status = query.status;
  }

  if (query.type) {
    where.push("t.timer_type = :type");
    params.type = query.type;
  }

  if (query.clientId) {
    where.push("t.client_id = :clientId");
    params.clientId = query.clientId;
  }

  if (query.dateFrom) {
    where.push("COALESCE(t.work_date, DATE(t.started_at)) >= :dateFrom");
    params.dateFrom = query.dateFrom;
  }

  if (query.dateTo) {
    where.push("COALESCE(t.work_date, DATE(t.started_at)) <= :dateTo");
    params.dateTo = query.dateTo;
  }

  if (query.search) {
    where.push("(t.title LIKE :search OR t.note LIKE :search)");
    params.search = `%${query.search}%`;
  }

  const [rows] = await pool.execute(
    `
      SELECT t.id, t.title, t.task_id AS taskId, t.status, t.timer_type AS timerType,
        t.started_at AS startedAt, t.ended_at AS endedAt, t.work_date AS workDate,
        t.duration_seconds AS durationSeconds, t.hourly_rate AS hourlyRate,
        t.total_amount AS totalAmount, t.client_id AS clientId, client.name AS clientName,
        t.completed_at AS completedAt, t.is_invoiced AS isInvoiced,
        t.note, t.user_id AS userId, u.name AS userName
      FROM case_timers t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users client ON client.id = t.client_id
      WHERE ${where.join(" AND ")}
      ORDER BY t.started_at DESC, t.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_timers t WHERE ${where.join(" AND ")}`,
    params,
  );

  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const createCaseTimer = async (caseId, payload, userId) => {
  const durationSeconds = payload.durationSeconds || 0;
  const hourlyRate = payload.hourlyRate === "" ? null : payload.hourlyRate ?? null;
  const totalAmount = payload.totalAmount === "" || payload.totalAmount == null
    ? (hourlyRate == null ? null : Number(((durationSeconds / 3600) * Number(hourlyRate)).toFixed(2)))
    : payload.totalAmount;

  await pool.execute(
    `
      INSERT INTO case_timers (
        case_id, user_id, task_id, title, status, timer_type, started_at, ended_at,
        work_date, duration_seconds, hourly_rate, total_amount, client_id, is_invoiced, note
      )
      VALUES (
        :caseId, :userId, :taskId, :title, :status, :timerType, :startedAt, :endedAt,
        :workDate, :durationSeconds, :hourlyRate, :totalAmount, :clientId, :isInvoiced, :note
      )
    `,
    {
      caseId,
      userId,
      taskId: payload.taskId || null,
      title: payload.title,
      status: payload.status || "stopped",
      timerType: payload.timerType || "counting",
      startedAt: payload.startedAt ? new Date(payload.startedAt) : new Date(),
      endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
      workDate: payload.workDate || null,
      durationSeconds,
      hourlyRate,
      totalAmount,
      clientId: payload.clientId || null,
      isInvoiced: payload.isInvoiced ? 1 : 0,
      note: payload.note || null,
    },
  );
};

export const listCaseFiles = async (caseId, query) => {
  const paging = toLimitOffsetSql(query);
  const where = ["f.case_id = :caseId"];
  const params = { caseId };

  if (query.folderType) {
    where.push("f.folder_type = :folderType");
    params.folderType = query.folderType;
  }

  if (query.search) {
    where.push("(f.file_name LIKE :search OR f.mime_type LIKE :search)");
    params.search = `%${query.search}%`;
  }

  const [rows] = await pool.execute(
    `
      SELECT f.id, f.folder_type AS folderType, f.file_name AS fileName, f.file_url AS fileUrl, f.mime_type AS mimeType,
        f.file_size AS fileSize, f.storage_provider AS storageProvider, f.uploaded_by AS uploadedBy,
        f.cloudinary_public_id AS cloudinaryPublicId, f.cloudinary_resource_type AS cloudinaryResourceType,
        f.cloudinary_secure_url AS cloudinarySecureUrl, f.cloudinary_version AS cloudinaryVersion,
        u.name AS uploadedByName, f.created_at AS createdAt, COALESCE(f.updated_at, f.created_at) AS updatedAt
      FROM case_files f
      LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE ${where.join(" AND ")}
      ORDER BY f.created_at DESC, f.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM case_files f WHERE ${where.join(" AND ")}`,
    params,
  );

  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const createCaseFile = async (caseId, payload, userId, connection = pool) => {
  const fileUrl = payload.fileUrl || payload.cloudinarySecureUrl || null;

  if (!payload.fileName || !fileUrl) {
    throw new Error("Case file records require a file name and storage URL");
  }

  const [result] = await connection.execute(
    `
      INSERT INTO case_files (
        case_id, uploaded_by, folder_type, file_name, file_url, mime_type, file_size, storage_provider,
        cloudinary_public_id, cloudinary_resource_type, cloudinary_secure_url, cloudinary_version
      )
      VALUES (
        :caseId, :userId, :folderType, :fileName, :fileUrl, :mimeType, :fileSize, :storageProvider,
        :cloudinaryPublicId, :cloudinaryResourceType, :cloudinarySecureUrl, :cloudinaryVersion
      )
    `,
    {
      caseId,
      userId: userId || null,
      folderType: payload.folderType || "private",
      fileName: cleanUploadDisplayName(payload.fileName),
      fileUrl,
      mimeType: payload.mimeType || null,
      fileSize: payload.fileSize || 0,
      storageProvider: payload.storageProvider || "external",
      cloudinaryPublicId: payload.cloudinaryPublicId || null,
      cloudinaryResourceType: payload.cloudinaryResourceType || null,
      cloudinarySecureUrl: payload.cloudinarySecureUrl || null,
      cloudinaryVersion: payload.cloudinaryVersion || null,
    },
  );

  return result.insertId;
};

export const getCaseFileById = async (caseId, fileId) => {
  const [rows] = await pool.execute(
    `
      SELECT id, case_id AS caseId, folder_type AS folderType, file_name AS fileName,
        file_url AS fileUrl, mime_type AS mimeType, file_size AS fileSize,
        storage_provider AS storageProvider, uploaded_by AS uploadedBy,
        cloudinary_public_id AS cloudinaryPublicId, cloudinary_resource_type AS cloudinaryResourceType,
        cloudinary_secure_url AS cloudinarySecureUrl, cloudinary_version AS cloudinaryVersion,
        created_at AS createdAt, COALESCE(updated_at, created_at) AS updatedAt
      FROM case_files
      WHERE id = :fileId AND case_id = :caseId
      LIMIT 1
    `,
    { caseId, fileId },
  );

  const file = rows[0] || null;
  return file ? { ...file, fileName: cleanUploadDisplayName(file.fileName) } : null;
};

export const deleteCaseFile = async (caseId, fileId) => {
  await pool.execute(
    `DELETE FROM case_files WHERE id = :fileId AND case_id = :caseId`,
    { caseId, fileId }
  );
};

export const updateCaseFileName = async (caseId, fileId, fileName) => {
  const cleanName = cleanUploadDisplayName(fileName);
  if (!cleanName || cleanName.length < 2) {
    throw new Error("File name must be at least 2 characters");
  }

  await pool.execute(
    `
      UPDATE case_files
      SET file_name = :fileName, updated_at = CURRENT_TIMESTAMP
      WHERE id = :fileId AND case_id = :caseId
    `,
    { caseId, fileId, fileName: cleanName },
  );

  return getCaseFileById(caseId, fileId);
};

export const listOrders = async (query) => {
  const paging = toLimitOffsetSql(query);
  const where = [];
  const params = {};

  if (query.status) {
    where.push("o.status = :status");
    params.status = query.status;
  }

  where.push("COALESCE(o.is_archived, 0) = :archived");
  params.archived = query.archived ? 1 : 0;

  if (query.search) {
    where.push("(o.patient_name LIKE :search OR o.title LIKE :search OR o.custom_uid LIKE :search OR o.integration_uid LIKE :search OR c.name LIKE :search OR target.name LIKE :search OR u.name LIKE :search)");
    params.search = `%${query.search}%`;
  }

  if (query.targetId) {
    where.push("o.target_id = :targetId");
    params.targetId = query.targetId;
  }

  if (query.price !== undefined && query.price !== "" && query.price !== null) {
    where.push("COALESCE(o.price, o.amount) = :price");
    params.price = query.price;
  }

  if (query.customUid) {
    where.push("o.custom_uid LIKE :customUid");
    params.customUid = `%${query.customUid}%`;
  }

  if (query.createdFrom) {
    where.push("DATE(o.created_at) >= :createdFrom");
    params.createdFrom = query.createdFrom;
  }

  if (query.createdTo) {
    where.push("DATE(o.created_at) <= :createdTo");
    params.createdTo = query.createdTo;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `
      SELECT o.id, o.case_id AS caseId, c.name AS caseName, o.user_id AS userId, u.name AS userName,
        o.patient_name AS patientName, o.target_id AS targetId, target.name AS targetName,
        o.title, o.status, o.amount, o.price, o.currency, o.custom_uid AS customUid,
        o.integration_uid AS integrationUid, o.order_notes AS orderNotes,
        o.surgery_date AS surgeryDate, o.dob, o.jaw_selection AS jawSelection,
        o.guide_support_type AS guideSupportType, o.impression_type AS impressionType,
        o.implant_type AS implantType, o.number_of_implants AS numberOfImplants,
        o.due_date AS dueDate, o.is_archived AS isArchived, o.created_at AS createdAt
      FROM case_orders o
      LEFT JOIN cases c ON c.id = o.case_id
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN users target ON target.id = o.target_id
      ${whereSql}
      ORDER BY o.created_at DESC, o.id DESC
      ${paging.sql}
    `,
    params,
  );
  const [countRows] = await pool.execute(`
    SELECT COUNT(*) AS total
    FROM case_orders o
    LEFT JOIN cases c ON c.id = o.case_id
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN users target ON target.id = o.target_id
    ${whereSql}
  `, params);
  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const createOrder = async (payload) => {
  const patientName = payload.patientName || payload.title;
  const price = payload.price === "" ? null : payload.price ?? payload.amount ?? null;
  const title = payload.title || patientName;

  await pool.execute(
    `
      INSERT INTO case_orders (
        case_id, user_id, patient_name, target_id, title, status, amount, price,
        currency, custom_uid, integration_uid, order_notes, surgery_date, dob,
        jaw_selection, guide_support_type, impression_type, implant_type,
        number_of_implants, due_date
      )
      VALUES (
        :caseId, :userId, :patientName, :targetId, :title, :status, :amount, :price,
        :currency, :customUid, :integrationUid, :orderNotes, :surgeryDate, :dob,
        :jawSelection, :guideSupportType, :impressionType, :implantType,
        :numberOfImplants, :dueDate
      )
    `,
    {
      caseId: payload.caseId || null,
      userId: payload.userId || null,
      patientName,
      targetId: payload.targetId || null,
      title,
      status: payload.status || "open",
      amount: payload.amount ?? price,
      price,
      currency: payload.currency || "USD",
      customUid: payload.customUid || null,
      integrationUid: payload.integrationUid || null,
      orderNotes: payload.orderNotes || null,
      surgeryDate: payload.surgeryDate || null,
      dob: payload.dob || null,
      jawSelection: payload.jawSelection || null,
      guideSupportType: payload.guideSupportType || null,
      impressionType: payload.impressionType || null,
      implantType: payload.implantType || null,
      numberOfImplants: payload.numberOfImplants === "" ? null : payload.numberOfImplants ?? null,
      dueDate: payload.dueDate || null,
    },
  );
};

export const updateOrder = async (id, payload) => {
  const patientName = payload.patientName || payload.title;
  const price = payload.price === "" ? null : payload.price ?? payload.amount ?? null;
  const title = payload.title || patientName;

  await pool.execute(
    `
      UPDATE case_orders
      SET
        case_id = :caseId,
        user_id = :userId,
        patient_name = :patientName,
        target_id = :targetId,
        title = :title,
        status = :status,
        amount = :amount,
        price = :price,
        currency = :currency,
        custom_uid = :customUid,
        integration_uid = :integrationUid,
        order_notes = :orderNotes,
        surgery_date = :surgeryDate,
        dob = :dob,
        jaw_selection = :jawSelection,
        guide_support_type = :guideSupportType,
        impression_type = :impressionType,
        implant_type = :implantType,
        number_of_implants = :numberOfImplants,
        due_date = :dueDate
      WHERE id = :id
    `,
    {
      id,
      caseId: payload.caseId || null,
      userId: payload.userId || null,
      patientName,
      targetId: payload.targetId || null,
      title,
      status: payload.status || "open",
      amount: payload.amount ?? price,
      price,
      currency: payload.currency || "USD",
      customUid: payload.customUid || null,
      integrationUid: payload.integrationUid || null,
      orderNotes: payload.orderNotes || null,
      surgeryDate: payload.surgeryDate || null,
      dob: payload.dob || null,
      jawSelection: payload.jawSelection || null,
      guideSupportType: payload.guideSupportType || null,
      impressionType: payload.impressionType || null,
      implantType: payload.implantType || null,
      numberOfImplants: payload.numberOfImplants === "" ? null : payload.numberOfImplants ?? null,
      dueDate: payload.dueDate || null,
    },
  );
};

export const archiveOrder = async (id) => {
  await pool.execute(
    `UPDATE case_orders SET is_archived = 1 WHERE id = :id`,
    { id },
  );
};

/**
 * Fetch a single case_order by ID (used when converting an order to a case).
 */
export const getOrderById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT o.*, target.name AS targetName
     FROM case_orders o
     LEFT JOIN users target ON target.id = o.target_id
     WHERE o.id = :id LIMIT 1`,
    { id },
  );
  return row || null;
};

/**
 * Mark a case_order as converted and link it to the new case.
 */
export const markOrderConverted = async (orderId, caseId) => {
  await pool.execute(
    `UPDATE case_orders SET status = 'converted', converted_case_id = :caseId WHERE id = :orderId`,
    { orderId, caseId },
  );
};



export const listTemplates = async (query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT t.id, t.name, t.description, t.is_active AS isActive, t.created_by AS createdBy,
        t.created_at AS createdAt, t.updated_at AS updatedAt,
        COUNT(ct.id) AS taskCount,
        SUM(CASE WHEN ct.phase_name IS NOT NULL AND ct.phase_name <> '' THEN 1 ELSE 0 END) AS phaseCount
      FROM case_templates t
      LEFT JOIN case_template_tasks ct ON ct.template_id = t.id
      GROUP BY t.id
      ORDER BY t.is_active DESC, t.name ASC
      ${paging.sql}
    `,
    {},
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM case_templates`);
  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const createTemplate = async (payload, userId) => {
  const [result] = await pool.execute(
    `
      INSERT INTO case_templates (name, description, is_active, created_by)
      VALUES (:name, :description, :isActive, :userId)
    `,
    {
      name: payload.name,
      description: payload.description || null,
      isActive: payload.isActive ? 1 : 0,
      userId,
    },
  );

  if (payload.tasks?.length) {
    for (const task of payload.tasks) {
      await pool.execute(
        `
          INSERT INTO case_template_tasks (
            template_id, title, description, priority, status, phase_name,
            private_task, estimated_minutes, task_type, start_offset_days,
            due_offset_days, tags_json, sort_order
          )
          VALUES (
            :templateId, :title, :description, :priority, :status, :phaseName,
            :privateTask, :estimatedMinutes, :taskType, :startOffsetDays,
            :dueOffsetDays, :tagsJson, :sortOrder
          )
        `,
        {
          templateId: result.insertId,
          title: task.title,
          description: task.description || null,
          priority: task.priority || "normal",
          status: task.status || "open",
          phaseName: task.phaseName || null,
          privateTask: task.privateTask ? 1 : 0,
          estimatedMinutes: task.estimatedMinutes === "" ? null : task.estimatedMinutes ?? null,
          taskType: task.taskType || "to-do",
          startOffsetDays: task.startOffsetDays === "" ? null : task.startOffsetDays ?? null,
          dueOffsetDays: task.dueOffsetDays === "" ? null : task.dueOffsetDays ?? null,
          tagsJson: JSON.stringify(task.tags || []),
          sortOrder: task.sortOrder || 0,
        },
      );
    }
  }
};

export const listCustomFields = async () => {
  const [rows] = await pool.execute(
    `
      SELECT id, label, field_key AS fieldKey, field_type AS fieldType, options_json AS optionsJson,
        is_required AS isRequired, sort_order AS sortOrder, created_at AS createdAt
      FROM case_custom_fields
      ORDER BY sort_order ASC, label ASC
    `,
  );

  return rows.map((row) => ({
    ...row,
    options: row.optionsJson
      ? (typeof row.optionsJson === "string" ? JSON.parse(row.optionsJson) : row.optionsJson)
      : [],
  }));
};

export const createCustomField = async (payload) => {
  await pool.execute(
    `
      INSERT INTO case_custom_fields (label, field_key, field_type, options_json, is_required, sort_order)
      VALUES (:label, :fieldKey, :fieldType, :optionsJson, :isRequired, :sortOrder)
    `,
    {
      label: payload.label,
      fieldKey: payload.fieldKey,
      fieldType: payload.fieldType,
      optionsJson: JSON.stringify(payload.options || []),
      isRequired: payload.isRequired ? 1 : 0,
      sortOrder: payload.sortOrder || 0,
    },
  );
};

export const deleteCustomField = async (id) => {
  await pool.execute(`DELETE FROM case_custom_fields WHERE id = :id`, { id });
};

export const replaceCaseTeamMembers = async (caseId, teamMemberIds = [], connection = pool) => {
  await connection.execute(`DELETE FROM case_team_members WHERE case_id = :caseId`, { caseId });
  for (const userId of teamMemberIds) {
    await connection.execute(
      `INSERT INTO case_team_members (case_id, user_id) VALUES (:caseId, :userId)`,
      { caseId, userId },
    );
  }
};

export const getCaseTeamMemberIds = async (caseId) => {
  const [rows] = await pool.execute(
    `SELECT user_id AS userId FROM case_team_members WHERE case_id = :caseId ORDER BY user_id ASC`,
    { caseId },
  );

  return rows.map((row) => Number(row.userId));
};

export const listGlobalTimers = async (query) => {
  const paging = toLimitOffsetSql(query);
  const where = [];
  const params = {};

  if (query.status) {
    where.push("t.status = :status");
    params.status = query.status;
  }

  if (query.type) {
    where.push("t.timer_type = :type");
    params.type = query.type;
  }

  if (query.clientId) {
    where.push("t.client_id = :clientId");
    params.clientId = query.clientId;
  }

  if (query.dateFrom) {
    where.push("COALESCE(t.work_date, DATE(t.started_at)) >= :dateFrom");
    params.dateFrom = query.dateFrom;
  }

  if (query.dateTo) {
    where.push("COALESCE(t.work_date, DATE(t.started_at)) <= :dateTo");
    params.dateTo = query.dateTo;
  }

  if (query.search) {
    where.push("(t.title LIKE :search OR c.name LIKE :search OR u.name LIKE :search)");
    params.search = `%${query.search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
      SELECT t.id, t.case_id AS caseId, c.name AS caseName, t.task_id AS taskId, t.title,
        t.status, t.timer_type AS timerType, t.started_at AS startedAt, t.ended_at AS endedAt,
        t.work_date AS workDate, t.duration_seconds AS durationSeconds, t.hourly_rate AS hourlyRate,
        t.total_amount AS totalAmount, t.client_id AS clientId, client.name AS clientName,
        t.is_invoiced AS isInvoiced, t.note, u.name AS userName, t.created_at AS createdAt
      FROM case_timers t
      JOIN cases c ON c.id = t.case_id
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users client ON client.id = t.client_id
      ${whereSql}
      ORDER BY t.started_at DESC, t.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM case_timers t ${whereSql}`, params);
  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const updateTimerStatus = async (caseId, timerId, status) => {
  const patch = status === "running"
    ? `status = 'running', started_at = COALESCE(started_at, NOW()), ended_at = NULL`
    : `status = 'stopped',
       ended_at = NOW(),
       completed_at = NOW(),
       duration_seconds = GREATEST(duration_seconds, TIMESTAMPDIFF(SECOND, started_at, NOW())),
       total_amount = CASE
         WHEN hourly_rate IS NULL THEN total_amount
         ELSE ROUND((GREATEST(duration_seconds, TIMESTAMPDIFF(SECOND, started_at, NOW())) / 3600) * hourly_rate, 2)
       END`;

  await pool.execute(
    `UPDATE case_timers SET ${patch} WHERE id = :timerId AND case_id = :caseId`,
    { timerId, caseId },
  );
};

export const listCaseNotesExports = async (caseId, query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT e.id, e.status, e.file_rows AS fileRows, e.file_url AS fileUrl, e.exported_at AS exportedAt,
        e.created_at AS createdAt, u.name AS createdByName
      FROM case_notes_exports e
      LEFT JOIN users u ON u.id = e.created_by
      WHERE e.case_id = :caseId
      ORDER BY e.created_at DESC, e.id DESC
      ${paging.sql}
    `,
    { caseId },
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM case_notes_exports WHERE case_id = :caseId`, { caseId });
  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const listGlobalNotesExports = async (query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT e.id, e.case_id AS caseId, c.name AS caseName, e.status, e.file_rows AS fileRows,
        e.file_url AS fileUrl, e.exported_at AS exportedAt, e.created_at AS createdAt,
        u.name AS createdByName
      FROM case_notes_exports e
      JOIN cases c ON c.id = e.case_id
      LEFT JOIN users u ON u.id = e.created_by
      ORDER BY e.created_at DESC, e.id DESC
      ${paging.sql}
    `,
  );
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM case_notes_exports`);
  return { rows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const createCaseNotesExport = async (caseId, payload, userId) => {
  await pool.execute(
    `
      INSERT INTO case_notes_exports (case_id, created_by, exported_at, status, file_rows, file_url)
      VALUES (:caseId, :userId, :exportedAt, :status, :fileRows, :fileUrl)
    `,
    {
      caseId,
      userId,
      exportedAt: payload.fileUrl ? new Date() : null,
      status: payload.fileUrl ? "exported" : "pending",
      fileRows: payload.fileRows || 0,
      fileUrl: payload.fileUrl || null,
    },
  );
};

export const listCaseGenerators = async () => {
  const [rows] = await pool.execute(
    `
      SELECT g.id, g.name, g.description, g.template_id AS templateId, t.name AS templateName, g.is_active AS isActive
      FROM case_generators g
      LEFT JOIN case_templates t ON t.id = g.template_id
      ORDER BY g.is_active DESC, g.name ASC
    `,
  );
  return rows;
};

export const createCaseGenerator = async (payload) => {
  await pool.execute(
    `
      INSERT INTO case_generators (name, description, template_id, is_active)
      VALUES (:name, :description, :templateId, :isActive)
    `,
    {
      name: payload.name,
      description: payload.description || null,
      templateId: payload.templateId || null,
      isActive: payload.isActive ? 1 : 0,
    },
  );
};

export const applyTemplateToCase = async (caseId, templateId, connection = pool) => {
  const [templateTasks] = await connection.execute(
    `
      SELECT title, description, priority, status, phase_name AS phaseName,
        private_task AS privateTask, estimated_minutes AS estimatedMinutes,
        task_type AS taskType, start_offset_days AS startOffsetDays,
        due_offset_days AS dueOffsetDays, tags_json AS tagsJson, sort_order AS sortOrder
      FROM case_template_tasks
      WHERE template_id = :templateId
      ORDER BY sort_order ASC, id ASC
    `,
    { templateId },
  );

  const phaseIdByName = new Map();
  for (const task of templateTasks) {
    if (!task.phaseName) continue;
    if (!phaseIdByName.has(task.phaseName)) {
      const [phaseRows] = await connection.execute(
        `SELECT id FROM case_phases WHERE case_id = :caseId AND name = :name LIMIT 1`,
        { caseId, name: task.phaseName },
      );

      let phaseId = phaseRows[0]?.id;
      if (!phaseId) {
        const [insertResult] = await connection.execute(
          `INSERT INTO case_phases (case_id, name, sort_order) VALUES (:caseId, :name, :sortOrder)`,
          { caseId, name: task.phaseName, sortOrder: task.sortOrder || 0 },
        );
        phaseId = insertResult.insertId;
      }
      phaseIdByName.set(task.phaseName, phaseId);
    }
  }

  for (const task of templateTasks) {
    await connection.execute(
      `
        INSERT INTO case_tasks (
          case_id, title, description, priority, status, phase_id,
          private_task, estimated_minutes, task_type, start_date, due_date,
          tags_json, sort_order
        )
        VALUES (
          :caseId, :title, :description, :priority, :status, :phaseId,
          :privateTask, :estimatedMinutes, :taskType, :startDate, :dueDate,
          :tagsJson, :sortOrder
        )
      `,
      {
        caseId,
        title: task.title,
        description: task.description || null,
        priority: task.priority,
        status: task.status,
        phaseId: task.phaseName ? phaseIdByName.get(task.phaseName) : null,
        privateTask: task.privateTask ? 1 : 0,
        estimatedMinutes: task.estimatedMinutes ?? null,
        taskType: task.taskType || "to-do",
        startDate: task.startOffsetDays == null ? null : new Date(Date.now() + Number(task.startOffsetDays) * 86400000),
        dueDate: task.dueOffsetDays == null ? null : new Date(Date.now() + Number(task.dueOffsetDays) * 86400000),
        tagsJson: task.tagsJson ? (typeof task.tagsJson === "string" ? task.tagsJson : JSON.stringify(task.tagsJson)) : JSON.stringify([]),
        sortOrder: task.sortOrder || 0,
      },
    );
  }
};

export const listCaseSystemSettings = async () => {
  const [rows] = await pool.execute(
    `SELECT setting_key AS settingKey, setting_value AS settingValue FROM case_system_settings ORDER BY setting_key ASC`,
  );

  return rows.reduce((acc, row) => {
    acc[row.settingKey] = row.settingValue
      ? (typeof row.settingValue === "string" ? JSON.parse(row.settingValue) : row.settingValue)
      : {};
    return acc;
  }, {});
};

export const upsertCaseSystemSettings = async (payload) => {
  for (const [settingKey, settingValue] of Object.entries(payload)) {
    await pool.execute(
      `
        INSERT INTO case_system_settings (setting_key, setting_value)
        VALUES (:settingKey, :settingValue)
        ON DUPLICATE KEY UPDATE setting_value = :settingValue
      `,
      { settingKey, settingValue: JSON.stringify(settingValue ?? {}) },
    );
  }
};

export const listProducts = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, price, description, created_at AS createdAt FROM case_products ORDER BY name ASC`,
  );
  return rows;
};

export const createProduct = async (payload) => {
  await pool.execute(
    `
      INSERT INTO case_products (name, price, description)
      VALUES (:name, :price, :description)
    `,
    {
      name: payload.name,
      price: payload.price ?? null,
      description: payload.description || null,
    },
  );
};

export const deleteProduct = async (id) => {
  await pool.execute(`DELETE FROM case_products WHERE id = :id`, { id });
};

export const listSectors = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, created_at AS createdAt FROM case_sectors ORDER BY name ASC`,
  );
  return rows;
};

export const createSector = async (payload) => {
  await pool.execute(
    `INSERT INTO case_sectors (name) VALUES (:name)`,
    { name: payload.name },
  );
};

export const deleteSector = async (id) => {
  await pool.execute(`DELETE FROM case_sectors WHERE id = :id`, { id });
};

export const listTeamsOptions = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name FROM teams ORDER BY name ASC`,
  );
  return rows;
};

// ── Case Phases ────────────────────────────────────────────────────────────────

export const listCasePhases = async (caseId) => {
  const [rows] = await pool.execute(
    `SELECT id, name, sort_order AS sortOrder, created_at AS createdAt
     FROM case_phases
     WHERE case_id = :caseId
     ORDER BY sort_order ASC, id ASC`,
    { caseId },
  );
  return rows;
};

export const createCasePhase = async (caseId, { name, sortOrder = 0 }) => {
  const [result] = await pool.execute(
    `INSERT INTO case_phases (case_id, name, sort_order) VALUES (:caseId, :name, :sortOrder)`,
    { caseId, name, sortOrder },
  );
  return { id: result.insertId, name, sortOrder, caseId };
};

export const updateCasePhase = async (caseId, phaseId, { name, sortOrder }) => {
  const fields = [];
  const params = { caseId, phaseId };

  if (name !== undefined) { fields.push("name = :name"); params.name = name; }
  if (sortOrder !== undefined) { fields.push("sort_order = :sortOrder"); params.sortOrder = sortOrder; }

  if (!fields.length) return;

  await pool.execute(
    `UPDATE case_phases SET ${fields.join(", ")} WHERE id = :phaseId AND case_id = :caseId`,
    params,
  );
};

export const deleteCasePhase = async (caseId, phaseId) => {
  await pool.execute(
    `DELETE FROM case_phases WHERE id = :phaseId AND case_id = :caseId`,
    { caseId, phaseId },
  );
};

// ── Custom Field Values ────────────────────────────────────────────────────────

/**
 * Upsert multiple custom field values for a given case.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE to handle both create and edit.
 * @param {number} caseId
 * @param {Record<string, string>} valuesMap  { fieldKey: value }
 * @param {object} connection  DB connection (for transaction support)
 */
export const upsertCustomFieldValues = async (caseId, valuesMap, connection = pool) => {
  if (!valuesMap || !Object.keys(valuesMap).length) return;

  // Resolve fieldKeys → fieldIds
  const keys = Object.keys(valuesMap);
  const placeholders = keys.map(() => '?').join(',');
  const [fieldRows] = await connection.execute(
    `SELECT id, field_key FROM case_custom_fields WHERE field_key IN (${placeholders})`,
    keys,
  );

  if (!fieldRows.length) return;

  for (const field of fieldRows) {
    const value = valuesMap[field.field_key];
    if (value === undefined) continue;

    await connection.execute(
      `
        INSERT INTO case_custom_field_values (case_id, field_id, value_text)
        VALUES (:caseId, :fieldId, :value)
        ON DUPLICATE KEY UPDATE value_text = :value
      `,
      { caseId, fieldId: field.id, value: String(value ?? '') },
    );
  }
};

/**
 * Load custom field values for a case.
 * Returns { fieldKey: value } map.
 */
export const getCustomFieldValues = async (caseId) => {
  const [rows] = await pool.execute(
    `
      SELECT f.field_key AS fieldKey, v.value_text AS value
      FROM case_custom_field_values v
      JOIN case_custom_fields f ON f.id = v.field_id
      WHERE v.case_id = :caseId
    `,
    { caseId },
  );

  return rows.reduce((acc, row) => {
    acc[row.fieldKey] = row.value;
    return acc;
  }, {});
};

// ── Template Tasks CRUD ────────────────────────────────────────────────────────

/** List all tasks belonging to a specific template */
export const listTemplateTasks = async (templateId) => {
  const [rows] = await pool.execute(
    `
      SELECT id, template_id AS templateId, title, description, priority, status,
        phase_name AS phaseName, private_task AS privateTask, estimated_minutes AS estimatedMinutes,
        task_type AS taskType, start_offset_days AS startOffsetDays, due_offset_days AS dueOffsetDays,
        tags_json AS tagsJson, sort_order AS sortOrder, created_at AS createdAt
      FROM case_template_tasks
      WHERE template_id = :templateId
      ORDER BY sort_order ASC, id ASC
    `,
    { templateId },
  );
  return rows.map((row) => ({
    ...row,
    tags: row.tagsJson ? (typeof row.tagsJson === "string" ? JSON.parse(row.tagsJson) : row.tagsJson) : [],
  }));
};

/** Add a new task to an existing template */
export const createTemplateTask = async (templateId, payload) => {
  const [result] = await pool.execute(
    `
      INSERT INTO case_template_tasks (
        template_id, title, description, priority, status, phase_name,
        private_task, estimated_minutes, task_type, start_offset_days,
        due_offset_days, tags_json, sort_order
      )
      VALUES (
        :templateId, :title, :description, :priority, :status, :phaseName,
        :privateTask, :estimatedMinutes, :taskType, :startOffsetDays,
        :dueOffsetDays, :tagsJson, :sortOrder
      )
    `,
    {
      templateId,
      title: payload.title,
      description: payload.description || null,
      priority: payload.priority || "normal",
      status: payload.status || "open",
      phaseName: payload.phaseName || null,
      privateTask: payload.privateTask ? 1 : 0,
      estimatedMinutes: payload.estimatedMinutes === "" ? null : payload.estimatedMinutes ?? null,
      taskType: payload.taskType || "to-do",
      startOffsetDays: payload.startOffsetDays === "" ? null : payload.startOffsetDays ?? null,
      dueOffsetDays: payload.dueOffsetDays === "" ? null : payload.dueOffsetDays ?? null,
      tagsJson: JSON.stringify(payload.tags || []),
      sortOrder: payload.sortOrder || 0,
    },
  );
  return { id: result.insertId, templateId: Number(templateId), ...payload };
};

/** Update an existing template task */
export const updateTemplateTask = async (templateId, taskId, payload) => {
  const fields = [];
  const params = { templateId, taskId };

  if (payload.title !== undefined)       { fields.push("title = :title");             params.title = payload.title; }
  if (payload.description !== undefined) { fields.push("description = :description"); params.description = payload.description || null; }
  if (payload.priority !== undefined)    { fields.push("priority = :priority");       params.priority = payload.priority; }
  if (payload.status !== undefined)      { fields.push("status = :status");           params.status = payload.status; }
  if (payload.phaseName !== undefined)   { fields.push("phase_name = :phaseName");    params.phaseName = payload.phaseName || null; }
  if (payload.privateTask !== undefined) { fields.push("private_task = :privateTask"); params.privateTask = payload.privateTask ? 1 : 0; }
  if (payload.estimatedMinutes !== undefined) { fields.push("estimated_minutes = :estimatedMinutes"); params.estimatedMinutes = payload.estimatedMinutes === "" ? null : payload.estimatedMinutes; }
  if (payload.taskType !== undefined) { fields.push("task_type = :taskType"); params.taskType = payload.taskType; }
  if (payload.startOffsetDays !== undefined) { fields.push("start_offset_days = :startOffsetDays"); params.startOffsetDays = payload.startOffsetDays === "" ? null : payload.startOffsetDays; }
  if (payload.dueOffsetDays !== undefined) { fields.push("due_offset_days = :dueOffsetDays"); params.dueOffsetDays = payload.dueOffsetDays === "" ? null : payload.dueOffsetDays; }
  if (payload.tags !== undefined) { fields.push("tags_json = :tagsJson"); params.tagsJson = JSON.stringify(payload.tags || []); }
  if (payload.sortOrder !== undefined)   { fields.push("sort_order = :sortOrder");    params.sortOrder = payload.sortOrder; }

  if (!fields.length) return;
  await pool.execute(
    `UPDATE case_template_tasks SET ${fields.join(", ")} WHERE id = :taskId AND template_id = :templateId`,
    params,
  );
};

/** Delete a single task from a template */
export const deleteTemplateTask = async (templateId, taskId) => {
  await pool.execute(
    `DELETE FROM case_template_tasks WHERE id = :taskId AND template_id = :templateId`,
    { templateId, taskId },
  );
};

/** Delete an entire template and all its tasks */
export const deleteTemplate = async (id) => {
  await pool.execute(`DELETE FROM case_template_tasks WHERE template_id = :id`, { id });
  await pool.execute(`DELETE FROM case_templates WHERE id = :id`, { id });
};

// ── User Report ────────────────────────────────────────────────────────────────

/**
 * Build a summary report for a user:
 * profile, cases they are involved in, and their personal task stats.
 */
export const getUserReport = async (userId) => {
  const [userRows] = await pool.execute(
    `SELECT id, name, email, phone, address, role, created_at AS createdAt FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );

  const [caseRows] = await pool.execute(
    `
      SELECT DISTINCT c.id, c.name, c.custom_uid AS customUid, c.is_archived AS isArchived,
        s.name AS statusName, s.color AS statusColor,
        c.estimated_completion_date AS estimatedCompletionDate,
        c.progress_percentage AS progressPercentage,
        COALESCE(ts.totalTasks, 0) AS totalTasks,
        COALESCE(ts.completedTasks, 0) AS completedTasks
      FROM cases c
      LEFT JOIN case_statuses s ON s.id = c.status_id
      LEFT JOIN (
        SELECT case_id,
          COUNT(*) AS totalTasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedTasks
        FROM case_tasks GROUP BY case_id
      ) ts ON ts.case_id = c.id
      LEFT JOIN case_team_members ctm ON ctm.case_id = c.id AND ctm.user_id = :userId
      WHERE c.target_id = :userId
         OR c.project_leader_id = :userId
         OR c.secondary_client_id = :userId
         OR ctm.user_id = :userId
      ORDER BY c.is_archived ASC, c.created_at DESC
    `,
    { userId },
  );

  const [taskStats] = await pool.execute(
    `
      SELECT
        COUNT(*) AS totalTasks,
        SUM(CASE WHEN status = 'completed'  THEN 1 ELSE 0 END) AS completedTasks,
        SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) AS inProgressTasks,
        SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS openTasks
      FROM case_tasks
      WHERE assignee_id = :userId
    `,
    { userId },
  );

  return {
    user: userRows[0] || null,
    cases: caseRows,
    taskStats: taskStats[0] || { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, openTasks: 0 },
  };
};
