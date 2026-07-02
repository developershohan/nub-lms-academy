import { listCertificatesForAdmin } from "@/server/services/certificate-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevokeCertificateButton } from "@/components/admin/revoke-certificate-button";

export default async function AdminCertificatesPage() {
  const certificates = await listCertificatesForAdmin();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>
      {certificates.length === 0 && <p className="text-muted-foreground">No certificates issued yet.</p>}
      <div className="space-y-3">
        {certificates.map((certificate) => (
          <Card key={certificate.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{certificate.courseTitle}</CardTitle>
              <Badge variant={certificate.revoked ? "outline" : "secondary"}>
                {certificate.revoked ? "Revoked" : "Valid"}
              </Badge>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>{certificate.user.name ?? certificate.user.email}</p>
                <p>No. {certificate.certificateNumber}</p>
              </div>
              {!certificate.revoked && <RevokeCertificateButton certificateId={certificate.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
