import archiver from "archiver";
import PDFDocument from "pdfkit";
import { Readable } from "node:stream";
import { getAssignableUsers } from "../repositories/user.repository.js";
import { listCaseFiles, listCaseGeneralNotes, listCustomFields } from "../repositories/caseExtra.repository.js";
import { getAdminUserOrderDetails, getCaseDetails, getUserOrderDetails } from "./case.service.js";

const ZIP_MIME = "application/zip";

const sanitizeFileName = (value, fallback = "export") => {
  const cleaned = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return (cleaned || fallback).slice(0, 120);
};

const stripHtml = (value) => String(value || "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/p>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const formatDate = (value) => {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat("en-GB").format(date);
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "Not provided";
  return `EGP ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value))}`;
};

const formatFileSize = (size) => {
  const value = Number(size || 0);
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const safeValue = (value) => {
  if (value === null || value === undefined || value === "") return "Not provided";
  return String(value);
};

const buildCustomFieldRows = async (values = {}) => {
  const fields = await listCustomFields();
  const byKey = new Map(fields.map((field) => [field.fieldKey, field]));
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      label: byKey.get(key)?.label || key,
      value: String(value),
    }));
};

const palette = {
  ink: "#111111",
  panel: "#FBFAF7",
  line: "#E8DED0",
  muted: "#6F6A63",
  accent: "#D7B98A",
  accentDark: "#9A7748",
  text: "#1F2933",
};

const pageWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

const ensureSpace = (doc, height = 80) => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 12) {
    doc.addPage();
  }
};

const addBrandHeader = (doc, title, subtitle) => {
  const margin = doc.page.margins.left;
  const width = pageWidth(doc);
  const top = 34;

  doc.save();
  doc.roundedRect(margin, top, width, 88, 10).fill(palette.ink);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11).text("BONEHARD", margin + 18, top + 16);
  doc.fillColor(palette.accent).fontSize(7.5).text("EXPORT PACKAGE", margin + 18, top + 31, { characterSpacing: 1.1 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text(title, margin + 18, top + 50, {
    width: width - 190,
    lineGap: 1,
  });
  doc.fillColor("#D8D2C8").font("Helvetica").fontSize(9.5).text(subtitle, margin + 18, top + 72, { width: width - 36 });

  doc.roundedRect(margin + width - 150, top + 16, 128, 26, 13).fill("#2A2723");
  doc.fillColor(palette.accent).font("Helvetica-Bold").fontSize(7).text("GENERATED", margin + width - 134, top + 23);
  doc.fillColor("#FFFFFF").font("Helvetica").fontSize(7.5).text(new Date().toLocaleString("en-GB"), margin + width - 134, top + 32);
  doc.restore();

  doc.y = top + 108;
};

const addSectionTitle = (doc, title) => {
  ensureSpace(doc, 34);
  const margin = doc.page.margins.left;
  doc.moveDown(0.35);
  doc.fillColor(palette.accentDark).font("Helvetica-Bold").fontSize(8).text(title.toUpperCase(), margin, doc.y, {
    characterSpacing: 1.1,
  });
  doc.moveTo(margin, doc.y + 5).lineTo(doc.page.width - doc.page.margins.right, doc.y + 5).strokeColor(palette.line).lineWidth(1).stroke();
  doc.moveDown(0.9);
};

const addEmptyPanel = (doc, text) => {
  ensureSpace(doc, 30);
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = pageWidth(doc);
  doc.roundedRect(x, y, width, 26, 6).fill(palette.panel).strokeColor(palette.line).stroke();
  doc.fillColor(palette.muted).font("Helvetica").fontSize(9).text(text, x + 12, y + 8, { width: width - 24 });
  doc.y = y + 34;
};

const addRows = (doc, rows, emptyText = "No data.") => {
  if (!rows?.length) {
    addEmptyPanel(doc, emptyText);
    return;
  }

  const gap = 12;
  const columns = 2;
  const cardWidth = (pageWidth(doc) - gap) / columns;
  const cardHeight = 42;
  let column = 0;
  let rowTop = doc.y;

  rows.forEach(({ label, value }) => {
    if (column === 0) ensureSpace(doc, cardHeight + 14);

    const x = doc.page.margins.left + column * (cardWidth + gap);
    const y = rowTop;
    doc.roundedRect(x, y, cardWidth, cardHeight, 6).fill(palette.panel).strokeColor(palette.line).lineWidth(0.6).stroke();
    doc.fillColor(palette.muted).font("Helvetica-Bold").fontSize(7).text(String(label || "Field").toUpperCase(), x + 10, y + 8, {
      width: cardWidth - 24,
      characterSpacing: 0.4,
    });
    doc.fillColor(palette.text).font("Helvetica").fontSize(9.5).text(safeValue(value), x + 10, y + 20, {
      width: cardWidth - 20,
      height: 17,
      ellipsis: true,
    });

    column += 1;
    if (column >= columns) {
      column = 0;
      rowTop += cardHeight + gap;
      doc.y = rowTop;
    }
  });

  if (column !== 0) {
    doc.y = rowTop + cardHeight + gap;
  }
};

const addTextPanel = (doc, content, emptyText = "Not provided") => {
  const text = content || emptyText;
  const x = doc.page.margins.left;
  const width = pageWidth(doc);
  const textHeight = doc.heightOfString(text, { width: width - 24, lineGap: 1.5 });
  const height = Math.max(36, textHeight + 22);
  ensureSpace(doc, Math.min(height, 150));

  const y = doc.y;
  doc.roundedRect(x, y, width, height, 6).fill(palette.panel).strokeColor(palette.line).lineWidth(0.6).stroke();
  doc.fillColor(content ? palette.text : palette.muted).font("Helvetica").fontSize(9.5).text(text, x + 12, y + 11, {
    width: width - 24,
    lineGap: 1.5,
  });
  doc.y = y + height + 8;
};

const addListRows = (doc, rows, emptyText) => {
  if (!rows?.length) {
    addEmptyPanel(doc, emptyText);
    return;
  }

  rows.forEach(({ label, value }) => {
    ensureSpace(doc, 36);
    const x = doc.page.margins.left;
    const y = doc.y;
    const width = pageWidth(doc);
    doc.roundedRect(x, y, width, 32, 6).fill(palette.panel).strokeColor(palette.line).lineWidth(0.6).stroke();
    doc.fillColor(palette.text).font("Helvetica-Bold").fontSize(9).text(safeValue(label), x + 12, y + 7, { width: width - 24 });
    doc.fillColor(palette.muted).font("Helvetica").fontSize(8).text(safeValue(value), x + 12, y + 20, { width: width - 24 });
    doc.y = y + 40;
  });
};

const addNotes = (doc, notes) => {
  if (!notes?.length) {
    addEmptyPanel(doc, "No team notes.");
    return;
  }

  notes.forEach((note, index) => {
    const author = [note.createdByName || "Team member", note.createdByEmail, note.createdByRole].filter(Boolean).join(" / ");
    const content = stripHtml(note.content) || "No content";
    const width = pageWidth(doc);
    const contentHeight = doc.heightOfString(content, { width: width - 24, lineGap: 1.5 });
    const height = Math.max(58, contentHeight + 46);
    ensureSpace(doc, Math.min(height, 150));

    const x = doc.page.margins.left;
    const y = doc.y;
    doc.roundedRect(x, y, width, height, 6).fill(palette.panel).strokeColor(palette.line).lineWidth(0.6).stroke();
    doc.fillColor(palette.accentDark).font("Helvetica-Bold").fontSize(7.5).text(`NOTE ${index + 1}`, x + 12, y + 9);
    doc.fillColor(palette.text).font("Helvetica-Bold").fontSize(9).text(author, x + 12, y + 21, { width: width - 24 });
    doc.fillColor(palette.muted).font("Helvetica").fontSize(7.8).text(formatDate(note.createdAt), x + 12, y + 34);
    doc.fillColor(palette.text).font("Helvetica").fontSize(9).text(content, x + 12, y + 46, {
      width: width - 24,
      lineGap: 1.5,
    });
    doc.y = y + height + 8;
  });
};

const generatePdfBuffer = ({ title, subtitle, sections }) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: false });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);

  addBrandHeader(doc, title, subtitle);

  sections.forEach((section) => {
    addSectionTitle(doc, section.title);
    if (section.type === "notes") {
      addNotes(doc, section.notes);
    } else if (section.type === "text") {
      addTextPanel(doc, section.content, section.emptyText || "Not provided");
    } else if (section.type === "list") {
      addListRows(doc, section.rows, section.emptyText || "No data.");
    } else {
      addRows(doc, section.rows, section.emptyText || "No data.");
    }
  });

  doc.end();
});

const getAttachmentUrl = (file) => {
  let url = file.fileUrl || file.cloudinarySecureUrl;
  if (url && file.storageProvider === "supabase" && !url.includes("?download=")) {
    url += `?download=${encodeURIComponent(file.fileName || "attachment")}`;
  }
  return url;
};

const appendAttachment = async (archive, file, usedNames) => {
  const baseName = sanitizeFileName(file.fileName, `attachment-${file.id || Date.now()}`);
  const name = usedNames.has(baseName) ? `${file.id || usedNames.size + 1}-${baseName}` : baseName;
  usedNames.add(name);
  const archivePath = `attachments/${name}`;
  const url = getAttachmentUrl(file);

  if (!url || !/^https?:\/\//i.test(url)) {
    archive.append(`Attachment could not be included: ${file.fileName || "unknown"}\nMissing downloadable URL.`, {
      name: `${archivePath}.download-error.txt`,
    });
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    archive.append(Readable.fromWeb(response.body), { name: archivePath });
  } catch (error) {
    archive.append(`Attachment could not be included: ${file.fileName || "unknown"}\n${error.message}`, {
      name: `${archivePath}.download-error.txt`,
    });
  }
};

const sendZipPackage = async (res, packageName, pdfBuffer, files = []) => {
  const safePackageName = sanitizeFileName(packageName, "export-package");
  const archive = archiver("zip", { zlib: { level: 9 } });

  res.setHeader("Content-Type", ZIP_MIME);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${safePackageName}.zip`)}`);

  archive.on("error", (error) => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy(error);
  });

  archive.pipe(res);
  archive.append(pdfBuffer, { name: `${safePackageName}.pdf` });

  const usedNames = new Set();
  for (const file of files || []) {
    await appendAttachment(archive, file, usedNames);
  }

  await archive.finalize();
};

export const exportCasePackage = async (caseId, res) => {
  const item = await getCaseDetails(caseId);
  const [filesResult, notesResult, customFieldRows, users] = await Promise.all([
    listCaseFiles(caseId, { page: 1, perPage: 500 }),
    listCaseGeneralNotes(caseId, { page: 1, perPage: 500 }),
    buildCustomFieldRows(item.customFieldValues),
    getAssignableUsers(),
  ]);

  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const teamMembers = (item.teamMemberIds || [])
    .map((id) => userById.get(Number(id)))
    .filter(Boolean)
    .map((user) => `${user.name} (${user.email || user.role || "team"})`);

  const pdfBuffer = await generatePdfBuffer({
    title: item.name,
    subtitle: `Case #${item.id}`,
    sections: [
      {
        title: "Case Summary",
        rows: [
          { label: "Status", value: item.statusName || "New" },
          { label: "Progress", value: `${Number(item.progressPercentage || 0)}%` },
          { label: "Client", value: item.targetName },
          { label: "Secondary Client", value: item.secondaryClientName },
          { label: "Project Leader", value: item.projectLeaderName },
          { label: "Start Date", value: formatDate(item.startDate) },
          { label: "Estimated Completion", value: formatDate(item.estimatedCompletionDate) },
          { label: "Target Time", value: item.targetTime },
          { label: "Price", value: formatMoney(item.price) },
          { label: "Custom UID", value: item.customUid },
          { label: "Team Members", value: teamMembers.join(", ") || "Not provided" },
        ],
      },
      { title: "Project Notes", type: "text", content: stripHtml(item.clientDescription || item.description) },
      { title: "Internal Description", type: "text", content: stripHtml(item.description) },
      { title: "Custom Fields", rows: customFieldRows, emptyText: "No custom fields." },
      {
        title: "Attached Files",
        type: "list",
        rows: filesResult.rows.map((file) => ({
          label: file.fileName,
          value: `${file.mimeType || "file"} / ${formatFileSize(file.fileSize)} / ${formatDate(file.createdAt)}`,
        })),
        emptyText: "No attached files.",
      },
      { title: "Team Notes", type: "notes", notes: notesResult.rows },
    ],
  });

  await sendZipPackage(res, item.name, pdfBuffer, filesResult.rows);
};

export const exportAdminUserOrderPackage = async (orderId, res) => {
  const order = await getAdminUserOrderDetails(orderId);
  const [notesResult, customFieldRows] = await Promise.all([
    listCaseGeneralNotes(orderId, { page: 1, perPage: 500 }),
    buildCustomFieldRows(order.customFieldValues),
  ]);

  const pdfBuffer = await generatePdfBuffer({
    title: order.name,
    subtitle: `User Order #${order.id}`,
    sections: [
      {
        title: "Order Summary",
        rows: [
          { label: "User", value: `${order.createdByName || order.targetName || "Not provided"} (${order.createdByEmail || "no email"})` },
          { label: "Phone", value: order.contactPhone },
          { label: "Email", value: order.contactEmail },
          { label: "Submitted Date", value: formatDate(order.startDate || order.createdAt) },
          { label: "Target Time", value: order.targetTime },
        ],
      },
      { title: "Project Notes", type: "text", content: stripHtml(order.clientDescription) },
      { title: "Custom Fields", rows: customFieldRows, emptyText: "No custom fields." },
      {
        title: "Attached Files",
        type: "list",
        rows: (order.files || []).map((file) => ({
          label: file.fileName,
          value: `${file.mimeType || "file"} / ${formatFileSize(file.fileSize)} / ${formatDate(file.createdAt)}`,
        })),
        emptyText: "No attached files.",
      },
      { title: "Team Notes", type: "notes", notes: notesResult.rows },
    ],
  });

  await sendZipPackage(res, order.name, pdfBuffer, order.files || []);
};

export const exportUserOrderPackage = async (orderId, userId, res) => {
  const order = await getUserOrderDetails(orderId, userId);
  const customFieldRows = await buildCustomFieldRows(order.customFieldValues);

  const pdfBuffer = await generatePdfBuffer({
    title: order.name,
    subtitle: `Order #${order.id}`,
    sections: [
      {
        title: "Order Summary",
        rows: [
          { label: "Phone", value: order.contactPhone },
          { label: "Email", value: order.contactEmail },
          { label: "Submitted Date", value: formatDate(order.startDate || order.createdAt) },
          { label: "Target Time", value: order.targetTime },
        ],
      },
      { title: "Project Notes", type: "text", content: stripHtml(order.clientDescription) },
      { title: "Custom Fields", rows: customFieldRows, emptyText: "No custom fields." },
      {
        title: "Attached Files",
        type: "list",
        rows: (order.files || []).map((file) => ({
          label: file.fileName,
          value: `${file.mimeType || "file"} / ${formatFileSize(file.fileSize)} / ${formatDate(file.createdAt)}`,
        })),
        emptyText: "No attached files.",
      },
    ],
  });

  await sendZipPackage(res, order.name, pdfBuffer, order.files || []);
};
