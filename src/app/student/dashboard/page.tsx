import { getCurrentUser } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function StudentDashboardPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome back{user?.name ? `, ${user.name}` : ""}</h1>
      <Card>
        <CardHeader>
          <CardTitle>My courses</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          You haven&apos;t enrolled in any courses yet. Course browsing arrives in Phase 2.
        </CardContent>
      </Card>
    </div>
  );
}
