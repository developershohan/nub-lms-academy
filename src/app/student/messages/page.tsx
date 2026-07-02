import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { listTeachersForStudent, listStudentEnrollments } from "@/server/services/enrollment-service";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";

export default async function StudentMessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [conversations, teachers, enrollments] = await Promise.all([
    listConversationSummariesForUser(user.id),
    listTeachersForStudent(user.id),
    listStudentEnrollments(user.id),
  ]);

  const contacts: ChatContact[] = [
    ...teachers.map((t) => ({ kind: "direct" as const, userId: t.id, label: t.name ?? t.email })),
    ...enrollments.map((e) => ({ kind: "course_group" as const, courseId: e.course.id, label: e.course.title })),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Messages</h1>
      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        contacts={contacts}
        showContactSupport
      />
    </div>
  );
}
