import { BookOpen, Star, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExpandableText } from "@/components/course/expandable-text";
import { formatCount } from "@/lib/format";

function initials(name: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function InstructorCard({
  teacher,
  summary,
}: {
  teacher: { name: string | null; image: string | null; teacherProfile: { headline: string | null; bio: string | null } | null };
  summary: { courseCount: number; studentCount: number; rating: number | null; reviewCount: number };
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {teacher.image && <AvatarImage src={teacher.image} alt="" />}
          <AvatarFallback className="bg-primary/10 font-heading text-lg text-primary">{initials(teacher.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-heading text-lg font-semibold">{teacher.name ?? "Instructor"}</p>
          {teacher.teacherProfile?.headline && (
            <p className="text-sm text-muted-foreground">{teacher.teacherProfile.headline}</p>
          )}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {summary.rating != null && (
          <li className="flex items-center gap-1.5">
            <Star className="size-4 text-amber" fill="currentColor" strokeWidth={0} aria-hidden />
            {summary.rating.toFixed(1)} instructor rating
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Users className="size-4" aria-hidden />
          {formatCount(summary.studentCount)} {summary.studentCount === 1 ? "student" : "students"}
        </li>
        <li className="flex items-center gap-1.5">
          <BookOpen className="size-4" aria-hidden />
          {summary.courseCount} {summary.courseCount === 1 ? "course" : "courses"}
        </li>
      </ul>
      {teacher.teacherProfile?.bio && <ExpandableText text={teacher.teacherProfile.bio} collapseAfter={400} />}
    </div>
  );
}
