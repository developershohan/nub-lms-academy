import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { listStudentsForTeacher } from "@/server/services/enrollment-service";
import { listTeacherCourses } from "@/server/services/course-service";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";

export default async function TeacherMessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [conversations, students, courses] = await Promise.all([
    listConversationSummariesForUser(user.id),
    listStudentsForTeacher(user.id),
    listTeacherCourses(user.id),
  ]);

  const contacts: ChatContact[] = [
    ...students.map((s) => ({ kind: "direct" as const, userId: s.id, label: s.name ?? s.email })),
    ...courses.map((c) => ({ kind: "course_group" as const, courseId: c.id, label: c.title })),
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
