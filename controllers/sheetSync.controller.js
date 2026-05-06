import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  getCaseStatusByName,
  getSyncableCaseById,
  getSheetDashboardSummary,
  listDashboardOrdersForSheet,
  listDashboardPaymentsForSheet,
  listDashboardCasesForSheet,
  updateCaseFromSheet,
} from "../repositories/sheetSync.repository.js";
import { ApiError, sendSuccess } from "../utils/apiResponse.js";

const timingSafeStringEqual = (left, right) => {
  const leftHash = crypto.createHash("sha256").update(String(left || "")).digest();
  const rightHash = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
};

const verifySheetsApiKey = (apiKey) => {
  if (!env.sheetsSyncApiKey) {
    throw new ApiError(503, "Google Sheets sync is not configured");
  }

  if (!timingSafeStringEqual(apiKey, env.sheetsSyncApiKey)) {
    throw new ApiError(401, "Invalid Google Sheets sync API key");
  }
};

export const syncToSheet = async (req, res) => {
  const query = req.validatedQuery || req.query;
  verifySheetsApiKey(query.apiKey);

  const [dashboard, cases, orders, payments] = await Promise.all([
    getSheetDashboardSummary(),
    listDashboardCasesForSheet(),
    listDashboardOrdersForSheet(),
    listDashboardPaymentsForSheet(),
  ]);

  sendSuccess(res, {
    data: {
      dashboard,
      cases,
      orders,
      payments,
      // Backward-compatible alias for older Apps Script copies.
      rows: cases,
      count: cases.length,
      generatedAt: new Date().toISOString(),
    },
    message: "Dashboard data ready for Google Sheets",
  });
};

export const syncFromSheet = async (req, res) => {
  const payload = req.validatedBody || req.body;
  verifySheetsApiKey(payload.apiKey);

  const existingCase = await getSyncableCaseById(payload.caseId);
  if (!existingCase) {
    throw new ApiError(404, "Case not found");
  }

  let statusId;
  if (payload.status !== undefined) {
    const status = await getCaseStatusByName(payload.status);
    if (!status) {
      throw new ApiError(422, "Selected case status does not exist");
    }
    statusId = status.id;
  }

  const updatedCase = await updateCaseFromSheet({
    caseId: payload.caseId,
    patientName: payload.patientName,
    statusId,
  });

  sendSuccess(res, {
    data: {
      case: updatedCase,
      rowNumber: payload.rowNumber || null,
      sheetName: payload.sheetName || null,
    },
    message: "Sheet update synced",
  });
};
