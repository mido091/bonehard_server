import path from "node:path";
import { open } from "node:fs/promises";
import { fileTypeFromBuffer } from "file-type";
import { ApiError } from "./apiResponse.js";

const PDF_MAGIC = "%PDF-";
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);

export const safeOriginalName = (fileName = "file") => {
  const parsed = path.parse(fileName);
  const base = (parsed.name || "file")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\u0600-\u06FF.\- ()]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_. ]+|[-_. ]+$/g, "")
    .slice(0, 120) || "file";
  const ext = (parsed.ext || "").toLowerCase().replace(/[^.\w]/g, "");
  return `${base}${ext}`;
};

export const cleanUploadDisplayName = (fileName = "file") => {
  const safeName = safeOriginalName(fileName);
  const parsed = path.parse(safeName);
  let base = parsed.name || "file";

  // Older uploads appended one timestamp per storage hop. Strip only trailing upload
  // stamps so the UI/download name stays human while storage paths remain unique.
  base = base
    .replace(/(?:[_\s-]*\d{8}-\d{6})+$/g, "")
    .replace(/[_\s.-]+$/g, "")
    .slice(0, 120) || "file";

  return `${base}${parsed.ext || ""}`;
};

const detectFileType = async (buffer) => {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) return detected;

  const head = buffer.subarray(0, 8);
  if (buffer.subarray(0, PDF_MAGIC.length).toString("utf8") === PDF_MAGIC) {
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (head.subarray(0, ICO_MAGIC.length).equals(ICO_MAGIC)) {
    return { mime: "image/x-icon", ext: "ico" };
  }
  return null;
};

export const validateUploadedFiles = async ({
  files,
  allowedMimeTypes,
  allowedExtensions,
  maxTotalBytes,
  tooLargeMessage,
  invalidTypeMessage,
}) => {
  const flatFiles = Array.isArray(files)
    ? files
    : Object.values(files || {}).flat();

  const totalBytes = flatFiles.reduce((sum, file) => sum + (file.size || file.buffer?.length || 0), 0);
  if (maxTotalBytes && totalBytes > maxTotalBytes) {
    throw new ApiError(422, tooLargeMessage);
  }

  for (const file of flatFiles) {
    const extension = path.extname(file.originalname).toLowerCase();
    let sample = file.buffer;
    if (!sample && file.path) {
      let handle;
      try {
        handle = await open(file.path, "r");
        const buffer = Buffer.alloc(4100);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        sample = buffer.subarray(0, bytesRead);
      } catch {
        sample = Buffer.alloc(0);
      } finally {
        await handle?.close();
      }
    }
    const detected = await detectFileType(sample || Buffer.alloc(0));
    const detectedExtension = detected?.ext ? `.${detected.ext.toLowerCase()}` : "";

    if (!allowedExtensions.has(extension)) {
      throw new ApiError(415, invalidTypeMessage);
    }

    // Binary dental/video/archive formats often arrive as application/octet-stream
    // and cannot be reliably sniffed. For these, extension validation is the
    // stable contract; for recognizable formats we still verify the detected MIME.
    if (detected && !allowedMimeTypes.has(detected.mime) && !allowedExtensions.has(detectedExtension)) {
      throw new ApiError(415, invalidTypeMessage);
    }

    file.originalname = safeOriginalName(file.originalname);
    file.detectedMimeType = detected?.mime || file.mimetype || "application/octet-stream";
  }
};
