// Web Push (VAPID). Optional: without VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY nothing is sent.
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured: boolean | undefined;

export function pushConfigured() {
  if (configured !== undefined) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@nubacademy.proshohan.com", publicKey, privateKey);
  return (configured = true);
}

export type PushPayload = { title: string; body: string | null; url: string | null; tag?: string };

/** Sends to every browser the user subscribed. Dead subscriptions (404/410) are deleted. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24, urgency: "normal" }
      );
      delivered++;
      await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error("Web push failed:", status ?? (err instanceof Error ? err.message : "unknown error"));
      }
    }
  }
  return delivered;
}
