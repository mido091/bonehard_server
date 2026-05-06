import { getDashboardAnalytics } from "../repositories/adminDashboard.repository.js";
import { getAssignableUsers } from "../repositories/user.repository.js";
import { listCaseFiles, listCaseGeneralNotes, listCustomFields } from "../repositories/caseExtra.repository.js";
import { getAdminUserOrderDetails, getCaseDetails } from "./case.service.js";

const CSV_MIME = "text/csv; charset=utf-8";

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
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB").format(date);
};

const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "";
  return `EGP ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0))}`;
};

const formatFileSize = (size) => {
  const value = Number(size || 0);
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeCell = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const escapeCsvCell = (value) => {
  let text = normalizeCell(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Prevent spreadsheet formula execution when exported values are opened.
  if (/^[=+\-@\t\n]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const toCsvRows = (headers, rows) => {
  const headerRow = headers.map((header) => escapeCsvCell(header.label)).join(",");
  const dataRows = rows.map((row) => headers
    .map((header) => escapeCsvCell(row[header.key]))
    .join(","));
  return [headerRow, ...dataRows];
};

const toSectionedCsv = (sections) => {
  const lines = [];

  sections.forEach((section, index) => {
    if (index > 0) lines.push("");
    lines.push(escapeCsvCell(section.title));
    lines.push(...toCsvRows(section.headers, section.rows || []));
  });

  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

const sendCsvFile = (res, packageName, sections) => {
  const safePackageName = sanitizeFileName(packageName, "csv-export");

  res.setHeader("Content-Type", CSV_MIME);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${safePackageName}.csv`)}`);
  res.send(toSectionedCsv(sections));
};

const pairRows = (record) => Object.entries(record).map(([field, value]) => ({ field, value }));

const customFieldRows = async (values = {}) => {
  const fields = await listCustomFields();
  const byKey = new Map(fields.map((field) => [field.fieldKey, field]));
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      key,
      label: byKey.get(key)?.label || key,
      value,
    }));
};

const keyValueHeaders = [
  { key: "field", label: "Field" },
  { key: "value", label: "Value" },
];

export const exportDashboardCsvPackage = async (userId, res) => {
  const data = await getDashboardAnalytics(userId);
  const summary = data.summary || {};
  const profit = summary.profit || {};
  const charts = data.charts || {};
  const lists = data.lists || {};

  sendCsvFile(res, `operations_dashboard_${new Date().toISOString().slice(0, 10)}`, [
    {
      title: "Summary",
      headers: keyValueHeaders,
      rows: pairRows({
        generatedAt: data.generatedAt,
        rangeDays: data.range?.days,
        totalUsers: summary.totalUsers,
        activeUsers: summary.activeUsers,
        clientUsers: summary.clientUsers,
        teamUsers: summary.teamUsers,
        totalCases: summary.totalCases,
        activeCases: summary.activeCases,
        newCases14d: summary.newCases14d,
        overdueCases: summary.overdueCases,
        totalOrders: summary.totalOrders,
        newOrders14d: summary.newOrders14d,
        totalTasks: summary.totalTasks,
        openTasks: summary.openTasks,
        urgentTasks: summary.urgentTasks,
        totalMessages: summary.totalMessages,
        unreadMessages: summary.unreadMessages,
        unreadNotifications: summary.unreadNotifications,
      }),
    },
    {
      title: "Profit",
      headers: keyValueHeaders,
      rows: pairRows({
        total: formatMoney(profit.total),
        month: formatMoney(profit.month),
        openValue: formatMoney(profit.openValue),
        cases: formatMoney(profit.cases),
        orders: formatMoney(profit.orders),
        chat: formatMoney(profit.chat),
        pendingChat: formatMoney(profit.pendingChat),
      }),
    },
    {
      title: "Case Status Distribution",
      headers: [
        { key: "statusName", label: "Status" },
        { key: "statusColor", label: "Color" },
        { key: "total", label: "Total" },
      ],
      rows: charts.casesByStatus || [],
    },
    {
      title: "Cases vs Orders Trend",
      headers: [
        { key: "date", label: "Date" },
        { key: "cases", label: "Cases" },
        { key: "orders", label: "User Orders" },
      ],
      rows: (charts.casesTrend || []).map((day, index) => ({
        date: formatDate(day.date),
        cases: day.total,
        orders: (charts.ordersTrend || [])[index]?.total || 0,
      })),
    },
    {
      title: "Recent Cases",
      headers: [
        { key: "id", label: "Case ID" },
        { key: "name", label: "Case Name" },
        { key: "statusName", label: "Status" },
        { key: "clientName", label: "Client" },
        { key: "projectLeaderName", label: "Project Leader" },
        { key: "dueDate", label: "Due Date" },
        { key: "progress", label: "Progress" },
        { key: "createdAt", label: "Created At" },
      ],
      rows: (lists.recentCases || []).map((row) => ({ ...row, dueDate: formatDate(row.dueDate), createdAt: formatDateTime(row.createdAt) })),
    },
    {
      title: "Latest Orders",
      headers: [
        { key: "id", label: "Order ID" },
        { key: "name", label: "Order Name" },
        { key: "userName", label: "User" },
        { key: "userEmail", label: "User Email" },
        { key: "contactPhone", label: "Contact Phone" },
        { key: "contactEmail", label: "Contact Email" },
        { key: "targetTime", label: "Target Time" },
        { key: "submittedDate", label: "Submitted Date" },
      ],
      rows: (lists.recentOrders || []).map((row) => ({ ...row, submittedDate: formatDate(row.submittedDate) })),
    },
    {
      title: "Recent Messages",
      headers: [
        { key: "id", label: "Message ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "subject", label: "Subject" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created At" },
      ],
      rows: (lists.recentMessages || []).map((row) => ({ ...row, createdAt: formatDateTime(row.createdAt) })),
    },
    {
      title: "Recent Users",
      headers: [
        { key: "id", label: "User ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
        { key: "isActive", label: "Active" },
        { key: "createdAt", label: "Created At" },
      ],
      rows: (lists.recentUsers || []).map((row) => ({ ...row, createdAt: formatDateTime(row.createdAt) })),
    },
    {
      title: "Team Workload",
      headers: [
        { key: "type", label: "Type" },
        { key: "id", label: "User ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "activeCases", label: "Active Cases" },
        { key: "openTasks", label: "Open Tasks" },
        { key: "urgentTasks", label: "Urgent Tasks" },
        { key: "overdueTasks", label: "Overdue Tasks" },
      ],
      rows: [
        ...(charts.workload?.leaders || []).map((row) => ({ ...row, type: "Project Leader" })),
        ...(charts.workload?.assignees || []).map((row) => ({ ...row, type: "Task Assignee" })),
      ],
    },
  ]);
};

export const exportCaseCsvPackage = async (caseId, res) => {
  const item = await getCaseDetails(caseId);
  const [filesResult, notesResult, fields, users] = await Promise.all([
    listCaseFiles(caseId, { page: 1, perPage: 500 }),
    listCaseGeneralNotes(caseId, { page: 1, perPage: 500 }),
    customFieldRows(item.customFieldValues),
    getAssignableUsers(),
  ]);

  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const teamMembers = (item.teamMemberIds || [])
    .map((id) => userById.get(Number(id)))
    .filter(Boolean);

  sendCsvFile(res, item.name, [
    {
      title: "Case Details",
      headers: keyValueHeaders,
      rows: pairRows({
        id: item.id,
        name: item.name,
        status: item.statusName || "New",
        progress: `${Number(item.progressPercentage || 0)}%`,
        client: item.targetName,
        secondaryClient: item.secondaryClientName,
        projectLeader: item.projectLeaderName,
        startDate: formatDate(item.startDate),
        estimatedCompletion: formatDate(item.estimatedCompletionDate),
        targetTime: item.targetTime,
        price: formatMoney(item.price),
        customUid: item.customUid,
        projectNotes: stripHtml(item.clientDescription),
        internalDescription: stripHtml(item.description),
      }),
    },
    {
      title: "Custom Fields",
      headers: [
        { key: "key", label: "Key" },
        { key: "label", label: "Label" },
        { key: "value", label: "Value" },
      ],
      rows: fields,
    },
    {
      title: "Attached Files",
      headers: [
        { key: "id", label: "File ID" },
        { key: "fileName", label: "File Name" },
        { key: "mimeType", label: "MIME Type" },
        { key: "size", label: "Size" },
        { key: "createdAt", label: "Uploaded At" },
      ],
      rows: filesResult.rows.map((file) => ({ ...file, size: formatFileSize(file.fileSize), createdAt: formatDateTime(file.createdAt) })),
    },
    {
      title: "Team Members",
      headers: [
        { key: "id", label: "User ID" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "role", label: "Role" },
      ],
      rows: teamMembers,
    },
    {
      title: "Team Notes",
      headers: [
        { key: "id", label: "Note ID" },
        { key: "createdByName", label: "Author" },
        { key: "createdByEmail", label: "Author Email" },
        { key: "createdByRole", label: "Author Role" },
        { key: "content", label: "Content" },
        { key: "createdAt", label: "Created At" },
      ],
      rows: notesResult.rows.map((note) => ({ ...note, content: stripHtml(note.content), createdAt: formatDateTime(note.createdAt) })),
    },
  ]);
};

export const exportAdminUserOrderCsvPackage = async (orderId, res) => {
  const order = await getAdminUserOrderDetails(orderId);
  const [notesResult, fields] = await Promise.all([
    listCaseGeneralNotes(orderId, { page: 1, perPage: 500 }),
    customFieldRows(order.customFieldValues),
  ]);

  sendCsvFile(res, order.name, [
    {
      title: "Order Details",
      headers: keyValueHeaders,
      rows: pairRows({
        id: order.id,
        name: order.name,
        user: order.createdByName || order.targetName,
        userEmail: order.createdByEmail,
        phone: order.contactPhone,
        email: order.contactEmail,
        submittedDate: formatDate(order.startDate || order.createdAt),
        targetTime: order.targetTime,
        projectNotes: stripHtml(order.clientDescription),
      }),
    },
    {
      title: "Custom Fields",
      headers: [
        { key: "key", label: "Key" },
        { key: "label", label: "Label" },
        { key: "value", label: "Value" },
      ],
      rows: fields,
    },
    {
      title: "Attached Files",
      headers: [
        { key: "id", label: "File ID" },
        { key: "fileName", label: "File Name" },
        { key: "mimeType", label: "MIME Type" },
        { key: "size", label: "Size" },
        { key: "createdAt", label: "Uploaded At" },
      ],
      rows: (order.files || []).map((file) => ({ ...file, size: formatFileSize(file.fileSize), createdAt: formatDateTime(file.createdAt) })),
    },
    {
      title: "Team Notes",
      headers: [
        { key: "id", label: "Note ID" },
        { key: "createdByName", label: "Author" },
        { key: "createdByEmail", label: "Author Email" },
        { key: "createdByRole", label: "Author Role" },
        { key: "content", label: "Content" },
        { key: "createdAt", label: "Created At" },
      ],
      rows: notesResult.rows.map((note) => ({ ...note, content: stripHtml(note.content), createdAt: formatDateTime(note.createdAt) })),
    },
  ]);
};
