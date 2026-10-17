import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getMessagesHome } from "@/lib/role-home";

/** Notification links point here ("/messages?c=<conversation>") so they work for every role; this
 * sends each user to the inbox in their own dashboard with that conversation open. */
export default async function MessagesRedirect({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  const { c } = await searchParams;
  const target = `/messages${c ? `?c=${encodeURIComponent(c)}` : ""}`;
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(target)}`);
  const inbox = getMessagesHome(user.roles);
  redirect(c ? `${inbox}?c=${encodeURIComponent(c)}` : inbox);
}
