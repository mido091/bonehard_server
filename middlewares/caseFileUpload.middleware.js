import path from "node:path";
import multer from "multer";
import { ApiError } from "../utils/apiResponse.js";
import { validateUploadedFiles } from "../utils/fileValidation.js";

export const CASE_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "cases");

const MAX_FILES = 20;
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
      callback(new ApiError(415, "Only image files and PDFs are allowed"));
      return;
    }
    callback(null, true);
  },
});

export const handleCaseFileUpload = (req, res, next) => {
  upload.array("files", MAX_FILES)(req, res, async (error) => {
    if (!error) {
      try {
        await validateUploadedFiles({
          files: req.files || [],
          allowedMimeTypes: ALLOWED_MIME_TYPES,
          allowedExtensions: ALLOWED_EXTENSIONS,
          maxTotalBytes: MAX_FILE_SIZE,
          tooLargeMessage: `Upload size too large. Maximum is ${MAX_FILE_SIZE_MB}MB total.`,
          invalidTypeMessage: "Only image files and PDFs are allowed",
        });
        next();
        return;
      } catch (validationError) {
        next(validationError);
        return;
      }
    }

    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `File size too large. Maximum is ${MAX_FILE_SIZE_MB}MB per file.`
        : error.message;
      next(new ApiError(422, message));
      return;
    }

    next(error);
  });
};
