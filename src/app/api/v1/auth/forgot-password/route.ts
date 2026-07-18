import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { parseJsonBody } from "@/lib/http/json";
import { requestPasswordReset } from "@/server/services/auth-service";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, forgotPasswordSchema);
  if ("response" in parsed) return parsed.response;

  await requestPasswordReset(parsed.data.email);
  return NextResponse.json({ ok: true });
}
