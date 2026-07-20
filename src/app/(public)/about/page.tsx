import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About us — NUB Academy",
  description:
    "NUB Academy is a learning platform built by a six-member student team at Northern University Bangladesh.",
};

// Demo portraits live in /public/team/<slug>.svg — drop real photos in as
// /team/<slug>.jpg and update the `photo` paths below.
const team = [
  {
    name: "Shohanur Rahman",
    role: "Team Leader",
    focus: "Full-stack & architecture",
    photo: "/team/shohanur-rahman.svg",
  },
  {
    name: "Naima Islam Nisa",
    role: "Frontend Developer",
    focus: "Interfaces & accessibility",
    photo: "/team/naima-islam-nisa.svg",
  },
  {
    name: "Md. Muhiminul Islam",
    role: "Backend Developer",
    focus: "APIs & integrations",
    photo: "/team/md-muhiminul-islam.svg",
  },
  {
    name: "Jannatul Fardaus",
    role: "UI/UX Designer",
    focus: "Design system & flows",
    photo: "/team/jannatul-fardaus.svg",
  },
  {
    name: "Ovijit Paul",
    role: "Database & DevOps",
    focus: "Schema & deployment",
    photo: "/team/ovijit-paul.svg",
  },
  {
    name: "Hasibul Alam",
    role: "QA & Documentation",
    focus: "Testing & docs",
    photo: "/team/hasibul-alam.svg",
  },
];

const stack = ["Next.js", "React", "TypeScript", "Prisma", "PostgreSQL", "Stripe", "Socket.IO", "Resend"];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      {/* Statement */}
      <div className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">The team</p>
        <h1 className="mt-3 font-heading text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.08] tracking-tight">
          Six students, one <span className="marker-amber">academy</span>.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          NUB Academy started as a capstone project at Northern University Bangladesh and grew into a
          working learning platform: teachers build courses in a real curriculum editor, students
          learn through video and text lessons, quizzes check understanding, and every completed
          course ends in a certificate that anyone can verify. Payments, subscriptions, live chat,
          and moderation all work — because we needed them to.
        </p>
      </div>

      {/* Team grid */}
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((member) => (
          <li
            key={member.name}
            className="group overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-md motion-safe:hover:-translate-y-0.5"
          >
            <div className="aspect-square overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={member.photo}
                alt={`Portrait of ${member.name}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-semibold">{member.name}</h2>
                {member.role === "Team Leader" && (
                  <span className="rounded-sm bg-amber px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-amber-foreground">
                    Lead
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-medium text-primary">{member.role}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{member.focus}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Stack — real content instead of testimonials */}
      <div className="mt-16 rounded-2xl border bg-sidebar p-8 sm:p-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Built with
            </p>
            <p className="mt-2 text-muted-foreground">
              The platform is open about its plumbing — the same stack we teach is the stack we
              ship on.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {stack.map((tech) => (
                <li
                  key={tech}
                  className="rounded-sm border bg-card px-2 py-1 font-mono text-xs text-foreground/80"
                >
                  {tech}
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0">
            <p className="font-heading text-xl font-semibold">Want to see it in action?</p>
            <div className="mt-4 flex gap-3">
              <Button render={<Link href="/courses" />}>Browse courses</Button>
              <Button render={<Link href="/teacher/apply" />} variant="outline">
                Teach with us
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
