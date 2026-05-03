import {
  createContactRecipient,
  createContactSubmission,
  createSocialLink,
  deleteContactRecipient,
  deleteContactSubmission,
  deleteSocialLink,
  getRawSiteSettings,
  getSiteSettings,
  getSocialLinkById,
  listContactRecipients,
  listContactSubmissions,
  listSocialLinks,
  markContactSubmissionEmailFailed,
  updateContactRecipient,
  updateContactSubmissionStatus,
  updateSiteSettings,
  updateSocialLink,
} from "../repositories/siteSettings.repository.js";
import { deleteSiteAsset, uploadSiteAsset } from "../services/cloudinary.service.js";
import { sendContactSubmissionEmail } from "../services/email.service.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const buildPublicSettings = async () => {
  const [settings, socialLinks] = await Promise.all([
    getSiteSettings(),
    listSocialLinks({ activeOnly: true }),
  ]);

  return {
    siteName: settings.siteName,
    logo: settings.logo.url,
    favicon: settings.favicon.url,
    address: settings.address,
    copyright: settings.copyright,
    socialAccounts: socialLinks.map((link) => ({
      id: link.id,
      label: link.label,
      type: link.type,
      target: link.target,
      iconUrl: link.iconUrl,
    })),
  };
};

const normalizeSocialPayload = (body, icon = null) => ({
  label: body.label,
  type: body.type || "url",
  target: body.target,
  sortOrder: Number(body.sortOrder || 0),
  isActive: body.isActive === true || body.isActive === "true" || body.isActive === 1 || body.isActive === "1",
  iconUrl: icon?.secureUrl ?? null,
  iconPublicId: icon?.publicId ?? null,
  iconResourceType: icon?.resourceType ?? null,
  iconOriginalName: icon?.originalName ?? null,
});

export const publicSiteSettings = async (_req, res) => {
  sendSuccess(res, { data: await buildPublicSettings() });
};

export const adminSiteSettings = async (_req, res) => {
  const [settings, socialLinks, recipients, submissions] = await Promise.all([
    getSiteSettings(),
    listSocialLinks(),
    listContactRecipients(),
    listContactSubmissions({ page: 1, perPage: 20 }),
  ]);
  sendSuccess(res, { data: { settings, socialLinks, recipients, submissions } });
};

export const saveSiteSettings = async (req, res) => {
  const current = await getRawSiteSettings();
  const logoFile = req.files?.logo?.[0];
  const faviconFile = req.files?.favicon?.[0];
  const [logo, favicon] = await Promise.all([
    logoFile ? uploadSiteAsset(logoFile, "bonehard/site/brand") : null,
    faviconFile ? uploadSiteAsset(faviconFile, "bonehard/site/brand") : null,
  ]);

  const clearLogo = req.body.clearLogo === 'true';
  const clearFavicon = req.body.clearFavicon === 'true';

  const updated = await updateSiteSettings({
    ...(req.validatedBody || req.body),
    logo: logo ? { url: logo.secureUrl, publicId: logo.publicId, resourceType: logo.resourceType, originalName: logo.originalName } : null,
    favicon: favicon ? { url: favicon.secureUrl, publicId: favicon.publicId, resourceType: favicon.resourceType, originalName: favicon.originalName } : null,
    clearLogo,
    clearFavicon,
  }, req.user.id);

  if ((logo || clearLogo) && current?.logo_public_id) await deleteSiteAsset(current.logo_public_id, current.logo_resource_type);
  if ((favicon || clearFavicon) && current?.favicon_public_id) await deleteSiteAsset(current.favicon_public_id, current.favicon_resource_type);

  sendSuccess(res, { data: updated, message: "Site settings saved" });
};

export const createSocial = async (req, res) => {
  const icon = req.file ? await uploadSiteAsset(req.file, "bonehard/site/social") : null;
  const rows = await createSocialLink(normalizeSocialPayload(req.validatedBody || req.body, icon));
  sendSuccess(res, { data: rows, message: "Social link created", status: 201 });
};

export const updateSocial = async (req, res) => {
  const current = await getSocialLinkById(req.params.id);
  if (!current) throw new ApiError(404, "Social link not found");
  const icon = req.file ? await uploadSiteAsset(req.file, "bonehard/site/social") : null;
  const rows = await updateSocialLink(req.params.id, normalizeSocialPayload(req.validatedBody || req.body, icon));
  if (icon && current.iconPublicId) await deleteSiteAsset(current.iconPublicId, current.iconResourceType);
  sendSuccess(res, { data: rows, message: "Social link updated" });
};

export const removeSocial = async (req, res) => {
  const current = await getSocialLinkById(req.params.id);
  if (!current) throw new ApiError(404, "Social link not found");
  const rows = await deleteSocialLink(req.params.id);
  if (current.iconPublicId) await deleteSiteAsset(current.iconPublicId, current.iconResourceType);
  sendSuccess(res, { data: rows, message: "Social link deleted" });
};

export const createRecipient = async (req, res) => {
  const rows = await createContactRecipient(req.validatedBody || req.body);
  sendSuccess(res, { data: rows, message: "Recipient created", status: 201 });
};

export const updateRecipient = async (req, res) => {
  const rows = await updateContactRecipient(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { data: rows, message: "Recipient updated" });
};

export const removeRecipient = async (req, res) => {
  const rows = await deleteContactRecipient(req.params.id);
  sendSuccess(res, { data: rows, message: "Recipient deleted" });
};

export const submitContact = async (req, res) => {
  const submission = await createContactSubmission(req.validatedBody || req.body);
  const recipients = await listContactRecipients({ activeOnly: true });
  try {
    const result = await sendContactSubmissionEmail({ recipients, submission });
    if (!result.sent && result.reason) {
      await markContactSubmissionEmailFailed(submission.id, result.reason);
    }
  } catch (error) {
    await markContactSubmissionEmailFailed(submission.id, error.message);
    console.error("Contact submission email failed", { name: error.name, message: error.message });
  }
  sendSuccess(res, { data: { id: submission.id }, message: "Contact request submitted", status: 201 });
};

export const listSubmissions = async (req, res) => {
  const result = await listContactSubmissions(req.validatedQuery || req.query);
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const updateSubmission = async (req, res) => {
  const row = await updateContactSubmissionStatus(req.params.id, req.validatedBody || req.body);
  if (!row) throw new ApiError(404, "Submission not found");
  sendSuccess(res, { data: row, message: "Submission updated" });
};

export const removeSubmission = async (req, res) => {
  await deleteContactSubmission(req.params.id);
  sendSuccess(res, { message: "Submission deleted" });
};
