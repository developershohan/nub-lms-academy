import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listSupportConversationSummariesForAdmin, listRecentMessagesForAdmin } from "@/server/services/chat-service";
import { ChatShell } from "@/components/chat/chat-shell";
import { MessageModerationFeed } from "@/components/admin/message-moderation-feed";

export default async function AdminMessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [conversations, recentMessages] = await Promise.all([
    listSupportConversationSummariesForAdmin(),
    listRecentMessagesForAdmin(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Support conversations</h1>
        <ChatShell
          currentUser={{ id: user.id, name: user.name }}
          initialConversations={conversations}
          isModerator
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Recent messages (moderation)</h2>
        <MessageModerationFeed
          initialMessages={recentMessages.map((m) => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
            reportedAt: m.reportedAt ? m.reportedAt.toISOString() : null,
            sender: { name: m.sender.name, email: m.sender.email },
            conversation: { type: m.conversation.type, course: m.conversation.course },
          }))}
        />
      </div>
    </div>
  );
}
