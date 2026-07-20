import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { listFeaturedCourses } from "@/server/services/course-service";
import { listCategoriesWithCounts } from "@/server/services/category-service";
import { CourseCard } from "@/components/course/course-card";
import { categoryStyle } from "@/lib/category-style";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/permissions";
import { getRoleHome } from "@/lib/role-home";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{children}</p>
  );
}

function SpotlightCard({
  course,
}: {
  course: Awaited<ReturnType<typeof listFeaturedCourses>>[number];
}) {
  const spine = course.category ? categoryStyle(course.category) : null;
  const price = Number(course.price);
  const salePrice = course.salePrice != null ? Number(course.salePrice) : null;

  return (
    <div className="relative motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
      {/* second card peeking behind — the one playful moment on this page */}
      <div className="absolute inset-0 -rotate-2 rounded-xl border bg-card shadow-sm" aria-hidden />
      <Link
        href={`/courses/${course.slug}`}
        className="group relative block rotate-[1.25deg] rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <article className="relative overflow-hidden rounded-xl border bg-card shadow-md transition-shadow duration-200 group-hover:shadow-lg">
          <span className={cn("absolute inset-y-0 left-0 z-10 w-1.5", spine?.bar ?? "bg-border")} aria-hidden />
          <div className={cn("relative aspect-video", spine?.tint ?? "bg-muted")}>
            {course.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute right-3 top-3 rounded-sm bg-amber px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-widest text-amber-foreground">
              Featured
            </span>
            {spine && (
              <span
                className={cn(
                  "absolute left-4 top-3 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-widest",
                  spine.bar,
                  spine.onBar
                )}
              >
                {spine.code}
              </span>
            )}
          </div>
          <div className="space-y-2 p-5 pl-6">
            <h3 className="font-heading text-xl font-semibold leading-snug">{course.title}</h3>
            {course.subtitle && <p className="line-clamp-2 text-sm text-muted-foreground">{course.subtitle}</p>}
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="text-muted-foreground">{course.teacher.name}</span>
              <span className="font-mono font-medium">
                {salePrice != null ? (
                  <>
                    <span className="mr-1.5 text-muted-foreground line-through">${price.toFixed(2)}</span>$
                    {salePrice.toFixed(2)}
                  </>
                ) : price === 0 ? (
                  "Free"
                ) : (
                  `$${price.toFixed(2)}`
                )}
              </span>
            </div>
          </div>
        </article>
      </Link>
    </div>
  );
}

const steps = [
  {
    icon: UserPlus,
    title: "Enroll",
    body: "Create an account and pick a course — buy it once or take it with a subscription.",
  },
  {
    icon: BookOpen,
    title: "Learn",
    body: "Work through video and text lessons at your pace; quizzes check what stuck.",
  },
  {
    icon: BadgeCheck,
    title: "Get certified",
    body: "Finish the course and download a certificate anyone can verify by its number.",
  },
];

export default async function HomePage() {
  const [user, featured, categories, courseCount, teacherCount] = await Promise.all([
    getCurrentUser(),
    listFeaturedCourses(7),
    listCategoriesWithCounts(),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.course
      .findMany({ where: { status: "PUBLISHED" }, distinct: ["teacherId"], select: { teacherId: true } })
      .then((rows) => rows.length),
  ]);
  const [spotlight, ...rail] = featured;
  const primaryAccountHref = user ? getRoleHome(user.roles) : "/register";
  const stats = [
    { value: courseCount, label: "courses" },
    { value: categories.filter((c) => c._count.courses > 0).length, label: "categories" },
    { value: teacherCount, label: "instructors" },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <Eyebrow>Catalogue · {new Date().getFullYear()}</Eyebrow>
            <h1 className="mt-4 font-heading text-[clamp(2.5rem,6vw,4.25rem)] font-bold leading-[1.05] tracking-tight">
              Learn it <span className="marker-amber">properly</span>, from people who teach for a living.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Structured courses with real instructors, quizzes that check your understanding, and a
              certificate you can verify — built at Northern University Bangladesh.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button render={<Link href="/courses" />} size="lg">
                Browse courses
              </Button>
              <Button render={<Link href={primaryAccountHref} />} variant="outline" size="lg">
                {user ? "Go to dashboard" : "Start free"}
              </Button>
            </div>
            <dl className="mt-10 flex gap-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dd className="font-heading text-2xl font-bold">{stat.value}</dd>
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
          {spotlight && (
            <div className="px-2 sm:px-6 lg:px-0">
              <SpotlightCard course={spotlight} />
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Browse the shelves</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">By category</h2>
          </div>
          <Link
            href="/categories"
            className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            All categories
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories
            .filter((category) => category._count.courses > 0)
            .map((category) => {
            const spine = categoryStyle(category);
            return (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group relative overflow-hidden rounded-xl border bg-card p-5 pl-6 transition-all duration-200 hover:border-foreground/20 hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className={cn("absolute inset-y-0 left-0 w-1", spine.bar)} aria-hidden />
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-widest",
                      spine.bar,
                      spine.onBar
                    )}
                  >
                    {spine.code}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <h3 className="mt-4 font-heading text-lg font-semibold">{category.name}</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {category._count.courses} {category._count.courses === 1 ? "course" : "courses"}
                </p>
              </Link>
            );
            })}
        </div>
      </section>

      {/* Featured courses */}
      {rail.length > 0 && (
        <section className="border-t bg-sidebar">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <div className="flex items-end justify-between gap-4">
              <div>
                <Eyebrow>Hand-picked</Eyebrow>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">Featured courses</h2>
              </div>
              <Link
                href="/courses"
                className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View all
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rail.slice(0, 6).map((course) => (
                <CourseCard key={course.slug} course={course} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works — a real sequence, hence the numbers */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Three steps, one certificate</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <step.icon className="size-6 text-primary" aria-hidden />
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="mt-4 font-heading text-lg font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Teach on NUB */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:pb-24">
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12">
          <div className="max-w-2xl">
            <Badge className="bg-amber text-amber-foreground hover:bg-amber">For instructors</Badge>
            <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
              Know something worth teaching?
            </h2>
            <p className="mt-3 leading-relaxed text-primary-foreground/85">
              Apply as a teacher, build your curriculum in our course editor, and reach students the
              day your course is approved.
            </p>
            <Button
              render={<Link href="/teacher/apply" />}
              size="lg"
              className="mt-6 bg-amber text-amber-foreground hover:bg-amber/90"
            >
              Become a teacher
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
