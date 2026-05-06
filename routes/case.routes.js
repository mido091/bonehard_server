import { Router } from "express";
import { z } from "zod";
import {
  allTasks,
  applyTemplate,
  clone,
  create,
  createWithFiles,
  createTask,
  detail,
  exportCsv,
  exportPackage,
  list,
  listTasks,
  myTasks,
  remove,
  removeTask,
  update,
  updateWithFiles,
  updateStatus,
  updateTask,
} from "../controllers/case.controller.js";
import {
  archive,
  convertOrderToCase,
  createGeneratorRecord,
  createCustomFieldRecord,
  createFile,
  downloadFile,
  createGeneralNote,
  createNotesExport,
  createNote,
  createOrderRecord,
  createProductRecord,
  createPhase,
  createSectorRecord,
  createTemplateRecord,
  createTimer,
  deleteCustomFieldRecord,
  deletePhase,
  files,
  generalNotes,
  generators,
  globalTimers,
  globalNotesExports,
  notes,
  notesExports,
  orders,
  phases,
  products,
  removeProductRecord,
  removeSectorRecord,
  removeTemplate,
  removeTemplateTask,
  addTemplateTask,
  editTemplateTask,
  templateTasks,
  saveSystemSettings,
  settings,
  sectors,
  startTimer,
  stopTimer,
  templates,
  timers,
  updatePhase,
  updateOrderRecord,
  uploadFiles,
  removeFile,
  removeOrderRecord,
} from "../controllers/caseExtra.controller.js";

import { caseClientTalk, sendCaseClientTalk } from "../controllers/chat.controller.js";
import { requireAdminOnly, requireAdminOrAssistant, requireAuth } from "../middlewares/auth.middleware.js";
import { handleCaseFileUpload } from "../middlewares/caseFileUpload.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createCaseRecord } from "../services/case.service.js";
import { asyncHandler } from "../utils/apiResponse.js";
import { caseListQuerySchema, casePayloadSchema, idParamSchema, statusPayloadSchema } from "../validators/case.validator.js";
import {
  clientTalkPayloadSchema,
  customFieldParamSchema,
  customFieldPayloadSchema,
  exportPayloadSchema,
  filePayloadSchema,
  generalNotePayloadSchema,
  generatorPayloadSchema,
  listQuerySchema,
  notePayloadSchema,
  orderPayloadSchema,
  phaseParamSchema,
  phasePayloadSchema,
  phaseUpdatePayloadSchema,
  productPayloadSchema,
  resourceIdParamSchema,
  sectorPayloadSchema,
  systemSettingsPayloadSchema,
  templatePayloadSchema,
  templateApplyParamSchema,
  timerParamSchema,
  timerPayloadSchema,
} from "../validators/caseExtra.validator.js";
import { caseTaskParamSchema, taskListQuerySchema, taskPayloadSchema, taskUpdatePayloadSchema } from "../validators/task.validator.js";

const router = Router();

router.use(requireAuth, requireAdminOrAssistant);

router.get("/tasks/my", validate(taskListQuerySchema, "query"), asyncHandler(myTasks));
router.get("/tasks/all", validate(taskListQuerySchema, "query"), asyncHandler(allTasks));
router.get("/archive", validate(caseListQuerySchema, "query"), asyncHandler(archive));
router.get("/timers", validate(listQuerySchema, "query"), asyncHandler(globalTimers));
router.get("/notes-export", validate(listQuerySchema, "query"), asyncHandler(globalNotesExports));
router.get("/generators", asyncHandler(generators));
router.post("/generators", validate(generatorPayloadSchema), asyncHandler(createGeneratorRecord));
router.get("/orders", validate(listQuerySchema, "query"), asyncHandler(orders));
router.post("/orders", validate(orderPayloadSchema), asyncHandler(createOrderRecord));
router.patch("/orders/:orderId", validate(z.object({ orderId: z.coerce.number().int().positive() }), "params"), validate(orderPayloadSchema), asyncHandler(updateOrderRecord));
router.delete("/orders/:orderId", validate(z.object({ orderId: z.coerce.number().int().positive() }), "params"), asyncHandler(removeOrderRecord));
router.post("/orders/:orderId/convert", validate(z.object({ orderId: z.coerce.number().int().positive() }), "params"), asyncHandler(convertOrderToCase));
router.get("/templates", validate(listQuerySchema, "query"), asyncHandler(templates));
router.post("/templates", validate(templatePayloadSchema), asyncHandler(createTemplateRecord));
router.delete("/templates/:templateId", validate(z.object({ templateId: z.coerce.number().int().positive() }), "params"), asyncHandler(removeTemplate));

// Template task body schemas (inline — small enough to not warrant a separate validator file)
const templateTaskBodySchema = z.object({
  title: z.string().trim().min(2).max(190),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(["low", "normal", "medium", "high", "urgent"]).optional().default("normal"),
  status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).optional().default("open"),
  phaseName: z.string().trim().max(160).optional().nullable(),
  privateTask: z.coerce.boolean().optional().default(false),
  estimatedMinutes: z.coerce.number().int().min(0).max(5256000).optional().nullable().or(z.literal("")),
  taskType: z.enum(["to-do", "milestone"]).optional().default("to-do"),
  startOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
  dueOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});
const templateTaskUpdateSchema = z.object({
  title: z.string().trim().min(2).max(190).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: z.enum(["low", "normal", "medium", "high", "urgent"]).optional(),
  status: z.enum(["open", "assigned", "to-do", "in-progress", "completed"]).optional(),
  phaseName: z.string().trim().max(160).optional().nullable(),
  privateTask: z.coerce.boolean().optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(5256000).optional().nullable().or(z.literal("")),
  taskType: z.enum(["to-do", "milestone"]).optional(),
  startOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
  dueOffsetDays: z.coerce.number().int().min(-3650).max(3650).optional().nullable().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field required" },
);

router.get("/templates/:templateId/tasks", validate(z.object({ templateId: z.coerce.number().int().positive() }), "params"), asyncHandler(templateTasks));
router.post("/templates/:templateId/tasks", validate(z.object({ templateId: z.coerce.number().int().positive() }), "params"), validate(templateTaskBodySchema), asyncHandler(addTemplateTask));
router.patch("/templates/:templateId/tasks/:taskId", validate(z.object({ templateId: z.coerce.number().int().positive(), taskId: z.coerce.number().int().positive() }), "params"), validate(templateTaskUpdateSchema), asyncHandler(editTemplateTask));
router.delete("/templates/:templateId/tasks/:taskId", validate(z.object({ templateId: z.coerce.number().int().positive(), taskId: z.coerce.number().int().positive() }), "params"), asyncHandler(removeTemplateTask));

router.get("/settings", requireAdminOnly, asyncHandler(settings));
router.post("/settings", requireAdminOnly, validate(systemSettingsPayloadSchema), asyncHandler(saveSystemSettings));
router.post("/settings/custom-fields", requireAdminOnly, validate(customFieldPayloadSchema), asyncHandler(createCustomFieldRecord));
router.get("/settings/products", requireAdminOnly, asyncHandler(products));
router.post("/settings/products", requireAdminOnly, validate(productPayloadSchema), asyncHandler(createProductRecord));
router.delete("/settings/products/:id", requireAdminOnly, validate(resourceIdParamSchema, "params"), asyncHandler(removeProductRecord));
router.get("/settings/sectors", requireAdminOnly, asyncHandler(sectors));
router.post("/settings/sectors", requireAdminOnly, validate(sectorPayloadSchema), asyncHandler(createSectorRecord));
router.delete("/settings/sectors/:id", requireAdminOnly, validate(resourceIdParamSchema, "params"), asyncHandler(removeSectorRecord));

router.post("/with-files", uploadLimiter, handleCaseFileUpload, asyncHandler(createWithFiles));
router.get("/", validate(caseListQuerySchema, "query"), asyncHandler(list));
router.post("/", validate(casePayloadSchema), asyncHandler(create));
router.get("/:id/export-package", validate(idParamSchema, "params"), asyncHandler(exportPackage));
router.get("/:id/export-csv", validate(idParamSchema, "params"), asyncHandler(exportCsv));
router.get("/:id", validate(idParamSchema, "params"), asyncHandler(detail));
router.patch("/:id/with-files", validate(idParamSchema, "params"), uploadLimiter, handleCaseFileUpload, asyncHandler(updateWithFiles));
router.patch("/:id", validate(idParamSchema, "params"), validate(casePayloadSchema), asyncHandler(update));
router.delete("/:id", validate(idParamSchema, "params"), asyncHandler(remove));
router.post("/:id/clone", validate(idParamSchema, "params"), asyncHandler(clone));
router.patch("/:id/status", validate(idParamSchema, "params"), validate(statusPayloadSchema), asyncHandler(updateStatus));
router.post("/:id/templates/:templateId/apply", validate(templateApplyParamSchema, "params"), asyncHandler(applyTemplate));

router.get("/:id/tasks", validate(idParamSchema, "params"), validate(taskListQuerySchema, "query"), asyncHandler(listTasks));
router.post("/:id/tasks", validate(idParamSchema, "params"), validate(taskPayloadSchema), asyncHandler(createTask));
router.patch("/:id/tasks/:taskId", validate(caseTaskParamSchema, "params"), validate(taskUpdatePayloadSchema), asyncHandler(updateTask));
router.delete("/:id/tasks/:taskId", validate(caseTaskParamSchema, "params"), asyncHandler(removeTask));

router.get("/:id/timers", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(timers));
router.post("/:id/timers", validate(idParamSchema, "params"), validate(timerPayloadSchema), asyncHandler(createTimer));
router.patch("/:id/timers/:timerId/start", validate(timerParamSchema, "params"), asyncHandler(startTimer));
router.patch("/:id/timers/:timerId/stop", validate(timerParamSchema, "params"), asyncHandler(stopTimer));
router.get("/:id/files", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(files));
router.post("/:id/files", validate(idParamSchema, "params"), validate(filePayloadSchema), asyncHandler(createFile));
router.post("/:id/files/upload", validate(idParamSchema, "params"), uploadLimiter, handleCaseFileUpload, asyncHandler(uploadFiles));
router.get("/:id/files/:fileId/download", validate(z.object({ id: z.coerce.number().int().positive(), fileId: z.coerce.number().int().positive() }), "params"), asyncHandler(downloadFile));
router.delete("/:id/files/:fileId", validate(z.object({ id: z.coerce.number().int().positive(), fileId: z.coerce.number().int().positive() }), "params"), asyncHandler(removeFile));
router.get("/:id/notes", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(notes));
router.post("/:id/notes", validate(idParamSchema, "params"), validate(notePayloadSchema), asyncHandler(createNote));
router.get("/:id/general-notes", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(generalNotes));
router.post("/:id/general-notes", validate(idParamSchema, "params"), validate(generalNotePayloadSchema), asyncHandler(createGeneralNote));
router.get("/:id/notes-export", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(notesExports));
router.post("/:id/notes-export", validate(idParamSchema, "params"), validate(exportPayloadSchema), asyncHandler(createNotesExport));
router.get("/:id/client-talk", validate(idParamSchema, "params"), validate(listQuerySchema, "query"), asyncHandler(caseClientTalk));
router.post("/:id/client-talk", validate(idParamSchema, "params"), validate(clientTalkPayloadSchema), asyncHandler(sendCaseClientTalk));

router.get("/:id/phases", validate(idParamSchema, "params"), asyncHandler(phases));
router.post("/:id/phases", validate(idParamSchema, "params"), validate(phasePayloadSchema), asyncHandler(createPhase));
router.patch("/:id/phases/:phaseId", validate(phaseParamSchema, "params"), validate(phaseUpdatePayloadSchema), asyncHandler(updatePhase));
router.delete("/:id/phases/:phaseId", validate(phaseParamSchema, "params"), asyncHandler(deletePhase));

router.delete("/settings/custom-fields/:fieldId", requireAdminOnly, validate(customFieldParamSchema, "params"), asyncHandler(deleteCustomFieldRecord));

export default router;
