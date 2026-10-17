import { requireChatModerator } from "@/lib/permissions";
import { getChatUser } from "@/server/chat/access";
import { listOpenReports } from "@/server/chat/safety";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { SupportInbox } from "@/components/chat/support-inbox";

export const metadata = { title: "Support & messages" };

const TABS = ["tickets", "inbox", "reports"] as const;

/** The shared support queue, the moderator's own conversations, and reported messages. `?c=` opens a thread. */
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string; c?: string }> }) {
  const user = await requireChatModerator();
  const { tab, c } = await searchParams;
  const chatUser = (await getChatUser(user.id))!;
  const [conversations, reports] = await Promise.all([listConversationSummariesForUser(user.id), listOpenReports(chatUser)]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Support &amp; messages</h1>
        <p className="text-sm text-muted-foreground">
          The ticket queue is shared by every support agent. New requests and replies appear instantly.
        </p>
      </div>
      <SupportInbox
        currentUser={{ id: user.id, name: user.name }}
        initialTab={TABS.find((t) => t === tab) ?? "tickets"}
        initialConversationId={c ?? null}
        conversations={conversations}
        reports={reports}
      />
    </div>
  );
}
