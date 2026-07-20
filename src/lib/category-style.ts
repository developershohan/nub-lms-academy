/**
 * Category spine system (docs/DESIGN.md §2.2).
 * Every category gets a stable hue + two-letter mono "classification code",
 * rendered as a colored spine bar and sticker on cards and tiles.
 * Known slugs get curated colors; anything else falls back deterministically
 * by hash so new categories are stable without a code change.
 */

export type CategoryStyle = {
  /** Two-letter classification code, e.g. "WD" */
  code: string;
  /** Solid spine bar / sticker background */
  bar: string;
  /** Sticker text color (on bar) */
  onBar: string;
  /** Soft tint background for tiles */
  tint: string;
  /** Text color on the soft tint */
  onTint: string;
};

type Hue = Omit<CategoryStyle, "code">;

// Class strings must be static so Tailwind can see them.
const HUES: Hue[] = [
  { bar: "bg-emerald-600", onBar: "text-white", tint: "bg-emerald-600/10", onTint: "text-emerald-700 dark:text-emerald-400" },
  { bar: "bg-sky-600", onBar: "text-white", tint: "bg-sky-600/10", onTint: "text-sky-700 dark:text-sky-400" },
  { bar: "bg-fuchsia-600", onBar: "text-white", tint: "bg-fuchsia-600/10", onTint: "text-fuchsia-700 dark:text-fuchsia-400" },
  { bar: "bg-amber-500", onBar: "text-amber-950", tint: "bg-amber-500/15", onTint: "text-amber-700 dark:text-amber-400" },
  { bar: "bg-violet-600", onBar: "text-white", tint: "bg-violet-600/10", onTint: "text-violet-700 dark:text-violet-400" },
  { bar: "bg-rose-600", onBar: "text-white", tint: "bg-rose-600/10", onTint: "text-rose-700 dark:text-rose-400" },
  { bar: "bg-teal-600", onBar: "text-white", tint: "bg-teal-600/10", onTint: "text-teal-700 dark:text-teal-400" },
  { bar: "bg-indigo-600", onBar: "text-white", tint: "bg-indigo-600/10", onTint: "text-indigo-700 dark:text-indigo-400" },
];

const CURATED: Record<string, { code: string; hue: number }> = {
  "web-development": { code: "WD", hue: 0 },
  "data-science": { code: "DS", hue: 1 },
  "ui-ux-design": { code: "UX", hue: 2 },
  business: { code: "BZ", hue: 3 },
  "mobile-development": { code: "MD", hue: 4 },
  cybersecurity: { code: "CS", hue: 5 },
};

function hashSlug(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function deriveCode(name: string) {
  const words = name.split(/[\s/&-]+/).filter(Boolean);
  const code =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`
      : name.slice(0, 2);
  return code.toUpperCase();
}

export function categoryStyle(category: { slug: string; name: string }): CategoryStyle {
  const curated = CURATED[category.slug];
  const hue = HUES[curated ? curated.hue : hashSlug(category.slug) % HUES.length];
  return { code: curated?.code ?? deriveCode(category.name), ...hue };
}
