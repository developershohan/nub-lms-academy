import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { listPublishedCourses, createCourse } from "@/server/services/course-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courses = await listPublishedCourses({
    q: searchParams.get("q") ?? undefined,
    categorySlug: searchParams.get("category") ?? undefined,
  });
  return NextResponse.json({ courses });
}

const createSchema = z.object({ title: z.string().min(3) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.roles.includes("TEACHER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const course = await createCourse(session.user.id, parsed.data.title);
  return NextResponse.json({ course }, { status: 201 });
}
