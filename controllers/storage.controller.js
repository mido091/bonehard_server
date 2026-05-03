import cloudinaryPackage from "cloudinary";
import { env } from "../config/env.js";
import { sendSuccess } from "../utils/apiResponse.js";

const { v2: cloudinary } = cloudinaryPackage;

/**
 * Generates a signed upload signature for Cloudinary direct uploads.
 * This ensures only authorized users can upload to your Cloudinary account.
 */
export const getUploadSignature = async (req, res) => {
  const { folder, public_id, timestamp: providedTimestamp } = req.body;

  const timestamp = providedTimestamp || Math.round(new Date().getTime() / 1000);
  
  const uploadParams = {
    timestamp,
    folder: folder || "bonehard/general",
  };

  if (public_id) {
    uploadParams.public_id = public_id;
  }

  // Generate signature using API Secret (keep this on the server only)
  const signature = cloudinary.utils.api_sign_request(
    uploadParams,
    env.cloudinaryApiSecret
  );

  sendSuccess(res, {
    data: {
      signature,
      timestamp,
      cloudName: env.cloudinaryName,
      apiKey: env.cloudinaryApiKey,
      folder: uploadParams.folder,
    },
  });
};
