import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Resend's shared sandbox sender - works with zero setup but only delivers to the address you
// signed up with. Switch to a verified custom domain address once one is configured in Resend.
const FROM = process.env.EMAIL_FROM ?? "NUB Academy <support@nubacademy.proshohan.com>";

/** Never throws - a failed email must not break the request that triggered it (registration,
 * password reset, etc. all still succeed even if delivery fails). Logs the reason, not the
 * email body/recipient content, for debugging. */
async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    console.warn(`Email not configured (RESEND_API_KEY unset) - would have sent "${subject}"`);
    return { ok: false as const };
  }
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    if (result.error) {
      console.error("Email send failed:", result.error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  } catch (err) {
    console.error("Email send failed:", err instanceof Error ? err.message : "unknown error");
    return { ok: false as const };
  }
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, sans-serif; background: #f6f6f7; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px;">
      <h1 style="font-size: 18px; margin: 0 0 16px;">${title}</h1>
      ${bodyHtml}
      <p style="color: #888; font-size: 12px; margin-top: 32px;">NUB Academy</p>
    </div>
  </body>
</html>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display: inline-block; background: #111827; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; margin: 16px 0;">${label}</a>`;
}

export function sendVerificationEmail(to: string, verifyUrl: string) {
  return sendEmail({
    to,
    subject: "Verify your email - NUB Academy",
    html: layout(
      "Verify your email",
      `<p>Confirm your email address to finish setting up your NUB Academy account.</p>
       ${button(verifyUrl, "Verify email")}
       <p style="color: #888; font-size: 13px;">This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>`
    ),
  });
}

export function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: "Reset your password - NUB Academy",
    html: layout(
      "Reset your password",
      `<p>Click below to choose a new password.</p>
       ${button(resetUrl, "Reset password")}
       <p style="color: #888; font-size: 13px;">This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`
    ),
  });
}
