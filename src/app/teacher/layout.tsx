import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
