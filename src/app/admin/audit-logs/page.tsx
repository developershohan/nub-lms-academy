import { listAuditLogsForAdmin } from "@/server/services/audit-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminAuditLogsPage() {
  const logs = await listAuditLogsForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit logs</h1>
      {logs.length === 0 && <p className="text-muted-foreground">No audit log entries yet.</p>}
      <div className="space-y-2">
        {logs.map((log) => (
          <Card key={log.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">
                <Badge variant="outline" className="mr-2">
                  {log.action}
                </Badge>
                {log.targetType}
                {" · "}
                {log.targetId}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{log.createdAt.toLocaleString()}</span>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>By {log.actor ? (log.actor.name ?? log.actor.email) : "System"}</p>
              {log.metadata != null && (
                <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
