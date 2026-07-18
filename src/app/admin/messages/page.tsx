import { requireChatModerator } from "@/lib/permissions";
import { listSupportConversationSummariesForAdmin, listRecentMessagesForAdmin } from "@/server/services/chat-service";
import { listCoursesForAdmin } from "@/server/services/course-service";
import { ChatShell } from "@/components/chat/chat-shell";
import { MessageModerationFeed } from "@/components/admin/message-moderation-feed";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AssignToCourseForm } from "@/components/admin/assign-to-course-form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function AdminMessagesPage() {
  const user = await requireChatModerator();
  const isFullAdmin = user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");

  const [conversations, recentMessages, courses] = await Promise.all([
    listSupportConversationSummariesForAdmin(),
    listRecentMessagesForAdmin(),
    isFullAdmin ? listCoursesForAdmin() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Support &amp; messages</h1>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          {isFullAdmin && <TabsTrigger value="create-user">Create user</TabsTrigger>}
          {isFullAdmin && <TabsTrigger value="assign">Assign to course</TabsTrigger>}
        </TabsList>

        <TabsContent value="messages" className="space-y-8 pt-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The Support queue below is shared by all moderators. Use &quot;Message staff&quot; to search and
              message any account directly.
            </p>
            <ChatShell
              currentUser={{ id: user.id, name: user.name }}
              initialConversations={conversations}
              isModerator
              allowStaffSearch
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
        </TabsContent>

        {isFullAdmin && (
          <TabsContent value="create-user" className="pt-4">
            <CreateUserForm />
          </TabsContent>
        )}

        {isFullAdmin && (
          <TabsContent value="assign" className="pt-4">
            <AssignToCourseForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
