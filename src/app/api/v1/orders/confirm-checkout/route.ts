import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmCheckoutSession } from "@/server/services/order-service";

export const dynamic = "force-dynamic";

/**
 * Stripe Checkout's success_url. The fallback confirmation (for when the webhook isn't reachable,
 * e.g. local dev) lives here rather than in the billing page because it revalidates paths, and
 * Next.js throws if revalidatePath runs during a page render - which crashed the page a student
 * lands on right after paying. Always ends on the billing page, whatever confirmation returns:
 * the webhook remains the source of truth for finalizing the order.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  const session = await auth();
  if (!session?.user?.id) {
    const login = new URL("/login", url);
    login.searchParams.set("callbackUrl", `${url.pathname}${url.search}`);
    return NextResponse.redirect(login);
  }

  if (sessionId) await confirmCheckoutSession(session.user.id, sessionId);
  return NextResponse.redirect(new URL("/student/billing?success=1", url));
}
