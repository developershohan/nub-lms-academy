import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/auth";
import { parseJsonBody } from "@/lib/http/json";
import { registerUser } from "@/server/services/auth-service";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, registerSchema);
  if ("response" in parsed) return parsed.response;

  const result = await registerUser(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
