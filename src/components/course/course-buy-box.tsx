import { Award, Clock, FileText, Infinity as InfinityIcon, ListChecks, MonitorSmartphone, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryStyle } from "@/lib/category-style";
import { formatHoursOfContent, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CoursePromo } from "@/components/course/course-promo";

export type CoursePricing = { price: number; salePrice: number | null; effectivePrice: number };

/** `compact` = one line for the phone price bar: no discount badge, smaller figures. */
export function PriceTag({ pricing, compact = false }: { pricing: CoursePricing; compact?: boolean }) {
  const discount =
    pricing.salePrice != null && pricing.price > 0 ? Math.round((1 - pricing.salePrice / pricing.price) * 100) : 0;
  const onSale = pricing.salePrice != null && pricing.price > pricing.salePrice;
  return (
    <div className={cn("flex items-baseline gap-x-2 gap-y-1", compact ? "flex-nowrap" : "flex-wrap")}>
      <span className={cn("font-heading font-semibold", compact ? "text-xl" : "text-3xl")}>
        {formatPrice(pricing.effectivePrice)}
      </span>
      {onSale && <span className="text-sm text-muted-foreground line-through">{formatPrice(pricing.price)}</span>}
      {onSale && !compact && discount > 0 && <Badge className="bg-amber text-amber-foreground">{discount}% off</Badge>}
    </div>
  );
}

/** The purchase panel: cover, price, the caller's call-to-action, and what the course includes. */
export function CourseBuyBox({
  title,
  thumbnailUrl,
  promoVideoUrl = null,
  category,
  pricing,
  stats,
  isSubscriptionIncluded,
  children,
}: {
  title: string;
  thumbnailUrl: string | null;
  /** When set, the cover plays this video ("Preview this course"). */
  promoVideoUrl?: string | null;
  category: { name: string; slug: string } | null;
  pricing: CoursePricing;
  stats: { videoCount: number; articleCount: number; quizCount: number; totalDurationSec: number };
  isSubscriptionIncluded: boolean;
  children: React.ReactNode;
}) {
  const spine = category ? categoryStyle(category) : null;
  const includes = [
    stats.totalDurationSec > 0 && { icon: Clock, text: `${formatHoursOfContent(stats.totalDurationSec)} of content` },
    stats.videoCount > 0 && { icon: PlayCircle, text: `${stats.videoCount} video ${stats.videoCount === 1 ? "lesson" : "lessons"}` },
    stats.articleCount > 0 && { icon: FileText, text: `${stats.articleCount} ${stats.articleCount === 1 ? "article" : "articles"}` },
    stats.quizCount > 0 && { icon: ListChecks, text: `${stats.quizCount} ${stats.quizCount === 1 ? "quiz" : "quizzes"}` },
    { icon: InfinityIcon, text: "Full lifetime access" },
    { icon: MonitorSmartphone, text: "Learn on phone, tablet or computer" },
    { icon: Award, text: "Certificate of completion" },
  ].filter(Boolean) as { icon: typeof Clock; text: string }[];

  const cover = (
    <div className={cn("aspect-video w-full", spine?.tint ?? "bg-muted")}>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt={promoVideoUrl ? "" : `${title} cover`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-end p-4">
          <span className={cn("font-heading text-xl font-semibold leading-tight opacity-80", spine?.onTint)}>{title}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm lg:shadow-lg">
      {promoVideoUrl ? (
        <CoursePromo title={title} url={promoVideoUrl}>
          {cover}
        </CoursePromo>
      ) : (
        cover
      )}
      <div className="space-y-4 p-5">
        <PriceTag pricing={pricing} />
        {isSubscriptionIncluded && (
          <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">Included in the all-access subscription</p>
        )}
        <div className="space-y-2">{children}</div>
        <div className="space-y-2 pt-1">
          <p className="text-sm font-semibold">This course includes</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {includes.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
