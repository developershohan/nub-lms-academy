/*
 * Support tickets: one per SUPPORT conversation ("support:<userId>"), with a status, a priority
 * and an assignee. A customer's message opens or reopens the ticket; a staff reply takes it and
 * marks it waiting on the customer. No next/* imports - the socket server uses this too.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { NotifyInput } from "@/server/notifications/notify";
import { isStaff, type ChatUser } from "./access";

export type TicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type TicketEvent = "created" | "replied" | "reopened";

export const TICKET_INCLUDE = {
  requester: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.SupportTicketInclude;

export type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

export type TicketWire = {
  id: string;
  conversationId: string;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string | null;
  requester: { id: string; name: string | null };
  assignee: { id: string; name: string | null } | null;
  createdAt: string;
  firstResponseAt: string | null;
  lastCustomerMessageAt: string | null;
  lastStaffMessageAt: string | null;
};

export function serializeTicket(row: TicketRow): TicketWire {
  return {
    id: row.id,
    conversationId: row.conversationId,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    requester: { id: row.requester.id, name: row.requester.name },
    assignee: row.assignee ? { id: row.assignee.id, name: row.assignee.name } : null,
    createdAt: row.createdAt.toISOString(),
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    lastCustomerMessageAt: row.lastCustomerMessageAt?.toISOString() ?? null,
    lastStaffMessageAt: row.lastStaffMessageAt?.toISOString() ?? null,
  };
}

/** The ticket for a conversation, created from its "support:<userId>" key if it has none yet. */
export async function ensureTicket(tx: Prisma.TransactionClient, conversationId: string): Promise<TicketRow | null> {
  const existing = await tx.supportTicket.findUnique({ where: { conversationId }, include: TICKET_INCLUDE });
  if (existing) return existing;
  const conversation = await tx.conversation.findUnique({ where: { id: conversationId }, select: { type: true, uniqueKey: true } });
  if (!conversation || conversation.type !== "SUPPORT") return null;
  const requesterId = conversation.uniqueKey?.startsWith("support:")
    ? conversation.uniqueKey.slice("support:".length)
    : (await tx.conversationParticipant.findFirst({ where: { conversationId }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId;
  if (!requesterId) return null;
  return tx.supportTicket.create({ data: { conversationId, requesterId }, include: TICKET_INCLUDE });
}

/**
 * Inside sendChatMessage's transaction: a customer message (re)opens the ticket and sets its
 * subject on first contact; a staff reply marks it waiting on the customer, records the first
 * response time and - when nobody has it yet - assigns it to the replier.
 */
export async function applyTicketOnMessage(
  tx: Prisma.TransactionClient,
  conversationId: string,
  senderId: string,
  text: string,
  now: Date
): Promise<{ ticket: TicketRow; event: TicketEvent | null } | null> {
  const current = await ensureTicket(tx, conversationId);
  if (!current) return null;
  const fromCustomer = current.requesterId === senderId;
  if (fromCustomer) {
    const event: TicketEvent = !current.lastCustomerMessageAt
      ? "created"
      : current.status === "RESOLVED" || current.status === "CLOSED"
        ? "reopened"
        : "replied";
    const ticket = await tx.supportTicket.update({
      where: { id: current.id },
      data: {
        status: "OPEN",
        lastCustomerMessageAt: now,
        resolvedAt: null,
        subject: current.subject ?? text.replace(/\s+/g, " ").slice(0, 120),
        // A reopened ticket is new work: whoever answers next takes it.
        ...(event === "reopened" ? { assigneeId: null, firstResponseAt: null } : {}),
      },
      include: TICKET_INCLUDE,
    });
    return { ticket, event };
  }
  const ticket = await tx.supportTicket.update({
    where: { id: current.id },
    data: {
      status: current.status === "OPEN" ? "PENDING" : current.status,
      lastStaffMessageAt: now,
      firstResponseAt: current.firstResponseAt ?? now,
      assigneeId: current.assigneeId ?? senderId,
    },
    include: TICKET_INCLUDE,
  });
  return { ticket, event: null };
}

export type TicketFilter = {
  status?: TicketStatus | "ACTIVE" | "ALL";
  assignee?: "me" | "unassigned" | "all";
  q?: string;
};

export type TicketListItem = TicketWire & {
  lastSeq: number;
  lastMessageAt: string | null;
  preview: { text: string; senderName: string | null } | null;
};

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
const STATUS_RANK = { OPEN: 0, PENDING: 1, RESOLVED: 2, CLOSED: 3 } as const;

/** The shared support queue: open work first, urgent before low, longest-waiting first. */
export async function listTickets(user: ChatUser, filter: TicketFilter = {}): Promise<TicketListItem[] | { error: string }> {
  if (!isStaff(user)) return { error: "Forbidden" };
  const where: Prisma.SupportTicketWhereInput = { lastCustomerMessageAt: { not: null } };
  const status = filter.status ?? "ACTIVE";
  if (status === "ACTIVE") where.status = { in: ["OPEN", "PENDING"] };
  else if (status !== "ALL") where.status = status;
  if (filter.assignee === "me") where.assigneeId = user.id;
  if (filter.assignee === "unassigned") where.assigneeId = null;
  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { requester: { name: { contains: q, mode: "insensitive" } } },
      { requester: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.supportTicket.findMany({
    where,
    include: { ...TICKET_INCLUDE, conversation: { select: { lastSeq: true, lastMessageAt: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const lastMessages = rows.length
    ? await prisma.message.findMany({
        where: { OR: rows.map((r) => ({ conversationId: r.conversationId, seq: r.conversation.lastSeq })) },
        select: { conversationId: true, content: true, deletedAt: true, sender: { select: { name: true } } },
      })
    : [];
  const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]));

  return rows
    .map((row) => {
      const last = lastByConversation.get(row.conversationId);
      return {
        ...serializeTicket(row),
        lastSeq: row.conversation.lastSeq,
        lastMessageAt: row.conversation.lastMessageAt?.toISOString() ?? null,
        preview: last ? { text: last.deletedAt ? "Message removed" : last.content.slice(0, 140), senderName: last.sender.name } : null,
      };
    })
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.lastCustomerMessageAt ?? "").localeCompare(b.lastCustomerMessageAt ?? "")
    );
}

const STATUS_NOTES: Partial<Record<TicketStatus, string>> = {
  RESOLVED: "marked this ticket as resolved. Reply here if you still need help.",
  CLOSED: "closed this ticket. Write again any time to open a new one.",
  OPEN: "reopened this ticket.",
};

export type TicketUpdate = { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null };

/**
 * Staff change a ticket's status, priority or assignee. Returns the ticket, a note to post in the
 * thread as a SYSTEM message (status changes), and a notification for a newly assigned colleague.
 */
export async function updateTicket(user: ChatUser, ticketId: string, input: TicketUpdate) {
  if (!isStaff(user)) return { error: "Forbidden" } as const;
  const current = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: TICKET_INCLUDE });
  if (!current) return { error: "Not found" } as const;

  if (input.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: input.assigneeId },
      select: { status: true, roles: { select: { role: { select: { name: true } } } } },
    });
    const ok = !!assignee && assignee.status === "ACTIVE" && isStaff({ roleNames: assignee.roles.map((r) => r.role.name) });
    if (!ok) return { error: "Tickets can only be assigned to support staff" } as const;
  }

  const data: Prisma.SupportTicketUpdateInput = {};
  if (input.priority) data.priority = input.priority;
  if (input.assigneeId !== undefined) data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
  const statusChanged = !!input.status && input.status !== current.status;
  if (statusChanged) {
    data.status = input.status;
    data.resolvedAt = input.status === "RESOLVED" || input.status === "CLOSED" ? new Date() : null;
  }
  const updated = await prisma.supportTicket.update({ where: { id: ticketId }, data, include: TICKET_INCLUDE });

  const note = statusChanged && STATUS_NOTES[input.status!] ? `${user.name ?? "Support"} ${STATUS_NOTES[input.status!]}` : null;
  const assigned = input.assigneeId && input.assigneeId !== current.assigneeId && input.assigneeId !== user.id ? input.assigneeId : null;
  const notification: NotifyInput | null = assigned
    ? {
        type: "ticket_assigned",
        title: `${user.name ?? "A colleague"} assigned you a support ticket`,
        body: updated.subject ?? `From ${updated.requester.name ?? "a customer"}`,
        link: `/admin/messages?tab=tickets&c=${updated.conversationId}`,
        actorId: user.id,
        entity: { type: "SupportTicket", id: updated.id },
      }
    : null;
  return { ok: true, ticket: serializeTicket(updated), requesterId: updated.requesterId, conversationId: updated.conversationId, note, assigned, notification } as const;
}

/** Staff who can take tickets, for the assignee picker. */
export async function listSupportStaff() {
  return prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN", "SUPPORT"] } } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** The ticket on a conversation, if it is a support thread. */
export async function ticketForConversation(conversationId: string): Promise<TicketWire | null> {
  const row = await prisma.supportTicket.findUnique({ where: { conversationId }, include: TICKET_INCLUDE });
  return row ? serializeTicket(row) : null;
}
