import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { parseJsonBody } from "@/lib/http/json";
import { resetPassword } from "@/server/services/auth-service";

export async function POST(request: Request) {
  // email is validated as part of the schema (not read from the URL query string) - a state-
  // changing POST shouldn't carry PII in the URL, where it lingers in server/proxy access logs.
  const parsed = await parseJsonBody(request, resetPasswordSchema);
  if ("response" in parsed) return parsed.response;

  const result = await resetPassword(parsed.data.email, parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
