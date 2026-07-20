import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleName } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type DemoCourse = {
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  categorySlug: string;
  teacherEmail: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL_LEVELS";
  price: number;
  salePrice?: number;
  isFeatured?: boolean;
  lessons: string[];
};

const DEMO_CATEGORIES = [
  { name: "Web Development", slug: "web-development" },
  { name: "Data Science", slug: "data-science" },
  { name: "UI/UX Design", slug: "ui-ux-design" },
  { name: "Business", slug: "business" },
  { name: "Mobile Development", slug: "mobile-development" },
  { name: "Cybersecurity", slug: "cybersecurity" },
];

// Team members own the demo catalogue (their accounts are created here on a fresh
// DB; existing accounts keep their password — the upsert only refreshes the name).
const DEMO_TEACHERS = [
  { name: "Naima Islam Nisa", email: "naima@nubacademy.local" },
  { name: "Md. Muhiminul Islam", email: "muhiminul@nubacademy.local" },
  { name: "Jannatul Fardaus", email: "jannatul@nubacademy.local" },
  { name: "Ovijit Paul", email: "ovijit@nubacademy.local" },
  { name: "Hasibul Alam", email: "hasibul@nubacademy.local" },
  { name: "Rezaul Karim", email: "rezaul.karim@demo.nubacademy.local" },
];

const DEMO_COURSES: DemoCourse[] = [
  {
    title: "Modern React with Next.js",
    slug: "modern-react-with-nextjs",
    subtitle: "Server components, data fetching, and deployment — the current way.",
    description:
      "Build production React applications with the Next.js App Router: server and client components, forms with server actions, caching, and deployment.",
    categorySlug: "web-development",
    teacherEmail: "naima@nubacademy.local",
    level: "INTERMEDIATE",
    price: 49.99,
    salePrice: 29.99,
    isFeatured: true,
    lessons: ["What the App Router changes", "Server vs client components", "Data fetching and caching", "Forms with server actions", "Deploying to production"],
  },
  {
    title: "HTML & CSS from Zero",
    slug: "html-css-from-zero",
    subtitle: "Your very first website, built properly from the first line.",
    description:
      "Semantic HTML, modern CSS layout with flexbox and grid, and responsive design. No prior experience needed — finish with a portfolio-ready site.",
    categorySlug: "web-development",
    teacherEmail: "naima@nubacademy.local",
    level: "BEGINNER",
    price: 0,
    lessons: ["How the web works", "Semantic HTML structure", "CSS selectors and the cascade", "Flexbox and grid layout", "Responsive design"],
  },
  {
    title: "Node.js REST APIs with PostgreSQL",
    slug: "nodejs-rest-apis-with-postgresql",
    subtitle: "Design, build, and secure a real backend service.",
    description:
      "Express routing, PostgreSQL schema design, authentication with JWT, validation, and testing — everything a junior backend role expects.",
    categorySlug: "web-development",
    teacherEmail: "muhiminul@nubacademy.local",
    level: "INTERMEDIATE",
    price: 39.99,
    lessons: ["REST design basics", "Express routing and middleware", "PostgreSQL schema design", "Auth with JWT", "Testing the API"],
  },
  {
    title: "Python for Data Analysis",
    slug: "python-for-data-analysis",
    subtitle: "From CSV files to confident conclusions with pandas.",
    description:
      "Load, clean, and analyze real datasets with pandas and NumPy, then communicate results with matplotlib. The practical core of every data role.",
    categorySlug: "data-science",
    teacherEmail: "rezaul.karim@demo.nubacademy.local",
    level: "BEGINNER",
    price: 44.99,
    salePrice: 24.99,
    isFeatured: true,
    lessons: ["Setting up Python and Jupyter", "DataFrames and series", "Cleaning messy data", "Grouping and aggregation", "Plotting results"],
  },
  {
    title: "Machine Learning Foundations",
    slug: "machine-learning-foundations",
    subtitle: "The models behind the buzzwords, implemented by hand.",
    description:
      "Regression, classification, evaluation, and overfitting — implemented in scikit-learn with the math explained only where it earns its keep.",
    categorySlug: "data-science",
    teacherEmail: "rezaul.karim@demo.nubacademy.local",
    level: "ADVANCED",
    price: 59.99,
    lessons: ["What learning means", "Linear regression end to end", "Classification and metrics", "Overfitting and validation", "A full project"],
  },
  {
    title: "Figma UI Design Bootcamp",
    slug: "figma-ui-design-bootcamp",
    subtitle: "Wireframe to polished prototype in one tool.",
    description:
      "Frames, auto-layout, components, and prototyping in Figma, plus the typography and spacing fundamentals that make interfaces feel professional.",
    categorySlug: "ui-ux-design",
    teacherEmail: "jannatul@nubacademy.local",
    level: "BEGINNER",
    price: 34.99,
    isFeatured: true,
    lessons: ["Figma tour and frames", "Auto-layout deeply", "Type and spacing systems", "Components and variants", "Clickable prototypes"],
  },
  {
    title: "Design Systems that Scale",
    slug: "design-systems-that-scale",
    subtitle: "Tokens, components, and documentation teams actually use.",
    description:
      "Build a design system from tokens up: naming, theming, component APIs, and the governance that keeps a system alive after launch.",
    categorySlug: "ui-ux-design",
    teacherEmail: "jannatul@nubacademy.local",
    level: "INTERMEDIATE",
    price: 29.99,
    lessons: ["Why systems fail", "Design tokens", "Component API design", "Documentation that gets read", "Adoption and governance"],
  },
  {
    title: "Digital Marketing Essentials",
    slug: "digital-marketing-essentials",
    subtitle: "SEO, ads, and analytics for your first campaigns.",
    description:
      "Search, social, and email fundamentals with hands-on campaign planning and the analytics to know what actually worked.",
    categorySlug: "business",
    teacherEmail: "hasibul@nubacademy.local",
    level: "ALL_LEVELS",
    price: 19.99,
    lessons: ["The marketing funnel", "SEO fundamentals", "Running paid ads", "Email that converts", "Reading analytics"],
  },
  {
    title: "Startup Finance for Founders",
    slug: "startup-finance-for-founders",
    subtitle: "Runway, pricing, and unit economics without the jargon.",
    description:
      "Read a P&L, model your runway, price your product, and understand what investors look at — built for technical founders.",
    categorySlug: "business",
    teacherEmail: "rezaul.karim@demo.nubacademy.local",
    level: "BEGINNER",
    price: 24.99,
    lessons: ["Reading a P&L", "Runway and burn", "Pricing your product", "Unit economics", "Talking to investors"],
  },
  {
    title: "Flutter Mobile Apps",
    slug: "flutter-mobile-apps",
    subtitle: "One codebase, both app stores.",
    description:
      "Widgets, state management, navigation, and publishing — ship a complete Flutter app to Android and iOS from a single Dart codebase.",
    categorySlug: "mobile-development",
    teacherEmail: "ovijit@nubacademy.local",
    level: "INTERMEDIATE",
    price: 49.99,
    salePrice: 34.99,
    isFeatured: true,
    lessons: ["Dart in an afternoon", "Widget tree thinking", "State management options", "Navigation and routing", "Publishing to stores"],
  },
  {
    title: "Android with Kotlin",
    slug: "android-with-kotlin",
    subtitle: "Native Android with Jetpack Compose.",
    description:
      "Kotlin fundamentals, Jetpack Compose UI, ViewModels, and Room persistence — the modern native Android stack from scratch.",
    categorySlug: "mobile-development",
    teacherEmail: "ovijit@nubacademy.local",
    level: "BEGINNER",
    price: 39.99,
    lessons: ["Kotlin fundamentals", "Compose UI basics", "State and ViewModels", "Persistence with Room", "A complete app"],
  },
  {
    title: "Ethical Hacking Fundamentals",
    slug: "ethical-hacking-fundamentals",
    subtitle: "Think like an attacker to defend like a professional.",
    description:
      "Reconnaissance, common web vulnerabilities, and responsible disclosure practiced in legal lab environments — a defensive security foundation.",
    categorySlug: "cybersecurity",
    teacherEmail: "rezaul.karim@demo.nubacademy.local",
    level: "INTERMEDIATE",
    price: 54.99,
    lessons: ["Ethics and lab setup", "Reconnaissance basics", "Common web vulnerabilities", "Hardening and defense", "Responsible disclosure"],
  },
];

/** Demo catalogue so the home page, categories, and course grid render fully. Idempotent. */
async function seedDemoCatalogue() {
  for (const cat of DEMO_CATEGORIES) {
    await prisma.category.upsert({ where: { slug: cat.slug }, create: cat, update: { name: cat.name } });
  }

  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });
  const teacherIds = new Map<string, string>();
  for (const teacher of DEMO_TEACHERS) {
    const user = await prisma.user.upsert({
      where: { email: teacher.email },
      create: {
        email: teacher.email,
        name: teacher.name,
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(randomBytes(18).toString("base64url"), 12),
      },
      update: { name: teacher.name },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: teacherRole.id } },
      create: { userId: user.id, roleId: teacherRole.id },
      update: {},
    });
    teacherIds.set(teacher.email, user.id);
  }

  let publishedAt = new Date("2026-05-01T09:00:00Z");
  for (const course of DEMO_COURSES) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: course.categorySlug } });
    const data = {
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      thumbnailUrl: `/covers/${course.slug}.svg`,
      level: course.level,
      price: course.price,
      salePrice: course.salePrice ?? null,
      isFeatured: course.isFeatured ?? false,
      status: "PUBLISHED" as const,
      publishedAt,
      categoryId: category.id,
      teacherId: teacherIds.get(course.teacherEmail)!,
    };
    const created = await prisma.course.upsert({
      where: { slug: course.slug },
      create: { slug: course.slug, ...data },
      update: data,
    });
    publishedAt = new Date(publishedAt.getTime() + 4 * 24 * 60 * 60 * 1000);

    const existingSections = await prisma.courseSection.count({ where: { courseId: created.id } });
    if (existingSections > 0) continue;

    const midpoint = Math.ceil(course.lessons.length / 2);
    const sections = [
      { title: "Getting started", lessons: course.lessons.slice(0, midpoint) },
      { title: "Going further", lessons: course.lessons.slice(midpoint) },
    ];
    for (const [sectionIndex, section] of sections.entries()) {
      await prisma.courseSection.create({
        data: {
          courseId: created.id,
          title: section.title,
          sortOrder: sectionIndex,
          lessons: {
            create: section.lessons.map((title, lessonIndex) => ({
              title,
              type: "TEXT",
              content: `Demo lesson content for "${title}". Replace with real material.`,
              durationSec: 8 * 60 + ((lessonIndex * 7) % 10) * 60,
              isPreview: sectionIndex === 0 && lessonIndex === 0,
              sortOrder: lessonIndex,
            })),
          },
        },
      });
    }
  }
  console.log(`Seeded ${DEMO_CATEGORIES.length} categories, ${DEMO_TEACHERS.length} demo teachers, ${DEMO_COURSES.length} published courses.`);
}

async function main() {
  const roles: RoleName[] = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"];
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }

  await seedDemoCatalogue();

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.log("Roles seeded. Set ADMIN_EMAIL in .env to also seed a super admin user.");
    return;
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  let user = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!user) {
    const generatedPassword = randomBytes(9).toString("base64url");
    user = await prisma.user.create({
      data: { email: adminEmail, name: "Super Admin", passwordHash: await bcrypt.hash(generatedPassword, 12) },
    });
    console.log(`Created super admin ${adminEmail} with temporary password: ${generatedPassword}`);
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    create: { userId: user.id, roleId: superAdminRole.id },
    update: {},
  });
  console.log(`${adminEmail} now has the SUPER_ADMIN role.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
