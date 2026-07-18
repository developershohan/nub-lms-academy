import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { listTeachersForStudent, listStudentEnrollments, listClassmates } from "@/server/services/enrollment-service";
import { listSubInstructorsForStudent } from "@/server/services/course-instructor-service";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";

export default async function StudentMessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [conversations, teachers, enrollments, classmates, subInstructors] = await Promise.all([
    listConversationSummariesForUser(user.id),
    listTeachersForStudent(user.id),
    listStudentEnrollments(user.id),
    listClassmates(user.id),
    listSubInstructorsForStudent(user.id),
  ]);

  const contacts: ChatContact[] = [
    // Dropdown: the small, fixed set of staff-ish contacts.
    ...teachers.map((t) => ({
      kind: "direct" as const,
      id: t.id,
      label: t.name ?? t.email,
      group: "Teachers",
      dropdown: true,
    })),
    ...subInstructors.map((s) => ({
      kind: "direct" as const,
      id: s.user.id,
      label: s.user.name ?? s.user.email,
      group: "Sub-instructors",
      dropdown: true,
    })),
    // List: courses (group chat) and classmates, which can grow large.
    ...enrollments.map((e) => ({
      kind: "course_group" as const,
      id: e.course.id,
      label: e.course.title,
      group: "Course chat",
    })),
    ...classmates.map((c) => ({
      kind: "direct" as const,
      id: c.id,
      label: c.name ?? c.email,
      group: "Classmates",
    })),
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
