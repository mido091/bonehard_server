import crypto from "node:crypto";
import { env } from "../config/env.js";
import {
  createCaseFromSheet,
  deleteCaseFromSheet,
  getCaseStatusByName,
  getDefaultSheetCaseStatus,
  getSheetUserIdByLabel,
  getSyncableCaseById,
  getSheetDashboardSummary,
  getSheetCaseCreatorUserId,
  listDashboardOrdersForSheet,
  listDashboardPaymentsForSheet,
  listDashboardCasesForSheet,
  listSheetSyncOptions,
  updateCaseFromSheet,
} from "../repositories/sheetSync.repository.js";
import { deleteCaseFolder } from "../services/supabase.service.js";
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

  const [dashboard, cases, orders, payments, options] = await Promise.all([
    getSheetDashboardSummary(),
    listDashboardCasesForSheet(),
    listDashboardOrdersForSheet(),
    listDashboardPaymentsForSheet(),
    listSheetSyncOptions(),
  ]);

  sendSuccess(res, {
    data: {
      dashboard,
      cases,
      orders,
      payments,
      options,
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

  if (payload.action === "delete") {
    if (!payload.caseId) {
      throw new ApiError(422, "caseId is required to delete a case from Google Sheets");
    }

    const existingCase = await getSyncableCaseById(payload.caseId);
    if (!existingCase) {
      throw new ApiError(404, "Case not found");
    }

    const deleted = await deleteCaseFromSheet(payload.caseId);
    if (!deleted) {
      throw new ApiError(404, "Case not found");
    }

    await deleteCaseFolder(payload.caseId);

    sendSuccess(res, {
      data: {
        deleted: true,
        caseId: payload.caseId,
        rowNumber: payload.rowNumber || null,
        sheetName: payload.sheetName || null,
      },
      message: "Case deleted from Google Sheets",
    });
    return;
  }

  if (!payload.caseId) {
    if (!payload.patientName) {
      throw new ApiError(422, "patientName is required to create a case from Google Sheets");
    }

    let status = payload.status ? await getCaseStatusByName(payload.status) : null;
    if (payload.status && !status) {
      throw new ApiError(422, "Selected case status does not exist");
    }

    if (!status) {
      status = await getDefaultSheetCaseStatus();
    }
    if (!status) {
      throw new ApiError(500, "No case statuses configured");
    }

    const clientId = payload.clientName ? await getSheetUserIdByLabel(payload.clientName, "user") : null;
    const projectLeaderId = payload.projectLeader
      ? await getSheetUserIdByLabel(payload.projectLeader, ["admin", "assistant"])
      : null;

    if (payload.clientName && !clientId) {
      throw new ApiError(422, "Selected client does not exist");
    }

    if (payload.projectLeader && !projectLeaderId) {
      throw new ApiError(422, "Selected project leader does not exist");
    }

    const createdBy = await getSheetCaseCreatorUserId();
    const createdCase = await createCaseFromSheet({
      patientName: payload.patientName,
      statusId: status.id,
      clientId,
      projectLeaderId,
      targetTime: payload.targetTime,
      staffNotes: payload.staffNotes,
      clientNotes: payload.clientNotes,
      startDate: payload.startDate,
      dueDate: payload.dueDate,
      createdBy,
    });

    sendSuccess(res, {
      data: {
        case: createdCase,
        created: true,
        rowNumber: payload.rowNumber || null,
        sheetName: payload.sheetName || null,
      },
      message: "Case created from Google Sheets",
      status: 201,
    });
    return;
  }

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

  let clientId;
  if (payload.clientName !== undefined) {
    clientId = payload.clientName ? await getSheetUserIdByLabel(payload.clientName, "user") : null;
    if (payload.clientName && !clientId) {
      throw new ApiError(422, "Selected client does not exist");
    }
  }

  let projectLeaderId;
  if (payload.projectLeader !== undefined) {
    projectLeaderId = payload.projectLeader
      ? await getSheetUserIdByLabel(payload.projectLeader, ["admin", "assistant"])
      : null;
    if (payload.projectLeader && !projectLeaderId) {
      throw new ApiError(422, "Selected project leader does not exist");
    }
  }

  const updatedCase = await updateCaseFromSheet({
    caseId: payload.caseId,
    patientName: payload.patientName,
    statusId,
    clientId,
    projectLeaderId,
    targetTime: payload.targetTime,
    staffNotes: payload.staffNotes,
    clientNotes: payload.clientNotes,
    startDate: payload.startDate,
    dueDate: payload.dueDate,
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
