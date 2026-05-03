import {
  addGroupMember,
  createGroup,
  createClientTalkMessage,
  createMessage,
  deleteGroup,
  findDirectChat,
  getGroupById,
  getGroupMembers,
  getGroupMemberIds,
  getUserChatContact,
  getMaxRoleRankForGroup,
  listClientTalk,
  listChatContacts,
  listConversations,
  listMessages,
  markGroupRead,
  removeGroupMember,
  userCanAccessCase,
  userCanAccessGroup,
} from "../repositories/chat.repository.js";
import { getChatPaymentSettings } from "../repositories/chatPayment.repository.js";
import { createNotification } from "../repositories/notification.repository.js";
import { authorizePusherChannel, triggerRealtimeEvent } from "../services/pusher.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const ensureUserChatUnlocked = async (user) => {
  if (user.role !== "user") return;
  const settings = await getChatPaymentSettings();
  if (settings.paymentEnabled && !user.chatEnabled) {
    throw new ApiError(403, "Chat access is pending payment approval");
  }
};

export const conversations = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const result = await listConversations(req.user, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const messages = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const groupId = req.params.conversationId;

  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const result = await listMessages(groupId, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const contacts = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const rows = await listChatContacts(req.user);
  sendSuccess(res, { data: rows });
};

export const sendMessage = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const groupId = req.params.conversationId;

  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const message = await createMessage(groupId, req.user.id, req.body.body);
  await triggerRealtimeEvent(`presence-chat-group-${groupId}`, "message.created", message);
  await triggerRealtimeEvent(`presence-chat-group-${groupId}`, "conversation.updated", {
    conversationId: Number(groupId),
    lastMessageAt: message.createdAt,
  });

  const memberIds = await getGroupMemberIds(groupId);
  await Promise.all(
    memberIds
      .filter((memberId) => Number(memberId) !== Number(req.user.id))
      .map(async (memberId) => {
        const notification = await createNotification({
          userId: memberId,
          type: "message",
          title: "New chat message",
          body: message.body.slice(0, 180),
          data: { conversationId: Number(groupId), messageId: message.id },
        });
        await triggerRealtimeEvent(`private-user-${memberId}`, "notification.created", notification);
      }),
  );

  sendSuccess(res, { data: message, message: "Message sent", status: 201 });
};

export const markConversationRead = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const groupId = req.params.conversationId;

  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const readState = await markGroupRead(groupId, req.user.id);
  await triggerRealtimeEvent(`presence-chat-group-${groupId}`, "message.read", readState);

  sendSuccess(res, { data: readState, message: "Conversation marked as read" });
};

export const pusherAuth = async (req, res) => {
  const data = await authorizePusherChannel({
    socketId: req.body.socket_id,
    channelName: req.body.channel_name,
    user: req.user,
  });

  // Return Pusher's auth object directly — NOT wrapped in our ApiResponse envelope
  res.json(data);
};

// ─── New: Create Conversation ───────────────────────────────────────────────

/**
 * POST /api/chats/conversations
 * Body: { type: 'direct'|'group', name?: string, memberIds: number[] }
 *
 * For 'direct': finds existing direct chat between the two users first.
 * For 'group':  creates a new named group and adds all specified members.
 * The creator is always added as a member automatically.
 */
export const createConversation = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const { type, name, memberIds = [] } = req.body;
  const creatorId = req.user.id;

  if (req.user.role === "user") {
    if (type !== "direct") {
      throw new ApiError(403, "Users can only start direct team chats");
    }

    const uniqueMemberIds = [...new Set(memberIds.map(Number))];
    if (uniqueMemberIds.length !== 1) {
      throw new ApiError(422, "Select exactly one team member");
    }

    const teamMember = await getUserChatContact(uniqueMemberIds[0]);
    if (!teamMember) {
      throw new ApiError(403, "Users can only chat with the BoneHard team");
    }
  }

  // Always include the creator in the member list
  const allMemberIds = [...new Set([creatorId, ...memberIds.map(Number)])];

  if (type === "direct") {
    if (allMemberIds.length !== 2) {
      throw new ApiError(400, "Direct chat requires exactly 2 members");
    }

    const otherUserId = allMemberIds.find((id) => id !== creatorId);

    // Reuse existing direct chat if one already exists between these two users
    const existing = await findDirectChat(creatorId, otherUserId);
    if (existing) {
      const group = await getGroupById(existing.id);
      return sendSuccess(res, { data: group, message: "Existing direct chat" });
    }

    // The name of a direct chat is not important — the other person's name is shown on the frontend
    const group = await createGroup(name || "Direct Chat", "direct", creatorId, allMemberIds);
    return sendSuccess(res, { data: group, message: "Direct chat started", status: 201 });
  }

  // Group chat
  if (!name?.trim()) {
    throw new ApiError(400, "Group chat requires a name");
  }
  if (allMemberIds.length < 2) {
    throw new ApiError(400, "Group chat requires at least 2 members");
  }

  const group = await createGroup(name.trim(), "group", creatorId, allMemberIds);

  // Notify all members that a new group has been created
  await Promise.all(
    allMemberIds
      .filter((id) => id !== creatorId)
      .map(async (memberId) => {
        const notification = await createNotification({
          userId: memberId,
          type: "message",
          title: `Added to group: ${group.name}`,
          body: `${req.user.name} added you to a group chat.`,
          data: { conversationId: group.id },
        });
        await triggerRealtimeEvent(`private-user-${memberId}`, "notification.created", notification);
      }),
  );

  sendSuccess(res, { data: group, message: "Group chat created", status: 201 });
};

// ─── New: Delete Conversation ───────────────────────────────────────────────

export const deleteConversation = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const groupId = req.params.conversationId;
  const group = await getGroupById(groupId);

  if (!group) throw new ApiError(404, "Conversation not found");
  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const maxRank = await getMaxRoleRankForGroup(groupId);
  const userRank = req.user.role === 'admin' ? 3 : req.user.role === 'assistant' ? 2 : 1;

  if (userRank < maxRank) {
    throw new ApiError(403, "You do not have permission to delete a conversation involving higher ranking members");
  }

  await deleteGroup(groupId);
  await triggerRealtimeEvent(`presence-chat-group-${groupId}`, "conversation.deleted", { conversationId: Number(groupId) });

  sendSuccess(res, { message: "Conversation deleted" });
};

// ─── New: Group Members ─────────────────────────────────────────────────────

export const conversationMembers = async (req, res) => {
  await ensureUserChatUnlocked(req.user);
  const groupId = req.params.conversationId;
  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }
  const members = await getGroupMembers(groupId);
  sendSuccess(res, { data: members });
};

export const addMember = async (req, res) => {
  const groupId = req.params.conversationId;
  const { userId } = req.body;

  if (!["admin", "assistant"].includes(req.user.role)) {
    throw new ApiError(403, "Only admin or assistant can add members");
  }
  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const members = await addGroupMember(groupId, userId);
  sendSuccess(res, { data: members, message: "Member added" });
};

export const removeMember = async (req, res) => {
  const groupId = req.params.conversationId;
  const { userId } = req.body;

  if (!["admin", "assistant"].includes(req.user.role)) {
    throw new ApiError(403, "Only admin or assistant can remove members");
  }
  if (!(await userCanAccessGroup(groupId, req.user))) {
    throw new ApiError(403, "Conversation access denied");
  }

  const members = await removeGroupMember(groupId, userId);
  sendSuccess(res, { data: members, message: "Member removed" });
};

// ─── Case Client Talk ───────────────────────────────────────────────────────

export const caseClientTalk = async (req, res) => {
  if (!(await userCanAccessCase(req.params.id, req.user))) {
    throw new ApiError(403, "Case chat access denied");
  }

  const result = await listClientTalk(req.params.id, req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const sendCaseClientTalk = async (req, res) => {
  if (!(await userCanAccessCase(req.params.id, req.user))) {
    throw new ApiError(403, "Case chat access denied");
  }

  const message = await createClientTalkMessage(req.params.id, req.user.id, req.body.body);
  await triggerRealtimeEvent(`private-case-${req.params.id}`, "message.created", message);

  sendSuccess(res, { data: message, message: "Message sent", status: 201 });
};
