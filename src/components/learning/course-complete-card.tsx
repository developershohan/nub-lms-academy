import Link from "next/link";
import { Award, ListChecks, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CertificateStatus =
  | { status: "issued"; certificateId: string }
  | { status: "ready" }
  | { status: "unavailable" };

export function certificateHref(certificate: CertificateStatus) {
  if (certificate.status === "issued") return `/student/certificates/${certificate.certificateId}`;
  if (certificate.status === "ready") return "/student/certificates";
  return null;
}

/** Shown once every lesson is done: the certificate when it's been issued or earned, otherwise
 * the quizzes still standing between the student and it. */
export function CourseCompleteCard({
  courseTitle,
  lessonCount,
  certificate,
  pendingQuizzes,
}: {
  courseTitle: string;
  lessonCount: number;
  certificate: CertificateStatus;
  pendingQuizzes: { id: string; title: string }[];
}) {
  const href = certificateHref(certificate);
  const message =
    certificate.status === "issued"
      ? "Your certificate is ready to view, download and share."
      : certificate.status === "ready"
        ? "You've earned a certificate of completion. Claim it now."
        : pendingQuizzes.length > 0
          ? `You've finished all ${lessonCount} lessons. Pass the remaining ${pendingQuizzes.length === 1 ? "quiz" : "quizzes"} to earn your certificate.`
          : `You've finished all ${lessonCount} lessons. Nice work.`;

  return (
    <section
      aria-labelledby="course-complete-title"
      className="mt-8 rounded-xl border border-amber/60 bg-amber/10 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber text-amber-foreground">
          <Trophy className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-amber-foreground dark:text-amber">
            Course complete
          </p>
          <h2 id="course-complete-title" className="font-heading text-xl leading-snug font-semibold">
            You finished {courseTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {href && (
          <Button size="lg" className="shrink-0 px-4" render={<Link href={href} />}>
            <Award aria-hidden />
            {certificate.status === "issued" ? "View certificate" : "Get your certificate"}
          </Button>
        )}
      </div>
      {!href && pendingQuizzes.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 sm:pl-16">
          {pendingQuizzes.map((quiz) => (
            <li key={quiz.id}>
              <Button variant="outline" size="sm" render={<Link href={`/student/quiz/${quiz.id}`} />}>
                <ListChecks aria-hidden />
                {quiz.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
