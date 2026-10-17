/** Total course length for summaries: "4h 35m", "48m", "under 1m". */
export function formatTotalDuration(totalSec: number) {
  const minutes = Math.round(totalSec / 60);
  if (minutes < 1) return "under 1m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** One lesson's length in a curriculum row: "8:00", "1:02:05". */
export function formatLessonDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Whole hours of content for "12 hours on-demand", rounded to the nearest half hour above 1h. */
export function formatHoursOfContent(totalSec: number) {
  const hours = totalSec / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(totalSec / 60))} minutes`;
  const rounded = Math.round(hours * 2) / 2;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

export function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPrice(value: number) {
  return value === 0 ? "Free" : `$${value.toFixed(2)}`;
}

/** "3 days ago", "2 months ago" - for review dates, where the exact day doesn't matter. */
export function formatRelativeDate(date: Date, now = new Date()) {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
