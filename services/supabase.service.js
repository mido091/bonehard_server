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

import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import crypto from "node:crypto";
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

const sanitizeFolderKey = (value) => (
  String(value || `pending-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || `pending-${Date.now()}`
);

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
          public: false,
        });
        if (createError) throw new Error(`[Supabase] Cannot create bucket: ${createError.message}`);
        console.log(`[Supabase] Bucket "${BUCKET_NAME}" created`);
      } else {
        const { error: updateError } = await client.storage.updateBucket(BUCKET_NAME, {
          public: false,
        });
        if (updateError) {
          console.warn(`[Supabase] Could not enforce private bucket "${BUCKET_NAME}": ${updateError.message}`);
        }
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

  const fileBody = file.buffer || (file.path ? createReadStream(file.path) : null);
  if (!fileBody) throw new Error("[Supabase] Upload failed: file body is missing");

  console.log("[Supabase] Uploading:", { path: storagePath, size: file.size || file.buffer?.length || 0, type: file.mimetype });

  const { error: uploadError } = await client.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBody, {
      contentType:        file.mimetype,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(storedFileName)}`,
      upsert:             false,
    });

  if (uploadError) {
    throw new Error(`[Supabase] Upload failed: ${uploadError.message}`);
  }

  console.log("[Supabase] Upload success:", { storagePath });

  return {
    supabasePath:      storagePath,
    fileUrl:           storagePath,
    fileName:          storedFileName,
    mimeType:          file.mimetype,
    fileSize:          file.size || file.buffer?.length || 0,
    storageProvider:   "supabase",
    original_filename: originalName,
    stored_file_name:  storedFileName,
    // Backward-compat fields
    public_id:         storagePath,
    secure_url:        null,
    resource_type:     null,
    bytes:             file.size || file.buffer?.length || 0,
    version:           null,
  };
};

export const createSupabaseSignedUploadTarget = async ({
  folderKey,
  fileName,
  mimeType,
  upsert = false,
}) => {
  const client = getClient();
  await ensureBucket(client);

  const originalName = cleanUploadDisplayName(fileName);
  const ext = getExt(originalName);
  const safeName = sanitizeName(originalName);
  const unique = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const storagePath = `cases/${sanitizeFolderKey(folderKey)}/${safeName}_${makeTimestamp()}_${unique}${ext}`;

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(storagePath, { upsert });

  if (error) throw new Error(`[Supabase] Signed upload URL failed: ${error.message}`);

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    fileName: originalName,
    mimeType: mimeType || "application/octet-stream",
  };
};

export const removeTempUploadFile = async (file) => {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch {
    // Temp cleanup should not fail the user-facing request.
  }
};

/**
 * Returns the download URL for a Supabase-stored file.
 * The URL stored in DB is already permanent — return it as-is.
 *
 * @param {object} file - DB record with fileUrl.
 * @returns {string|null}
 */
export const extractSupabaseStoragePath = (value) => {
  if (!value || typeof value !== "string") return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");

  try {
    const url = new URL(value);
    const publicMarker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const signedMarker = `/storage/v1/object/sign/${BUCKET_NAME}/`;
    const publicIndex = url.pathname.indexOf(publicMarker);
    const signedIndex = url.pathname.indexOf(signedMarker);
    const encodedPath = publicIndex >= 0
      ? url.pathname.slice(publicIndex + publicMarker.length)
      : signedIndex >= 0
        ? url.pathname.slice(signedIndex + signedMarker.length)
        : "";
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch {
    return null;
  }
};

export const createSupabaseSignedDownloadUrl = async (storagePath, fileName, expiresIn = 300) => {
  const cleanPath = extractSupabaseStoragePath(storagePath);
  if (!cleanPath) return null;

  const client = getClient();
  await ensureBucket(client);
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(cleanPath, expiresIn, {
      download: fileName || cleanPath.split("/").pop() || "attachment",
    });

  if (error) throw new Error(`[Supabase] Signed URL failed: ${error.message}`);
  return data?.signedUrl || null;
};

export const getSupabaseDownloadUrl = async (file, expiresIn = 300) => {
  const storagePath = file?.cloudinaryPublicId || file?.storagePath || extractSupabaseStoragePath(file?.fileUrl);
  const signedUrl = await createSupabaseSignedDownloadUrl(storagePath, file?.fileName, expiresIn);
  return signedUrl || file?.cloudinarySecureUrl || file?.fileUrl || null;
};

export const downloadSupabaseFile = async (storagePath) => {
  const cleanPath = extractSupabaseStoragePath(storagePath);
  if (!cleanPath) return null;

  const client = getClient();
  await ensureBucket(client);
  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .download(cleanPath);

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
  const cleanPath = extractSupabaseStoragePath(storagePath);
  if (!cleanPath) return;
  try {
    const client = getClient();
    const { error } = await client.storage
      .from(BUCKET_NAME)
      .remove([cleanPath]);

    if (error) throw error;
    console.log("[Supabase] Deleted:", cleanPath);
  } catch (err) {
    // Don't throw — a failed delete should never crash the app
    console.error("[Supabase] Delete failed:", cleanPath, err.message);
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

  return {
    supabasePath: destinationPath,
    fileUrl: destinationPath,
    secure_url: null,
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
