import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http/json";
import { generateCertificate } from "@/server/services/certificate-service";

const schema = z.object({ courseId: z.string().min(1) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = await parseJsonBody(request, schema);
  if ("response" in parsed) return parsed.response;

  const result = await generateCertificate(session.user.id, parsed.data.courseId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ certificate: result.certificate });
}
