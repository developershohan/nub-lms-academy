import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApplyButton } from "@/components/teacher/apply-button";

export default async function TeacherApplyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.roles.includes("TEACHER")) redirect("/teacher/dashboard");

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: session.user.id } });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center justify-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Become a teacher</CardTitle>
          <CardDescription>Apply to start creating courses on NUB Academy</CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.status === "PENDING" && (
            <p className="text-muted-foreground">Your application is under review.</p>
          )}
          {profile?.status === "REJECTED" && (
            <p className="text-muted-foreground">Your application was rejected.</p>
          )}
          {!profile && <ApplyButton />}
        </CardContent>
      </Card>
    </div>
  );
}
