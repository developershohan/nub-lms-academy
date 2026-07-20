import Link from "next/link";

const exploreLinks = [
  { href: "/courses", label: "All courses" },
  { href: "/categories", label: "Categories" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About us" },
];

const accountLinks = [
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Create account" },
  { href: "/teacher/apply", label: "Become a teacher" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-sidebar">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="font-heading text-lg font-semibold">NUB Academy</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            An open course catalogue built by students at Northern University
            Bangladesh — video lessons, quizzes, and verifiable certificates.
          </p>
        </div>
        <nav aria-label="Explore">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Explore</p>
          <ul className="mt-3 space-y-2 text-sm">
            {exploreLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-foreground/80 transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Account</p>
          <ul className="mt-3 space-y-2 text-sm">
            {accountLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-foreground/80 transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          © {new Date().getFullYear()} NUB Academy · Dhaka, Bangladesh
        </p>
      </div>
    </footer>
  );
}
