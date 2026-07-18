import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listConversationSummariesForUser } from "@/server/services/chat-service";
import { listStudentsForCourse } from "@/server/services/enrollment-service";
import { listTeacherCourses } from "@/server/services/course-service";
import {
  listCoursesAsSubInstructor,
  listSubInstructors,
} from "@/server/services/course-instructor-service";
import { ChatShell, type ChatContact } from "@/components/chat/chat-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubInstructorManager } from "@/components/teacher/sub-instructor-manager";
import { ManualEnrollForm } from "@/components/teacher/manual-enroll-form";

export default async function TeacherMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { courseId } = await searchParams;

  const [ownedCourses, subInstructorRows] = await Promise.all([
    listTeacherCourses(user.id),
    listCoursesAsSubInstructor(user.id),
  ]);

  const accessibleCourses = [
    ...ownedCourses.map((c) => ({ id: c.id, title: c.title, owned: true })),
    ...subInstructorRows
      .filter((r) => !ownedCourses.some((c) => c.id === r.course.id))
      .map((r) => ({ id: r.course.id, title: r.course.title, owned: false })),
  ];

  if (!courseId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-muted-foreground">Pick a course to see its students and staff contacts.</p>
        {accessibleCourses.length === 0 && (
          <p className="text-sm text-muted-foreground">You don&apos;t have any courses yet.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {accessibleCourses.map((c) => (
            <Link key={c.id} href={`/teacher/messages?courseId=${c.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.owned ? "Your course" : "Sub-instructor"}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const selectedCourse = accessibleCourses.find((c) => c.id === courseId);
  if (!selectedCourse) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-destructive">You don&apos;t have access to that course.</p>
        <Link href="/teacher/messages" className="text-sm underline">
          Back to courses
        </Link>
      </div>
    );
  }

  const [conversations, students, subInstructors] = await Promise.all([
    listConversationSummariesForUser(user.id),
    listStudentsForCourse(courseId),
    listSubInstructors(courseId),
  ]);

  const contacts: ChatContact[] = [
    ...students.map((s) => ({
      kind: "direct" as const,
      id: s.id,
      label: s.name ?? s.email,
      group: "Students",
    })),
    ...subInstructors
      .filter((i) => i.user.id !== user.id)
      .map((i) => ({
        kind: "direct" as const,
        id: i.user.id,
        label: i.user.name ?? i.user.email,
        group: "Sub-instructors",
        dropdown: true,
      })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/teacher/messages" className="text-sm text-muted-foreground underline">
            All courses
          </Link>
          <h1 className="text-2xl font-semibold">{selectedCourse.title}</h1>
        </div>
      </div>

      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        contacts={contacts}
        showContactSupport
      />

      {selectedCourse.owned && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SubInstructorManager courseId={courseId} initialInstructors={subInstructors} />
          <ManualEnrollForm courseId={courseId} />
        </div>
      )}
    </div>
  );
}
