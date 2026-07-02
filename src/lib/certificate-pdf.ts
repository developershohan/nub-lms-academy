import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateData = {
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  teacherName: string;
  completedAt: Date;
};

function centerText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.1, 0.1, 0.15)
) {
  const width = page.getSize().width;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
}

export async function renderCertificatePdf(certificate: CertificateData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([792, 612]); // US Letter, landscape
  const { width, height } = page.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const appName = process.env.APP_NAME || "LMS Platform";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const verifyUrl = `${baseUrl}/certificates/verify/${certificate.certificateNumber}`;
  const muted = rgb(0.4, 0.4, 0.45);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: rgb(0.15, 0.15, 0.2),
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: rgb(0.75, 0.75, 0.8),
    borderWidth: 1,
  });

  centerText(page, appName.toUpperCase(), height - 90, helveticaBold, 16, muted);
  centerText(page, "Certificate of Completion", height - 145, helveticaBold, 30);
  centerText(page, "This certifies that", height - 195, helvetica, 14, muted);
  centerText(page, certificate.studentName, height - 235, helveticaBold, 26);
  centerText(page, "has successfully completed the course", height - 270, helvetica, 14, muted);
  centerText(page, certificate.courseTitle, height - 305, helveticaBold, 20);

  const completedDate = certificate.completedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  centerText(page, `Completed on ${completedDate}`, height - 340, helvetica, 12, muted);

  // Signature lines
  const signerName = process.env.CERTIFICATE_SIGNER_NAME || "Platform Admin";
  const signerTitle = process.env.CERTIFICATE_SIGNER_TITLE || "Course Director";

  page.drawLine({ start: { x: 140, y: 120 }, end: { x: 340, y: 120 }, thickness: 1, color: rgb(0.6, 0.6, 0.65) });
  page.drawText(certificate.teacherName, { x: 150, y: 128, size: 12, font: helveticaBold });
  page.drawText("Instructor", { x: 150, y: 106, size: 9, font: helvetica, color: muted });

  page.drawLine({
    start: { x: width - 340, y: 120 },
    end: { x: width - 140, y: 120 },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.65),
  });
  page.drawText(signerName, { x: width - 330, y: 128, size: 12, font: helveticaBold });
  page.drawText(signerTitle, { x: width - 330, y: 106, size: 9, font: helvetica, color: muted });

  // Footer: certificate number + verification URL
  page.drawText(`Certificate No. ${certificate.certificateNumber}`, {
    x: 44,
    y: 44,
    size: 9,
    font: helvetica,
    color: muted,
  });
  const urlWidth = helvetica.widthOfTextAtSize(verifyUrl, 9);
  page.drawText(verifyUrl, { x: width - 44 - urlWidth, y: 44, size: 9, font: helvetica, color: muted });

  // QR code linking to the public verification page - a nice-to-have, never block the PDF on it.
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 });
    const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    page.drawImage(qrImage, { x: width / 2 - 35, y: 55, width: 70, height: 70 });
  } catch {
    // Skip silently - the certificate is still valid and verifiable via the printed URL.
  }

  return pdfDoc.save();
}
