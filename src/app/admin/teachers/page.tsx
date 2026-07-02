import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherReviewActions } from "@/components/admin/teacher-review-actions";

export default async function AdminTeachersPage() {
  const pending = await prisma.teacherProfile.findMany({
    where: { status: "PENDING" },
    include: { user: true },
    orderBy: { appliedAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Teacher applications</h1>
      {pending.length === 0 && (
        <p className="text-muted-foreground">No pending applications.</p>
      )}
      <div className="space-y-4">
        {pending.map((profile) => (
          <Card key={profile.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {profile.user.name ?? profile.user.email}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{profile.user.email}</span>
              <TeacherReviewActions teacherId={profile.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
