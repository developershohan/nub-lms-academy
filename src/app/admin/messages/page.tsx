import { requireChatModerator } from "@/lib/permissions";
import { listSupportConversationSummariesForAdmin } from "@/server/services/chat-service";
import { ChatShell } from "@/components/chat/chat-shell";

export default async function AdminMessagesPage() {
  const user = await requireChatModerator();
  const conversations = await listSupportConversationSummariesForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Support &amp; messages</h1>
      <p className="text-sm text-muted-foreground">
        The Support queue below is shared by all moderators. Use &quot;Message staff&quot; to search and message
        any account directly.
      </p>
      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        isModerator
        allowStaffSearch
      />
    </div>
  );
}
