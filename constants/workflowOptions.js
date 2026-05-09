export const IMPLANT_SYSTEM_OPTIONS = [
  "AB Dent",
  "Adin",
  "Alpha Dent",
  "Bicon",
  "Biohorizons",
  "Blue Sky Bio",
  "Bredent",
  "Camlog",
  "Dentis",
  "Dentsply",
  "Glidewell (Hahn)",
  "Hahn",
  "Hiossen",
  "Hi-Tech",
  "Implant Direct",
  "Izen",
  "Jdental",
  "Megagen",
  "MIS",
  "Neo-Biotech",
  "Neodent",
  "Nobel BioCare",
  "Noris",
  "NucleOSS",
  "Osstem",
  "Ritter",
  "Straumann",
  "Surgikor",
  "ZimVie",
  "Other",
];

export const SERVICES_NEEDED_OPTIONS = [
  "Tooth supported Surgical Guide",
  "Bone supported Surgical Guide",
  "Tissue supported Surgical Guide",
  "Stackable Guide only",
  "Stackable Guide with immediate PMMA",
  "PMMA Temps",
  "Prosthetic Finals",
  "Crowns over implants",
  "Gingivectomy guide",
  "Other",
];

export const CASE_STATUS_OPTIONS = [
  { name: "Order Received", color: "#60a5fa", sortOrder: 10, progress: 5, isDefault: 1 },
  { name: "Planning", color: "#38bdf8", sortOrder: 20, progress: 10, isDefault: 0 },
  { name: "Wax-up Design", color: "#818cf8", sortOrder: 30, progress: 15, isDefault: 0 },
  { name: "Waiting on Model or STL", color: "#f59e0b", sortOrder: 40, progress: 20, isDefault: 0 },
  { name: "New CBCT Needed", color: "#fb923c", sortOrder: 50, progress: 20, isDefault: 0 },
  { name: "Case on Hold", color: "#f97316", sortOrder: 60, progress: 20, isDefault: 0 },
  { name: "Planning Completed (Needs Scheduling)", color: "#a78bfa", sortOrder: 70, progress: 35, isDefault: 0 },
  { name: "Pending Dr's Approval (Video Sent)", color: "#c084fc", sortOrder: 80, progress: 40, isDefault: 0 },
  { name: "Review Scheduled", color: "#d946ef", sortOrder: 90, progress: 45, isDefault: 0 },
  { name: "Case Approved QC and Paperwork", color: "#14b8a6", sortOrder: 100, progress: 55, isDefault: 0 },
  { name: "Surgical Guide Design", color: "#06b6d4", sortOrder: 110, progress: 60, isDefault: 0 },
  { name: "Guide Printing", color: "#0ea5e9", sortOrder: 120, progress: 70, isDefault: 0 },
  { name: "Finishing and Preparing for shipping", color: "#22c55e", sortOrder: 130, progress: 80, isDefault: 0 },
  { name: "STL Shared with Dr", color: "#4ade80", sortOrder: 140, progress: 85, isDefault: 0 },
  { name: "Case Shipped", color: "#84cc16", sortOrder: 150, progress: 90, isDefault: 0 },
  { name: "Invoice Sent", color: "#eab308", sortOrder: 160, progress: 95, isDefault: 0 },
  { name: "Billed", color: "#facc15", sortOrder: 170, progress: 98, isDefault: 0 },
  { name: "Completed", color: "#22c55e", sortOrder: 180, progress: 100, isDefault: 0 },
  { name: "Order Canceled", color: "#ef4444", sortOrder: 190, progress: 0, isDefault: 0 },
];

export const CASE_STATUS_PROGRESS_MAP = Object.fromEntries(
  CASE_STATUS_OPTIONS.map((status) => [status.name, status.progress]),
);

export const CASE_STATUS_NAMES = CASE_STATUS_OPTIONS.map((status) => status.name);

export const DEFAULT_CASE_STATUS_NAME = "Order Received";
