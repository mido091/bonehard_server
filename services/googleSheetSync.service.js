import { env } from "../config/env.js";
import { ApiError } from "../utils/apiResponse.js";

export const pushCaseToGoogleSheet = async ({ caseId, patientName, status }) => {
  if (!env.googleSheetWebhookUrl || !env.sheetsSyncApiKey) {
    throw new ApiError(500, "Google Sheets sync is not configured");
  }

  const response = await fetch(env.googleSheetWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: env.sheetsSyncApiKey,
      caseId,
      patientName,
      status,
      updatedAt: new Date().toISOString(),
      source: "dashboard",
    }),
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok || payload?.ok === false) {
    throw new ApiError(502, "Google Sheets sync failed", payload);
  }

  return payload;
};
