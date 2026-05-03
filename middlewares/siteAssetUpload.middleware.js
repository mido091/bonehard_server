import path from "node:path";
import multer from "multer";
import { ApiError } from "../utils/apiResponse.js";
import { validateUploadedFiles } from "../utils/fileValidation.js";

const MAX_ASSET_SIZE_MB = 5;
const MAX_ASSET_SIZE = MAX_ASSET_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".ico"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ASSET_SIZE,
    files: 2,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
      callback(new ApiError(415, "Only JPG, PNG, WEBP, GIF, and ICO assets are allowed"));
      return;
    }
    callback(null, true);
  },
});

export const handleBrandAssetUpload = (req, res, next) => {
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "favicon", maxCount: 1 },
  ])(req, res, async (error) => {
    if (!error) {
      try {
        await validateUploadedFiles({
          files: req.files || {},
          allowedMimeTypes: ALLOWED_MIME_TYPES,
          allowedExtensions: ALLOWED_EXTENSIONS,
          maxTotalBytes: MAX_ASSET_SIZE * 2,
          tooLargeMessage: `Asset upload size too large. Maximum is ${MAX_ASSET_SIZE_MB}MB per file.`,
          invalidTypeMessage: "Only JPG, PNG, WEBP, GIF, and ICO assets are allowed",
        });
        return next();
      } catch (validationError) {
        return next(validationError);
      }
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `Asset size too large. Maximum is ${MAX_ASSET_SIZE_MB}MB per file.`
        : error.message;
      return next(new ApiError(422, message));
    }
    next(error);
  });
};

export const handleSocialIconUpload = (req, res, next) => {
  upload.single("icon")(req, res, async (error) => {
    if (!error) {
      try {
        await validateUploadedFiles({
          files: req.file ? [req.file] : [],
          allowedMimeTypes: ALLOWED_MIME_TYPES,
          allowedExtensions: ALLOWED_EXTENSIONS,
          maxTotalBytes: MAX_ASSET_SIZE,
          tooLargeMessage: `Icon size too large. Maximum is ${MAX_ASSET_SIZE_MB}MB.`,
          invalidTypeMessage: "Only JPG, PNG, WEBP, GIF, and ICO assets are allowed",
        });
        return next();
      } catch (validationError) {
        return next(validationError);
      }
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `Icon size too large. Maximum is ${MAX_ASSET_SIZE_MB}MB.`
        : error.message;
      return next(new ApiError(422, message));
    }
    next(error);
  });
};
