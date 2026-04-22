const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter;

const escapeHtml = (value = '') => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const getReadableLogoPath = () => {
  const fallbackPaths = [
    process.env.SMTP_LOGO_PATH,
    path.resolve(__dirname, '../../assets/logo.png'),
    path.resolve(__dirname, '../../../frontend/src/assets/hero.png'),
  ].filter(Boolean);

  return fallbackPaths.find((candidatePath) => fs.existsSync(candidatePath));
};

const hasSmtpConfig = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

const sendTimesheetAssignedEmail = async ({ toEmail, toName, periodStart, periodEnd, dispatcherName }) => {
  if (!hasSmtpConfig()) {
    return {
      sent: false,
      skipped: true,
      reason: 'SMTP is not configured',
    };
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromLabel = process.env.SMTP_FROM_NAME || 'Timesheet App';
  const periodLabel = `${periodStart} to ${periodEnd}`;
  const receiverName = toName || 'Team Member';
  const senderName = dispatcherName || 'HR';
  const dashboardUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const logoPath = getReadableLogoPath();
  const logoCid = 'timesheet-logo';
  const receiverNameEscaped = escapeHtml(receiverName);
  const senderNameEscaped = escapeHtml(senderName);
  const periodLabelEscaped = escapeHtml(periodLabel);

  const subject = `Timesheet assigned: ${periodLabel}`;
  const text = [
    `Hi ${receiverName},`,
    '',
    `A new timesheet has been assigned for ${periodLabel}.`,
    'Please review and submit it as soon as possible.',
    '',
    `Open dashboard: ${dashboardUrl}`,
    '',
    `Assigned by: ${senderName}`,
    '',
    'Thanks,',
    'Timesheet App',
  ].join('\n');

  const html = `
    <div style="margin:0; padding:24px; background:#f2f5f8; font-family:Arial,Helvetica,sans-serif; color:#1f2937;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;">
        <tr>
          <td style="padding:20px 24px; background:#0f172a; color:#ffffff;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  ${logoPath ? `<img src="cid:${logoCid}" alt="Timesheet App" style="height:54px; width:54px; border-radius:50%; border:2px solid #f97316; object-fit:cover; display:block;"/>` : ''}
                </td>
                <td style="vertical-align:middle; padding-left:14px;">
                  <div style="font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:#93c5fd;">Timesheet Notification</div>
                  <div style="font-size:22px; font-weight:700; margin-top:4px;">New Timesheet Requires Attention</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 12px; font-size:16px;">Hi <strong>${receiverNameEscaped}</strong>,</p>
            <p style="margin:0 0 18px; line-height:1.6; font-size:15px; color:#334155;">
              A new timesheet has been assigned and is ready for your review.
            </p>

            <div style="border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; background:#f8fafc; margin-bottom:20px;">
              <div style="font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:6px;">Pay Period</div>
              <div style="font-size:18px; font-weight:700; color:#0f172a;">${periodLabelEscaped}</div>
              <div style="margin-top:8px; font-size:14px; color:#475569;">Assigned by: <strong>${senderNameEscaped}</strong></div>
            </div>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
              <tr>
                <td style="border-radius:10px; background:#f97316;">
                  <a href="${dashboardUrl}" style="display:inline-block; padding:12px 18px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">Open Timesheet Dashboard</a>
                </td>
              </tr>
            </table>

            <p style="margin:0; font-size:13px; color:#64748b; line-height:1.6;">
              Please submit your timesheet as soon as possible. If this assignment looks incorrect, contact HR.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px; background:#f8fafc; border-top:1px solid #e2e8f0; font-size:12px; color:#64748b;">
            This is an automated message from Timesheet App.
          </td>
        </tr>
      </table>
    </div>
  `;

  const attachments = logoPath
    ? [
        {
          filename: path.basename(logoPath),
          path: logoPath,
          cid: logoCid,
        },
      ]
    : undefined;

  await getTransporter().sendMail({
    from: `"${fromLabel}" <${fromAddress}>`,
    to: toEmail,
    subject,
    text,
    html,
    attachments,
  });

  return { sent: true, skipped: false };
};

module.exports = {
  sendTimesheetAssignedEmail,
};
