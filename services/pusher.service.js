import Pusher from "pusher";
import { env } from "../config/env.js";
import { userCanAccessChannel } from "../repositories/chat.repository.js";
import { ApiError } from "../utils/apiResponse.js";

const pusher = new Pusher({
  appId: env.pusherAppId,
  key: env.pusherKey,
  secret: env.pusherSecret,
  cluster: env.pusherCluster,
  useTLS: true,
});

export const triggerRealtimeEvent = async (channel, event, payload) => {
  try {
    await pusher.trigger(channel, event, payload);
  } catch (error) {
    console.warn("Realtime event delivery failed", {
      channel,
      event,
      message: error.message,
    });
  }
};

export const authorizePusherChannel = async ({ socketId, channelName, user }) => {
  const allowed = await userCanAccessChannel(channelName, user);

  if (!allowed) {
    throw new ApiError(403, "Pusher channel access denied");
  }

  if (channelName.startsWith("presence-")) {
    return pusher.authorizeChannel(socketId, channelName, {
      user_id: `${user.id}`,
      user_info: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }

  return pusher.authorizeChannel(socketId, channelName);
};
