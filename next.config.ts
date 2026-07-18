import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The socket server is a separate origin in production (Vercel + Render) - the browser's fetch/
// XHR calls to it (polling transport, see src/hooks/use-socket.ts) need an explicit connect-src
// allowance, or CSP blocks the realtime connection entirely.
const socketOrigin = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

// No nonce-based CSP here deliberately: this app has no proxy-level nonce plumbing today, and
// adopting one would force every page into dynamic rendering (see the Next.js CSP guide under
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md - "all pages must be
// dynamically rendered" for nonces to work), losing static optimization app-wide. This is the
// documented, officially-supported non-nonce fallback instead - 'unsafe-inline' on script/style
// is a real, acknowledged tradeoff of that choice, not an oversight. See docs/security/platform-security.md.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // https: covers OAuth provider avatar images (Google/GitHub, no fixed domain list) - no
  // next/image usage in this codebase today, so no images.remotePatterns config is needed.
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  // Course video embeds (src/lib/video-embed.ts) render as iframes from these two hosts only.
  "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
  `connect-src 'self' ${socketOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Stripe Checkout/OAuth are full-page redirects, not iframes - no origin needs to frame us.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS only makes sense once actually served over HTTPS (production) - forcing it in
          // local dev would break plain http://localhost.
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
