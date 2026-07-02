import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getCertificateForStudent } from "@/server/services/certificate-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function StudentCertificateDetailPage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const certificate = await getCertificateForStudent(user.id, certificateId);
  if (!certificate) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{certificate.courseTitle}</CardTitle>
          <CardDescription>Certificate of Completion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {certificate.revoked && <Badge variant="outline">Revoked</Badge>}
          <p>
            <span className="text-muted-foreground">Student:</span> {certificate.studentName}
          </p>
          <p>
            <span className="text-muted-foreground">Instructor:</span> {certificate.teacherName}
          </p>
          <p>
            <span className="text-muted-foreground">Completed:</span>{" "}
            {certificate.completedAt.toLocaleDateString()}
          </p>
          <p>
            <span className="text-muted-foreground">Certificate No.:</span> {certificate.certificateNumber}
          </p>
          <p>
            <span className="text-muted-foreground">Verify at:</span>{" "}
            /certificates/verify/{certificate.certificateNumber}
          </p>
          {!certificate.revoked && (
            <Button
              className="mt-4 w-full"
              render={<a href={`/api/v1/certificates/${certificate.id}/download`} />}
            >
              Download PDF
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
