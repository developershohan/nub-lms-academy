"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { updateCourseLandingAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/actions";
import { useActionSuccess } from "@/hooks/use-action-success";
import { PUBLISH_RULES } from "@/lib/studio";
import { courseLevels } from "@/lib/validations/course";
import { CourseCard } from "@/components/course/course-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VideoUrlField } from "@/components/teacher/studio/video-url-field";

const initialState: ActionState = {};

const LEVEL_LABELS: Record<(typeof courseLevels)[number], string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

type Landing = {
  title: string;
  subtitle: string | null;
  description: string | null;
  categoryId: string | null;
  level: (typeof courseLevels)[number];
  language: string;
  thumbnailUrl: string | null;
  promoVideoUrl: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save landing page"}
    </Button>
  );
}

/** Counts characters against a limit, or towards a minimum the checklist asks for. */
function Counter({ id, length, max, min }: { id: string; length: number; max?: number; min?: number }) {
  const metMin = min !== undefined && length >= min;
  return (
    <p id={id} className={cn("flex items-center gap-1 text-xs text-muted-foreground", max && length > max && "text-destructive")}>
      {metMin && <Check className="size-3 text-primary" aria-hidden />}
      {min !== undefined && !metMin ? `${length} / ${min} characters minimum` : max ? `${length} / ${max}` : `${length} characters`}
    </p>
  );
}

export function LandingForm({
  courseId,
  course,
  categories,
  teacherName,
  pricing,
}: {
  courseId: string;
  course: Landing;
  categories: { id: string; name: string; slug: string }[];
  teacherName: string | null;
  /** Shown on the preview card only - prices are edited on the Pricing page. */
  pricing: { price: number; salePrice: number | null };
}) {
  const [state, formAction] = useActionState(updateCourseLandingAction.bind(null, courseId), initialState);
  const [fields, setFields] = useState({
    title: course.title,
    subtitle: course.subtitle ?? "",
    description: course.description ?? "",
    categoryId: course.categoryId ?? "",
    level: course.level,
    language: course.language,
    thumbnailUrl: course.thumbnailUrl ?? "",
  });
  const set = (name: keyof typeof fields) => (value: string) => setFields((f) => ({ ...f, [name]: value }));
  const category = categories.find((c) => c.id === fields.categoryId) ?? null;

  useActionSuccess(state, initialState, () => toast.success("Landing page saved"));

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">Course title</Label>
          <Input
            id="title"
            name="title"
            value={fields.title}
            onChange={(e) => set("title")(e.target.value)}
            maxLength={120}
            required
            aria-describedby="title-count"
          />
          <Counter id="title-count" length={fields.title.length} max={120} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input
            id="subtitle"
            name="subtitle"
            value={fields.subtitle}
            onChange={(e) => set("subtitle")(e.target.value)}
            maxLength={160}
            placeholder="Build and deploy full-stack apps with React and Next.js"
            aria-describedby="subtitle-count"
          />
          <Counter id="subtitle-count" length={fields.subtitle.length} max={160} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            value={fields.description}
            onChange={(e) => set("description")(e.target.value)}
            rows={8}
            placeholder="What the course covers, how it is taught, and what students will build along the way."
            aria-describedby="description-count"
          />
          <Counter id="description-count" length={fields.description.trim().length} min={PUBLISH_RULES.minDescriptionChars} />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              name="categoryId"
              value={fields.categoryId || null}
              onValueChange={(v) => set("categoryId")((v as string | null) ?? "")}
              items={Object.fromEntries(categories.map((c) => [c.id, c.name]))}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Level</Label>
            <Select
              name="level"
              value={fields.level}
              onValueChange={(v) => set("level")(v as string)}
              items={LEVEL_LABELS}
            >
              <SelectTrigger className="w-full" aria-label="Level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {courseLevels.map((level) => (
                  <SelectItem key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              name="language"
              value={fields.language}
              onChange={(e) => set("language")(e.target.value)}
              maxLength={40}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="thumbnailUrl">Course image</Label>
          <Input
            id="thumbnailUrl"
            name="thumbnailUrl"
            type="url"
            inputMode="url"
            value={fields.thumbnailUrl}
            onChange={(e) => set("thumbnailUrl")(e.target.value)}
            placeholder="https://..."
            aria-describedby="thumbnail-help"
          />
          <p id="thumbnail-help" className="text-xs text-muted-foreground">
            A link to a 16:9 image, at least 1280×720. Without one, the card uses the category colour and the title.
          </p>
        </div>

        <VideoUrlField
          id="promoVideoUrl"
          name="promoVideoUrl"
          label="Promo video (optional)"
          defaultValue={course.promoVideoUrl ?? ""}
          youtubeOnly
        />

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <SaveButton />
      </div>

      <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start" aria-label="Catalogue preview">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Catalogue preview</p>
        {/* inert: a preview, not a link to the (possibly unpublished) course page. */}
        <div inert className="max-w-xs">
          <CourseCard
            course={{
              slug: "",
              title: fields.title || "Untitled course",
              subtitle: fields.subtitle || null,
              thumbnailUrl: /^https?:\/\//i.test(fields.thumbnailUrl) ? fields.thumbnailUrl : null,
              price: pricing.price,
              salePrice: pricing.salePrice,
              level: fields.level,
              category: category ? { name: category.name, slug: category.slug } : null,
              teacher: { name: teacherName },
            }}
          />
        </div>
      </aside>
    </form>
  );
}
