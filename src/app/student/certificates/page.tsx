import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listCertificatesForStudent, listCertificateEligibleCourses } from "@/server/services/certificate-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GenerateCertificateButton } from "@/components/student/generate-certificate-button";

export default async function StudentCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [certificates, eligibleCourses] = await Promise.all([
    listCertificatesForStudent(user.id),
    listCertificateEligibleCourses(user.id),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>

      {eligibleCourses.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Ready to claim</h2>
          {eligibleCourses.map((course) => (
            <Card key={course.id}>
              <CardContent className="flex items-center justify-between pt-4">
                <span>{course.title}</span>
                <GenerateCertificateButton courseId={course.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {certificates.length === 0 && eligibleCourses.length === 0 && (
        <p className="text-muted-foreground">
          Complete a course to earn your first certificate.
        </p>
      )}

      {certificates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Issued certificates</h2>
          {certificates.map((certificate) => (
            <Card key={certificate.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{certificate.courseTitle}</CardTitle>
                <span className="text-sm text-muted-foreground">
                  Issued {certificate.issuedAt.toLocaleDateString()}
                </span>
              </CardHeader>
              <CardContent>
                <Button size="sm" variant="outline" render={<Link href={`/student/certificates/${certificate.id}`} />}>
                  View certificate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
