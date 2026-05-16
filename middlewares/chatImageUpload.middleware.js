/**
 * chatImageUpload.middleware.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multer middleware that only accepts image files for the Client Talk chat.
 * Limited to 10 MB per image since chat images should be reasonably sized.
 * Field name: "image" (single file).
 */

import path from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync } from "node:fs";
import multer from "multer";
import { ApiError } from "../utils/apiResponse.js";

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE_MB   = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
]);

// Use system temp dir so it works in serverless (Vercel) environments too
const uploadDir = process.env.VERCEL
  ? path.join(tmpdir(), "bonehard", "chat")
  : path.resolve(process.cwd(), "uploads", "chat");

mkdirSync(uploadDir, { recursive: true });

// ── Multer instance ───────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1, // Only one image per message
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext) || !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new ApiError(415, "Only image files are allowed in chat (JPEG, PNG, GIF, WebP). Max 10 MB."));
      return;
    }
    cb(null, true);
  },
});

// ── Middleware export ─────────────────────────────────────────────────────────

/**
 * Handles optional image upload for chat messages.
 * If no multipart/form-data is sent (text-only message), it passes through.
 */
export const handleChatImageUpload = (req, res, next) => {
  // For text-only JSON messages, skip multer entirely
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  upload.single("image")(req, res, (error) => {
    if (!error) {
      // Validate mime type via magic bytes (extra security layer)
      if (req.file && !ALLOWED_IMAGE_MIME_TYPES.has(req.file.mimetype)) {
        next(new ApiError(415, "Only image files are allowed in chat (JPEG, PNG, GIF, WebP)."));
        return;
      }
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `Image too large. Maximum is ${MAX_IMAGE_SIZE_MB} MB.`
        : error.message;
      next(new ApiError(422, message));
      return;
    }

    next(error);
  });
};
