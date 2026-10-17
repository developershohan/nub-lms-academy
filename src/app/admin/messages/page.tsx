import { requireChatModerator } from "@/lib/permissions";
import {
  listConversationSummariesForUser,
  listSupportConversationSummariesForAdmin,
} from "@/server/services/chat-service";
import { ChatShell } from "@/components/chat/chat-shell";

export const metadata = { title: "Support & messages" };

/** The shared support queue plus the moderator's own conversations (people they messaged directly). */
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireChatModerator();
  const { c } = await searchParams;
  const [support, own] = await Promise.all([
    listSupportConversationSummariesForAdmin(),
    listConversationSummariesForUser(user.id),
  ]);
  const supportIds = new Set(support.map((s) => s.id));
  const conversations = [...support, ...own.filter((o) => !supportIds.has(o.id))];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Support &amp; messages</h1>
        <p className="text-sm text-muted-foreground">
          Support threads are shared by every moderator. Use New message to search for and message any account.
        </p>
      </div>
      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        initialSelectedId={c ?? null}
        isModerator
        allowStaffSearch
      />
    </div>
  );
}
