import { pool } from "../config/db.js";
import { toLimitOffsetSql } from "../utils/db.js";

const mapSettings = (row = {}) => ({
  siteName: row.site_name || "BoneHard",
  logo: {
    url: row.logo_url || "/assets/logo/new_logo.webp",
    publicId: row.logo_public_id,
    resourceType: row.logo_resource_type,
    originalName: row.logo_original_name,
  },
  favicon: {
    url: row.favicon_url || row.logo_url || "/assets/logo/new_logo.webp",
    publicId: row.favicon_public_id,
    resourceType: row.favicon_resource_type,
    originalName: row.favicon_original_name,
  },
  address: {
    city: row.address_city || "Dubai - UAE",
    mapTitle: row.map_title || "BoneHard Dubai Location",
    mapEmbed: row.map_embed_url || "https://www.google.com/maps?q=Dubai,UAE&z=11&output=embed",
  },
  copyright: row.copyright_text || "© BoneHard. UAE - Dubai",
});

const mapSocial = (row) => ({
  id: row.id,
  label: row.label,
  type: row.type,
  target: row.target,
  iconUrl: row.icon_url,
  iconPublicId: row.icon_public_id,
  iconResourceType: row.icon_resource_type,
  iconOriginalName: row.icon_original_name,
  sortOrder: row.sort_order,
  isActive: Boolean(row.is_active),
});

const mapRecipient = (row) => ({
  id: row.id,
  label: row.label,
  email: row.email,
  isActive: Boolean(row.is_active),
});

export const getSiteSettings = async () => {
  const [[settingsRow]] = await pool.query("SELECT * FROM site_settings WHERE id = 1 LIMIT 1");
  return mapSettings(settingsRow);
};

export const getRawSiteSettings = async () => {
  const [[row]] = await pool.query("SELECT * FROM site_settings WHERE id = 1 LIMIT 1");
  return row || null;
};

export const updateSiteSettings = async (payload, userId) => {
  await pool.query(
    `
      UPDATE site_settings
      SET
        site_name = :siteName,
        logo_url = IF(:clearLogo, NULL, COALESCE(:logoUrl, logo_url)),
        logo_public_id = IF(:clearLogo, NULL, COALESCE(:logoPublicId, logo_public_id)),
        logo_resource_type = IF(:clearLogo, NULL, COALESCE(:logoResourceType, logo_resource_type)),
        logo_original_name = IF(:clearLogo, NULL, COALESCE(:logoOriginalName, logo_original_name)),
        favicon_url = IF(:clearFavicon, NULL, COALESCE(:faviconUrl, favicon_url)),
        favicon_public_id = IF(:clearFavicon, NULL, COALESCE(:faviconPublicId, favicon_public_id)),
        favicon_resource_type = IF(:clearFavicon, NULL, COALESCE(:faviconResourceType, favicon_resource_type)),
        favicon_original_name = IF(:clearFavicon, NULL, COALESCE(:faviconOriginalName, favicon_original_name)),
        address_city = :addressCity,
        map_title = :mapTitle,
        map_embed_url = :mapEmbedUrl,
        copyright_text = :copyrightText,
        updated_by = :userId
      WHERE id = 1
    `,
    {
      siteName: payload.siteName,
      logoUrl: payload.logo?.url ?? null,
      logoPublicId: payload.logo?.publicId ?? null,
      logoResourceType: payload.logo?.resourceType ?? null,
      logoOriginalName: payload.logo?.originalName ?? null,
      faviconUrl: payload.favicon?.url ?? null,
      faviconPublicId: payload.favicon?.publicId ?? null,
      faviconResourceType: payload.favicon?.resourceType ?? null,
      faviconOriginalName: payload.favicon?.originalName ?? null,
      addressCity: payload.addressCity || null,
      mapTitle: payload.mapTitle || null,
      mapEmbedUrl: payload.mapEmbedUrl || null,
      copyrightText: payload.copyrightText || null,
      userId,
      clearLogo: payload.clearLogo ? 1 : 0,
      clearFavicon: payload.clearFavicon ? 1 : 0,
    },
  );
  return getSiteSettings();
};

export const listSocialLinks = async ({ activeOnly = false } = {}) => {
  const where = activeOnly ? "WHERE is_active = 1" : "";
  const [rows] = await pool.query(`SELECT * FROM site_social_links ${where} ORDER BY sort_order ASC, id ASC`);
  return rows.map(mapSocial);
};

export const getSocialLinkById = async (id) => {
  const [[row]] = await pool.query("SELECT * FROM site_social_links WHERE id = :id LIMIT 1", { id });
  return row ? mapSocial(row) : null;
};

export const createSocialLink = async (payload) => {
  await pool.query(
    `
      INSERT INTO site_social_links
        (label, type, target, icon_url, icon_public_id, icon_resource_type, icon_original_name, sort_order, is_active)
      VALUES
        (:label, :type, :target, :iconUrl, :iconPublicId, :iconResourceType, :iconOriginalName, :sortOrder, :isActive)
    `,
    payload,
  );
  return listSocialLinks();
};

export const updateSocialLink = async (id, payload) => {
  await pool.query(
    `
      UPDATE site_social_links
      SET
        label = :label,
        type = :type,
        target = :target,
        icon_url = COALESCE(:iconUrl, icon_url),
        icon_public_id = COALESCE(:iconPublicId, icon_public_id),
        icon_resource_type = COALESCE(:iconResourceType, icon_resource_type),
        icon_original_name = COALESCE(:iconOriginalName, icon_original_name),
        sort_order = :sortOrder,
        is_active = :isActive
      WHERE id = :id
    `,
    { ...payload, id },
  );
  return listSocialLinks();
};

export const deleteSocialLink = async (id) => {
  await pool.query("DELETE FROM site_social_links WHERE id = :id", { id });
  return listSocialLinks();
};

export const listContactRecipients = async ({ activeOnly = false } = {}) => {
  const where = activeOnly ? "WHERE is_active = 1" : "";
  const [rows] = await pool.query(`SELECT * FROM contact_recipients ${where} ORDER BY id ASC`);
  return rows.map(mapRecipient);
};

export const createContactRecipient = async (payload) => {
  await pool.query(
    "INSERT INTO contact_recipients (label, email, is_active) VALUES (:label, :email, :isActive)",
    {
      label: payload.label ?? null,
      email: payload.email,
      isActive: payload.isActive ?? 1,
    },
  );
  return listContactRecipients();
};

export const updateContactRecipient = async (id, payload) => {
  await pool.query(
    "UPDATE contact_recipients SET label = :label, email = :email, is_active = :isActive WHERE id = :id",
    {
      id,
      label: payload.label ?? null,
      email: payload.email,
      isActive: payload.isActive ?? 1,
    },
  );
  return listContactRecipients();
};

export const deleteContactRecipient = async (id) => {
  await pool.query("DELETE FROM contact_recipients WHERE id = :id", { id });
  return listContactRecipients();
};

export const createContactSubmission = async (payload) => {
  const [result] = await pool.query(
    `
      INSERT INTO contact_submissions
        (contact_name, contact_number, contact_email, scope_of_work, message, file_link)
      VALUES
        (:contactName, :contactNumber, :contactEmail, :scopeOfWork, :message, :fileLink)
    `,
    {
      ...payload,
      message: payload.message || null,
      fileLink: payload.fileLink || null,
    },
  );
  return getContactSubmissionById(result.insertId);
};

export const listContactSubmissions = async ({ page = 1, perPage = 20, status, search } = {}) => {
  const paging = toLimitOffsetSql({ page, perPage });
  const where = [];
  const params = {};
  if (status) {
    where.push("status = :status");
    params.status = status;
  }
  if (search) {
    where.push("(contact_name LIKE :search OR contact_email LIKE :search OR contact_number LIKE :search)");
    params.search = `%${search}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM contact_submissions ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM contact_submissions ${whereSql} ORDER BY created_at DESC ${paging.sql}`,
    params,
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      contactName: row.contact_name,
      contactNumber: row.contact_number,
      contactEmail: row.contact_email,
      scopeOfWork: row.scope_of_work,
      message: row.message,
      fileLink: row.file_link,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    meta: { total, page: paging.page, perPage: paging.perPage, pages: Math.ceil(total / paging.perPage) },
  };
};

export const getContactSubmissionById = async (id) => {
  const [[row]] = await pool.query("SELECT * FROM contact_submissions WHERE id = :id LIMIT 1", { id });
  if (!row) return null;
  return {
    id: row.id,
    contactName: row.contact_name,
    contactNumber: row.contact_number,
    contactEmail: row.contact_email,
    scopeOfWork: row.scope_of_work,
    message: row.message,
    fileLink: row.file_link,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const updateContactSubmissionStatus = async (id, { status, notes }) => {
  await pool.query(
    "UPDATE contact_submissions SET status = :status, notes = :notes WHERE id = :id",
    { id, status, notes: notes || null },
  );
  return getContactSubmissionById(id);
};

export const markContactSubmissionEmailFailed = async (id, reason) => {
  await pool.query(
    "UPDATE contact_submissions SET status = 'email_failed', email_error = :reason WHERE id = :id",
    { id, reason: `${reason || "Email delivery failed"}`.slice(0, 2000) },
  );
};

export const deleteContactSubmission = async (id) => {
  await pool.query("DELETE FROM contact_submissions WHERE id = :id", { id });
};
