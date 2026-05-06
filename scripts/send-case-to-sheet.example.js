import { pushCaseToGoogleSheet } from "../services/googleSheetSync.service.js";

const result = await pushCaseToGoogleSheet({
  caseId: 123,
  patientName: "Test Patient",
  status: "In Progress",
});

console.log("Google Sheet sync result", result);
