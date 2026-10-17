import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { parseJsonBody } from "@/lib/http/json";
import { requestPasswordReset } from "@/server/services/auth-service";
import { clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, forgotPasswordSchema);
  if ("response" in parsed) return parsed.response;

  const result = await requestPasswordReset(parsed.data.email, { ip: clientIp(request.headers) });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 429 });
  return NextResponse.json({ ok: true });
}
