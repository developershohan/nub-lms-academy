import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAdminAccess } from "@/lib/permissions";
import { renderCertificatePdf } from "@/lib/certificate-pdf";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ certificateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { certificateId } = await params;
  const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = certificate.userId === session.user.id;
  const isAdmin = await canAdminAccess(session.user.id);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A revoked certificate is no longer a valid credential - only admins may still pull a copy for review.
  if (certificate.revoked && !isAdmin) {
    return NextResponse.json({ error: "This certificate has been revoked" }, { status: 403 });
  }

  const pdfBytes = await renderCertificatePdf(certificate);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificate-${certificate.certificateNumber}.pdf"`,
    },
  });
}
