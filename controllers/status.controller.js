import { createCaseStatus, deleteCaseStatus, listCaseStatuses, updateCaseStatus } from "../repositories/status.repository.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const listStatuses = async (_req, res) => {
  const statuses = await listCaseStatuses();
  sendSuccess(res, { data: statuses });
};

export const createStatus = async (req, res) => {
  const { name, color, sortOrder } = req.validatedBody || req.body;
  const status = await createCaseStatus({ name, color, sortOrder });
  sendSuccess(res, { data: status, status: 201 });
};

export const updateStatus = async (req, res) => {
  await updateCaseStatus(req.params.id, req.validatedBody || req.body);
  sendSuccess(res, { message: "Status updated" });
};

export const deleteStatus = async (req, res) => {
  await deleteCaseStatus(req.params.id);
  sendSuccess(res, { message: "Status deleted" });
};
