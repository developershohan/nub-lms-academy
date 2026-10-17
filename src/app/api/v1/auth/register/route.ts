import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/auth";
import { parseJsonBody } from "@/lib/http/json";
import { registerUser } from "@/server/services/auth-service";
import { clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, registerSchema);
  if ("response" in parsed) return parsed.response;

  const result = await registerUser(parsed.data, { ip: clientIp(request.headers) });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: "rateLimited" in result ? 429 : 409 });
  }
  return NextResponse.json({ ok: true });
}
