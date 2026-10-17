// Notification emails, sent by the worker through Resend. (Sign-up and password emails stay in
// src/lib/email.ts and are sent straight from the request.)
import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "NUB Academy <support@nubacademy.proshohan.com>";

let client: Resend | null | undefined;
function resend() {
  if (client === undefined) client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  return client;
}

export function appUrl(path = "/") {
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function layout(heading: string, inner: string) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, sans-serif; background: #f6f6f7; padding: 24px; color: #18181b;">
    <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 8px; padding: 32px;">
      <h1 style="font-size: 18px; margin: 0 0 16px;">${escape(heading)}</h1>
      ${inner}
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        NUB Academy · <a href="${appUrl("/notifications/preferences")}" style="color: #888;">Choose which emails you get</a>
      </p>
    </div>
  </body>
</html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin: 24px 0 0;"><a href="${escape(href)}" style="background: #18181b; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 14px;">${escape(label)}</a></p>`;

export type EmailResult = { ok: boolean; skipped?: "not_configured" };

async function send(to: string, subject: string, html: string): Promise<EmailResult> {
  const api = resend();
  if (!api) {
    console.warn(`Email not configured (RESEND_API_KEY unset) - skipped "${subject}"`);
    return { ok: false, skipped: "not_configured" };
  }
  const result = await api.emails.send({ from: FROM, to, subject, html });
  // Thrown so BullMQ retries with backoff; the job's attempts cap how often.
  if (result.error) throw new Error(`Resend: ${result.error.message}`);
  return { ok: true };
}

export function sendNotificationEmail(to: string, n: { title: string; body: string | null; link: string | null }) {
  const inner = `${n.body ? `<p style="font-size: 14px; line-height: 1.5; margin: 0;">${escape(n.body)}</p>` : ""}${
    n.link ? button(appUrl(n.link), "Open NUB Academy") : ""
  }`;
  return send(to, n.title, layout(n.title, inner));
}

export function sendChatDigestEmail(
  to: string,
  name: string | null,
  conversations: { title: string; body: string | null; link: string | null }[]
) {
  const heading = conversations.length === 1 ? "You have an unread conversation" : `You have ${conversations.length} unread conversations`;
  const items = conversations
    .map(
      (c) => `<li style="margin: 0 0 12px;">
        <a href="${escape(appUrl(c.link ?? "/"))}" style="color: #18181b; font-weight: 600; text-decoration: none;">${escape(c.title)}</a>
        ${c.body ? `<br><span style="color: #52525b; font-size: 13px;">${escape(c.body)}</span>` : ""}
      </li>`
    )
    .join("");
  const greeting = `<p style="font-size: 14px; margin: 0 0 16px;">Hi ${escape(name ?? "there")}, people are waiting for your reply:</p>`;
  return send(to, heading, layout(heading, `${greeting}<ul style="padding-left: 18px; margin: 0;">${items}</ul>`));
}
