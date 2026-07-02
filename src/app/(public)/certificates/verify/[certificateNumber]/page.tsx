import { getCertificateByNumber } from "@/server/services/certificate-service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certificateNumber: string }>;
}) {
  const { certificateNumber } = await params;
  const certificate = await getCertificateByNumber(certificateNumber);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Certificate Verification</CardTitle>
          <CardDescription>Certificate No. {certificateNumber}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!certificate ? (
            <p className="text-destructive">No certificate found with this number.</p>
          ) : (
            <>
              <Badge variant={certificate.revoked ? "outline" : "secondary"}>
                {certificate.revoked ? "Revoked" : "Valid"}
              </Badge>
              <p>
                <span className="text-muted-foreground">Student:</span> {certificate.studentName}
              </p>
              <p>
                <span className="text-muted-foreground">Course:</span> {certificate.courseTitle}
              </p>
              <p>
                <span className="text-muted-foreground">Instructor:</span> {certificate.teacherName}
              </p>
              <p>
                <span className="text-muted-foreground">Completed:</span>{" "}
                {certificate.completedAt.toLocaleDateString()}
              </p>
              <p>
                <span className="text-muted-foreground">Issued:</span> {certificate.issuedAt.toLocaleDateString()}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
