import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChatUser } from "@/server/chat/access";
import { listTickets, type TicketFilter } from "@/server/chat/support";

export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "ALL", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
const ASSIGNEES = ["me", "unassigned", "all"] as const;

/** The support queue (staff only). ?status=ACTIVE|ALL|OPEN|...&assignee=me|unassigned|all&q= */
export async function GET(request: Request) {
  const session = await auth();
  const user = session?.user?.id ? await getChatUser(session.user.id) : null;
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const filter: TicketFilter = {
    status: STATUSES.find((s) => s === search.get("status")),
    assignee: ASSIGNEES.find((a) => a === search.get("assignee")),
    q: search.get("q")?.slice(0, 100) ?? undefined,
  };
  const result = await listTickets(user, filter);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ tickets: result });
}
