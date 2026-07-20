import { listUsersForAdmin } from "@/server/services/user-service";
import { listCoursesForAdmin } from "@/server/services/course-service";
import { requireAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserBanActions } from "@/components/admin/user-ban-actions";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { AssignToCourseForm } from "@/components/admin/assign-to-course-form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchInput } from "@/components/ui/search-input";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  ACTIVE: "secondary",
  SUSPENDED: "outline",
  BANNED: "destructive",
  DELETED: "outline",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const [users, courses] = await Promise.all([listUsersForAdmin(q), listCoursesForAdmin()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="create-user">Create user</TabsTrigger>
          <TabsTrigger value="assign">Assign to course</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 pt-4">
          <SearchInput placeholder="Search by name or email" className="max-w-sm" />

          {users.length === 0 && (
            <p className="text-muted-foreground">
              {q ? `No users match "${q}".` : "No users found."}
            </p>
          )}
          <div className="space-y-3">
            {users.map((user) => {
              const roles = user.roles.map((r) => r.role.name);
              const banned = user.status === "BANNED";
              const latestBan = user.bans[0];
              return (
                <Card key={user.id}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{user.name ?? user.email}</CardTitle>
                    <div className="flex gap-2">
                      {roles.map((r) => (
                        <Badge key={r} variant="outline">
                          {r.replace("_", " ")}
                        </Badge>
                      ))}
                      <Badge variant={STATUS_VARIANT[user.status] ?? "outline"}>{user.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <p>{user.email}</p>
                      {banned && latestBan && <p>Reason: {latestBan.reason}</p>}
                    </div>
                    {!roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN") && (
                      <UserBanActions userId={user.id} banned={banned} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="create-user" className="pt-4">
          <CreateUserForm />
        </TabsContent>

        <TabsContent value="assign" className="pt-4">
          <AssignToCourseForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
