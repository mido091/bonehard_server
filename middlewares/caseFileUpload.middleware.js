import path from "node:path";
import { mkdirSync } from "node:fs";
import multer from "multer";
import { ApiError } from "../utils/apiResponse.js";
import { validateUploadedFiles } from "../utils/fileValidation.js";
import {
  CASE_ALLOWED_UPLOAD_EXTENSIONS,
  CASE_ALLOWED_UPLOAD_HINT,
  CASE_ALLOWED_UPLOAD_MIME_TYPES,
  MAX_CASE_FILES_PER_REQUEST,
  MAX_CASE_FILE_SIZE_BYTES,
  MAX_CASE_FILE_SIZE_MB,
} from "../constants/uploadOptions.js";

export const CASE_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "cases");
mkdirSync(CASE_UPLOAD_ROOT, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(CASE_ALLOWED_UPLOAD_MIME_TYPES);
const ALLOWED_EXTENSIONS = new Set(CASE_ALLOWED_UPLOAD_EXTENSIONS);

const upload = multer({
  storage: multer.diskStorage({
    destination: CASE_UPLOAD_ROOT,
    filename: (_req, file, callback) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: {
    fileSize: MAX_CASE_FILE_SIZE_BYTES,
    files: MAX_CASE_FILES_PER_REQUEST,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      callback(new ApiError(415, CASE_ALLOWED_UPLOAD_HINT));
      return;
    }
    callback(null, true);
  },
});

export const handleCaseFileUpload = (req, res, next) => {
  upload.array("files", MAX_CASE_FILES_PER_REQUEST)(req, res, async (error) => {
    if (!error) {
      try {
        await validateUploadedFiles({
          files: req.files || [],
          allowedMimeTypes: ALLOWED_MIME_TYPES,
          allowedExtensions: ALLOWED_EXTENSIONS,
          maxTotalBytes: MAX_CASE_FILE_SIZE_BYTES * MAX_CASE_FILES_PER_REQUEST,
          tooLargeMessage: `Upload size too large. Maximum is ${MAX_CASE_FILE_SIZE_MB}MB per file.`,
          invalidTypeMessage: CASE_ALLOWED_UPLOAD_HINT,
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
        ? `File size too large. Maximum is ${MAX_CASE_FILE_SIZE_MB}MB per file.`
        : error.message;
      next(new ApiError(422, message));
      return;
    }

    next(error);
  });
};
