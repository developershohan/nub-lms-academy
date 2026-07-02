import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-32 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Learn new skills with NUB Academy
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Courses from real instructors, quizzes, progress tracking, and certificates
        when you finish.
      </p>
      <div className="flex gap-4">
        <Button render={<Link href="/courses" />} size="lg">
          Browse courses
        </Button>
        <Button render={<Link href="/register" />} variant="outline" size="lg">
          Start learning
        </Button>
      </div>
    </div>
  );
}
