import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RegisterForm } from "./register-form";
import { redirectAuthenticatedUser } from "@/lib/permissions";

export default async function RegisterPage() {
  await redirectAuthenticatedUser();

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Start learning with NUB Academy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RegisterForm />
          <p className="text-sm">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
