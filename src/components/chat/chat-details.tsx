"use client";

import { useEffect, useState } from "react";
import { Ban, Bell, BellOff, Plus, ShieldCheck, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/chat-service";
import type { TicketPriority, TicketStatus, TicketWire } from "@/server/chat/support";
import {
  blockUserAction,
  createBatchChannelAction,
  listSupportStaffAction,
  muteConversationAction,
  removeMemberAction,
  setSlowModeAction,
  timeoutMemberAction,
  unblockUserAction,
  updateTicketAction,
} from "@/components/chat/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Participant = { userId: string; role: "OWNER" | "MODERATOR" | "MEMBER"; lastReadSeq: number; user: { id: string; name: string | null } };

const MUTE_OPTIONS = [
  { label: "For 1 hour", hours: 1 },
  { label: "For 8 hours", hours: 8 },
  { label: "For a week", hours: 24 * 7 },
  { label: "Until I turn it back on", hours: 24 * 365 },
];
const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "OPEN", label: "Open - waiting on us" },
  { value: "PENDING", label: "Pending - waiting on customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];
const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
const ROLE_LABEL = { OWNER: "Instructor", MODERATOR: "Co-instructor", MEMBER: null } as const;
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function MuteControl({ conversation, onUpdated }: { conversation: ConversationSummary; onUpdated(patch: Partial<ConversationSummary>): void }) {
  const muted = !!conversation.mutedUntil && new Date(conversation.mutedUntil) > new Date();
  async function mute(hours: number | null) {
    const result = await muteConversationAction(conversation.id, hours);
    if ("error" in result) return toast.error(result.error);
    onUpdated({ mutedUntil: result.mutedUntil });
    toast.success(hours ? "Notifications muted" : "Notifications back on");
  }
  if (muted) {
    return (
      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => void mute(null)}>
        <Bell /> Unmute notifications
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full justify-start" />}>
        <BellOff /> Mute notifications
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {MUTE_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.hours} onClick={() => void mute(o.hours)}>
            {o.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-[11px] text-muted-foreground">Unread counts still show; you just won&apos;t be alerted.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TicketControls({ ticket, currentUserId, onUpdated }: { ticket: TicketWire; currentUserId: string; onUpdated(ticket: TicketWire): void }) {
  const [staff, setStaff] = useState<{ id: string; name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    listSupportStaffAction().then((r) => {
      if (!("error" in r)) setStaff(r.staff);
    });
  }, []);
  async function change(patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null }) {
    setSaving(true);
    const result = await updateTicketAction(ticket.id, patch);
    setSaving(false);
    if ("error" in result) return toast.error(result.error);
    onUpdated(result.ticket);
  }
  return (
    <div className="space-y-3">
      {ticket.status === "OPEN" && ticket.lastCustomerMessageAt && (
        <p className="rounded-md bg-amber/15 px-2 py-1.5 text-xs">
          Waiting on us for <strong>{formatRelativeTime(new Date(ticket.lastCustomerMessageAt))}</strong>
        </p>
      )}
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">
        Status
        <select className={selectClass} value={ticket.status} disabled={saving} onChange={(e) => void change({ status: e.target.value as TicketStatus })}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">
        Priority
        <select className={selectClass} value={ticket.priority} disabled={saving} onChange={(e) => void change({ priority: e.target.value as TicketPriority })}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">
        Assignee
        <select className={selectClass} value={ticket.assignee?.id ?? ""} disabled={saving} onChange={(e) => void change({ assigneeId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === currentUserId ? `${s.name ?? "Me"} (me)` : (s.name ?? "Staff member")}
            </option>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Opened</dt>
        <dd suppressHydrationWarning>{new Date(ticket.createdAt).toLocaleString()}</dd>
        <dt className="text-muted-foreground">First reply</dt>
        <dd>{ticket.firstResponseAt ? "sent" : "not yet"}</dd>
      </dl>
    </div>
  );
}

function Members({ conversation, currentUserId, socket, canModerate }: { conversation: ConversationSummary; currentUserId: string; socket: Socket | null; canModerate: boolean }) {
  const [members, setMembers] = useState<Participant[] | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/chat/conversations/${conversation.id}/participants`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { participants: [] }))
      .then((data: { participants: Participant[] }) => {
        if (cancelled) return;
        setMembers(data.participants);
        if (socket?.connected) {
          socket.timeout(5_000).emit("presence:query", data.participants.slice(0, 200).map((p) => p.userId), (err: Error | null, res?: { online?: string[] }) => {
            if (!cancelled && !err && res?.online) setOnline(new Set(res.online));
          });
        }
      })
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [conversation.id, socket]);

  useEffect(() => {
    if (!socket) return;
    const on = ({ userId }: { userId: string }) => setOnline((s) => new Set(s).add(userId));
    const off = ({ userId }: { userId: string }) =>
      setOnline((s) => {
        const next = new Set(s);
        next.delete(userId);
        return next;
      });
    socket.on("user:online", on);
    socket.on("user:offline", off);
    return () => {
      socket.off("user:online", on);
      socket.off("user:offline", off);
    };
  }, [socket]);

  async function timeout(userId: string, minutes: number | null) {
    const result = await timeoutMemberAction(conversation.id, userId, minutes);
    if ("error" in result) return toast.error(result.error);
    toast.success(minutes ? "Posting paused for that member" : "Posting allowed again");
  }
  async function remove(userId: string) {
    const result = await removeMemberAction(conversation.id, userId);
    if ("error" in result) return toast.error(result.error);
    setMembers((m) => m?.filter((p) => p.userId !== userId) ?? m);
    toast.success("Removed from this channel");
  }

  if (!members) return <p className="text-xs text-muted-foreground">Loading members…</p>;
  const sorted = [...members].sort((a, b) => Number(online.has(b.userId)) - Number(online.has(a.userId)));
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"} · {online.size} online
      </p>
      <ul className="space-y-1.5">
        {sorted.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", online.has(m.userId) ? "bg-primary" : "bg-muted-foreground/40")} aria-label={online.has(m.userId) ? "Online" : "Offline"} />
            <span className="min-w-0 flex-1 truncate">{m.user.name ?? "Member"}</span>
            {ROLE_LABEL[m.role] && <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>}
            {canModerate && m.role === "MEMBER" && m.userId !== currentUserId && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`Moderate ${m.user.name ?? "member"}`} />}>
                  <UserMinus />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => void timeout(m.userId, 10)}>Pause posting for 10 min</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void timeout(m.userId, 60 * 24)}>Pause posting for a day</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void timeout(m.userId, null)}>Allow posting again</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void remove(m.userId)}>
                    Remove from channel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChannelModeration({ conversation, onUpdated, onBatchCreated }: { conversation: ConversationSummary; onUpdated(patch: Partial<ConversationSummary>): void; onBatchCreated(conversationId: string): void }) {
  const [batch, setBatch] = useState("");
  async function slow(seconds: number) {
    const result = await setSlowModeAction(conversation.id, seconds);
    if ("error" in result) return toast.error(result.error);
    onUpdated({ slowModeSec: result.slowModeSec });
    toast.success(seconds ? `Slow mode: one message per ${seconds}s` : "Slow mode off");
  }
  async function createBatch() {
    if (!conversation.courseId || !batch.trim()) return;
    const result = await createBatchChannelAction(conversation.courseId, batch);
    if ("error" in result) return toast.error(result.error);
    setBatch("");
    onBatchCreated(result.conversationId);
  }
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">
        Slow mode
        <select className={selectClass} value={conversation.slowModeSec} onChange={(e) => void slow(Number(e.target.value))}>
          <option value={0}>Off</option>
          <option value={10}>One message per 10 seconds</option>
          <option value={30}>One message per 30 seconds</option>
          <option value={120}>One message per 2 minutes</option>
        </select>
      </label>
      <div className="space-y-1 text-xs font-medium text-muted-foreground">
        New batch channel
        <div className="flex gap-1.5">
          <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch 7, Jan 2027" aria-label="Batch channel name" className="h-8" />
          <Button size="sm" variant="outline" onClick={() => void createBatch()} disabled={!batch.trim()} aria-label="Create batch channel">
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChatDetails({
  conversation,
  currentUserId,
  socket,
  isStaff,
  onClose,
  onUpdated,
  onBatchCreated,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  socket: Socket | null;
  isStaff: boolean;
  onClose(): void;
  onUpdated(patch: Partial<ConversationSummary>): void;
  onBatchCreated(conversationId: string): void;
}) {
  const isMember = conversation.role !== null;
  async function toggleBlock() {
    const otherId = conversation.otherUserId;
    if (!otherId) return;
    const blocking = conversation.blocked !== "by_me";
    const result = blocking ? await blockUserAction(otherId) : await unblockUserAction(otherId);
    if ("error" in result) return toast.error(result.error);
    onUpdated(blocking ? { blocked: "by_me", canPost: false, postingBlockedReason: "You blocked this person. Unblock them to send messages." } : { blocked: "none", canPost: true, postingBlockedReason: null });
    toast.success(blocking ? "They can't message you now" : "Unblocked");
  }

  return (
    <aside aria-label="Conversation details" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="font-heading text-sm font-semibold">Details</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
          <X />
        </Button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <p className="font-heading font-semibold">{conversation.label}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.type === "DIRECT" ? "Direct message" : conversation.type === "COURSE_GROUP" ? "Course community channel" : "Support ticket"}
            {conversation.slowModeSec > 0 && ` · slow mode ${conversation.slowModeSec}s`}
          </p>
        </div>

        {conversation.type === "SUPPORT" && conversation.ticket && isStaff && (
          <TicketControls ticket={conversation.ticket} currentUserId={currentUserId} onUpdated={(ticket) => onUpdated({ ticket })} />
        )}
        {conversation.type === "SUPPORT" && conversation.ticket && !isStaff && (
          <div className="rounded-md bg-muted/60 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-3.5" aria-hidden /> Our support team answers here
            </p>
            <p className="mt-1 text-muted-foreground">
              {conversation.ticket.status === "PENDING"
                ? "We've replied - let us know if that solved it."
                : conversation.ticket.status === "RESOLVED"
                  ? "Marked as resolved. Reply to reopen it."
                  : conversation.ticket.status === "CLOSED"
                    ? "This ticket was closed. Write again any time to open a new one."
                    : "We'll reply as soon as we can. You'll get a notification."}
            </p>
          </div>
        )}

        {conversation.type === "COURSE_GROUP" && (
          <Members conversation={conversation} currentUserId={currentUserId} socket={socket} canModerate={conversation.canModerate} />
        )}
        {conversation.type === "COURSE_GROUP" && conversation.canModerate && (
          <ChannelModeration conversation={conversation} onUpdated={onUpdated} onBatchCreated={onBatchCreated} />
        )}

        {isMember && (
          <div className="space-y-2">
            <MuteControl conversation={conversation} onUpdated={onUpdated} />
            {conversation.type === "DIRECT" && conversation.otherUserId && conversation.blocked !== "by_them" && (
              <Button variant={conversation.blocked === "by_me" ? "outline" : "destructive"} size="sm" className="w-full justify-start" onClick={() => void toggleBlock()}>
                <Ban /> {conversation.blocked === "by_me" ? "Unblock" : "Block"} {conversation.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
