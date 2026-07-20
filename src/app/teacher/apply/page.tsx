import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck, CircleDollarSign, Clock, LayoutList, Users, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ApplyButton } from "@/components/teacher/apply-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Become a teacher — NUB Academy",
  description: "Apply to create and sell courses on NUB Academy.",
};

const benefits = [
  {
    icon: LayoutList,
    title: "A real course editor",
    body: "Build your curriculum in sections and lessons — video or text — with quizzes to check understanding.",
  },
  {
    icon: CircleDollarSign,
    title: "You set the price",
    body: "Sell courses one-off with optional sale pricing, or opt into the platform subscription.",
  },
  {
    icon: Users,
    title: "Students come to you",
    body: "Published courses appear in the catalogue, category shelves, and the home page.",
  },
  {
    icon: BadgeCheck,
    title: "Certificates that hold up",
    body: "Students who finish your course get a certificate anyone can verify by its number.",
  },
];

const processSteps = [
  { title: "Apply", body: "One click below — your account becomes the application." },
  { title: "Review", body: "An admin reviews it; you'll get a notification either way." },
  { title: "Build & publish", body: "Approved teachers get the editor. Courses go live after a quality check." },
];

export default async function TeacherApplyPage() {
  // The pitch is public; only the application action needs an account.
  const session = await auth();
  const userId = session?.user?.id;

  const profile = userId
    ? await prisma.teacherProfile.findUnique({ where: { userId } })
    : null;
  // Reads the application record itself rather than the (possibly stale) JWT role claim, so an
  // approval takes effect on the very next load instead of requiring a fresh login.
  if (profile?.status === "APPROVED") redirect("/teacher/dashboard");

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Pitch */}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Teach on NUB
        </p>
        <h1 className="mt-3 font-heading text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.08] tracking-tight">
          Turn what you know into a <span className="marker-amber">course</span>.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          NUB Academy handles the platform — enrollment, payments, progress tracking, chat, and
          certificates — so you can spend your time on the material.
        </p>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="flex gap-3">
              <benefit.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h2 className="font-heading text-base font-semibold">{benefit.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Application card */}
      <div className="lg:pt-10">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {profile?.status === "PENDING" ? (
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-amber px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-widest text-amber-foreground">
                <Clock className="size-3.5" aria-hidden />
                Under review
              </span>
              <h2 className="mt-4 font-heading text-2xl font-semibold">Application received</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                An admin is reviewing your application. You&apos;ll get a notification here on the
                platform as soon as there&apos;s a decision — nothing else to do for now.
              </p>
            </div>
          ) : profile?.status === "REJECTED" ? (
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-destructive/10 px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-widest text-destructive">
                <XCircle className="size-3.5" aria-hidden />
                Not approved
              </span>
              <h2 className="mt-4 font-heading text-2xl font-semibold">
                Your application wasn&apos;t approved
              </h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                This decision was made by a platform admin. If you think it&apos;s a mistake or your
                situation has changed, contact the academy team through your account messages.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="font-heading text-2xl font-semibold">Ready when you are</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                Applying takes one click — your account is the application. Here&apos;s what happens
                next:
              </p>
              <ol className="mt-6 space-y-4">
                {processSteps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                      0{index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                {userId ? (
                  <ApplyButton />
                ) : (
                  <div className="space-y-3">
                    <Button render={<Link href="/login" />} size="lg" className="w-full">
                      Log in to apply
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      New here?{" "}
                      <Link href="/register" className="font-medium text-primary hover:underline">
                        Create an account
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
