const axios = require("axios");

const RESEND_API_URL = "https://api.resend.com/emails";
const SCHOOL_NAME = "Oduduwa College of Yoruba Medicine";
const SCHOOL_SHORT_NAME = "OCOYAM";
const DEFAULT_FROM_EMAIL = "admissions@oyocam.org";
const DEFAULT_REPLY_TO_EMAIL = "info@oyocam.org";

function getBaseAppUrl() {
  return process.env.APP_URL || process.env.DOMAIN_NAME;
}

function getFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    `${SCHOOL_NAME} <${DEFAULT_FROM_EMAIL}>`
  );
}

function getReplyToAddress() {
  return process.env.RESEND_REPLY_TO || DEFAULT_REPLY_TO_EMAIL;
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const payload = {
    from: getFromAddress(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    reply_to: getReplyToAddress(),
  };

  const response = await axios.post(RESEND_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

async function sendVerificationEmail(userEmail, token) {
  const verificationUrl = `${getBaseAppUrl()}/auth/verify-email?token=${token}`;

  await sendEmail({
    to: userEmail,
    subject: `Verify your email address | ${SCHOOL_SHORT_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f7fbf8; color: #163221;">
        <div style="background: linear-gradient(135deg, #103a28 0%, #1f6b47 100%); padding: 28px; color: #ffffff; border-radius: 18px 18px 0 0;">
          <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85;">${SCHOOL_SHORT_NAME}</p>
          <h1 style="margin: 0; font-size: 28px; line-height: 1.2;">Verify your email address</h1>
          <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.6; color: #d8f1e2;">
            Complete your account setup for ${SCHOOL_NAME}.
          </p>
        </div>

        <div style="background: #ffffff; padding: 32px; border: 1px solid #dbe9df; border-top: 0; border-radius: 0 0 18px 18px;">
          <p style="margin-top: 0; font-size: 16px; line-height: 1.7;">
            Click the button below to verify your email and continue your admission process.
          </p>

          <div style="margin: 28px 0;">
            <a href="${verificationUrl}" style="display: inline-block; background: #14532d; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 999px; font-weight: 700;">
              Verify Email
            </a>
          </div>

          <p style="font-size: 14px; line-height: 1.7; color: #4b6354;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="font-size: 14px; line-height: 1.7; word-break: break-all; color: #14532d;">
            ${verificationUrl}
          </p>

          <p style="margin: 28px 0 0; font-size: 14px; color: #6b7f71;">
            This email was sent automatically by ${SCHOOL_NAME}.
          </p>
        </div>
      </div>
    `,
    text: `Verify your email address for ${SCHOOL_NAME}.\n\nOpen this link to continue:\n${verificationUrl}`,
  });
}

// Keep in sync with the track details shown on the site (FullPage.jsx
// programs array) and the form's programme radio labels (form.jsx).
const PROGRAMME_DETAILS = {
  professional: {
    name: "Part-time (Weekend) Track",
    startDate: "25th September 2026",
  },
  advanced: {
    name: "Full-time Track",
    startDate: "21st September 2026",
  },
};

async function sendApplicationConfirmationEmail(userEmail, applicationId, pioneerDiscount, programme) {
  const discountHtml = pioneerDiscount
    ? `
      <div style="margin: 24px 0; background: #fff7cc; border: 1px solid #e4c84a; border-radius: 16px; padding: 20px;">
        <p style="margin: 0; color: #7a5a00; font-weight: 700;">
          Pioneer cohort bonus: you qualified for the ₦30,000 pioneer discount.
        </p>
      </div>
    `
    : "";

  const discountText = pioneerDiscount
    ? "\n\nPioneer cohort bonus: you qualified for the ₦30,000 pioneer discount."
    : "";

  const programmeDetails = PROGRAMME_DETAILS[programme];

  const programmeHtml = programmeDetails
    ? `
      <div style="margin: 24px 0; background: linear-gradient(135deg, #e8f5ec 0%, #f6fbf8 100%); border: 1px solid #cfe5d6; border-radius: 18px; padding: 24px;">
        <p style="margin: 0 0 8px; color: #4b6354; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;">Programme</p>
        <p style="margin: 0 0 14px; font-size: 20px; font-weight: 800; color: #14532d;">${programmeDetails.name}</p>
        <p style="margin: 0 0 8px; color: #4b6354; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;">Classes Begin</p>
        <p style="margin: 0; font-size: 20px; font-weight: 800; color: #14532d;">${programmeDetails.startDate}</p>
      </div>
    `
    : "";

  const programmeText = programmeDetails
    ? `\n\nProgramme: ${programmeDetails.name}\nClasses begin: ${programmeDetails.startDate}`
    : "";

  await sendEmail({
    to: userEmail,
    subject: `Application submitted successfully | ${SCHOOL_SHORT_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; background: #f7fbf8; color: #163221;">
        <div style="background: linear-gradient(135deg, #103a28 0%, #1f6b47 100%); padding: 32px; color: #ffffff; border-radius: 22px 22px 0 0;">
          <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85;">Admission Office</p>
          <h1 style="margin: 0; font-size: 30px; line-height: 1.2;">Your application has been submitted</h1>
          <p style="margin: 12px 0 0; font-size: 16px; line-height: 1.7; color: #d8f1e2;">
            Thank you for applying to ${SCHOOL_NAME}.
          </p>
        </div>

        <div style="background: #ffffff; padding: 32px; border: 1px solid #dbe9df; border-top: 0; border-radius: 0 0 22px 22px;">
          <p style="margin-top: 0; font-size: 16px; line-height: 1.8;">
            We have received your application for admission.
          </p>

          <div style="margin: 28px 0; background: linear-gradient(135deg, #e8f5ec 0%, #f6fbf8 100%); border: 1px solid #cfe5d6; border-radius: 18px; padding: 24px;">
            <p style="margin: 0 0 8px; color: #4b6354; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;">Application ID</p>
            <p style="margin: 0; font-size: 34px; font-weight: 800; color: #14532d;">${applicationId}</p>
          </div>

          <div style="margin: 24px 0; background: #fff4f0; border-left: 5px solid #c2410c; border-radius: 12px; padding: 18px 20px;">
            <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #7c2d12;">
              Store this application ID carefully. We will use it to identify your application in future communication and support requests.
            </p>
          </div>

          ${programmeHtml}

          ${discountHtml}

          <h2 style="margin: 30px 0 12px; color: #14532d; font-size: 20px;">What happens next</h2>
          <ol style="padding-left: 20px; margin: 0; color: #2e4638; line-height: 1.8;">
            <li>Our admissions team will review your application.</li>
            <li>You will receive another email when there is an update on your admission status.</li>
            <li>Keep your application ID available whenever you contact the school.</li>
          </ol>

          <div style="margin-top: 30px; background: #f5f9f6; border-radius: 16px; padding: 20px;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #14532d;">Need help?</p>
            <p style="margin: 6px 0;">WhatsApp/Call: +234 802 298 1214</p>
            <p style="margin: 6px 0;">Email: ${getReplyToAddress()}</p>
            <p style="margin: 6px 0;">School: ${SCHOOL_NAME}</p>
          </div>

          <p style="margin: 28px 0 0; font-size: 15px; line-height: 1.7;">
            Regards,<br />
            <strong>Admissions Office</strong><br />
            ${SCHOOL_NAME}
          </p>
        </div>
      </div>
    `,
    text: `Your application has been submitted.\n\nApplication ID: ${applicationId}\nStore this application ID carefully. We will use it to identify your application in future.${programmeText}${discountText}\n\nWhat happens next:\n1. Our admissions team will review your application.\n2. You will receive another email when there is an update on your admission status.\n3. Keep your application ID available whenever you contact the school.\n\nNeed help?\nWhatsApp/Call: +234 802 298 1214\nEmail: ${getReplyToAddress()}\n\nAdmissions Office\n${SCHOOL_NAME}`,
  });
}

async function sendResetEmail(userEmail, token) {
  const resetUrl = `${getBaseAppUrl()}/update-password?token=${token}`;

  await sendEmail({
    to: userEmail,
    subject: `Reset your password | ${SCHOOL_SHORT_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #f7fbf8; color: #163221;">
        <div style="background: linear-gradient(135deg, #103a28 0%, #1f6b47 100%); padding: 28px; color: #ffffff; border-radius: 18px 18px 0 0;">
          <h1 style="margin: 0; font-size: 28px; line-height: 1.2;">Reset your password</h1>
          <p style="margin: 10px 0 0; font-size: 15px; line-height: 1.6; color: #d8f1e2;">
            Use the secure link below to create a new password for your ${SCHOOL_SHORT_NAME} account.
          </p>
        </div>

        <div style="background: #ffffff; padding: 32px; border: 1px solid #dbe9df; border-top: 0; border-radius: 0 0 18px 18px;">
          <div style="margin: 28px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #14532d; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 999px; font-weight: 700;">
              Reset Password
            </a>
          </div>

          <p style="font-size: 14px; line-height: 1.7; color: #4b6354;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="font-size: 14px; line-height: 1.7; word-break: break-all; color: #14532d;">
            ${resetUrl}
          </p>
        </div>
      </div>
    `,
    text: `Reset your password for ${SCHOOL_SHORT_NAME}.\n\nOpen this link to continue:\n${resetUrl}`,
  });
}

module.exports = {
  sendVerificationEmail,
  sendResetEmail,
  sendApplicationConfirmationEmail,
};
