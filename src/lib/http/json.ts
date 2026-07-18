import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/**
 * Safely parses and validates a JSON request body against a Zod schema. Every route previously
 * called `request.json()` directly with no try/catch, so a malformed body (or a client that
 * sends no body at all) threw an uncaught exception instead of a clean 400 - this is the shared
 * fix, used consistently across API routes rather than repeating the same try/catch everywhere.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 }) };
  }

  return { data: parsed.data };
}
