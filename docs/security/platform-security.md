# Platform security headers

`next.config.ts` previously contained only placeholder configuration (`/* config options here */`).
This documents the headers now configured there and the reasoning behind each choice.

## What's configured

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | XSS/injection mitigation |
| `X-Content-Type-Options` | `nosniff` | stops browsers from MIME-sniffing responses into an executable type |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | avoids leaking full URLs (which can contain tokens in query strings) to third-party origins |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | this app uses none of these - denies them outright rather than leaving the default (often permissive) policy |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (production only) | forces HTTPS on repeat visits; skipped in development so `http://localhost` keeps working |
| `poweredByHeader: false` | - | removes the `X-Powered-By: Next.js` header (avoids trivially fingerprinting the framework/version) |
| `productionBrowserSourceMaps: false` | - | (already Next's default) explicitly set so production builds never ship source maps that would make it easier to reconstruct application source from the client bundle |

## Content-Security-Policy: the nonce decision

Next.js documents two approaches (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):

1. **Nonce-based**, generated per-request via `proxy.ts`. Stricter (no `'unsafe-inline'` needed),
   but the docs are explicit: *"all pages must be dynamically rendered"* for nonces to work -
   static optimization and Partial Prerendering are disabled app-wide. This app currently has 39
   page routes, the large majority already dynamic by necessity (session-dependent), but adopting
   nonces would still be a deliberate architecture change with a real performance cost, not a
   header tweak.
2. **Static, non-nonce policy** set directly in `next.config.ts`'s `headers()` - the path taken
   here. Requires `'unsafe-inline'` for `script-src`/`style-src`.

Per this task's explicit instruction ("if nonce-based CSP requires a larger architectural change,
document it and use a carefully tested interim policy rather than pretending it is complete"),
**option 2 was implemented as the current, real policy** - not a placeholder - with the nonce
approach recorded here as a deliberate future upgrade, not a gap that was overlooked.

## The policy, and why each directive is what it is

```
default-src 'self';
script-src 'self' 'unsafe-inline' [+ 'unsafe-eval' in development only];
style-src 'self' 'unsafe-inline';
img-src 'self' https: data: blob:;
font-src 'self' data:;
frame-src 'self' https://www.youtube.com https://player.vimeo.com;
connect-src 'self' <NEXT_PUBLIC_SOCKET_URL>;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

- **`img-src ... https:`** (not a fixed domain list): OAuth avatar images come from Google/GitHub
  CDNs with no fixed, enumerable set of hostnames. There is no `next/image` usage anywhere in this
  codebase (confirmed by search), so there's no `images.remotePatterns` config needed either -
  avatars render via a plain `<img>` (`src/components/ui/avatar.tsx`).
- **`frame-src` allows exactly two hosts**: `src/lib/video-embed.ts` only ever produces embed URLs
  for `youtube.com`/`youtu.be` and `vimeo.com` (confirmed by reading the function - it has no
  generic "any host" fallback that renders an iframe; unrecognized hosts fall back to
  `{ kind: "direct" }`, a plain `<video>` tag, not an iframe).
- **`connect-src` includes the socket server's own origin**: the browser makes polling
  fetch/XHR calls directly to `NEXT_PUBLIC_SOCKET_URL` (a different origin in production - see
  `docs/socket-production-deployment.md`); without this the browser blocks the realtime connection
  entirely, not just extra scripts.
- **No `connect-src` entry for Stripe**: confirmed by search - there is no client-side
  `@stripe/stripe-js`/`Elements` usage in this codebase. Checkout is a full-page redirect to
  Stripe's own hosted page (`window.location.href = checkoutUrl`), which CSP's `connect-src`
  doesn't govern (that's a top-level navigation, not a fetch/XHR).
- **`frame-ancestors 'none'`**: this app is never meant to be embedded in someone else's page
  (clickjacking protection); nothing in the codebase requires being frameable.
- **`form-action 'self'`**: all forms (login, register, checkout initiation, etc.) submit to this
  app's own origin or via Server Actions - Stripe/OAuth are redirects the app *initiates*
  server-side, not a `<form action="https://...">` pointed at a third party.

## Honesty about verification

This policy was derived from a careful, evidence-based read of every script/style/image/iframe/
fetch source actually used in the codebase - it was **not** live-tested against a running browser
in this pass (no interactive browser session was available). Before relying on it in production:

1. Deploy with `Content-Security-Policy-Report-Only` first (same value, different header name) and
   watch the browser console / a report-uri endpoint for violations across a real user session
   (login, OAuth sign-in, course video playback, chat, checkout redirect, admin dashboards).
2. Only switch to the enforcing `Content-Security-Policy` header once a full manual pass through
   `docs/refactor/qc-report.md`'s route list shows zero violations.

## Follow-up not done this pass

- Nonce-based CSP (removes `'unsafe-inline'`) - real option, deferred because of the
  dynamic-rendering-everywhere cost described above. Worth reconsidering if/when more of the app's
  currently-static-eligible routes need to become dynamic anyway for other reasons.
- `Subresource Integrity` (SRI, experimental in this Next.js version) as a lower-cost alternative
  to nonces that preserves static generation - not enabled, since it's explicitly marked
  experimental and this pass prioritized a stable, always-on policy over an experimental one.
