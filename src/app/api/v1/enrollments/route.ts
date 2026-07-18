import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enrollInFreeCourse, listStudentEnrollments } from "@/server/services/enrollment-service";
import { parseJsonBody } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const enrollments = await listStudentEnrollments(session.user.id);
  return NextResponse.json({ enrollments });
}

const enrollSchema = z.object({ courseId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, enrollSchema);
  if ("response" in parsed) return parsed.response;

  const result = await enrollInFreeCourse(session.user.id, parsed.data.courseId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
