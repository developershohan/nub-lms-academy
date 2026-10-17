"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flag, Inbox, LifeBuoy, MessagesSquare, Search } from "lucide-react";
import { toast } from "sonner";
import { useSocket } from "@/hooks/use-socket";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";
import type { TicketListItem, TicketStatus, TicketWire } from "@/server/chat/support";
import type { ReportListItem } from "@/server/chat/safety";
import { getConversationSummaryAction, hideMessageAction, pinMessageAction, reportMessageAction, resolveReportAction } from "@/components/chat/actions";
import { ChatDetails } from "@/components/chat/chat-details";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";
import { MessageThread } from "@/components/chat/message-thread";
import { useChatThread } from "@/components/chat/use-chat-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type Tab = "tickets" | "inbox" | "reports";

const STATUS_FILTERS: { value: TicketStatus | "ACTIVE" | "ALL"; label: string }[] = [
  { value: "ACTIVE", label: "Open & pending" },
  { value: "OPEN", label: "Waiting on us" },
  { value: "PENDING", label: "Waiting on customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "ALL", label: "All tickets" },
];
const PRIORITY_TONE = {
  URGENT: "bg-destructive/15 text-destructive",
  HIGH: "bg-amber/25 text-amber-foreground dark:text-amber",
  NORMAL: "bg-muted text-muted-foreground",
  LOW: "bg-muted text-muted-foreground",
} as const;
const STATUS_LABEL = { OPEN: "Waiting on us", PENDING: "Waiting on customer", RESOLVED: "Resolved", CLOSED: "Closed" } as const;
const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function matchesFilter(ticket: TicketWire, status: string, assignee: string, me: string) {
  const statusOk = status === "ALL" || (status === "ACTIVE" ? ticket.status === "OPEN" || ticket.status === "PENDING" : ticket.status === status);
  const assigneeOk = assignee === "all" || (assignee === "me" ? ticket.assignee?.id === me : !ticket.assignee);
  return statusOk && assigneeOk;
}

function TicketQueue({ currentUser, initialConversationId }: { currentUser: { id: string; name: string | null }; initialConversationId: string | null }) {
  const { socket, connected, error } = useSocket();
  const [status, setStatus] = useState("ACTIVE");
  const [assignee, setAssignee] = useState("all");
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const thread = useChatThread({ conversationId: selected?.id ?? null, socket, connected, currentUser });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, assignee });
    if (query.trim()) params.set("q", query.trim());
    try {
      const res = await fetch(`/api/v1/chat/tickets?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTickets(data.tickets);
    } catch {
      toast.error("Couldn't load tickets");
      setTickets((prev) => prev ?? []);
    }
  }, [status, assignee, query]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  const open = useCallback(async (conversationId: string) => {
    const result = await getConversationSummaryAction(conversationId);
    if ("error" in result) return toast.error(result.error);
    setSelected(result.conversation);
    const url = new URL(window.location.href);
    url.searchParams.set("c", conversationId);
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    // Deferred one tick: open() updates state, which must not happen synchronously in an effect.
    if (initialConversationId) queueMicrotask(() => void open(initialConversationId));
  }, [initialConversationId, open]);

  useEffect(() => {
    if (!socket) return;
    const onTicket = (ticket: TicketWire) => {
      setTickets((prev) => {
        if (!prev) return prev;
        if (!prev.some((t) => t.id === ticket.id)) {
          if (ticket.lastCustomerMessageAt && matchesFilter(ticket, status, assignee, currentUser.id)) void load();
          return prev;
        }
        return prev.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t));
      });
      setSelected((prev) => (prev && prev.id === ticket.conversationId ? { ...prev, ticket } : prev));
    };
    const onUpdated = (u: { conversationId: string; lastSeq?: number; lastMessageAt?: string; preview?: string; senderId?: string }) => {
      if (u.preview === undefined) return;
      setTickets((prev) =>
        prev?.map((t) =>
          t.conversationId === u.conversationId
            ? { ...t, lastSeq: u.lastSeq ?? t.lastSeq, lastMessageAt: u.lastMessageAt ?? t.lastMessageAt, preview: { text: u.preview!, senderName: null } }
            : t
        ) ?? prev
      );
    };
    const onConnect = () => void load();
    socket.on("ticket:updated", onTicket);
    socket.on("conversation:updated", onUpdated);
    socket.on("connect", onConnect);
    return () => {
      socket.off("ticket:updated", onTicket);
      socket.off("conversation:updated", onUpdated);
      socket.off("connect", onConnect);
    };
  }, [socket, load, status, assignee, currentUser.id]);

  const visible = useMemo(() => (tickets ?? []).filter((t) => matchesFilter(t, status, assignee, currentUser.id)), [tickets, status, assignee, currentUser.id]);
  const connectionNote = connected ? null : error ? "Offline - messages send when you're back" : "Connecting…";

  async function hide(messageId: string) {
    const result = await hideMessageAction(messageId);
    if ("error" in result) return toast.error(result.error);
    thread.markHidden(messageId);
  }
  async function report(messageId: string, reason: string) {
    const result = await reportMessageAction(messageId, reason);
    if ("error" in result) toast.error(result.error);
    else toast.success("Reported");
  }

  const details = selected ? (
    <ChatDetails
      conversation={selected}
      currentUserId={currentUser.id}
      socket={socket}
      isStaff
      onClose={() => setDetailsOpen(false)}
      onUpdated={(patch) => {
        setSelected((prev) => (prev ? { ...prev, ...patch } : prev));
        if (patch.ticket) setTickets((prev) => prev?.map((t) => (t.id === patch.ticket!.id ? { ...t, ...patch.ticket } : t)) ?? prev);
      }}
      onBatchCreated={() => {}}
    />
  ) : null;

  return (
    <div className="grid h-[calc(100dvh-14rem)] min-h-[480px] grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_18rem]">
      <aside className={cn("flex min-h-0 flex-col border-r", selected && "hidden md:flex")} aria-label="Support tickets">
        <div className="space-y-2 border-b p-3">
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Ticket status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select aria-label="Assignee" className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="all">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or subject" aria-label="Search tickets" className="pl-8" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {tickets === null && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Loading tickets…</li>}
          {tickets !== null && visible.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 size-6" aria-hidden />
              Nothing here. New requests appear instantly.
            </li>
          )}
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void open(t.conversationId)}
                aria-current={selected?.id === t.conversationId ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected?.id === t.conversationId ? "bg-muted" : "hover:bg-muted/50"
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.requester.name ?? "Customer"}</span>
                  {t.lastMessageAt && (
                    <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                      {formatRelativeTime(new Date(t.lastMessageAt))}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs">{t.subject ?? "Support request"}</span>
                {t.preview && <span className="block truncate text-xs text-muted-foreground">{t.preview.senderName ? `${t.preview.senderName}: ` : ""}{t.preview.text}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                  <span className={cn("rounded-full px-1.5 py-0.5", PRIORITY_TONE[t.priority])}>{t.priority.toLowerCase()}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{STATUS_LABEL[t.status]}</span>
                  <span className="ml-auto truncate text-muted-foreground">{t.assignee ? (t.assignee.id === currentUser.id ? "You" : t.assignee.name) : "Unassigned"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className={cn("min-h-0", !selected && "hidden md:block")}>
        {selected ? (
          <MessageThread
            key={selected.id}
            title={selected.label}
            subtitle={selected.ticket ? `Ticket · ${STATUS_LABEL[selected.ticket.status]}` : "Support"}
            currentUserId={currentUser.id}
            isDirect={false}
            isGroup
            canPost={selected.canPost}
            postingBlockedReason={selected.postingBlockedReason}
            canModerate={selected.canModerate}
            pinnedMessageId={null}
            connectionNote={connectionNote}
            thread={thread}
            onBack={() => setSelected(null)}
            onHide={hide}
            onReport={report}
            onPin={(id) => void pinMessageAction(selected.id, id)}
            onTyping={(typing) => socket?.emit(typing ? "typing:start" : "typing:stop", selected.id)}
            onOpenDetails={() => setDetailsOpen((o) => !o)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <LifeBuoy className="size-8" aria-hidden />
            <p className="font-medium text-foreground">Pick a ticket</p>
            <p>Replying takes an unassigned ticket and marks it as waiting on the customer.</p>
          </div>
        )}
      </div>

      {selected && <div className="hidden min-h-0 border-l xl:block">{details}</div>}
      {selected && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-[min(22rem,90vw)] p-0 xl:hidden">
            <SheetTitle className="sr-only">Ticket details</SheetTitle>
            {details}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function ReportsPanel({ initialReports }: { initialReports: ReportListItem[] }) {
  const [reports, setReports] = useState(initialReports);
  async function resolve(report: ReportListItem, action: "remove" | "dismiss") {
    const result = await resolveReportAction(report.id, action);
    if ("error" in result) return toast.error(result.error);
    setReports((prev) => prev.filter((r) => (report.message ? r.message?.id !== report.message.id : r.id !== report.id)));
    toast.success(action === "remove" ? "Message removed" : "Report dismissed");
  }
  if (reports.length === 0) {
    return (
      <div className="rounded-xl bg-card p-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
        <Flag className="mx-auto mb-2 size-6" aria-hidden />
        No open reports.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {reports.map((r) => (
        <li key={r.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Reported by <strong className="text-foreground">{r.reporter?.name ?? "a user"}</strong> · <span suppressHydrationWarning>{new Date(r.createdAt).toLocaleString()}</span>
            </span>
            {r.conversationId && (
              <Link className="underline" href={`/admin/messages?tab=inbox&c=${r.conversationId}`}>
                Open conversation
              </Link>
            )}
          </div>
          {r.reason && <p className="mt-2 text-sm">&ldquo;{r.reason}&rdquo;</p>}
          {r.message && (
            <blockquote className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="block text-xs font-medium text-muted-foreground">{r.message.sender.name ?? "Member"} wrote:</span>
              <span className={cn(r.message.deletedAt && "line-through opacity-70")}>{r.message.content}</span>
            </blockquote>
          )}
          <div className="mt-3 flex gap-2">
            {r.message && !r.message.deletedAt && (
              <Button size="sm" variant="destructive" onClick={() => void resolve(r, "remove")}>
                Remove message
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void resolve(r, "dismiss")}>
              Dismiss
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SupportInbox({
  currentUser,
  initialTab,
  initialConversationId,
  conversations,
  reports,
}: {
  currentUser: { id: string; name: string | null };
  initialTab: Tab;
  initialConversationId: string | null;
  conversations: ConversationSummary[];
  reports: ReportListItem[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const contacts: ChatContact[] = [];
  const tabs: { key: Tab; label: string; icon: typeof Inbox; count?: number }[] = [
    { key: "tickets", label: "Support tickets", icon: LifeBuoy },
    { key: "inbox", label: "My messages", icon: MessagesSquare },
    { key: "reports", label: "Reports", icon: Flag, count: reports.length },
  ];
  function choose(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
  }
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Messages" className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => choose(t.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
            {!!t.count && <span className="rounded-full bg-destructive/15 px-1.5 text-[11px] text-destructive">{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === "tickets" && <TicketQueue currentUser={currentUser} initialConversationId={initialConversationId} />}
      {tab === "inbox" && (
        <ChatShell currentUser={currentUser} initialConversations={conversations} initialSelectedId={initialConversationId} contacts={contacts} isModerator allowStaffSearch />
      )}
      {tab === "reports" && <ReportsPanel initialReports={reports} />}
    </div>
  );
}
