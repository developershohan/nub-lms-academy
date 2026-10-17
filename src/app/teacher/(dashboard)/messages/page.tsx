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
import { SubInstructorManager } from "@/components/teacher/sub-instructor-manager";
import { ManualEnrollForm } from "@/components/teacher/manual-enroll-form";
import { cn } from "@/lib/utils";

export const metadata = { title: "Messages" };

/**
 * The teacher's inbox - every conversation, whichever course it's about - with each course's
 * group chat, students and co-instructors under "New message". `?courseId=` opens that course's
 * tools (co-instructors, manual enrollment) below the inbox; `?c=` opens a conversation.
 */
export default async function TeacherMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; c?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { courseId, c } = await searchParams;

  const [ownedCourses, subInstructorRows, conversations] = await Promise.all([
    listTeacherCourses(user.id),
    listCoursesAsSubInstructor(user.id),
    listConversationSummariesForUser(user.id),
  ]);

  const courses = [
    ...ownedCourses.map((course) => ({ id: course.id, title: course.title, owned: true })),
    ...subInstructorRows
      .filter((r) => !ownedCourses.some((course) => course.id === r.course.id))
      .map((r) => ({ id: r.course.id, title: r.course.title, owned: false })),
  ];

  const perCourse = await Promise.all(
    courses.map(async (course) => ({
      course,
      students: await listStudentsForCourse(course.id),
      instructors: await listSubInstructors(course.id),
    }))
  );

  const contacts: ChatContact[] = [
    ...courses.map((course) => ({
      kind: "course_group" as const,
      id: course.id,
      label: course.title,
      group: "Course group chats",
    })),
    ...perCourse.flatMap(({ course, students }) =>
      students.map((s) => ({ kind: "direct" as const, id: s.id, label: s.name ?? s.email, group: `Students · ${course.title}` }))
    ),
    ...[...new Map(perCourse.flatMap(({ instructors }) => instructors.map((i) => [i.user.id, i.user]))).values()]
      .filter((instructor) => instructor.id !== user.id)
      .map((instructor) => ({
        kind: "direct" as const,
        id: instructor.id,
        label: instructor.name ?? instructor.email,
        group: "Co-instructors",
        dropdown: true,
      })),
  ];

  const toolsCourse = courseId ? courses.find((course) => course.id === courseId && course.owned) : undefined;
  const toolsInstructors = toolsCourse ? perCourse.find((p) => p.course.id === toolsCourse.id)!.instructors : [];

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Messages</h1>
      <ChatShell
        currentUser={{ id: user.id, name: user.name }}
        initialConversations={conversations}
        initialSelectedId={c ?? null}
        contacts={contacts}
        showContactSupport
      />

      {ownedCourses.length > 0 && (
        <section aria-labelledby="course-tools-heading" className="space-y-3">
          <h2 id="course-tools-heading" className="font-heading text-lg font-semibold">
            Course chat tools
          </h2>
          <p className="text-sm text-muted-foreground">Add co-instructors who can answer students, or enroll someone by email.</p>
          <div className="flex flex-wrap gap-2">
            {ownedCourses.map((course) => (
              <Link
                key={course.id}
                href={`/teacher/messages?courseId=${course.id}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm hover:bg-muted",
                  course.id === toolsCourse?.id && "border-primary bg-primary/10"
                )}
              >
                {course.title}
              </Link>
            ))}
          </div>
          {toolsCourse && (
            <div className="grid gap-4 sm:grid-cols-2">
              <SubInstructorManager courseId={toolsCourse.id} initialInstructors={toolsInstructors} />
              <ManualEnrollForm courseId={toolsCourse.id} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
