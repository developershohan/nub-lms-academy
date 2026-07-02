import { getCurrentUser } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeacherDashboardPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your courses</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Course creation tools arrive in Phase 2.
        </CardContent>
      </Card>
    </div>
  );
}
