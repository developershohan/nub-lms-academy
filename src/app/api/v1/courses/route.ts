import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasRole } from "@/lib/permissions";
import { parseJsonBody } from "@/lib/http/json";
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
  // Re-checks the role against the DB rather than trusting the (possibly stale) JWT claim -
  // a demoted teacher's existing session shouldn't keep create access until they re-login.
  const user = await getCurrentUser();
  if (!user || !hasRole(user.roles, "TEACHER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody(request, createSchema);
  if ("response" in parsed) return parsed.response;

  const course = await createCourse(user.id, parsed.data.title);
  return NextResponse.json({ course }, { status: 201 });
}
