import { v2 as cloudinary } from "cloudinary";
import path from "node:path";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";

let configured = false;

const ensureCloudinary = () => {
  if (configured) return;
  if (!env.cloudinaryName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new ApiError(500, "Cloudinary is not configured");
  }
  cloudinary.config({
    cloud_name: env.cloudinaryName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
  configured = true;
};

const safeBaseName = (fileName) => {
  const parsed = path.parse(fileName || "asset");
  return parsed.name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "asset";
};

const timestamp = () => new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

export const uploadSiteAsset = async (file, folder = "bonehard/site") => {
  ensureCloudinary();
  if (!file?.buffer?.length) {
    throw new ApiError(422, "No asset file provided");
  }

  const publicId = `${safeBaseName(file.originalname)}_${timestamp()}`;
  const resourceType = file.mimetype.includes("icon") ? "raw" : "image";

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
        use_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(new ApiError(502, "Unable to upload asset"));
          return;
        }
        if (!result?.secure_url || !result?.public_id) {
          reject(new ApiError(502, "Cloudinary upload completed without an asset URL"));
          return;
        }
        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type || resourceType,
          secureUrl: result.secure_url,
          originalName: file.originalname,
          bytes: result.bytes || file.size || file.buffer.length,
        });
      },
    );

    stream.end(file.buffer);
  });
};

export const deleteSiteAsset = async (publicId, resourceType = "image") => {
  if (!publicId) return;
  ensureCloudinary();
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType || "image" });
  } catch {
    // Asset cleanup should not break the user-facing update once DB state is correct.
  }
};
