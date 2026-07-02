import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const MESSAGES: Record<string, string> = {
  AccessDenied: "Your account cannot sign in right now. It may be banned or suspended.",
  Configuration: "There is a problem with the server configuration.",
  Verification: "The sign in link is no longer valid.",
  Default: "Something went wrong while signing you in.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: code = "Default" } = await searchParams;
  const message = MESSAGES[code] ?? MESSAGES.Default;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in error</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} className="w-full">
            Back to login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
