import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { listTeachersForStudent, listStudentEnrollments, listClassmates } from "@/server/services/enrollment-service";
import { listSubInstructorsForStudent } from "@/server/services/course-instructor-service";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Messages" };

export default async function StudentMessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { c } = await searchParams;
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
      label: c.name ?? "Classmate",
      group: "Classmates",
    })),
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Messages</h1>
      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        initialSelectedId={c ?? null}
        contacts={contacts}
        showContactSupport
        emptyState={
          <EmptyState
            icon={MessagesSquare}
            title="No messages yet"
            description={
              enrollments.length > 0
                ? "Ask your teacher a question, join a course's group chat or say hello to a classmate. Pick someone from the list to start."
                : "Once you enroll in a course you can message its teacher and classmates here. Need help now? Use New message, then Customer support."
            }
            className="h-full justify-center rounded-none border-0 bg-transparent"
          >
            {enrollments.length === 0 && (
              <Button size="lg" render={<Link href="/courses" />}>
                Browse courses
              </Button>
            )}
          </EmptyState>
        }
      />
    </div>
  );
}
