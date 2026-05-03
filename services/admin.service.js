import { countCaseStats } from "../repositories/case.repository.js";
import { getAnalytics } from "../repositories/adminDashboard.repository.js";
import { countUsersByRole } from "../repositories/user.repository.js";

export const getAdminStats = async () => {
  const [caseStats, roles, analytics] = await Promise.all([
    countCaseStats(),
    countUsersByRole(),
    getAnalytics(),
  ]);

  const roleTotals = roles.reduce((acc, row) => {
    acc[row.role] = Number(row.total || 0);
    return acc;
  }, {});

  return {
    totalUsers: Object.values(roleTotals).reduce((sum, value) => sum + value, 0),
    admins: roleTotals.admin || 0,
    assistants: roleTotals.assistant || 0,
    pendingCases: Number(caseStats.pendingCases || 0),
    totalCases: Number(caseStats.totalCases || 0),
  };
};
