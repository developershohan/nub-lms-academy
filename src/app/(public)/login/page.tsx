import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { signInWithGoogleAction, signInWithGitHubAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Welcome back to NUB Academy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm callbackUrl={callbackUrl ?? "/"} />

          <div className="space-y-2">
            <form action={signInWithGoogleAction}>
              <Button type="submit" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </form>
            <form action={signInWithGitHubAction}>
              <Button type="submit" variant="outline" className="w-full">
                Continue with GitHub
              </Button>
            </form>
          </div>

          <div className="flex justify-between text-sm">
            <Link href="/register" className="underline">
              Create an account
            </Link>
            <Link href="/forgot-password" className="underline">
              Forgot password?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
