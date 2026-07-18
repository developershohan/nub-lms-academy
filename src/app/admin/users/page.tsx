import { listUsersForAdmin } from "@/server/services/user-service";
import { requireAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserBanActions } from "@/components/admin/user-ban-actions";

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
  const users = await listUsersForAdmin(q);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <form className="max-w-sm">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or email"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </form>

      {users.length === 0 && <p className="text-muted-foreground">No users found.</p>}
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
    </div>
  );
}
