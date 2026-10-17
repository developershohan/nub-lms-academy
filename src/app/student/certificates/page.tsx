import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listCertificatesForStudent, listCertificateEligibleCourses } from "@/server/services/certificate-service";
import { listStudentEnrollments } from "@/server/services/enrollment-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GenerateCertificateButton } from "@/components/student/generate-certificate-button";

export default async function StudentCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [certificates, eligibleCourses] = await Promise.all([
    listCertificatesForStudent(user.id),
    listCertificateEligibleCourses(user.id),
  ]);
  // Only needed to pick the empty state's next step: keep going, or find a first course.
  const isEmpty = certificates.length === 0 && eligibleCourses.length === 0;
  const hasEnrollments = isEmpty && (await listStudentEnrollments(user.id)).length > 0;

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

      {isEmpty && (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Finish all the lessons and quizzes in a course to claim a certificate, with a verification link you can share with employers."
        >
          {hasEnrollments ? (
            <Button size="lg" render={<Link href="/student/my-courses" />}>
              Continue learning
            </Button>
          ) : (
            <Button size="lg" render={<Link href="/courses" />}>
              Browse courses
            </Button>
          )}
        </EmptyState>
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
