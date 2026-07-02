import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessLesson } from "@/lib/permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const video = await prisma.videoAsset.findUnique({
    where: { id: videoId },
    select: { playbackUrl: true, lessonId: true },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  const allowed = await canAccessLesson(session?.user?.id ?? null, video.lessonId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ playbackUrl: video.playbackUrl });
}
