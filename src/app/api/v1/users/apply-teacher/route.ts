import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyForTeacher } from "@/server/services/teacher-service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await applyForTeacher(session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ status: result.status });
}
