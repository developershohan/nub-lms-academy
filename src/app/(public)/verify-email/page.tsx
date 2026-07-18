import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/server/services/auth-service";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;
  const result = token && email ? await verifyEmail(email, token) : { error: "Missing verification link" as const };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{"error" in result ? "Verification failed" : "Email verified"}</CardTitle>
          <CardDescription>
            {"error" in result
              ? result.error
              : "Your email is confirmed. You can log in now."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link href="/login" />}>
            Go to login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
