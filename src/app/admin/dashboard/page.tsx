import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const [userCount, pendingTeachers] = await Promise.all([
    prisma.user.count(),
    prisma.teacherProfile.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin overview</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Total users</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{userCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending teacher applications</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{pendingTeachers}</CardContent>
        </Card>
      </div>
    </div>
  );
}
