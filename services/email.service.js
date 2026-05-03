import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: Number(env.smtpPort) === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
  return transporter;
};

export const sendContactSubmissionEmail = async ({ recipients, submission }) => {
  const activeRecipients = recipients.filter((item) => item.isActive && item.email);
  if (!activeRecipients.length) return { sent: false, reason: "No active recipients" };

  const mailer = getTransporter();
  if (!mailer) return { sent: false, reason: "SMTP is not configured" };

  await mailer.sendMail({
    from: env.mailFrom || env.smtpUser,
    to: activeRecipients.map((recipient) => recipient.email).join(","),
    subject: `New BoneHard contact submission: ${submission.scopeOfWork}`,
    text: [
      `Name: ${submission.contactName}`,
      `Phone: ${submission.contactNumber}`,
      `Email: ${submission.contactEmail}`,
      `Scope: ${submission.scopeOfWork}`,
      `File/Link: ${submission.fileLink || "-"}`,
      "",
      submission.message || "",
    ].join("\n"),
  });

  return { sent: true };
};
