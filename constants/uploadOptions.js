export const FILE_UPLOAD_CATEGORIES = {
  dicom: "dicom",
  stl: "stl",
  photosDocuments: "photos_documents",
  general: "general",
};

export const FILE_UPLOAD_CATEGORY_VALUES = Object.values(FILE_UPLOAD_CATEGORIES);

export const MAX_CASE_FILE_SIZE_MB = 1024;
export const MAX_CASE_FILE_SIZE_BYTES = MAX_CASE_FILE_SIZE_MB * 1024 * 1024;
export const MAX_CASE_FILES_PER_REQUEST = 20;

export const CASE_ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".rtf",
  ".html",
  ".zip",
  ".rar",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".stl",
  ".dcm",
  ".ply",
  ".obj",
  ".mp4",
];

export const CASE_ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/rtf",
  "application/rtf",
  "text/html",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/gif",
  "model/stl",
  "application/sla",
  "model/obj",
  "video/mp4",
];

export const CASE_ALLOWED_UPLOAD_HINT =
  "Allowed files: PDF, Office docs, CSV/TXT/RTF/HTML, ZIP/RAR, images, STL/DCM/PLY/OBJ, and MP4. Max 1GB per file.";
