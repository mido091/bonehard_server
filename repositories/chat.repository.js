import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

// ─── Group Management ──────────────────────────────────────────────────────

export const getGroupById = async (id) => {
  const [[row]] = await pool.execute(
    `SELECT id, name, type, created_by AS createdBy, created_at AS createdAt FROM chat_groups WHERE id = :id LIMIT 1`,
    { id },
  );
  return row || null;
};

export const getGroupMembers = async (groupId) => {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role FROM users u
     INNER JOIN chat_group_members m ON m.user_id = u.id
     WHERE m.group_id = :groupId ORDER BY u.name ASC`,
    { groupId },
  );
  return rows;
};

/**
 * Find an existing direct chat between exactly two users.
 * Returns the group row or null if none exists.
 */
export const findDirectChat = async (userAId, userBId) => {
  const [rows] = await pool.execute(
    `SELECT g.id FROM chat_groups g
     WHERE g.type = 'direct'
       AND EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = g.id AND user_id = :userA)
       AND EXISTS (SELECT 1 FROM chat_group_members WHERE group_id = g.id AND user_id = :userB)
       AND (SELECT COUNT(*) FROM chat_group_members WHERE group_id = g.id) = 2
     LIMIT 1`,
    { userA: userAId, userB: userBId },
  );
  return rows[0] || null;
};

/**
 * Create a new chat group (direct or group) and add the initial members.
 * @param {string}   name       - Display name
 * @param {string}   type       - 'direct' | 'group'
 * @param {number}   createdBy  - User id of creator
 * @param {number[]} memberIds  - Array of user ids to add (must include createdBy)
 */
export const createGroup = async (name, type, createdBy, memberIds) => {
  const [result] = await pool.execute(
    `INSERT INTO chat_groups (name, type, created_by) VALUES (:name, :type, :createdBy)`,
    { name, type, createdBy },
  );
  const groupId = result.insertId;

  // Add all members in a single multi-row INSERT
  const uniqueIds = [...new Set(memberIds.map(Number))];
  for (const userId of uniqueIds) {
    await pool.execute(
      `INSERT IGNORE INTO chat_group_members (group_id, user_id) VALUES (:groupId, :userId)`,
      { groupId, userId },
    );
  }
  return getGroupById(groupId);
};

export const deleteGroup = async (id) => {
  await pool.execute(`DELETE FROM chat_groups WHERE id = :id`, { id });
};

export const addGroupMember = async (groupId, userId) => {
  await pool.execute(
    `INSERT IGNORE INTO chat_group_members (group_id, user_id) VALUES (:groupId, :userId)`,
    { groupId, userId },
  );
  return getGroupMembers(groupId);
};

export const removeGroupMember = async (groupId, userId) => {
  await pool.execute(
    `DELETE FROM chat_group_members WHERE group_id = :groupId AND user_id = :userId`,
    { groupId, userId },
  );
  return getGroupMembers(groupId);
};

export const listChatContacts = async (user) => {
  if (user.role === "user") {
    const [rows] = await pool.execute(
      `
        SELECT id, name
        FROM users
        WHERE role IN ('admin', 'assistant')
          AND COALESCE(is_active, 1) = 1
          AND id <> :userId
        ORDER BY name ASC, id ASC
      `,
      { userId: user.id },
    );

    return rows;
  }

  const [rows] = await pool.execute(
    `
      SELECT id, name, email, role
      FROM users
      WHERE COALESCE(is_active, 1) = 1
        AND id <> :userId
      ORDER BY name ASC, id ASC
    `,
    { userId: user.id },
  );

  return rows;
};

export const getUserChatContact = async (id) => {
  const [rows] = await pool.execute(
    `
      SELECT id, name
      FROM users
      WHERE id = :id
        AND role IN ('admin', 'assistant')
        AND COALESCE(is_active, 1) = 1
      LIMIT 1
    `,
    { id },
  );

  return rows[0] || null;
};



export const getMaxRoleRankForGroup = async (groupId) => {
  const [rows] = await pool.execute(
    `SELECT MAX(CASE u.role WHEN 'admin' THEN 3 WHEN 'assistant' THEN 2 ELSE 1 END) as maxRank 
     FROM chat_group_members cgm 
     JOIN users u ON u.id = cgm.user_id 
     WHERE cgm.group_id = :groupId`,
    { groupId }
  );
  return rows[0]?.maxRank || 1;
};

export const userCanAccessGroup = async (groupId, user) => {
  // Chat is account-scoped for every role. Admin/assistant users should not
  // receive or read conversations unless they are explicit members.
  const [rows] = await pool.execute(
    `SELECT 1 FROM chat_group_members WHERE group_id = :groupId AND user_id = :userId LIMIT 1`,
    { groupId, userId: user.id },
  );

  return rows.length > 0;
};

export const userCanAccessCase = async (caseId, user) => {
  if (["admin", "assistant"].includes(user.role)) {
    return true;
  }

  const [rows] = await pool.execute(
    `
      SELECT 1
      FROM cases
      WHERE id = :caseId
        AND (target_id = :userId OR secondary_client_id = :userId OR project_leader_id = :userId)
      LIMIT 1
    `,
    { caseId, userId: user.id },
  );

  return rows.length > 0;
};

export const listConversations = async (user, query) => {
  const paging = toLimitOffsetSql(query);
  const params = { userId: user.id };
  const memberFilter = "INNER JOIN chat_group_members current_member ON current_member.group_id = g.id AND current_member.user_id = :userId";

    const [rows] = await pool.execute(
    `
      SELECT
        g.id,
        CASE
          WHEN g.type = 'direct' THEN COALESCE((
            SELECT other_user.name
            FROM chat_group_members other_member
            JOIN users other_user ON other_user.id = other_member.user_id
            WHERE other_member.group_id = g.id
              AND other_member.user_id <> :userId
            ORDER BY other_user.name ASC, other_user.id ASC
            LIMIT 1
          ), g.name)
          ELSE g.name
        END AS name,
        g.type, g.created_at AS createdAt, g.updated_at AS updatedAt,
        MAX(m.created_at) AS lastMessageAt,
        COUNT(CASE WHEN m.id > COALESCE(me.last_read_message_id, 0) AND m.sender_id <> :userId THEN 1 END) AS unreadCount,
        (
          SELECT MAX(CASE u.role WHEN 'admin' THEN 3 WHEN 'assistant' THEN 2 ELSE 1 END)
          FROM chat_group_members cgm
          JOIN users u ON u.id = cgm.user_id
          WHERE cgm.group_id = g.id
        ) AS maxRoleRank
      FROM chat_groups g
      ${memberFilter}
      LEFT JOIN chat_group_members me ON me.group_id = g.id AND me.user_id = :userId
      LEFT JOIN messages m ON m.group_id = g.id
      GROUP BY g.id, g.name, g.type, g.created_at, g.updated_at, me.last_read_message_id
      ORDER BY COALESCE(MAX(m.created_at), g.updated_at) DESC, g.id DESC
      ${paging.sql}
    `,
    params,
  );

  const [countRows] = await pool.execute(
    `
      SELECT COUNT(DISTINCT g.id) AS total
      FROM chat_groups g
      ${memberFilter}
    `,
    params,
  );

  const userRank = user.role === 'admin' ? 3 : user.role === 'assistant' ? 2 : 1;
  const mappedRows = rows.map((r) => {
    const { maxRoleRank, ...rest } = r;
    return {
      ...rest,
      canDelete: userRank >= (maxRoleRank || 1)
    };
  });

  return { rows: mappedRows, meta: { page: paging.page, perPage: paging.perPage, total: Number(countRows[0]?.total || 0) } };
};

export const listMessages = async (groupId, query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT m.id, m.group_id AS groupId, m.sender_id AS senderId, u.name AS senderName,
        m.body, m.created_at AS createdAt
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.group_id = :groupId
      ORDER BY m.created_at DESC, m.id DESC
      ${paging.sql}
    `,
    { groupId },
  );

  return {
    rows: rows.reverse(),
    meta: { page: paging.page, perPage: paging.perPage },
  };
};

export const createMessage = async (groupId, userId, body) => {
  const [result] = await pool.execute(
    `
      INSERT INTO messages (group_id, sender_id, body)
      VALUES (:groupId, :userId, :body)
    `,
    { groupId, userId, body },
  );

  await pool.execute(
    `UPDATE chat_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = :groupId`,
    { groupId },
  );

  const [rows] = await pool.execute(
    `
      SELECT m.id, m.group_id AS groupId, m.sender_id AS senderId, u.name AS senderName,
        m.body, m.created_at AS createdAt
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id = :id
      LIMIT 1
    `,
    { id: result.insertId },
  );

  return rows[0];
};

export const markGroupRead = async (groupId, userId) => {
  const [[latest]] = await pool.execute(
    `SELECT MAX(id) AS latestMessageId FROM messages WHERE group_id = :groupId`,
    { groupId },
  );

  const latestMessageId = latest?.latestMessageId || null;

  await pool.execute(
    `
      INSERT INTO chat_group_members (group_id, user_id, last_read_message_id)
      VALUES (:groupId, :userId, :latestMessageId)
      ON DUPLICATE KEY UPDATE last_read_message_id = :latestMessageId
    `,
    { groupId, userId, latestMessageId },
  );

  return { groupId: Number(groupId), userId: Number(userId), lastReadMessageId: latestMessageId };
};

export const getGroupMemberIds = async (groupId) => {
  const [rows] = await pool.execute(
    `SELECT user_id AS userId FROM chat_group_members WHERE group_id = :groupId`,
    { groupId },
  );

  return rows.map((row) => Number(row.userId));
};

export const listClientTalk = async (caseId, query) => {
  const paging = toLimitOffsetSql(query);
  const [rows] = await pool.execute(
    `
      SELECT m.id, m.case_id AS caseId, m.sender_id AS senderId, u.name AS senderName,
        m.body, m.read_at AS readAt, m.created_at AS createdAt
      FROM case_client_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.case_id = :caseId
      ORDER BY m.created_at DESC, m.id DESC
      ${paging.sql}
    `,
    { caseId },
  );

  return { rows: rows.reverse(), meta: { page: paging.page, perPage: paging.perPage } };
};

export const createClientTalkMessage = async (caseId, userId, body) => {
  const [result] = await pool.execute(
    `
      INSERT INTO case_client_messages (case_id, sender_id, body)
      VALUES (:caseId, :userId, :body)
    `,
    { caseId, userId, body },
  );

  const [rows] = await pool.execute(
    `
      SELECT m.id, m.case_id AS caseId, m.sender_id AS senderId, u.name AS senderName,
        m.body, m.read_at AS readAt, m.created_at AS createdAt
      FROM case_client_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.id = :id
      LIMIT 1
    `,
    { id: result.insertId },
  );

  return rows[0];
};

export const userCanAccessChannel = async (channelName, user) => {
  const userMatch = channelName.match(/^private-user-(\d+)$/);
  if (userMatch) {
    return Number(userMatch[1]) === Number(user.id);
  }

  const caseMatch = channelName.match(/^private-case-(\d+)$/);
  if (caseMatch) {
    return userCanAccessCase(Number(caseMatch[1]), user);
  }

  const groupMatch = channelName.match(/^presence-chat-group-(\d+)$/);
  if (groupMatch) {
    return userCanAccessGroup(Number(groupMatch[1]), user);
  }

  return false;
};
