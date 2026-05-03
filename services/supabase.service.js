/**
 * @file supabase.service.js
 * @description Supabase Storage service for backend file uploads.
 *
 * Uses the Supabase JS SDK (server-side) with the secret key to bypass RLS.
 * Files are stored in the "case-files" bucket under cases/{caseId}/.
 * The bucket is created automatically on first use if it does not exist.
 *
 * Required env variables:
 *   SUPABASE_URL         – e.g. "https://xxxxxxxxxxxx.supabase.co"
 *   SUPABASE_SECRET_KEY  – The secret (service_role) key — sb_secret_...
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { cleanUploadDisplayName } from "../utils/fileValidation.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const BUCKET_NAME = "case-files";

// ── Supabase Client (singleton) ────────────────────────────────────────────────

let _client = null;

const getClient = () => {
  if (_client) return _client;

  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error("[Supabase] SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env");
  }

  _client = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      // Server-side: disable auto token refresh and session persistence
      autoRefreshToken: false,
      persistSession:   false,
    },
  });

  return _client;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeTimestamp = () => {
  const s = new Date().toISOString().replace(/[-:T]/g, "").replace(/\..+$/, "");
  return `${s.slice(0, 8)}-${s.slice(8)}`;
};

const getExt = (filename) => {
  const m = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
};

const sanitizeName = (filename) => {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  return (
    withoutExt
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")            // strip Latin diacritics
      .replace(/[^\w\u0600-\u06FF.\- ]+/g, "-")   // keep Arabic + Latin + digits
      .replace(/-+/g, "-")
      .replace(/^[-_. ]+|[-_. ]+$/g, "")
      .slice(0, 100) || "file"
  );
};

// ── Bucket Bootstrap ───────────────────────────────────────────────────────────

let _bucketPromise = null;

/**
 * Ensures the storage bucket exists.
 * Creates it as a PUBLIC bucket on first call — results are cached in a promise.
 */
const ensureBucket = (client) => {
  if (!_bucketPromise) {
    _bucketPromise = (async () => {
      const { data: buckets, error: listError } = await client.storage.listBuckets();
      if (listError) throw new Error(`[Supabase] Cannot list buckets: ${listError.message}`);

      const exists = buckets?.some((b) => b.name === BUCKET_NAME);

      if (!exists) {
        const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
          public: true, // Public bucket — download URLs need no auth token
        });
        if (createError) throw new Error(`[Supabase] Cannot create bucket: ${createError.message}`);
        console.log(`[Supabase] Bucket "${BUCKET_NAME}" created`);
      }
    })();
  }
  return _bucketPromise;
};

// ── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Uploads a Multer in-memory file to Supabase Storage.
 *
 * The public URL is permanent and requires no authentication.
 * Format: {supabaseUrl}/storage/v1/object/public/case-files/{storagePath}
 *
 * @param {number|string} caseId - Used to organize files per case.
 * @param {object}        file   - Multer file (.buffer, .originalname, .mimetype, .size).
 * @returns {Promise<object>} Upload result compatible with the case_files DB schema.
 */
export const uploadFileToSupabase = async (caseId, file) => {
  const client = getClient();
  await ensureBucket(client);

  const timestamp      = makeTimestamp();
  const originalName   = cleanUploadDisplayName(file.originalname);
  const ext            = getExt(originalName);
  const safeName       = sanitizeName(originalName);
  const storedFileName = originalName;
  const storagePath    = `cases/${caseId}/${safeName}_${timestamp}${ext}`;

  console.log("[Supabase] Uploading:", { path: storagePath, size: file.buffer.length, type: file.mimetype });

  const { error: uploadError } = await client.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file.buffer, {
      contentType:        file.mimetype,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(storedFileName)}`,
      upsert:             false,
    });

  if (uploadError) {
    throw new Error(`[Supabase] Upload failed: ${uploadError.message}`);
  }

  // Get the permanent public URL with the 'download' flag
  // This appends ?download= to the URL so the browser forces a download instead of displaying it inline.
  const { data: { publicUrl } } = client.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath, { download: storedFileName });

  console.log("[Supabase] Upload success:", { storagePath, publicUrl });

  return {
    supabasePath:      storagePath,
    fileUrl:           publicUrl,
    fileName:          storedFileName,
    mimeType:          file.mimetype,
    fileSize:          file.buffer.length,
    storageProvider:   "supabase",
    original_filename: originalName,
    stored_file_name:  storedFileName,
    // Backward-compat fields
    public_id:         storagePath,
    secure_url:        publicUrl,
    resource_type:     null,
    bytes:             file.buffer.length,
    version:           null,
  };
};

/**
 * Returns the download URL for a Supabase-stored file.
 * The URL stored in DB is already permanent — return it as-is.
 *
 * @param {object} file - DB record with fileUrl.
 * @returns {string|null}
 */
export const getSupabaseDownloadUrl = (file) => {
  return file.fileUrl || file.cloudinarySecureUrl || null;
};

export const downloadSupabaseFile = async (storagePath) => {
  if (!storagePath) return null;

  const client = getClient();
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error) {
    throw new Error(`[Supabase] Download failed: ${error.message}`);
  }

  return data;
};

/**
 * Permanently deletes a file from Supabase Storage.
 * Safe to call even if the path does not exist.
 *
 * @param {string} storagePath - The path stored in DB (e.g. "cases/123/file.pdf").
 */
export const deleteSupabaseFile = async (storagePath) => {
  if (!storagePath) return;
  try {
    const client = getClient();
    const { error } = await client.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) throw error;
    console.log("[Supabase] Deleted:", storagePath);
  } catch (err) {
    // Don't throw — a failed delete should never crash the app
    console.error("[Supabase] Delete failed:", storagePath, err.message);
  }
};

export const moveSupabaseFileToCase = async (storagePath, caseId, storedFileName) => {
  if (!storagePath || String(storagePath).startsWith(`cases/${caseId}/`)) {
    return { supabasePath: storagePath, fileUrl: null };
  }

  const client = getClient();
  const destinationPath = `cases/${caseId}/${storagePath.split("/").pop()}`;
  const { error } = await client.storage
    .from(BUCKET_NAME)
    .move(storagePath, destinationPath);

  if (error) {
    throw new Error(`[Supabase] Move failed: ${error.message}`);
  }

  const { data: { publicUrl } } = client.storage
    .from(BUCKET_NAME)
    .getPublicUrl(destinationPath, { download: storedFileName });

  return {
    supabasePath: destinationPath,
    fileUrl: publicUrl,
    secure_url: publicUrl,
  };
};

/**
 * Permanently deletes an entire case's files from Supabase Storage.
 * Safe to call even if the folder does not exist or is empty.
 *
 * @param {number|string} caseId
 */
export const deleteCaseFolder = async (caseId) => {
  try {
    const client = getClient();
    const folderPath = `cases/${caseId}`;
    
    // List all files in the case's folder
    const { data: files, error: listError } = await client.storage.from(BUCKET_NAME).list(folderPath);
    if (listError) throw listError;

    if (files && files.length > 0) {
      // Supabase remove() takes an array of file paths
      const pathsToRemove = files.map(f => `${folderPath}/${f.name}`);
      const { error: removeError } = await client.storage.from(BUCKET_NAME).remove(pathsToRemove);
      if (removeError) throw removeError;
      
      console.log(`[Supabase] Deleted folder contents: ${folderPath} (${files.length} files)`);
    }
  } catch (err) {
    console.error(`[Supabase] Case folder delete failed for case ${caseId}:`, err.message);
  }
};
